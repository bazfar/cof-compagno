/* ============================================================
   Cuisine — sous-onglet Atelier (rang Métier + recettes), cf. data/cuisine.js
   pour l'échelle de dé/qualités/catalogue et js/metiers.js pour le moteur
   XP/rang générique.

   Module self-contained comme js/repos.js/js/marche.js — pas une extension
   des fonctions privées de js/app.js (qui restent propres à Enchantement/
   Alchimie) : sa propre zone DOM (#zone-atelier-cuisine), ses propres
   toast()/echapper(), accès à App/SyncStore/Metiers uniquement via leurs
   API publiques. js/app.js se contente d'appeler rendreZoneCuisine(persoId)
   depuis le sélecteur de personnage déjà partagé par les 3 sous-onglets
   (cf. rendrePanneauAtelier).

   Jet de cuisine : 1d20 SEUL, aucun bonus (cf. data/metiers.js,
   METIERS.cuisine.caracteristique === null) — la difficulté est portée
   entièrement par l'écart de rang (recette.rang − rang du cuisinier).

   Tentatives/jour : réutilise la clé SyncStore "atelier:tentatives" (même
   table que Enchantement/Alchimie, cf. js/app.js), sous le préfixe
   "cuisine:<recetteId>" — le bouton MJ "🌅 Nouveau jour" (qui vide TOUTE la
   table) réinitialise donc la cuisine sans code supplémentaire, comme
   App.reinitialiserTentativesAtelier() appelé par Repos.reposLong.

   Contrat avec js/repos.js : le champ `effetRepos` d'un plat produit
   ({ des:["XdY"], maximise?, intoxication? }) est l'UNIQUE canal lu par le
   repos long — Repos ne connaît ni les recettes ni les qualités.
   ============================================================ */

