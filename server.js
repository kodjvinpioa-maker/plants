// server.js
const express = require('express');
const session = require('express-session');
const sqlite3 = require('sqlite3').verbose();
const bcrypt = require('bcrypt');
const csrf = require('csurf');
const multer = require('multer');
const path = require('path');
const cron = require('node-cron');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const db = new sqlite3.Database('./database.db');
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

// Configuration
app.set('view engine', 'ejs');
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(express.static('public'));
app.use(session({
  secret: 'secret-spring-plants',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 24 * 60 * 60 * 1000 }
}));
app.use(csrf());

// Multer pour les images
const storage = multer.diskStorage({
  destination: 'public/uploads/',
  filename: (req, file, cb) => cb(null, Date.now() + path.extname(file.originalname))
});
const upload = multer({ storage });

// Middleware pour rendre disponible le token CSRF dans les vues
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken();
  res.locals.user = req.session.user || null;
  next();
});

// === CRÉATION DES TABLES ET SEED ===
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT CHECK(role IN ('admin','collaborateur')) DEFAULT 'collaborateur',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS produits (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    reference TEXT UNIQUE NOT NULL,
    nom TEXT NOT NULL,
    seuil_alerte INTEGER DEFAULT 0,
    prix_achat REAL,
    prix_vente REAL,
    image TEXT,
    actif INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS mouvements_stock (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK(type IN ('entree','sortie','vente')) NOT NULL,
    produit_id INTEGER REFERENCES produits(id),
    quantite REAL NOT NULL,
    prix_vente_effectif REAL,
    date_mouvement DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id),
    commentaire TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS mouvements_caisse (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT CHECK(type IN ('entree','sortie')) NOT NULL,
    montant REAL NOT NULL,
    motif TEXT,
    est_lie_vente INTEGER DEFAULT 0,
    vente_id INTEGER REFERENCES mouvements_stock(id),
    est_cloture INTEGER DEFAULT 0,
    date_mouvement DATETIME DEFAULT CURRENT_TIMESTAMP,
    user_id INTEGER REFERENCES users(id),
    commentaire TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    action TEXT,
    description TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // Seed des utilisateurs
  const hashAdmin = bcrypt.hashSync('admin123', 10);
  const hashCollab = bcrypt.hashSync('collab123', 10);
  db.get(`SELECT id FROM users WHERE email = 'admin@example.com'`, (err, row) => {
    if (!row) {
      db.run(`INSERT INTO users (email, password, role) VALUES ('admin@example.com', ?, 'admin')`, hashAdmin);
      db.run(`INSERT INTO users (email, password, role) VALUES ('collab@example.com', ?, 'collaborateur')`, hashCollab);
    }
  });
});

// === MIDDLEWARE D'AUTHENTIFICATION ===
function isLoggedIn(req, res, next) {
  if (req.session.user) return next();
  res.redirect('/login');
}
function isAdmin(req, res, next) {
  if (req.session.user && req.session.user.role === 'admin') return next();
  res.status(403).send('Accès refusé');
}

// === FONCTIONS UTILITAIRES ===
function logAction(userId, action, description) {
  db.run(`INSERT INTO logs (user_id, action, description) VALUES (?, ?, ?)`, [userId, action, description]);
}
function getStockProduit(produitId, callback) {
  db.get(`SELECT 
    COALESCE((SELECT SUM(quantite) FROM mouvements_stock WHERE produit_id = ? AND type = 'entree'), 0) -
    COALESCE((SELECT SUM(quantite) FROM mouvements_stock WHERE produit_id = ? AND type = 'sortie'), 0) -
    COALESCE((SELECT SUM(quantite) FROM mouvements_stock WHERE produit_id = ? AND type = 'vente'), 0) AS stock`,
    [produitId, produitId, produitId], (err, row) => {
      callback(row ? row.stock : 0);
    });
}

// === ROUTES ===
app.get('/login', (req, res) => res.render('login', { error: null }));
app.post('/login', (req, res) => {
  const { email, password } = req.body;
  db.get(`SELECT * FROM users WHERE email = ?`, [email], (err, user) => {
    if (!user || !bcrypt.compareSync(password, user.password)) {
      return res.render('login', { error: 'Identifiants incorrects' });
    }
    req.session.user = { id: user.id, email: user.email, role: user.role };
    logAction(user.id, 'Connexion', 'Connexion réussie');
    res.redirect('/dashboard');
  });
});
app.get('/logout', (req, res) => { req.session.destroy(); res.redirect('/login'); });

