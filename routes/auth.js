// routes/auth.js
// Routes de connexion et déconnexion.

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../db');

// GET /login : affiche le formulaire de connexion
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', {
    error: null,
    csrfToken: req.csrfToken(),
  });
});

// POST /login : traite la soumission du formulaire de connexion
router.post('/login', (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.render('login', {
      error: 'Veuillez renseigner votre email et votre mot de passe.',
      csrfToken: req.csrfToken(),
    });
  }

  db.get('SELECT * FROM users WHERE email = ?', [email.trim().toLowerCase()], (err, user) => {
    if (err) {
      console.error(err);
      return res.render('login', { error: 'Erreur serveur.', csrfToken: req.csrfToken() });
    }
    if (!user) {
      return res.render('login', { error: 'Identifiants invalides.', csrfToken: req.csrfToken() });
    }

    bcrypt.compare(password, user.password, (compareErr, match) => {
      if (compareErr) {
        console.error(compareErr);
        return res.render('login', { error: 'Erreur serveur.', csrfToken: req.csrfToken() });
      }
      if (!match) {
        return res.render('login', { error: 'Identifiants invalides.', csrfToken: req.csrfToken() });
      }

      // Connexion réussie : on stocke les infos utiles en session
      req.session.user = {
        id: user.id,
        email: user.email,
        role: user.role,
      };
      res.redirect('/dashboard');
    });
  });
});

// POST /logout : détruit la session et redirige vers le login
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.redirect('/login');
  });
});

module.exports = router;
