/* ============================================================
   Récolte — métiers Traque (faune) et Alchimie (flore), moteur.
   Module self-contained, même convention que js/cuisine.js/js/repos.js/
   js/marche.js : ses propres echapper()/toast(), accès à App/SyncStore/
   Metiers/Meteo uniquement par leurs API publiques. Données pures dans
   data/recolte.js (MILIEUX_RECOLTE, NATIONS_PAR_REGION, MILIEUX_PAR_REGION,
   RARETES_RECOLTE, RENDEMENT_RECOLTE, ALEAS_RECOLTE) et data/loot.json
   (champs recolte/rarete/milieux, cf. prompt_recolte_1_donnees.md).

   Contrat avec js/repos.js (prompt 4) : la cadence "une récolte par
   personnage et par repos long" vit sur SyncStore["repos:encours"].recoltes
   ({ [persoId]: {metierId,milieuId,itemId,qualiteId,unites,aleaD} }), PAS
   sur "atelier:tentatives" (qui ne doit pas être remis à zéro par le bouton
   "Nouveau jour" — la récolte suit le rythme du repos long, pas de la
   journée). tenter() exige donc un `repos:encours` actif — la récolte ne se
   déclenche que depuis la modale sollicitée par le MJ dans l'overlay de
   repos long, jamais en dehors (cf. js/repos.js, lancerRecoltes/modale).

   Historique (pour mémoire) : le prompt 2 demandait déjà "encours.recoltes",
   mais _creerOverlay (js/repos.js) n'existait pas encore à ce moment pour
   l'initialiser en forme complète — écrire un encours PARTIEL depuis ce
   fichier aurait fait planter l'overlay de repos long existant
   (_htmlOverlay suppose encours.convives/plats/attributions toujours
   présents). Le prompt 2 utilisait donc une clé séparée ("recolte:cadence")
   en attendant ce prompt 4, qui initialise enfin encours.recoltes:{} dès la
   création de l'overlay — la migration vers encours.recoltes se fait ici,
   sans risque, précisément parce que la forme est maintenant garantie.
   ============================================================ */

