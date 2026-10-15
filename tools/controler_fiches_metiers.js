/* ============================================================
   Contrôle des fiches après le bug d'aller-retour versJSON (15/10/2026).
   À coller dans la console du navigateur, app ouverte (les personnages
   vivent en Firestore via window.DepotPersos — PAS exécutable via `node`).

   Contexte : avant le correctif `_fusionnerPerso` (js/app.js), équiper,
   déséquiper, ajouter ou jeter un objet réécrivait la fiche via
   Personnage.versJSON(), qui ignorait `metiers`, `metiersPratiques`,
   `ppActuel` et une dizaine d'autres champs. sauverPersos supprimait
   alors ces champs côté serveur.

   Ce qui est irrécupérable par le code : l'XP de métiers effacée n'a
   laissé aucune trace en base. Ce script ne devine rien, il SIGNALE.
   Le MJ compare avec ses notes et celles des joueurs, puis restaure à
   la main avec restaurerMetiers().

   Usage :
     1. F12 → Console, coller ce fichier entier, Entrée.
        → tableau de contrôle, lecture seule, aucune écriture.
     2. Pour restaurer une fiche, toujours dans la console :
        restaurerMetiers("id-du-perso", { cuisine: 25, traque: 10 });
        (valeurs en XP ; ids de métier : cuisine, traque, alchimie,
        musicien, scribe, tannerie)
        Les métiers restaurés sont aussi ajoutés à metiersPratiques.
   ============================================================ */
(function controlerFichesMetiers() {
  if (typeof window === "undefined" || !window.DepotPersos) {
    console.error("Ce script doit être exécuté dans la console du navigateur, app ouverte (window.DepotPersos introuvable).");
    return;
  }
  const IDS_METIERS = ["cuisine", "traque", "alchimie", "musicien", "scribe", "tannerie"];
  const persos = window.DepotPersos.charger();

  const lignes = Object.keys(persos).map((id) => {
    const p = persos[id] || {};
    const ligne = {
      id,
      nom: p.nom || "?",
      joueur: p.proprietaireNom || "?",
      niveau: p.niveau,
      ppActuel: p.ppActuel === undefined ? "ABSENT" : p.ppActuel,
      metiers: p.metiers === undefined ? "ABSENT" : "ok",
      pratiques: p.metiersPratiques === undefined ? "ABSENT" : p.metiersPratiques.join(", ") || "(aucun)",
    };
    IDS_METIERS.forEach((m) => {
      ligne[m] = p.metiers && p.metiers[m] ? p.metiers[m].xp : "";
    });
    return ligne;
  });

  console.log("%cContrôle des fiches — XP de métiers et PP", "font-weight:bold");
  console.log("« ABSENT » = champ probablement effacé par le bug (ou jamais renseigné). À comparer avec vos notes.");
  console.table(lignes);

  // Restauration manuelle, une fiche à la fois. Repart de la fiche en cache
  // (état serveur le plus récent connu) et ne touche qu'à metiers et
  // metiersPratiques.
  window.restaurerMetiers = function restaurerMetiers(persoId, xpParMetier) {
    const actuel = window.DepotPersos.charger(persoId);
    if (!actuel) { console.error(`Perso « ${persoId} » introuvable.`); return; }
    const inconnus = Object.keys(xpParMetier || {}).filter((m) => !IDS_METIERS.includes(m));
    if (inconnus.length) { console.error(`Métier(s) inconnu(s) : ${inconnus.join(", ")}`); return; }
    const fiche = Object.assign({}, actuel);
    fiche.metiers = Object.assign({}, fiche.metiers || {});
    Object.keys(xpParMetier).forEach((m) => {
      const xp = Math.max(0, Math.floor(Number(xpParMetier[m]) || 0));
      fiche.metiers[m] = { xp };
    });
    const pratiques = new Set(fiche.metiersPratiques || []);
    Object.keys(xpParMetier).forEach((m) => pratiques.add(m));
    fiche.metiersPratiques = Array.from(pratiques);
    window.DepotPersos.sauver(fiche, persoId);
    console.log(`✅ ${fiche.nom} : métiers restaurés →`, JSON.stringify(fiche.metiers));
  };
  console.log("Pour restaurer : restaurerMetiers(\"id-du-perso\", { cuisine: 25 })");
})();