app.get('/dashboard', isLoggedIn, (req, res) => {
  // Calcul des indicateurs
  db.get(`SELECT COUNT(*) AS nbProduits FROM produits WHERE actif=1`, (err, p) => {
    db.get(`SELECT COALESCE(SUM(montant),0) AS solde FROM mouvements_caisse WHERE type='entree'`, (err, c1) => {
      db.get(`SELECT COALESCE(SUM(montant),0) AS sorties FROM mouvements_caisse WHERE type='sortie'`, (err, c2) => {
        const solde = c1.solde - c2.sorties;
        db.all(`SELECT * FROM mouvements_stock ORDER BY date_mouvement DESC LIMIT 5`, (err, derniersMvts) => {
          db.all(`SELECT *, (SELECT stock FROM ...) AS stock FROM produits WHERE actif=1 AND stock <= seuil_alerte LIMIT 5`, (err, alertes) => {
            res.render('dashboard', { nbProduits: p.nbProduits, solde, derniersMvts, alertes });
          });
        });
      });
    });
  });
});

// Produits
app.get('/produits', isLoggedIn, (req, res) => {
  db.all(`SELECT *, 
    (SELECT COALESCE(SUM(quantite),0) FROM mouvements_stock WHERE produit_id = produits.id AND type='entree') -
    (SELECT COALESCE(SUM(quantite),0) FROM mouvements_stock WHERE produit_id = produits.id AND type='sortie') -
    (SELECT COALESCE(SUM(quantite),0) FROM mouvements_stock WHERE produit_id = produits.id AND type='vente') AS stock
    FROM produits WHERE actif=1`, (err, produits) => {
    res.render('produits', { produits, csrfToken: req.csrfToken() });
  });
});
app.get('/produits/ajouter', isAdmin, (req, res) => res.render('produit-form', { produit: null, csrfToken: req.csrfToken() }));
app.post('/produits/ajouter', isAdmin, upload.single('image'), (req, res) => {
  const { reference, nom, seuil, prix_achat, prix_vente } = req.body;
  const image = req.file ? '/uploads/' + req.file.filename : null;
  db.run(`INSERT INTO produits (reference, nom, seuil_alerte, prix_achat, prix_vente, image) VALUES (?,?,?,?,?,?)`,
    [reference, nom, seuil, prix_achat, prix_vente, image], (err) => {
      if (err) return res.send('Erreur');
      logAction(req.session.user.id, 'Ajout produit', `Produit ${nom} créé`);
      res.redirect('/produits');
    });
});
// ... autres routes pour modifier, archiver, etc.

// Ventes
app.get('/vente', isLoggedIn, (req, res) => {
  db.all(`SELECT id, nom, prix_vente FROM produits WHERE actif=1`, (err, produits) => {
    res.render('vente', { produits, csrfToken: req.csrfToken() });
  });
});
app.post('/vente', isLoggedIn, (req, res) => {
  const { produit_id, quantite, prix_vente, date, commentaire } = req.body;
  getStockProduit(produit_id, (stock) => {
    if (stock < quantite) return res.send('Stock insuffisant');
    const userId = req.session.user.id;
    const montant = quantite * prix_vente;
    db.run(`INSERT INTO mouvements_stock (type, produit_id, quantite, prix_vente_effectif, date_mouvement, user_id, commentaire) VALUES ('vente',?,?,?,?,?,?)`,
      [produit_id, quantite, prix_vente, date, userId, commentaire], function() {
        const venteId = this.lastID;
        db.run(`INSERT INTO mouvements_caisse (type, montant, motif, est_lie_vente, vente_id, date_mouvement, user_id) VALUES ('entree',?,?,1,?,?,?)`,
          [montant, `Vente de produit`, venteId, date, userId], () => {
            logAction(userId, 'Vente', `Vente produit ID ${produit_id}, qté ${quantite}, ${montant} FCFA`);
            res.redirect('/dashboard');
          });
      });
  });
});

// Annulation vente (admin)
app.post('/vente/annuler/:id', isAdmin, (req, res) => {
  const venteId = req.params.id;
  db.run(`DELETE FROM mouvements_caisse WHERE vente_id = ?`, [venteId], () => {
    db.run(`DELETE FROM mouvements_stock WHERE id = ? AND type='vente'`, [venteId], () => {
      logAction(req.session.user.id, 'Annulation vente', `Vente ${venteId} annulée`);
      res.redirect('/historique-stock');
    });
  });
});

