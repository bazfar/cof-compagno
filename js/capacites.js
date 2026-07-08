/* ============================================================
   COF-COMPAGNO — Moteur de résolution des capacités mécanisées.

   Lit le champ rang.mecanique (cf. data/donnees.js, schéma type/usage/
   cible/portee/zone/jetOppose/effets) pour un rang de classe, un rang
   de voie raciale ou une variante elfique, puis :
   - vérifie/décrémente les limites d'usage (perso.usagesCapacites),
   - résout les formules de dés (dégâts/soin), y compris les variables
     "niveau", "rang", "Mod.XXX",
   - applique états (perso.etatsActifs, catalogue js/etats.js) et bonus
     temporaires à la cible choisie,
   - journalise chaque jet dans le journal de dés partagé.

   Dépendances (chargées avant ce fichier dans index.html) :
   - js/etats.js       → ETATS, getEtat
   - js/personnage.js  → Personnage
   - js/app.js         → App.chargerPersos/sauverPersos/lancerDe/ajouterHisto
   - js/carte.js       → Carte.listeMonstresCombat/appliquerDegatsCombat
     (optionnel : une capacité qui ne cible jamais un monstre fonctionne
     même si Carte n'est pas chargé)
   ============================================================ */

const Capacites = (() => {
  "use strict";

  /* ---------- Résolution de formules ("1d8+niveau", "rang+Mod.SAG", "2d6", "Mod.INT") ---------- */

  // ctx = { perso: Personnage, rang: number }
  function resoudreExpression(expr, ctx) {
    ctx = ctx || {};
    if (!expr) return { total: 0, detail: "" };
    const termes = String(expr).replace(/\s/g, "").match(/[+-]?[^+-]+/g) || [];
    let total = 0;
    const details = [];
    termes.forEach((terme) => {
      const negatif = terme.startsWith("-");
      const brut = terme.replace(/^[+-]/, "");
      const de = /^(\d*)d(\d+)$/i.exec(brut);
      const mod = /^Mod\.([A-Za-z]+)$/i.exec(brut);
      let valeur = 0;
      let libelle = brut;
      if (de) {
        const nb = parseInt(de[1] || "1", 10);
        const faces = parseInt(de[2], 10);
        const jets = [];
        for (let i = 0; i < nb; i++) jets.push(App.lancerDe(faces));
        valeur = jets.reduce((a, b) => a + b, 0);
        libelle = `${brut}[${jets.join(",")}]`;
      } else if (mod) {
        valeur = ctx.perso ? ctx.perso.mod(mod[1].toUpperCase()) : 0;
        libelle = `Mod.${mod[1].toUpperCase()}(${valeur >= 0 ? "+" : ""}${valeur})`;
      } else if (/^niveau$/i.test(brut)) {
        valeur = (ctx.perso && ctx.perso.niveau) || 1;
      } else if (/^rang$/i.test(brut)) {
        valeur = ctx.rang || 0;
      } else if (/^\d+$/.test(brut)) {
        valeur = parseInt(brut, 10);
      } else {
        // Terme non reconnu (texte narratif mêlé à une formule, ex. variable
        // non modélisée) : compte pour 0, mais signalé dans le détail affiché.
        libelle = `${brut}(?)`;
      }
      if (negatif) valeur = -valeur;
      total += valeur;
      details.push(`${negatif ? "-" : details.length ? "+" : ""}${libelle}`);
    });
    return { total, detail: details.join(" ") };
  }

  /* ---------- Clé + fréquence d'usage ---------- */

  // source : { origine: "classe"|"race"|"variante", cle, voie, rang, nomCap }
  function cleCapacite(source) {
    if (source.origine === "variante") return `variante:${source.cle}:${source.code}`;
    return `${source.origine}:${source.cle}:${source.voie}:${source.rang}`;
  }

  // "1x/combat" -> {max:1, periode:"combat"} ; "libre" ou vocabulaire libre -> null (pas de limite automatisable)
  function parserFrequence(frequence) {
    const m = /^(\d+)x\/(.+)$/i.exec((frequence || "").trim());
    if (!m) return null;
    return { max: parseInt(m[1], 10), periode: m[2].trim().toLowerCase() };
  }

  // p : objet perso brut (tel que stocké dans la map chargerPersos(), PAS une instance Personnage).
  // Renvoie { ok, raison? , appliquer? } — appeler appliquer() seulement après résolution complète,
  // pour ne pas décompter un usage si un effet plus loin dans la résolution échoue.
  function verifierUsage(p, cle, mecanique) {
    const freq = parserFrequence(mecanique.usage && mecanique.usage.frequence);
    if (!freq) return { ok: true };
    p.usagesCapacites = p.usagesCapacites || {};
    const entree = p.usagesCapacites[cle] || { utilisations: 0, periode: freq.periode };
    if (entree.periode !== freq.periode) { entree.utilisations = 0; entree.periode = freq.periode; }
    if (entree.utilisations >= freq.max) {
      return {
        ok: false,
        raison: `Déjà utilisée ${entree.utilisations}/${freq.max} fois (${freq.periode}). ` +
          `Réinitialise depuis la fiche si une nouvelle période a commencé.`,
      };
    }
    return {
      ok: true,
      appliquer: () => { entree.utilisations++; p.usagesCapacites[cle] = entree; },
    };
  }

  // Remet à zéro le(s) compteur(s) d'usage d'un perso brut — periode omise = tout réinitialiser.
  function reinitialiserUsage(p, cle) {
    if (!p.usagesCapacites) return;
    if (cle) delete p.usagesCapacites[cle];
    else p.usagesCapacites = {};
  }

  /* ---------- Cibles ---------- */

  // Combine les PJ (chargerPersos) et les monstres de la table de combat (Carte)
  // en une liste plate homogène. Le filtrage allié/ennemi est laissé à l'appelant
  // (app.js) : ce moteur ne force pas la véracité du camp, la table reste maître.
  function listeCibles(persoActifId) {
    const cibles = [];
    const persos = App.chargerPersos();
    Object.keys(persos).forEach((id) => {
      const p = persos[id];
      cibles.push({ id, nom: p.nom, genre: "perso", soi: id === persoActifId });
    });
    if (typeof Carte !== "undefined" && Carte.listeMonstresCombat) {
      (Carte.listeMonstresCombat() || []).forEach((m) => {
        cibles.push({ id: m.id, nom: m.nom, genre: "monstre", soi: false });
      });
    }
    return cibles;
  }

  /* ---------- Application des effets ----------
     Toutes les mutations d'un même appel à lancer() se font sur UNE seule
     map `persos` chargée une fois, sauvegardée une seule fois à la fin —
     jamais d'aller-retour chargerPersos()/sauverPersos() intermédiaire, pour
     éviter d'écraser une mutation avec une copie devenue périmée entre deux
     lectures. Les dégâts/soins sur un PJ répliquent ici la même arithmétique
     que app.js (réduction d'armure, clamp 0..pvMax) plutôt que d'appeler les
     fonctions internes de l'IIFE App (qui rechargent/sauvent chacune pour
     leur compte et casseraient cette garantie).

  */

  function appliquerDegatsPersoLocal(pCible, degatsBruts) {
    const perso = Personnage.depuisJSON(pCible);
    const reduction = perso.reductionDegats();
    const degatsNets = Math.max(0, degatsBruts - reduction);
    pCible.pvActuel = Math.max(0, pCible.pvActuel - degatsNets);
    return { reduction, degatsNets, pvActuel: pCible.pvActuel };
  }

  function appliquerSoinPersoLocal(pCible, montant) {
    const avant = pCible.pvActuel;
    pCible.pvActuel = Math.max(0, Math.min(pCible.pvMax, pCible.pvActuel + montant));
    return { gain: pCible.pvActuel - avant };
  }

  // Résout effet.duree (chaîne brute du catalogue) en une valeur canonique
  // exploitable par le tracker de combat (js/combat.js) :
  // - "permanente"/"finCombat"/"24h" -> mot-clé, jamais décompté tour par tour
  //   ("24h" est hors-échelle de tour : ni décompté ni retiré ici, cf. motCle "horsTour") ;
  // - "prochainTour" -> 1 tour ;
  // - toute formule de dés/carac ("3", "3+Mod.CON", "1d4+rang") -> résolue UNE
  //   SEULE FOIS ici (les dés ne sont pas relancés à chaque décompte de tour).
  function resoudreDureeInitiale(dureeExpr, ctx) {
    if (dureeExpr === "permanente") return { tours: null, motCle: "permanente" };
    if (dureeExpr === "finCombat") return { tours: null, motCle: "finCombat" };
    if (dureeExpr === "24h") return { tours: null, motCle: "horsTour" };
    if (dureeExpr === "prochainTour") return { tours: 1, motCle: null };
    const { total } = resoudreExpression(dureeExpr, ctx);
    return { tours: total, motCle: null };
  }

  function appliquerEtatSurPerso(pCible, effet, source, ctx) {
    pCible.etatsActifs = pCible.etatsActifs || [];
    pCible.etatsActifs.push({
      idEtat: effet.id,
      dureeRestante: Object.assign(resoudreDureeInitiale(effet.duree, ctx), { dureeAffichee: effet.duree }),
      source,
      poseLe: Date.now(),
    });
  }

  // valeurResolue : déjà résolue en nombre par l'appelant (resoudreEffet), pour
  // ne calculer/afficher qu'une seule fois une formule comme "Mod.SAG".
  function appliquerBonusSurPerso(pCible, effet, source, ctx, valeurResolue) {
    pCible.etatsActifs = pCible.etatsActifs || [];
    pCible.etatsActifs.push({
      idEtat: null,
      bonus: { cible: effet.cible, valeur: valeurResolue },
      dureeRestante: Object.assign(resoudreDureeInitiale(effet.duree, ctx), { dureeAffichee: effet.duree }),
      source,
      poseLe: Date.now(),
    });
  }

  // Libellé humain d'une entrée etatsActifs (état ou bonus), utilisé pour les
  // toasts/journal de décompte automatique — même logique que htmlEtatsActifs
  // côté app.js.
  function _libelleEtatActif(e) {
    if (e.idEtat) {
      const idCatalogue = /^marquee_.+/.test(e.idEtat) ? "marquee" : e.idEtat;
      const etat = ETATS[idCatalogue];
      return etat ? etat.nom : e.idEtat;
    }
    if (e.bonus) return `Bonus ${e.bonus.cible} ${e.bonus.valeur >= 0 ? "+" : ""}${e.bonus.valeur}`;
    return "État";
  }

  // p : objet perso brut. Décompte de 1 tour tous les etatsActifs à durée
  // numérique (motCle null), retire ceux qui tombent à 0. Ne touche jamais aux
  // entrées motCle "permanente"/"finCombat"/"horsTour". Renvoie les libellés
  // des entrées retirées (pour un toast/journal).
  function decompterEtatsDebutTour(p) {
    const retires = [];
    p.etatsActifs = (p.etatsActifs || []).filter((e) => {
      if (!e.dureeRestante || e.dureeRestante.motCle !== null || typeof e.dureeRestante.tours !== "number") return true;
      e.dureeRestante.tours -= 1;
      if (e.dureeRestante.tours <= 0) {
        retires.push(_libelleEtatActif(e));
        return false;
      }
      return true;
    });
    return retires;
  }

  // Retire uniquement les entrées motCle === "finCombat" (appelé à la fin du combat).
  function retirerEtatsFinCombat(p) {
    p.etatsActifs = (p.etatsActifs || []).filter((e) => !(e.dureeRestante && e.dureeRestante.motCle === "finCombat"));
  }

  // Résout+applique un seul effet de mecanique.effets[]. Renvoie un message
  // texte destiné au joueur (toast) — ne journalise PAS lui-même dans
  // l'historique partagé pour les effets sans jet de dé (etat/bonus/special).
  function resoudreEffet(effet, ctx) {
    const { perso, rang, cible, libelle, persos } = ctx;
    if (effet.type === "degats") {
      const { total, detail } = resoudreExpression(effet.formule, { perso, rang });
      App.ajouterHisto(`${libelle} — Dégâts`, total, false, false, detail);
      if (cible && cible.genre === "monstre" && typeof Carte !== "undefined") {
        const res = Carte.appliquerDegatsCombat(cible.id, total);
        return res
          ? `${total} dégâts (${detail}) → ${res.nom} : ${res.pvActuel} PV restants.`
          : `${total} dégâts (${detail}) — cible introuvable sur la table de combat.`;
      }
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        const res = appliquerDegatsPersoLocal(persos[cible.id], total);
        return `${total} dégâts (${detail}) → ${cible.nom} : -${res.degatsNets} après réduction (${res.reduction}), ${res.pvActuel} PV restants.`;
      }
      return `${total} dégâts (${detail}) — aucune cible sélectionnée, à appliquer manuellement.`;
    }
    if (effet.type === "soin") {
      const { total, detail } = resoudreExpression(effet.formule, { perso, rang });
      App.ajouterHisto(`${libelle} — Soin`, total, false, false, detail);
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        const res = appliquerSoinPersoLocal(persos[cible.id], total);
        return `${total} PV (${detail}) → ${cible.nom} récupère ${res.gain} PV.`;
      }
      return `${total} PV (${detail}) — aucune cible sélectionnée, à appliquer manuellement.`;
    }
    if (effet.type === "etat") {
      const idEtatCatalogue = /^marquee_.+/.test(effet.id) ? "marquee" : effet.id;
      const etat = getEtat(idEtatCatalogue); // lève si inconnu — l'entrée existe forcément (validée par tools/valider_mecaniques.js)
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        appliquerEtatSurPerso(persos[cible.id], effet, libelle, { perso, rang });
        return `État « ${etat.nom} » appliqué à ${cible.nom} (${effet.duree}).`;
      }
      return `État « ${etat.nom} » (${effet.duree}) à appliquer manuellement à ${cible ? cible.nom : "la cible"} (pas de suivi d'état automatique pour les monstres).`;
    }
    if (effet.type === "bonus") {
      // effet.valeur peut être un nombre fixe ("2") ou une formule ("Mod.SAG") :
      // résolue une seule fois ici (dés éventuels non relancés), réutilisée pour
      // le message ET le stockage (cf. appliquerBonusSurPerso).
      const { total: valeurResolue } = resoudreExpression(effet.valeur, { perso, rang });
      if (effet.duree === "permanente") {
        return `Bonus permanent (${effet.cible} ${valeurResolue >= 0 ? "+" : ""}${valeurResolue}) — normalement fixé une fois pour toutes à l'acquisition de la capacité, pas à relancer ici.`;
      }
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        appliquerBonusSurPerso(persos[cible.id], effet, libelle, { perso, rang }, valeurResolue);
        return `Bonus (${effet.cible} ${valeurResolue >= 0 ? "+" : ""}${valeurResolue}, ${effet.duree}) appliqué à ${cible.nom}.`;
      }
      return `Bonus (${effet.cible} ${valeurResolue >= 0 ? "+" : ""}${valeurResolue}, ${effet.duree}) — aucune cible sélectionnée, à appliquer manuellement.`;
    }
    if (effet.type === "special") {
      return `ℹ️ ${effet.note}`;
    }
    return null;
  }

  /* ---------- Point d'entrée ---------- */

  // { persoId, source, mecanique, cibleId? }
  // source : { origine: "classe"|"race"|"variante", cle, voie?, rang?, code?, nomCap }
  function lancer({ persoId, source, mecanique, cibleId }) {
    if (!mecanique || mecanique.type === "passive") {
      return { ok: false, messages: ["Cette capacité est passive : rien à lancer."] };
    }

    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return { ok: false, messages: ["Personnage introuvable."] };
    const perso = Personnage.depuisJSON(p);
    const libelle = source.nomCap || "Capacité";

    const cle = cleCapacite(source);
    const usage = verifierUsage(p, cle, mecanique);
    if (!usage.ok) return { ok: false, messages: [usage.raison] };

    let cible = null;
    if (cibleId) {
      cible = listeCibles(persoId).find((c) => c.id === cibleId) || null;
    } else if (mecanique.cible === "soi") {
      cible = { id: persoId, nom: p.nom, genre: "perso", soi: true };
    }

    const messages = [];

    if (mecanique.jetOppose) {
      const ca = mecanique.jetOppose.caracAttaquant;
      let bonus = 0;
      if (ca === "attaqueMagique") bonus = perso.bonusAttaque("magique") || 0;
      else if (ca === "attaqueContact") bonus = perso.bonusAttaque("contact");
      else if (ca === "attaqueDistance") bonus = perso.bonusAttaque("distance");
      else if (ca) bonus = perso.mod(ca.replace(/^Mod\./i, "").toUpperCase());
      const d20 = App.lancerDe(20);
      const total = d20 + bonus;
      App.ajouterHisto(`${libelle} — Jet d'attaque`, total, d20 === 20, d20 === 1, `d20[${d20}] ${bonus >= 0 ? "+" : ""}${bonus}`);
      messages.push(`Jet d'attaque : ${total} (d20 ${d20} ${bonus >= 0 ? "+" : ""}${bonus}) — à comparer à la défense/DD de la cible.`);
    }

    (mecanique.effets || []).forEach((effet) => {
      const msg = resoudreEffet(effet, { perso, rang: source.rang, cible, libelle, persos });
      if (msg) messages.push(msg);
    });

    usage.appliquer && usage.appliquer();
    App.sauverPersos(persos);

    return { ok: true, messages };
  }

  return {
    resoudreExpression,
    resoudreDureeInitiale,
    decompterEtatsDebutTour,
    retirerEtatsFinCombat,
    cleCapacite,
    parserFrequence,
    verifierUsage,
    reinitialiserUsage,
    listeCibles,
    lancer,
  };
})();

if (typeof window !== "undefined") window.Capacites = Capacites;
