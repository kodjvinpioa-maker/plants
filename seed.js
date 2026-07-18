// seed.js
// Script de seed autonome : peut être exécuté manuellement avec `node seed.js`
// pour (re)créer les utilisateurs de test si la table users est vide.
// Note : ce seed s'exécute déjà automatiquement au démarrage du serveur via db.js,
// ce script est fourni en complément pour un lancement manuel ou pour une base fraîche.

const db = require('./db');

console.log('Vérification / création des utilisateurs de test...');

// Laisse le temps à db.js de terminer son initialisation asynchrone,
// puis affiche l'état final de la table users.
setTimeout(() => {
  db.all('SELECT id, email, role FROM users', [], (err, rows) => {
    if (err) {
      console.error('Erreur lors de la lecture des utilisateurs :', err.message);
      process.exit(1);
    }
    console.log('Utilisateurs actuellement en base :');
    rows.forEach((u) => console.log(`  - [${u.role}] ${u.email}`));
    process.exit(0);
  });
}, 1000);
