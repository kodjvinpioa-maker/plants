// routes/stock.js
// Mouvements de stock : entrée manuelle, sortie manuelle, vente.
// La vente crée automatiquement un mouvement de caisse lié.
// L'annulation de vente (admin) supprime le mouvement caisse lié puis le mouvement stock.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

const STOCK_SQL = `
  COALESCE((
    SELECT SUM(
      CASE
        WHEN ms.type = 'entree' THEN ms.quantite
        WHEN ms.type IN ('sortie','vente') THEN -ms.quantite
        ELSE 0
      END
    )
    FROM mouvements_stock ms WHERE ms.produit_id = p.id
  ), 0)
`;

// Récupère le stock actuel d'un produit donné
function getStockActuel(produitId, cb) {
  db.get(
    `SELECT ${STOCK_SQL} AS stock FROM produits p WHERE p.id = ?`,
    [produitId],
    (err, row) => {
      if (err) return cb(err);
      cb(null, row ? row.stock : 0);
    }
  );
}

// ---------------------------------------------------------------------------
// NOUVELLE VENTE (accessible à tous les utilisateurs connectés)
// ---------------------------------------------------------------------------
router.get('/ventes/nouvelle', requireLogin, (req, res) => {
  db.all(
    `SELECT p.*, ${STOCK_SQL} AS stock_actuel FROM produits p WHERE p.actif = 1 ORDER BY p.nom ASC`,
    [],
    (err, produits) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Erreur serveur');
      }
      res.render('mouvements/vente', {
        produits,
        error: null,
        csrfToken: req.csrfToken(),
        now: new Date().toISOString().slice(0, 16),
      });
    }
  );
});

router.post('/ventes/nouvelle', requireLogin, (req, res) => {
  const { produit_id, quantite, prix_vente_effectif, date_mouvement, commentaire } = req.body;
  const qte = parseFloat(quantite);
  const prix = parseFloat(prix_vente_effectif);
  const userId = req.session.user.id;

  if (!produit_id || !qte || qte <= 0) {
    return renderVenteError(req, res, 'Veuillez sélectionner un produit et une quantité valide.');
  }

  getStockActuel(produit_id, (err, stockActuel) => {
    if (err) {
      console.error(err);
      return renderVenteError(req, res, 'Erreur serveur lors de la vérification du stock.');
    }
    if (stockActuel < qte) {
      return renderVenteError(
        req,
        res,
        `Stock insuffisant. Stock disponible : ${stockActuel}.`
      );
    }

    db.get('SELECT nom FROM produits WHERE id = ?', [produit_id], (prodErr, produit) => {
      if (prodErr || !produit) {
        return renderVenteError(req, res, 'Produit introuvable.');
      }

      const dateMvt = date_mouvement ? new Date(date_mouvement).toISOString() : new Date().toISOString();

      db.run(
        `INSERT INTO mouvements_stock (type, produit_id, quantite, prix_vente_effectif, date_mouvement, user_id, commentaire)
         VALUES ('vente', ?, ?, ?, ?, ?, ?)`,
        [produit_id, qte, prix || 0, dateMvt, userId, commentaire || null],
        function (insertErr) {
          if (insertErr) {
            console.error(insertErr);
            return renderVenteError(req, res, "Erreur lors de l'enregistrement de la vente.");
          }
          const venteId = this.lastID;
          const montant = (prix || 0) * qte;

          db.run(
            `INSERT INTO mouvements_caisse (type, montant, motif, est_lie_vente, vente_id, date_mouvement, user_id, commentaire)
             VALUES ('entree', ?, ?, 1, ?, ?, ?, ?)`,
            [montant, `Vente de ${produit.nom}`, venteId, dateMvt, userId, commentaire || null],
            (caisseErr) => {
              if (caisseErr) {
                console.error(caisseErr);
              }
              res.redirect('/ventes/nouvelle?success=vente');
            }
          );
        }
      );
    });
  });

  function renderVenteError(req, res, message) {
    db.all(
      `SELECT p.*, ${STOCK_SQL} AS stock_actuel FROM produits p WHERE p.actif = 1 ORDER BY p.nom ASC`,
      [],
      (err2, produits) => {
        res.render('mouvements/vente', {
          produits: produits || [],
          error: message,
          csrfToken: req.csrfToken(),
          now: new Date().toISOString().slice(0, 16),
        });
      }
    );
  }
});

