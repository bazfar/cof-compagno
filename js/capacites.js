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
      return p ? Personnage.depuisJSON(p).calculerDEF() + bonusDefAuraPeuple(cible.id) : null;
    }
    if (cible.genre === "monstre" && typeof Carte !== "undefined" && Carte.listeMonstresCombat) {
      const tok = (Carte.listeMonstresCombat() || []).find((m) => m.id === cible.id);
      return tok && typeof tok.def === "number" ? tok.def : null;
    }
    return null;
  }

  // Guerrier — Voie du peuple, rang 2 "L'exemple" (passive) : +1 DEF à tout PJ
  // à 2 cases (cf. Carte.distanceCasesEntre) d'un Guerrier possédant ce rang,
  // tant que ce Guerrier reste immobile ce tour (Combat.estImmobile, même
  // mécanique que Chasseur "Camouflage naturel"). Dépend d'AUTRES personnages
  // (contrairement aux bonus DEF de Personnage.calculerDEF(), auto-contenus à
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

  // Prêtre — Voie du chaos rang 4 "Corruption persistante" (dès CA 5+) : les
  // soins REÇUS par la cible sont réduits de moitié (arrondi inf.), quelle
  // que soit la source — même règle qu'app.js/soigner(), seul autre point
  // d'application d'un soin à un PJ.
  function appliquerSoinPersoLocal(pCible, montant) {
    const perso = Personnage.depuisJSON(pCible);
    const montantReduit = perso.aCorruptionPersistante() ? Math.floor(montant / 2) : montant;
    const avant = pCible.pvActuel;
    pCible.pvActuel = Math.max(0, Math.min(pCible.pvMax, pCible.pvActuel + montantReduit));
    return { gain: pCible.pvActuel - avant, reduit: montantReduit < montant };
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
    const testsVolonte = [];
    p.etatsActifs = (p.etatsActifs || []).filter((e) => {
      if (!e.dureeRestante || e.dureeRestante.motCle !== null || typeof e.dureeRestante.tours !== "number") return true;
      if (e.formuleDot) {
        const { total, detail } = resoudreExpression(e.formuleDot, {});
        p.pvActuel = Math.max(0, (p.pvActuel || 0) - total);
        degats.push({ libelle: _libelleEtatActif(e), total, detail, pvApres: p.pvActuel });
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
    return { retires, degats, testsVolonte };
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

  // Pool générique de réactions par personnage, remis à zéro par
  // Combat.terminerCombat() (comme corruptionCombat) — cf. mecanique.reactionCout
  // dans lancer(). Plusieurs capacités de classes différentes peuvent piocher
  // dans ce même pool ; rien de spécifique au Guerrier dans ce compteur.
  const REACTIONS_MAX = 3;

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
      // Magicien — Voie de la magie sauvage, rang 1 "Mutation Sauvage" :
      // s'applique à TOUT sort offensif du Magicien (cf. _rollMutationSauvage),
      // pas seulement aux capacités de cette voie.
      let noteMutationSauvage = "";
      if (perso.classe === "magicien" && perso.rangMaxVoie("Voie de la magie sauvage") >= 1) {
        const { modif, note } = _rollMutationSauvage(persos, perso, rang, libelle);
        formuleAjustee = `${formuleAjustee}${modif >= 0 ? "+" : ""}${modif}`;
        noteMutationSauvage = ` [Mutation Sauvage : ${modif >= 0 ? "+" : ""}${modif}${note}]`;
      }
      const { total, detail } = resoudreExpression(formuleAjustee, { perso, rang, critique });
      App.ajouterHisto(`${libelle} — Dégâts`, total, false, false, detail);
      if (cible && cible.genre === "monstre" && typeof Carte !== "undefined") {
        const res = Carte.appliquerDegatsCombat(cible.id, total);
        return res
          ? `${total} dégâts (${detail}) → ${res.nom} : ${res.pvActuel} PV restants.${noteMutationSauvage}`
          : `${total} dégâts (${detail}) — cible introuvable sur la table de combat.${noteMutationSauvage}`;
      }
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        const res = appliquerDegatsPersoLocal(persos[cible.id], total);
        return `${total} dégâts (${detail}) → ${cible.nom} : -${res.degatsNets} après réduction (${res.reduction}), ${res.pvActuel} PV restants.${noteMutationSauvage}`;
      }
      return `${total} dégâts (${detail}) — aucune cible sélectionnée, à appliquer manuellement.${noteMutationSauvage}`;
    }
    if (effet.type === "soin") {
      const { total, detail } = resoudreExpression(effet.formule, { perso, rang });
      App.ajouterHisto(`${libelle} — Soin`, total, false, false, detail);
      if (cible && cible.genre === "perso" && persos[cible.id]) {
        const res = appliquerSoinPersoLocal(persos[cible.id], total);
        return `${total} PV (${detail}) → ${cible.nom} récupère ${res.gain} PV${res.reduit ? " (réduit de moitié — Corruption persistante)" : ""}.`;
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
        appliquerEtatSurPerso(cibleP, effet, libelle, { perso, rang }, extra);
        return `État « ${etat.nom} » appliqué à ${cible.nom} (${effet.duree}).`;
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
      // effet.valeur peut être un nombre fixe ("2") ou une formule ("Mod.SAG") :
      // résolue une seule fois ici (dés éventuels non relancés), réutilisée pour
      // le message ET le stockage (cf. appliquerBonusSurPerso).
      let valeurBrute = effet.valeur;
      // Barde — Voie du chant, rang 2 "Refrain lancinant" (passive) : le
      // malus de Note discordante (rang 1) passe de -2 à -3 dès que le rang 2
      // est acquis — même principe qu'Intensité élémentaire ci-dessus. Rang 4
      // "Dissonance profonde" (simplifié — validé avec Thomas — en "double
      // les malus" plutôt que la règle de cumul/durée d'origine, non
      // chiffrable) : double la valeur déjà obtenue ci-dessus (donc -3 → -6
      // avec le rang 2, ou -2 → -4 sans, mais l'acquisition séquentielle des
      // rangs — cf. creation, "impossible de prendre le rang 3 sans avoir les
      // rangs 1 et 2" — garantit que le rang 4 a toujours aussi le rang 2).
      if (voie === "Voie du chant" && rang === 1 && effet.cible === "attaque" && perso.classe === "barde"
          && effet.valeur === -2) {
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
      // Magicien — Voie de la magie protectrice, rang 2 "Résistance
      // arcanique" (passive) : le bonus de Bouclier arcanique (rang 1) passe
      // de +2 à +3 DEF dès le rang 2 acquis — même principe que Refrain
      // lancinant ci-dessus. Gap corrigé : cette modification était
      // documentée dans data/donnees.js mais jamais câblée.
      if (voie === "Voie de la magie protectrice" && rang === 1 && effet.cible === "DEF" && perso.classe === "magicien"
          && perso.rangMaxVoie("Voie de la magie protectrice") >= 2 && effet.valeur === 2) {
        valeurBrute = 3;
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
      // touche confirmée (cf. resolutionDegats ci-dessus).
      if (attaqueVsDef && TYPES_EFFETS_DIFFERES.includes(effet.type)) return;
      // effet.cible === "choix" : substitue la vraie cible choisie à l'activation
      // (copie superficielle — ne jamais muter l'objet effet d'origine, partagé
      // par tous les personnages via data/donnees.js).
      const effetResolu = (effet.cible === "choix" && choixEffet) ? Object.assign({}, effet, { cible: choixEffet }) : effet;
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
          `${cfConsommees} CF convertis en CA (${p.nom}, total CA : ${p.corruptionMajeure})`);
        messages.push(`Déchaînement : ${cfConsommees} CF convertis en Corruption d'Âme (total CA : ${p.corruptionMajeure}).`);
      }
    }

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
    // Coût en jauge de combat (cf. le garde-fou plus haut, déjà vérifié
    // suffisant à ce stade) : décompté une fois l'activation confirmée,
    // jamais en cas d'échec du garde-fou (qui a déjà renvoyé plus tôt).
    if (mecanique.corruptionCout) {
      p.corruptionCombat = Math.max(0, (p.corruptionCombat || 0) - mecanique.corruptionCout);
      App.ajouterHisto(`${libelle} — Corruption`, p.corruptionCombat, false, false, `-${mecanique.corruptionCout} (jauge de combat, ${p.nom})`);
      messages.push(`Corruption -${mecanique.corruptionCout} (jauge de combat : ${p.corruptionCombat}).`);
    }
    // Coût en réactions (cf. le garde-fou plus haut) : décompté une fois
    // l'activation confirmée, même logique que corruptionCout ci-dessus.
    if (mecanique.reactionCout) {
      p.reactionsUtilisees = (p.reactionsUtilisees || 0) + mecanique.reactionCout;
      const restantes = REACTIONS_MAX - p.reactionsUtilisees;
      App.ajouterHisto(`${libelle} — Réaction`, restantes, false, false, `-${mecanique.reactionCout} réaction(s) (${p.nom}, ${restantes}/${REACTIONS_MAX} restantes)`);
      messages.push(`Réaction(s) -${mecanique.reactionCout} (${restantes}/${REACTIONS_MAX} restantes ce combat).`);
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
    listeCibles,
    obtenirDefCible,
    bonusDefAuraPeuple,
    cibleCreaturePlusProche,
    lancer,
    resoudreDegatsEnAttente,
  };
})();

if (typeof window !== "undefined") window.Capacites = Capacites;
