/* ============================================================
   Réputation — module de gestion de la réputation de groupe.
   Une valeur par faction, partagée pour tout le groupe, stockée
   via SyncStore (clé "reputation:{factionId}"). Le MJ ajuste,
   tout le monde voit en temps réel.
   ============================================================ */

const Reputation = (() => {
  "use strict";

  function _cle(factionId) { return `reputation:${factionId}`; }

  function _factions() {
    return (typeof REPUTATION_FACTIONS_LIBERRA !== "undefined") ? REPUTATION_FACTIONS_LIBERRA : [];
  }

  function obtenirScore(factionId) {
    const v = SyncStore.get(_cle(factionId));
    return (typeof v === "number") ? v : 0;
  }

  function definirScore(factionId, valeur) {
    const faction = _factions().find((f) => f.id === factionId);
    const plafond = faction ? faction.plafond : 10;
    const clamped = Math.max(-10, Math.min(plafond, valeur));
    SyncStore.set(_cle(factionId), clamped);
    return clamped;
  }

  function ajusterScore(factionId, delta) {
    return definirScore(factionId, obtenirScore(factionId) + delta);
  }

  function obtenirPalier(factionId) {
    const score = obtenirScore(factionId);
    const echelle = (typeof REPUTATION_ECHELLE !== "undefined") ? REPUTATION_ECHELLE : [];
    return echelle.find((p) => score >= p.min && score <= p.max) || null;
  }

  // Applique le modificateur de réputation à un prix de base, si le
  // marchand porte un champ `faction` correspondant à un bloc de Liberra.
  // Retourne { prix, refuse } — refuse=true si palier Némésis (modPrix null).
  function appliquerModifierPrix(factionId, prixBase) {
    if (!factionId) return { prix: prixBase, refuse: false };
    const palier = obtenirPalier(factionId);
    if (!palier || palier.modPrix === null) return { prix: prixBase, refuse: true };
    return { prix: Math.ceil(prixBase * (1 + palier.modPrix)), refuse: false };
  }

  function _echapper(s) {
    const d = document.createElement("div");
    d.textContent = s;
    return d.innerHTML;
  }

  function rendrePanneauReputation() {
    const zone = document.getElementById("zone-reputation");
    if (!zone) return;
    const estMJ = (typeof App !== "undefined" && App.obtenirRole() === "mj");
    const echelle = (typeof REPUTATION_ECHELLE !== "undefined") ? REPUTATION_ECHELLE : [];

    zone.innerHTML = _factions().map((f) => {
      const score = obtenirScore(f.id);
      const palier = obtenirPalier(f.id);
      const pctBarre = Math.round(((score + 10) / 20) * 100);
      return `
        <div class="carte reputation-carte" data-faction="${f.id}">
          <h3 class="titre-bandeau" style="font-size:1rem;">${_echapper(f.nom)}</h3>
          <p style="font-size:0.8rem;color:#6a6278;margin:2px 0 8px;">${_echapper(f.accroche)}</p>
          <div class="reputation-barre">
            <div class="reputation-barre-remplie" style="width:${pctBarre}%;"></div>
          </div>
          <div class="reputation-score-ligne">
            <strong>${score >= 0 ? "+" : ""}${score}</strong>
            <span class="reputation-palier">${palier ? _echapper(palier.label) : "?"}</span>
          </div>
          <p style="font-size:0.75rem;color:#6a6278;">${palier ? _echapper(palier.description) : ""}</p>
          ${estMJ ? `
            <div class="reputation-controles" data-role="mj">
              <button class="btn petit" data-rep-delta="-5" data-rep-faction="${f.id}">-5</button>
              <button class="btn petit" data-rep-delta="-1" data-rep-faction="${f.id}">-1</button>
              <button class="btn petit" data-rep-delta="1" data-rep-faction="${f.id}">+1</button>
              <button class="btn petit or" data-rep-delta="5" data-rep-faction="${f.id}">+5</button>
            </div>
          ` : ""}
        </div>`;
    }).join("");

    if (estMJ) {
      zone.querySelectorAll("[data-rep-delta]").forEach((btn) => {
        btn.onclick = () => {
          ajusterScore(btn.dataset.repFaction, parseInt(btn.dataset.repDelta, 10));
          rendrePanneauReputation();
        };
      });
    }
  }

  return { obtenirScore, definirScore, ajusterScore, obtenirPalier, appliquerModifierPrix, rendrePanneauReputation };
})();

if (typeof window !== "undefined") window.Reputation = Reputation;
