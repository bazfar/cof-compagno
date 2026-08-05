/* ============================================================
   COF-COMPAGNO — Résolution des capacités actives de monstres.

   Pourquoi un module séparé : js/capacites.js ne pose un état que sur un PJ
   (cf. appliquerEtatSurPerso, non exporté) et suppose une fiche Personnage
   partout — un monstre n'a qu'un jeton et un modèle de bestiaire. Plutôt que
   de dupliquer ce moteur, on consomme son API publique (verifierUsage,
   parserFrequence) et on laisse js/app.js appliquer.

   Ce module ne touche ni au DOM ni au stockage : il PRÉPARE un plan d'actions
   que l'appelant exécute. C'est ce qui permet de le tester sans navigateur, et
   d'éviter que la pose d'un état sur un PJ contourne les gardes d'immunité
   déjà portées par appliquerMalus (Liberté d'action du Barde).

   Cf. schema_cible_capacites_monstres.md.
   ============================================================ */

const CapacitesMonstres = (() => {
  "use strict";

  // Clé de compteur d'usage, stockée dans jeton.usagesCapacites par
  // Capacites.verifierUsage — même convention que cleCapacite côté PJ.
  function cleCapacite(monstreId, indice) {
    return `monstre:${monstreId}:${indice}`;
  }

  // Le jeton posé sur la carte ne porte que l'état de combat : la définition
  // des capacités vit dans le modèle de bestiaire.
  function capacitesDe(jeton) {
    if (jeton && Array.isArray(jeton.capacitesActives)) return jeton.capacitesActives;
    if (typeof BESTIAIRE_INDEX === "undefined" || !jeton) return [];
    const modele = BESTIAIRE_INDEX[jeton.monstreId];
    return (modele && modele.capacitesActives) || [];
  }

  function modeleDe(jeton) {
    if (typeof BESTIAIRE_INDEX === "undefined" || !jeton) return null;
    return BESTIAIRE_INDEX[jeton.monstreId] || null;
  }

  /* ---------- Immunités ---------- */

  // Renvoie { bloquee, condition } pour un état donné sur un monstre.
  // bloquee = true  -> refuser la pose (immunité pleine).
  // condition != null -> immunité conditionnelle : avertir, laisser passer.
  //   Aucun code ne sait si la peur en cours vient d'un sort ou d'une gueule
  //   ouverte, ni compter les alliés adjacents — c'est au MJ de trancher.
  function immunite(jeton, idEtat) {
    const modele = modeleDe(jeton);
    if (!modele) return { bloquee: false, condition: null };
    const id = /^marquee_.+/.test(idEtat) ? "marquee" : idEtat;
    if ((modele.immunites || []).some((x) => (/^marquee_.+/.test(x) ? "marquee" : x) === id)) {
      return { bloquee: true, condition: null };
    }
    const cond = (modele.immunitesConditionnelles || []).find((ic) => (ic.etats || []).includes(idEtat));
    return { bloquee: false, condition: cond ? cond.condition : null };
  }

  /* ---------- Préparation ---------- */

  // Renvoie { ok, raison?, capacite, mecanique, plan[], appliquerUsage() }.
  // Le plan est une liste d'actions à exécuter par l'appelant :
  //   { action: "degats", formule, elementaire, surReussite }
  //   { action: "soin",   formule }
  //   { action: "etat",   idEtat, duree }
  //   { action: "bonus",  cible, valeur, duree }
  //   { action: "retraitEtat" }
  //   { action: "note",   texte }
  // appliquerUsage() n'est appelée qu'une fois le plan entièrement exécuté,
  // pour ne pas consommer un usage sur une résolution interrompue — même
  // précaution que Capacites.verifierUsage côté PJ.
  function preparer(jeton, indice) {
    const capacites = capacitesDe(jeton);
    const capacite = capacites[indice];
    if (!capacite) return { ok: false, raison: "Capacité introuvable." };

    const mecanique = capacite.mecanique;
    if (!mecanique) {
      return {
        ok: true, capacite, mecanique: null,
        plan: [{ action: "note", texte: capacite.description }],
        appliquerUsage: () => {},
      };
    }

    let appliquerUsage = () => {};
    if (typeof Capacites !== "undefined" && Capacites.verifierUsage) {
      const usage = Capacites.verifierUsage(jeton, cleCapacite(jeton.monstreId || jeton.id, indice), mecanique);
      if (!usage.ok) return { ok: false, raison: usage.raison, capacite, mecanique };
      if (usage.appliquer) appliquerUsage = usage.appliquer;
    }

    const plan = [];
    (mecanique.effets || []).forEach((e) => {
      if (e.type === "degats") plan.push({ action: "degats", formule: e.formule, elementaire: e.elementaire || null, surReussite: e.surReussite || null });
      else if (e.type === "soin") plan.push({ action: "soin", formule: e.formule });
      else if (e.type === "etat") plan.push({ action: "etat", idEtat: e.id, duree: e.duree || null });
      else if (e.type === "bonus") plan.push({ action: "bonus", cible: e.cible, valeur: e.valeur, duree: e.duree || null });
      else if (e.type === "retraitEtat") plan.push({ action: "retraitEtat" });
      else if (e.type === "special") plan.push({ action: "note", texte: e.note });
    });

    return { ok: true, capacite, mecanique, plan, appliquerUsage };
  }

  // Libellé compact pour l'entête du bouton : « 1x/combat · zone 12 m · SAG 15 ».
  function resume(mecanique) {
    if (!mecanique) return "";
    const bouts = [];
    const freq = mecanique.usage && mecanique.usage.frequence;
    if (freq && freq !== "libre") bouts.push(freq === "1x/recharge" ? `recharge ${mecanique.recharge || "?"} rounds` : freq);
    if (mecanique.actionBonus) bouts.push("action bonus");
    if (mecanique.reactionCout) bouts.push("réaction");
    if (mecanique.zone) bouts.push(`zone ${mecanique.zone} m`);
    else if (Number.isInteger(mecanique.portee)) bouts.push(`${mecanique.portee} m`);
    else if (mecanique.portee) bouts.push(mecanique.portee);
    if (mecanique.jetAttaque !== undefined) bouts.push(`1d20+${mecanique.jetAttaque} vs DEF`);
    if (mecanique.jetSauvegardeFixe) bouts.push(`${mecanique.jetSauvegardeFixe.carac} ${mecanique.jetSauvegardeFixe.dd}`);
    return bouts.join(" · ");
  }

  return { cleCapacite, capacitesDe, immunite, preparer, resume };
})();

if (typeof window !== "undefined") window.CapacitesMonstres = CapacitesMonstres;
