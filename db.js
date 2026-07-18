// db.js
// Initialisation de la base de données SQLite et création des tables si elles n'existent pas.
// Contient également la logique de seed (création des utilisateurs de test au premier lancement).

const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const path = require('path');

const DB_PATH = path.join(__dirname, 'data.db');

// Ouverture / création du fichier de base de données
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error('Erreur lors de la connexion à la base de données :', err.message);
    process.exit(1);
  }
  console.log('Connecté à la base de données SQLite :', DB_PATH);
});

// Active les clés étrangères (désactivées par défaut dans SQLite)
db.run('PRAGMA foreign_keys = ON');

// ---------------------------------------------------------------------------
// Création des tables (si elles n'existent pas déjà)
// ---------------------------------------------------------------------------
const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT CHECK(role IN ('admin','collaborateur')) NOT NULL DEFAULT 'collaborateur',
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS produits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  reference TEXT UNIQUE NOT NULL,
  nom TEXT NOT NULL,
  seuil_alerte INTEGER DEFAULT 0,
  prix_vente REAL,
  prix_achat REAL,
  actif INTEGER DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS mouvements_stock (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT CHECK(type IN ('entree','sortie','vente')) NOT NULL,
  produit_id INTEGER REFERENCES produits(id),
  quantite REAL NOT NULL,
  prix_vente_effectif REAL,
  date_mouvement DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER REFERENCES users(id),
  commentaire TEXT
);

CREATE TABLE IF NOT EXISTS mouvements_caisse (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  type TEXT CHECK(type IN ('entree','sortie')) NOT NULL,
  montant REAL NOT NULL,
  motif TEXT,
  est_lie_vente INTEGER DEFAULT 0,
  vente_id INTEGER REFERENCES mouvements_stock(id) ON DELETE SET NULL,
  date_mouvement DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id INTEGER REFERENCES users(id),
  commentaire TEXT
);
`;

// ---------------------------------------------------------------------------
// Initialisation : création des tables puis seed des utilisateurs de test
// ---------------------------------------------------------------------------
function init() {
  db.serialize(() => {
    db.exec(SCHEMA, (err) => {
      if (err) {
        console.error('Erreur lors de la création des tables :', err.message);
        return;
      }
      seedUsers();
    });
  });
}

// Crée un admin et un collaborateur de test si la table users est vide
function seedUsers() {
  db.get('SELECT COUNT(*) AS count FROM users', (err, row) => {
    if (err) {
      console.error('Erreur lors de la vérification des utilisateurs :', err.message);
      return;
    }
    if (row.count === 0) {
      const saltRounds = 10;
      const admin = { email: 'admin@example.com', password: 'admin123', role: 'admin' };
      const collab = { email: 'collab@example.com', password: 'collab123', role: 'collaborateur' };

      [admin, collab].forEach((u) => {
        bcrypt.hash(u.password, saltRounds, (hashErr, hash) => {
          if (hashErr) {
            console.error('Erreur de hashage du mot de passe :', hashErr.message);
            return;
          }
          db.run(
            'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
            [u.email, hash, u.role],
            (insertErr) => {
              if (insertErr) {
                console.error(`Erreur lors de la création de ${u.email} :`, insertErr.message);
              } else {
                console.log(`Utilisateur de test créé : ${u.email} / ${u.password} (${u.role})`);
              }
            }
          );
        });
      });
    }
  });
}

init();

module.exports = db;
