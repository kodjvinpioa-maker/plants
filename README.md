# Gestion Stock & Petite Caisse

Application web de gestion de stock et de petite caisse, construite avec Node.js, Express, SQLite et EJS.

## Installation et lancement

```bash
npm install
node server.js
```

L'application démarre sur `http://localhost:3000` (ou le port défini par la variable d'environnement `PORT`).

Au premier lancement, la base de données SQLite (`data.db`) est créée automatiquement avec toutes les tables nécessaires, et deux comptes de test sont insérés :

- **Admin** : `admin@example.com` / `admin123`
- **Collaborateur** : `collab@example.com` / `collab123`

## Sur Replit

1. Importer ce dépôt dans un nouveau Repl Node.js.
2. Le fichier `.replit` est déjà configuré (`run = "node server.js"`).
3. Cliquer sur "Run" : Replit exécute automatiquement `npm install` puis démarre le serveur.

## Structure du projet

```
server.js               Point d'entrée, configuration Express/session/CSRF
db.js                   Initialisation SQLite + création des tables + seed auto
seed.js                 Script de seed manuel (optionnel)
middleware/auth.js      Middlewares requireLogin / requireAdmin
routes/auth.js          Connexion / déconnexion
routes/produits.js      CRUD produits + API autocomplétion
routes/stock.js         Mouvements de stock, ventes, annulation, historique
routes/caisse.js        Mouvements de caisse, historique
routes/dashboard.js     Tableau de bord
routes/users.js         Gestion des collaborateurs
views/                  Vues EJS
public/                 CSS et JS statiques
```

## Sécurité

- Mots de passe hashés avec bcrypt.
- Sessions via `express-session` (secret aléatoire généré au démarrage, ou `SESSION_SECRET` en variable d'environnement).
- Protection CSRF sur tous les formulaires POST (`csurf`).
- Échappement automatique des sorties HTML via EJS (`<%= %>`).
- Vérification des droits (admin / collaborateur) sur chaque route sensible.
