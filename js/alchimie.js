/* ============================================================
   Alchimie à risque — sous-onglet Atelier (rang Métier + recettes),
   cf. data/alchimie.js pour la table ALCHIMIE (recettes/paliers).

   Second volet du système de craft à risque, à côté de l'enchantement
   (js/enchantement.js, resté sur les fonctions privées de js/app.js —
   volontaire, cf. prompt_recolte_3_alchimie.md) : au lieu de faire
   progresser un objet déjà en inventaire, l'alchimie PRODUIT une potion du
   catalogue loot à partir d'ingrédients (fleurs, herbes...). Rien n'est
   jamais détruit ici (pas d'objet à perdre) — un jet catastrophique produit
   une "Potion ratée" à la place de la potion visée, plutôt qu'un échec sec.

   Module self-contained, même convention que js/cuisine.js/js/repos.js/
   js/marche.js/js/recolte.js : ses propres echapper()/toast(), accès à
   App/SyncStore/Metiers/Personnage uniquement via leurs API publiques —
   toute l'UI qui vivait dans js/app.js (Sous-onglet Alchimie) est reprise
   ici À L'IDENTIQUE dans son arborescence (type → filière/famille →
   cartes de palier), seul le bonus au jet change de source (rang de métier
   + INT au lieu d'un champ numérique libre, cf. §4).

   Jet : 1d20 + 2×rang(alchimie) + mod.INT — PAS les bandes de qualité de la
   Cuisine (QUALITES) : l'alchimie n'a que succès/échec/raté critique,
   jamais réutilisé/dupliqué ici à dessein.

   Tentatives/jour : réutilise la clé SyncStore "atelier:tentatives" (même
   table que Cuisine/Enchantement, cf. js/app.js), avec les MÊMES préfixes
   de clé qu'avant ce déplacement (alchimie:soin_<filiere>:<palier>,
   alchimie:util:<recette>, alchimie:poison_<famille>:<palier>) — le bouton
   MJ "🌅 Nouveau jour" (qui vide toute la table) continue donc de
   réinitialiser l'alchimie sans code supplémentaire.
   ============================================================ */