// ---------------------------------------------------------------------------
// ENTRÉE MANUELLE DE STOCK
// ---------------------------------------------------------------------------
router.get('/stock/entree', requireLogin, (req, res) => {
  db.all('SELECT * FROM produits WHERE actif = 1 ORDER BY nom ASC', [], (err, produits) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur serveur');
    }
    res.render('mouvements/entree', {
      produits,
      error: null,
      csrfToken: req.csrfToken(),
      now: new Date().toISOString().slice(0, 16),
    });
  });
});

router.post('/stock/entree', requireLogin, (req, res) => {
  const { produit_id, quantite, date_mouvement, commentaire } = req.body;
  const qte = parseFloat(quantite);
  const userId = req.session.user.id;

  if (!produit_id || !qte || qte <= 0) {
    return db.all('SELECT * FROM produits WHERE actif = 1 ORDER BY nom ASC', [], (err, produits) => {
      res.render('mouvements/entree', {
        produits: produits || [],
        error: 'Veuillez sélectionner un produit et une quantité valide.',
        csrfToken: req.csrfToken(),
        now: new Date().toISOString().slice(0, 16),
      });
    });
  }

  const dateMvt = date_mouvement ? new Date(date_mouvement).toISOString() : new Date().toISOString();

  db.run(
    `INSERT INTO mouvements_stock (type, produit_id, quantite, date_mouvement, user_id, commentaire)
     VALUES ('entree', ?, ?, ?, ?, ?)`,
    [produit_id, qte, dateMvt, userId, commentaire || null],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Erreur serveur');
      }
      res.redirect('/stock/entree?success=entree');
    }
  );
});

// ---------------------------------------------------------------------------
// SORTIE MANUELLE DE STOCK (perte, casse, prélèvement)
// ---------------------------------------------------------------------------
router.get('/stock/sortie', requireLogin, (req, res) => {
  db.all(
    `SELECT p.*, ${STOCK_SQL} AS stock_actuel FROM produits p WHERE p.actif = 1 ORDER BY p.nom ASC`,
    [],
    (err, produits) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Erreur serveur');
      }
      res.render('mouvements/sortie', {
        produits,
        error: null,
        csrfToken: req.csrfToken(),
        now: new Date().toISOString().slice(0, 16),
      });
    }
  );
});

router.post('/stock/sortie', requireLogin, (req, res) => {
  const { produit_id, quantite, date_mouvement, commentaire } = req.body;
  const qte = parseFloat(quantite);
  const userId = req.session.user.id;

  if (!produit_id || !qte || qte <= 0) {
    return renderSortieError('Veuillez sélectionner un produit et une quantité valide.');
  }

  getStockActuel(produit_id, (err, stockActuel) => {
    if (err) {
      console.error(err);
      return renderSortieError('Erreur serveur lors de la vérification du stock.');
    }
    if (stockActuel < qte) {
      return renderSortieError(`Stock insuffisant. Stock disponible : ${stockActuel}.`);
    }

    const dateMvt = date_mouvement ? new Date(date_mouvement).toISOString() : new Date().toISOString();

    db.run(
      `INSERT INTO mouvements_stock (type, produit_id, quantite, date_mouvement, user_id, commentaire)
       VALUES ('sortie', ?, ?, ?, ?, ?)`,
      [produit_id, qte, dateMvt, userId, commentaire || null],
      (insertErr) => {
        if (insertErr) {
          console.error(insertErr);
          return renderSortieError("Erreur lors de l'enregistrement de la sortie.");
        }
        res.redirect('/stock/sortie?success=sortie');
      }
    );
  });

  function renderSortieError(message) {
    db.all(
      `SELECT p.*, ${STOCK_SQL} AS stock_actuel FROM produits p WHERE p.actif = 1 ORDER BY p.nom ASC`,
      [],
      (err2, produits) => {
        res.render('mouvements/sortie', {
          produits: produits || [],
          error: message,
          csrfToken: req.csrfToken(),
          now: new Date().toISOString().slice(0, 16),
        });
      }
    );
  }
});

