// produit-autocomplete.js
// Autocomplétion pour la sélection de produit sur la page "Nouvelle vente".
// Interroge l'API GET /api/produits?q=... qui renvoie du JSON.

document.addEventListener('DOMContentLoaded', () => {
  const searchInput = document.getElementById('produitSearch');
  const hiddenInput = document.getElementById('produitId');
  const suggestionsBox = document.getElementById('produitSuggestions');
  const stockInfo = document.getElementById('stockInfo');
  const prixVenteInput = document.getElementById('prixVente');

  if (!searchInput) return; // Cette page n'a pas de champ d'autocomplétion

  let debounceTimer = null;

  searchInput.addEventListener('input', () => {
    hiddenInput.value = ''; // Invalide la sélection précédente tant qu'un nouveau choix n'est pas fait
    stockInfo.textContent = '';
    const q = searchInput.value.trim();

    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      fetch(`/api/produits?q=${encodeURIComponent(q)}`)
        .then((res) => res.json())
        .then((produits) => renderSuggestions(produits))
        .catch(() => {
          suggestionsBox.innerHTML = '';
        });
    }, 200);
  });

  function renderSuggestions(produits) {
    suggestionsBox.innerHTML = '';
    if (!produits.length) {
      suggestionsBox.innerHTML = '<div class="list-group-item text-muted small">Aucun produit trouvé</div>';
      return;
    }
    produits.forEach((p) => {
      const item = document.createElement('button');
      item.type = 'button';
      item.className = 'list-group-item list-group-item-action d-flex justify-content-between align-items-center';
      item.innerHTML = `<span>${escapeHtml(p.nom)} <small class="text-muted">(${escapeHtml(p.reference)})</small></span>
                         <span class="badge bg-light text-dark">Stock: ${p.stock_actuel}</span>`;
      item.addEventListener('click', () => {
        searchInput.value = p.nom;
        hiddenInput.value = p.id;
        stockInfo.textContent = `Stock disponible : ${p.stock_actuel}`;
        if (p.prix_vente != null && prixVenteInput) {
          prixVenteInput.value = p.prix_vente;
        }
        suggestionsBox.innerHTML = '';
      });
      suggestionsBox.appendChild(item);
    });
  }

  function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  // Ferme les suggestions si on clique ailleurs
  document.addEventListener('click', (e) => {
    if (!suggestionsBox.contains(e.target) && e.target !== searchInput) {
      suggestionsBox.innerHTML = '';
    }
  });
});
