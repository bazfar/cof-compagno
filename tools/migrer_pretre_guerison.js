/* ============================================================
   Migration — Prêtre, Cercle de Vie v2 (cf. prompt_pretre_cercle_vie.md
   Partie 7). À coller dans la console du navigateur, app ouverte (les
   personnages vivent en Firestore via window.DepotPersos, pas en Node —
   ce script n'est PAS exécutable via `node`).

   Ce que la refonte change pour un Prêtre ayant déjà des rangs dans
   "Voie de la guérison" :
   - rang 1 (ex-"Soins légers", devenu "Imposition des mains (sort)") :
     RIEN À MIGRER. Le sort accordé est désormais calculé dynamiquement
     par Personnage.sortsGrimoireAccordes() à partir du rang déjà acquis
     dans capacites[] — aucune donnée stockée à corriger.
   - rang 4 (ex-"Bénédiction", devenu "Bénédiction des dieux") : idem,
     RIEN À MIGRER. pointsBenedictionMax() (et pointsBenediction par
     défaut, cf. constructeur Personnage) sont calculés dynamiquement
     depuis le même rang déjà acquis.
   - rang 5 (ex-"Résurrection (rituel, 10 min)", devenu "Faveur divine") :
     SEUL CAS RÉEL. Le sort Résurrection n'est plus accordé directement
     par ce rang — il faut désormais l'apprendre via le Grimoire. Un
     Prêtre qui avait déjà le rang 5 avant la refonte perdrait l'accès à
     Résurrection sans cette migration : on l'ajoute directement à
     grimoireSortsConnus (hors slot, comme un rattrapage rétroactif —
     pas une vraie place de Grimoire consommée pour ce cas précis).
     +1 CON/+1 CHA (Faveur divine) : RIEN À MIGRER non plus, calculés
     dynamiquement par bonusCaracCapacites() depuis le même rang 5.

   Usage : ouvrir l'app dans le navigateur, F12 → Console, coller ce
   fichier entier, Entrée. Idempotent (re-exécutable sans effet de bord :
   ne touche que les Prêtres rang 5 n'ayant pas encore "resurrection").
   ============================================================ */
(function migrerPretreGuerisonV2() {
  if (typeof window === "undefined" || !window.DepotPersos) {
    console.error("Ce script doit être exécuté dans la console du navigateur, app ouverte (window.DepotPersos introuvable).");
    return;
  }
  const persos = window.DepotPersos.charger();
  let migres = 0;

  Object.keys(persos).forEach((id) => {
    const p = persos[id];
    if (!p || p.classe !== "pretre") return;

    const capaciteRang5 = (p.capacites || []).some(
      (c) => c.voie === "Voie de la guérison" && c.rang === 5
    );
    if (!capaciteRang5) return;

    const connus = p.grimoireSortsConnus || [];
    if (connus.includes("resurrection")) return; // déjà migré / déjà appris normalement

    p.grimoireSortsConnus = connus.concat(["resurrection"]);
    window.DepotPersos.sauver(p, id);
    migres++;
    console.log(`Migré : ${p.nom || id} — "resurrection" ajouté au Grimoire (ancien rang 5 Voie de la guérison).`);
  });

  console.log(`Migration terminée : ${migres} personnage(s) migré(s).`);
})();
