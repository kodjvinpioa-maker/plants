// server.js
// Point d'entrée de l'application : configuration du serveur Express,
// sessions, sécurité CSRF, moteur de vues EJS, et montage des routes.

const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const csrf = require('csurf');
const methodOverride = require('method-override');
const path = require('path');
const crypto = require('crypto');

// Initialise la base de données (création des tables + seed si nécessaire)
require('./db');

const { requireLogin } = require('./middleware/auth');

const app = express();
const PORT = process.env.PORT || 3000;

// ---------------------------------------------------------------------------
// Configuration du moteur de vues
// ---------------------------------------------------------------------------
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// ---------------------------------------------------------------------------
// Middlewares globaux
// ---------------------------------------------------------------------------
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());
app.use(methodOverride('_method'));
app.use(express.static(path.join(__dirname, 'public')));

// Secret de session : utilise une variable d'environnement si disponible,
// sinon génère un secret aléatoire au démarrage (suffisant pour le dev).
const SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

app.use(
  session({
    secret: SESSION_SECRET,
    resave: false,
    // saveUninitialized doit rester true : csurf stocke le secret CSRF dans
    // la session dès le premier GET (ex : affichage du formulaire de login),
    // avant que l'utilisateur ne soit authentifié. Si la session vide n'est
    // pas sauvegardée, un nouveau secret est généré à chaque requête et la
    // validation du token CSRF échoue systématiquement au POST suivant.
    saveUninitialized: true,
    cookie: {
      httpOnly: true,
      maxAge: 1000 * 60 * 60 * 8, // 8 heures
    },
  })
);

// Protection CSRF sur tous les formulaires POST (basée sur les cookies de session)
app.use(csrf());

// Rend le CSRF token et l'utilisateur courant disponibles dans toutes les vues
app.use((req, res, next) => {
  res.locals.currentUser = req.session.user || null;
  res.locals.query = req.query || {};
  res.locals.csrfToken = req.csrfToken();
  next();
});

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------
const authRoutes = require('./routes/auth');
const produitsRoutes = require('./routes/produits');
const stockRoutes = require('./routes/stock');
const caisseRoutes = require('./routes/caisse');
const dashboardRoutes = require('./routes/dashboard');
const usersRoutes = require('./routes/users');

app.use('/', authRoutes);
app.use('/', produitsRoutes);
app.use('/', stockRoutes);
app.use('/', caisseRoutes);
app.use('/', dashboardRoutes);
app.use('/', usersRoutes);

// Redirection racine vers le tableau de bord (ou login si non connecté)
app.get('/', requireLogin, (req, res) => {
  res.redirect('/dashboard');
});

// ---------------------------------------------------------------------------
// Gestion des erreurs
// ---------------------------------------------------------------------------

// Erreur CSRF (token invalide ou expiré)
app.use((err, req, res, next) => {
  if (err.code === 'EBADCSRFTOKEN') {
    return res.status(403).send('Formulaire invalide ou expiré (erreur CSRF). Veuillez réessayer.');
  }
  next(err);
});

// Page 404
app.use((req, res) => {
  res.status(404).send('Page non trouvée.');
});

// Gestion des erreurs générales
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).send('Une erreur serveur est survenue.');
});

// ---------------------------------------------------------------------------
// Démarrage du serveur
// ---------------------------------------------------------------------------
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Serveur démarré sur http://0.0.0.0:${PORT}`);
  console.log('Comptes de test :');
  console.log('  Admin        : admin@example.com / admin123');
  console.log('  Collaborateur: collab@example.com / collab123');
});