// ---------------------------------------------------------------------------
// HISTORIQUE DES MOUVEMENTS DE STOCK (filtrable + export CSV)
// ---------------------------------------------------------------------------
function buildHistoriqueQuery(query) {
  let sql = `
    SELECT ms.*, p.nom AS produit_nom, p.reference AS produit_reference, u.email AS user_email
    FROM mouvements_stock ms
    LEFT JOIN produits p ON p.id = ms.produit_id
    LEFT JOIN users u ON u.id = ms.user_id
    WHERE 1=1
  `;
  const params = [];

  if (query.produit_id) {
    sql += ' AND ms.produit_id = ?';
    params.push(query.produit_id);
  }
  if (query.type) {
    sql += ' AND ms.type = ?';
    params.push(query.type);
  }
  if (query.date_debut) {
    sql += ' AND date(ms.date_mouvement) >= date(?)';
    params.push(query.date_debut);
  }
  if (query.date_fin) {
    sql += ' AND date(ms.date_mouvement) <= date(?)';
    params.push(query.date_fin);
  }
  if (query.user_id) {
    sql += ' AND ms.user_id = ?';
    params.push(query.user_id);
  }
  sql += ' ORDER BY ms.date_mouvement DESC';
  return { sql, params };
}

router.get('/stock/historique', requireLogin, (req, res) => {
  const { sql, params } = buildHistoriqueQuery(req.query);

  db.all(sql, params, (err, mouvements) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur serveur');
    }
    db.all('SELECT id, nom FROM produits ORDER BY nom ASC', [], (prodErr, produits) => {
      db.all('SELECT id, email FROM users ORDER BY email ASC', [], (userErr, users) => {
        res.render('mouvements/historique', {
          mouvements,
          produits: produits || [],
          users: users || [],
          filters: req.query,
          csrfToken: req.csrfToken(),
        });
      });
    });
  });
});

router.get('/stock/historique/export.csv', requireLogin, (req, res) => {
  const { sql, params } = buildHistoriqueQuery(req.query);

  db.all(sql, params, (err, mouvements) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur serveur');
    }
    let csv = 'ID;Type;Produit;Reference;Quantite;Prix vente effectif;Date;Utilisateur;Commentaire\n';
    mouvements.forEach((m) => {
      csv += [
        m.id,
        m.type,
        m.produit_nom || '',
        m.produit_reference || '',
        m.quantite,
        m.prix_vente_effectif || '',
        m.date_mouvement,
        m.user_email || '',
        (m.commentaire || '').replace(/;/g, ','),
      ].join(';') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=historique_stock.csv');
    res.send('\uFEFF' + csv);
  });
});

// ---------------------------------------------------------------------------
// ANNULATION D'UNE VENTE (admin uniquement)
// ---------------------------------------------------------------------------
router.post('/stock/vente/:id/annuler', requireAdmin, (req, res) => {
  const venteId = req.params.id;

  db.get("SELECT * FROM mouvements_stock WHERE id = ? AND type = 'vente'", [venteId], (err, vente) => {
    if (err || !vente) {
      return res.status(404).send('Vente introuvable');
    }

    // 1. Supprimer le mouvement de caisse lié (recherche par vente_id)
    db.run('DELETE FROM mouvements_caisse WHERE vente_id = ?', [venteId], (caisseErr) => {
      if (caisseErr) {
        console.error(caisseErr);
        return res.status(500).send('Erreur lors de la suppression du mouvement de caisse.');
      }
      // 2. Supprimer le mouvement de stock (le stock est réajusté automatiquement au calcul)
      db.run('DELETE FROM mouvements_stock WHERE id = ?', [venteId], (stockErr) => {
        if (stockErr) {
          console.error(stockErr);
          return res.status(500).send('Erreur lors de la suppression du mouvement de stock.');
        }
        res.redirect('/stock/historique?success=annulation');
      });
    });
  });
});

module.exports = router;