const Recolte = (() => {
  "use strict";

  /* ── Utilitaires (copie locale, même convention que les autres modules) ── */
  function echapper(s) {
    const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML;
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2800);
  }

  function _catalogueItem(id) {
    return (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((i) => i.id === id) : null;
  }

  // Petit rouleur "NdM" local (formules d'aléas de data/recolte.js : "2d6",
  // "1d6", "1d4" — jamais de terme "+K", inutile de recopier la grammaire
  // complète de lancerFormule pour ça). Passe par App.lancerDe pour rester
  // sur le même RNG (crypto si dispo) que tout le reste de l'app.
  function _rollFormule(formule) {
    const m = /^(\d*)d(\d+)$/.exec((formule || "").trim());
    if (!m) return 0;
    const nb = parseInt(m[1] || "1", 10);
    const faces = parseInt(m[2], 10);
    let total = 0;
    for (let i = 0; i < nb; i++) total += App.lancerDe(faces);
    return total;
  }

  /* ── 2.2 Sélection des espèces ──────────────────────────────── */
  // Réutilise _blocDe (data/marche.js, déjà global via le même mécanisme de
  // portée partagée entre <script> classiques que LOOT_CATALOGUE/
  // TYPES_EMPILABLES — cf. prompt : "si la fonction n'est pas exportée,
  // l'exporter proprement plutôt que la dupliquer" : elle EST déjà
  // accessible ici, function déclarée en haut niveau d'un script classique,
  // aucun export supplémentaire nécessaire).
  function _origineAccessibleDepuisRegion(origine, regionId) {
    if (origine === "partout") return true;
    const nations = NATIONS_PAR_REGION[regionId] || [];
    if (nations.includes(origine)) return true;
    if (typeof _blocDe !== "function") return false;
    return nations.some((n) => _blocDe(n) === origine);
  }

  // → [{ item, rarete, rangCible, accessible }] trié par rangCible puis nom.
  // `accessible` distingue une cible confortable (rangMetier >= rangCible)
  // d'une cible "en extension" (rangMin <= rangMetier < rangCible, encore
  // autorisée — un seul cran au-dessus de son rang, cf. data/recolte.js —
  // mais à signaler comme un pari dans l'UI, pas une valeur sûre).
  function especesDisponibles(regionId, milieuId, metierId, rangMetier) {
    const milieuxRegion = MILIEUX_PAR_REGION[regionId] || [];
    if (!milieuxRegion.includes(milieuId)) return [];
    const catalogue = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE : [];
    const resultats = [];
    catalogue.forEach((item) => {
      if (item.recolte !== metierId) return;
      if (!Array.isArray(item.milieux) || !item.milieux.includes(milieuId)) return;
      if (!_origineAccessibleDepuisRegion(item.origine, regionId)) return;
      const palier = RARETES_RECOLTE[item.rarete];
      if (!palier || rangMetier < palier.rangMin) return;
      resultats.push({ item, rarete: item.rarete, rangCible: palier.rangCible, accessible: rangMetier >= palier.rangCible });
    });
    resultats.sort((a, b) => a.rangCible - b.rangCible || a.item.nom.localeCompare(b.item.nom));
    return resultats;
  }

  /* ── 2.3 Seuil ──────────────────────────────────────────────── */
  // Même FORME que Cuisine.seuilEffectif (js/cuisine.js), base différente
  // (10 au lieu de 8) — délibéré, cf. data/recolte.js en-tête. Ne jamais
  // "harmoniser" les deux bases plus tard.
  function seuilEffectif(rangCible, rangMetier) {
    return Math.max(6, Math.min(20, 10 + 2 * (rangCible - rangMetier)));
  }

  /* ── 2.4 Modificateurs ──────────────────────────────────────── */
  // → { total, detail: [{libelle, valeur}] }. Chaque composante apparaît
  // dans detail dès qu'elle s'applique, MÊME à 0 (un modificateur invisible
  // est un modificateur contesté à table) — sauf sous terre, où la météo ne
  // s'applique juste pas (aucune ligne "Météo" du tout, pas une ligne à 0).
  function modificateurs(perso, metierId) {
    const def = METIERS[metierId];
    const p = Personnage.depuisJSON(perso);
    const detail = [];
    if (def.caracteristique) {
      detail.push({ libelle: `Mod ${def.caracteristique}`, valeur: p.mod(def.caracteristique) });
    }
    if (def.competence) {
      detail.push({ libelle: def.competence, valeur: p.bonusCompetence(def.competence) });
    }
    if (typeof Meteo !== "undefined" && !Meteo.estSouterrain()) {
      const palier = Meteo.palierCourant();
      if (palier) {
        detail.push({ libelle: "Météo (détection)", valeur: palier.detection || 0 });
        // palier.traces : SEULEMENT présent en registre froid (cf. data/
        // meteo.js) — testé par présence du champ, pas par sa valeur (un
        // Blizzard porte traces:0, ce n'est pas "absent").
        if (metierId === "traque" && palier.traces !== undefined) {
          detail.push({ libelle: "Météo (traces)", valeur: palier.traces });
        }
      }
    }
    const total = detail.reduce((s, d) => s + d.valeur, 0);
    return { total, detail };
  }

  /* ── 2.5 Résolution ─────────────────────────────────────────── */
  // Libellé d'affichage SEUL pour "chef" en récolte ("Belle prise", pas
  // "Chef-d'œuvre") — surcharge d'affichage uniquement, l'id QUALITES reste
  // "chef" partout (RENDEMENT_RECOLTE, QUALITES.xpMult...).
  const _LIBELLES_QUALITE_RECOLTE = { chef: "Belle prise" };
  function libelleQualite(qualiteId) {
    if (_LIBELLES_QUALITE_RECOLTE[qualiteId]) return _LIBELLES_QUALITE_RECOLTE[qualiteId];
    const q = (typeof QUALITES !== "undefined") ? QUALITES.find((x) => x.id === qualiteId) : null;
    return q ? q.nom : qualiteId;
  }

  // Recopie UNIQUEMENT la forme des bornes de Cuisine._qualitePour
  // (js/cuisine.js) paramétrée par le seuil — impossible d'appeler
  // Cuisine.bandesPour/_qualitePour directement, elles ferment sur la
  // formule de rang de LA RECETTE, pas sur un rangCible générique. Cuisine.
  // _qualitePour reste la source de vérité de la FORME : si ses bornes
  // changent, reporter le changement ici à la main.
  function _qualiteIdPour(jetBrut, total, S) {
    if (jetBrut === 1) return "desastre";
    if (jetBrut === 20) return "chef";
    if (total <= S - 8) return "desastre";
    if (total <= S - 4) return "rate";
    if (total <= S - 1) return "mediocre";
    if (total <= S + 3) return "reussi";
    if (total <= S + 7) return "bien";
    return "chef";
  }

  // Pure, aucun effet de bord. `mods` : total numérique déjà calculé
  // (modificateurs(...).total, plus un éventuel bonus reporté) — PAS l'objet
  // { total, detail }, pour rester testable isolément (cf. §5 validation).
  function resoudre(rarete, rangMetier, jetBrut, mods) {
    const palier = RARETES_RECOLTE[rarete];
    const rangCible = palier.rangCible;
    const S = seuilEffectif(rangCible, rangMetier);
    const total = jetBrut + (mods || 0);
    const qualiteId = _qualiteIdPour(jetBrut, total, S);
    const qualite = QUALITES.find((q) => q.id === qualiteId);
    const xpGagne = Math.ceil((2 * rangCible + 3 * Math.max(0, rangCible - rangMetier)) * qualite.xpMult);
    const unites = RENDEMENT_RECOLTE[qualiteId][rarete];
    return { qualiteId, qualite, S, jetBrut, total, xpGagne, unites, rarete, rangCible };
  }

  /* ── 2.6 Aléas (uniquement sur désastre) ────────────────────── */
  // Pousse une entrée etatsActifs minimale — pas de compte à rebours en
  // tours automatique (dureeRestante.tours/motCle: null) : toutes les durées
  // de la table (arbitrée MJ, "jusqu'au prochain repos long", "une heure")
  // sont soit du texte libre pour le MJ, soit à reprendre au prompt 4 (repos
  // long) — l'application/retrait EN TOURS reste le rôle de js/app.js
  // (bouton de retrait manuel déjà existant sur la fiche), jamais dupliqué
  // ici.
  function _appliquerEtatRecolte(p, idEtat, note) {
    if (typeof ETATS === "undefined" || !ETATS[idEtat]) return;
    p.etatsActifs = p.etatsActifs || [];
    p.etatsActifs.push({ idEtat, dureeRestante: { tours: null, motCle: null, dureeAffichee: note || null }, source: "recolte" });
  }

  // Retire `n` unités de vivres AU HASARD de l'inventaire (item.vivre ===
  // true), une unité à la fois, potentiellement répartie sur plusieurs
  // piles différentes — jamais plus que ce que l'inventaire contient.
  function _retirerVivresAuHasard(p, n) {
    for (let i = 0; i < n; i++) {
      const candidats = (p.inventaireListe || []).map((it, idx) => ({ it, idx })).filter(({ it }) => it.vivre);
      if (!candidats.length) break;
      const choix = candidats[Math.floor(Math.random() * candidats.length)];
      const q = (choix.it.quantite || 1) - 1;
      if (q > 0) choix.it.quantite = q;
      else p.inventaireListe.splice(choix.idx, 1);
    }
  }

  // Espèce ciblée par un effet "unites" (aléa de consolation) : réutilise
  // especesDisponibles pour rester dans le même milieu/région/métier que la
  // tentative en cours, filtrée sur la rareté demandée par l'aléa —
  // "une bête déjà blessée, tombée là par hasard" n'est pas forcément
  // l'espèce visée à l'origine. ignorerRang : rangMetier artificiellement
  // haut pour lever le filtre rangMin (cf. §2.6, "coup de chance"). Repli
  // sur l'espèce visée elle-même si rien d'autre ne correspond, plutôt que
  // de ne rien donner.
  function _especePourAlea(regionId, milieuId, metierId, rangMetier, raretéVoulue, ignorerRang, itemVise) {
    const rang = ignorerRang ? 99 : rangMetier;
    const options = especesDisponibles(regionId, milieuId, metierId, rang).filter((e) => e.rarete === raretéVoulue);
    if (options.length) return options[Math.floor(Math.random() * options.length)].item;
    return itemVise;
  }

  // Applique l'effet d'un aléa (mute `p` et `persos` directement pour tout
  // ce qui ne passe pas par un appel App dédié ; App.ajusterPv EST appelé
  // ici pour les dégâts — il fait son propre chargement/sauvegarde, donc
  // appelé APRÈS que cette fonction ait fini de muter `p`, jamais avant).
  // Renvoie { unitesForcees?, message } — unitesForcees écrase le rendement
  // normal de la tentative (requalification/unites), sinon undefined.
  function _appliquerAlea(alea, persos, p, persoId, metierId, regionId, milieuId, rangMetier, itemVise, rareteEnCours) {
    const e = alea.effet;
    switch (e.type) {
      case "rencontre": {
        const liste = SyncStore.get("recolte:rencontres") || [];
        liste.push({ persoId, nom: p.nom, majeure: !!e.majeure, ts: Date.now() });
        SyncStore.set("recolte:rencontres", liste);
        return { message: `⚠ ${alea.nom} — signalé au MJ. Le repos long n'est PAS interrompu automatiquement.` };
      }
      case "degats": {
        const degats = _rollFormule(e.formule);
        if (e.etat) _appliquerEtatRecolte(p, e.etat, alea.nom);
        return { degats, message: `${alea.nom} : ${degats} dégâts${e.etat ? ` + ${(typeof ETATS !== "undefined" && ETATS[e.etat]) ? ETATS[e.etat].nom : e.etat}` : ""}.` };
      }
      case "etat": {
        _appliquerEtatRecolte(p, e.id, e.note);
        return { message: `${alea.nom} : ${(typeof ETATS !== "undefined" && ETATS[e.id]) ? ETATS[e.id].nom : e.id} (${e.note || "durée arbitrée par le MJ"}).` };
      }
      case "perteObjet":
        return { message: `${alea.nom} — au MJ de retirer un objet de l'inventaire.` };
      case "perteVivres": {
        const n = _rollFormule(e.formule);
        _retirerVivresAuHasard(p, n);
        return { message: `${alea.nom} : ${n} unité(s) de vivres perdues.` };
      }
      case "blocageProchain":
        p.recolteBloqueeProchainRepos = true;
        return { message: `${alea.nom} : aucune récolte possible au prochain repos long.` };
      case "rien":
        return { message: alea.nom };
      case "bonusProchain":
        p.recolteBonus = { milieuId, valeur: e.valeur };
        return { message: `${alea.nom} : +${e.valeur} à la prochaine récolte dans ce milieu.` };
      case "info":
        if (e.etat) _appliquerEtatRecolte(p, e.etat, "Une info du MJ pourrait rassurer.");
        return { message: `${alea.nom} — au MJ de donner une information sur la région.` };
      case "unites": {
        const nb = e.formule ? _rollFormule(e.formule) : (e.nb || 0);
        const item = _especePourAlea(regionId, milieuId, metierId, rangMetier, e.rarete, !!e.ignorerRang, itemVise);
        if (e.malusSocial) {
          // Même modèle que p.pvTemporairesExpiration (cf. js/repos.js) —
          // motCle: "reposLong" pour être balayé à la validation du repos
          // long. Le prompt 4 ajoutera le sweep dans js/repos.js, comme il
          // existe déjà pour pvTemporairesExpiration.
          p.malusSocialTemporaire = { valeur: e.malusSocial, motCle: "reposLong" };
        }
        return { unitesForcees: nb, itemForce: item, message: `${alea.nom} : ${nb} unité(s) de « ${item.nom} » quand même.` };
      }
      case "requalification": {
        const unitesForcees = RENDEMENT_RECOLTE[e.qualiteId][rareteEnCours];
        return { unitesForcees, message: `${alea.nom} : requalifié « ${libelleQualite(e.qualiteId)} ».` };
      }
      default:
        return { message: alea.nom };
    }
  }

  /* ── §3 : métiers déclarés sur la fiche ─────────────────────── */
  function metiersDe(p) {
    return (p && p.metiersPratiques) || [];
  }

  /* ── 2.1 tenter() : effets de bord + retour ─────────────────── */
  function tenter(persoId, metierId, milieuId, itemId) {
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return { ok: false, raison: "Personnage introuvable." };

    if (!metiersDe(p).includes(metierId)) {
      return { ok: false, raison: `${(METIERS[metierId] || {}).nom || metierId} n'est pas déclaré comme métier pratiqué sur cette fiche.` };
    }

    // Cadence "une récolte par personnage et par repos long" (prompt_recolte_
    // 4_repos.md §2.1, qui migre enfin ce compteur sur encours.recoltes
    // maintenant que js/repos.js l'initialise TOUJOURS en forme complète dès
    // _creerOverlay — la clé "recolte:cadence" du prompt 2 n'existe plus).
    // La récolte ne peut se tenter QUE depuis l'overlay de repos long
    // (cf. la modale sollicitée, js/repos.js) : sans encours actif, il n'y a
    // simplement rien à faire ici.
    const encours = SyncStore.get("repos:encours") || null;
    if (!encours) return { ok: false, raison: "Aucun repos long en cours." };
    if (encours.recoltes && encours.recoltes[persoId]) {
      return { ok: false, raison: "Une seule récolte par repos long — déjà faite." };
    }

    if (p.recolteBloqueeProchainRepos) {
      p.recolteBloqueeProchainRepos = false;
      App.sauverPersos(persos);
      return { ok: false, raison: "Égaré la dernière fois : pas de récolte possible ce repos-ci." };
    }

    const regionId = (typeof Meteo !== "undefined" && Meteo.obtenirEtat) ? Meteo.obtenirEtat().regionId : null;
    const rangMetier = Metiers.rang(p, metierId);
    const especes = especesDisponibles(regionId, milieuId, metierId, rangMetier);
    const cible = especes.find((e) => e.item.id === itemId);
    if (!cible) return { ok: false, raison: "Cette espèce n'est pas disponible ici." };

    const mods = modificateurs(p, metierId);
    let bonusMilieu = 0;
    if (p.recolteBonus && p.recolteBonus.milieuId === milieuId) {
      bonusMilieu = p.recolteBonus.valeur;
      delete p.recolteBonus;
    }

    const jetBrut = App.lancerDe(20);
    const resultat = resoudre(cible.rarete, rangMetier, jetBrut, mods.total + bonusMilieu);

    App.ajouterHisto(`${p.nom} — Récolte (${cible.item.nom})`, jetBrut, jetBrut === 20, jetBrut === 1,
      `d20[${jetBrut}] ${bonusMilieu ? `+${mods.total + bonusMilieu}(dont bonus reporté)` : `+${mods.total}`} = ${resultat.total} vs seuil ${resultat.S} — ${libelleQualite(resultat.qualiteId)}`);

    let unitesFinal = resultat.unites;
    let itemProduit = cible.item;
    let aleaResultat = null;
    let degatsAlea = 0;
    if (resultat.qualiteId === "desastre") {
      const dAlea = App.lancerDe(20);
      const alea = ALEAS_RECOLTE.find((a) => a.d === dAlea);
      App.ajouterHisto(`${p.nom} — Aléa de récolte`, dAlea, false, false, `${alea.nom} : ${alea[metierId]}`);
      aleaResultat = _appliquerAlea(alea, persos, p, persoId, metierId, regionId, milieuId, rangMetier, cible.item, cible.rarete);
      aleaResultat.alea = alea;
      if (aleaResultat.unitesForcees !== undefined) unitesFinal = aleaResultat.unitesForcees;
      if (aleaResultat.itemForce) itemProduit = aleaResultat.itemForce;
      if (aleaResultat.degats) degatsAlea = aleaResultat.degats;
    }

    if (unitesFinal > 0) {
      const itemCatalogue = _catalogueItem(itemProduit.id) || itemProduit;
      App.ajouterAInventaire(p, Object.assign({}, itemCatalogue, { quantite: unitesFinal }));
    }

    // Dépouille (cf. champ `peau` de data/loot.json, chantier Tannerie) : une
    // traque qui rapporte quelque chose rapporte AUSSI la peau, sans second
    // jet — on dépèce la bête qu'on a tuée, ce n'est pas une deuxième chance.
    // Lue sur cible.item (l'ESPÈCE réellement chassée), pas sur itemProduit
    // (qui peut avoir été substitué par un aléa) : la peau vient de la bête
    // au sol, pas de ce que l'aléa a mis dans le sac. Une seule unité quelle
    // que soit la qualité : c'est `surfaceCuir` de la peau, et non la
    // quantité de peaux, qui distingue le lièvre du cerf.
    let peauObtenue = null;
    let peauNom = null;
    if (unitesFinal > 0 && cible.item.peau) {
      const dep = _catalogueItem(cible.item.peau);
      if (dep) {
        App.ajouterAInventaire(p, Object.assign({}, dep, { quantite: 1 }));
        peauObtenue = dep.id;
        peauNom = dep.nom;
      }
    }

    const gainXp = Metiers.gagnerXp(p, metierId, resultat.xpGagne);
    encours.recoltes = encours.recoltes || {};
    encours.recoltes[persoId] = {
      metierId, milieuId, itemId: itemProduit.id, qualiteId: resultat.qualiteId,
      unites: unitesFinal, aleaD: aleaResultat ? aleaResultat.alea.d : null, peauId: peauObtenue,
    };
    SyncStore.set("repos:encours", encours);
    App.sauverPersos(persos);

    // Dégâts d'aléa appliqués APRÈS la sauvegarde ci-dessus : App.ajusterPv
    // fait son propre chargement/sauvegarde de persos, il doit voir les
    // mutations qu'on vient d'écrire, pas une version périmée.
    if (degatsAlea) App.ajusterPv(persoId, -degatsAlea);

    const suffixePeau = peauNom ? ` + 1 « ${peauNom} »` : "";
    if (aleaResultat) toast(aleaResultat.message);
    else toast(`${libelleQualite(resultat.qualiteId)} — ${unitesFinal > 0 ? `${unitesFinal}× « ${itemProduit.nom} ».${suffixePeau}` : "rien récolté."}${resultat.xpGagne ? ` +${resultat.xpGagne} XP ${METIERS[metierId].nom}.` : ""}`);

    return { ok: true, resultat, alea: aleaResultat, gainXp, jetBrut, unitesFinal, itemProduit, peauId: peauObtenue, peauNom, nomPerso: p.nom };
  }

  return {
    especesDisponibles, seuilEffectif, modificateurs, resoudre, tenter, metiersDe,
    libelleQualite,
  };
})();

if (typeof window !== "undefined") window.Recolte = Recolte;
