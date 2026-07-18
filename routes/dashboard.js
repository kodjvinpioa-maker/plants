// routes/dashboard.js
// Tableau de bord avec indicateurs clés, accessible à tous les utilisateurs connectés.

const express = require('express');
const router = express.Router();
const db = require('../db');
const { requireLogin } = require('../middleware/auth');
const { getSoldeCaisse } = require('./caisse');

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

router.get('/dashboard', requireLogin, (req, res) => {
  // 1. Nombre total de produits actifs
  db.get('SELECT COUNT(*) AS total FROM produits WHERE actif = 1', [], (err, totalRow) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur serveur');
    }

    // 2. Produits actifs avec leur stock actuel, pour calcul des alertes
    db.all(
      `SELECT p.*, ${STOCK_SQL} FROM produits p WHERE p.actif = 1 ORDER BY p.nom ASC`,
      [],
      (prodErr, produits) => {
        if (prodErr) {
          console.error(prodErr);
          return res.status(500).send('Erreur serveur');
        }

        const produitsEnAlerte = produits.filter((p) => p.stock_actuel <= p.seuil_alerte);
        // Tri par écart (stock - seuil) croissant : les plus critiques en premier
        const top5Alertes = [...produitsEnAlerte]
          .sort((a, b) => (a.stock_actuel - a.seuil_alerte) - (b.stock_actuel - b.seuil_alerte))
          .slice(0, 5);

        // 3. Solde de la caisse
        getSoldeCaisse((caisseErr, solde) => {
          if (caisseErr) {
            console.error(caisseErr);
            return res.status(500).send('Erreur serveur');
          }

          // 4. Les 5 derniers mouvements de stock (tous types confondus)
          db.all(
            `SELECT ms.*, p.nom AS produit_nom
             FROM mouvements_stock ms
             LEFT JOIN produits p ON p.id = ms.produit_id
             ORDER BY ms.date_mouvement DESC LIMIT 5`,
            [],
            (mvtErr, derniersMouvements) => {
              if (mvtErr) {
                console.error(mvtErr);
                return res.status(500).send('Erreur serveur');
              }

              res.render('dashboard', {
                totalProduits: totalRow.total,
                totalAlertes: produitsEnAlerte.length,
                soldeCaisse: solde,
                derniersMouvements,
                top5Alertes,
              });
            }
          );
        });
      }
    );
  });
});

module.exports = router;
