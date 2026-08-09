/* ============================================================
   Remous — jauge partagée de la Mer des âmes (cf. Lore > Chroniques,
   « La membrane et les Remous », prompt_systeme_magie_remous.md).

   Calqué sur js/meteo.js : module autonome, état en SyncStore (donc
   synchronisé temps réel MJ ↔ joueurs), API exposée sur window.

   Une seule clé : "remous:etat" → { total, membraneId, lieu,
   paliersFranchis }. La jauge appartient au LIEU, pas au lanceur —
   contrairement à meteo:courante (une seule météo pour toute la
   campagne), remous:etat représente la scène/lieu en cours ; le MJ la
   vide manuellement (repos long / heure de marche) en changeant de lieu.

   paliersFranchis est DÉRIVÉ de total × seuilsCourants() à chaque
   écriture — stocké pour que l'UI n'ait pas à réimporter la logique de
   seuils, pas parce que c'est une source de vérité indépendante.
   ============================================================ */

const Remous = (() => {
  "use strict";

  const CLE_ETAT = "remous:etat";

  // ── Coefficient de source, PAR RACE du personnage (cf. §4 du prompt :
  // la source est déterminée par la race, pas par la classe). Table
  // NOMMÉE et isolée exprès : humain/elfe/nain sont validés par Thomas,
  // les trois demi-races sont DES VALEURS PROPOSÉES, NON VALIDÉES — à
  // changer d'une ligne si Thomas tranche différemment.
  const COEFFICIENTS_SOURCE_RACE = {
    humain: 1, // puise dans la Mer
    elfe: 0, // Sève — source Arbre
    nain: 0, // Pierre — source Arbre
    demi_elfe: 0.5, // à confirmer — sang mêlé, accès partiel à la Sève
    demi_orc: 1, // à confirmer — aucun lien à l'Arbre
    demi_gobelin: 1, // à confirmer — aucun lien à l'Arbre
    gnome: 0, // si la race jouable existe un jour — Runes de sève, source Arbre
  };

  // Un prêtre nain contribue ZÉRO, comme tout nain (cf. table ci-dessus) —
  // décision explicite de Thomas. Cohérence : le filtre divin qui permet
  // de bannir un démon est un geste DU DIEU, pas du prêtre — le prêtre est
  // un conduit, pas un nageur. Il peut donc renvoyer une âme dans la Mer
  // sans y puiser lui-même. Aucun cas spécial nécessaire dans le code :
  // coefficient(nain) = 0 s'applique déjà à tout personnage de cette race,
  // prêtre ou non.

  // Filtre divin : magie filtrée par un dieu correctement ancré compte à
  // moitié (arrondi à l'inférieur, cf. section « La membrane et les
  // Remous »). Prévu ici pour les casters PNJ agréés par l'Église de
  // Solvarn — PAS appliqué à un personnage joueur actuel (aucun PJ n'a de
  // filtre divin à ce stade de la campagne).
  const COEFFICIENT_FILTRE_DIVIN = 0.5;

  // Seuils cumulés en membrane épaisse, et diviseur par membrane.
  const SEUILS_BASE = [48, 96, 144, 192];
  const MEMBRANES = {
    epaisse: { nom: "Épaisse", diviseur: 1 },
    amincie: { nom: "Amincie", diviseur: 2 },
    fine: { nom: "Fine", diviseur: 3 },
    dechiree: { nom: "Déchirée", diviseur: 4 },
  };
  const ORDRE_MEMBRANES = ["epaisse", "amincie", "fine", "dechiree"];

  // Paliers de Déchirure — gain caster ET coût, cf. section « La membrane
  // et les Remous ». index 0 = sous le palier 1 (rien ne s'applique).
  const PALIERS = [
    { palier: 0, nom: "Stable", coutSortsDelta: 0, degatsSortsDelta: 0, ppMaxDelta: 0, degatsZoneParTour: null, demon: null },
    { palier: 1, nom: "Déchirure", coutSortsDelta: -1, degatsSortsDelta: 2, ppMaxDelta: 0, degatsZoneParTour: null, demon: "Un démon Reliquat (D1) se manifeste." },
    { palier: 2, nom: "Ouverture", coutSortsDelta: -2, degatsSortsDelta: 4, ppMaxDelta: 4, degatsZoneParTour: "1d6", demon: "Le démon monte d'un palier." },
    { palier: 3, nom: "Marée", coutSortsDelta: -3, degatsSortsDelta: 6, ppMaxDelta: 8, degatsZoneParTour: "2d6", demon: "Le démon monte d'un palier, et un second démon apparaît." },
    { palier: 4, nom: "La Plaie", coutSortsDelta: -4, degatsSortsDelta: 8, ppMaxDelta: 12, degatsZoneParTour: "3d6", demon: "Le démon atteint son plafond. Le lieu reste déchiré." },
  ];

  function _estMJ() {
    return (typeof App !== "undefined" && App.obtenirRole() === "mj");
  }

  // toast() n'est PAS un global partagé dans ce projet : app.js/loot.js/
  // repos.js/forge.js/marche.js définissent chacun leur propre copie
  // privée, ciblant #toast. remous.js fait de même — un `typeof toast`
  // gardé dans un module séparé ne résoudrait jamais à cette fonction, il
  // aurait simplement échoué en silence.
  let _toastTimer = null;
  function _toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg;
    t.classList.add("visible");
    if (_toastTimer) clearTimeout(_toastTimer);
    _toastTimer = setTimeout(() => { t.classList.remove("visible"); _toastTimer = null; }, 5000);
  }

  function coefficientRace(raceId) {
    return Object.prototype.hasOwnProperty.call(COEFFICIENTS_SOURCE_RACE, raceId)
      ? COEFFICIENTS_SOURCE_RACE[raceId] : 0;
  }

  // ── État ───────────────────────────────────────────────────
  function obtenirEtat() {
    const e = SyncStore.get(CLE_ETAT);
    if (e && typeof e.total === "number") return e;
    return { total: 0, membraneId: "epaisse", lieu: "Lieu actuel", paliersFranchis: [] };
  }

  function _ecrire(etat) {
    const seuils = _seuilsPour(etat.membraneId);
    etat.paliersFranchis = seuils.reduce((acc, s, idx) => {
      if (etat.total >= s) acc.push(idx + 1);
      return acc;
    }, []);
    SyncStore.set(CLE_ETAT, etat);
    return etat;
  }

  function _seuilsPour(membraneId) {
    const m = MEMBRANES[membraneId] || MEMBRANES.epaisse;
    return SEUILS_BASE.map((s) => Math.round(s / m.diviseur));
  }

  function total() { return obtenirEtat().total; }
  function membrane() { return obtenirEtat().membraneId; }
  function lieu() { return obtenirEtat().lieu; }

  function seuilsCourants() { return _seuilsPour(obtenirEtat().membraneId); }

  // Palier courant, dérivé de total × seuilsCourants() — jamais stocké
  // comme vérité indépendante (cf. paliersFranchis, juste une projection).
  function palierCourant() {
    const e = obtenirEtat();
    const seuils = _seuilsPour(e.membraneId);
    let idx = 0;
    seuils.forEach((s, i) => { if (e.total >= s) idx = i + 1; });
    return PALIERS[idx];
  }

  // Changer de membrane recalcule les seuils SANS toucher au total (cf.
  // prompt : re-bornage, pas un reset — même logique que Meteo région/
  // saison). MJ uniquement.
  function definirMembrane(niveau) {
    if (!_estMJ() || !MEMBRANES[niveau]) return false;
    const e = obtenirEtat();
    _ecrire(Object.assign({}, e, { membraneId: niveau }));
    return true;
  }

  function definirLieu(nom) {
    if (!_estMJ()) return false;
    const e = obtenirEtat();
    _ecrire(Object.assign({}, e, { lieu: String(nom || "Lieu actuel") }));
    return true;
  }

  // Vidange : repos long, ou une heure de marche effective. Remet le
  // total à zéro — les paliers "retombent avec la jauge", SAUF la Plaie
  // (cf. ajouter() ci-dessous : palier 4 force déjà membraneId à
  // "dechiree" au moment où il est franchi, donc vider() qui ne touche
  // jamais membraneId préserve cette marque durable automatiquement,
  // sans code spécial ici).
  function vider(raison) {
    if (!_estMJ()) return false;
    const e = obtenirEtat();
    _ecrire(Object.assign({}, e, { total: 0 }));
    if (typeof App !== "undefined" && App.ajouterHisto) {
      App.ajouterHisto("🌫 Remous — vidange", 0, false, false,
        raison === "marche" ? "Une heure de marche effective." : "Repos long.");
    }
    return true;
  }

  // Ajustement manuel (MJ uniquement) : rattraper un oubli, ou compter un
  // PNJ caster qui ne passe pas par Capacites.lancer.
  function ajusterManuel(delta) {
    if (!_estMJ()) return false;
    const e = obtenirEtat();
    _ecrire(Object.assign({}, e, { total: Math.max(0, e.total + (Number(delta) || 0)) }));
    return true;
  }

  // Point d'entrée appelé depuis js/capacites.js (les deux seuls sites de
  // dépense de PP, cf. §3 du prompt) à chaque coût PP RÉEL décompté.
  // Applique le coefficient de source de `perso.race`, incrémente la
  // jauge du LIEU courant, et renvoie le palier fraîchement franchi (1-4)
  // s'il y en a un, sinon null. Un coefficient nul (elfe/nain/gnome) ne
  // touche même pas SyncStore — pas d'écriture bruit pour une contribution
  // de zéro.
  function ajouter(perso, coutPPReel) {
    if (!perso || !coutPPReel) return null;
    const coeff = coefficientRace(perso.race);
    const contribution = Math.floor(coutPPReel * coeff);
    if (!contribution) return null;

    const e = obtenirEtat();
    const seuils = _seuilsPour(e.membraneId);
    const avant = e.total;
    const apres = avant + contribution;

    let palierFranchi = null;
    seuils.forEach((s, i) => { if (avant < s && apres >= s) palierFranchi = i + 1; });

    const patch = { total: apres };
    // La Plaie (palier 4) marque le lieu durablement : la membrane devient
    // "déchirée" pour de bon, PAS seulement pour la scène — cf. section
    // « La membrane et les Remous », Persistance. C'est le seul cas où ce
    // module modifie membraneId de sa propre initiative plutôt que sur
    // ordre du MJ (definirMembrane) : un nouveau Valmoire, créé par les
    // joueurs eux-mêmes. Réparable seulement par un rituel (fil MJ ouvert,
    // aucun code ici).
    if (palierFranchi === 4) patch.membraneId = "dechiree";
    _ecrire(Object.assign({}, e, patch));

    // Le toast de franchissement vit ICI plutôt que côté appelant : le
    // seul appelant (js/capacites.js) est restreint à un unique appel nu
    // par site (§3 du prompt), sans place pour une gestion conditionnelle
    // du retour. cf. section « La membrane et les Remous » pour le texte
    // des paliers (bonus caster ET coût).
    if (palierFranchi) {
      const info = PALIERS[palierFranchi];
      const gain = `sorts -${Math.abs(info.coutSortsDelta)} PP, +${info.degatsSortsDelta} dégâts${info.ppMaxDelta ? `, PP max +${info.ppMaxDelta}` : ""}`;
      const cout = info.degatsZoneParTour ? ` — ${info.degatsZoneParTour} dégâts/tour à tout le lieu.` : "";
      _toast(`🌫 Palier ${palierFranchi} — ${info.nom} ! Gain : ${gain}.${cout} ${info.demon}`);
    }

    return palierFranchi;
  }

  // ── Rendu ──────────────────────────────────────────────────
  function _echapper(s) {
    const d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }

  // Rendu autonome dans un conteneur donné — appelé sous l'ordre
  // d'initiative, côté MJ (battlemap-zone-ordre-initiative /
  // zone-ordre-initiative) ET côté joueur
  // (battlemap-zone-ordre-initiative-joueur). Chaque appel cible SON
  // propre id de conteneur : les contrôles internes sont donc scopés via
  // container.querySelector (classes), jamais document.getElementById,
  // sur le même principe que rendreOrdreInitiative (plusieurs instances
  // peuvent coexister dans le DOM).
  function rendreJauge(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const e = obtenirEtat();
    const seuils = _seuilsPour(e.membraneId);
    const p = palierCourant();
    const estMJ = _estMJ();
    const prochainSeuil = seuils[p.palier] !== undefined ? seuils[p.palier] : null;
    const seuilPrecedent = p.palier > 0 ? seuils[p.palier - 1] : 0;
    const pourcent = prochainSeuil
      ? Math.max(0, Math.min(100, Math.round(((e.total - seuilPrecedent) / (prochainSeuil - seuilPrecedent)) * 100)))
      : 100;
    const membraneNom = (MEMBRANES[e.membraneId] || MEMBRANES.epaisse).nom;

    container.innerHTML = `
      <div class="carte remous-carte" style="margin-top:8px;">
        <div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;flex-wrap:wrap;">
          <h4 style="margin:0;font-size:0.9rem;">🌫 Remous — ${_echapper(e.lieu)}</h4>
          <span style="font-size:0.78rem;color:#6a6278;">Membrane ${_echapper(membraneNom)}</span>
        </div>
        <p style="font-size:0.82rem;margin:4px 0 2px;">
          <strong>${_echapper(e.total)}</strong> PP cumulés
          ${prochainSeuil ? ` — palier ${p.palier + 1} à ${_echapper(prochainSeuil)}` : " — palier maximal atteint"}
          ${p.palier > 0 ? ` · palier courant : <strong>${_echapper(p.nom)}</strong>` : ""}
        </p>
        <div style="height:8px;border-radius:4px;background:rgba(0,0,0,.08);overflow:hidden;margin:4px 0 8px;">
          <div style="height:100%;width:${pourcent}%;background:${p.palier >= 4 ? "#8a2f3b" : p.palier > 0 ? "#c98a2f" : "#2f9e44"};"></div>
        </div>
        ${estMJ ? `
        <div class="remous-controles" style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;">
          <select class="champ remous-select-membrane" style="width:auto;">
            ${ORDRE_MEMBRANES.map((id) => `<option value="${id}"${id === e.membraneId ? " selected" : ""}>${_echapper(MEMBRANES[id].nom)}</option>`).join("")}
          </select>
          <button class="btn petit secondaire remous-btn-vider" data-raison="repos">Repos long</button>
          <button class="btn petit secondaire remous-btn-vider" data-raison="marche">Une heure de marche</button>
          <button class="btn petit secondaire remous-btn-ajuster" data-delta="-1">−1</button>
          <button class="btn petit secondaire remous-btn-ajuster" data-delta="1">+1</button>
        </div>` : ""}
      </div>`;

    if (!estMJ) return;
    const selMembrane = container.querySelector(".remous-select-membrane");
    if (selMembrane) selMembrane.onchange = () => { definirMembrane(selMembrane.value); rendreJauge(containerId); };
    container.querySelectorAll(".remous-btn-vider").forEach((btn) => {
      btn.onclick = () => { vider(btn.dataset.raison); rendreJauge(containerId); };
    });
    container.querySelectorAll(".remous-btn-ajuster").forEach((btn) => {
      btn.onclick = () => { ajusterManuel(Number(btn.dataset.delta)); rendreJauge(containerId); };
    });
  }

  return {
    obtenirEtat, total, membrane, lieu, seuilsCourants, palierCourant,
    definirMembrane, definirLieu, vider, ajusterManuel, ajouter,
    coefficientRace, rendreJauge,
  };
})();

if (typeof window !== "undefined") window.Remous = Remous;
