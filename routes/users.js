// routes/users.js
// Gestion des utilisateurs : création de compte collaborateur par l'admin,
// et liste des utilisateurs existants (sans afficher les mots de passe).

const express = require('express');
const bcrypt = require('bcrypt');
const router = express.Router();
const db = require('../db');
const { requireAdmin } = require('../middleware/auth');

// GET /users : liste des utilisateurs (admin seulement)
router.get('/users', requireAdmin, (req, res) => {
  db.all('SELECT id, email, role, created_at FROM users ORDER BY created_at DESC', [], (err, users) => {
    if (err) {
      console.error(err);
      return res.status(500).send('Erreur serveur');
    }
    res.render('users/liste', {
      users,
      error: null,
      csrfToken: req.csrfToken(),
    });
  });
});

// GET /users/nouveau : formulaire de création de collaborateur (admin seulement)
router.get('/users/nouveau', requireAdmin, (req, res) => {
  res.render('users/form', {
    error: null,
    csrfToken: req.csrfToken(),
  });
});

// POST /users/nouveau : création du compte collaborateur (admin seulement)
router.post('/users/nouveau', requireAdmin, (req, res) => {
  const { email, password, role } = req.body;

  if (!email || !password || password.length < 6) {
    return res.render('users/form', {
      error: 'Email requis et mot de passe de 6 caractères minimum.',
      csrfToken: req.csrfToken(),
    });
  }

  const roleFinal = role === 'admin' ? 'admin' : 'collaborateur';

  bcrypt.hash(password, 10, (hashErr, hash) => {
    if (hashErr) {
      console.error(hashErr);
      return res.render('users/form', {
        error: 'Erreur lors du hashage du mot de passe.',
        csrfToken: req.csrfToken(),
      });
    }

    db.run(
      'INSERT INTO users (email, password, role) VALUES (?, ?, ?)',
      [email.trim().toLowerCase(), hash, roleFinal],
      (err) => {
        if (err) {
          console.error(err);
          const msg = err.message.includes('UNIQUE')
            ? 'Cet email est déjà utilisé.'
            : "Erreur lors de la création de l'utilisateur.";
          return res.render('users/form', {
            error: msg,
            csrfToken: req.csrfToken(),
          });
        }
        res.redirect('/users?success=creation');
      }
    );
  });
});

module.exports = router;
