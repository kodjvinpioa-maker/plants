// middleware/auth.js
// Middlewares de vérification de connexion et de rôle (admin / collaborateur).

// Vérifie que l'utilisateur est connecté (session active).
// Sinon, redirige vers la page de connexion.
function requireLogin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  // Rend les infos utilisateur disponibles dans toutes les vues
  res.locals.currentUser = req.session.user;
  next();
}

// Vérifie que l'utilisateur connecté a le rôle admin.
// Sinon, affiche une page "Accès refusé".
function requireAdmin(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/login');
  }
  if (req.session.user.role !== 'admin') {
    return res.status(403).render('acces-refuse', {
      currentUser: req.session.user,
    });
  }
  next();
}

module.exports = { requireLogin, requireAdmin };
