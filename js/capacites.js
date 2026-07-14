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
        const jets = [];
        for (let i = 0; i < nb; i++) jets.push(App.lancerDe(faces));
        valeur = jets.reduce((a, b) => a + b, 0);
        libelle = `${brut}[${jets.join(",")}]`;
        if (critique) {
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

  // DEF numérique d'une cible (issue de listeCibles), ou null si indisponible
  // — sert à déterminer touché/raté pour les capacités d'attaque vs DEF (cf.
  // lancer()). PJ : recalculée via Personnage.calculerDEF() (jamais stockée
  // telle quelle, contrairement aux monstres). Monstre : lit le champ `def`
  // du token (Carte.listeMonstresCombat()) — peut être `null` si le bestiaire
  // ne le renseigne pas (cf. js/carte.js), traité ici comme "DEF inconnue".
  function obtenirDefCible(cible, persos) {
    if (!cible) return null;
    if (cible.genre === "perso") {
      const p = persos[cible.id];
      return p ? Personnage.depuisJSON(p).calculerDEF() : null;
    }
    if (cible.genre === "monstre" && typeof Carte !== "undefined" && Carte.listeMonstresCombat) {
      const tok = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
      return tok && typeof tok.def === "number" ? tok.def : null;
    }
    return null;
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

  // effet.formuleDot (optionnel, ex. "1d4") : dégâts infligés à chaque tour
  // de la cible tant que l'état dure (cf. decompterEtatsDebutTour) — la
  // formule brute est stockée telle quelle, pas résolue ici, pour relancer
  // les dés à chaque tick plutôt que de figer un total unique à la pose.
  function appliquerEtatSurPerso(pCible, effet, source, ctx) {
    pCible.etatsActifs = pCible.etatsActifs || [];
    pCible.etatsActifs.push({
      idEtat: effet.id,
      dureeRestante: Object.assign(resoudreDureeInitiale(effet.duree, ctx), { dureeAffichee: effet.duree }),
      formuleDot: effet.formuleDot || null,
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

  // p : objet perso brut. Décompte de 1 tour tous les etatsActifs à durée
  // numérique (motCle null), retire ceux qui tombent à 0. Ne touche jamais aux
  // entrées motCle "permanente"/"finCombat"/"horsTour". Pour toute entrée
  // portant une formuleDot (ex. "maudite" posée avec un DOT), relance la
  // formule à CE tick et applique les dégâts à p.pvActuel (clampé à 0, sans
  // réduction d'armure — un DOT magique/malédiction n'est pas de l'armure
  // physique) — le tick a lieu tant que l'état est actif ce tour, y compris
  // le dernier tour avant expiration. Pas d'automatisation du jet de
  // résistance "CON pour moitié" mentionné par certaines capacités : reste
  // un ajustement manuel de table, comme le reste des nuances non chiffrées
  // par le schéma standard.
  // Renvoie { retires, degats } : libellés des entrées retirées, et détail
  // des dégâts de DOT infligés à ce tick (pour un toast/journal).
  function decompterEtatsDebutTour(p) {
    const retires = [];
    const degats = [];
    p.etatsActifs = (p.etatsActifs || []).filter((e) => {
      if (!e.dureeRestante || e.dureeRestante.motCle !== null || typeof e.dureeRestante.tours !== "number") return true;
      if (e.formuleDot) {
        const { total, detail } = resoudreExpression(e.formuleDot, {});
        p.pvActuel = Math.max(0, (p.pvActuel || 0) - total);
        degats.push({ libelle: _libelleEtatActif(e), total, detail, pvApres: p.pvActuel });
      }
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
    return { retires, degats };
  }

  // Retire uniquement les entrées motCle === "finCombat" (appelé à la fin du combat).
  function retirerEtatsFinCombat(p) {
    p.etatsActifs = (p.etatsActifs || []).filter((e) => !(e.dureeRestante && e.dureeRestante.motCle === "finCombat"));
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
    const { perso, rang, voie, cible, libelle, persos, critique } = ctx;
    if (effet.type === "degats") {
      // critique (cf. liaison attaque->dégâts, lancer()/resoudreDegatsEnAttente)
      // double les termes de dés de la formule, pas les modificateurs fixes.
      // Nécromancien/Magicien — Voie du chaos rang 4 (Symbiose du chaos /
      // Esprit fissuré, choix "degats", dès CA 5+) : +1d6 DM à TOUS les sorts,
      // cf. Personnage.bonusDegatsSortsChaos() — toutes leurs capacités
      // "degats" sont des sorts, pas besoin de distinguer par voie/rang.
      const bonusChaos = perso.bonusDegatsSortsChaos && perso.bonusDegatsSortsChaos();
      let formuleAjustee = bonusChaos ? `${effet.formule}+${bonusChaos}` : effet.formule;
      // Magicien — Voie de la magie élémentaire, rang 2 "Intensité
      // élémentaire" (passive) : remplace le 1d6 initial du Trio élémentaire
      // (rang 1, seule formule "degats" représentée sur les 3 sorts au choix,
      // cf. sa note) par un 1d8 dès que le rang 2 est acquis — modifie une
      // AUTRE capacité déjà mécanisée, identifiée ici par voie+rang (ctx.voie
      // vient de source.voie côté lancer()/resoudreDegatsEnAttente).
      if (voie === "Voie de la magie élémentaire" && rang === 1 && perso.classe === "magicien"
          && perso.rangMaxVoie("Voie de la magie élémentaire") >= 2 && /^1d6\b/.test(formuleAjustee)) {
        formuleAjustee = formuleAjustee.replace(/^1d6/, "1d8");
      }
      const { total, detail } = resoudreExpression(formuleAjustee, { perso, rang, critique });
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
        appliquerEtatSurPerso(persos[cible.id], effet, libelle, { perso, rang });
        return `État « ${etat.nom} » appliqué à ${cible.nom} (${effet.duree}).`;
      }
      return `État « ${etat.nom} » (${effet.duree}) à appliquer manuellement à ${cible ? cible.nom : "la cible"} (pas de suivi d'état automatique pour les monstres).`;
    }
    if (effet.type === "bonus") {
      // effet.valeur peut être un nombre fixe ("2") ou une formule ("Mod.SAG") :
      // résolue une seule fois ici (dés éventuels non relancés), réutilisée pour
      // le message ET le stockage (cf. appliquerBonusSurPerso).
      let valeurBrute = effet.valeur;
      // Barde — Voie du chant, rang 2 "Refrain lancinant" (passive) : le
      // malus de Note discordante (rang 1) passe de -2 à -3 dès que le rang 2
      // est acquis — même principe qu'Intensité élémentaire ci-dessus.
      if (voie === "Voie du chant" && rang === 1 && effet.cible === "attaque" && perso.classe === "barde"
          && perso.rangMaxVoie("Voie du chant") >= 2 && effet.valeur === -2) {
        valeurBrute = -3;
      }
      const { total: valeurResolue } = resoudreExpression(valeurBrute, { perso, rang });
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
  function lancer({ persoId, source, mecanique, cibleId, choixEffet }) {
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
    let resolutionDegats = null;
    const attaqueVsDef = !!(mecanique.jetOppose && mecanique.jetOppose.caracDefenseur === "DEF");

    if (mecanique.jetOppose) {
      const ca = mecanique.jetOppose.caracAttaquant;
      let bonus = 0;
      // typeAttaque : "contact"/"distance"/"magique", pour Personnage.
      // critMinAttaque(type) — les 28 rangs jetOppose vs DEF du jeu ont
      // toujours un caracAttaquant parmi ces trois valeurs (vérifié dans
      // data/donnees.js), jamais un Mod.XXX brut.
      let typeAttaque = null;
      if (ca === "attaqueMagique") { bonus = perso.bonusAttaque("magique") || 0; typeAttaque = "magique"; }
      else if (ca === "attaqueContact") { bonus = perso.bonusAttaque("contact"); typeAttaque = "contact"; }
      else if (ca === "attaqueDistance") { bonus = perso.bonusAttaque("distance"); typeAttaque = "distance"; }
      else if (ca) bonus = perso.mod(ca.replace(/^Mod\./i, "").toUpperCase());
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
        const defCible = obtenirDefCible(cible, persos);
        let touche;
        if (echecCritique) touche = false;
        else if (critique) touche = true;
        else if (defCible === null) touche = null; // DEF inconnue : ne pas bloquer, à trancher manuellement
        else touche = total >= defCible;

        if (echecCritique) {
          messages.push(`Jet d'attaque : ${total} (d20[${d20}] ${bonus >= 0 ? "+" : ""}${bonus}) — 1 naturel, échec critique automatique.`);
        } else if (critique) {
          messages.push(`Jet d'attaque : ${total} (d20[${d20}] ${bonus >= 0 ? "+" : ""}${bonus}) — CRITIQUE !` +
            (defCible !== null ? ` (DEF cible ${defCible})` : ""));
        } else if (defCible === null) {
          messages.push(`Jet d'attaque : ${total} (d20[${d20}] ${bonus >= 0 ? "+" : ""}${bonus}) — DEF de la cible inconnue, à comparer manuellement.`);
        } else {
          messages.push(`Jet d'attaque : ${total} (d20[${d20}] ${bonus >= 0 ? "+" : ""}${bonus}) vs DEF ${defCible} — ${touche ? "Touché !" : "Raté."}`);
        }

        resolutionDegats = { touche, critique, echecCritique, totalAttaque: total, defCible, persoId, source, mecanique, cible };
      } else {
        messages.push(`Jet d'attaque : ${total} (d20 ${d20} ${bonus >= 0 ? "+" : ""}${bonus}) — à comparer à la défense/DD de la cible.`);
      }
    }

    (mecanique.effets || []).forEach((effet) => {
      // Différé : résolu plus tard par resoudreDegatsEnAttente(), une fois la
      // touche confirmée (cf. resolutionDegats ci-dessus).
      if (attaqueVsDef && TYPES_EFFETS_DIFFERES.includes(effet.type)) return;
      // effet.cible === "choix" : substitue la vraie cible choisie à l'activation
      // (copie superficielle — ne jamais muter l'objet effet d'origine, partagé
      // par tous les personnages via data/donnees.js).
      const effetResolu = (effet.cible === "choix" && choixEffet) ? Object.assign({}, effet, { cible: choixEffet }) : effet;
      const msg = resoudreEffet(effetResolu, { perso, rang: source.rang, voie: source.voie, cible, libelle, persos });
      if (msg) messages.push(msg);
    });

    // Voie du chaos : gain de corruption sur le LANCEUR (jamais la cible),
    // uniquement pour les rangs dont le gain est univoque (cf. commentaire
    // au-dessus de SEUIL_CORRUPTION_MAJEURE).
    if (mecanique.corruption) {
      p.corruptionCombat = (p.corruptionCombat || 0) + mecanique.corruption;
      const franchi = _verifierSeuilCorruptionMajeure(p);
      App.ajouterHisto(`${libelle} — Corruption`, p.corruptionCombat, false, false, `+${mecanique.corruption} (jauge de combat, ${p.nom})`);
      messages.push(`Corruption +${mecanique.corruption} (jauge de combat : ${p.corruptionCombat}/${SEUIL_CORRUPTION_MAJEURE}).` +
        (franchi ? ` ⚠️ Seuil dépassé — Corruption d'Âme +1 (total ${p.corruptionMajeure}), risque de mutation.` : ""));
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
    const { persoId, source, mecanique, cible, critique } = resolutionDegats;
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return { ok: false, messages: ["Personnage introuvable."] };
    const perso = Personnage.depuisJSON(p);
    const libelle = source.nomCap || "Capacité";

    const messages = [];
    (mecanique.effets || []).forEach((effet) => {
      if (!TYPES_EFFETS_DIFFERES.includes(effet.type)) return;
      const msg = resoudreEffet(effet, { perso, rang: source.rang, voie: source.voie, cible, libelle, persos, critique });
      if (msg) messages.push(msg);
    });

    App.sauverPersos(persos);
    return { ok: true, messages };
  }

  return {
    resoudreExpression,
    resoudreDureeInitiale,
    decompterEtatsDebutTour,
    retirerEtatsFinCombat,
    ajusterCorruptionCombat,
    SEUIL_CORRUPTION_MAJEURE,
    cleCapacite,
    parserFrequence,
    verifierUsage,
    reinitialiserUsage,
    listeCibles,
    obtenirDefCible,
    lancer,
    resoudreDegatsEnAttente,
  };
})();

if (typeof window !== "undefined") window.Capacites = Capacites;
