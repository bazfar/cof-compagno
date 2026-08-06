/* ============================================================
   COF-COMPAGNO — Fenêtre de réaction (prototype "Contresort").

   Cf. prompt_claude_code_moteur_reaction_contresort.md. Prototype
   volontairement restreint à un événement ("sortLance") et une réaction
   ("contresort") — si la table le trouve praticable, Bouclier arcanique,
   Rempart vivant et les affixes à usage limité s'y brancheront sans
   redesign : cette API n'a aucune connaissance de Contresort en particulier,
   elle ne fait qu'ouvrir/fermer une fenêtre générique.

   État partagé dans SyncStore (clé unique "combat:reaction", sur le patron
   de "combat:initiative" et "combat:resistanceLegendaire", cf. js/
   sauvegardes.js) — PAS en mémoire : la fenêtre doit survivre à un
   rechargement de page (MJ comme joueur). Une seule fenêtre à la fois (cf.
   piège "pas de cascade") : ouvrir() refuse tant qu'une fenêtre existe déjà.

   Forme de l'état (voir prompt) :
   {
     id, evenement: "sortLance", ouverteA: <timestamp>, delaiMs: 15000,
     source: { type: "monstre", id, nom }, sort: { nom, rang, ecole },
     indice, pjId,                    // pour re-préparer le plan en différé
     repondants: [persoId],           // calculé à l'ouverture
     reponse: null | { persoId, action: "contresort" | "passe", reussite? }
   }
   ============================================================ */
const Reactions = (() => {
  "use strict";

  const CLE = "combat:reaction";

  function etat() {
    if (typeof SyncStore === "undefined") return null;
    return SyncStore.get(CLE) || null;
  }

  function estOuverte() {
    return !!etat();
  }

  function estExpiree(e) {
    e = e || etat();
    return !!e && (Date.now() - e.ouverteA >= e.delaiMs);
  }

  // Millisecondes restantes avant expiration (0 si déjà expirée/absente) —
  // recalculé depuis ouverteA/delaiMs à chaque appel, jamais depuis un
  // setTimeout mémorisé, pour rester exact après un rechargement de page.
  function msRestantes(e) {
    e = e || etat();
    if (!e) return 0;
    return Math.max(0, e.delaiMs - (Date.now() - e.ouverteA));
  }

  // Ouvre la fenêtre — refuse si une fenêtre est déjà active (piège "pas de
  // cascade"). `descripteur` porte tout le nécessaire pour reconstituer la
  // résolution en différé (cf. js/app.js, _resoudreFenetreReaction) : evenement,
  // source, sort, indice, pjId, repondants. ouverteA/reponse sont posés ici.
  function ouvrir(descripteur) {
    if (typeof SyncStore === "undefined" || estOuverte()) return false;
    SyncStore.set(CLE, Object.assign({ delaiMs: 15000 }, descripteur, { ouverteA: Date.now(), reponse: null }));
    return true;
  }

  // Un répondant agit (contresort ou passe) — seule la PREMIÈRE réponse est
  // retenue (cf. "fermeture ... dès qu'un répondant a agi") : les suivantes
  // sont refusées, la fenêtre étant de fait déjà en cours de clôture côté MJ.
  function repondre(persoId, action, extra) {
    const e = etat();
    if (!e || e.reponse || !e.repondants.includes(persoId)) return false;
    SyncStore.set(CLE, Object.assign({}, e, { reponse: Object.assign({ persoId, action }, extra || {}) }));
    return true;
  }

  // Ferme la fenêtre. Appelé par le MJ après résolution (timeout, réponse
  // traitée, ou bouton "Clore la fenêtre").
  function clore() {
    if (typeof SyncStore !== "undefined") SyncStore.set(CLE, null);
  }

  function onChange(cb) {
    if (typeof SyncStore === "undefined") return () => {};
    return SyncStore.subscribe(CLE, cb);
  }

  return { CLE, etat, estOuverte, estExpiree, msRestantes, ouvrir, repondre, clore, onChange };
})();

if (typeof window !== "undefined") window.Reactions = Reactions;
