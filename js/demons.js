/* ============================================================
   COF-COMPAGNO — Familles démoniaques : jauge de faim, montée de palier,
   drain de PP, Remous des Sorts, Repousse, berserk.
   Cf. chiffrage_demons_A_systeme.md §4 à §6 (refonte démons, prompt 4a).

   Pourquoi un module séparé : ces règles ne concernent que les familles
   demon_* (data/bestiaire.json) et touchent à la fois le jeton (Carte), la
   fiche du PJ (App) et la jauge du lieu (Remous). js/app.js, js/combat.js et
   js/remous.js n'appellent que les points d'entrée ci-dessous, là où
   l'évènement se produit déjà (attaque, dégâts, état posé, tour, round,
   palier de Remous). Aucun toast ici : les fonctions renvoient des messages,
   l'appelant compose un seul toast final (#toast est un élément unique).

   Décisions verrouillées (Thomas) — ne pas "corriger" :
   - la jauge se remplit automatiquement, le MJ peut la corriger (+/−) ;
   - au seuil, l'app PROPOSE la montée, le MJ la valide (et choisit le
     profil D4 quand il y en a plusieurs) ;
   - à la montée, le démon garde les dégâts déjà subis, la jauge repart à 0,
     le berserk est conservé ;
   - D4 est le sommet de l'escalade, les D5 ne sont placés que par le MJ ;
   - le drain converti en PV (cible sans PP) ne nourrit pas la jauge ;
   - un raté coûte au berserk son bonus accumulé en PV, puis il retombe à 0.
   ============================================================ */
