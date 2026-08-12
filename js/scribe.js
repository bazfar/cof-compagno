/* ============================================================
   Scribe — sous-onglet Atelier (rang Métier + copie de sorts), cf.
   data/scribe.js pour le matériel/les résultats/les aléas et js/metiers.js
   pour le moteur XP/rang générique.

   Module self-contained, même convention que js/cuisine.js/js/musique.js :
   ses propres echapper()/toast(), accès à App/SyncStore/Metiers/Personnage
   uniquement par leurs API publiques.

   Le scribe COPIE un sort qu'il connaît déjà (grimoireSortsConnus ou
   sortsGrimoireAccordes()) sur le parchemin_<sortId> qui existe DÉJÀ au
   catalogue (72/72, cf. data/loot.json) — jamais un nouvel objet, jamais
   un raccourci du filtrage par classe/niveau existant dans
   apprendreSortDepuisParchemin (js/app.js).

   Modèle de jet : DIFFICULTÉ ABSOLUE (cf. js/musique.js, même bandes de
   qualité -8/-4/-1/+3/+7). difficulte = 10 + 2×rang du SORT ; bonus =
   rang de Scribe (×1) + Mod.INT + matériel (plafonné à +5).

   Coût en PP : lu directement sur sort.mecanique.coutPP (2/4/6/16/25 par
   rang, déjà posé sur les 72 sorts de data/donnees.js) — AUCUNE table
   séparée qui pourrait diverger. Débité quelle que soit la qualité, sur
   p.ppActuel, comme js/capacites.js.

   Tentatives/jour : clé partagée SyncStore["atelier:tentatives"] (même
   table que Cuisine/Alchimie/Musique, cf. js/app.js) sous "scribe" — un
   SEUL compteur par personnage, TOUS sorts confondus (cf.
   prompt_scribe_9_moteur.md §1 : "3 copies par jour, tous sorts
   confondus" prévaut sur la mention d'un préfixe par sortId, les deux
   n'étant pas compatibles) — réinitialisé gratuitement par
   App.reinitialiserTentativesAtelier() ("🌅 Nouveau jour").
   ============================================================ */

