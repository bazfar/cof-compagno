/* ============================================================
   Météo — état partagé du temps, jeté par un joueur désigné.

   Trois clés SyncStore :
     meteo:courante  → { regionId, saisonId, rudesseId, registre,
                         intensite, jour, jeteurId, jeteurNom, horodatage }
     meteo:porteciel → joueurId du joueur habilité à jeter
     meteo:journal   → liste des derniers jets (limite 20)

   Le registre n'est PAS stocké comme choix : il est DÉRIVÉ de
   région × saison via CLIMATS_METEO (cf. data/meteo.js). Il est
   recopié dans l'état uniquement pour l'affichage — la source de
   vérité reste le couple région/saison.

   Le jet est un ACTE DE JOUEUR (demande explicite de Thomas) : le MJ
   désigne un Porte-Ciel en début de session, ce joueur seul voit les
   boutons de jet. Un −4 au tir devient la faute de quelqu'un à la
   table plutôt qu'un arbitraire du MJ.

   Le MJ garde l'override complet (imposer une intensité) et le reset.
   ============================================================ */

const Meteo = (() => {
  "use strict";

  const CLE_ETAT = "meteo:courante";
  const CLE_PORTECIEL = "meteo:porteciel";
  const CLE_JOURNAL = "meteo:journal";

  function _d(faces) {
    if (window.crypto && window.crypto.getRandomValues) {
      const buf = new Uint32Array(1);
      window.crypto.getRandomValues(buf);
      return Math.floor((buf[0] / 4294967296) * faces) + 1;
    }
    return Math.floor(Math.random() * faces) + 1;
  }

  function _estMJ() {
    return (typeof App !== "undefined" && App.obtenirRole() === "mj");
  }

  function _region(id) { return REGIONS_METEO.find((r) => r.id === id) || REGIONS_METEO[4]; }
  function _climat(regionId) { return CLIMATS_METEO[_region(regionId).climat] || CLIMATS_METEO.mediterraneen; }
  function _rudesse(id) { return RUDESSE_ANNEE.find((r) => r.id === id) || RUDESSE_ANNEE[1]; }

  // Cellule climat × saison : { registre, fenetre } — ou null si souterrain.
  function _cellule(regionId, saisonId) {
    const c = _climat(regionId);
    if (c.souterrain) return null;
    return c[saisonId] || c.printemps;
  }

  function estSouterrain(regionId) {
    const e = regionId ? { regionId } : obtenirEtat();
    return !!_climat(e.regionId).souterrain;
  }

  function effetPermanent(regionId) {
    const e = regionId ? { regionId } : obtenirEtat();
    return _climat(e.regionId).effetPermanent || null;
  }

  // ── État ───────────────────────────────────────────────────
  function obtenirEtat() {
    const e = SyncStore.get(CLE_ETAT);
    if (e && typeof e.intensite === "number") return e;
    return { regionId: "liberra_nord", saisonId: "printemps", rudesseId: "normale",
             registre: "tempere", intensite: 0, jour: 0,
             jeteurId: null, jeteurNom: null, horodatage: 0 };
  }

  function _ecrire(etat) { SyncStore.set(CLE_ETAT, etat); }

  function obtenirPorteCiel() { return SyncStore.get(CLE_PORTECIEL) || null; }

  function definirPorteCiel(joueurId) {
    if (!_estMJ()) return false;
    SyncStore.set(CLE_PORTECIEL, joueurId || null);
    return true;
  }

  function estPorteCiel() {
    const id = obtenirPorteCiel();
    return !!id && typeof App !== "undefined" && App.obtenirJoueurId() === id;
  }

  // ── Palier et modificateurs ────────────────────────────────
  function registreCourant() {
    const e = obtenirEtat();
    const cell = _cellule(e.regionId, e.saisonId);
    return cell ? cell.registre : null;
  }

  function palierPour(registre, intensite) {
    const grille = PALIERS_METEO[registre] || PALIERS_METEO.tempere;
    if (!intensite) return grille[0]; // pas encore jeté → palier calme
    return grille.find((p) => intensite >= p.min && intensite <= p.max) || grille[0];
  }

  function palierCourant() {
    const reg = registreCourant();
    if (!reg) {
      // Souterrain : palier calme, mais l'effet permanent (Khazrak Dûm,
      // eau ×2) est fusionné dedans — c'est le seul modificateur qui
      // survit à l'absence de météo.
      const base = JSON.parse(JSON.stringify(PALIERS_METEO.tempere[0]));
      const perm = effetPermanent();
      if (perm) Object.assign(base, perm);
      base.nom = "Sous la roche";
      return base;
    }
    return palierPour(reg, obtenirEtat().intensite);
  }

  function nomDuTemps() {
    const e = obtenirEtat();
    const reg = registreCourant();
    if (!reg) return "Sous la roche";
    if (!e.intensite) return "Ciel non lu";
    return (TEMPS_PAR_REGISTRE[reg] || [])[e.intensite - 1] || "—";
  }

  // Modificateurs applicables à UN personnage donné. Seule interaction
  // de capacité retenue : Chasseur, Terrain naturel (Voie de la nature
  // rang 2) annule le malus de VOYAGE uniquement — ni la discrétion,
  // ni le tir, ni l'exposition (arbitrage explicite de Thomas).
  function modificateursPour(perso) {
    const mods = JSON.parse(JSON.stringify(palierCourant()));
    if (perso && perso.classe === "chasseur" && typeof perso.estChoisie === "function"
        && perso.estChoisie("Voie de la nature", 2)) {
      mods.voyage = { terrainDifficile: false, vitesse: 1, testCon: false };
      mods._voyageAnnuleParTerrainNaturel = true;
    }
    return mods;
  }

  // Portée max effective d'une arme/d'un sort, en cases.
  function porteeEffective(porteeMaxCases) {
    if (typeof porteeMaxCases !== "number") return porteeMaxCases;
    const p = palierCourant().portee || { type: "aucun" };
    if (p.type === "pourcent") return Math.max(1, Math.floor(porteeMaxCases * p.valeur));
    if (p.type === "divise")   return Math.max(1, Math.floor(porteeMaxCases / p.valeur));
    if (p.type === "fixe")     return Math.min(porteeMaxCases, p.valeur);
    if (p.type === "bonus")    return porteeMaxCases + p.valeur;
    return porteeMaxCases;
  }

  // Malus au jet d'attaque à distance — armes ET sorts, sans distinction
  // (arbitrage de Thomas : "tout ce qui cible à distance").
  function malusDistance() { return palierCourant().distance || 0; }

  // ── Jets ───────────────────────────────────────────────────
  function _borner(valeur, cell, mod) {
    const min = Math.max(1, cell.fenetre[0] + mod);
    const max = Math.min(20, cell.fenetre[1] + mod);
    return Math.max(min, Math.min(max, valeur));
  }

  function lirePremierCiel() {
    if (!estPorteCiel()) return null;
    const e = obtenirEtat();
    const cell = _cellule(e.regionId, e.saisonId);
    if (!cell) return null; // souterrain : aucun jet
    const mod = _rudesse(e.rudesseId).mod;
    const brut = _d(20);
    const intensite = _borner(brut + mod, cell, mod);
    _appliquer(e, cell, intensite, 1, `d20 [${brut}]${mod ? ` ${mod > 0 ? "+" : ""}${mod}` : ""}`);
    return intensite;
  }

  // Dérive ±1d6 par journée de jeu, bornée par la fenêtre du climat.
  // Le sens est tiré séparément (d2) plutôt qu'avec un 1d6−1d6 : on veut
  // une amplitude franche, pas une gaussienne centrée qui ne changerait
  // presque jamais de palier — la table aurait la même météo pendant six
  // séances.
  function deriverJour() {
    if (!estPorteCiel()) return null;
    const e = obtenirEtat();
    const cell = _cellule(e.regionId, e.saisonId);
    if (!cell) return null;
    if (!e.intensite) return lirePremierCiel();
    const mod = _rudesse(e.rudesseId).mod;
    const ampl = _d(6);
    const sens = _d(2) === 1 ? -1 : 1;
    const intensite = _borner(e.intensite + sens * ampl, cell, mod);
    _appliquer(e, cell, intensite, (e.jour || 1) + 1, `${e.intensite} ${sens > 0 ? "+" : "−"} 1d6 [${ampl}]`);
    return intensite;
  }

  function _appliquer(etat, cell, intensite, jour, detail) {
    const nom = (typeof App !== "undefined" && App.obtenirJoueurNom) ? App.obtenirJoueurNom() : "—";
    const id = (typeof App !== "undefined" && App.obtenirJoueurId) ? App.obtenirJoueurId() : null;
    _ecrire({
      regionId: etat.regionId, saisonId: etat.saisonId, rudesseId: etat.rudesseId,
      registre: cell.registre, intensite, jour,
      jeteurId: id, jeteurNom: nom, horodatage: Date.now(),
    });
    const p = palierPour(cell.registre, intensite);
    const libelle = (TEMPS_PAR_REGISTRE[cell.registre] || [])[intensite - 1] || "—";
    SyncStore.ajouterListe(CLE_JOURNAL, {
      jour, intensite, registre: cell.registre, temps: libelle,
      jeteurNom: nom, detail, horodatage: Date.now(),
    }, 20);
    // Publie aussi dans le journal de dés partagé : le jet doit être vu par
    // toute la table au moment où il tombe, pas seulement dans l'onglet Météo.
    if (typeof App !== "undefined" && App.ajouterHisto) {
      App.ajouterHisto(`🌤 Ciel — jour ${jour} : ${libelle} (${p.nom})`, intensite, false, false, detail);
    }
  }

  // ── Contrôles MJ ───────────────────────────────────────────
  // Changer de région ou de saison NE relance PAS de jet : l'intensité
  // est conservée et simplement re-bornée dans la nouvelle fenêtre. Un
  // groupe qui franchit un col ne voit pas le ciel se réinitialiser ;
  // il voit le même temps réinterprété dans un autre registre.
  function _rebornerSurPlace(patch) {
    const e = Object.assign({}, obtenirEtat(), patch);
    const cell = _cellule(e.regionId, e.saisonId);
    if (cell) {
      e.registre = cell.registre;
      if (e.intensite) e.intensite = _borner(e.intensite, cell, _rudesse(e.rudesseId).mod);
    } else {
      e.registre = null;
    }
    _ecrire(e);
    return true;
  }

  function definirRegion(regionId)  { return _estMJ() ? _rebornerSurPlace({ regionId }) : false; }
  function definirSaison(saisonId)  { return _estMJ() ? _rebornerSurPlace({ saisonId }) : false; }
  function definirRudesse(rudesseId){ return _estMJ() ? _rebornerSurPlace({ rudesseId }) : false; }

  function forcerIntensite(valeur) {
    if (!_estMJ()) return false;
    const v = Math.max(1, Math.min(20, parseInt(valeur, 10) || 1));
    _ecrire(Object.assign({}, obtenirEtat(), { intensite: v, jeteurNom: "MJ (imposé)", horodatage: Date.now() }));
    return true;
  }

  function reinitialiser() {
    if (!_estMJ()) return false;
    _ecrire(Object.assign({}, obtenirEtat(), { intensite: 0, jour: 0, jeteurId: null, jeteurNom: null }));
    SyncStore.viderListe(CLE_JOURNAL);
    return true;
  }

  // ── Rendu ──────────────────────────────────────────────────
  function _echapper(s) {
    const d = document.createElement("div");
    d.textContent = String(s == null ? "" : s);
    return d.innerHTML;
  }

  function _sig(n) { return (n > 0 ? "+" : "") + n; }

  function _ligneMod(libelle, valeur, actif) {
    return `<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06);${actif ? "" : "opacity:.4;"}">
      <span>${_echapper(libelle)}</span><strong>${_echapper(valeur)}</strong></div>`;
  }

  function rendrePanneauMeteo() {
    const zone = document.getElementById("zone-meteo");
    if (!zone) return;
    const e = obtenirEtat();
    const reg = _region(e.regionId);
    const climat = _climat(e.regionId);
    const cell = _cellule(e.regionId, e.saisonId);
    const p = palierCourant();
    const estMJ = _estMJ();
    const porteCiel = estPorteCiel();
    const souterrain = !cell;
    const saison = SAISONS_METEO.find((s) => s.id === e.saisonId) || SAISONS_METEO[0];

    const joueurs = (typeof window.DepotJoueurs !== "undefined") ? window.DepotJoueurs.liste() : [];
    const idPorteCiel = obtenirPorteCiel();
    const nomPorteCiel = (joueurs.find((j) => j.id === idPorteCiel) || {}).nom || null;

    const icone = souterrain ? "🕳"
      : (REGISTRES_METEO.find((r) => r.id === cell.registre) || {}).icone || "🌧";
    const portee = p.portee || { type: "aucun" };
    const texteportee = portee.type === "aucun" ? "—"
      : portee.type === "pourcent" ? `−${Math.round((1 - portee.valeur) * 100)} %`
      : portee.type === "divise" ? `÷${portee.valeur}`
      : portee.type === "fixe" ? `${portee.valeur} cases max`
      : `+${portee.valeur} case`;
    const texteVoyage = !p.voyage.terrainDifficile && p.voyage.vitesse === 1 && !p.voyage.testCon ? "—"
      : [p.voyage.terrainDifficile ? "terrain difficile" : null,
         p.voyage.vitesse < 1 ? "vitesse ÷2" : null,
         p.voyage.testCon ? "test CON" : null].filter(Boolean).join(", ");

    zone.innerHTML = `
      <div class="carte">
        <h3 class="titre-bandeau" style="font-size:1rem;">
          ${_echapper(icone)} ${_echapper(nomDuTemps())}
          ${(!souterrain && e.intensite) ? `<span style="opacity:.6;font-weight:400;"> — intensité ${e.intensite}/20 · palier ${_echapper(p.nom)}</span>` : ""}
        </h3>
        <p style="font-size:0.82rem;color:#6a6278;margin:4px 0 0;">
          ${_echapper(reg.nom)} · ${_echapper(climat.nom)} · ${_echapper(saison.nom)}
          ${cell ? ` · fenêtre ${cell.fenetre[0]}–${cell.fenetre[1]}` : ""}
          ${e.jour ? ` · jour ${e.jour}` : ""}
          ${e.jeteurNom ? ` · lu par ${_echapper(e.jeteurNom)}` : ""}
        </p>
        ${souterrain ? `<p style="font-size:0.82rem;color:#6a6278;margin:6px 0 0;">Aucun jet, aucun modificateur de ciel${effetPermanent() ? " — mais la chaleur des Failles double la consommation d'eau en permanence." : ". Le seul avantage structurel des nains de l'Ordre."}</p>` : ""}
      </div>

      <div class="carte">
        <h3 class="titre-bandeau" style="font-size:0.95rem;">Modificateurs actifs</h3>
        <p style="font-size:0.78rem;color:#6a6278;margin:2px 0 8px;">Symétriques : ils s'appliquent aussi aux monstres et aux PNJ.</p>
        ${_ligneMod("Discrétion", _sig(p.discretion), p.discretion !== 0)}
        ${_ligneMod("Détection (SAG)", _sig(p.detection), p.detection !== 0)}
        ${_ligneMod("Attaque à distance (armes et sorts)", _sig(p.distance), p.distance !== 0)}
        ${_ligneMod("Portée max", texteportee, portee.type !== "aucun")}
        ${typeof p.traces === "number" ? _ligneMod("Traces — pistage du groupe", _sig(p.traces), p.traces !== 0) : ""}
        ${typeof p.eau === "number" ? _ligneMod("Consommation d'eau", `×${p.eau}`, p.eau > 1) : ""}
        ${_ligneMod("Voyage", texteVoyage, texteVoyage !== "—")}
        ${_ligneMod("Social en intérieur", _sig(p.social), p.social !== 0)}
        ${_ligneMod("Exposition sans abri", p.exposition ? `test CON diff. ${p.exposition.testCon} — échec : Fatiguée` : "—", !!p.exposition)}
        <p style="font-size:0.75rem;color:#6a6278;margin:8px 0 0;">Chasseur, <em>Terrain naturel</em> (Voie de la nature rang 2) : annule le malus de Voyage uniquement.</p>
      </div>

      <div class="carte">
        <h3 class="titre-bandeau" style="font-size:0.95rem;">Porte-Ciel</h3>
        <p style="font-size:0.82rem;color:#6a6278;margin:2px 0 8px;">
          ${nomPorteCiel ? `<strong>${_echapper(nomPorteCiel)}</strong> lit le ciel pour cette session.` : "Aucun Porte-Ciel désigné — le MJ doit en choisir un."}
        </p>
        ${estMJ ? `
          <select id="meteo-select-porteciel" class="champ">
            <option value="">— personne —</option>
            ${joueurs.map((j) => `<option value="${_echapper(j.id)}"${j.id === idPorteCiel ? " selected" : ""}>${_echapper(j.nom)}</option>`).join("")}
          </select>` : ""}
        ${(porteCiel && !souterrain) ? `
          <div style="margin-top:8px;display:flex;gap:6px;flex-wrap:wrap;">
            ${!e.intensite ? `<button class="btn petit" id="meteo-btn-lire">🌤 Lire le ciel</button>` : ""}
            ${e.intensite ? `<button class="btn petit" id="meteo-btn-deriver">🌅 Nouveau jour — dérive ±1d6</button>` : ""}
          </div>` : ""}
      </div>

      ${estMJ ? `
      <div class="carte">
        <h3 class="titre-bandeau" style="font-size:0.95rem;">Contrôles MJ</h3>
        <label style="display:block;font-size:0.82rem;margin-bottom:6px;">Région
          <select id="meteo-select-region" class="champ">
            ${REGIONS_METEO.map((r) => `<option value="${r.id}"${r.id === e.regionId ? " selected" : ""}>${_echapper(r.nom)} — ${_echapper((CLIMATS_METEO[r.climat] || {}).nom || "")}</option>`).join("")}
          </select>
        </label>
        <label style="display:block;font-size:0.82rem;margin-bottom:6px;">Saison
          <select id="meteo-select-saison" class="champ">
            ${SAISONS_METEO.map((s) => `<option value="${s.id}"${s.id === e.saisonId ? " selected" : ""}>${_echapper(s.nom)}</option>`).join("")}
          </select>
        </label>
        <label style="display:block;font-size:0.82rem;margin-bottom:6px;">Rudesse de l'année
          <select id="meteo-select-rudesse" class="champ">
            ${RUDESSE_ANNEE.map((r) => `<option value="${r.id}"${r.id === e.rudesseId ? " selected" : ""}>${_echapper(r.nom)} (${_sig(r.mod)})</option>`).join("")}
          </select>
        </label>
        <div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-top:8px;">
          <input type="number" min="1" max="20" id="meteo-input-forcer" class="champ" style="width:80px;" placeholder="1-20">
          <button class="btn petit secondaire" id="meteo-btn-forcer">Imposer</button>
          <button class="btn petit secondaire" id="meteo-btn-reset">Réinitialiser</button>
        </div>
        <p style="font-size:0.75rem;color:#6a6278;margin:8px 0 0;">Changer de région ou de saison ne relance pas de jet : l'intensité est conservée et re-bornée dans la nouvelle fenêtre.</p>
      </div>` : ""}

      <div class="carte">
        <h3 class="titre-bandeau" style="font-size:0.95rem;">Journal du ciel</h3>
        <div id="meteo-journal" style="font-size:0.82rem;"></div>
      </div>
    `;

    _rendreJournal();
    _cablerControles();
  }

  function _rendreJournal() {
    const cible = document.getElementById("meteo-journal");
    if (!cible) return;
    const items = SyncStore.getListe(CLE_JOURNAL) || [];
    if (!items.length) { cible.innerHTML = `<p style="color:#6a6278;margin:0;">Aucun jet enregistré.</p>`; return; }
    cible.innerHTML = items.map((i) => `
      <div style="padding:3px 0;border-bottom:1px solid rgba(0,0,0,.06);">
        <strong>Jour ${_echapper(i.jour)}</strong> — ${_echapper(i.temps)} (${_echapper(i.intensite)}/20)
        <span style="color:#6a6278;"> · ${_echapper(i.jeteurNom)} · ${_echapper(i.detail)}</span>
      </div>`).join("");
  }

  function _cablerControles() {
    const on = (id, evt, fn) => { const el = document.getElementById(id); if (el) el.addEventListener(evt, fn); };
    on("meteo-select-porteciel", "change", (ev) => { definirPorteCiel(ev.target.value || null); rendrePanneauMeteo(); });
    on("meteo-select-region", "change", (ev) => { definirRegion(ev.target.value); rendrePanneauMeteo(); });
    on("meteo-select-saison", "change", (ev) => { definirSaison(ev.target.value); rendrePanneauMeteo(); });
    on("meteo-select-rudesse", "change", (ev) => { definirRudesse(ev.target.value); rendrePanneauMeteo(); });
    on("meteo-btn-lire", "click", () => { lirePremierCiel(); rendrePanneauMeteo(); });
    on("meteo-btn-deriver", "click", () => { deriverJour(); rendrePanneauMeteo(); });
    on("meteo-btn-forcer", "click", () => {
      const el = document.getElementById("meteo-input-forcer");
      if (el && el.value) { forcerIntensite(el.value); rendrePanneauMeteo(); }
    });
    on("meteo-btn-reset", "click", () => {
      if (confirm("Réinitialiser la météo et vider le journal du ciel ?")) { reinitialiser(); rendrePanneauMeteo(); }
    });
  }

  return {
    obtenirEtat, registreCourant, palierCourant, palierPour, nomDuTemps,
    estSouterrain, effetPermanent,
    modificateursPour, porteeEffective, malusDistance,
    obtenirPorteCiel, definirPorteCiel, estPorteCiel,
    lirePremierCiel, deriverJour, forcerIntensite, reinitialiser,
    definirRegion, definirSaison, definirRudesse, rendrePanneauMeteo,
  };
})();

if (typeof window !== "undefined") window.Meteo = Meteo;
