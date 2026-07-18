// routes/caisse.js
// Mouvements de petite caisse : entrée manuelle, sortie manuelle, historique.
// Les entrées liées à une vente (est_lie_vente = 1) ne peuvent pas être
// modifiées ou supprimées depuis cette interface — seule l'annulation de
// la vente correspondante (routes/stock.js) les supprime.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireLogin } = require('../middleware/auth');

// Calcule le solde actuel de la caisse : total entrées - total sorties
function getSoldeCaisse(cb) {
  db.get(
    `SELECT
       COALESCE(SUM(CASE WHEN type = 'entree' THEN montant ELSE 0 END), 0) AS total_entrees,
       COALESCE(SUM(CASE WHEN type = 'sortie' THEN montant ELSE 0 END), 0) AS total_sorties
     FROM mouvements_caisse`,
    [],
    (err, row) => {
      if (err) return cb(err);
      const solde = row.total_entrees - row.total_sorties;
      cb(null, solde, row.total_entrees, row.total_sorties);
    }
  );
}

// ---------------------------------------------------------------------------
// PAGE CAISSE : solde + boutons + derniers mouvements
// ---------------------------------------------------------------------------
router.get('/caisse', requireLogin, (req, res) => {
  getSoldeCaisse((err, solde, totalEntrees, totalSorties) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur serveur');
    }
    db.all(
      `SELECT mc.*, u.email AS user_email
       FROM mouvements_caisse mc
       LEFT JOIN users u ON u.id = mc.user_id
       ORDER BY mc.date_mouvement DESC LIMIT 10`,
      [],
      (mvtErr, derniersMouvements) => {
        if (mvtErr) {
          console.error(mvtErr);
          return res.status(500).send('Erreur serveur');
        }
        res.render('caisse/index', {
          solde,
          totalEntrees,
          totalSorties,
          derniersMouvements,
          csrfToken: req.csrfToken(),
        });
      }
    );
  });
});

// ---------------------------------------------------------------------------
// ENTRÉE MANUELLE DE CAISSE
// ---------------------------------------------------------------------------
router.get('/caisse/entree', requireLogin, (req, res) => {
  res.render('caisse/entree', {
    error: null,
    csrfToken: req.csrfToken(),
    now: new Date().toISOString().slice(0, 16),
  });
});

router.post('/caisse/entree', requireLogin, (req, res) => {
  const { motif, montant, date_mouvement, commentaire } = req.body;
  const mnt = parseFloat(montant);
  const userId = req.session.user.id;

  if (!motif || !mnt || mnt <= 0) {
    return res.render('caisse/entree', {
      error: 'Veuillez renseigner un motif et un montant valide.',
      csrfToken: req.csrfToken(),
      now: new Date().toISOString().slice(0, 16),
    });
  }

  const dateMvt = date_mouvement ? new Date(date_mouvement).toISOString() : new Date().toISOString();

  db.run(
    `INSERT INTO mouvements_caisse (type, montant, motif, est_lie_vente, date_mouvement, user_id, commentaire)
     VALUES ('entree', ?, ?, 0, ?, ?, ?)`,
    [mnt, motif.trim(), dateMvt, userId, commentaire || null],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Erreur serveur');
      }
      res.redirect('/caisse/entree?success=entree');
    }
  );
});

// ---------------------------------------------------------------------------
// SORTIE MANUELLE DE CAISSE
// ---------------------------------------------------------------------------
router.get('/caisse/sortie', requireLogin, (req, res) => {
  res.render('caisse/sortie', {
    error: null,
    csrfToken: req.csrfToken(),
    now: new Date().toISOString().slice(0, 16),
  });
});

router.post('/caisse/sortie', requireLogin, (req, res) => {
  const { motif, montant, date_mouvement, commentaire } = req.body;
  const mnt = parseFloat(montant);
  const userId = req.session.user.id;

  if (!motif || !mnt || mnt <= 0) {
    return res.render('caisse/sortie', {
      error: 'Veuillez renseigner un motif et un montant valide.',
      csrfToken: req.csrfToken(),
      now: new Date().toISOString().slice(0, 16),
    });
  }

  const dateMvt = date_mouvement ? new Date(date_mouvement).toISOString() : new Date().toISOString();

  db.run(
    `INSERT INTO mouvements_caisse (type, montant, motif, est_lie_vente, date_mouvement, user_id, commentaire)
     VALUES ('sortie', ?, ?, 0, ?, ?, ?)`,
    [mnt, motif.trim(), dateMvt, userId, commentaire || null],
    (err) => {
      if (err) {
        console.error(err);
        return res.status(500).send('Erreur serveur');
      }
      res.redirect('/caisse/sortie?success=sortie');
    }
  );
});

// ---------------------------------------------------------------------------
// HISTORIQUE DE CAISSE (filtrable par date + export CSV)
// ---------------------------------------------------------------------------
function buildHistoriqueCaisseQuery(query) {
  let sql = `
    SELECT mc.*, u.email AS user_email
    FROM mouvements_caisse mc
    LEFT JOIN users u ON u.id = mc.user_id
    WHERE 1=1
  `;
  const params = [];

  if (query.type) {
    sql += ' AND mc.type = ?';
    params.push(query.type);
  }
  if (query.date_debut) {
    sql += ' AND date(mc.date_mouvement) >= date(?)';
    params.push(query.date_debut);
  }
  if (query.date_fin) {
    sql += ' AND date(mc.date_mouvement) <= date(?)';
    params.push(query.date_fin);
  }
  sql += ' ORDER BY mc.date_mouvement DESC';
  return { sql, params };
}

router.get('/caisse/historique', requireLogin, (req, res) => {
  const { sql, params } = buildHistoriqueCaisseQuery(req.query);

  db.all(sql, params, (err, mouvements) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur serveur');
    }
    res.render('caisse/historique', {
      mouvements,
      filters: req.query,
      csrfToken: req.csrfToken(),
    });
  });
});

router.get('/caisse/historique/export.csv', requireLogin, (req, res) => {
  const { sql, params } = buildHistoriqueCaisseQuery(req.query);

  db.all(sql, params, (err, mouvements) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur serveur');
    }
    let csv = 'ID;Type;Motif;Montant;Liee a une vente;Date;Utilisateur;Commentaire\n';
    mouvements.forEach((m) => {
      csv += [
        m.id,
        m.type,
        (m.motif || '').replace(/;/g, ','),
        m.montant,
        m.est_lie_vente ? 'Oui' : 'Non',
        m.date_mouvement,
        m.user_email || '',
        (m.commentaire || '').replace(/;/g, ','),
      ].join(';') + '\n';
    });
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename=historique_caisse.csv');
    res.send('\uFEFF' + csv);
  });
});

module.exports = router;
module.exports.getSoldeCaisse = getSoldeCaisse;
// Note : router est une fonction, on peut donc attacher getSoldeCaisse comme propriété
// et l'importer ailleurs via require('./caisse').getSoldeCaisse