const Scribe = (() => {
  "use strict";

  const METIER_ID = "scribe";
  const STORAGE_ATELIER_TENTATIVES = "atelier:tentatives"; // même clé que js/app.js/js/cuisine.js
  const CLE_TENTATIVE = "scribe";
  const MAX_TENTATIVES_JOUR = 3;

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
  function signe(n) { return (n >= 0 ? "+" : "") + n; }

  function _rollFormule(formule) {
    const m = /^(\d*)d(\d+)$/.exec((formule || "").trim());
    if (!m) return 0;
    const nb = parseInt(m[1] || "1", 10);
    const faces = parseInt(m[2], 10);
    let total = 0;
    for (let i = 0; i < nb; i++) total += App.lancerDe(faces);
    return total;
  }

  function _tentativesAtelier() { return SyncStore.get(STORAGE_ATELIER_TENTATIVES) || {}; }
  function _tentativesJour(persoId) {
    const table = _tentativesAtelier();
    return (table[persoId] && table[persoId][CLE_TENTATIVE]) || 0;
  }
  function _incrementerTentative(persoId) {
    const table = _tentativesAtelier();
    table[persoId] = table[persoId] || {};
    table[persoId][CLE_TENTATIVE] = (table[persoId][CLE_TENTATIVE] || 0) + 1;
    SyncStore.set(STORAGE_ATELIER_TENTATIVES, table);
  }

  /* ── §2.2 : sorts copiables ─────────────────────────────────── */
  // 1. connu (grimoireSortsConnus ou sortsGrimoireAccordes) — on ne copie
  //    pas ce qu'on ne sait pas. 2. un parchemin_<sortId> existe déjà au
  //    catalogue (vrai pour les 72, gardé en garde-fou). Le contrôle PP
  //    (condition 3 du prompt) ne filtre PAS cette liste : il désactive
  //    seulement le bouton Copier (cf. §3 UI, "bouton désactivé... si PP
  //    insuffisants"), comme Cuisine.
  function sortsCopiables(p) {
    if (!p || typeof SORTS_PAR_CLASSE === "undefined") return [];
    const perso = Personnage.depuisJSON(p);
    const connus = p.grimoireSortsConnus || [];
    const accordes = perso.sortsGrimoireAccordes();
    const catalogue = SORTS_PAR_CLASSE[p.classe] || [];
    return catalogue
      .filter((sort) => connus.includes(sort.id) || accordes.includes(sort.id))
      .map((sort) => {
        const parcheminItem = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((it) => it.sortAppris === sort.id) : null;
        return parcheminItem ? { sort, parcheminItem, difficulte: 10 + 2 * sort.rang, coutPP: sort.mecanique.coutPP } : null;
      })
      .filter(Boolean)
      .sort((a, b) => a.sort.rang - b.sort.rang || a.sort.nom.localeCompare(b.sort.nom));
  }

  /* ── §2.3 : matériel — meilleur exemplaire PORTÉ (inventaireListe) par
     emplacement, cumul plafonné à +5 ─────────────────────────────── */
  function _nomItem(id) {
    const it = (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((l) => l.id === id) : null;
    return it ? it.nom : id;
  }
  function _meilleurMateriel(inventaireListe, liste) {
    let meilleur = null;
    liste.forEach((entree) => {
      const present = (inventaireListe || []).some((it) => it.id === entree.id);
      if (present && (!meilleur || entree.bonus > meilleur.bonus)) meilleur = entree;
    });
    return meilleur;
  }
  function materielPorte(p) {
    const inv = (p && p.inventaireListe) || [];
    const support = _meilleurMateriel(inv, MATERIEL_SCRIBE.support);
    const encre = _meilleurMateriel(inv, MATERIEL_SCRIBE.encre);
    const calame = _meilleurMateriel(inv, MATERIEL_SCRIBE.calame);
    const bonus = Math.min(5, (support ? support.bonus : 0) + (encre ? encre.bonus : 0) + (calame ? calame.bonus : 0));
    const ligne = (label, entree) => ({ libelle: entree ? _nomItem(entree.id) : `${label} (aucun)`, valeur: entree ? entree.bonus : 0 });
    return {
      support, encre, calame, bonus,
      peutEcrire: !!support && !!encre,
      detail: [ligne("Support", support), ligne("Encre", encre), ligne("Calame", calame)],
    };
  }

  // Bonus au jet = rang ×1 + Mod.INT + matériel (≤+5), avec detail[] (§3,
  // "aucun modificateur silencieux").
  function bonusJet(p) {
    const rang = Metiers.rang(p, METIER_ID);
    const perso = Personnage.depuisJSON(p);
    const modINT = perso.mod("INT");
    const mat = materielPorte(p);
    const total = rang + modINT + mat.bonus;
    return {
      rang, modINT, materiel: mat.bonus, total,
      detail: [
        { libelle: "Rang d'Écriture", valeur: rang },
        { libelle: "INT", valeur: modINT },
      ].concat(mat.detail),
      texte: `Rang (${signe(rang)}) + INT (${signe(modINT)}) + Matériel (${signe(mat.bonus)}) = ${signe(total)}`,
    };
  }

  /* ── §2.3 résolution du jet — mêmes bandes que js/musique.js ──── */
  function _qualiteIdPour(jetBrut, total, difficulte) {
    if (jetBrut === 1) return "desastre";
    if (jetBrut === 20) return "chef";
    if (total <= difficulte - 8) return "desastre";
    if (total <= difficulte - 4) return "rate";
    if (total <= difficulte - 1) return "mediocre";
    if (total <= difficulte + 3) return "reussi";
    if (total <= difficulte + 7) return "bien";
    return "chef";
  }
  // "Copie parfaite" pour la bande chef côté Scribe (§2.3) — surcharge
  // d'affichage SEULE, l'id reste "chef" (même patron que Musique.
  // libelleQualite "Ovation"/Recolte "Belle prise").
  function libelleQualite(qualiteId) {
    if (qualiteId === "chef") return "Copie parfaite";
    const q = (typeof QUALITES !== "undefined") ? QUALITES.find((x) => x.id === qualiteId) : null;
    return q ? q.nom : qualiteId;
  }

  /* ── §2.5 : effets d'aléa (désastre uniquement) — même patron que
     js/recolte.js _appliquerAlea : ne fait JAMAIS App.ajusterPv ici (son
     propre chargerPersos/sauverPersos écraserait notre `persos` local s'il
     était appelé avant notre propre sauvegarde) — les dégâts sont retournés
     pour être appliqués par l'appelant APRÈS App.sauverPersos. ────────── */
  function _appliquerAlea(p, alea) {
    const e = alea.effet;
    switch (e.type) {
      case "degats":
        return { degats: _rollFormule(e.formule), message: `${alea.nom} : ${alea.texte}` };
      case "perteParchemin": {
        const candidats = (p.inventaireListe || []).map((it, idx) => ({ it, idx })).filter(({ it }) => typeof it.sortAppris === "string");
        if (candidats.length) {
          const choix = candidats[Math.floor(Math.random() * candidats.length)];
          const q = (choix.it.quantite || 1) - 1;
          if (q > 0) choix.it.quantite = q; else p.inventaireListe.splice(choix.idx, 1);
        }
        return { message: `${alea.nom} : ${alea.texte}` };
      }
      case "etat":
        if (typeof ETATS !== "undefined" && ETATS[e.id]) {
          p.etatsActifs = p.etatsActifs || [];
          p.etatsActifs.push({ idEtat: e.id, dureeRestante: { tours: null, motCle: null, dureeAffichee: e.note || null }, source: "scribe" });
        }
        return { message: `${alea.nom} : ${alea.texte}` };
      case "ppSupplementaires":
        return { ppSupplementaires: _rollFormule(e.formule), message: `${alea.nom} : ${alea.texte}` };
      case "perteMateriel":
        return { perteMateriel: true, message: `${alea.nom} : ${alea.texte}` };
      case "malusProchain":
        p.scribeMalusProchain = e.valeur;
        return { message: `${alea.nom} : ${alea.texte}` };
      case "materielSauve":
        return { materielSauve: true, message: `${alea.nom} : ${alea.texte}` };
      case "ppRendus":
        return { ppRendus: _rollFormule(e.formule), message: `${alea.nom} : ${alea.texte}` };
      case "xpBonus":
        return { xpBonus: e.valeur, message: `${alea.nom} : ${alea.texte}` };
      case "requalification":
        return { qualiteIdForcee: e.qualiteId, message: `${alea.nom} : ${alea.texte}` };
      case "info":
      case "rien":
      default:
        return { message: `${alea.nom} : ${alea.texte}` };
    }
  }

  /* ── 2.1 copier() : effets de bord + retour ────────────────────── */
  function copier(persoId, sortId) {
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return { ok: false, raison: "Personnage introuvable." };

    const entree = sortsCopiables(p).find((c) => c.sort.id === sortId);
    if (!entree) return { ok: false, raison: "Ce sort n'est pas copiable." };
    const { sort, parcheminItem, difficulte, coutPP } = entree;

    if (_tentativesJour(persoId) >= MAX_TENTATIVES_JOUR) {
      return { ok: false, raison: `Quota de copies atteint pour aujourd'hui (${MAX_TENTATIVES_JOUR}/jour, tous sorts confondus).` };
    }
    const perso = Personnage.depuisJSON(p);
    if (p.ppActuel == null) p.ppActuel = perso.ppActuel; // même repli que js/capacites.js
    if (p.ppActuel < coutPP) {
      return { ok: false, raison: `Pas assez de Points de Pouvoir (${coutPP} requis, ${p.ppActuel} disponibles).` };
    }
    const mat = materielPorte(p);
    if (!mat.peutEcrire) {
      return { ok: false, raison: "Il faut au moins un support et une encre en inventaire pour écrire." };
    }

    const rangScribe = Metiers.rang(p, METIER_ID);
    const mods = bonusJet(p);
    const malusProchain = p.scribeMalusProchain || 0;
    if (malusProchain) p.scribeMalusProchain = 0; // consommé à ce jet, quel qu'en soit le résultat
    const jetBrut = App.lancerDe(20);
    const total = jetBrut + mods.total - malusProchain;
    let qualiteId = _qualiteIdPour(jetBrut, total, difficulte);
    let resultat = RESULTATS_SCRIBE[qualiteId];

    App.ajouterHisto(`${p.nom} — Écriture (${sort.nom})`, jetBrut, jetBrut === 20, jetBrut === 1,
      `d20[${jetBrut}] ${signe(mods.total - malusProchain)} = ${total} vs difficulté ${difficulte} — ${libelleQualite(qualiteId)}`);

    // Aléa (désastre uniquement) — résolu AVANT PP/matériel/parchemin, une
    // requalification doit pouvoir changer le résultat qui les détermine
    // (cf. js/recolte.js, même ordre : alea avant production).
    let alea = null;
    let extra = null;
    let degatsAlea = 0;
    if (resultat.alea) {
      const dAlea = App.lancerDe(20);
      alea = ALEAS_SCRIBE[dAlea - 1];
      App.ajouterHisto(`${p.nom} — Aléa d'écriture`, dAlea, dAlea === 20, dAlea === 1, alea.nom);
      extra = _appliquerAlea(p, alea);
      if (extra.qualiteIdForcee) {
        qualiteId = extra.qualiteIdForcee;
        resultat = RESULTATS_SCRIBE[qualiteId];
        extra = null; // la requalification EST l'effet, rien d'autre à appliquer
      } else {
        degatsAlea = extra.degats || 0;
      }
    }
    const qualite = QUALITES.find((q) => q.id === qualiteId);

    // PP débité quelle que soit la qualité (+ ajustements d'aléa).
    let ppReel = Math.ceil(coutPP * resultat.ppMult);
    if (extra && extra.ppSupplementaires) ppReel += extra.ppSupplementaires;
    p.ppActuel = Math.max(0, p.ppActuel - ppReel);
    if (extra && extra.ppRendus) p.ppActuel = Math.min(perso.calculerPPMax(), p.ppActuel + extra.ppRendus);

    // Matériel consommé (une unité de chaque emplacement UTILISÉ), sauf
    // "materielSauve" ; "perteMateriel" vide en plus toute la réserve.
    let materielConsomme = false;
    const materielSauve = !!(extra && extra.materielSauve);
    if (resultat.materiel && !materielSauve) {
      [mat.support, mat.encre, mat.calame].forEach((m) => { if (m) _consommerUnite(p.inventaireListe, m.id, 1); });
      materielConsomme = true;
      if (extra && extra.perteMateriel) {
        [mat.support, mat.encre, mat.calame].forEach((m) => { if (m) _consommerUnite(p.inventaireListe, m.id, Infinity); });
      }
    }

    // Parchemin produit — l'item du catalogue EXISTANT, jamais un nouveau.
    let parcheminProduit = null;
    if (resultat.parchemin) {
      parcheminProduit = Object.assign({}, parcheminItem, { artisanal: true });
      if (resultat.fautif) parcheminProduit.parcheminFautif = true;
      App.ajouterAInventaire(p, parcheminProduit);
    }

    // XP (+ bonus d'aléa éventuel).
    let xpGagne = Math.ceil((2 * sort.rang + 3 * Math.max(0, sort.rang - rangScribe)) * qualite.xpMult);
    if (extra && extra.xpBonus) xpGagne += extra.xpBonus;
    const gainXp = Metiers.gagnerXp(p, METIER_ID, xpGagne);

    _incrementerTentative(persoId);
    App.sauverPersos(persos);

    // Dégâts d'aléa APRÈS la sauvegarde ci-dessus (cf. en-tête de fichier
    // et js/recolte.js) : App.ajusterPv fait son propre cycle
    // chargerPersos/sauverPersos, qui écraserait nos changements si on
    // l'appelait avant.
    if (degatsAlea) App.ajusterPv(persoId, -degatsAlea);

    if (gainXp.montee) toast(`✒️ Nouveau rang : ${Metiers.titre(App.chargerPersos()[persoId], METIER_ID)} !`);

    return {
      ok: true, sort, qualite, qualiteLabel: libelleQualite(qualiteId), jetBrut, total, difficulte,
      ppReel, materielConsomme, parcheminProduit, alea: alea ? { nom: alea.nom, texte: alea.texte, message: extra ? extra.message : null } : null,
      xpGagne, gainXp,
    };
  }

  // Retire `qte` unités (ou tout, si Infinity) d'un item empilable par id —
  // même patron que js/cuisine.js/_consommerQuantite.
  function _consommerUnite(inventaireListe, itemId, qte) {
    for (let i = inventaireListe.length - 1; i >= 0 && qte > 0; i--) {
      const it = inventaireListe[i];
      if (it.id !== itemId) continue;
      const dispo = it.quantite || 1;
      if (dispo <= qte) { qte -= dispo; inventaireListe.splice(i, 1); }
      else { it.quantite = dispo - qte; qte = 0; }
    }
  }

  /* ── État local du sous-onglet (par navigateur, pas synchronisé) ── */
  function _htmlRang(p) {
    const rang = Metiers.rang(p, METIER_ID);
    const titre = Metiers.titre(p, METIER_ID);
    const xp = Metiers.xp(p, METIER_ID);
    const prog = Metiers.progressionVersRangSuivant(p, METIER_ID);
    return `<div class="carte">
      <h3 style="margin-top:0;">${METIERS.scribe.icone} Écriture — ${echapper(titre)} (rang ${rang})</h3>
      <div style="font-size:0.85rem;">${xp} XP${prog ? ` — ${prog.actuel}/${prog.requis} vers le rang ${rang + 1}` : " — rang maximum"}</div>
      ${prog ? `<div class="barre-pv" style="margin-top:4px;"><div class="rempli" style="width:${prog.pct}%;"></div></div>` : ""}
    </div>`;
  }

  function _htmlMateriel(mat) {
    return `<div class="carte">
      <h3 style="margin-top:0;">🖋 Matériel porté</h3>
      ${mat.detail.map((l) => `<div style="font-size:0.85rem;">${echapper(l.libelle)} : ${signe(l.valeur)}</div>`).join("")}
      <div style="font-size:0.85rem;margin-top:4px;"><strong>Total matériel : ${signe(mat.bonus)}</strong></div>
      ${!mat.peutEcrire ? `<div class="aide" style="margin-top:4px;color:var(--chaos);">⚠ Il faut au moins un support et une encre en inventaire pour écrire.</div>` : ""}
    </div>`;
  }

  function _htmlBonus(mods) {
    return `<div class="carte">
      <h3 style="margin-top:0;">📐 Détail du bonus au jet</h3>
      ${mods.detail.map((l) => `<div style="font-size:0.85rem;">${echapper(l.libelle)} : ${signe(l.valeur)}</div>`).join("")}
      <div style="font-size:0.85rem;margin-top:4px;"><strong>Total : ${signe(mods.total)}</strong></div>
    </div>`;
  }

  function _htmlCarteSort(entree, p, persoId, mods, mat, tentatives, restantes) {
    const { sort, difficulte, coutPP } = entree;
    const ppOk = (p.ppActuel != null ? p.ppActuel : coutPP) >= coutPP;
    const desactive = restantes <= 0 || !mat.peutEcrire || !ppOk;
    let motif = "";
    if (restantes <= 0) motif = "quota du jour atteint";
    else if (!mat.peutEcrire) motif = "matériel manquant";
    else if (!ppOk) motif = "PP insuffisants";
    return `<div class="carte" style="margin-top:10px;">
      <div><strong>${echapper(sort.nom)}</strong> — rang ${sort.rang} · difficulté ${difficulte} · coût ${coutPP} PP</div>
      <div style="font-size:0.85rem;">Tentatives aujourd'hui (tous sorts) : ${tentatives}/${MAX_TENTATIVES_JOUR}</div>
      ${motif ? `<div class="aide" style="margin-top:4px;color:var(--chaos);">⚠ ${echapper(motif)}</div>` : ""}
      <button class="btn or btn-scribe-copier" data-sort="${echapper(sort.id)}" ${desactive ? "disabled" : ""} style="margin-top:6px;">✒️ Copier</button>
    </div>`;
  }

  function rendreZoneScribe(persoId) {
    const zone = document.getElementById("zone-atelier-scribe");
    if (!zone) return;
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) { zone.innerHTML = ""; return; }
    const copiables = sortsCopiables(p);
    const mods = bonusJet(p);
    const mat = materielPorte(p);
    const tentatives = _tentativesJour(persoId);
    const restantes = MAX_TENTATIVES_JOUR - tentatives;
    const listeHtml = copiables.length
      ? copiables.map((entree) => _htmlCarteSort(entree, p, persoId, mods, mat, tentatives, restantes)).join("")
      : `<div class="carte"><p class="vide">Aucun sort connu à copier — apprends d'abord un sort dans ton Grimoire.</p></div>`;
    zone.innerHTML = _htmlRang(p) + _htmlMateriel(mat) + _htmlBonus(mods) + listeHtml;
    zone.querySelectorAll(".btn-scribe-copier").forEach((btn) => {
      btn.onclick = () => _copier(persoId, btn.dataset.sort);
    });
  }

  function _copier(persoId, sortId) {
    const r = copier(persoId, sortId);
    if (!r.ok) { toast(r.raison); return; }
    let msg = `${r.qualiteLabel} — ${r.parcheminProduit ? `« ${r.sort.nom} » copié.` : "rien produit."} ${r.ppReel} PP dépensés${r.materielConsomme ? "" : ", matériel épargné"}.`;
    if (r.xpGagne) msg += ` +${r.xpGagne} XP Écriture.`;
    if (r.alea) msg += ` ${r.alea.nom} : ${r.alea.texte}`;
    toast(msg);
    rendreZoneScribe(persoId);
  }

  return { rendreZoneScribe, sortsCopiables, materielPorte, bonusJet, copier, libelleQualite };
})();

if (typeof window !== "undefined") window.Scribe = Scribe;