const Cuisine = (() => {
  "use strict";

  const METIER_ID = "cuisine";
  const STORAGE_ATELIER_TENTATIVES = "atelier:tentatives"; // même clé que js/app.js

  /* ── Utilitaires (copie locale, même convention que js/repos.js) ── */
  function echapper(s) {
    const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML;
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2800);
  }

  function _tentativesAtelier() { return SyncStore.get(STORAGE_ATELIER_TENTATIVES) || {}; }
  function _cle(recetteId) { return `cuisine:${recetteId}`; }
  function _tentativesJour(persoId, recetteId) {
    const table = _tentativesAtelier();
    return (table[persoId] && table[persoId][_cle(recetteId)]) || 0;
  }
  function _incrementerTentative(persoId, recetteId) {
    const table = _tentativesAtelier();
    const cle = _cle(recetteId);
    const nouveau = ((table[persoId] && table[persoId][cle]) || 0) + 1;
    // setChamp, pas SyncStore.set(table) : table PARTAGÉE entre tous les
    // ateliers et tous les persos — cf. même correctif dans js/app.js.
    SyncStore.setChamp(STORAGE_ATELIER_TENTATIVES, persoId + "." + cle, nouveau);
  }
  // Nb de tentatives/jour dérivé du rang (cf. prompt_cuisine_recalage_
  // gastronomie.md, amendement 1) : plus la recette est technique, moins on
  // peut se permettre d'essayer dans la même journée.
  function _tentativesJourMax(rang) { return [5, 4, 3, 2, 1][rang - 1] || 1; }

  function _quantiteDisponible(inventaireListe, itemId) {
    return (inventaireListe || []).filter((it) => it.id === itemId).reduce((t, it) => t + (it.quantite || 1), 0);
  }
  function _consommerQuantite(inventaireListe, itemId, qte) {
    let restant = qte;
    for (let i = inventaireListe.length - 1; i >= 0 && restant > 0; i--) {
      const it = inventaireListe[i];
      if (it.id !== itemId) continue;
      const dispo = it.quantite || 1;
      if (dispo <= restant) { restant -= dispo; inventaireListe.splice(i, 1); }
      else { it.quantite = dispo - restant; restant = 0; }
    }
  }
  /* ── Ingrédients "au choix" par famille (prompt_animaux_recettes_basiques_
     v2.md, étape 2) ────────────────────────────────────────────────────
     Une entrée d'ingrédient prend deux formes :
       { id: "sel", qte: 1 }          → cet ingrédient précis
       { famille: "viande", qte: 2 }  → n'importe quel vivre de cette famille
     La famille s'appuie sur `familleVivre`, déjà porté par les 88 vivres du
     catalogue — aucune taxonomie nouvelle. La valeur nourrissante (indexDe) ne
     dépend JAMAIS du vivre choisi : griller du rat des veines à 0,3 po nourrit
     autant que griller du bœuf de Serval à 9 po. C'est voulu (les recettes de
     base tirent leur valeur de leur FLEXIBILITÉ, pas de leur dé), ne pas
     "corriger" en modulant le dé selon le prix. ─────────────────────────── */
  function _catalogueVivres() {
    return (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE : [];
  }
  // Vivres d'une famille, triés du moins cher au plus cher (départage par nom
  // pour un ordre stable) — l'ordre du sélecteur "au choix", premier = moins
  // cher = présélectionné.
  function _vivresDeFamille(famille) {
    return _catalogueVivres()
      .filter((it) => it.vivre && it.familleVivre === famille)
      .sort((a, b) => (a.prixPo || 0) - (b.prixPo || 0) || (a.nom || "").localeCompare(b.nom || ""));
  }
  // Vivres de la famille présents en inventaire en quantité suffisante pour
  // couvrir `qte` À EUX SEULS. PAS DE PANACHAGE : on grille un morceau de
  // viande, pas un assortiment de restes — ne jamais sommer deux vivres
  // différents pour atteindre le compte (règle la plus susceptible d'être
  // "corrigée" par erreur).
  function _eligiblesFamille(inventaireListe, famille, qte) {
    return _vivresDeFamille(famille).filter((it) => _quantiteDisponible(inventaireListe, it.id) >= qte);
  }
  // Id du vivre à employer pour UNE entrée, compte tenu d'un choix explicite du
  // joueur (choix[famille]) — sinon le moins cher éligible. Une entrée { id } se
  // résout à elle-même. null si rien ne couvre l'entrée. Hypothèse assumée :
  // une recette ne répète jamais deux fois la même famille (vrai pour les 63
  // recettes), le choix est donc indexable par famille sans ambiguïté.
  function _resoudreEntree(inventaireListe, entree, choix) {
    if (entree.id) return _quantiteDisponible(inventaireListe, entree.id) >= entree.qte ? entree.id : null;
    const elig = _eligiblesFamille(inventaireListe, entree.famille, entree.qte);
    if (!elig.length) return null;
    const voulu = choix && choix[entree.famille];
    if (voulu && elig.some((it) => it.id === voulu)) return voulu;
    return elig[0].id;
  }
  function _entreeCouverte(inventaireListe, entree) {
    return _resoudreEntree(inventaireListe, entree, null) !== null;
  }
  function _ingredientsDisponibles(inventaireListe, ingredients, choix) {
    return ingredients.every((c) => _resoudreEntree(inventaireListe, c, choix) !== null);
  }
  function _nomIngredient(id) {
    const it = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((l) => l.id === id) : null;
    return it ? it.nom : id;
  }

  /* ── Résolution du jet (cf. data/cuisine.js : ECHELLE_DES_PLAT/QUALITES) ── */
  // Seuil effectif de la recette pour CE cuisinier, borné [4,18] — au-delà,
  // le 1d20 n'aurait plus aucune bande utile (cf. commentaire data/cuisine.js).
  function seuilEffectif(recette, rangCuisinier) {
    return Math.max(4, Math.min(18, 8 + 2 * (recette.rang - rangCuisinier)));
  }
  // 1 est TOUJOURS un désastre, 20 TOUJOURS un chef-d'œuvre, quel que soit S
  // (délibéré : un Grand queux peut encore rater un plat) — testés avant les
  // bandes normales, qui ne couvriraient pas ce cas aux valeurs extrêmes de S.
  function _qualitePour(jetBrut, S) {
    if (jetBrut === 1) return QUALITES.find((q) => q.id === "desastre");
    if (jetBrut === 20) return QUALITES.find((q) => q.id === "chef");
    if (jetBrut <= S - 8) return QUALITES.find((q) => q.id === "desastre");
    if (jetBrut <= S - 4) return QUALITES.find((q) => q.id === "rate");
    if (jetBrut <= S - 1) return QUALITES.find((q) => q.id === "mediocre");
    if (jetBrut <= S + 3) return QUALITES.find((q) => q.id === "reussi");
    if (jetBrut <= S + 7) return QUALITES.find((q) => q.id === "bien");
    return QUALITES.find((q) => q.id === "chef");
  }

  // Bandes de qualité pour un couple (rang recette, rang cuisinier), dérivées
  // de _qualitePour ci-dessus — AUCUN recalcul indépendant des seuils : on
  // relance jetBrut de 1 à 20 et on regroupe les résultats contigus. C'est
  // délibérément la manière la plus lente de calculer ça, mais c'est la SEULE
  // qui garantit que l'onglet Cuisine (js/cuisine_reference.js, catalogue de
  // référence) affiche EXACTEMENT ce que produirait un vrai jet ici — deux
  // implémentations des bornes dériveraient au premier ajustement
  // d'équilibrage (cf. prompt_onglet_cuisine.md, "aucune duplication de la
  // logique de résolution").
  function bandesPour(rangRecette, rangCuisinier) {
    const S = seuilEffectif({ rang: rangRecette }, rangCuisinier);
    const bandes = [];
    for (let jetBrut = 1; jetBrut <= 20; jetBrut++) {
      const q = _qualitePour(jetBrut, S);
      const derniere = bandes[bandes.length - 1];
      if (derniere && derniere.qualiteId === q.id) derniere.max = jetBrut;
      else bandes.push({ qualiteId: q.id, nom: q.nom, min: jetBrut, max: jetBrut, dePlat: q.dPlat });
    }
    return { seuil: S, bandes };
  }

  // Résout un jet de cuisine — pure, ne touche à rien (cf. Alchimie.resoudre,
  // même patron). registre n'est JAMAIS lu ici : purement descriptif (cf.
  // data/cuisine.js, en-tête).
  function resoudre(recette, rangCuisinier, jetBrut) {
    const S = seuilEffectif(recette, rangCuisinier);
    const qualite = _qualitePour(jetBrut, S);
    const xpGagne = Math.ceil((2 * recette.rang + 3 * Math.max(0, recette.rang - rangCuisinier)) * qualite.xpMult);
    if (qualite.id === "rate") {
      return { qualite, S, jetBrut, xpGagne, produit: false, de: null, maximise: false, intoxication: false };
    }
    if (qualite.id === "desastre") {
      // Dé d'intoxication FIXE (1d6), indépendant de indexDe — le plat est
      // produit quand même, mais son dé sera SOUSTRAIT au repos long
      // (cf. js/repos.js), pas ajouté.
      return { qualite, S, jetBrut, xpGagne, produit: true, de: "1d6", maximise: false, intoxication: true };
    }
    const idx = Math.max(0, Math.min(ECHELLE_DES_PLAT.length - 1, recette.indexDe + (qualite.dPlat || 0)));
    return { qualite, S, jetBrut, xpGagne, produit: true, de: ECHELLE_DES_PLAT[idx], maximise: !!qualite.maximise, intoxication: false };
  }

  /* ── État local du sous-onglet (par navigateur, pas synchronisé) ── */
  let _persoIdCourant = null;

  function _htmlRang(p) {
    const rang = Metiers.rang(p, METIER_ID);
    const titre = Metiers.titre(p, METIER_ID);
    const xp = Metiers.xp(p, METIER_ID);
    const prog = Metiers.progressionVersRangSuivant(p, METIER_ID);
    return `<div class="carte">
      <h3 style="margin-top:0;">${METIERS.cuisine.icone} Cuisine — ${echapper(titre)} (rang ${rang})</h3>
      <div style="font-size:0.85rem;">${xp} XP${prog ? ` — ${prog.actuel}/${prog.requis} vers le rang ${rang + 1}` : " — rang maximum"}</div>
      ${prog ? `<div class="barre-pv" style="margin-top:4px;"><div class="rempli" style="width:${prog.pct}%;"></div></div>` : ""}
    </div>`;
  }

  function _htmlCarteRecette(recette, p, persoId, rangCuisinier) {
    const S = seuilEffectif(recette, rangCuisinier);
    const tentatives = _tentativesJour(persoId, recette.id);
    const maxTentatives = _tentativesJourMax(recette.rang);
    const restantes = maxTentatives - tentatives;
    const ok = _ingredientsDisponibles(p.inventaireListe, recette.ingredients);
    const coutTxt = recette.ingredients.map((c) => {
      if (c.id) {
        const dispo = _quantiteDisponible(p.inventaireListe, c.id);
        const manque = dispo < c.qte;
        return `<span${manque ? ' style="color:var(--chaos);font-weight:700;"' : ""}>${c.qte}× ${echapper(_nomIngredient(c.id))} (${dispo} en stock)</span>`;
      }
      // Entrée "au choix" : un <select> des vivres éligibles de la famille,
      // moins cher présélectionné (cf. _eligiblesFamille). Rien d'éligible → on
      // nomme la FAMILLE manquante, jamais un id ("il manque du sanglier"
      // serait faux quand n'importe quelle viande ferait l'affaire).
      const elig = _eligiblesFamille(p.inventaireListe, c.famille, c.qte);
      if (!elig.length) {
        return `<span style="color:var(--chaos);font-weight:700;">${echapper(c.famille)} ×${c.qte} — aucun vivre disponible</span>`;
      }
      const opts = elig.map((it) => `<option value="${echapper(it.id)}">${echapper(it.nom)} (${_quantiteDisponible(p.inventaireListe, it.id)}/${c.qte})</option>`).join("");
      return `<span>${echapper(c.famille)} ×${c.qte} — <select class="cuisine-choix-famille" data-recette="${echapper(recette.id)}" data-famille="${echapper(c.famille)}">${opts}</select></span>`;
    }).join(", ");
    const registre = REGISTRES_TABLE[recette.registre];
    const desactive = restantes <= 0 || !ok;
    return `<div class="carte" style="margin-top:10px;">
      <div><strong>${echapper(recette.nom)}</strong> — rang ${recette.rang} · valeur nourrissante ${ECHELLE_DES_PLAT[recette.indexDe]}${registre ? ` · <span title="Registre social — purement descriptif, aucun effet">${registre.icone} ${echapper(registre.nom)}</span>` : ""}</div>
      <div style="font-size:0.85rem;">Seuil effectif : ${S} (1 = toujours désastre, 20 = toujours chef-d'œuvre)</div>
      <div>Coût : ${coutTxt}</div>
      <div>Tentatives aujourd'hui : ${tentatives}/${maxTentatives}${restantes <= 0 ? " — épuisées" : ""}</div>
      ${recette.effetDeclaratif ? `<div class="aide" style="margin-top:4px;">✦ ${echapper(recette.effetDeclaratif)}</div>` : ""}
      ${recette.avertissement ? `<div class="aide" style="margin-top:4px;color:var(--chaos);">⚠ ${echapper(recette.avertissement)}</div>` : ""}
      <button class="btn or" data-cuisiner="${echapper(recette.id)}" ${desactive ? "disabled" : ""} style="margin-top:6px;">🍳 Cuisiner</button>
    </div>`;
  }

  function rendreZoneCuisine(persoId) {
    _persoIdCourant = persoId;
    const zone = document.getElementById("zone-atelier-cuisine");
    if (!zone) return;
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) { zone.innerHTML = ""; return; }
    const rangCuisinier = Metiers.rang(p, METIER_ID);
    const recettes = CUISINE_RECETTES.slice().sort((a, b) => a.rang - b.rang || a.nom.localeCompare(b.nom));
    zone.innerHTML = _htmlRang(p) + recettes.map((r) => _htmlCarteRecette(r, p, persoId, rangCuisinier)).join("");
    zone.querySelectorAll("[data-cuisiner]").forEach((btn) => {
      btn.onclick = () => _cuisiner(persoId, btn.dataset.cuisiner);
    });
  }

  // Nom + description d'un plat produit à partir d'un résultat de jet — pur,
  // aucun effet de bord. Partagé par l'Atelier (plat personnel, ajouté à
  // l'inventaire du cuisinier) ET par l'overlay de repos long collectif
  // (js/repos.js, plat partagé en 4 portions, jamais placé en inventaire) —
  // cf. tenterRecette ci-dessous pour la raison du découpage.
  function _construirePlat(recette, resultat) {
    return {
      id: `plat_${recette.id}_${resultat.qualite.id}`,
      nom: `${recette.nom} (${resultat.qualite.nom})`,
      type: "consommable",
      porte: false,
      quantite: 1,
      prixPo: 0, // un plat cuisiné ne se revend pas
      horsMarche: true,
      vivre: true,
      description: `${recette.nom}, ${resultat.qualite.nom.toLowerCase()}. `
        + (resultat.intoxication
          ? `Intoxication : dé de repos long soustrait (${resultat.de}), pas ajouté.`
          : `Dé de repos long : ${resultat.de}${resultat.maximise ? " (maximisé, non lancé)" : ""}.`)
        + (recette.effetDeclaratif ? ` ${recette.effetDeclaratif}` : ""),
      effetRepos: { des: [resultat.de], maximise: resultat.maximise, intoxication: resultat.intoxication },
    };
  }

  // Tentative de cuisson complète (jet, résolution, consommation des
  // ingrédients, XP, tentative/jour, annonce dans l'historique) — SANS
  // décider quoi faire du plat produit : l'Atelier l'ajoute à l'inventaire
  // du cuisinier (_cuisiner ci-dessous), l'overlay de repos long collectif
  // (js/repos.js) l'ajoute au pool partagé de 4 portions. Extrait pour que
  // les deux endroits appellent la MÊME logique de résolution — cf.
  // prompt_repos_long_scrutin.md, "aucune duplication de la logique de
  // résolution". Sauvegarde les persos elle-même (XP + tentative + Ingrédients).
  // choix (optionnel) : { [famille]: vivreId } — vivre retenu par le joueur
  // pour une entrée "au choix". Absent (overlay de repos long, appel direct) →
  // chaque famille prend automatiquement son vivre le moins cher éligible.
  function tenterRecette(persoId, recetteId, choix) {
    const recette = CUISINE_RECETTES.find((r) => r.id === recetteId);
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!recette || !p) return { ok: false, raison: "Recette ou personnage introuvable." };

    const rangCuisinier = Metiers.rang(p, METIER_ID);
    const maxTentatives = _tentativesJourMax(recette.rang);
    if (_tentativesJour(persoId, recetteId) >= maxTentatives) {
      return { ok: false, raison: "Plus de tentatives pour cette recette aujourd'hui." };
    }
    if (!_ingredientsDisponibles(p.inventaireListe, recette.ingredients, choix)) {
      return { ok: false, raison: "Ingrédients insuffisants." };
    }

    // Vivre retenu figé pour chaque entrée AVANT toute consommation (une entrée
    // "au choix" est résolue sur le vivre du joueur, sinon le moins cher).
    const resolus = recette.ingredients.map((c) => ({ qte: c.qte, id: _resoudreEntree(p.inventaireListe, c, choix) }));

    const jetBrut = App.lancerDe(20);
    const resultat = resoudre(recette, rangCuisinier, jetBrut);

    // Ingrédients consommés dans TOUS les cas, y compris raté et désastre —
    // rater brûle les vivres, c'est voulu (cf. prompt_repos_cuisine_metiers.md).
    resolus.forEach((r) => { if (r.id) _consommerQuantite(p.inventaireListe, r.id, r.qte); });

    const gainXp = Metiers.gagnerXp(p, METIER_ID, resultat.xpGagne);
    _incrementerTentative(persoId, recetteId);
    App.sauverPersos(persos);

    const detailJet = `d20[${jetBrut}] vs seuil ${resultat.S} — ${resultat.qualite.nom}${resultat.produit ? "" : " (rien produit)"}`;
    const label = `${p.nom} — Cuisine (${recette.nom})`;
    App.ajouterHisto(label, jetBrut, jetBrut === 20, jetBrut === 1, detailJet);

    return { ok: true, recette, resultat, gainXp, jetBrut, nomCuisinier: p.nom };
  }

  // Lit les vivres choisis dans les <select> "au choix" de la carte de CETTE
  // recette (data-recette unique par carte) — { [famille]: vivreId }.
  function _lireChoix(recetteId) {
    const choix = {};
    const sel = (window.CSS && CSS.escape) ? CSS.escape(recetteId) : recetteId;
    document.querySelectorAll(`.cuisine-choix-famille[data-recette="${sel}"]`).forEach((s) => {
      choix[s.dataset.famille] = s.value;
    });
    return choix;
  }

  function _cuisiner(persoId, recetteId) {
    const t = tenterRecette(persoId, recetteId, _lireChoix(recetteId));
    if (!t.ok) { toast(t.raison); return; }
    const { recette, resultat, gainXp } = t;

    if (resultat.produit) {
      const persos = App.chargerPersos();
      const p = persos[persoId];
      App.ajouterAInventaire(p, _construirePlat(recette, resultat));
      App.sauverPersos(persos);
    }

    let msg = `${resultat.qualite.nom} — ${resultat.produit ? `« ${recette.nom} » produit.` : "rien produit, ingrédients perdus."}`;
    if (resultat.xpGagne) msg += ` +${resultat.xpGagne} XP Cuisine.`;
    if (gainXp.montee) msg += ` 🍳 Nouveau rang : ${Metiers.titre(App.chargerPersos()[persoId], METIER_ID)} !`;
    toast(msg);

    rendreZoneCuisine(persoId);
  }

  return { rendreZoneCuisine, resoudre, seuilEffectif, bandesPour, tenterRecette, construirePlat: _construirePlat, tentativesJourMax: _tentativesJourMax, tentativesJour: _tentativesJour,
    // Résolution des entrées "au choix" par famille — réutilisée telle quelle
    // par js/cuisine_reference.js pour afficher une entrée famille sans
    // dupliquer la logique (cf. prompt étape 2 : "ils lisent les mêmes données").
    eligiblesFamille: _eligiblesFamille, entreeCouverte: _entreeCouverte, ingredientsDisponibles: _ingredientsDisponibles };
})();

if (typeof window !== "undefined") window.Cuisine = Cuisine;
