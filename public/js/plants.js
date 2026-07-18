// plants.js
// Animations botaniques : feuilles flottantes en arrière-plan,
// effet "ripple" vert/blanc au clic sur les boutons,
// et surlignage vert doux au clic sur les lignes de tableau.

document.addEventListener('DOMContentLoaded', () => {
  /* ------------------------------------------------------------------
     1. Feuilles flottantes décoratives
     De petites feuilles tombent doucement en arrière-plan, en continu.
     ------------------------------------------------------------------ */
  function creerFeuille() {
    const feuille = document.createElement('i');
    feuille.className = 'fa-solid feuille-flottante';
    // Choisit une icône botanique au hasard (uniquement des icônes solides valides)
    const icones = ['fa-leaf', 'fa-seedling', 'fa-spa'];
    feuille.classList.add(icones[Math.floor(Math.random() * icones.length)]);
    feuille.style.left = Math.random() * 100 + 'vw';
    feuille.style.fontSize = (14 + Math.random() * 18) + 'px';
    const duree = 9 + Math.random() * 9; // entre 9 et 18 secondes
    feuille.style.animationDuration = duree + 's';
    document.body.appendChild(feuille);
    // Nettoyage une fois l'animation terminée
    setTimeout(() => feuille.remove(), duree * 1000);
  }

  // Quelques feuilles au démarrage, puis une nouvelle régulièrement
  for (let i = 0; i < 4; i++) {
    setTimeout(creerFeuille, i * 900);
  }
  setInterval(creerFeuille, 3500);

  /* ------------------------------------------------------------------
     2. Effet ripple vert/blanc au clic sur les boutons et liens-boutons
     ------------------------------------------------------------------ */
  document.body.addEventListener('click', (e) => {
    const btn = e.target.closest('.btn');
    if (btn) {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple-effect';
      const size = Math.max(rect.width, rect.height);
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 700);
    }

    /* --------------------------------------------------------------
       3. Surlignage vert/blanc doux au clic sur une ligne de tableau
       -------------------------------------------------------------- */
    const ligne = e.target.closest('tbody tr');
    if (ligne) {
      ligne.classList.remove('clic-surligne');
      // Force le redémarrage de l'animation
      void ligne.offsetWidth;
      ligne.classList.add('clic-surligne');
    }
  });
});