// Stock manuel
app.get('/stock', isLoggedIn, (req, res) => res.render('stock', { csrfToken: req.csrfToken() }));
app.post('/stock/entree', isLoggedIn, (req, res) => {
  const { produit_id, quantite, prix_achat, date, commentaire, payer_caisse } = req.body;
  const userId = req.session.user.id;
  db.run(`INSERT INTO mouvements_stock (type, produit_id, quantite, date_mouvement, user_id, commentaire) VALUES ('entree',?,?,?,?,?)`,
    [produit_id, quantite, date, userId, commentaire], function() {
      if (payer_caisse && prix_achat) {
        const montant = quantite * prix_achat;
        db.run(`INSERT INTO mouvements_caisse (type, montant, motif, date_mouvement, user_id) VALUES ('sortie',?,?,?,?)`,
          [montant, `Achat stock`, date, userId]);
      }
      logAction(userId, 'Entrée stock', `Entrée produit ID ${produit_id}, qté ${quantite}`);
      res.redirect('/dashboard');
    });
});
// Similaire pour sortie manuelle (casse, défectueux)

// Caisse
app.get('/caisse', isLoggedIn, (req, res) => {
  db.all(`SELECT * FROM mouvements_caisse ORDER BY date_mouvement DESC`, (err, mouvements) => {
    res.render('caisse', { mouvements, csrfToken: req.csrfToken() });
  });
});
app.post('/caisse/entree', isAdmin, (req, res) => { /* ... */ });
app.post('/caisse/sortie', isAdmin, (req, res) => { /* ... */ });

// Clôture automatique (cron)
cron.schedule('0 23 * * *', () => {
  db.get(`SELECT COALESCE(SUM(montant),0) AS total FROM mouvements_caisse WHERE type='entree'`, (err, e) => {
    db.get(`SELECT COALESCE(SUM(montant),0) AS total FROM mouvements_caisse WHERE type='sortie'`, (err, s) => {
      const solde = e.total - s.total;
      if (solde !== 0) {
        const type = solde > 0 ? 'sortie' : 'entree';
        const montant = Math.abs(solde);
        db.run(`INSERT INTO mouvements_caisse (type, montant, motif, est_cloture, date_mouvement, user_id) VALUES (?,?,?,1,DATETIME('now'), (SELECT id FROM users WHERE role='admin' LIMIT 1))`,
          [type, montant, `Clôture automatique du ${new Date().toLocaleDateString()}`]);
      }
    });
  });
});

// Rapports (admin)
app.get('/rapports', isAdmin, (req, res) => {
  const { debut, fin } = req.query;
  let query = `SELECT v.date_mouvement, SUM(v.quantite * v.prix_vente_effectif) AS ca, COUNT(*) AS nb_ventes,
    SUM(v.quantite * COALESCE(p.prix_achat,0)) AS cout
    FROM mouvements_stock v JOIN produits p ON v.produit_id = p.id
    WHERE v.type='vente'`;
  if (debut) query += ` AND v.date_mouvement >= '${debut}'`;
  if (fin) query += ` AND v.date_mouvement <= '${fin}'`;
  query += ` GROUP BY DATE(v.date_mouvement) ORDER BY v.date_mouvement`;
  db.all(query, (err, data) => {
    res.render('rapports', { data, csrfToken: req.csrfToken() });
  });
});

// Journal (admin)
app.get('/journal', isAdmin, (req, res) => {
  db.all(`SELECT l.*, u.email FROM logs l JOIN users u ON l.user_id = u.id ORDER BY l.created_at DESC`, (err, logs) => {
    res.render('journal', { logs, csrfToken: req.csrfToken() });
  });
});

// Chatbot
app.get('/chatbot', isLoggedIn, (req, res) => res.render('chatbot', { csrfToken: req.csrfToken() }));
app.post('/api/chatbot', isLoggedIn, async (req, res) => {
  const { question } = req.body;
  try {
    const prompt = `Tu es un assistant spécialisé en botanique. Réponds uniquement aux questions sur les plantes, le jardinage, l'entretien, les maladies. Si la question est hors sujet, réponds poliment que tu es spécialiste des plantes. Question: ${question}`;
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();
    res.json({ answer: text });
  } catch (e) {
    res.json({ answer: "Désolé, une erreur s'est produite." });
  }
});

// Utilisateurs (admin)
app.get('/utilisateurs', isAdmin, (req, res) => {
  db.all(`SELECT id, email, role, created_at FROM users`, (err, users) => {
    res.render('utilisateurs', { users, csrfToken: req.csrfToken() });
  });
});
app.post('/utilisateurs/creer', isAdmin, (req, res) => {
  const { email, password, role } = req.body;
  const hash = bcrypt.hashSync(password, 10);
  db.run(`INSERT INTO users (email, password, role) VALUES (?,?,?)`, [email, hash, role], (err) => {
    logAction(req.session.user.id, 'Création utilisateur', `Création de ${email}`);
    res.redirect('/utilisateurs');
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('Serveur Spring Plants démarré sur le port', PORT));