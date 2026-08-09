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

  // ctx = { perso: Personnage, rang: number, critique?: boolean }. critique
  // (cf. liaison attaque->dégâts) relance et additionne une SECONDE fois
  // chaque terme de dés "NdF" (mais pas Mod.XXX/niveau/rang/constantes),
  // conformément à la règle "critique = dés doublés, pas les modificateurs" —
  // ex. "1d8+niveau" en critique donne 1d8[x]+1d8[y]+niveau, pas 2×(1d8+niveau).
  function resoudreExpression(expr, ctx) {
    ctx = ctx || {};
    if (!expr) return { total: 0, detail: "" };
    const critique = !!ctx.critique;
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
        // Collier de la Dette du Soigneur (data/loot.json: collier_dette_soigneur) :
        // le sort de soin du porteur soigne sa valeur MAX sans jet de dés — cf.
        // resoudreEffet("soin") ci-dessous, seul appelant qui passe forcerMax.
        let jets = [];
        if (ctx.forcerMax) {
          valeur = nb * faces;
          libelle = `${brut}[max]`;
        } else {
          for (let i = 0; i < nb; i++) jets.push(App.lancerDe(faces));
          valeur = jets.reduce((a, b) => a + b, 0);
          libelle = `${brut}[${jets.join(",")}]`;
        }
        if (!ctx.forcerMax && critique) {
          const jets2 = [];
          for (let i = 0; i < nb; i++) jets2.push(App.lancerDe(faces));
          valeur += jets2.reduce((a, b) => a + b, 0);
          libelle = `${brut}[${jets.join(",")}]+${brut}[${jets2.join(",")}]`;
        }
      } else if (mod) {
        valeur = ctx.perso ? ctx.perso.mod(mod[1].toUpperCase()) : 0;
        libelle = `Mod.${mod[1].toUpperCase()}(${valeur >= 0 ? "+" : ""}${valeur})`;
      } else if (/^niveau$/i.test(brut)) {
        valeur = (ctx.perso && ctx.perso.niveau) || 1;
      } else if (/^floor\(niveau\/2\)$/i.test(brut)) {
        // Enchanteur — Voie du chaos, rang 2 "Drain d'âme" : seul terme du
        // jeu à utiliser une syntaxe floor(...) — reconnu ici spécifiquement
        // plutôt que d'ajouter un vrai évaluateur d'expressions générique
        // (hors de portée d'un simple terme de formule).
        valeur = Math.floor(((ctx.perso && ctx.perso.niveau) || 1) / 2);
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

  // Remet à zéro tous les compteurs d'usage d'une PÉRIODE donnée (ex. "tour"),
  // toutes capacités confondues — appelée par Combat.tourSuivant() (cf.
  // _reinitialiserActionsEntree) à chaque fois qu'un PJ redevient actif.
  // Corrige un gap générique : jusqu'ici, aucune capacité "1x/tour" (Guerrier
  // Posture de combat, Chevalier Voie du commandant rang 2...) n'était
  // remise à zéro automatiquement — seul un bouton manuel "Réinitialiser"
  // sur la fiche existait (cf. reinitialiserUsage ci-dessus). Contrairement à
  // reinitialiserUsage, ne supprime pas les clés : remet juste utilisations
  // à 0 pour celles dont la période enregistrée correspond.
  function reinitialiserUsagesPeriode(p, periode) {
    if (!p.usagesCapacites) return;
    Object.keys(p.usagesCapacites).forEach((cle) => {
      const entree = p.usagesCapacites[cle];
      if (entree && entree.periode === periode) entree.utilisations = 0;
    });
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

  // DEF numérique d'une cible (issue de listeCibles), ou null si indisponible
  // — sert à déterminer touché/raté pour les capacités d'attaque vs DEF (cf.
  // lancer()). PJ : recalculée via Personnage.calculerCA() (jamais stockée
  // telle quelle, contrairement aux monstres). Monstre : lit le champ `def`
  // du token (Carte.listeMonstresCombat()) — peut être `null` si le bestiaire
  // ne le renseigne pas (cf. js/carte.js), traité ici comme "DEF inconnue".
  function obtenirDefCible(cible, persos) {
    if (!cible) return null;
    if (cible.genre === "perso") {
      const p = persos[cible.id];
      return p ? Personnage.depuisJSON(p).calculerCA() + bonusDefAuraPeuple(cible.id) + bonusDefGardeRapprochee(cible.id) : null;
    }
    if (cible.genre === "monstre" && typeof Carte !== "undefined" && Carte.listeMonstresCombat) {
      const tok = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
      return tok && typeof tok.def === "number" ? tok.def : null;
    }
    return null;
  }

  // Enchanteur — Voie de l'enchantement, rang 2 "Fascination" (jetOppose.
  // caracDefenseurCalcule === "DEF+PVactuels/2", cf. lancer()) : seuil à
  // battre = DEF de la cible + moitié de ses PV ACTUELS (pas une simple DEF)
  // — même principe qu'obtenirDefCible ci-dessus (PJ recalculé via
  // calculerCA(), monstre lu depuis le token), plus l'ajout de floor(PV/2).
  function obtenirDefPlusPvMoitieCible(cible, persos) {
    if (!cible) return null;
    if (cible.genre === "perso") {
      const p = persos[cible.id];
      if (!p) return null;
      const perso = Personnage.depuisJSON(p);
      return perso.calculerCA() + Math.floor((p.pvActuel || 0) / 2);
    }
    if (cible.genre === "monstre" && typeof Carte !== "undefined" && Carte.listeMonstresCombat) {
      const tok = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
      if (!tok || typeof tok.def !== "number") return null;
      return tok.def + Math.floor((tok.pvActuel ?? tok.pvMax ?? 0) / 2);
    }
    return null;
  }

  // Défense mentale (Volonté), opposée aux sorts mentaux (jetOppose.
  // caracDefenseur === "defMentale" : Fascination, Sommeil, Domination,
  // Terreur...). Les monstres n'ont aucune carac mentale dans le bestiaire :
  //   PJ      → 10 + Mod.SAG (vraie sauvegarde de Volonté) ;
  //   monstre → defMentale explicite si fournie, sinon DÉRIVÉE de la
  //             dangerosité (10 + dangerosité) — proxy raisonnable et gratuit.
  // Évite que la DEF (armure) serve de défense mentale (un monstre blindé mais
  // bête résistait à tort à la Domination).
  function obtenirVolonteCible(cible, persos) {
    if (!cible) return null;
    if (cible.genre === "perso") {
      const p = persos[cible.id];
      return p ? 10 + Personnage.depuisJSON(p).mod("SAG") : null;
    }
    if (cible.genre === "monstre" && typeof Carte !== "undefined" && Carte.listeMonstresCombat) {
      const tok = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
      if (!tok) return null;
      const base = (typeof BESTIAIRE_INDEX !== "undefined" && tok.monstreId) ? BESTIAIRE_INDEX[tok.monstreId] : null;
      const dm = tok.defMentale != null ? tok.defMentale : (base && base.defMentale != null ? base.defMentale : null);
      if (dm != null) return dm;
      const dang = tok.dangerosite != null ? tok.dangerosite : (base && base.dangerosite != null ? base.dangerosite : 1);
      return 10 + dang;
    }
    return null;
  }

  // Bonus de l'ATTAQUANT dans un jetOppose — extrait du bloc historique
  // vs DEF pour être réutilisé tel quel par la branche réactive
  // (_resoudreSauvegardeReactive) sans dupliquer/diverger le calcul.
  // N'inclut PAS typeAttaque (seuil de critique) : ce n'est pertinent que
  // pour la résolution touché/critique vs DEF, jamais pour un DD de
  // sauvegarde, qui n'a pas de notion de critique côté lanceur.
  function _bonusAttaquantJetOppose(perso, jetOppose) {
    const ca = jetOppose && jetOppose.caracAttaquant;
    if (ca === "attaqueMagique") return perso.bonusAttaque("magique") || 0;
    if (ca === "attaqueContact") return perso.bonusAttaque("contact");
    if (ca === "attaqueDistance") return perso.bonusAttaque("distance");
    // Moine — Voie de l'élévation, rang 3 : test de Perception (SAG + comp.) vs DEF.
    if (ca === "Perception") return perso.modCompetence("Perception", "SAG");
    if (ca) return perso.mod(ca.replace(/^Mod\./i, "").toUpperCase());
    return 0;
  }

  // Résolution d'une sauvegarde réactive. Renvoie { reussite, echecCritique,
  // dd, modCible, messages }. modCible === null signale un modificateur
  // introuvable : l'appelant ne doit alors PAS gater d'effet, le DD est affiché
  // et la table tranche (même politique que defCible === null côté attaque).
  function _resoudreSauvegardeReactive({ perso, persos, cible, mecanique, nomSauvegarde, libelle, source, groupeJetId }) {
    const messages = [];
    const libelleSauv = (typeof Sauvegardes !== "undefined" && Sauvegardes.LIBELLES[nomSauvegarde]) || nomSauvegarde;
    // "moitie" (cf. lancer(), branche réactive) : une réussite n'annule pas
    // les dégâts, elle les divise par deux — le libellé "aucun effet" serait
    // trompeur pour ces sorts.
    const suffixeReussite = mecanique.jetOppose.modeSauvegarde === "moitie" ? "dégâts pour moitié" : "aucun effet";

    // Bonus du lanceur : REPRIS du bloc jetOppose existant (cf.
    // _bonusAttaquantJetOppose ci-dessus) plutôt que d'en écrire un second
    // qui divergerait.
    const bonusLanceur = _bonusAttaquantJetOppose(perso, mecanique.jetOppose);
    const dd = (mecanique.jetOppose.difficulteFixe != null)
      ? mecanique.jetOppose.difficulteFixe
      : DD_SAUVEGARDE_BASE + bonusLanceur;

    // Modificateur de la cible : PJ via Personnage.modSauvegarde, monstre via
    // la dérivation de js/sauvegardes.js (le bestiaire n'a aucune carac).
    let modCible = null;
    let tokMonstre = null;
    if (cible && cible.genre === "perso" && persos[cible.id]) {
      modCible = Personnage.depuisJSON(persos[cible.id]).modSauvegarde(nomSauvegarde);
    } else if (cible && cible.genre === "monstre" && typeof Carte !== "undefined" && Carte.listeMonstresCombat) {
      tokMonstre = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id) || null;
      if (tokMonstre && typeof Sauvegardes !== "undefined") {
        modCible = Sauvegardes.modMonstre(tokMonstre, nomSauvegarde);
      }
    }

    if (modCible === null) {
      messages.push(`Sauvegarde de ${libelleSauv} — DD ${dd}. Modificateur de ${cible ? cible.nom : "la cible"} inconnu : à résoudre par la table.`);
      return { reussite: true, echecCritique: false, dd, modCible: null, messages };
    }

    const d20 = App.lancerDe(20);
    const total = d20 + modCible;
    // 20 naturel = réussite automatique (contrepartie exacte du « 1 naturel du
    // lanceur = échec critique » de l'ancien pipeline d'attaque).
    // 1 naturel = échec critique : effet appliqué ET dégâts doublés.
    const reussiteAuto = d20 === 20;
    const echecCritique = d20 === 1;
    let reussite = reussiteAuto || (!echecCritique && total >= dd);

    App.ajouterHisto(`${libelle} — Sauvegarde de ${cible.nom} (${libelleSauv})`, total, reussiteAuto, echecCritique,
      `d20[${d20}] ${modCible >= 0 ? "+" : ""}${modCible} vs DD ${dd}`, { groupeJetId });

    // Résistance légendaire : APRÈS le jet, y compris sur un 1 naturel — c'est
    // précisément le cas où elle sauve la mise du boss.
    if (!reussite && tokMonstre && typeof Sauvegardes !== "undefined" && Sauvegardes.consommer(tokMonstre)) {
      const restant = Sauvegardes.restant(tokMonstre);
      messages.push(`Sauvegarde de ${cible.nom} (${libelleSauv}) : ${total} vs DD ${dd} — échec, mais RÉSISTANCE LÉGENDAIRE : converti en réussite (${restant} usage${restant > 1 ? "s" : ""} restant${restant > 1 ? "s" : ""}), ${suffixeReussite}.`);
      return { reussite: true, echecCritique: false, dd, modCible, messages };
    }

    if (reussiteAuto) {
      messages.push(`Sauvegarde de ${cible.nom} (${libelleSauv}) : 20 naturel — réussite automatique, ${suffixeReussite}.`);
    } else if (echecCritique) {
      messages.push(`Sauvegarde de ${cible.nom} (${libelleSauv}) : 1 naturel — ÉCHEC CRITIQUE, effet appliqué et dégâts doublés.`);
    } else {
      messages.push(`Sauvegarde de ${cible.nom} (${libelleSauv}) : ${total} (d20[${d20}] ${modCible >= 0 ? "+" : ""}${modCible}) vs DD ${dd} — ${reussite ? `réussie, ${suffixeReussite}.` : "échec."}`);
    }
    return { reussite, echecCritique, dd, modCible, messages };
  }

  // Guerrier — Voie du peuple, rang 2 "L'exemple" (passive) : +1 DEF à tout PJ
  // à 2 cases (cf. Carte.distanceCasesEntre) d'un Guerrier possédant ce rang,
  // tant que ce Guerrier reste immobile ce tour (Combat.estImmobile, même
  // mécanique que Chasseur "Camouflage naturel"). Dépend d'AUTRES personnages
  // (contrairement aux bonus DEF de Personnage.calculerCA(), auto-contenus à
  // `this`) : vit ici plutôt que dans personnage.js, et doit être appelé à la
  // fois par obtenirDefCible() ci-dessus (résolution d'attaque) ET par app.js
  // (affichage de la fiche), pour ne jamais désynchroniser la DEF affichée de
  // la DEF réellement opposée à une attaque. Pas de cumul si plusieurs
  // Guerriers qualifient à la fois (+1 fixe, pas +1 par Guerrier).
  function bonusDefAuraPeuple(persoId) {
    if (typeof Carte === "undefined" || !Carte.tokenIdPourPerso || !Carte.listeTokensJoueursCombat ||
        !Carte.distanceCasesEntre || !Carte.idPersoDepuisRef) return 0;
    if (typeof Combat === "undefined" || !Combat.estImmobile) return 0;
    const monToken = Carte.tokenIdPourPerso(persoId);
    if (!monToken) return 0;
    const persos = App.chargerPersos();
    const qualifie = (Carte.listeTokensJoueursCombat() || []).some((t) => {
      if (t.id === monToken || !t.ref) return false;
      const guerrierId = Carte.idPersoDepuisRef(t.ref);
      const pg = persos[guerrierId];
      if (!pg) return false;
      const guerrier = Personnage.depuisJSON(pg);
      if (!(guerrier.classe === "guerrier" && guerrier.estChoisie("Voie du peuple", 2))) return false;
      const d = Carte.distanceCasesEntre(t.id, monToken);
      return d !== null && d <= 2 && Combat.estImmobile(guerrierId);
    });
    return qualifie ? 1 : 0;
  }

  // Chevalier — Voie du protecteur, rang 1 "Garde rapprochée" (passive) : un
  // allié au contact (distance <= 1 case) d'un Chevalier ayant ce rang gagne
  // +2 CA fixe — remplace l'ancien "Bouclier partagé" (partage du bonusDEF du
  // bouclier équipé), retiré (validé avec Thomas) : plus de dépendance à un
  // bouclier réellement équipé, cf. le texte du nouveau rang ("tout allié
  // adjacent qualifie", pas de désignation explicite d'un protégé unique —
  // même simplification que bonusDefAuraPeuple). Même schéma que
  // bonusDefAuraPeuple ci-dessus (dépend d'un AUTRE personnage, vit ici
  // plutôt que dans personnage.js — appelé à la fois par obtenirDefCible() et
  // par app.js/_defPjAvecAura à l'affichage). Pas de cumul si plusieurs
  // Chevaliers qualifient à la fois : bonus fixe, pas de somme.
  function bonusDefGardeRapprochee(persoId) {
    if (typeof Carte === "undefined" || !Carte.tokenIdPourPerso || !Carte.listeTokensJoueursCombat ||
        !Carte.distanceCasesEntre || !Carte.idPersoDepuisRef) return 0;
    const monToken = Carte.tokenIdPourPerso(persoId);
    if (!monToken) return 0;
    const persos = App.chargerPersos();
    const qualifie = (Carte.listeTokensJoueursCombat() || []).some((t) => {
      if (t.id === monToken || !t.ref) return false;
      const chevalierId = Carte.idPersoDepuisRef(t.ref);
      const pc = persos[chevalierId];
      if (!pc) return false;
      const chevalier = Personnage.depuisJSON(pc);
      if (!(chevalier.classe === "chevalier" && chevalier.estChoisie("Voie du protecteur", 1))) return false;
      const d = Carte.distanceCasesEntre(t.id, monToken);
      return d !== null && d <= 1;
    });
    return qualifie ? 2 : 0;
  }

  // Guerrier — Voie du chaos, rang 3/5 "Rage incontrôlée"/"Déchaînement" (cf.
  // mecanique.testVolonte) : cible forcée en cas d'échec du test de Volonté —
  // la créature la plus proche du lanceur sur la table de combat active, PJ
  // ou monstre confondu ("allié compris", texte d'origine), tie-break
  // aléatoire en cas d'égalité de distance. null hors battlemap dd2vtt (pas
  // de distance en cases) ou si aucune autre créature n'a de token posé.
  function cibleCreaturePlusProche(persoId) {
    if (typeof Carte === "undefined" || !Carte.tokenIdPourPerso || !Carte.listeMonstresCombat ||
        !Carte.listeTokensJoueursCombat || !Carte.distanceCasesEntre) return null;
    const monToken = Carte.tokenIdPourPerso(persoId);
    if (!monToken) return null;
    const autres = (Carte.listeMonstresCombat() || [])
      .concat((Carte.listeTokensJoueursCombat() || []).filter((t) => t.id !== monToken));
    let minDist = Infinity;
    let candidats = [];
    autres.forEach((t) => {
      const d = Carte.distanceCasesEntre(monToken, t.id);
      if (d === null) return;
      if (d < minDist) { minDist = d; candidats = [t]; }
      else if (d === minDist) candidats.push(t);
    });
    return candidats.length ? candidats[Math.floor(Math.random() * candidats.length)] : null;
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

  // Détecte le tableau 'race' (tags) d'une cible MONSTRE via le champ
  // ajouté par Thomas sur les entrées du bestiaire (data/bestiaire.js,
  // BESTIAIRE_INDEX) — jamais copié sur le token en jeu (contrairement à
  // pv/def/armure), donc relu ici via tok.monstreId à chaque résolution
  // plutôt que mis en cache. [] pour une cible PJ (this.race sur un
  // Personnage est une race JOUEUR, sans rapport) ou un token hors-bestiaire
  // (monstreId absent/inconnu) — jamais null, pour éviter un check .length
  // partout chez les appelants.
  function _raceMonstreCible(cible) {
    if (!cible || cible.genre !== "monstre" || typeof Carte === "undefined" || !Carte.listeMonstresCombat) return [];
    const tok = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
    const entree = tok && tok.monstreId && typeof BESTIAIRE_INDEX !== "undefined" && BESTIAIRE_INDEX[tok.monstreId];
    return (entree && Array.isArray(entree.race)) ? entree.race : [];
  }

  // Moine — Voie de l'ascétisme rang 2 "Poing béni" ; Chevalier — Voie du
  // paladin rang 5 "Sentence finale" (et toute future capacité "doublé si
  // mort-vivant/démon/corrompu") — critère large (inclut 'corrompu').
  function _cibleEstMortVivantDemonCorrompu(cible) {
    const race = _raceMonstreCible(cible);
    return race.includes("mort-vivant") || race.includes("démon") || race.includes("corrompu");
  }

  // Prêtre — Voie de l'exorcisme rang 1 "Symbole sacré" (et toute future
  // capacité réservée aux mêmes cibles) — critère plus étroit que ci-dessus
  // (n'inclut PAS 'corrompu', le texte source ne parle que de démoniaque/
  // morte-vivante).
  function _cibleEstDemonOuMortVivant(cible) {
    const race = _raceMonstreCible(cible);
    return race.includes("mort-vivant") || race.includes("démon");
  }

  // Prêtre — Cercle du Bannissement, sorts "Bannissement"/"Bannissement de
  // zone" : dangerosité de la cible (champ 'dangerosite' du bestiaire, cf.
  // data/bestiaire.json), même patron de lookup que _raceMonstreCible. null
  // pour une cible PJ ou hors-bestiaire (jamais une dangerosité valide).
  function _dangerositeCible(cible) {
    if (!cible || cible.genre !== "monstre" || typeof Carte === "undefined" || !Carte.listeMonstresCombat) return null;
    const tok = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
    const entree = tok && tok.monstreId && typeof BESTIAIRE_INDEX !== "undefined" && BESTIAIRE_INDEX[tok.monstreId];
    return (entree && typeof entree.dangerosite === "number") ? entree.dangerosite : null;
  }
  // DD par dangerosité (barème donné par Thomas, dangerosité 4 interpolée
  // entre 3 et 5, non confirmée explicitement) — null si hors barème (>5 ou
  // inconnue), auquel cas le Bannissement échoue automatiquement.
  function _ddBannissement(dangerosite) {
    if (dangerosite == null || dangerosite > 5) return null;
    if (dangerosite <= 2) return 14;
    if (dangerosite === 3) return 16;
    if (dangerosite === 4) return 17;
    return 18; // dangerosite === 5
  }

  // Table de mutation Palier 1 (data/mutations.js, fournie par Thomas) : au
  // moins 7 capacités rang 3 de "Voie du chaos", toutes classes confondues,
  // déclenchent un jet forcé sur cette table (indépendamment du palier de
  // Corruption d'Âme réellement atteint) sur un jet d'attaque exceptionnel.
  // Le seuil de déclenchement diffère selon le texte propre à chaque
  // capacité (pas le seuil de critique de l'arme, ex. Aiguisé) :
  // "critique" = critique standard (seuil d'arme, toujours vrai sur 20
  // naturel) ; "naturel18"/"naturel19" = seuil fixe propre au texte,
  // indépendant de l'arme ; "echecCritique" = 1 naturel (Prêtre "Peste
  // rampante" : "échec catastrophique du lanceur", pas une réussite).
  // Chasseur "Hurlement du prédateur" (même rang, même voie) est exclu :
  // mecanique.jetOppose === null, donc aucun jet de dé n'existe à observer —
  // reste manuel, cf. sa note de donnée.
  const MUTATION_PALIER1_TRIGGERS = {
    barde: "critique", pretre: "echecCritique", necromancien: "naturel18",
    enchanteur: "critique", chevalier: "naturel19", magicien: "naturel18",
  };
  function _rollMutationPalier1(p, libelle) {
    if (typeof TABLE_MUTATIONS === "undefined" || !p) return "";
    const table = TABLE_MUTATIONS[1];
    const d6 = App.lancerDe(6);
    const entree = table.mutations.find((m) => m.d6 === d6);
    App.ajouterHisto(`${libelle} — Mutation (Palier 1, ${table.nom})`, d6, false, false, `d6[${d6}]`);
    p.mutations = p.mutations || [];
    p.mutations.push({ id: "mut" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      palier: 1, d6, nom: entree.nom, effet: entree.effet, obtenueLe: Date.now() });
    return ` 🧬 Mutation déclenchée (Palier 1) : ${entree.nom} — ${entree.effet}.`;
  }

  // Nécromancien — Voie du sang, rangs 1/3/5 (Morsure du sang : moitié ;
  // Vol de vitalité/Étreinte exsangue : intégralité) : vol de vie, soigne le
  // LANCEUR d'une fraction des dégâts RÉELLEMENT infligés (après réduction/
  // armure, degatsNets) — mécanique propre au résultat du jet, sans
  // jugement narratif. Regroupe aussi ici deux mécaniques de la même voie,
  // déclenchées par le même événement (une attaque de cette voie a touché) :
  // - rang 2 "Régénération sanguine" : pose un drapeau consommé par
  //   Capacites.decompterEtatsDebutTour au tour SUIVANT (1d4 PV si le drapeau
  //   est resté true, cf. son commentaire) — posé ici quelle que soit
  //   l'acquisition du rang 2, sans effet s'il n'est jamais lu.
  // - rang 4 "Sang impie" : si la cible est réduite à 0 PV (pvApres), régénère
  //   immédiatement 2d6 PV bonus — condition désormais vérifiable (PV connus
  //   après résolution), remplace l'ancienne capacité à activer manuellement.
  function _appliquerVolDeVie(persos, perso, rang, degatsNets, pvApres) {
    let note = "";
    const fraction = rang === 1 ? 0.5 : 1;
    const gain = Math.floor(degatsNets * fraction);
    const pCaster = persos[perso.id];
    if (gain > 0 && pCaster) {
      const res = appliquerSoinPersoLocal(pCaster, gain);
      note += ` Vol de vie : ${perso.nom} récupère ${res.gain} PV.`;
    }
    if (pCaster) pCaster.aInfligeDegatsSang = true;
    if (pCaster && typeof pvApres === "number" && pvApres <= 0 && perso.rangMaxVoie("Voie du sang") >= 4) {
      const { total: bonus, detail } = resoudreExpression("2d6", { perso, rang });
      const res = appliquerSoinPersoLocal(pCaster, bonus);
      note += ` Sang impie : cible réduite à 0 PV, ${perso.nom} régénère ${res.gain} PV bonus (${detail}).`;
    }
    return note;
  }

  // Enchanteur — Voie du chaos, rang 2 "Drain d'âme" : récupère en PP un
  // montant égal aux dégâts RÉELLEMENT infligés (degatsNets, pas la formule
  // brute) — même principe que _appliquerVolDeVie ci-dessus mais en PP
  // plutôt qu'en PV, plafonné au ppMax du lanceur (pas de perte si le gain
  // dépasserait le max, simple plafonnement comme un soin sur des PV pleins).
  function _appliquerGainPPDrainAme(persos, perso, degatsNets) {
    const pCaster = persos[perso.id];
    if (!(degatsNets > 0) || !pCaster) return "";
    const ppMax = perso.calculerPPMax();
    const avant = pCaster.ppActuel || 0;
    pCaster.ppActuel = Math.min(ppMax, avant + degatsNets);
    const gainReel = pCaster.ppActuel - avant;
    return gainReel > 0 ? ` Drain d'âme : ${perso.nom} récupère ${gainReel} PP (${pCaster.ppActuel}/${ppMax}).` : "";
  }

  // Chasseur — Voie de la grande chasse rang 4 "Coup de grâce" (condition
  // "cible sous 50% PV") : PV actuels/max d'une cible PJ ou monstre, ou null
  // si indéterminable (ex. monstre hors table de combat) — ne jamais bloquer
  // sur une valeur inconnue, cf. l'appelant.
  function _pvActuelEtMax(cible, persos) {
    if (!cible) return null;
    if (cible.genre === "perso") {
      const p = persos[cible.id];
      return p ? { actuel: p.pvActuel || 0, max: p.pvMax || 0 } : null;
    }
    if (cible.genre === "monstre" && typeof Carte !== "undefined" && Carte.listeMonstresCombat) {
      const tok = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
      return tok ? { actuel: tok.pvActuel ?? tok.pvMax ?? 0, max: tok.pvMax || 0 } : null;
    }
    return null;
  }

  // Double le nombre de dés d'une formule de dégâts simple ("1d6" -> "2d6"),
  // même convention que le doublement sur critique (resoudreExpression) —
  // ne gère qu'un terme de dé en tête de formule, suffisant pour les 2
  // capacités qui l'utilisent (formules à un seul terme, sans modificateur).
  function _doublerFormuleDegats(formule) {
    return formule.replace(/^(\d*)d(\d+)/, (_, nb, faces) => `${parseInt(nb || "1", 10) * 2}d${faces}`);
  }

  // Prêtre — Voie du chaos rang 4 "Corruption persistante" (dès CA 5+) : les
  // soins REÇUS par la cible sont réduits de moitié (arrondi inf.), quelle
  // que soit la source — même règle qu'app.js/soigner(), seul autre point
  // d'application d'un soin à un PJ. Délègue à Personnage.appliquerGainPv
  // (point d'application unique de tout gain de PV, cf. sa doc) qui gère
  // aussi la Dette du Soigneur (data/loot.json: collier_dette_soigneur) —
  // hérité gratuitement ici par le vol de vie/Sang impie, seuls autres
  // appelants de cette fonction.
  function appliquerSoinPersoLocal(pCible, montant) {
    return Personnage.appliquerGainPv(pCible, montant);
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
    // "maintenue" (Enchanteur — Voie de l'enchantement rang 2 "Fascination",
    // cf. effet.coutMaintienPP) : jamais décompté tour par tour (comme
    // "permanente"/"finCombat"), se termine par le hook de maintien PP de
    // Combat._reinitialiserActionsEntree (PP insuffisants -> état retiré) ou
    // par la fin du combat (cf. ETATS_RETIRES_FIN_COMBAT_MEME_SI_NUMERIQUE).
    if (dureeExpr === "maintenue") return { tours: null, motCle: "maintenue" };
    const { total } = resoudreExpression(dureeExpr, ctx);
    return { tours: total, motCle: null };
  }

  // effet.formuleDot (optionnel, ex. "1d4") : dégâts infligés à chaque tour
  // de la cible tant que l'état dure (cf. decompterEtatsDebutTour) — la
  // formule brute est stockée telle quelle, pas résolue ici, pour relancer
  // les dés à chaque tick plutôt que de figer un total unique à la pose.
  // extra (optionnel) : champs additionnels fusionnés dans l'entrée poussée
  // — ex. { carac: "FOR" } pour Guerrier "Apogée physique" (cf. resoudreEffet),
  // dont l'état doit se souvenir de QUELLE caractéristique doubler, une
  // information dynamique (choisie par le joueur à un autre rang) qui ne
  // peut pas être fixée dans data/donnees.js comme formuleDot l'est.
  function appliquerEtatSurPerso(pCible, effet, source, ctx, extra) {
    pCible.etatsActifs = pCible.etatsActifs || [];
    pCible.etatsActifs.push(Object.assign({
      idEtat: effet.id,
      dureeRestante: Object.assign(resoudreDureeInitiale(effet.duree, ctx), { dureeAffichee: effet.duree }),
      formuleDot: effet.formuleDot || null,
      formuleSoin: effet.formuleSoin || null,
      // coutMaintienPP (Enchanteur — Voie de l'enchantement rang 2
      // "Fascination") : coût en PP déduit à chaque début de tour du
      // personnage qui maintient l'effet, cf. Combat._reinitialiserActionsEntree.
      // extra peut le surcharger (rang 4 "Proficience", cf. resoudreEffet).
      coutMaintienPP: effet.coutMaintienPP || null,
      source,
      poseLe: Date.now(),
    }, extra || {}));
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

  // Moine — Voie de l'ascétisme, rang 3 "Jeûne purificateur" (et toute
  // future capacité de "purge") : retire UN SEUL état actif de catégorie non
  // "buff" (le plus ancien posé), simplifié (validé avec Thomas) par rapport
  // au texte d'origine ("purge un effet néfaste (poison, maladie, peur,
  // charme)") — l'app n'a pas de sous-catégorie poison/maladie séparée,
  // "un malus présent" est traité comme n'importe quel état non-buff actif.
  // Nouveau type d'effet générique 'retraitEtat' (cf. resoudreEffet), premier
  // du genre — réutilisable par d'autres capacités de soin/purge à venir.
  function _retirerUnMalus(pCible) {
    const liste = pCible.etatsActifs || [];
    const idx = liste.findIndex((e) => {
      if (!e.idEtat) return false; // entrée "bonus" pure (pas d'état nommé), jamais ciblée par une purge
      const idCatalogue = /^marquee_.+/.test(e.idEtat) ? "marquee" : e.idEtat;
      const def = ETATS[idCatalogue];
      return def && def.categorie !== "buff";
    });
    if (idx === -1) return null;
    return liste.splice(idx, 1)[0];
  }

  // Magicien — Voie de la magie sauvage (mini-système à 5 rangs) : rang 1
  // "Mutation Sauvage" applique un modificateur aléatoire 2d4-4 (-2 à +4) à
  // CHAQUE sort offensif (tout effet 'degats', cf. son appel dans
  // resoudreEffet). Les rangs 2/4/5 modifient ce jet via des drapeaux
  // 1x/combat ou 1x/jour posés par leurs propres capacités (lancer(),
  // identifiées par voie+rang) et consommés ici une seule fois — lus/effacés
  // directement sur le perso BRUT (persos[perso.id]), jamais sur la copie
  // Personnage passée en lecture seule à resoudreEffet. Rang 2 "Instinct
  // Chaotique" : le texte source dit "relancez et gardez le nouveau résultat",
  // mais un vrai reroll RÉACTIF (après avoir vu un mauvais jet) impliquerait
  // de rejouer une résolution de dégâts déjà appliquée — hors de portée du
  // pipeline actuel (lancer() est une passe unique). Simplifié (à valider
  // avec Thomas) en avantage PROACTIF : active avant le prochain sort, roule
  // deux fois, garde le meilleur. Rang 3 "Canalisation Profonde" (jet +3/+4)
  // reste un choix narratif signalé dans le message, jamais appliqué
  // automatiquement (comme Trio élémentaire/Cataclysme élémentaire, même
  // principe des "3 options au choix").
  function _rollMutationSauvage(persos, perso, rang, libelle) {
    const pRaw = persos[perso.id];
    let modif;
    let note = "";
    if (pRaw && pRaw.maitriseChaosGarantieActif) {
      modif = 4;
      pRaw.maitriseChaosGarantieActif = false;
      note = " (Maîtrise du Chaos : +4 garanti, sans jet)";
    } else {
      const jet = () => App.lancerDe(4) + App.lancerDe(4) - 4;
      if (pRaw && pRaw.instinctChaotiqueActif) {
        const a = jet(), b = jet();
        modif = Math.max(a, b);
        pRaw.instinctChaotiqueActif = false;
        note = ` (Instinct Chaotique : ${a} / ${b}, meilleur gardé)`;
      } else {
        modif = jet();
      }
    }
    let doublage = false;
    if (pRaw && pRaw.submersionArcaniqueActif) {
      modif *= 2;
      doublage = true;
      pRaw.submersionArcaniqueActif = false;
      note += " (Submersion Arcanique : modificateur doublé)";
    }
    if (perso.rangMaxVoie("Voie de la magie sauvage") >= 3 && modif >= 3) {
      note += " — Canalisation Profonde : effet mineur au choix (repousse 1,5 m / embrase légèrement / Aveuglée 1 tour), à appliquer manuellement.";
    }
    if (doublage && modif < 0 && pRaw) {
      const { total: dmgSelf, detail: detailSelf } = resoudreExpression("1d4", { perso, rang });
      appliquerDegatsPersoLocal(pRaw, dmgSelf);
      appliquerEtatSurPerso(pRaw, { id: "etourdie", duree: "1" }, libelle, { perso, rang });
      note += ` — contrecoup : ${dmgSelf} DM (${detailSelf}) + Étourdie au lanceur.`;
    } else if (doublage && modif > 0) {
      note += " — effet spectaculaire (au choix/appréciation du MJ).";
    }
    return { modif, note };
  }

  // PV temporaires (Guerrier Cri du rassemblement, Druide Rempart vivant/
  // Forme du chaos sauvage) : JAMAIS cumulatifs — une nouvelle application
  // n'écrase le total existant que si elle est strictement plus élevée
  // (contrairement aux etatsActifs "bonus", qui s'additionnent tous). Champ
  // dédié sur le perso brut (p.pvTemporaires/p.pvTemporairesExpiration),
  // pas une entrée etatsActifs de plus : la sémantique "remplace, ne
  // s'additionne pas" ne correspond à aucun des deux mécanismes existants
  // (etat/bonus). Consommés en priorité par subirDegats côté app.js, avant
  // pvActuel. Renvoie { montant, remplace } pour le message de resoudreEffet.
  function appliquerPvTemporairesSurPerso(pCible, montant, dureeExpr, ctx) {
    const actuel = pCible.pvTemporaires || 0;
    const remplace = montant > actuel;
    if (remplace) {
      pCible.pvTemporaires = montant;
      pCible.pvTemporairesExpiration = resoudreDureeInitiale(dureeExpr, ctx);
    }
    return { montant: pCible.pvTemporaires, remplace };
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

  // p : objet perso brut. Ne touche jamais aux entrées motCle "permanente"/
  // "finCombat"/"horsTour". Pour toute autre entrée (motCle null) portant une
  // formuleDot (ex. "maudite"/"empoisonnee" posée avec un DOT, mécanisée OU
  // posée à la main par le MJ via la modale Malus), relance la formule à CE
  // tick et applique les dégâts à p.pvActuel (clampé à 0, sans réduction
  // d'armure — un DOT magique/malédiction n'est pas de l'armure physique) —
  // le tick a lieu tant que l'état est actif ce tour, y compris le dernier
  // tour avant expiration. Symétrique pour formuleSoin (ex. Druide "Sanctuaire
  // du gardien") : même tick, mais soigne p.pvActuel (plafonné à pvMax) au
  // lieu d'infliger des dégâts. Décompte ensuite 1 tour et retire l'entrée à
  // 0 UNIQUEMENT si dureeRestante.tours est numérique (mécanisée) ; les
  // entrées à durée libre (texte, ex. "3 tours" posé par le MJ) tickent donc
  // indéfiniment mais restent à retirer manuellement via ✕. Pas
  // d'automatisation du jet de résistance "CON pour moitié" mentionné par
  // certaines capacités : reste un ajustement manuel de table, comme le
  // reste des nuances non chiffrées par le schéma standard.
  // Renvoie { retires, degats, testsVolonte, soins } : libellés des entrées
  // retirées, détail des dégâts de DOT et des soins de HOT infligés à ce
  // tick, et résultats des tests de Volonté par tour (pour un toast/journal).
  function decompterEtatsDebutTour(p) {
    const retires = [];
    const degats = [];
    const testsVolonte = [];
    const soins = [];
    // Régénération sanguine (Nécromancien, Voie du sang rang 2) : le flag
    // p.aInfligeDegatsSang est posé par _appliquerVolDeVie dès qu'une capacité
    // de la Voie du sang inflige des dégâts (tour précédent) — consommé ici,
    // au tour suivant, pour régénérer 1d4 PV automatiquement.
    if (p.aInfligeDegatsSang) {
      const perso = Personnage.depuisJSON(p);
      if (perso.classe === "necromancien" && perso.rangMaxVoie("Voie du sang") >= 2) {
        const { total, detail } = resoudreExpression("1d4", {});
        Personnage.appliquerGainPv(p, total);
        soins.push({ libelle: "Régénération sanguine", total, detail, pvApres: p.pvActuel });
      }
      p.aInfligeDegatsSang = false;
    }
    p.etatsActifs = (p.etatsActifs || []).filter((e) => {
      if (!e.dureeRestante || e.dureeRestante.motCle !== null) return true;
      // Durée libre (posée par le MJ via la modale Malus, ex. "3 tours" en
      // texte — cf. app.js _entreeMalusMj) : formuleDot/testVolonte tickent
      // quand même chaque tour, mais dureeRestante.tours n'étant pas
      // numérique, aucun décompte/retrait automatique — reste manuel via ✕,
      // comme documenté ci-dessus.
      const dureeNumerique = typeof e.dureeRestante.tours === "number";
      if (e.formuleDot) {
        const { total, detail } = resoudreExpression(e.formuleDot, {});
        p.pvActuel = Math.max(0, (p.pvActuel || 0) - total);
        degats.push({ libelle: _libelleEtatActif(e), total, detail, pvApres: p.pvActuel });
      }
      // Soin par tick, symétrique de formuleDot ci-dessus (ex. Druide
      // "Sanctuaire du gardien", Voie du protecteur rang 5 : "régénèrent
      // 1d4 PV/tour") — même tick de début de tour, mais soigne au lieu
      // d'infliger des dégâts. Plafonné à pvMax comme tout autre soin.
      if (e.formuleSoin) {
        const { total, detail } = resoudreExpression(e.formuleSoin, {});
        Personnage.appliquerGainPv(p, total);
        soins.push({ libelle: _libelleEtatActif(e), total, detail, pvApres: p.pvActuel });
      }
      // Test de Volonté par tour (ex. Guerrier "Déchaînement" — e.testVolonte
      // porté par l'entrée elle-même, cf. resoudreEffet/appliquerEtatSurPerso
      // ci-dessus) : contrairement à mecanique.testVolonte (une seule fois, à
      // l'activation, cf. lancer()), re-testé à CHAQUE tick tant que l'état
      // reste actif. Même limite que le reste des redirections non
      // modélisées : la cible forcée est calculée et nommée, son application
      // reste manuelle.
      if (e.testVolonte) {
        const { carac, difficulteFixe } = e.testVolonte;
        const perso = Personnage.depuisJSON(p);
        const modCarac = perso.mod(carac);
        const d20v = App.lancerDe(20);
        const totalV = d20v + modCarac;
        const reussite = totalV >= difficulteFixe;
        const forcee = reussite ? null : cibleCreaturePlusProche(p.id);
        testsVolonte.push({
          libelle: _libelleEtatActif(e), carac, totalV, difficulteFixe, reussite,
          cibleForcee: forcee ? forcee.nom : null,
        });
      }
      if (!dureeNumerique) return true;
      e.dureeRestante.tours -= 1;
      if (e.dureeRestante.tours <= 0) {
        retires.push(_libelleEtatActif(e));
        return false;
      }
      return true;
    });
    // PV temporaires : décomptés séparément des etatsActifs (champ dédié,
    // cf. appliquerPvTemporairesSurPerso) — expirent avec leur propre durée,
    // le reliquat non consommé par des dégâts est simplement perdu.
    if (p.pvTemporairesExpiration && p.pvTemporairesExpiration.motCle === null
        && typeof p.pvTemporairesExpiration.tours === "number") {
      p.pvTemporairesExpiration.tours -= 1;
      if (p.pvTemporairesExpiration.tours <= 0) {
        if (p.pvTemporaires) retires.push(`${p.pvTemporaires} PV temporaires (expirés)`);
        p.pvTemporaires = 0;
        p.pvTemporairesExpiration = null;
      }
    }
    return { retires, degats, testsVolonte, soins };
  }

  // Retire les entrées motCle === "finCombat", PLUS toute entrée dont l'idEtat
  // est listé ci-dessous (durée numérique normale par ailleurs — décomptée
  // tour par tour comme n'importe quel autre état — mais qui doit aussi
  // disparaître immédiatement si le combat se termine avant l'expiration de
  // cette durée). Appelé à la fin du combat. Tous les états ci-dessous sont
  // des formes/transformations/buffs qui n'ont de sens qu'EN combat (audit
  // "incohérences similaires à Image décalée" demandé par Thomas) : sans ce
  // filet, un combat qui se termine avant l'expiration du minuteur laisserait
  // le buff actif jusqu'au combat suivant.
  // - image_decalee (Enchanteur, Voie de l'enchantement r1)
  // - maitrise_tactique (Guerrier, Voie du soldat r5)
  // - apogee_physique (Guerrier, Voie de l'élite r5, 1x/combat)
  // - dechainement (Guerrier, Voie du chaos r5, 1x/scénario)
  // - avatar_du_chaos (Nécromancien, Voie du chaos r5, 1x/scénario)
  // - avatar_du_pacte (Chevalier, Voie du chaos r5, 1x/scénario)
  // - avatar_du_vide (Magicien, Voie du chaos r5, 1x/scénario)
  // - forme_chaos_sauvage (Druide, Voie du chaos r5, 1x/scénario)
  // - totem_velocite (Druide, Voie du shaman r4)
  // - forme_ours / forme_loup (Druide, Voie des compagnons r5 "Forme animale")
  // - sanctuaire_gardien (Druide, Voie du protecteur r5, 1x/scénario)
  // - sanctuaire_magicien (Magicien, Voie de la magie protectrice r5, 1x/scénario)
  // - arme_enchantee (Enchanteur, Voie de la transfiguration r3)
  // - fascinee_illusoire (Enchanteur, Voie de l'enchantement r2, motCle
  //   "maintenue" plutôt que numérique — mais la liste ci-dessous ne filtre
  //   que par idEtat, motCle importe peu : même besoin de nettoyage fin de
  //   combat qu'un état numérique "qui n'a de sens qu'en combat")
  const ETATS_RETIRES_FIN_COMBAT_MEME_SI_NUMERIQUE = [
    "image_decalee", "maitrise_tactique", "apogee_physique", "dechainement",
    "avatar_du_chaos", "avatar_du_pacte", "avatar_du_vide", "forme_chaos_sauvage",
    "totem_velocite", "forme_ours", "forme_loup", "sanctuaire_gardien",
    "sanctuaire_magicien", "arme_enchantee", "fascinee_illusoire", "ascension_chaotique",
  ];
  function retirerEtatsFinCombat(p) {
    p.etatsActifs = (p.etatsActifs || []).filter((e) =>
      !(e.dureeRestante && e.dureeRestante.motCle === "finCombat") &&
      !ETATS_RETIRES_FIN_COMBAT_MEME_SI_NUMERIQUE.includes(e.idEtat));
  }

  /* ---------- Voie du chaos (homebrew) : jauge de corruption de combat -------
     Chaque classe a une "Voie du chaos" (voie.speciale === true, cf. données)
     avec sa propre jauge (CF/CS/CP selon la classe) et un palier "Corruption
     d'Âme" (CA) commun. Seuls les rangs dont le texte décrit un gain NET et
     univoque à l'usage (ex. "+1 CS") portent un champ rang.mecanique.corruption
     — volontairement absent des déclencheurs passifs hors bouton "Lancer"
     (ex. Guerrier/Chasseur rang 1, déclenchés par les dégâts encaissés/portés,
     pas par un clic), des "coûts" qui financent une AUTRE capacité (la famille
     "Don corrompu"/"Étreinte du Vide"/rang 2 générique) et des poussées
     optionnelles (Druide rang 1) : ces cas restent au jugement de la table via
     l'ajustement manuel ci-dessous (ajusterCorruptionCombat), comme le reste
     des mécaniques de jauge déjà marquées "non trackée par le schéma standard"
     dans les données. */
  const SEUIL_CORRUPTION_MAJEURE = 6;

  // Pool générique de réactions par personnage, remis à zéro par
  // Combat.terminerCombat() (comme corruptionCombat) — cf. mecanique.reactionCout
  // dans lancer(). Plusieurs capacités de classes différentes peuvent piocher
  // dans ce même pool ; rien de spécifique au Guerrier dans ce compteur.
  const REACTIONS_MAX = 3;

  // Nécromancien — Voie des âmes : réceptacle d'âmes stockées (p.amesStockees,
  // 0 à 3, cf. mecanique.ameGain/ameCout dans lancer() ci-dessous). Pas remis
  // à zéro par Combat.terminerCombat (contrairement à corruptionCombat/
  // reactionsUtilisees) : les âmes stockées persistent d'un combat à l'autre,
  // conformément au texte ("réceptacle").
  const AMES_MAX = 3;

  // Sauvegardes réactives (04/08/2026) : DD passif opposé au jet de la cible.
  // 12 préserve à l'unité près les probabilités de l'ancien modèle defMentale
  // (cf. prompt_sauvegardes_phaseB_moteur.md §1). Seule constante à ajuster si
  // la calibration se révèle trop dure en jeu.
  const DD_SAUVEGARDE_BASE = 12;

  // Moine — Voie des éléments, rang 4 "Fusion élémentaire" (1x/combat) :
  // table des 6 combos de paires fournie par Thomas, lue par lancer() selon
  // le choix fait à l'activation (choixEffet, ex. "feu_glace") — substituée
  // dans mecanique.effets AVANT le bloc jetOppose générique, qui déroule
  // ensuite normalement (attaque au contact vs DEF, résolution différée
  // degats/etat comme toute autre capacité). Les entrées "bonus" portent
  // differe:true : sans lui, resoudreDegatsEnAttente() les ignorerait (seuls
  // degats/etat sont différés par défaut, cf. TYPES_EFFETS_DIFFERES).
  const FUSIONS_ELEMENTAIRES_MOINE = {
    feu_glace: { nom: "Choc thermique (Vapeur)", effets: [
      { type: "degats", formule: "1d6", elementaire: null },
      { type: "special", note: "-2 DEF à toute créature adjacente à la cible (vapeur brûlante) — effet de zone secondaire non modélisé (géométrie non automatisée pour ce cas), à appliquer manuellement." } ] },
    feu_terre: { nom: "Éruption (Magma)", effets: [
      { type: "degats", formule: "1d6", elementaire: null },
      { type: "etat", id: "etourdie", duree: "1" } ] },
    feu_air: { nom: "Tempête de braises", effets: [
      { type: "degats", formule: "1d6", elementaire: null },
      { type: "bonus", cible: "attaque", valeur: -2, duree: "1", differe: true } ] },
    glace_terre: { nom: "Permafrost", effets: [
      { type: "etat", id: "gelee", duree: "1" },
      { type: "bonus", cible: "DEF", valeur: -4, duree: "1", differe: true },
      { type: "etat", id: "etourdie", duree: "1" } ] },
    glace_air: { nom: "Blizzard", effets: [
      { type: "etat", id: "gelee", duree: "1" },
      { type: "bonus", cible: "DEF", valeur: -4, duree: "1", differe: true },
      { type: "bonus", cible: "attaque", valeur: -2, duree: "1", differe: true } ] },
    terre_air: { nom: "Tempête de sable", effets: [
      { type: "etat", id: "etourdie", duree: "1" },
      { type: "bonus", cible: "attaque", valeur: -2, duree: "1", differe: true } ] },
  };

  // Druide — Voie des compagnons, rang 5 "Forme animale" : le texte d'origine
  // ("transformation complète, stats remplacées par celles de l'animal")
  // n'a pas d'équivalent dans le moteur (pas de stat-block alternatif pour
  // un PJ) — modélisé à la place (validé avec Thomas) comme un buff temporaire
  // à choisir à l'activation entre deux profils, même principe que
  // FUSIONS_ELEMENTAIRES_MOINE ci-dessus : "ours" (tank — DEF, PV temp,
  // réduction de dégâts, dégâts de griffes) et "loup" (dex/crit — DEF plus
  // modeste, Initiative, déplacement, seuil de critique abaissé, dégâts de
  // crocs). Durée 5+Mod.SAG tours, alignée sur Masque du prédateur (même
  // classe/voie, rang 4).
  const FORMES_ANIMALES_DRUIDE = {
    ours: { nom: "Ours (tank)", effets: [
      { type: "bonus", cible: "DEF", valeur: 4, duree: "5+Mod.SAG" },
      { type: "pvTemp", formule: "2d6", duree: "5+Mod.SAG" },
      { type: "bonus", cible: "degats", valeur: "1d6", duree: "5+Mod.SAG" },
      { type: "etat", id: "forme_ours", duree: "5+Mod.SAG" } ] },
    loup: { nom: "Loup (dex/crit)", effets: [
      { type: "bonus", cible: "DEF", valeur: 2, duree: "5+Mod.SAG" },
      { type: "bonus", cible: "initiative", valeur: "Mod.DEX", duree: "5+Mod.SAG" },
      { type: "bonus", cible: "degats", valeur: "1d4", duree: "5+Mod.SAG" },
      { type: "etat", id: "forme_loup", duree: "5+Mod.SAG" } ] },
  };

  // Mute p.corruptionMajeure une seule fois par combat (corruptionSeuilFranchi,
  // remis à false par Combat.terminerCombat) quand la jauge dépasse le seuil —
  // rester au-dessus ne la fait pas grimper indéfiniment dans le même combat.
  function _verifierSeuilCorruptionMajeure(p) {
    if (p.corruptionCombat > SEUIL_CORRUPTION_MAJEURE && !p.corruptionSeuilFranchi) {
      p.corruptionSeuilFranchi = true;
      p.corruptionMajeure = (p.corruptionMajeure || 0) + 1;
      return true;
    }
    return false;
  }

  // Ajustement manuel (MJ ou joueur) de la jauge de combat — ex. déclencheurs
  // passifs non automatisables, corrections de table. Pas de journalisation
  // dans l'historique partagé (comme les boutons de PV), juste la jauge et le
  // seuil. Renvoie true si ce réglage vient de faire franchir le seuil majeur.
  function ajusterCorruptionCombat(p, delta) {
    p.corruptionCombat = Math.max(0, (p.corruptionCombat || 0) + delta);
    return _verifierSeuilCorruptionMajeure(p);
  }

  // Résout+applique un seul effet de mecanique.effets[]. Renvoie un message
  // texte destiné au joueur (toast) — ne journalise PAS lui-même dans
  // l'historique partagé pour les effets sans jet de dé (etat/bonus/special).
  function resoudreEffet(effet, ctx) {
    const { perso, rang, voie, cible, libelle, persos, critique, multiplicateurDegats, groupeJetId } = ctx;
    if (effet.type === "degats") {
      // critique (cf. liaison attaque->dégâts, lancer()/resoudreDegatsEnAttente)
      // double les termes de dés de la formule, pas les modificateurs fixes.
      // Nécromancien/Magicien — Voie du chaos rang 4 (Symbiose du chaos /
      // Esprit fissuré, choix "degats", dès CA 5+) : +1d6 DM à TOUS les sorts,
      // cf. Personnage.bonusDegatsSortsChaos() — toutes leurs capacités
      // "degats" sont des sorts, pas besoin de distinguer par voie/rang.
      // Prêtre — Réprimande divine (Cercle de la Foi) / Flamme sacrée (Cercle
      // du Bannissement) : formule alternative si la cible est démoniaque ou
      // morte-vivante (cf. _cibleEstDemonOuMortVivant, champ 'race' du
      // bestiaire) — factorisé en un seul point plutôt que dupliqué (cf.
      // prompt_pretre_cercle_bannissement.md).
      const baseFormule = (effet.formuleAlternative && _cibleEstDemonOuMortVivant(cible))
        ? effet.formuleAlternative.formule : effet.formule;
      const bonusChaos = perso.bonusDegatsSortsChaos && perso.bonusDegatsSortsChaos();
      let formuleAjustee = bonusChaos ? `${baseFormule}+${bonusChaos}` : baseFormule;
      // Prêtre — Voie du chaos, rang 5 "Le fléau, c'est moi !" (et toute
      // future capacité "bonus"/cible:"degats") : bonusTemporaire("degats")
      // n'était lu jusqu'ici que par les 3 sites app.js qui construisent
      // dmgContact (attaque rapide au contact) — jamais par la résolution de
      // dégâts d'un sort/capacité via Capacites.lancer(). Ajouté ici pour que
      // "vos attaques (sorts ET attaque rapide) infligent +X" s'applique
      // réellement aux deux, pas seulement aux attaques rapides.
      const bonusDegatsTemp = perso.bonusTemporaire && perso.bonusTemporaire("degats");
      if (bonusDegatsTemp) formuleAjustee = `${formuleAjustee}+${bonusDegatsTemp}`;
      // Enchanteur — Voie de l'enchantement, rang 5 "Illusion vivante" : +1d6
      // dégâts magiques par illusion liée encore vivante (jusqu'à 2), cf.
      // Personnage.bonusDegatsMagiquesIllusionsLiees() — s'applique à tout
      // sort à dégâts de l'Enchanteur, même canal que bonusChaos ci-dessus.
      const nbIllusionsLiees = perso.bonusDegatsMagiquesIllusionsLiees && perso.bonusDegatsMagiquesIllusionsLiees();
      if (nbIllusionsLiees) formuleAjustee = `${formuleAjustee}+${nbIllusionsLiees}d6`;
      // Moine — Voie des éléments, rang 2 "Maîtrise élémentaire" (passive) :
      // même principe qu'Intensité élémentaire ci-dessus, remplace le 1d4
      // initial de l'option Feu de Poing élémentaire (rang 1, seule option
      // des 4 représentée par un effet "degats") par un 1d6 dès que le rang 2
      // est acquis.
      if (voie === "Voie des éléments" && rang === 1 && perso.classe === "moine"
          && perso.rangMaxVoie("Voie des éléments") >= 2 && /^1d4\b/.test(formuleAjustee)) {
        formuleAjustee = formuleAjustee.replace(/^1d4/, "1d6");
      }
      // Moine — Voie des poings : si un élément actif (Poing élémentaire,
      // Voie des éléments rang 1, posé via son propre cas particulier dans
      // lancer()) est présent sur le lanceur, applique son effet secondaire
      // à CETTE attaque à mains nues touchée. Feu ajoute des dégâts à la
      // formule (déjà upgradée 1d4→1d6 par Maîtrise élémentaire ci-dessus,
      // indépendant de ce bloc) ; Glace/Terre/Air posent respectivement
      // Gelée/Renversée/-2 attaque sur la cible, résolu via un second appel
      // à resoudreEffet (même message standard "à appliquer manuellement"
      // pour un monstre que n'importe quel autre etat/bonus du jeu).
      let noteElementActif = "";
      if (perso.classe === "moine" && voie === "Voie des poings") {
        const etatElement = (perso.etatsActifs || []).find((e) => e.idEtat === "element_actif");
        const element = etatElement && etatElement.element;
        if (element === "feu") {
          formuleAjustee = `${formuleAjustee}+${perso.rangMaxVoie("Voie des éléments") >= 2 ? "1d6" : "1d4"}`;
        } else if (element === "glace") {
          noteElementActif = " " + (resoudreEffet({ type: "etat", id: "gelee", duree: "1" }, { perso, rang, voie, cible, libelle, persos }) || "");
        } else if (element === "terre") {
          noteElementActif = " " + (resoudreEffet({ type: "etat", id: "renversee", duree: "1" }, { perso, rang, voie, cible, libelle, persos }) || "");
        } else if (element === "air") {
          noteElementActif = " " + (resoudreEffet({ type: "bonus", cible: "attaque", valeur: -2, duree: "1" }, { perso, rang, voie, cible, libelle, persos }) || "");
        }
      }
      // Moine — Voie de l'ascétisme rang 2 "Poing béni" ; Chevalier — Voie du
      // paladin rang 5 "Sentence finale" : dégâts doublés si la cible est
      // mort-vivante/démoniaque/corrompue (cf. _cibleEstMortVivantDemonCorrompu,
      // champ 'race' du bestiaire ajouté par Thomas). Ne couvre pas
      // "Illumination du juste" (Moine rang 5, même voie) : cible "zone" SANS
      // jetOppose, donc jamais de cibleId résolu (cf. app.js) — reste manuel.
      let noteTypeCreature = "";
      if (((voie === "Voie de l'ascétisme" && rang === 2 && perso.classe === "moine") ||
           (voie === "Voie du paladin (justicier)" && rang === 5 && perso.classe === "chevalier")) &&
          _cibleEstMortVivantDemonCorrompu(cible)) {
        formuleAjustee = _doublerFormuleDegats(formuleAjustee);
        noteTypeCreature = " (dégâts doublés : cible morte-vivante/démoniaque/corrompue)";
      }
      // Magicien — Voie de la magie sauvage, rang 1 "Mutation Sauvage" :
      // s'applique à TOUT sort offensif du Magicien (cf. _rollMutationSauvage),
      // pas seulement aux capacités de cette voie.
      let noteMutationSauvage = "";
      if (perso.classe === "magicien" && perso.rangMaxVoie("Voie de la magie sauvage") >= 1) {
        const { modif, note } = _rollMutationSauvage(persos, perso, rang, libelle);
        formuleAjustee = `${formuleAjustee}${modif >= 0 ? "+" : ""}${modif}`;
        noteMutationSauvage = ` [Mutation Sauvage : ${modif >= 0 ? "+" : ""}${modif}${note}]`;
      }
      const { total: totalBrutSauv, detail: detailBrutSauv } = resoudreExpression(formuleAjustee, { perso, rang, critique });
      // multiplicateurDegats (sauvegarde réactive "moitie", cf. lancer() —
      // branche réactive) : 0.5 sur une sauvegarde réussie, jamais posé
      // (undefined -> 1) pour tout le reste des capacités à dégâts.
      const total = (typeof multiplicateurDegats === "number" && multiplicateurDegats !== 1)
        ? Math.floor(totalBrutSauv * multiplicateurDegats) : totalBrutSauv;
      const detail = (typeof multiplicateurDegats === "number" && multiplicateurDegats !== 1)
        ? `${detailBrutSauv} → ${total} (moitié, sauvegarde réussie)` : detailBrutSauv;
      App.ajouterHisto(`${libelle} — Dégâts`, total, false, false, detail, { groupeJetId });
      // Chasseur — Voie de la grande chasse, rang 5 "Trophée ultime" :
      // ignore la moitié de la RD (armure) de la cible pour CETTE attaque —
      // calcul dédié (PAS Carte.appliquerDegatsCombat/appliquerDegatsPersoLocal,
      // qui appliquent toujours la réduction complète) : PV nets calculés
      // manuellement puis écrits directement (Carte.definirPvCombat / mutation
      // directe de pvActuel pour un PJ).
      if (perso.classe === "chasseur" && voie === "Voie de la grande chasse" && rang === 5) {
        if (cible && cible.genre === "monstre" && typeof Carte !== "undefined" && Carte.listeMonstresCombat && Carte.definirPvCombat) {
          const tok = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
          if (!tok) return `${total} dégâts (${detail}) — cible introuvable sur la table de combat.`;
          const reduction = Math.floor((tok.armure || 0) / 2);
          const degatsNets = Math.max(0, total - reduction);
          const pvApres = Math.max(0, (tok.pvActuel ?? tok.pvMax ?? 0) - degatsNets);
          Carte.definirPvCombat(cible.id, pvApres);
          return `${total} dégâts (${detail}) → ${tok.nom} : -${degatsNets} après demi-RD (${reduction}), ${pvApres} PV restants.`;
        }
        if (cible && cible.genre === "perso" && persos[cible.id]) {
          const pCible = persos[cible.id];
          const reduction = Math.floor(Personnage.depuisJSON(pCible).reductionDegats() / 2);
          const degatsNets = Math.max(0, total - reduction);
          pCible.pvActuel = Math.max(0, (pCible.pvActuel || 0) - degatsNets);
          return `${total} dégâts (${detail}) → ${cible.nom} : -${degatsNets} après demi-RD (${reduction}), ${pCible.pvActuel} PV restants.`;
        }
        return `${total} dégâts (${detail}) — aucune cible sélectionnée, à appliquer manuellement.`;
      }
      // Barde — Voie de la rapière, rang 5 "Botte mortelle" : ignore 2 points
      // fixes de RD (armure) de la cible — même calcul dédié que Trophée
      // ultime du Chasseur ci-dessus (RD-2 au lieu de RD/2), PAS
      // Carte.appliquerDegatsCombat/appliquerDegatsPersoLocal (réduction
      // complète). Le bonus "+2d6 si cible déjà affaiblie" reste manuel (pas
      // de suivi d'état créature pour un monstre, même limite documentée
      // ailleurs) — cette formule "2d6" est déjà le bonus, appliqué tel quel.
      if (perso.classe === "barde" && voie === "Voie de la rapière" && rang === 5) {
        if (cible && cible.genre === "monstre" && typeof Carte !== "undefined" && Carte.listeMonstresCombat && Carte.definirPvCombat) {
          const tok = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
          if (!tok) return `${total} dégâts (${detail}) — cible introuvable sur la table de combat.`;
          const reduction = Math.max(0, (tok.armure || 0) - 2);
          const degatsNets = Math.max(0, total - reduction);
          const pvApres = Math.max(0, (tok.pvActuel ?? tok.pvMax ?? 0) - degatsNets);
          Carte.definirPvCombat(cible.id, pvApres);
          return `${total} dégâts (${detail}) → ${tok.nom} : -${degatsNets} après RD-2 (${reduction}), ${pvApres} PV restants.`;
        }
        if (cible && cible.genre === "perso" && persos[cible.id]) {
          const pCible = persos[cible.id];
          const reduction = Math.max(0, Personnage.depuisJSON(pCible).reductionDegats() - 2);
          const degatsNets = Math.max(0, total - reduction);
          pCible.pvActuel = Math.max(0, (pCible.pvActuel || 0) - degatsNets);
          return `${total} dégâts (${detail}) → ${cible.nom} : -${degatsNets} après RD-2 (${reduction}), ${pCible.pvActuel} PV restants.`;
        }
        return `${total} dégâts (${detail}) — aucune cible sélectionnée, à appliquer manuellement.`;
      }
      const volDeVieActif = perso.classe === "necromancien" && voie === "Voie du sang" && [1, 3, 5].includes(rang);
      // Enchanteur — Voie du chaos, rang 2 "Drain d'âme" : récupère en PP un
      // montant égal aux dégâts RÉELLEMENT infligés (degatsNets) — même
      // déclenchement que volDeVieActif ci-dessus (dégâts appliqués avec
      // succès), mais en PP plutôt qu'en PV, cf. _appliquerGainPPDrainAme.
      const drainAmeActif = perso.classe === "enchanteur" && voie === "Voie du chaos" && rang === 2;
      if (cible && cible.genre === "monstre" && typeof Carte !== "undefined") {
        // pvAvant : capturé AVANT résolution pour plafonner le gain PP de
        // Drain d'âme au PV réellement retiré (pas les dégâts bruts post-RD,
        // qui peuvent dépasser les PV restants de la cible — "overkill").
        const tokAvant = Carte.listeMonstresCombat && (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
        const pvAvantM = tokAvant ? (tokAvant.pvActuel ?? tokAvant.pvMax ?? 0) : null;
        const res = Carte.appliquerDegatsCombat(cible.id, total);
        const noteVol = (res && volDeVieActif) ? _appliquerVolDeVie(persos, perso, rang, res.degatsNets, res.pvActuel) : "";
        const degatsReelsM = (res && pvAvantM !== null) ? Math.min(res.degatsNets, pvAvantM) : (res ? res.degatsNets : 0);
        const noteDrain = (res && drainAmeActif) ? _appliquerGainPPDrainAme(persos, perso, degatsReelsM) : "";
        return res
          ? `${total} dégâts (${detail}) → ${res.nom} : ${res.pvActuel} PV restants.${noteMutationSauvage}${noteElementActif}${noteTypeCreature}${noteVol}${noteDrain}`
          : `${total} dégâts (${detail}) — cible introuvable sur la table de combat.${noteMutationSauvage}${noteElementActif}${noteTypeCreature}`;
      }
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        // pvAvant : même plafonnement que ci-dessus, côté PJ.
        const pvAvantP = persos[cible.id].pvActuel || 0;
        const res = appliquerDegatsPersoLocal(persos[cible.id], total);
        const noteVol = volDeVieActif ? _appliquerVolDeVie(persos, perso, rang, res.degatsNets, res.pvActuel) : "";
        const degatsReelsP = Math.min(res.degatsNets, pvAvantP);
        const noteDrain = drainAmeActif ? _appliquerGainPPDrainAme(persos, perso, degatsReelsP) : "";
        return `${total} dégâts (${detail}) → ${cible.nom} : -${res.degatsNets} après réduction (${res.reduction}), ${res.pvActuel} PV restants.${noteMutationSauvage}${noteElementActif}${noteTypeCreature}${noteVol}${noteDrain}`;
      }
      return `${total} dégâts (${detail}) — aucune cible sélectionnée, à appliquer manuellement.${noteMutationSauvage}${noteElementActif}${noteTypeCreature}`;
    }
    if (effet.type === "soin") {
      // Collier de la Dette du Soigneur (data/loot.json: collier_dette_soigneur) :
      // porté par le LANCEUR (perso, pas cible) — soigne sa valeur MAX sans
      // jet, puis active la dette sur le lanceur lui-même (persos[perso.id]),
      // pas sur le personnage soigné. La dette est posée APRÈS avoir appliqué
      // le soin ci-dessous (jamais avant) : sinon un porteur qui se soigne
      // lui-même verrait son propre soin max immédiatement annulé par la
      // dette qu'il vient de déclencher. Ne se cumule pas si déjà active.
      const collierActif = perso._itemsEquipesUniques().some((it) => it.id === "collier_dette_soigneur");
      const { total, detail } = resoudreExpression(effet.formule, { perso, rang, forcerMax: collierActif });
      App.ajouterHisto(`${libelle} — Soin`, total, false, false, detail);
      let res = null;
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        res = appliquerSoinPersoLocal(persos[cible.id], total);
      }
      let noteDette = "";
      if (collierActif && persos[perso.id] && !persos[perso.id].detteSoigneurActive) {
        persos[perso.id].detteSoigneurActive = true;
        noteDette = " ⚠ Dette du Soigneur activée sur le lanceur (prochain gain de PV du porteur réduit à 0).";
      }
      if (res) {
        return `${total} PV (${detail}) → ${cible.nom} récupère ${res.gain} PV${res.reduit ? " (réduit de moitié — Corruption persistante)" : ""}.${noteDette}`;
      }
      return `${total} PV (${detail}) — aucune cible sélectionnée, à appliquer manuellement.${noteDette}`;
    }
    if (effet.type === "pvTemp") {
      // PV temporaires (distincts des PV normaux, jamais cumulatifs — cf.
      // appliquerPvTemporairesSurPerso) : formule résolue une seule fois à la
      // pose, comme "soin", mais stockée dans un champ dédié plutôt
      // qu'ajoutée à pvActuel.
      const { total, detail } = resoudreExpression(effet.formule, { perso, rang });
      App.ajouterHisto(`${libelle} — PV temporaires`, total, false, false, detail);
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        const res = appliquerPvTemporairesSurPerso(persos[cible.id], total, effet.duree, { perso, rang });
        return res.remplace
          ? `${total} PV temporaires (${detail}) → ${cible.nom} : ${res.montant} PV temp actifs.`
          : `${total} PV temporaires (${detail}) → ${cible.nom} avait déjà ${res.montant} PV temp, plus élevés — pas de cumul, pas de remplacement.`;
      }
      return `${total} PV temporaires (${detail}) — aucune cible sélectionnée, à appliquer manuellement.`;
    }
    if (effet.type === "etat") {
      const idEtatCatalogue = /^marquee_.+/.test(effet.id) ? "marquee" : effet.id;
      const etat = getEtat(idEtatCatalogue); // lève si inconnu — l'entrée existe forcément (validée par tools/valider_mecaniques.js)
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        const cibleP = persos[cible.id];
        const ciblePerso = Personnage.depuisJSON(cibleP);
        // Barde — Voie du spectacle, rang 5 "Liberté d'action" : immunité
        // totale aux états 'immobilisee'/'entravee', et ignore
        // automatiquement le premier 'paralysee' de chaque combat (1x/combat,
        // clé synthétique "classe:barde:5" — même mécanique que Cœur de
        // Montagne, ni l'un ni l'autre ne passe par une vraie capacité
        // Capacites.lancer() propre).
        if (ciblePerso.aImmuniteEtat(effet.id)) {
          return `${cible.nom} est immunisé·e à l'état « ${etat.nom} » (Liberté d'action) — aucun effet appliqué.`;
        }
        if (effet.id === "paralysee" && ciblePerso.aLiberteAction()) {
          const usage = verifierUsage(cibleP, "classe:barde:5", { usage: { frequence: "1x/combat" } });
          if (usage.ok) {
            usage.appliquer();
            return `${cible.nom} ignore automatiquement l'état « ${etat.nom} » (Liberté d'action, 1x/combat — épuisé pour ce combat).`;
          }
        }
        // Guerrier — Voie de l'élite, rang 5 "Apogée physique" : l'état porte
        // la caractéristique choisie au rang 1 (Spécimen d'élite), pour que
        // Personnage.mod() sache laquelle doubler — donnée dynamique
        // choisie par le joueur ailleurs, pas fixable dans data/donnees.js.
        let extra = null;
        if (effet.id === "apogee_physique") {
          const capRang1 = ciblePerso.capaciteEntree("Voie de l'élite", 1);
          extra = capRang1 && capRang1.choix ? { carac: capRang1.choix } : null;
        }
        // Test de Volonté par tour (ex. Guerrier "Déchaînement", Voie du
        // chaos rang 5) : effet.testVolonte (déclaré directement dans
        // data/donnees.js, même schéma que mecanique.testVolonte mais porté
        // par l'effet 'etat' lui-même) est recopié dans l'entrée etatsActifs
        // — relu à chaque tick par decompterEtatsDebutTour tant que l'état
        // reste actif, contrairement à mecanique.testVolonte qui ne teste
        // qu'une fois, à l'activation.
        if (effet.testVolonte) extra = Object.assign({}, extra, { testVolonte: effet.testVolonte });
        // Enchanteur — Voie de l'enchantement, rang 4 "Proficience" (passive) :
        // le coût de MAINTIEN de Fascination (effet.coutMaintienPP, base 2)
        // passe à 1 PP/tour dès ce rang 4 acquis — le coût de LANCEMENT
        // initial (coutPPReel dans lancer()) n'est volontairement pas touché
        // ici, seul le maintien récurrent baisse (cf. donnée, rang 4).
        if (effet.id === "fascinee_illusoire" && perso.classe === "enchanteur"
            && perso.rangMaxVoie("Voie de l'enchantement") >= 4) {
          extra = Object.assign({}, extra, { coutMaintienPP: 1 });
        }
        appliquerEtatSurPerso(cibleP, effet, libelle, { perso, rang }, extra);
        let noteAscension = "";
        // Enchanteur — Voie du chaos, rang 5 "Ascension chaotique" : une fois
        // l'état posé (etatsActifs déjà à jour ci-dessus), recalcule le pool
        // de PP via une NOUVELLE instance Personnage (le multiplicateur ×2
        // vit dans Personnage._multiplicateurAscension, lu par mod(), cf. son
        // commentaire sur le risque de double-comptage) et le remplit
        // immédiatement au nouveau max (texte source, "confirmé par Thomas").
        // PV max : PAS mutés directement ici (pvMax est un champ stocké, pas
        // recalculé en direct comme calculerCA()/calculerPPMax() — un
        // doublement puis un retour en arrière fiable à l'expiration de
        // l'état exigerait une vraie infrastructure de sauvegarde/restauration
        // absente du code) — approximé par un gain de PV temporaires égal au
        // pvMax actuel (mécanisme existant, non cumulatif, s'estompe avec
        // l'état sans risque de corrompre les PV réels du personnage).
        if (effet.id === "ascension_chaotique") {
          const perso2 = Personnage.depuisJSON(cibleP);
          const nouveauMax = perso2.calculerPPMax();
          cibleP.ppActuel = nouveauMax;
          const resPvTemp = appliquerPvTemporairesSurPerso(cibleP, cibleP.pvMax || 0, effet.duree, { perso, rang });
          noteAscension = ` PP rempli au nouveau max (${nouveauMax}). +${resPvTemp.montant} PV temporaires (approximation du doublement de PV max, cf. commentaire).`;
        }
        return `État « ${etat.nom} » appliqué à ${cible.nom} (${effet.duree}).${noteAscension}`;
      }
      return `État « ${etat.nom} » (${effet.duree}) à appliquer manuellement à ${cible ? cible.nom : "la cible"} (pas de suivi d'état automatique pour les monstres).`;
    }
    if (effet.type === "bonus") {
      // Guerrier — Voie du soldat, rang 1 "Posture de combat" : une option de
      // choix peut représenter un TRANSFERT entre deux stats (ex. "+ Attaque
      // / − DEF") plutôt qu'une simple substitution de cible à valeur fixe
      // (cf. Alcool/Toucher flétrissant/Prouesse). Détecté via effet.choix,
      // encore présent après la substitution de cible faite dans lancer()
      // (Object.assign ne touche que .cible, jamais .choix) : si l'option
      // choisie (effet.cible, la valeur choisie par le joueur) porte un
      // champ `paire`, résolution dédiée ci-dessous plutôt que le chemin
      // standard à une seule valeur/cible.
      if (effet.choix && Array.isArray(effet.choix.options)) {
        const option = effet.choix.options.find((o) => o.valeur === effet.cible);
        if (option && Array.isArray(option.paire)) {
          // Magnitude = rang max atteint dans la voie, doublée tant que l'état
          // 'maitrise_tactique' est actif (rang 5, cf. son mecanique.effets).
          const doubleActif = (perso.etatsActifs || []).some((e) => e.idEtat === "maitrise_tactique");
          const magnitude = perso.rangMaxVoie(voie) * (doubleActif ? 2 : 1);
          const cibleP = cible && cible.genre === "perso" ? persos[cible.id] : null;
          const details = option.paire.map((p) => {
            const valeurPaire = p.signe * magnitude;
            if (cibleP) appliquerBonusSurPerso(cibleP, { cible: p.cible, duree: effet.duree }, libelle, { perso, rang }, valeurPaire);
            return `${p.cible} ${valeurPaire >= 0 ? "+" : ""}${valeurPaire}`;
          });
          return cibleP
            ? `${option.label} (${details.join(", ")}, ${effet.duree}) appliqué à ${cible.nom}.`
            : `${option.label} (${details.join(", ")}, ${effet.duree}) — aucune cible sélectionnée, à appliquer manuellement.`;
        }
      }
      // Nécromancien — Voie de la sombre magie, rang 4 "Malédiction
      // profonde" (simplifié — validé avec Thomas — en upgrade numérique des
      // rangs 1/2, remplace le texte d'origine "double la durée", non
      // chiffrable) : Œil mauvais (rang 1) passe de -2 attaque à -3 DEF —
      // change à la fois la cible ET la valeur, donc une copie ajustée de
      // l'effet (jamais l'objet d'origine, partagé via data/donnees.js) est
      // utilisée pour tout le reste de cette branche.
      let effetAjuste = effet;
      if (voie === "Voie de la sombre magie" && rang === 1 && perso.classe === "necromancien"
          && effet.cible === "attaque" && effet.valeur === -2
          && perso.rangMaxVoie("Voie de la sombre magie") >= 4) {
        effetAjuste = Object.assign({}, effet, { cible: "DEF", valeur: -3 });
      }
      // effet.valeur peut être un nombre fixe ("2") ou une formule ("Mod.SAG") :
      // résolue une seule fois ici (dés éventuels non relancés), réutilisée pour
      // le message ET le stockage (cf. appliquerBonusSurPerso).
      let valeurBrute = effetAjuste.valeur;
      // Barde — Voie du chant, rang 2 "Refrain lancinant" (passive) : le
      // malus de Note discordante (rang 1) passe de -2 à -3 dès que le rang 2
      // est acquis — même principe qu'Intensité élémentaire ci-dessus. Rang 4
      // "Dissonance profonde" (simplifié — validé avec Thomas — en "double
      // les malus" plutôt que la règle de cumul/durée d'origine, non
      // chiffrable) : double la valeur déjà obtenue ci-dessus (donc -3 → -6
      // avec le rang 2, ou -2 → -4 sans, mais l'acquisition séquentielle des
      // rangs — cf. creation, "impossible de prendre le rang 3 sans avoir les
      // rangs 1 et 2" — garantit que le rang 4 a toujours aussi le rang 2).
      if (voie === "Voie du chant" && rang === 1 && perso.classe === "barde" && effet.valeur === -2) {
        if (perso.rangMaxVoie("Voie du chant") >= 2) valeurBrute = -3;
        if (perso.rangMaxVoie("Voie du chant") >= 4) valeurBrute = valeurBrute * 2;
      }
      // Barde — Voie du chant, rang 3 "Chant brisant" (attaque ET DEF, -2
      // chacun) : même doublement par le rang 4 "Dissonance profonde", sans
      // palier intermédiaire (Refrain lancinant, rang 2, ne concerne QUE
      // Note discordante d'après son propre texte).
      if (voie === "Voie du chant" && rang === 3 && perso.classe === "barde"
          && perso.rangMaxVoie("Voie du chant") >= 4 && effet.valeur === -2) {
        valeurBrute = -4;
      }
      // Nécromancien — Voie de la sombre magie, rang 4 "Malédiction
      // profonde" (suite) : Toucher flétrissant (rang 2, choix attaque/DEF)
      // passe de -1d4 à -1d6 — ce rang n'utilise jamais la branche
      // choix+paire ci-dessus (ses options n'ont pas de champ .paire), donc
      // .valeur atteint bien ce point, encore "-1d4" (le swap de cible fait
      // par lancer() via effetResolu ne touche jamais .valeur).
      if (voie === "Voie de la sombre magie" && rang === 2 && perso.classe === "necromancien"
          && effet.valeur === "-1d4" && perso.rangMaxVoie("Voie de la sombre magie") >= 4) {
        valeurBrute = "-1d6";
      }
      const { total: valeurResolue } = resoudreExpression(valeurBrute, { perso, rang });
      if (effetAjuste.duree === "permanente") {
        return `Bonus permanent (${effetAjuste.cible} ${valeurResolue >= 0 ? "+" : ""}${valeurResolue}) — normalement fixé une fois pour toutes à l'acquisition de la capacité, pas à relancer ici.`;
      }
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        appliquerBonusSurPerso(persos[cible.id], effetAjuste, libelle, { perso, rang }, valeurResolue);
        return `Bonus (${effetAjuste.cible} ${valeurResolue >= 0 ? "+" : ""}${valeurResolue}, ${effetAjuste.duree}) appliqué à ${cible.nom}.`;
      }
      return `Bonus (${effetAjuste.cible} ${valeurResolue >= 0 ? "+" : ""}${valeurResolue}, ${effetAjuste.duree}) — aucune cible sélectionnée, à appliquer manuellement.`;
    }
    if (effet.type === "retraitEtat") {
      // Moine — Voie de l'ascétisme, rang 3 "Jeûne purificateur" : retire UN
      // SEUL état non-buff actif de la cible (cf. _retirerUnMalus), le plus
      // ancien posé. Type d'effet générique, réutilisable par d'autres
      // capacités de purge/soin.
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        const retire = _retirerUnMalus(persos[cible.id]);
        if (!retire) return `${cible.nom} ne porte aucun effet néfaste actif à purger.`;
        const idCatalogue = /^marquee_.+/.test(retire.idEtat) ? "marquee" : retire.idEtat;
        return `État « ${getEtat(idCatalogue).nom} » retiré de ${cible.nom}.`;
      }
      return `Purge un effet néfaste — aucune cible sélectionnée, à appliquer manuellement (pas de suivi d'état automatique pour les monstres).`;
    }
    if (effet.type === "special") {
      return `ℹ️ ${effet.note}`;
    }
    return null;
  }

  /* ---------- Point d'entrée ---------- */

  // Types d'effets dont l'application est DIFFÉRÉE (cf. lancer()) pour les
  // capacités d'attaque vs DEF, jusqu'à confirmation que l'attaque touche.
  const TYPES_EFFETS_DIFFERES = ["degats", "etat"];

  // { persoId, source, mecanique, cibleId?, choixEffet? }
  // source : { origine: "classe"|"race"|"variante", cle, voie?, rang?, code?, nomCap }
  // choixEffet : valeur choisie par le joueur à l'activation pour un effet
  // dont effet.cible === "choix" (ex. Barde Voie de l'alcoolisme : quelle
  // caractéristique ; Nécromancien Toucher flétrissant : "attaque" ou "DEF")
  // — récoltée en amont par le modal générique côté app.js (cf.
  // ouvrirModalChoixCapacite, réutilisé pour l'activation), pas mémorisée ici.
  //
  // Pour une capacité dont jetOppose.caracDefenseur === "DEF" (attaque de
  // contact/distance/magique ciblant la DEF adverse), le jet d'attaque est
  // comparé automatiquement à la DEF de la cible (cf. obtenirDefCible) pour
  // déterminer touché/raté/critique — les effets degats/etat ne sont PAS
  // résolus ici mais renvoyés dans `resolutionDegats`, à passer ensuite à
  // resoudreDegatsEnAttente() une fois que l'appelant (app.js) a confirmé que
  // l'attaque touche. Les effets bonus/special de la même capacité, eux, se
  // résolvent normalement dans CET appel (cf. limite connue plus bas).
  //
  // Limite connue (non corrigée dans ce chantier) : certains rangs avec
  // jetOppose vs DEF n'ont QUE des effets bonus/special (ex. Barde rang 3
  // "Feinte" — un jet d'attaque opposé qui devrait normalement conditionner
  // le malus de DEF à la réussite). Comme seuls degats/etat sont conditionnés
  // à la touche, ces capacités continuent d'appliquer leur bonus même sur un
  // raté — à traiter séparément si besoin.
  // cibleIds (optionnel) : Prêtre — Voie de la guérison rang 4 "Bénédiction",
  // choix "soin_partage" — jusqu'à 3 cibles indépendantes, chacune avec son
  // propre jet de soin. Seul cas actuel hors du schéma standard "une seule
  // cible résolue par cibleId" (cf. son cas particulier plus bas).
  function lancer({ persoId, source, mecanique, cibleId, cibleIds, cerclesParCible, choixEffet, payerEnCS, payerSupplementCS }) {
    if (!mecanique || mecanique.type === "passive") {
      return { ok: false, messages: ["Cette capacité est passive : rien à lancer."] };
    }
    if (!choixEffet && (mecanique.effets || []).some((e) => e.cible === "choix")) {
      return { ok: false, messages: ["Cette capacité demande un choix à l'activation — relance-la depuis la fiche."] };
    }

    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return { ok: false, messages: ["Personnage introuvable."] };
    const perso = Personnage.depuisJSON(p);
    // p.ppActuel n'existe dans le JSON brut qu'après un premier repos long/
    // court (seuls chemins qui l'écrivent, cf. js/app.js) — un personnage tout
    // juste créé n'a jamais ce champ, alors que Personnage.depuisJSON() le
    // calcule déjà correctement (fallback calculerPPMax() dans le
    // constructeur). Sans cette ligne, tout accès direct à p.ppActuel
    // ci-dessous lisait 0 au lieu du max pour un casteur jamais reposé.
    if (p.ppActuel == null) p.ppActuel = perso.ppActuel;
    const libelle = source.nomCap || "Capacité";
    // Déclarés ici (pas plus bas comme avant) : plusieurs cas spéciaux
    // court-circuitant lancer() avant le bloc générique (Bannissement,
    // Supplément corrompu...) appellent messages.push() bien avant l'ancien
    // point de déclaration — une const référencée avant son initialisation
    // lève un ReferenceError (temporal dead zone), ce qui plantait ces
    // chemins avant même d'écrire quoi que ce soit sur la fiche.
    const messages = [];
    let resolutionDegats = null;
    // true dès que la branche réactive (cf. plus bas) a déjà résolu et
    // appliqué elle-même les effets différés (degats/etat) — distinct de
    // resolutionDegats (mis à null ensuite pour ne PAS afficher le bouton
    // "Lancer les dégâts", déjà inutile), pour que la boucle générique
    // plus bas ne les réapplique pas une seconde fois.
    let effetsReactifsDejaResolus = false;

    // Enchanteur — Voie de l'enchantement, rang 4 "Proficience" (passive) :
    // le coût PP du sort 'illusion' (rang 1, même voie — base ou évolué par
    // le rang 3) passe de 2 à 1 dès ce rang 4 acquis. Condition étroite
    // (voie+rang+classe, comme les autres réductions ponctuelles déjà en
    // jeu) plutôt qu'un champ générique, cette capacité étant directement
    // castable (pas de dépendance au Grimoire, contrairement aux réductions
    // de famille du Magicien/des autres voies Enchanteur, non câblées faute
    // de Grimoire branché pour ces classes).
    let coutPPReel = mecanique.coutPP;
    // Déblocage d'école (cf. ECOLE_VERS_VOIE_DEBLOCAGE, data/donnees.js et
    // Personnage.ecoleDebloquee) : ×2 générique si l'école du sort n'est
    // pas débloquée pour ce personnage. Uniquement pour les sorts de
    // Grimoire (typeSort:"majeur", categorie renseignée sur l'entrée
    // SORTS_PAR_CLASSE) — jamais sur les capacités de Voie classiques, qui
    // n'ont pas de champ `categorie` d'école. Les sorts ACCORDÉS par une
    // Voie (sortsGrimoireAccordes(), jamais appris via slot) restent
    // logiquement toujours dans une école déjà investie par construction
    // (le rang qui les accorde EST souvent le rang de déblocage lui-même,
    // cf. Imposition des mains/Flamme sacrée/Œil de l'inquisiteur) — pas de
    // vérification spéciale nécessaire pour eux, le calcul générique
    // donne déjà le bon résultat.
    if (mecanique.typeSort === "majeur" && source.idSort && typeof SORTS_PAR_CLASSE !== "undefined") {
      const catalogueEcole = SORTS_PAR_CLASSE[perso.classe];
      const sortPourEcole = catalogueEcole && catalogueEcole.find((s) => s.id === source.idSort);
      // ecoleSortDebloquee (pas ecoleDebloquee) : gère aussi les catégories
      // composées (ex. "divination_transmutation", cf. 'detection_magie'),
      // débloquées dès qu'AU MOINS une des écoles listées l'est.
      if (sortPourEcole && sortPourEcole.categorie && perso.ecoleSortDebloquee && !perso.ecoleSortDebloquee(sortPourEcole.categorie)) {
        coutPPReel *= 2;
      }
    }
    const estSortFamilleIllusion = perso.classe === "enchanteur" && source.voie === "Voie de l'enchantement"
      && (source.rang === 1 || source.rang === 2);
    // Enchanteur — Voie du chaos, rang 1 "Éclat chaotique" (passive) : +2 PP
    // malus PERMANENT sur tout sort de famille Illusion ('illusion' rang 1
    // ET 'fascination_illusoire' rang 2, Voie de l'enchantement) — pas
    // conditionné à l'utilisation d'Éclat chaotique elle-même, se cumule
    // avec la réduction de Proficience (rang 4) ci-dessous si les deux voies
    // sont acquises. Ne touche que le coût de LANCEMENT (mecanique.coutPP),
    // jamais coutMaintienPP (Fascination), non mentionné par le texte source.
    if (estSortFamilleIllusion && perso.rangMaxVoie("Voie du chaos") >= 1) {
      coutPPReel += 2;
    }
    if (source.rang === 1 && estSortFamilleIllusion && perso.rangMaxVoie("Voie de l'enchantement") >= 4) {
      coutPPReel = Math.max(1, coutPPReel - 1);
    }
    // Enchanteur — Voie du chaos, rang 5 "Ascension chaotique" : coutPP:
    // "tout" (mot-clé, pas un nombre) — le PP est intégralement redéfini par
    // l'effet 'etat' lui-même (drain implicite puis remplissage au nouveau
    // max doublé, cf. resoudreEffet), donc coutPPReel = 0 ici plutôt qu'un
    // montant à faire re-décompter par le bloc générique plus bas : celui-ci
    // s'exécute APRÈS la boucle d'effets (donc après le remplissage) et
    // soustrairait sinon l'ancien montant du nouveau pool déjà rempli.
    if (mecanique.coutPP === "tout") {
      coutPPReel = 0;
    }

    // Gate d'accès Grimoire (cf. reference_sorts_connus.md) : un sort hors
    // Voies (SORTS_MAGICIEN ou équivalent) ne peut être lancé que s'il est
    // effectivement appris — vérifié avant tout le reste (usage, PP...),
    // pas de sens à décompter quoi que ce soit pour un sort non appris.
    if (mecanique.origineGrimoire && !(p.grimoireSortsConnus || []).concat(perso.sortsGrimoireAccordes()).includes(source.idSort)) {
      return { ok: false, messages: [`Ce sort n'est pas (encore) inscrit dans le Grimoire.`] };
    }
    // Emplacement compatible réellement disponible (cf. Personnage.
    // sortGrimoireADesEmplacements/grimoireOccupationParTier) : un sort
    // connu (appris OU accordé par la Voie/le Cercle) n'est castable que
    // s'il obtient effectivement un palier sur l'objet de Grimoire
    // actuellement porté — ex. un sort accordé de rang 5 (capstone de Voie)
    // reste "connu" mais injouable tant que l'objet porté (Commun/Peu
    // commun) n'a aucun emplacement 1-5 ; se débloque automatiquement avec
    // un objet Rare/Légendaire, sans rien apprendre à nouveau.
    if (mecanique.origineGrimoire && perso.sortGrimoireADesEmplacements && !perso.sortGrimoireADesEmplacements(source.idSort)) {
      return { ok: false, messages: [`Ce sort n'a plus d'emplacement compatible sur ton objet de Grimoire actuel (rang trop élevé pour sa rareté) — équipe un objet de meilleure rareté pour pouvoir le lancer.`] };
    }

    const cle = cleCapacite(source);
    const usage = verifierUsage(p, cle, mecanique);
    if (!usage.ok) return { ok: false, messages: [usage.raison] };

    // Coût en jauge de combat de Voie du chaos (ex. Guerrier "Rage
    // incontrôlée" : consomme 2 CF, condition 3 CF minimum) — distinct de
    // mecanique.corruption (un GAIN, jamais un coût) : celui-ci RETRANCHE la
    // jauge et bloque l'activation si le minimum n'est pas atteint, vérifié
    // AVANT de résoudre quoi que ce soit (comme verifierUsage juste au-dessus).
    if (mecanique.corruptionCout) {
      const seuil = mecanique.corruptionCoutMin || mecanique.corruptionCout;
      if ((p.corruptionCombat || 0) < seuil) {
        return { ok: false, messages: [`Pas assez de jauge de combat (${seuil} minimum, ${p.corruptionCombat || 0} actuellement).`] };
      }
    }

    // Pool générique de réactions (3 par combat et par personnage, ex.
    // Guerrier — Voie du peuple rang 1 "Fils du village") — même principe que
    // corruptionCout : bloque AVANT résolution si le pool est épuisé, décompte
    // seulement une fois l'activation confirmée (cf. plus bas). Distinct des
    // compteurs usage.frequence (1x/tour, 1x/combat...) : plusieurs capacités
    // différentes peuvent piocher dans le MÊME pool de 3 réactions.
    if (mecanique.reactionCout) {
      const reactionsRestantes = REACTIONS_MAX - (p.reactionsUtilisees || 0);
      if (reactionsRestantes < mecanique.reactionCout) {
        return { ok: false, messages: [`Plus assez de réactions ce combat (${reactionsRestantes}/${REACTIONS_MAX} restantes).`] };
      }
    }

    // Correctif d'équilibrage PP (cf. prompt_correctif_pp_nonlineaire.md) :
    // palier de niveau minimum pour lancer un sort de Grimoire, indépendant
    // des points de Voie déjà investis — empêche un build optimisé de
    // débloquer un sort de rang 5 dès niveau 4 (cf. calcul de
    // pointsVoieTotal). typeSort:"majeur" identifie exclusivement une entrée
    // SORTS_MAGICIEN/SORTS_ENCHANTEUR/SORTS_PRETRE (jamais posé sur une
    // capacité de Voie classique) — le rang du sort n'est pas porté par
    // `source` pour cette origine (seul idSort l'est), il faut le relire
    // dans SORTS_PAR_CLASSE[classe].
    if (mecanique.typeSort === "majeur" && source.idSort && typeof SORTS_PAR_CLASSE !== "undefined") {
      const catalogue = SORTS_PAR_CLASSE[perso.classe];
      const sortLance = catalogue && catalogue.find((s) => s.id === source.idSort);
      const rangSort = sortLance ? sortLance.rang : null;
      if (rangSort) {
        const niveauMin = (typeof NIVEAU_MIN_PAR_RANG !== "undefined" && NIVEAU_MIN_PAR_RANG[rangSort]) || 1;
        if ((p.niveau || 1) < niveauMin) {
          return { ok: false, messages: [`Ce sort (rang ${rangSort}) nécessite le niveau ${niveauMin} (actuellement niveau ${p.niveau || 1}).`] };
        }
      }
    }

    // Coût en Points de Pouvoir (cf. reference_systeme_magie_pp.md) — bloque
    // AVANT résolution si le pool est insuffisant, même principe que
    // reactionCout ci-dessus. mecanique.coutPP absent ou 0 = capacité
    // gratuite (martiale, ou sort mineur type degatsMagiques()).
    // Prêtre — Voie du chaos, rang 2 "Don corrompu" (passive) : peut payer le
    // coût d'un sort en CS (= rang du sort, dérivé de coutPPReel/2 —
    // convention constante sur tout SORTS_MAGICIEN/SORTS_PRETRE, rang×2 PP,
    // appliquée au coût RÉEL après modificateurs éventuels comme Proficience/
    // Éclat chaotique de l'Enchanteur) plutôt qu'en PP, si le joueur active
    // l'option (payerEnCS) à l'activation.
    const donCorrompu = perso.classe === "pretre" && perso.estChoisie("Voie du chaos", 2);
    const substitutionCS = !!(coutPPReel && donCorrompu && payerEnCS);
    if (substitutionCS) {
      const coutCS = Math.max(1, Math.round(coutPPReel / 2));
      if ((p.corruptionCombat || 0) < coutCS) {
        return { ok: false, messages: [`Pas assez de jauge de combat (${coutCS} CS requis pour Don corrompu, ${p.corruptionCombat || 0} disponibles).`] };
      }
    } else if (coutPPReel) {
      const ppRestants = (p.ppActuel || 0);
      if (ppRestants < coutPPReel) {
        return { ok: false, messages: [`Pas assez de Points de Pouvoir (${coutPPReel} requis, ${ppRestants} disponibles).`] };
      }
    }

    // Prêtre — Points de Cercle (Bénédiction/Conviction/Bannissement/
    // Jugement, cf. les 4 prompts prompt_pretre_cercle_*.md) : même principe
    // que coutPP ci-dessus, pool séparé par Cercle. Voie du chaos rang 3
    // "Supplément corrompu" ajoute une porte de sortie si le pool est
    // insuffisant (payer 2 CS/point manquant) — vérifiée d'abord si le
    // lanceur a ce rang, cf. plus bas.
    const RESSOURCES_CERCLE = [
      { cout: "coutPointsBenediction", champ: "pointsBenediction", nom: "Points de Bénédiction" },
      { cout: "coutPointsConviction", champ: "pointsConviction", nom: "Points de Conviction" },
      { cout: "coutPointsBannissement", champ: "pointsBannissement", nom: "Points de Bannissement" },
      { cout: "coutPointsJugement", champ: "pointsJugement", nom: "Points de Jugement" },
    ];
    for (const r of RESSOURCES_CERCLE) {
      if (!mecanique[r.cout]) continue;
      const restants = p[r.champ] || 0;
      const manquants = mecanique[r.cout] - restants;
      if (manquants <= 0) continue;
      // Prêtre — Voie du chaos, rang 3 "Supplément corrompu" (passive) :
      // supplée les points manquants en payant 2 CS chacun, si le lanceur a
      // ce rang et suffisamment de jauge de combat.
      const supplementCorrompu = perso.classe === "pretre" && perso.estChoisie("Voie du chaos", 3);
      const coutCSSupplement = manquants * 2;
      if (supplementCorrompu && (p.corruptionCombat || 0) >= coutCSSupplement && payerSupplementCS) {
        // Complète le pool tout juste assez pour couvrir mecanique[r.cout] —
        // le décompte normal plus bas (Math.max(0, avant - cout)) le ramènera
        // exactement à 0, pas de double comptage.
        p.corruptionCombat -= coutCSSupplement;
        p[r.champ] = (p[r.champ] || 0) + manquants;
        messages.push(`Supplément corrompu : ${manquants} ${r.nom} manquant(s) suppléé(s) avec ${coutCSSupplement} CS (${p.corruptionCombat} CS restants).`);
      } else if (supplementCorrompu && (p.corruptionCombat || 0) >= coutCSSupplement) {
        return { ok: false, messages: [`Pas assez de ${r.nom} (${mecanique[r.cout]} requis, ${restants} disponibles) — Supplément corrompu permettrait de payer ${coutCSSupplement} CS à la place (relance avec l'option activée).`] };
      } else {
        return { ok: false, messages: [`Pas assez de ${r.nom} (${mecanique[r.cout]} requis, ${restants} disponibles).`] };
      }
    }

    // Nécromancien — Voie des âmes, "Libération vengeresse" : coût en âme
    // stockée (cf. AMES_MAX ci-dessus), bloque AVANT résolution si le
    // réceptacle est vide.
    if (mecanique.ameCout && (p.amesStockees || 0) < mecanique.ameCout) {
      return { ok: false, messages: [`Pas assez d'âmes stockées (${mecanique.ameCout} requise(s), ${p.amesStockees || 0} en réserve).`] };
    }

    let cible = null;
    if (cibleId) {
      cible = listeCibles(persoId).find((c) => c.id === cibleId) || null;
    } else if (mecanique.cible === "soi") {
      cible = { id: persoId, nom: p.nom, genre: "perso", soi: true };
    }

    // Règle générale "zone/ligne automatisée" (battlemap dd2vtt uniquement,
    // cf. js/carte.js DD2VTT.jetonsEnZoneCombat/jetonsSurLigneCombat, appelées
    // par app.js AVANT ce point : cibleIds + cerclesParCible sont déjà
    // calculés géométriquement côté carte, lancer() ne fait ici qu'appliquer
    // les dégâts). cibleIds fourni ET mecanique.cible === "zone" ET un effet
    // degats chiffré (formule de dés) -> UN SEUL jet, pondéré par cercle
    // (DEGRADE_ZONE_PAR_CERCLE, zones circulaires uniquement — une ligne
    // touche à 100%) puis arrondi à l'inférieur. Court-circuite le bloc
    // jetOppose/effets générique (return immédiat), qui reste inchangé pour
    // tous les autres cas (cible unique, zones alliées, effets non chiffrés,
    // worldmap sans battlemap dd2vtt...). mecanique.jetOppose est ignoré ici
    // si présent (ex. Boule de feu/Éclair : jet de sauvegarde Reflexes pour
    // moitié) : automatiser un jet de sauvegarde différencié par cible aurait
    // nécessité de relancer par cible, contraire au principe même de cette
    // règle (un seul jet pour toute la zone/ligne) — simplification assumée
    // par le prompt d'origine, dégâts pleins sans possibilité de sauvegarde
    // individuelle une fois ce chemin emprunté.
    if (cibleIds && cibleIds.length && mecanique.cible === "zone"
        && (mecanique.effets || []).some((e) => e.type === "degats" && e.formule)) {
      const effetDegats = mecanique.effets.find((e) => e.type === "degats" && e.formule);
      const estLigne = !!(mecanique.zone && mecanique.zone.forme === "ligne");
      const { total: degatsBruts, detail } = resoudreExpression(effetDegats.formule, { perso, rang: source.rang });
      App.ajouterHisto(`${libelle} — Dégâts`, degatsBruts, false, false, detail);
      cibleIds.forEach((cid) => {
        const multiplicateur = estLigne ? 1 : (DEGRADE_ZONE_PAR_CERCLE[(cerclesParCible || {})[cid]] ?? 1);
        const degatsFinal = Math.floor(degatsBruts * multiplicateur);
        const res = Carte.appliquerDegatsCombat(cid, degatsFinal);
        if (res) {
          messages.push(`${res.nom} : ${degatsFinal} dégâts${multiplicateur < 1 ? ` (cercle, ${Math.round(multiplicateur * 100)}%)` : ""}${res.reduction ? ` (armure -${res.reduction})` : ""}`);
        }
      });
      usage.appliquer && usage.appliquer();
      if (coutPPReel) {
        p.ppActuel = Math.max(0, (p.ppActuel || 0) - coutPPReel);
        // Remous (accord explicite de Thomas, 09/08/2026, cf.
        // prompt_remous_ui.md §3) : alimente la jauge de Remous du lieu
        // avec le coût PP réellement décompté.
        if (typeof Remous !== "undefined") Remous.ajouter(p, coutPPReel);
        messages.push(`PP -${coutPPReel} (${p.ppActuel} restants).`);
      }
      App.sauverPersos(persos);
      return { ok: true, messages: [`${libelle} : ${degatsBruts} dégâts de base (${detail}).`, ...messages] };
    }

    // Prêtre — Cercle du Bannissement, sorts "Bannissement"/"Bannissement de
    // zone" : jet 1d20+Mod.CHA (+Mod.SAG en zone) vs DD variable selon la
    // dangerosité de la cible (cf. _ddBannissement) — hors du schéma
    // jetOppose standard (toujours vs DEF), résolu ici en cas spécial
    // identifié par idSort, cible déjà résolue ci-dessus. Réservé aux cibles
    // race:'mort_vivant'/'demon', dangerosité ≤5. Court-circuite le reste de
    // lancer() (return immédiat) : décompte lui-même usage + Points de
    // Bannissement plutôt que de traverser le flux générique plus bas.
    if ((source.idSort === "bannissement" || source.idSort === "bannissement_zone") && cible) {
      if (!_cibleEstDemonOuMortVivant(cible)) {
        return { ok: false, messages: [`${cible.nom} n'est ni démoniaque ni morte-vivante — le Bannissement n'a aucun effet sur cette cible.`] };
      }
      const dangerosite = _dangerositeCible(cible);
      const dd = _ddBannissement(dangerosite);
      if (dd === null) {
        return { ok: false, messages: [`${cible.nom} a une dangerosité trop élevée (>5) ou inconnue — le Bannissement échoue automatiquement.`] };
      }
      const enZone = source.idSort === "bannissement_zone";
      const modTotal = perso.mod("CHA") + (enZone ? perso.mod("SAG") : 0);
      const d20v = App.lancerDe(20);
      const total = d20v + modTotal;
      const reussite = total >= dd;
      App.ajouterHisto(`${libelle} — Bannissement`, total, false, false,
        `d20[${d20v}] ${modTotal >= 0 ? "+" : ""}${modTotal} (${enZone ? "Mod.CHA+Mod.SAG" : "Mod.CHA"}) vs DD${dd} (dangerosité ${dangerosite})`);
      messages.push(reussite
        ? `Bannissement réussi : ${total} vs DD${dd} — ${cible.nom} est renvoyé(e) vers son plan d'origine.`
        : `Bannissement raté : ${total} vs DD${dd} — aucun effet sur ${cible.nom}.`);
      usage.appliquer();
      if (mecanique.coutPointsBannissement) {
        p.pointsBannissement = Math.max(0, (p.pointsBannissement || 0) - mecanique.coutPointsBannissement);
        messages.push(`Points de Bannissement -${mecanique.coutPointsBannissement} (${p.pointsBannissement} restants).`);
      }
      App.sauverPersos(persos);
      return { ok: true, messages };
    }

    // Prêtre — Cercle du Bannissement, sort "Flamme sacrée" (rang 1,
    // accordé) : contrairement à l'ex-"Symbole sacré" qu'il remplace (rang 1
    // de l'ancienne voie, réservé aux cibles démoniaques/mortes-vivantes),
    // Flamme sacrée se lance sur N'IMPORTE QUELLE cible — seul le bonus de
    // dégâts est conditionnel (1d6→1d12 vs démon/mort-vivant), via le même
    // mécanisme formuleAlternative que Réprimande divine (cf. resoudreEffet,
    // branche "degats"). Pas de garde-fou de ciblage ici : l'ancien blocage
    // de Symbole sacré est donc entièrement retiré plutôt que reporté.

    // Chasseur — Voie de la traque, rang 3 "Premier coup" : condition unique
    // ("cible qui n'a pas encore agi ce combat") entièrement vérifiable via
    // le tracker d'initiative (cf. Combat.aDejaAgiCeCombat) — bloque avant
    // résolution si la cible a déjà agi, plutôt qu'un jet pour rien.
    if (source.voie === "Voie de la traque" && source.rang === 3 && perso.classe === "chasseur" &&
        cible && typeof Combat !== "undefined" && Combat.aDejaAgiCeCombat && Combat.aDejaAgiCeCombat(cible.id)) {
      return { ok: false, messages: [`${cible.nom} a déjà agi ce combat — Premier coup ne s'applique qu'à une cible qui n'a pas encore agi.`] };
    }

    // Chasseur — Voie de la grande chasse, rang 4 "Coup de grâce" : condition
    // "cible sous 50% PV" vérifiable (PV actuels/max connus pour PJ et
    // monstre) — bloque si au-dessus du seuil. La condition "cible déjà
    // Marquée" (marquee_chasseur) reste non vérifiable (pas de suivi d'état
    // automatique pour les monstres, même limite que Frappe purificatrice/
    // Confession forcée du Prêtre) : laissée à la table.
    if (source.voie === "Voie de la grande chasse" && source.rang === 4 && perso.classe === "chasseur" && cible) {
      const pv = _pvActuelEtMax(cible, persos);
      if (pv && pv.max > 0 && pv.actuel > pv.max / 2) {
        return { ok: false, messages: [`${cible.nom} n'est pas sous 50% PV (${pv.actuel}/${pv.max}) — Coup de grâce ne s'applique pas.`] };
      }
    }

    // Chasseur — Voie de la gâchette, rang 3 "Tir mortel" : condition à
    // deux branches ("cible immobile OU n'a pas encore agi") — contrairement
    // à Premier coup (une seule condition, entièrement vérifiable), un OU
    // ne peut pas être bloquant sur une seule branche vérifiable (l'autre,
    // "immobile" côté monstre, n'est pas trackée). Informe seulement, sans
    // bloquer, via Combat.aDejaAgiCeCombat.
    if (source.voie === "Voie de la gâchette" && source.rang === 3 && perso.classe === "chasseur" &&
        cible && typeof Combat !== "undefined" && Combat.aDejaAgiCeCombat) {
      messages.push(Combat.aDejaAgiCeCombat(cible.id)
        ? `${cible.nom} a déjà agi ce combat — vérifie qu'elle est immobile pour que Tir mortel s'applique quand même.`
        : `${cible.nom} n'a pas encore agi ce combat — condition de Tir mortel remplie.`);
    }

    // Enchanteur — Voie du chaos, rang 4 "Murmure terrifiant" : jetSauvegardeFixe
    // suivi, en cas d'ÉCHEC, d'un second jet 1d20 sur une table à 3 paliers —
    // hors du schéma jetSauvegardeFixe générique plus bas (celui-ci ne gère
    // qu'un succès/échec binaire), donc résolu ici en cas particulier, avant
    // le reste du pipeline. Résolu aussi contre un monstre (04/08/2026) via
    // js/sauvegardes.js (Sauvegardes.modMonstre, résistance légendaire
    // comprise) — le bestiaire n'a toujours aucune caractéristique propre,
    // d'où la dérivation plutôt qu'un jet direct. Retourne toujours tôt : ne
    // passe jamais par le bloc générique jetOppose/effets.
    if (source.voie === "Voie du chaos" && source.rang === 4 && perso.classe === "enchanteur") {
      if (!cible) return { ok: false, messages: ["Choisis une cible avant d'activer Murmure terrifiant."] };
      // Coût en jauge de combat (4 CS) : décompté ici puisque ce cas
      // particulier retourne tôt, avant le décompte générique de fin de
      // fonction (cf. mecanique.corruptionCout plus bas, jamais atteint ici).
      if (mecanique.corruptionCout) {
        p.corruptionCombat = Math.max(0, (p.corruptionCombat || 0) - mecanique.corruptionCout);
        App.ajouterHisto(`${libelle} — Corruption`, p.corruptionCombat, false, false, `-${mecanique.corruptionCout} (jauge de combat, ${p.nom})`, { sansOverlay: true });
        messages.push(`Corruption -${mecanique.corruptionCout} (jauge de combat : ${p.corruptionCombat}).`);
      }
      const { carac, dd } = mecanique.jetSauvegardeFixe;
      // Côté monstre (04/08/2026) : modificateur dérivé via js/sauvegardes.js
      // (le bestiaire n'expose aucune caractéristique) au lieu du message
      // manuel d'origine — la table à 3 paliers ci-dessous reste identique
      // en cas d'échec, la résistance légendaire s'applique après le jet.
      let modCible = null;
      let tokMonstre = null;
      if (cible.genre === "perso" && persos[cible.id]) {
        // carac (ex. "Volonte") est un NOM DE SAUVEGARDE (cf. SAUVEGARDES,
        // data/donnees.js), pas un code de caractéristique brut — Personnage.
        // mod() n'accepte que FOR/DEX/CON/INT/SAG/CHA, d'où la traduction.
        modCible = Personnage.depuisJSON(persos[cible.id]).mod((typeof SAUVEGARDES !== "undefined" && SAUVEGARDES[carac]) || carac);
      } else if (cible.genre === "monstre" && typeof Carte !== "undefined" && Carte.listeMonstresCombat) {
        tokMonstre = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id) || null;
        if (tokMonstre && typeof Sauvegardes !== "undefined") modCible = Sauvegardes.modMonstre(tokMonstre, carac);
      }
      if (modCible === null) {
        messages.push(`Sauvegarde (${carac}) DD ${dd} — modificateur de ${cible.nom} inconnu : résolution manuelle par la table (3 paliers : 19-20 mort, 16-18 1d10 DM, <16 folie 3 tours).`);
        usage.appliquer && usage.appliquer();
        App.sauverPersos(persos);
        return { ok: true, messages };
      }
      const d20c = App.lancerDe(20);
      const totalC = d20c + modCible;
      let reussite = totalC >= dd;
      App.ajouterHisto(`${libelle} — Sauvegarde de ${cible.nom} (${carac})`, totalC, false, false, `d20[${d20c}] ${modCible >= 0 ? "+" : ""}${modCible} vs ${dd}`);
      messages.push(`Sauvegarde de ${cible.nom} (${carac}) : ${totalC} vs ${dd} — ${reussite ? "réussie, aucun effet." : "échec."}`);
      // Résistance légendaire : après le jet, avant la table à paliers — un
      // boss qui échoue au premier jet consomme un usage plutôt que de
      // risquer la mort directe sur un 19-20.
      if (!reussite && tokMonstre && typeof Sauvegardes !== "undefined" && Sauvegardes.consommer(tokMonstre)) {
        const restant = Sauvegardes.restant(tokMonstre);
        messages.push(`RÉSISTANCE LÉGENDAIRE : échec converti en réussite (${restant} usage${restant > 1 ? "s" : ""} restant${restant > 1 ? "s" : ""}).`);
        reussite = true;
      }
      if (reussite) {
        usage.appliquer && usage.appliquer();
        App.sauverPersos(persos);
        return { ok: true, messages };
      }
      const d20t = App.lancerDe(20);
      App.ajouterHisto(`${libelle} — Table des paliers`, d20t, false, false, `1d20[${d20t}]`);
      // La table applique directement pvActuel/etatsActifs sur un objet PJ
      // (persos[cible.id]) — un monstre n'a ni l'un ni l'autre par ce biais
      // (cf. Carte.listeMonstresCombat/appliquerDegatsCombat, un modèle
      // séparé). Seul le palier "dégâts" (16-18) a un équivalent monstre
      // direct (Carte.appliquerDegatsCombat) ; mort (19-20, via
      // Carte.definirPvCombat) et folie (<16, aucun état de monstre suivi
      // par l'app) restent décrits pour résolution manuelle par la table —
      // découvert en testant Murmure terrifiant contre un monstre (crash
      // sur persos[cible.id] undefined avant ce correctif).
      if (cible.genre === "perso") {
        const pCible = persos[cible.id];
        if (d20t >= 19) {
          pCible.pvActuel = 0;
          messages.push(`Table (1d20=${d20t}, 19-20) : ${cible.nom} se suicide de folie — mort (PV à 0, cause narrative distincte d'un KO de combat).`);
        } else if (d20t >= 16) {
          const { total, detail } = resoudreExpression("1d10", { perso, rang: source.rang });
          const resDeg = appliquerDegatsPersoLocal(pCible, total);
          messages.push(`Table (1d20=${d20t}, 16-18) : ${total} dégâts (${detail}) → ${cible.nom} : ${resDeg.pvActuel} PV restants.`);
        } else {
          appliquerEtatSurPerso(pCible, { id: "folie_illusoire", duree: "3" }, libelle, { perso, rang: source.rang });
          messages.push(`Table (1d20=${d20t}, <16) : ${cible.nom} sombre dans la folie (état 'folie_illusoire', attaque la créature la plus proche pendant 3 tours).`);
        }
      } else if (d20t >= 19) {
        messages.push(`Table (1d20=${d20t}, 19-20) : ${cible.nom} se suicide de folie — mort. Applique manuellement (Carte.definirPvCombat à 0 ou ✕ sur le jeton) : aucun état de monstre suivi par l'app pour automatiser une "mort narrative" distincte d'un KO de combat.`);
      } else if (d20t >= 16) {
        const { total, detail } = resoudreExpression("1d10", { perso, rang: source.rang });
        const resMonstre = typeof Carte !== "undefined" && Carte.appliquerDegatsCombat ? Carte.appliquerDegatsCombat(cible.id, total) : null;
        messages.push(resMonstre
          ? `Table (1d20=${d20t}, 16-18) : ${total} dégâts (${detail}) → ${resMonstre.nom} : ${resMonstre.pvActuel} PV restants.`
          : `Table (1d20=${d20t}, 16-18) : ${total} dégâts (${detail}) → à appliquer manuellement à ${cible.nom} (jeton introuvable).`);
      } else {
        messages.push(`Table (1d20=${d20t}, <16) : ${cible.nom} sombre dans la folie — applique manuellement l'équivalent de l'état 'folie_illusoire' (attaque la créature la plus proche pendant 3 tours) : aucun suivi d'état pour les monstres.`);
      }
      usage.appliquer && usage.appliquer();
      App.sauverPersos(persos);
      return { ok: true, messages };
    }

    // Chasseur — Voie du chaos, rang 5 "Chasse ultime" : contrecoup garanti
    // (pas un test comme mecanique.testVolonte) — affiche la créature la
    // plus proche (cf. cibleCreaturePlusProche, même helper que Guerrier
    // Rage incontrôlée) pour que la redirection soit appliquée manuellement,
    // même limite que le reste des redirections d'attaque non modélisées.
    if (source.voie === "Voie du chaos" && source.rang === 5 && perso.classe === "chasseur") {
      const forcee = cibleCreaturePlusProche(persoId);
      messages.push(`Contrecoup : la prochaine attaque doit viser ${forcee ? forcee.nom : "la créature la plus proche (aucune détectée sur la table de combat)"}, allié compris.`);
    }

    // Prêtre — Cercle de Vie, sort "Soins divins" (accordé rang 4), choix
    // "trois_cibles" : jusqu'à 3 cibles indépendantes (cibleIds), chacune
    // reçoit son propre jet de soin (1d8) — hors du schéma standard (lancer()
    // ne résout normalement qu'UNE cible via cibleId). Reprend le patron de
    // ciblage multiple de l'ancienne Bénédiction/"soin_partage" (cf.
    // prompt_pretre_cercle_vie.md Partie 6) — seule la condition de
    // déclenchement (idSort au lieu de voie+rang) et le coût (Points de
    // Bénédiction au lieu d'usages/jour) changent. L'autre choix
    // ("cible_unique", 1 cible, 2d10) traverse le reste de lancer() sans
    // changement (cible déjà résolue ci-dessus via cibleId).
    if (source.idSort === "soins_divins" && choixEffet === "trois_cibles") {
      if (!cibleIds || !cibleIds.length) return { ok: false, messages: ["Choisis au moins un allié pour Soins divins."] };
      const ciblesPartage = cibleIds.slice(0, 3).map((cid) => listeCibles(persoId).find((c) => c.id === cid)).filter(Boolean);
      if (!ciblesPartage.length) return { ok: false, messages: ["Cible(s) introuvable(s)."] };
      ciblesPartage.forEach((c) => {
        const msg = resoudreEffet({ type: "soin", formule: "1d8" }, { perso, rang: null, voie: null, cible: c, libelle, persos });
        if (msg) messages.push(msg);
      });
      p.pointsBenediction = (p.pointsBenediction || 0) - mecanique.coutPointsBenediction;
      messages.push(`Points de Bénédiction -${mecanique.coutPointsBenediction} (${p.pointsBenediction} restants).`);
      App.sauverPersos(persos);
      return { ok: true, messages };
    }

    // Moine — Voie des éléments, rang 1 "Poing élémentaire" (1x/tour) :
    // choix à l'activation entre 4 éléments (feu/glace/terre/air, via
    // mecanique.effets[].choix — modal générique déjà utilisé par Toucher
    // flétrissant/Posture de combat), posé comme état 'element_actif' sur
    // le lanceur avec le choix mémorisé dans un champ extra.element. Résolu
    // ici plutôt que par resoudreEffet générique car le choix détermine un
    // ÉTAT DIFFÉRENT à poser, pas seulement une valeur alternative. Lu à la
    // prochaine attaque à mains nues touchée (Voie des poings, cf. le hook
    // dans la branche "degats" de resoudreEffet ci-dessous). Un seul élément
    // actif à la fois : remplace toute entrée précédente.
    if (source.voie === "Voie des éléments" && source.rang === 1 && perso.classe === "moine") {
      const element = choixEffet || "feu";
      p.etatsActifs = (p.etatsActifs || []).filter((e) => e.idEtat !== "element_actif");
      appliquerEtatSurPerso(p, { id: "element_actif", duree: "1" }, libelle, { perso, rang: source.rang }, { element });
      messages.push(`Élément actif : ${element} (jusqu'au tour suivant).`);
      usage.appliquer();
      App.sauverPersos(persos);
      return { ok: true, messages };
    }

    // Moine — Voie de l'élévation, rang 4 "Avalanche de coups" (1x/combat) :
    // hors du schéma mecanique.jetOppose standard (celui-ci ne résout qu'UN
    // seul jet d'attaque) — boucle de jets d'attaque au contact vs DEF de la
    // MÊME cible jusqu'au premier raté (1 naturel = raté automatique, comme
    // le reste du moteur ; critique = touche et continue), puis inflige
    // autant de dés de dégâts que d'attaques touchées, taille du dé lue sur
    // le rang de Voie des poings le plus haut acquis (d4 par défaut si non
    // investie — assomption, à valider avec Thomas). Retourne tôt : ne passe
    // jamais par le bloc jetOppose générique ci-dessous.
    if (source.voie === "Voie de l'élévation" && source.rang === 4 && perso.classe === "moine") {
      if (!cible) return { ok: false, messages: ["Choisis une cible avant d'activer Avalanche de coups."] };
      const defCible = obtenirDefCible(cible, persos);
      const bonusAtk = perso.bonusAttaque("contact");
      const critMin = perso.critMinAttaque("contact");
      const MAX_JETS = 20; // garde-fou : au-delà, un 1 naturel est quasi certain
      const detailsJets = [];
      let touches = 0;
      let arreteParRate = false;
      for (let i = 0; i < MAX_JETS; i++) {
        const d20 = App.lancerDe(20);
        const total = d20 + bonusAtk;
        const critique = d20 === 20 || (critMin && d20 >= critMin);
        const rate = d20 === 1 || (!critique && defCible !== null && total < defCible);
        detailsJets.push(`${total}${critique ? "!" : ""}`);
        if (rate) { arreteParRate = true; break; }
        touches++;
      }
      App.ajouterHisto(`${libelle} — Jets d'attaque`, touches, false, false, detailsJets.join(", "));
      messages.push(`Avalanche de coups : ${detailsJets.length} jet(s) [${detailsJets.join(", ")}]` +
        (defCible !== null ? ` vs DEF ${defCible}` : " — DEF cible inconnue, comparaison manuelle") +
        (arreteParRate ? ` — ${touches} touché(s) avant le premier raté.` : ` — ${touches} touché(s), plafond de ${MAX_JETS} jets atteint sans raté (garde-fou).`));
      if (touches > 0) {
        const rangPoings = perso.rangMaxVoie("Voie des poings");
        const voiePoings = perso.classeDef && perso.classeDef.voies.find((v) => v.nom === "Voie des poings");
        const rgPoings = rangPoings && voiePoings && voiePoings.rangs.find((r) => r.rang === rangPoings);
        const effetPoings = rgPoings && rgPoings.mecanique.effets.find((e) => e.type === "degats");
        const mFaces = effetPoings && /^\d*d(\d+)/.exec(effetPoings.formule);
        const faces = mFaces ? parseInt(mFaces[1], 10) : 4;
        const msg = resoudreEffet({ type: "degats", formule: `${touches}d${faces}`, elementaire: null },
          { perso, rang: source.rang, voie: source.voie, cible, libelle, persos });
        if (msg) messages.push(msg);
      } else {
        messages.push("Aucune touche : pas de dégâts.");
      }
      usage.appliquer();
      App.sauverPersos(persos);
      return { ok: true, messages };
    }

    // Druide — Voie de la nature, rang 3 "Combat au bâton" : DEUX attaques de
    // contact FIXES contre la DEF de la même cible (contrairement à Avalanche
    // de coups du Moine ci-dessus, qui boucle jusqu'au premier raté) — hors
    // du schéma mecanique.jetOppose standard (celui-ci ne résout qu'UN seul
    // jet). Chacune 1d6+Mod.FOR ou 1d6+Mod.DEX selon le choix fait à
    // l'activation (choixEffet, cf. données) — même caractéristique pour les
    // deux attaques (assomption documentée dans la donnée). Retourne tôt.
    if (source.voie === "Voie de la nature" && source.rang === 3 && perso.classe === "druide") {
      if (!cible) return { ok: false, messages: ["Choisis une cible avant d'activer Combat au bâton."] };
      const statChoisie = choixEffet === "DEX" ? "DEX" : "FOR";
      const defCible = obtenirDefCible(cible, persos);
      const bonusAtk = perso.bonusAttaque("contact");
      const critMin = perso.critMinAttaque("contact");
      let totalDegats = 0;
      const detailsAttaques = [];
      for (let i = 0; i < 2; i++) {
        const d20 = App.lancerDe(20);
        const totalAtk = d20 + bonusAtk;
        const critique = d20 === 20 || (critMin && d20 >= critMin);
        const echecCritique = d20 === 1;
        const touche = !echecCritique && (critique || defCible === null || totalAtk >= defCible);
        let detail = `${totalAtk}${critique ? "!" : ""}`;
        if (touche) {
          const { total: deg, detail: detDeg } = resoudreExpression(`1d6+Mod.${statChoisie}`, { perso, rang: source.rang, critique });
          totalDegats += deg;
          detail += ` touché (${deg} DM : ${detDeg})`;
        } else {
          detail += echecCritique ? " raté (1 naturel)" : " raté";
        }
        detailsAttaques.push(detail);
      }
      App.ajouterHisto(`${libelle} — Attaques (Mod.${statChoisie})`, totalDegats, false, false, detailsAttaques.join(" | "));
      messages.push(`Combat au bâton (Mod.${statChoisie}) : ${detailsAttaques.join(" | ")}` +
        (defCible !== null ? ` vs DEF ${defCible}` : " — DEF cible inconnue, comparaison manuelle") +
        ` — ${totalDegats} DM au total.`);
      if (totalDegats > 0) {
        if (cible.genre === "monstre" && typeof Carte !== "undefined") {
          const res = Carte.appliquerDegatsCombat(cible.id, totalDegats);
          if (res) messages.push(`→ ${res.nom} : ${res.pvActuel} PV restants.`);
        } else if (cible.genre === "perso" && persos[cible.id]) {
          const res = appliquerDegatsPersoLocal(persos[cible.id], totalDegats);
          messages.push(`→ ${cible.nom} : ${res.pvActuel} PV restants.`);
        }
      }
      usage.appliquer();
      App.sauverPersos(persos);
      return { ok: true, messages };
    }

    // Moine — Voie des éléments, rang 4 "Fusion élémentaire" (1x/combat) :
    // substitue mecanique.effets par le combo choisi (cf.
    // FUSIONS_ELEMENTAIRES_MOINE) puis laisse le reste de lancer() dérouler
    // normalement (attaque au contact vs DEF déjà déclarée dans la donnée,
    // résolution différée degats/etat comme toute autre capacité) — pas de
    // retour anticipé ici, contrairement à Poing élémentaire/Avalanche.
    if (source.voie === "Voie des éléments" && source.rang === 4 && perso.classe === "moine") {
      const combo = FUSIONS_ELEMENTAIRES_MOINE[choixEffet] || FUSIONS_ELEMENTAIRES_MOINE.feu_glace;
      mecanique = Object.assign({}, mecanique, { effets: combo.effets });
      messages.push(`Fusion élémentaire : ${combo.nom}.`);
    }

    // Druide — Voie des compagnons, rang 5 "Forme animale" : substitue
    // mecanique.effets par le profil choisi (cf. FORMES_ANIMALES_DRUIDE),
    // même principe que Fusion élémentaire ci-dessus — pas de jetOppose ici
    // (cible: "soi"), les effets s'appliquent directement via la boucle
    // standard plus bas, sans retour anticipé.
    if (source.voie === "Voie des compagnons" && source.rang === 5 && perso.classe === "druide") {
      const forme = FORMES_ANIMALES_DRUIDE[choixEffet] || FORMES_ANIMALES_DRUIDE.ours;
      mecanique = Object.assign({}, mecanique, { effets: forme.effets });
      messages.push(`Forme animale : ${forme.nom}.`);
    }

    // Barde — Voie de l'alcoolisme (rangs 1 à 5, "Premier brassage" →
    // "Nectar ultime") : chaque dose impose un test de CON à DD fixe
    // (12/14/16/18/20 selon le rang) — échec → le bonus (choisi via
    // effet.choix, cf. données) est divisé par 2 (arrondi inférieur, même
    // convention que le demi-RD du Chasseur "Trophée ultime") et le Barde
    // gagne 1 point d'état Ivresse. Ivresse cumulable : chaque échec pose une
    // NOUVELLE entrée etatsActifs distincte (jamais fusionnée, comme tout
    // autre état du catalogue) — le total de points = nombre d'entrées
    // actives. Le malus global qui en découle ("-1 à tous les tests par
    // point") reste non automatisé : aucun malus "tous les tests" n'est câblé
    // nulle part dans l'app (Fatiguée/Halluciné ont le même statut, retrait
    // manuel comme le reste des états qui n'expirent pas seuls) — pas une
    // limite propre au Barde.
    if (source.voie === "Voie de l'alcoolisme" && perso.classe === "barde" && [1, 2, 3, 4, 5].includes(source.rang)) {
      const DD_ALCOOL = { 1: 12, 2: 14, 3: 16, 4: 18, 5: 20 };
      const dd = DD_ALCOOL[source.rang];
      const modCON = perso.mod("CON");
      const d20 = App.lancerDe(20);
      const totalCON = d20 + modCON;
      const reussite = totalCON >= dd;
      App.ajouterHisto(`${libelle} — Test de CON`, totalCON, false, false, `d20[${d20}] ${modCON >= 0 ? "+" : ""}${modCON} vs ${dd}`);
      if (reussite) {
        messages.push(`Test de CON : ${totalCON} vs ${dd} — réussi, dose pleine.`);
      } else {
        mecanique = Object.assign({}, mecanique, {
          effets: mecanique.effets.map((e) => (e.type === "bonus" && e.cible === "choix")
            ? Object.assign({}, e, { valeur: Math.floor(e.valeur / 2) }) : e),
        });
        const msgIvresse = resoudreEffet({ type: "etat", id: "ivresse", duree: "permanente" },
          { perso, rang: source.rang, voie: source.voie, cible, libelle, persos });
        messages.push(`Test de CON : ${totalCON} vs ${dd} — échec, bonus divisé par 2. ${msgIvresse || ""}`);
      }
    }

    // jetSauvegardeFixe (Enchanteur — Voie du chaos, rang 3 "Illusion de
    // masse") : DD FIXE (pas calculé depuis une carac de l'attaquant comme
    // jetOppose) — la CIBLE fait elle-même le jet de résistance. Bloque
    // l'application des effets etat/degats de mecanique.effets (boucle plus
    // bas) sur une réussite ; non automatisable pour un monstre (le
    // bestiaire n'expose pas ses modificateurs de caractéristique, même
    // limite que jetOppose.caracDefenseur ≠ "DEF"/"defMentale" plus bas) —
    // les effets ne sont alors jamais appliqués automatiquement. Rang 4
    // "Murmure terrifiant" (jetSauvegardeFixe + table à paliers) est un cas
    // particulier distinct, déjà résolu plus haut, retourné tôt.
    let saveBloqueEffets = false;
    if (mecanique.jetSauvegardeFixe) {
      const { carac, dd } = mecanique.jetSauvegardeFixe;
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        const cibPerso = Personnage.depuisJSON(persos[cible.id]);
        // carac (ex. "Volonte") est un NOM DE SAUVEGARDE (cf. SAUVEGARDES,
        // data/donnees.js), pas un code de caractéristique brut.
        const modCible = cibPerso.mod((typeof SAUVEGARDES !== "undefined" && SAUVEGARDES[carac]) || carac);
        const d20c = App.lancerDe(20);
        const totalC = d20c + modCible;
        const reussite = totalC >= dd;
        App.ajouterHisto(`${libelle} — Sauvegarde de ${cible.nom} (${carac})`, totalC, false, false, `d20[${d20c}] ${modCible >= 0 ? "+" : ""}${modCible} vs ${dd}`);
        messages.push(`Sauvegarde de ${cible.nom} (${carac}) : ${totalC} vs ${dd} — ${reussite ? "réussie, aucun effet." : "échec, effets appliqués ci-dessous."}`);
        saveBloqueEffets = reussite;
      } else {
        messages.push(`Sauvegarde (${carac}) DD ${dd} — non automatisable ${cible ? `pour ${cible.nom} (monstre)` : "(aucune cible sélectionnée)"} : le bestiaire n'expose pas ses modificateurs de caractéristique. Effets à appliquer manuellement selon le jet fait à la table.`);
        saveBloqueEffets = true;
      }
    }

    // caracDefenseurCalcule (Enchanteur — Voie de l'enchantement rang 2
    // "Fascination", cf. obtenirDefPlusPvMoitieCible) : même pipeline
    // touché/critique/dégâts qu'une attaque vs DEF classique, mais le seuil
    // à battre est un DEF+PV/2 calculé plutôt que la simple DEF de la cible.
    // "DEF" (armure) et "defMentale" (Volonté dérivée, cf. obtenirVolonteCible,
    // ajouté en parallèle sur origin/thomas/contributions) se résolvent
    // pareil : 1d20+attaque vs une valeur cible. Seuls la valeur opposée et
    // le libellé changent.
    const cd0 = mecanique.jetOppose && mecanique.jetOppose.caracDefenseur;
    // Sauvegardes RÉACTIVES (04/08/2026) : defMentale et les clés de
    // SAUVEGARDES ne passent plus par le pipeline d'attaque — le lanceur ne
    // jette plus, il pose un DD que la cible tente de battre. defMentale est
    // un alias historique de "Volonte" : les données le portent encore sur
    // Domination / Éclat chaotique / Drain d'âme, inutile de les migrer tant
    // que l'alias est traité ici.
    const nomSauvegarde = cd0 === "defMentale" ? "Volonte"
      : (cd0 && typeof SAUVEGARDES !== "undefined" && SAUVEGARDES[cd0]) ? cd0
      : null;
    const attaqueVsDef = !!(mecanique.jetOppose && !nomSauvegarde &&
      (cd0 === "DEF" || mecanique.jetOppose.caracDefenseurCalcule));
    // estDefMentale : conservée pour la branche attaqueVsDef ci-dessous
    // (bloc non modifié par ce chantier) même si elle ne peut plus valoir
    // true en pratique — cd0 === "defMentale" rend nomSauvegarde truthy,
    // donc bascule désormais dans la branche réactive avant d'atteindre ce
    // code. La retirer casserait la référence plus bas (obtenirVolonteCible).
    const estDefMentale = cd0 === "defMentale";
    const libelleDef = "DEF";

    if (mecanique.jetOppose && nomSauvegarde) {
      // --- Branche réactive -------------------------------------------
      // Court-circuite entièrement le bloc jetOppose classique ci-dessous :
      // aucun jet du lanceur, donc ni critique ni échec critique de son côté.
      // Le critique est déplacé sur le 1 naturel de la CIBLE (compensation
      // validée le 04/08/2026), pour conserver un taux de 5 % de dégâts
      // doublés sur ces sorts.
      // groupeJetId : tag partagé entre le jet de sauvegarde ci-dessous et le
      // jet de dégâts/effet qui le suit immédiatement (cf. plus bas) — permet
      // à l'overlay de dés (js/app.js, afficherOverlayJet) d'afficher les
      // deux jets côte à côte plutôt que le second n'écrase le premier.
      const groupeJetId = `${persoId}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      const resSauv = _resoudreSauvegardeReactive({
        perso, persos, cible, mecanique, nomSauvegarde, libelle, source, groupeJetId,
      });
      messages.push(...resSauv.messages);
      if (resSauv.modCible !== null) {
        // modeSauvegarde "moitie" (Boule de feu/Éclair localisé et les
        // autres sorts de zone à dégâts, cf. data/donnees.js) : une
        // sauvegarde réussie n'annule PAS les dégâts, elle les divise par
        // deux — contrairement au reste du pipeline (touche === false =
        // aucun dégât). `touche` reste donc vrai dans les deux cas.
        const estMoitie = mecanique.jetOppose.modeSauvegarde === "moitie";
        resolutionDegats = {
          touche: estMoitie ? true : !resSauv.reussite,
          critique: resSauv.echecCritique,
          echecCritique: false,
          totalAttaque: null,
          defCible: resSauv.dd,
          multiplicateurDegats: (estMoitie && resSauv.reussite) ? 0.5 : 1,
          persoId, source, mecanique, cible, choixEffet,
        };
        // Résolution IMMÉDIATE des effets différés (degats/etat) : contrairement
        // à l'ancien pipeline vs DEF (où une DEF cible inconnue pouvait laisser
        // `touche` incertain, d'où le bouton "Lancer les dégâts" pour un second
        // clic explicite), la branche réactive connaît déjà `touche` de façon
        // définitive dès que modCible !== null — plus besoin d'attendre un
        // second clic. Tagué avec le même groupeJetId que la sauvegarde
        // ci-dessus, pour l'overlay à deux dés côte à côte.
        if (resolutionDegats.touche !== false) {
          const aEffetsDifferes = (mecanique.effets || []).some((e) => TYPES_EFFETS_DIFFERES.includes(e.type) || e.differe);
          if (aEffetsDifferes) {
            (mecanique.effets || []).forEach((effet) => {
              if (!TYPES_EFFETS_DIFFERES.includes(effet.type) && !effet.differe) return;
              const effetResolu = (effet.cible === "choix" && choixEffet) ? Object.assign({}, effet, { cible: choixEffet }) : effet;
              const msg = resoudreEffet(effetResolu, {
                perso, rang: source.rang, voie: source.voie, cible, libelle, persos,
                critique: resolutionDegats.critique, multiplicateurDegats: resolutionDegats.multiplicateurDegats, groupeJetId,
              });
              if (msg) messages.push(msg);
            });
            effetsReactifsDejaResolus = true;
            resolutionDegats = null;
          }
        }
      }
    } else if (mecanique.jetOppose) {
      const ca = mecanique.jetOppose.caracAttaquant;
      const bonus = _bonusAttaquantJetOppose(perso, mecanique.jetOppose);
      // typeAttaque : "contact"/"distance"/"magique", pour Personnage.
      // critMinAttaque(type) — les 28 rangs jetOppose vs DEF du jeu ont
      // toujours un caracAttaquant parmi ces trois valeurs (vérifié dans
      // data/donnees.js), jamais un Mod.XXX brut. Calculé séparément de
      // _bonusAttaquantJetOppose (qui ne renvoie que le bonus) : ce n'est
      // qu'un aiguillage sur `ca`, pas une seconde source de vérité.
      const typeAttaque = (ca === "attaqueMagique") ? "magique" : (ca === "attaqueContact") ? "contact" : (ca === "attaqueDistance") ? "distance" : null;
      const d20 = App.lancerDe(20);
      const total = d20 + bonus;
      App.ajouterHisto(`${libelle} — Jet d'attaque`, total, d20 === 20, d20 === 1, `d20[${d20}] ${bonus >= 0 ? "+" : ""}${bonus}`);

      if (attaqueVsDef) {
        // Règles : 1 naturel = échec critique (raté systématique) ; 20 naturel
        // ou jet >= seuil de critique de l'arme (critMinAttaque, qui intègre
        // déjà l'affixe "Aiguisé", cf. js/affixes.js) = critique (touche
        // toujours, dégâts doublés) ; sinon touché si total >= DEF cible.
        const critMin = typeAttaque ? perso.critMinAttaque(typeAttaque) : 20;
        const echecCritique = d20 === 1;
        const critique = !echecCritique && (d20 === 20 || d20 >= critMin);
        const defCible = estDefMentale ? obtenirVolonteCible(cible, persos)
          : mecanique.jetOppose.caracDefenseurCalcule === "DEF+PVactuels/2" ? obtenirDefPlusPvMoitieCible(cible, persos)
          : obtenirDefCible(cible, persos);
        let touche;
        if (echecCritique) touche = false;
        else if (critique) touche = true;
        else if (defCible === null) touche = null; // valeur inconnue : ne pas bloquer, à trancher manuellement
        else touche = total >= defCible;

        if (echecCritique) {
          messages.push(`Jet d'attaque : ${total} (d20[${d20}] ${bonus >= 0 ? "+" : ""}${bonus}) — 1 naturel, échec critique automatique.`);
        } else if (critique) {
          messages.push(`Jet d'attaque : ${total} (d20[${d20}] ${bonus >= 0 ? "+" : ""}${bonus}) — CRITIQUE !` +
            (defCible !== null ? ` (${libelleDef} cible ${defCible})` : ""));
        } else if (defCible === null) {
          messages.push(`Jet d'attaque : ${total} (d20[${d20}] ${bonus >= 0 ? "+" : ""}${bonus}) — ${libelleDef} de la cible inconnue, à comparer manuellement.`);
        } else {
          messages.push(`Jet d'attaque : ${total} (d20[${d20}] ${bonus >= 0 ? "+" : ""}${bonus}) vs ${libelleDef} ${defCible} — ${touche ? "Touché !" : "Raté."}`);
        }

        // Table de mutation Palier 1 (cf. MUTATION_PALIER1_TRIGGERS/
        // _rollMutationPalier1 plus haut) : déclenché sur le jet de dé
        // lui-même (indépendant de touché/raté), donc résolu ici plutôt que
        // dans resoudreDegatsEnAttente.
        if (source.voie === "Voie du chaos" && source.rang === 3 && MUTATION_PALIER1_TRIGGERS[perso.classe]) {
          const modeMutation = MUTATION_PALIER1_TRIGGERS[perso.classe];
          const declencheMutation = modeMutation === "critique" ? critique
            : modeMutation === "echecCritique" ? echecCritique
            : modeMutation === "naturel18" ? d20 >= 18
            : modeMutation === "naturel19" ? d20 >= 19
            : false;
          if (declencheMutation) messages.push(_rollMutationPalier1(p, libelle).trim());
        }

        resolutionDegats = { touche, critique, echecCritique, totalAttaque: total, defCible, persoId, source, mecanique, cible, choixEffet };
      } else {
        // caracDefenseur ≠ "DEF" (ex. "CHA"/"SAG" pour les tests opposés de
        // séduction/Chaos du Barde, "Volonte" pour Requiem du silence) :
        // jamais automatisable côté monstre — le bestiaire (data/bestiaire.
        // json) n'expose que pv/def/init/atk, aucun modificateur de
        // caractéristique individuel (CHA/SAG/...) à opposer. Le jet de
        // l'activateur est donc affiché seul ; on nomme au moins la
        // caractéristique à comparer, pour éviter au MJ de rouvrir la donnée.
        const cd = mecanique.jetOppose.caracDefenseur;
        messages.push(`Jet d'attaque : ${total} (d20 ${d20} ${bonus >= 0 ? "+" : ""}${bonus}) — à comparer au jet de résistance` +
          (cd ? ` de ${cd}` : "") + ` de la cible (non automatisable : le bestiaire ne porte pas ses modificateurs de caractéristiques).`);
      }
    }

    // Test de Volonté générique (mecanique.testVolonte : { carac,
    // difficulteFixe }, ex. Guerrier "Rage incontrôlée"/"Déchaînement", Voie
    // du chaos) — contrairement à jetOppose ci-dessus (toujours un jet de
    // L'ACTIVATEUR contre la DEF/DD d'UNE CIBLE), ceci est un jet de
    // résistance du LANCEUR sur lui-même, sans cible : mecanique.
    // jetOppose.difficulteFixe existe dans les données depuis longtemps
    // (pièges de l'Ingénieur) mais n'a jamais été lu par le moteur — ce champ
    // dédié évite de surcharger jetOppose d'une sémantique qu'il ne gérait
    // pas. Un échec ne bloque/gate aucun effet automatiquement (contrairement
    // à attaqueVsDef) : seule la cible forcée est calculée et nommée dans le
    // message, son application reste manuelle (cf. note de donnée).
    if (mecanique.testVolonte) {
      const { carac, difficulteFixe, echecEffets } = mecanique.testVolonte;
      const modCarac = perso.mod(carac);
      const d20v = App.lancerDe(20);
      const totalV = d20v + modCarac;
      const reussite = totalV >= difficulteFixe;
      App.ajouterHisto(`${libelle} — Test de Volonté (${carac})`, totalV, false, false,
        `d20[${d20v}] ${modCarac >= 0 ? "+" : ""}${modCarac} vs ${difficulteFixe}`);
      if (reussite) {
        messages.push(`Test de Volonté (${carac}) : ${totalV} vs ${difficulteFixe} — réussi, aucun contrecoup.`);
      } else if (echecEffets) {
        // Contrecoup direct sur le lanceur (ex. Magicien "Avatar du Vide") :
        // contrairement à la redirection d'attaque du Guerrier ci-dessous,
        // l'échec applique ici un ou plusieurs effets (etat/degats/...) sur
        // le lanceur lui-même — réutilise resoudreEffet tel quel avec une
        // cible "soi" synthétique, même construction que mecanique.cible ===
        // "soi" plus haut dans lancer().
        const cibleSoi = { id: persoId, nom: p.nom, genre: "perso", soi: true };
        messages.push(`Test de Volonté (${carac}) : ${totalV} vs ${difficulteFixe} — échec, contrecoup :`);
        echecEffets.forEach((effet) => {
          const msg = resoudreEffet(effet, { perso, rang: source.rang, voie: source.voie, cible: cibleSoi, libelle, persos });
          if (msg) messages.push(msg);
        });
      } else {
        const forcee = cibleCreaturePlusProche(persoId);
        messages.push(`Test de Volonté (${carac}) : ${totalV} vs ${difficulteFixe} — échec, l'attaque doit cibler ` +
          (forcee ? `${forcee.nom} (le plus proche).` : `la créature la plus proche (aucune détectée sur la table de combat).`));
      }
    }

    (mecanique.effets || []).forEach((effet) => {
      // Différé : résolu plus tard par resoudreDegatsEnAttente(), une fois la
      // touche confirmée (cf. resolutionDegats ci-dessus). effet.differe :
      // marqueur PAR EFFET (pas par type) pour un cas ponctuel où un effet
      // normalement non différé (ex. 'bonus') doit l'être quand même — ex.
      // Moine "Précision instinctive" (Voie de l'élévation rang 3, test de
      // Perception vs DEF) : le +2 à la prochaine attaque ne doit s'appliquer
      // QUE si le test touche, contrairement au comportement standard des
      // effets 'bonus' (toujours appliqués, cf. Requiem du silence du Barde,
      // documenté plus haut) — sans changer ce comportement par défaut pour
      // toutes les autres capacités 'bonus' déjà en jeu.
      if (saveBloqueEffets) return;
      // resolutionDegats (pas attaqueVsDef seul, depuis les sauvegardes
      // réactives du 04/08/2026) : signale qu'une résolution différée est
      // effectivement en attente — attaqueVsDef le pose toujours (branche
      // historique vs DEF), la branche réactive seulement si modCible !==
      // null (cf. _resoudreSauvegardeReactive). Sans ce garde-fou sur
      // resolutionDegats, un sort à sauvegarde (defMentale/SAUVEGARDES)
      // appliquait ses dégâts ICI en plus de leur ré-application par
      // resoudreDegatsEnAttente() — double comptage découvert en testant
      // Drain d'âme. effetsReactifsDejaResolus : même garde-fou pour la
      // branche réactive "moitie" ci-dessus, qui résout ses effets différés
      // immédiatement et remet resolutionDegats à null ensuite (plus de
      // bouton "Lancer les dégâts" à afficher) — sans ce second drapeau,
      // resolutionDegats étant redevenu null, cette boucle les réappliquerait.
      if ((resolutionDegats || effetsReactifsDejaResolus) && (TYPES_EFFETS_DIFFERES.includes(effet.type) || effet.differe)) return;
      // Enchanteur — Voie de l'enchantement, rang 3 "Image décalée
      // (évolution)" : remplace le bonus DEF+1 du sort 'illusion' (rang 1,
      // même voie) par l'état 'image_decalee' (déjà au catalogue js/etats.js
      // — "prochaine attaque ratée", même sémantique que l'ancien rang 1
      // qu'il remplace) dès ce rang 3 acquis. Coût PP inchangé (géré par
      // coutPPReel plus haut, indépendant du choix d'effet).
      let effetVoieAjuste = effet;
      if (perso.classe === "enchanteur" && source.voie === "Voie de l'enchantement" && source.rang === 1
          && effet.type === "bonus" && effet.cible === "DEF"
          && perso.rangMaxVoie("Voie de l'enchantement") >= 3) {
        effetVoieAjuste = { type: "etat", id: "image_decalee", duree: "3" };
      }
      // effet.cible === "choix" : substitue la vraie cible choisie à l'activation
      // (copie superficielle — ne jamais muter l'objet effet d'origine, partagé
      // par tous les personnages via data/donnees.js).
      const effetResolu = (effetVoieAjuste.cible === "choix" && choixEffet) ? Object.assign({}, effetVoieAjuste, { cible: choixEffet }) : effetVoieAjuste;
      const msg = resoudreEffet(effetResolu, { perso, rang: source.rang, voie: source.voie, cible, libelle, persos });
      if (msg) messages.push(msg);
    });

    // Guerrier — Voie de l'ingénieur, rang 5 "Bastion improvisé" : le bonus
    // DEF de zone (effets[] ci-dessus) reste, comme documenté, une
    // application manuelle allié par allié (mecanique.cible = 'zone', jamais
    // résolu automatiquement faute de cibleId). Un marqueur dédié, distinct
    // de cette zone, est posé directement sur le perso brut (même approche
    // que corruptionCombat ci-dessous, PAS un etatsActifs "etat"/"bonus" —
    // ces deux mécanismes exigent une cible résolue, ce que 'zone' sans
    // cibleId ne fournit pas) : lu par app.js pour proposer l'attaque
    // d'opportunité (jetOppose vs DEF) dès qu'un monstre entre dans la zone,
    // tant que ce marqueur reste actif. Remis à zéro par Combat.terminerCombat().
    if (source.voie === "Voie de l'ingénieur" && source.rang === 5 && perso.classe === "guerrier") {
      p.bastionActifFinCombat = true;
    }

    // Magicien — Voie de la magie sauvage, rangs 2/4/5 : posent chacun un
    // drapeau consommé une seule fois par le PROCHAIN jet de Mutation
    // Sauvage (rang 1, cf. _rollMutationSauvage) — même approche que
    // bastionActifFinCombat ci-dessus (marqueur direct sur le perso brut,
    // pas un etatsActifs classique, puisqu'il n'y a ni cible ni durée en
    // tours à suivre, juste "s'applique à la prochaine résolution").
    if (source.voie === "Voie de la magie sauvage" && perso.classe === "magicien") {
      if (source.rang === 2) p.instinctChaotiqueActif = true;
      else if (source.rang === 4) p.maitriseChaosGarantieActif = true;
      else if (source.rang === 5) p.submersionArcaniqueActif = true;
    }

    // Chevalier — Voie du commandant, rang 5 "Charge collective" : en plus
    // de la marque posée sur l'ennemi choisi (effets[] ci-dessus, etat
    // 'marquee_chevalier'), accorde +5 cases de déplacement à TOUS les PJ
    // actuellement en combat (l'app ne gère pas "en vue" — simplification
    // assumée, comme les autres zones/auras de groupe déjà acceptées) : pose
    // l'état 'elan_commandant' (1 tour, cf. Combat._deplacementMax) sur
    // chaque perso brut, remplaçant toute pose précédente.
    if (source.voie === "Voie du commandant" && source.rang === 5 && perso.classe === "chevalier") {
      Object.keys(persos).forEach((pid) => {
        const pAllie = persos[pid];
        if (!pAllie) return;
        pAllie.etatsActifs = (pAllie.etatsActifs || []).filter((e) => e.idEtat !== "elan_commandant");
        appliquerEtatSurPerso(pAllie, { id: "elan_commandant", duree: "1" }, libelle, { perso, rang: source.rang });
      });
      messages.push("Charge collective : +5 cases de déplacement pour tous les PJ ce tour.");
    }

    // Guerrier — Voie du chaos, rang 5 "Déchaînement" : consomme TOUTE la
    // jauge de Corruption de Fureur actuelle (pas un coût fixe connu à
    // l'avance, contrairement à corruptionCout/corruptionCoutMin ci-dessous)
    // et la convertit intégralement en Corruption d'Âme — mécanique propre à
    // ce rang, hors du schéma générique.
    if (source.voie === "Voie du chaos" && source.rang === 5 && perso.classe === "guerrier") {
      const cfConsommees = p.corruptionCombat || 0;
      if (cfConsommees > 0) {
        p.corruptionCombat = 0;
        p.corruptionMajeure = (p.corruptionMajeure || 0) + cfConsommees;
        App.ajouterHisto(`${libelle} — Conversion CF→CA`, p.corruptionMajeure, false, false,
          `${cfConsommees} CF convertis en CA (${p.nom}, total CA : ${p.corruptionMajeure})`, { sansOverlay: true });
        messages.push(`Déchaînement : ${cfConsommees} CF convertis en Corruption d'Âme (total CA : ${p.corruptionMajeure}).`);
      }
    }

    // Voie du chaos : gain de corruption sur le LANCEUR (jamais la cible),
    // uniquement pour les rangs dont le gain est univoque (cf. commentaire
    // au-dessus de SEUIL_CORRUPTION_MAJEURE).
    if (mecanique.corruption) {
      p.corruptionCombat = (p.corruptionCombat || 0) + mecanique.corruption;
      const franchi = _verifierSeuilCorruptionMajeure(p);
      App.ajouterHisto(`${libelle} — Corruption`, p.corruptionCombat, false, false, `+${mecanique.corruption} (jauge de combat, ${p.nom})`, { sansOverlay: true });
      messages.push(`Corruption +${mecanique.corruption} (jauge de combat : ${p.corruptionCombat}/${SEUIL_CORRUPTION_MAJEURE}).` +
        (franchi ? ` ⚠️ Seuil dépassé — Corruption d'Âme +1 (total ${p.corruptionMajeure}), risque de mutation.` : ""));
    }
    // Coût en jauge de combat (cf. le garde-fou plus haut, déjà vérifié
    // suffisant à ce stade) : décompté une fois l'activation confirmée,
    // jamais en cas d'échec du garde-fou (qui a déjà renvoyé plus tôt).
    if (mecanique.corruptionCout) {
      p.corruptionCombat = Math.max(0, (p.corruptionCombat || 0) - mecanique.corruptionCout);
      App.ajouterHisto(`${libelle} — Corruption`, p.corruptionCombat, false, false, `-${mecanique.corruptionCout} (jauge de combat, ${p.nom})`, { sansOverlay: true });
      messages.push(`Corruption -${mecanique.corruptionCout} (jauge de combat : ${p.corruptionCombat}).`);
    }
    // Coût en réactions (cf. le garde-fou plus haut) : décompté une fois
    // l'activation confirmée, même logique que corruptionCout ci-dessus.
    if (mecanique.reactionCout) {
      p.reactionsUtilisees = (p.reactionsUtilisees || 0) + mecanique.reactionCout;
      const restantes = REACTIONS_MAX - p.reactionsUtilisees;
      App.ajouterHisto(`${libelle} — Réaction`, restantes, false, false, `-${mecanique.reactionCout} réaction(s) (${p.nom}, ${restantes}/${REACTIONS_MAX} restantes)`, { sansOverlay: true });
      messages.push(`Réaction(s) -${mecanique.reactionCout} (${restantes}/${REACTIONS_MAX} restantes ce combat).`);
    }
    // Coût en Points de Pouvoir (cf. le garde-fou plus haut) : décompté une
    // fois l'activation confirmée, même logique que reactionCout ci-dessus.
    // Prêtre "Don corrompu" (substitutionCS, cf. garde-fou plus haut) :
    // décompte des CS à la place, même coût dérivé (rang du sort = coutPPReel/2).
    if (substitutionCS) {
      const coutCS = Math.max(1, Math.round(coutPPReel / 2));
      p.corruptionCombat = (p.corruptionCombat || 0) - coutCS;
      messages.push(`Don corrompu : ${coutCS} CS payés à la place des PP (${p.corruptionCombat} CS restants).`);
    } else if (coutPPReel) {
      p.ppActuel = (p.ppActuel || 0) - coutPPReel;
      // Remous (accord explicite de Thomas, 09/08/2026, cf.
      // prompt_remous_ui.md §3) : alimente la jauge de Remous du lieu
      // avec le coût PP réellement décompté.
      if (typeof Remous !== "undefined") Remous.ajouter(p, coutPPReel);
      App.ajouterHisto(`${libelle} — PP`, p.ppActuel, false, false, `-${coutPPReel} PP (${p.nom}, ${p.ppActuel} restants)`, { sansOverlay: true });
      messages.push(`PP -${coutPPReel} (${p.ppActuel} restants).`);
    }
    // Points de Cercle (cf. le garde-fou plus haut, RESSOURCES_CERCLE) :
    // décompté une fois l'activation confirmée. Le Supplément corrompu
    // éventuel a déjà été appliqué au garde-fou (jauge CS + pool ramené à 0) —
    // ici on ne décompte que ce qu'il restait à payer normalement.
    [
      { cout: "coutPointsBenediction", champ: "pointsBenediction", nom: "Points de Bénédiction" },
      { cout: "coutPointsConviction", champ: "pointsConviction", nom: "Points de Conviction" },
      { cout: "coutPointsBannissement", champ: "pointsBannissement", nom: "Points de Bannissement" },
      { cout: "coutPointsJugement", champ: "pointsJugement", nom: "Points de Jugement" },
    ].forEach((r) => {
      if (!mecanique[r.cout]) return;
      p[r.champ] = Math.max(0, (p[r.champ] || 0) - mecanique[r.cout]);
      messages.push(`${r.nom} -${mecanique[r.cout]} (${p[r.champ]} restants).`);
    });
    // Gain/coût en âmes stockées (cf. AMES_MAX plus haut) : décompté une fois
    // l'activation confirmée, même logique que corruptionCout/reactionCout.
    if (mecanique.ameGain) {
      p.amesStockees = Math.min(AMES_MAX, (p.amesStockees || 0) + mecanique.ameGain);
      App.ajouterHisto(`${libelle} — Âme capturée`, p.amesStockees, false, false, `+${mecanique.ameGain} âme(s) (${p.nom}, ${p.amesStockees}/${AMES_MAX} en réserve)`, { sansOverlay: true });
      messages.push(`Âme(s) capturée(s) +${mecanique.ameGain} (${p.amesStockees}/${AMES_MAX} en réserve).`);
    }
    if (mecanique.ameCout) {
      p.amesStockees = Math.max(0, (p.amesStockees || 0) - mecanique.ameCout);
      App.ajouterHisto(`${libelle} — Âme libérée`, p.amesStockees, false, false, `-${mecanique.ameCout} âme(s) (${p.nom}, ${p.amesStockees}/${AMES_MAX} en réserve)`, { sansOverlay: true });
      messages.push(`Âme(s) libérée(s) -${mecanique.ameCout} (${p.amesStockees}/${AMES_MAX} en réserve).`);
    }

    // Consommé dès le jet d'attaque, même en cas de raté — jamais décalé à
    // resoudreDegatsEnAttente(), qui ne revérifie/redécompte pas l'usage.
    usage.appliquer && usage.appliquer();
    App.sauverPersos(persos);

    return { ok: true, messages, resolutionDegats };
  }

  // Résout les effets degats/etat DIFFÉRÉS par lancer() pour une capacité
  // d'attaque vs DEF, une fois que l'appelant a confirmé `touche` (true ou
  // null — DEF inconnue, cf. lancer()). Recharge/sauve `persos` lui-même
  // (nouvel appel : ne réutilise jamais la map chargée pendant lancer(),
  // potentiellement périmée entre le jet d'attaque et le clic sur "Dégâts",
  // ex. un autre joueur a agi entre-temps).
  function resoudreDegatsEnAttente(resolutionDegats) {
    if (!resolutionDegats || resolutionDegats.touche === false) {
      return { ok: false, messages: ["Cette attaque n'a pas touché — aucun dégât à résoudre."] };
    }
    const { persoId, source, mecanique, cible, critique, choixEffet, multiplicateurDegats } = resolutionDegats;
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return { ok: false, messages: ["Personnage introuvable."] };
    const perso = Personnage.depuisJSON(p);
    // cf. commentaire équivalent dans lancer() : p.ppActuel peut être absent
    // du JSON brut pour un personnage jamais reposé.
    if (p.ppActuel == null) p.ppActuel = perso.ppActuel;
    const libelle = source.nomCap || "Capacité";

    const messages = [];
    (mecanique.effets || []).forEach((effet) => {
      if (!TYPES_EFFETS_DIFFERES.includes(effet.type) && !effet.differe) return;
      // effet.cible === "choix" différé (ex. Barde "Note discordante") : même
      // substitution que dans lancer() ci-dessus, à partir du choix capturé
      // au moment du jet d'attaque (resolutionDegats.choixEffet).
      const effetResolu = (effet.cible === "choix" && choixEffet) ? Object.assign({}, effet, { cible: choixEffet }) : effet;
      const msg = resoudreEffet(effetResolu, { perso, rang: source.rang, voie: source.voie, cible, libelle, persos, critique, multiplicateurDegats });
      if (msg) messages.push(msg);
    });

    App.sauverPersos(persos);
    return { ok: true, messages };
  }

  // Réactions restantes d'un perso brut ce combat (cf. mecanique.reactionCout) —
  // lu par app.js pour afficher/griser les boutons de réaction.
  function reactionsRestantes(p) {
    return REACTIONS_MAX - ((p && p.reactionsUtilisees) || 0);
  }

  return {
    resoudreExpression,
    resoudreDureeInitiale,
    decompterEtatsDebutTour,
    retirerEtatsFinCombat,
    ajusterCorruptionCombat,
    SEUIL_CORRUPTION_MAJEURE,
    REACTIONS_MAX,
    reactionsRestantes,
    cleCapacite,
    parserFrequence,
    verifierUsage,
    reinitialiserUsage,
    reinitialiserUsagesPeriode,
    listeCibles,
    obtenirDefCible,
    bonusDefAuraPeuple,
    bonusDefGardeRapprochee,
    cibleCreaturePlusProche,
    lancer,
    resoudreDegatsEnAttente,
    // Exposée pour _declencherEnnemiTue (js/app.js, cf. "drainante_os",
    // armure_ossements, lot "armes/accessoires D") : PV temporaires du
    // légendaire, hors du chemin normal resoudreEffet — n'était jusqu'ici
    // qu'une fonction interne, jamais appelée depuis l'extérieur du module.
    appliquerPvTemporairesSurPerso,
  };
})();

if (typeof window !== "undefined") window.Capacites = Capacites;