const Demons = (() => {
  "use strict";

  // États dont la pose réussie nourrit la Tentation (faim etats_controle).
  const ETATS_CONTROLE = ["fascinee", "influencee", "charmee"];

  function modele(tok) {
    if (!tok || !tok.monstreId || typeof BESTIAIRE_INDEX === "undefined") return null;
    return BESTIAIRE_INDEX[tok.monstreId] || null;
  }
  function estDemon(tok) {
    const m = modele(tok);
    return !!(m && /^demon_/.test(m.famille || ""));
  }
  function _jeton(id) {
    if (typeof Carte === "undefined" || !Carte.listeMonstresCombat) return null;
    return (Carte.listeMonstresCombat() || []).find((t) => t.id === id) || null;
  }
  function _maj(id, patch) {
    if (typeof Carte !== "undefined" && Carte.majJetonCombat) Carte.majJetonCombat(id, patch);
  }
  function _soignerJeton(id, n) {
    if (n > 0 && typeof Carte !== "undefined" && Carte.ajusterPvCombat) Carte.ajusterPvCombat(id, n);
  }
  function _histo(titre, total, detail) {
    if (typeof App !== "undefined" && App.ajouterHisto) App.ajouterHisto(titre, total, false, false, detail);
  }
  function _pv(tok) { return tok.pvActuel ?? tok.pvMax ?? 0; }
  function _echapper(s) {
    return String(s == null ? "" : s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[c]));
  }

  // ── Jauge de faim ─────────────────────────────────────────
  function faim(tok) { return (tok && Number(tok.faim)) || 0; }
  function pret(tok) {
    const m = modele(tok);
    if (!m || !Array.isArray(m.paliersSuivants) || !m.paliersSuivants.length) return false;
    return !!tok.monteeProposee || !!(m.faim && faim(tok) >= m.faim.seuil);
  }

  // Ajoute n à la jauge si `type` est la faim de la famille du démon.
  function nourrir(tok, type, n, raison) {
    const m = modele(tok);
    if (!tok || !m || !m.faim || m.faim.type !== type || !(n > 0)) return [];
    const avant = faim(tok);
    const apres = avant + n;
    _maj(tok.id, { faim: apres });
    tok.faim = apres;
    _histo(`🍽 ${tok.nom} — Faim`, n, `${raison} : ${apres}/${m.faim.seuil}.`);
    return (avant < m.faim.seuil && apres >= m.faim.seuil)
      ? [`⬆ ${tok.nom} a assez mangé (${apres}/${m.faim.seuil}) — montée proposée sur la table de combat.`]
      : [];
  }

  // Correction manuelle du MJ (boutons +/− de la table de combat).
  function ajusterFaim(id, delta) {
    const tok = _jeton(id);
    if (!tok || !estDemon(tok) || !modele(tok).faim) return;
    _maj(id, { faim: Math.max(0, faim(tok) + (Number(delta) || 0)) });
  }

  // Paliers 2 à 4 du Remous : « le démon monte d'un palier » (canon) — même
  // proposition que la jauge, pour chaque démon debout qui peut encore monter.
  function proposerMonteeRemous(palier) {
    if (!(palier >= 2) || typeof Carte === "undefined" || !Carte.listeMonstresCombat) return [];
    const concernes = (Carte.listeMonstresCombat() || []).filter((t) => {
      const m = modele(t);
      return estDemon(t) && _pv(t) > 0 && m && Array.isArray(m.paliersSuivants) && m.paliersSuivants.length;
    });
    concernes.forEach((t) => _maj(t.id, { monteeProposee: true }));
    return concernes.length ? [`⬆ Montée proposée : ${concernes.map((t) => t.nom).join(", ")}.`] : [];
  }

  // Montée validée par le MJ vers `vers` (un des paliersSuivants du profil).
  function monter(id, vers) {
    const tok = _jeton(id);
    const m = modele(tok);
    if (!tok || !m || !(m.paliersSuivants || []).includes(vers)) return null;
    if (typeof BESTIAIRE_INDEX === "undefined" || !BESTIAIRE_INDEX[vers] || !Carte.changerProfilMonstre) return null;
    const ancienNom = tok.nom;
    const res = Carte.changerProfilMonstre(id, vers);
    if (!res) return null;
    if (typeof Combat !== "undefined" && Combat.renommerCombattant) Combat.renommerCombattant(id, res.nom);
    _histo(`⬆ ${ancienNom} monte d'un palier`, 0,
      `Devient ${res.nom} — ${res.pvActuel}/${res.pvMax} PV (dégâts déjà subis conservés), jauge de faim à 0.`);
    return `⬆ ${ancienNom} devient ${res.nom} (${res.pvActuel}/${res.pvMax} PV).`;
  }

  // ── Berserk (Guerre D3+) ──────────────────────────────────
  function bonusBerserk(tok) {
    const m = modele(tok);
    return (m && m.berserk) ? (Number(tok.berserk) || 0) : 0;
  }

  // Attaque ratée : le démon subit son bonus accumulé (sans armure ni
  // résistance — ce sont ses propres coups perdus), puis le compteur retombe.
  function surRate(id) {
    const tok = _jeton(id);
    const m = modele(tok);
    if (!tok || !m || !m.berserk) return [];
    const b = Number(tok.berserk) || 0;
    if (!b) return [];
    if (Carte.ajusterPvCombat) Carte.ajusterPvCombat(id, -b);
    _maj(id, { berserk: 0 });
    _histo(`💢 ${tok.nom} — Berserk brisé`, b, `Raté : il subit ${b} dégâts et sa rage retombe à 0.`);
    return [`💢 ${tok.nom} rate et se déchire : −${b} PV, berserk à 0.`];
  }

  // ── Touche d'une attaque d'arme sur un PJ ─────────────────
  // pvPerdus : PV RÉELLEMENT perdus par la cible (après ses réductions).
  function surTouche(tok, attaque, pjId, pvPerdus) {
    const m = modele(tok);
    if (!tok || !m || !estDemon(tok)) return [];
    const msgs = [];
    const arme = (attaque && attaque.armeId && typeof ArmesMonstres !== "undefined") ? ArmesMonstres.trouver(attaque.armeId) : null;
    const touches = (arme && arme.touches) || 1;
    // Guerre : la faim compte les PV infligés.
    msgs.push(...nourrir(tok, "degats_infliges", pvPerdus, "PV infligés"));
    // Vol de sève (Greffeur) : moitié des PV infligés, arrondie à l'inférieur.
    if (m.soinSurDegats && pvPerdus > 0) {
      const soin = Math.floor(pvPerdus * m.soinSurDegats);
      if (soin > 0) { _soignerJeton(tok.id, soin); msgs.push(`🧬 ${tok.nom} regagne ${soin} PV (vol de sève).`); }
    }
    // Berserk : +parTouche par touche (la Frappe fendante en porte deux).
    if (m.berserk) {
      const b = (Number(tok.berserk) || 0) + m.berserk.parTouche * touches;
      _maj(tok.id, { berserk: b });
      tok.berserk = b;
      msgs.push(`💢 Berserk de ${tok.nom} : +${b} aux dégâts.`);
    }
    // Sorts : drain de PP sur touche.
    if (attaque && attaque.drainPP && pjId) msgs.push(...drainer(tok, pjId, attaque.drainPP));
    return msgs;
  }

  function drainer(tok, pjId, n) {
    if (typeof App === "undefined" || !App.chargerPersos) return [];
    const persos = App.chargerPersos();
    const p = persos[pjId];
    if (!p) return [];
    const pp = Math.max(0, Number(p.ppActuel) || 0);
    const draines = Math.min(n, pp);
    const reste = n - draines;
    const msgs = [];
    if (draines > 0) {
      p.ppActuel = pp - draines;
      App.sauverPersos(persos);
      if (App.rafraichirFicheActive) App.rafraichirFicheActive();
      msgs.push(`🌀 ${tok.nom} draine ${draines} PP à ${p.nom}.`);
    }
    // Faute de PP, le drain devient des PV — qui ne nourrissent pas la jauge.
    if (reste > 0 && App.ajusterPv) {
      App.ajusterPv(pjId, -reste);
      msgs.push(`${p.nom} n'a ${draines ? "plus assez" : "pas"} de PP : −${reste} PV.`);
    }
    msgs.push(...nourrir(tok, "pp_draines", draines, "PP drainés"));
    // Puits (Gouffre) : chaque PP drainé lui rend des PV.
    const m = modele(tok);
    if (m && m.soinParPPDraine && draines > 0) {
      const soin = draines * m.soinParPPDraine;
      _soignerJeton(tok.id, soin);
      msgs.push(`🌑 ${tok.nom} regagne ${soin} PV (Puits).`);
    }
    return msgs;
  }

  // ── État de contrôle posé (Tentation) ─────────────────────
  function surEtatControle(tok, idEtat) {
    if (!ETATS_CONTROLE.includes(idEtat)) return [];
    return nourrir(tok, "etats_controle", 1, "État de contrôle réussi");
  }

  // ── Remous (Sorts) ────────────────────────────────────────
  // Éclat (attaques[].alimenteRemous) et sorts de la famille Sorts : +
  // dangerosité à la jauge du lieu (moitié d'un lanceur, décision 10b).
  function _remous(tok, raison) {
    const m = modele(tok);
    if (!m || typeof Remous === "undefined" || !Remous.ajouterDemon) return;
    Remous.ajouterDemon(m.dangerosite, `${tok.nom} — ${raison}`);
  }
  function surLancerAttaque(tok, attaque) {
    if (estDemon(tok) && attaque && attaque.alimenteRemous) _remous(tok, attaque.nom);
  }
  function surLancerCapacite(tok, mecanique) {
    const m = modele(tok);
    if (m && m.famille === "demon_sorts" && mecanique && mecanique.typeSort) _remous(tok, "sort");
  }

  // ── Combat : rounds et début de tour ──────────────────────
  // Endurance : un round complet de plus pour chaque démon debout.
  function nouveauRound(ordre) {
    (ordre || []).filter((e) => e.type === "monstre").forEach((e) => {
      const tok = _jeton(e.id);
      if (tok && _pv(tok) > 0) nourrir(tok, "rounds_survecus", 1, "Round survécu");
    });
  }
  // Guerre : Repousse au début de chacun de ses tours (jamais à 0 PV).
  function debutTour(id) {
    const tok = _jeton(id);
    const m = modele(tok);
    if (!tok || !m || !m.repousse) return;
    const pv = _pv(tok);
    if (pv <= 0 || pv >= (tok.pvMax || 0)) return;
    const gain = Math.min(m.repousse, tok.pvMax - pv);
    _soignerJeton(id, gain);
    _histo(`🌿 ${tok.nom} — Repousse`, gain, `Début de tour : +${gain} PV.`);
  }

  // ── Rendu (table de combat MJ) ────────────────────────────
  const LIBELLES_FAIM = {
    degats_infliges: "PV infligés",
    pp_draines: "PP drainés",
    etats_controle: "états de contrôle réussis",
    rounds_survecus: "rounds survécus",
  };
  function htmlJeton(tok) {
    if (!estDemon(tok)) return "";
    const m = modele(tok);
    const morceaux = [];
    if (m.faim) {
      morceaux.push(`<span title="Faim : ${LIBELLES_FAIM[m.faim.type] || m.faim.type}">🍽 ${faim(tok)}/${m.faim.seuil}</span>`
        + `<button class="btn petit secondaire" data-demon-faim="${_echapper(tok.id)}" data-delta="-1" title="Corriger la jauge">−</button>`
        + `<button class="btn petit secondaire" data-demon-faim="${_echapper(tok.id)}" data-delta="1" title="Corriger la jauge">+</button>`);
    }
    if (m.berserk) {
      morceaux.push(`<span title="Bonus de dégâts cumulé — un raté le lui coûte en PV">💢 +${Number(tok.berserk) || 0}</span>`);
    }
    if (pret(tok)) {
      m.paliersSuivants.forEach((v) => {
        const d = BESTIAIRE_INDEX[v];
        if (d) morceaux.push(`<button class="btn petit or" data-demon-monter="${_echapper(tok.id)}" data-vers="${_echapper(v)}">⬆ ${_echapper(d.nom)}</button>`);
      });
    }
    return morceaux.length
      ? `<div class="cm-demon" style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;font-size:0.8rem;margin:4px 0;">${morceaux.join("")}</div>`
      : "";
  }

  return {
    ETATS_CONTROLE, modele, estDemon, faim, pret, nourrir, ajusterFaim, proposerMonteeRemous, monter,
    bonusBerserk, surRate, surTouche, drainer, surEtatControle, surLancerAttaque, surLancerCapacite,
    nouveauRound, debutTour, htmlJeton,
  };
})();

if (typeof window !== "undefined") window.Demons = Demons;