const Alchimie = (() => {
  "use strict";

  const METIER_ID = "alchimie";
  const STORAGE_ATELIER_TENTATIVES = "atelier:tentatives"; // même clé que js/app.js/js/cuisine.js

  /* ── Utilitaires (copie locale, même convention que js/cuisine.js) ── */
  function echapper(s) {
    const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML;
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2800);
  }

  function _nomCatalogueLoot(id) {
    if (typeof LOOT_CATALOGUE === "undefined") return id;
    const it = LOOT_CATALOGUE.find((l) => l.id === id);
    return it ? it.nom : id;
  }

  // Quantité/consommation de matériaux — copie locale de la paire
  // _quantiteDisponible/_consommerQuantite partagée enchantement+alchimie
  // dans js/app.js (jamais exposée publiquement, donc pas réutilisable
  // depuis ici sans la dupliquer — cf. prompt, §4.4 "sinon en faire une
  // copie locale").
  function _quantiteDisponible(inventaireListe, itemId) {
    return (inventaireListe || []).filter((it) => it.id === itemId).reduce((total, it) => total + (it.quantite || 1), 0);
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
  function _materiauxDisponibles(inventaireListe, cout) {
    return cout.every((c) => _quantiteDisponible(inventaireListe, c.id) >= c.qte);
  }
  function _consommerMateriaux(inventaireListe, cout) {
    cout.forEach((c) => _consommerQuantite(inventaireListe, c.id, c.qte));
  }

  function _tentativesAtelier() { return SyncStore.get(STORAGE_ATELIER_TENTATIVES) || {}; }
  // cle : identifiant composite COMPLET, déjà préfixé par l'appelant (ex.
  // "alchimie:soin_seve:2", "alchimie:util:antidote") — inchangé depuis
  // js/app.js, pour que "🌅 Nouveau jour" continue de tout réinitialiser.
  function _tentativesJour(persoId, cle) {
    const table = _tentativesAtelier();
    return (table[persoId] && table[persoId][cle]) || 0;
  }
  function _incrementerTentative(persoId, cle) {
    const table = _tentativesAtelier();
    table[persoId] = table[persoId] || {};
    table[persoId][cle] = (table[persoId][cle] || 0) + 1;
    SyncStore.set(STORAGE_ATELIER_TENTATIVES, table);
  }

  /* ── Trouveurs (inchangés) ──────────────────────────────────── */
  function trouverRecetteSoin(filiereId, palierId) {
    const f = ALCHIMIE.soin.filieres[filiereId];
    return f ? f.paliers.find((p) => p.id === palierId) : null;
  }
  function trouverRecetteUtilitaire(recetteId) {
    return ALCHIMIE.utilitaires.recettes.find((r) => r.id === recetteId) || null;
  }
  function trouverRecettePoison(familleId, palierId) {
    const f = ALCHIMIE.poisons.familles[familleId];
    return f ? f.paliers.find((p) => p.id === palierId) : null;
  }

  // Reconstruit la recette/palier à partir d'une clé composite (cf.
  // _tentativesJour) plutôt que de fermer sur une référence — les boutons
  // sont re-générés à chaque rendu, autant relire depuis ALCHIMIE à chaque
  // clic pour ne jamais dépendre d'un état capturé périmé.
  function _recetteDepuisCle(cle) {
    const parts = cle.split(":"); // ["alchimie", "soin_<filiere>" | "util" | "poison_<famille>", <palierId> | <recetteId>]
    if (parts[1] === "util") return trouverRecetteUtilitaire(parts[2]);
    if (parts[1].startsWith("poison_")) return trouverRecettePoison(parts[1].replace(/^poison_/, ""), parseInt(parts[2], 10));
    const filiereId = parts[1].replace(/^soin_/, "");
    return trouverRecetteSoin(filiereId, parseInt(parts[2], 10));
  }

  // jetBrut : d20 seul (avant bonus) — juge à lui seul le brassage raté.
  // bonus : 2×rang + mod.INT (cf. _bonusJet ci-dessous), ajouté au jet pour
  // juger la réussite face à recette.diff. Contrairement à
  // Enchantements.resoudre, il n'y a rien à muter/détruire ici : le résultat
  // pointe seulement l'id catalogue à produire (ou null). INCHANGÉ par
  // rapport à l'ancien js/alchimie.js — seule la provenance de `bonus`
  // change (cf. prompt_recolte_3_alchimie.md, interdit de rééquilibrage).
  function resoudre(recette, jetBrut, bonus) {
    if (!recette) return { resultat: "erreur", message: "Recette introuvable." };

    if (recette.rateCritiqueSi > 0 && jetBrut <= recette.rateCritiqueSi) {
      const itemRateId = recette.itemRateId || "potion_ratee";
      const messageRate = itemRateId === "potion_ratee"
        ? "une Potion ratée est produite à la place."
        : "un résultat instable est produit à la place.";
      return {
        resultat: "ratee", itemProduitId: itemRateId,
        message: `Brassage raté (jet brut ${jetBrut} ≤ ${recette.rateCritiqueSi}) — ${messageRate}`,
      };
    }
    const total = jetBrut + (bonus || 0);
    if (total >= recette.diff) {
      return { resultat: "succes", itemProduitId: recette.potionId, message: `Réussite (${total} ≥ ${recette.diff}).` };
    }
    return { resultat: "echec", itemProduitId: null, message: `Échec (${total} < ${recette.diff}) — ingrédients perdus, rien produit.` };
  }

  // Rang de recette DÉRIVÉ de diff plutôt qu'un champ ajouté à la table (qui
  // obligerait à toucher les 21 recettes, interdit par le prompt) : diff
  // 10→1, 12→2, 14→3, 16→4, 18→5, 20→5 (plafonné, cf. prompt §4.2).
  function _rangRecette(recette) {
    return Math.max(1, Math.min(5, Math.round((recette.diff - 8) / 2)));
  }

  // xpMult : succès 1, échec simple 0.5 (on apprend en ratant une mixture),
  // raté critique 0. Ne réutilise PAS QUALITES.xpMult de la Cuisine :
  // l'alchimie n'a pas de bandes de qualité (cf. en-tête de ce fichier).
  function _xpMultPour(resultatId) {
    if (resultatId === "succes") return 1;
    if (resultatId === "echec") return 0.5;
    return 0; // "ratee" (critique) ou "erreur"
  }

  /* ── Bonus au jet (rang + INT) — remplace l'ancien champ numérique libre ─ */
  // { rang, modINT, bonus, texte } — `texte` est la ligne lecture-seule
  // affichée à la place de l'ancien champ de saisie manuelle (cf. prompt
  // §4.3) : le joueur doit voir d'où vient son bonus, il ne le saisit plus.
  function _bonusJet(p) {
    const rang = Metiers.rang(p, METIER_ID);
    const perso = Personnage.depuisJSON(p);
    const modINT = perso.mod("INT");
    const bonus = 2 * rang + modINT;
    const signe = (n) => (n >= 0 ? "+" : "") + n;
    return { rang, modINT, bonus, texte: `2 × rang (${rang}) + INT (${signe(modINT)}) = ${signe(bonus)}` };
  }

  /* ── État local du sous-onglet (par navigateur, pas synchronisé) ──
     Patron _persoIdCourant de js/cuisine.js — alchimieType/FiliereId/
     FamilleId étaient des variables de module d'app.js (cf. prompt §3),
     désormais privées ici. */
  let _persoIdCourant = null;
  let _type = null;      // "soin" | "utilitaires" | "poisons"
  let _filiereId = null; // "seve" | "flambeau" (si _type === "soin")
  let _familleId = null; // "enduit" | "dard" | "piege" (si _type === "poisons")

  function _htmlRang(p) {
    const rang = Metiers.rang(p, METIER_ID);
    const titre = Metiers.titre(p, METIER_ID);
    const xp = Metiers.xp(p, METIER_ID);
    const prog = Metiers.progressionVersRangSuivant(p, METIER_ID);
    return `<div class="carte">
      <h3 style="margin-top:0;">${METIERS.alchimie.icone} Alchimie — ${echapper(titre)} (rang ${rang})</h3>
      <div style="font-size:0.85rem;">${xp} XP${prog ? ` — ${prog.actuel}/${prog.requis} vers le rang ${rang + 1}` : " — rang maximum"}</div>
      ${prog ? `<div class="barre-pv" style="margin-top:4px;"><div class="rempli" style="width:${prog.pct}%;"></div></div>` : ""}
    </div>`;
  }

  function rendreZoneAlchimie(persoId) {
    _persoIdCourant = persoId;
    const zone = document.getElementById("zone-atelier-alchimie");
    if (!zone) return;
    const p = App.chargerPersos()[persoId];
    if (!p) { zone.innerHTML = ""; return; }
    const mod = _bonusJet(p);
    zone.innerHTML = _htmlRang(p) + `<div class="carte">
      <label>Type de potion
        <select id="select-alchimie-type">
          <option value="soin">${echapper(ALCHIMIE.soin.label)}</option>
          <option value="utilitaires">${echapper(ALCHIMIE.utilitaires.label)}</option>
          <option value="poisons">${echapper(ALCHIMIE.poisons.label)}</option>
        </select>
      </label>
      <div style="margin-top:6px;font-size:0.85rem;">Bonus au jet : ${echapper(mod.texte)}</div>
      <div id="zone-alchimie-detail" style="margin-top:10px;"></div>
    </div>`;
    const sel = document.getElementById("select-alchimie-type");
    _type = _type || "soin";
    sel.value = _type;
    sel.onchange = () => { _type = sel.value; _filiereId = null; _familleId = null; _rendreAlchimieDetail(); };
    _rendreAlchimieDetail();
  }

  function _rendreAlchimieDetail() {
    if (_type === "utilitaires") _rendreAlchimieUtilitaires();
    else if (_type === "poisons") _rendreAlchimiePoisons();
    else _rendreAlchimieSoin();
  }

  function _rendreAlchimieSoin() {
    const zone = document.getElementById("zone-alchimie-detail");
    if (!zone) return;
    const filieres = Object.keys(ALCHIMIE.soin.filieres);
    _filiereId = filieres.includes(_filiereId) ? _filiereId : filieres[0];
    zone.innerHTML = `
      <label>Filière
        <select id="select-alchimie-filiere">
          ${filieres.map((fid) => `<option value="${fid}">${echapper(ALCHIMIE.soin.filieres[fid].label)}</option>`).join("")}
        </select>
      </label>
      <div id="zone-alchimie-paliers" style="margin-top:10px;"></div>
    `;
    const sel = document.getElementById("select-alchimie-filiere");
    sel.value = _filiereId;
    sel.onchange = () => { _filiereId = sel.value; _rendreAlchimiePaliersSoin(); };
    _rendreAlchimiePaliersSoin();
  }

  function _rendreAlchimiePaliersSoin() {
    const zone = document.getElementById("zone-alchimie-paliers");
    if (!zone) return;
    const filiere = ALCHIMIE.soin.filieres[_filiereId];
    if (!filiere) { zone.innerHTML = ""; return; }
    _rendreCartesRecettes(zone, filiere.paliers.map((palier) => ({ recette: palier, cle: `alchimie:soin_${_filiereId}:${palier.id}` })));
  }

  // Copie quasi conforme de _rendreAlchimieSoin/_rendreAlchimiePaliersSoin,
  // mais sur ALCHIMIE.poisons.familles — variable dédiée (_familleId) pour
  // ne pas mélanger les deux systèmes si jamais leurs clés se recoupent.
  function _rendreAlchimiePoisons() {
    const zone = document.getElementById("zone-alchimie-detail");
    if (!zone) return;
    const familles = Object.keys(ALCHIMIE.poisons.familles);
    _familleId = familles.includes(_familleId) ? _familleId : familles[0];
    zone.innerHTML = `
      <label>Famille
        <select id="select-alchimie-famille">
          ${familles.map((fid) => `<option value="${fid}">${echapper(ALCHIMIE.poisons.familles[fid].label)}</option>`).join("")}
        </select>
      </label>
      <div id="zone-alchimie-paliers" style="margin-top:10px;"></div>
    `;
    const sel = document.getElementById("select-alchimie-famille");
    sel.value = _familleId;
    sel.onchange = () => { _familleId = sel.value; _rendreAlchimiePaliersPoisons(); };
    _rendreAlchimiePaliersPoisons();
  }

  function _rendreAlchimiePaliersPoisons() {
    const zone = document.getElementById("zone-alchimie-paliers");
    if (!zone) return;
    const famille = ALCHIMIE.poisons.familles[_familleId];
    if (!famille) { zone.innerHTML = ""; return; }
    _rendreCartesRecettes(zone, famille.paliers.map((palier) => ({ recette: palier, cle: `alchimie:poison_${_familleId}:${palier.id}` })));
  }

  function _rendreAlchimieUtilitaires() {
    const zone = document.getElementById("zone-alchimie-detail");
    if (!zone) return;
    zone.innerHTML = `<div id="zone-alchimie-paliers"></div>`;
    _rendreCartesRecettes(document.getElementById("zone-alchimie-paliers"),
      ALCHIMIE.utilitaires.recettes.map((r) => ({ recette: r, cle: `alchimie:util:${r.id}` })));
  }

  // Rendu partagé filière-soin/poisons/utilitaires : une carte par recette,
  // même gabarit qu'avant ce déplacement (diff/tentatives/coût/bouton).
  function _rendreCartesRecettes(zone, entrees) {
    if (!zone) return;
    const p = App.chargerPersos()[_persoIdCourant];
    if (!p) { zone.innerHTML = ""; return; }
    zone.innerHTML = entrees.map(({ recette, cle }) => {
      const nomPotion = _nomCatalogueLoot(recette.potionId);
      const tentatives = _tentativesJour(_persoIdCourant, cle);
      const restantes = recette.tentativesJour - tentatives;
      const materiauxOk = _materiauxDisponibles(p.inventaireListe, recette.cout);
      const coutTxt = recette.cout.map((c) => {
        const dispo = _quantiteDisponible(p.inventaireListe, c.id);
        const manque = dispo < c.qte;
        return `<span${manque ? ' style="color:var(--chaos);font-weight:700;"' : ""}>${c.qte}× ${echapper(_nomCatalogueLoot(c.id))} (${dispo} en stock)</span>`;
      }).join(", ");
      const desactive = restantes <= 0 || !materiauxOk;
      const nomItemRate = _nomCatalogueLoot(recette.itemRateId || "potion_ratee");
      return `<div class="carte" style="margin-top:10px;">
        <div><strong>${echapper(nomPotion)}</strong> — diff. ${recette.diff}${recette.rateCritiqueSi > 0 ? ` · <span style="color:var(--chaos);">rate si jet brut ≤ ${recette.rateCritiqueSi} (${echapper(nomItemRate)})</span>` : ""}</div>
        ${recette.formuleDot ? `<div>Dégâts par tour : ${echapper(recette.formuleDot)}${recette.dureeEtat ? ` pendant ${recette.dureeEtat} tours` : ""}</div>` : ""}
        <div>Coût : ${coutTxt}</div>
        <div>Tentatives aujourd'hui : ${tentatives}/${recette.tentativesJour}${restantes <= 0 ? " — épuisées" : ""}</div>
        <button class="btn or" data-cle-recette="${echapper(cle)}" ${desactive ? "disabled" : ""} style="margin-top:6px;">Brasser</button>
      </div>`;
    }).join("");

    zone.querySelectorAll("[data-cle-recette]").forEach((btn) => {
      btn.onclick = () => _brasserPotion(btn.dataset.cleRecette);
    });
  }

  function _brasserPotion(cle) {
    const recette = _recetteDepuisCle(cle);
    const persos = App.chargerPersos();
    const p = persos[_persoIdCourant];
    if (!recette || !p) return;

    if (_tentativesJour(_persoIdCourant, cle) >= recette.tentativesJour) {
      toast("Plus de tentatives pour cette recette aujourd'hui.");
      return;
    }
    if (!_materiauxDisponibles(p.inventaireListe, recette.cout)) {
      toast("Matériaux insuffisants.");
      return;
    }

    const rangAlchimie = Metiers.rang(p, METIER_ID);
    const mod = _bonusJet(p);
    const jetBrut = App.lancerDe(20);
    const resultat = resoudre(recette, jetBrut, mod.bonus);

    // Ingrédients consommés dans tous les cas (succès, échec, ratée).
    _consommerMateriaux(p.inventaireListe, recette.cout);

    if (resultat.resultat !== "echec") {
      const itemCatalogue = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((it) => it.id === resultat.itemProduitId) : null;
      if (itemCatalogue) App.ajouterAInventaire(p, Object.assign({}, itemCatalogue));
    }
    _incrementerTentative(_persoIdCourant, cle);

    const rangRecette = _rangRecette(recette);
    const xpGagne = Math.ceil((2 * rangRecette + 3 * Math.max(0, rangRecette - rangAlchimie)) * _xpMultPour(resultat.resultat));
    const gainXp = Metiers.gagnerXp(p, METIER_ID, xpGagne);
    App.sauverPersos(persos);

    const total = jetBrut + mod.bonus;
    const crit = jetBrut === 20, echec = jetBrut === 1;
    const detailJet = `d20[${jetBrut}]${mod.bonus >= 0 ? "+" : ""}${mod.bonus} — ${resultat.message}`;
    const label = `${p.nom} — Alchimie (${_nomCatalogueLoot(recette.potionId)})`;
    App.ajouterHisto(label, total, crit, echec, detailJet);

    let msg = resultat.message;
    if (xpGagne) msg += ` +${xpGagne} XP Alchimie.`;
    if (gainXp.montee) msg += ` ⚗️ Nouveau rang : ${Metiers.titre(App.chargerPersos()[_persoIdCourant], METIER_ID)} !`;
    toast(msg);

    rendreZoneAlchimie(_persoIdCourant);
  }

  return {
    LISTE: ALCHIMIE, trouverRecetteSoin, trouverRecetteUtilitaire, trouverRecettePoison, resoudre,
    rendreZoneAlchimie,
  };
})();

if (typeof window !== "undefined") window.Alchimie = Alchimie;
