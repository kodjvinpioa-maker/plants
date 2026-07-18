// routes/produits.js
// CRUD produits. Création / modification / désactivation réservées à l'admin.
// La quantité en stock n'est jamais stockée directement : elle est calculée
// à partir de la somme des mouvements de stock (entree + vente - sortie).

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireLogin, requireAdmin } = require('../middleware/auth');

// Calcule le stock actuel d'un produit à partir des mouvements
// stock = somme(entree) - somme(sortie) - somme(vente)
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
  ), 0) AS stock_actuel
`;

// GET /produits : liste des produits (avec recherche par nom ou référence)
router.get('/produits', requireLogin, (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = `SELECT p.*, ${STOCK_SQL} FROM produits p`;
  const params = [];

  if (q) {
    sql += ' WHERE p.nom LIKE ? OR p.reference LIKE ?';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY p.actif DESC, p.nom ASC';

  db.all(sql, params, (err, produits) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur serveur');
    }
    res.render('produits/liste', {
      produits,
      q,
      csrfToken: req.csrfToken(),
    });
  });
});

// GET /produits/nouveau : formulaire d'ajout (admin seulement)
router.get('/produits/nouveau', requireAdmin, (req, res) => {
  res.render('produits/form', {
    produit: null,
    error: null,
    csrfToken: req.csrfToken(),
  });
});

// POST /produits/nouveau : création d'un produit (admin seulement)
router.post('/produits/nouveau', requireAdmin, (req, res) => {
  const { reference, nom, seuil_alerte, prix_vente, prix_achat } = req.body;

  if (!reference || !nom) {
    return res.render('produits/form', {
      produit: req.body,
      error: 'La référence et le nom sont obligatoires.',
      csrfToken: req.csrfToken(),
    });
  }

  db.run(
    `INSERT INTO produits (reference, nom, seuil_alerte, prix_vente, prix_achat, actif)
     VALUES (?, ?, ?, ?, ?, 1)`,
    [
      reference.trim(),
      nom.trim(),
      parseInt(seuil_alerte, 10) || 0,
      parseFloat(prix_vente) || null,
      parseFloat(prix_achat) || null,
    ],
    (err) => {
      if (err) {
        console.error(err);
        const msg = err.message.includes('UNIQUE')
          ? 'Cette référence existe déjà.'
          : 'Erreur lors de la création du produit.';
        return res.render('produits/form', {
          produit: req.body,
          error: msg,
          csrfToken: req.csrfToken(),
        });
      }
      res.redirect('/produits?success=creation');
    }
  );
});

// GET /produits/:id/modifier : formulaire de modification (admin seulement)
router.get('/produits/:id/modifier', requireAdmin, (req, res) => {
  db.get('SELECT * FROM produits WHERE id = ?', [req.params.id], (err, produit) => {
    if (err || !produit) {
      return res.status(404).send('Produit introuvable');
    }
    res.render('produits/form', {
      produit,
      error: null,
      csrfToken: req.csrfToken(),
    });
  });
});

// POST /produits/:id/modifier : mise à jour (admin seulement). La quantité n'est jamais modifiée ici.
router.post('/produits/:id/modifier', requireAdmin, (req, res) => {
  const { reference, nom, seuil_alerte, prix_vente, prix_achat } = req.body;
  const { id } = req.params;

  if (!reference || !nom) {
    return res.render('produits/form', {
      produit: { ...req.body, id },
      error: 'La référence et le nom sont obligatoires.',
      csrfToken: req.csrfToken(),
    });
  }

  db.run(
    `UPDATE produits SET reference = ?, nom = ?, seuil_alerte = ?, prix_vente = ?, prix_achat = ?
     WHERE id = ?`,
    [
      reference.trim(),
      nom.trim(),
      parseInt(seuil_alerte, 10) || 0,
      parseFloat(prix_vente) || null,
      parseFloat(prix_achat) || null,
      id,
    ],
    (err) => {
      if (err) {
        console.error(err);
        const msg = err.message.includes('UNIQUE')
          ? 'Cette référence existe déjà.'
          : 'Erreur lors de la modification du produit.';
        return res.render('produits/form', {
          produit: { ...req.body, id },
          error: msg,
          csrfToken: req.csrfToken(),
        });
      }
      res.redirect('/produits?success=modification');
    }
  );
});

// POST /produits/:id/toggle : archive ou réactive un produit (admin seulement)
router.post('/produits/:id/toggle', requireAdmin, (req, res) => {
  db.get('SELECT actif FROM produits WHERE id = ?', [req.params.id], (err, produit) => {
    if (err || !produit) {
      return res.status(404).send('Produit introuvable');
    }
    const nouvelEtat = produit.actif ? 0 : 1;
    db.run('UPDATE produits SET actif = ? WHERE id = ?', [nouvelEtat, req.params.id], (updErr) => {
      if (updErr) {
        console.error(updErr);
        return res.status(500).send('Erreur serveur');
      }
      res.redirect('/produits?success=statut');
    });
  });
});

// GET /api/produits : recherche JSON pour l'autocomplétion (produits actifs uniquement)
router.get('/api/produits', requireLogin, (req, res) => {
  const q = (req.query.q || '').trim();
  let sql = `SELECT p.id, p.reference, p.nom, p.prix_vente, ${STOCK_SQL} FROM produits p WHERE p.actif = 1`;
  const params = [];

  if (q) {
    sql += ' AND (p.nom LIKE ? OR p.reference LIKE ?)';
    params.push(`%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY p.nom ASC LIMIT 20';

  db.all(sql, params, (err, rows) => {
    if (err) {
      console.error(err);
      return res.status(500).json([]);
    }
    res.json(rows);
  });
});

module.exports = router;
