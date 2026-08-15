/* ============================================================
   Tanneur — sous-onglet Atelier (rang Métier + tannage + assemblage),
   cf. data/tannerie.js pour les agents/cuirs/recettes/aléas et
   js/metiers.js pour le moteur XP/rang générique.

   Module self-contained, même convention que js/cuisine.js/js/scribe.js :
   ses propres echapper()/toast(), accès à App/SyncStore/Metiers/Personnage/
   Raretes uniquement par leurs API publiques.

   DEUX jets, jamais trois (cf. data/tannerie.js, en-tête) :
   - Jet 1 (tannage)   : difficulte FIXE 12 (pas 10+2×rang comme les autres
     métiers à difficulté absolue — décision du prompt, rang 1 uniquement).
     bonus = rang Tannerie + Mod.DEX, SANS bonus de matériau : l'agent de
     tannage est un PLAFOND sur le tier de cuir atteignable, jamais un
     bonus au jet (cf. AGENTS_TANNAGE, data/tannerie.js).
   - Jet 2 (assemblage) : difficulte = 10 + 2×rang de la RECETTE (patron
     Alchimie/Musicien/Scribe). bonus = rang Tannerie + Mod.DEX + bonus du
     cuir (TIERS_CUIR[tier].bonus, 0/1/2) — ici le cuir tanné JOUE le rôle
     de matériau-bonus que l'agent ne joue pas au jet 1.

   Tentatives/jour : clé partagée SyncStore["atelier:tentatives"] (même
   table que Cuisine/Alchimie/Scribe), préfixes "tannerie:tannage" et
   "tannerie:<recetteId>" (cf. prompt_tanneur_11_moteur.md §1) — CONTRAIREMENT
   au choix fait pour le Scribe (un seul compteur, prompt auto-contradictoire),
   ici le prompt est cohérent : compteurs séparés par recette (pour
   l'affichage), plafond de 4 additionné sur TOUTES les clés "tannerie:*"
   d'un personnage. Pas de coût en PP : le quota EST le frein, avec la
   rareté des grandes peaux.

   Rareté (jet 2 uniquement, recette.rarete === true) : la qualité du jet
   pilote RARETE_PAR_QUALITE (reussi→commun, bien→peu_commun, chef→rare).
   Sur "rare", Raretes.appliquer a besoin d'un choix de variante que le
   JOUEUR ne fait jamais (cf. prompt §3.3) : une demande est ouverte au MJ
   (SyncStore["tannerie:variante"], échéance 60s, patron
   js/repos.js._demarrerMinuteurMusique) ; si personne ne répond,
   variantes[0] s'applique automatiquement et l'historique le signale.
   Sur "commun"/"peu_commun", Raretes.appliquer ne matérialise aucune
   variante (auMoinsRare === false) : appliqué directement, sans demande.

   ── ÉCART DE CALIBRAGE PAR RAPPORT AU PROMPT ─────────────────────
   Les deux prompts Tanneur affirment qu'un objet "peu commun" issu de ce
   métier vaut CA+1 ET réd.+1 ("CA 14/réd. 3" pour un cuir clouté peu
   commun) — cf. data/tannerie.js pour le détail : c'était vrai au moment
   où le commentaire d'en-tête de js/raretes.js a été écrit, mais plus
   depuis le recalibrage équilibrage qui a retiré reductionDegats de ce
   bonus (Raretes.appliquer, case "armure", ne touche plus que valeurCA).
   Non corrigé ici : interdiction absolue de toucher js/raretes.js, et la
   progression via CA seule reste réelle, juste plus modeste qu'annoncé.
   ============================================================ */

const Tannerie = (() => {
  "use strict";

  const METIER_ID = "tannerie";
  const STORAGE_ATELIER_TENTATIVES = "atelier:tentatives";
  const MAX_TENTATIVES_JOUR = 4; // toutes recettes confondues (tannage + assemblage)
  const CLE_TANNAGE = "tannerie:tannage";
  const CLE_VARIANTE = "tannerie:variante";
  const ECHEANCE_VARIANTE_MS = 60000;

  /* ── Utilitaires (copie locale, même convention que js/scribe.js) ── */
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
  function _itemCatalogue(id) {
    return (typeof LOOT_CATALOGUE !== "undefined") ? LOOT_CATALOGUE.find((it) => it.id === id) || null : null;
  }
  // Même patron que js/scribe.js _consommerUnite.
  function _consommerUnite(inventaireListe, itemId, qte) {
    for (let i = inventaireListe.length - 1; i >= 0 && qte > 0; i--) {
      const it = inventaireListe[i];
      if (it.id !== itemId) continue;
      const dispo = it.quantite || 1;
      if (dispo <= qte) { qte -= dispo; inventaireListe.splice(i, 1); }
      else { it.quantite = dispo - qte; qte = 0; }
    }
  }
  function _quantiteInventaire(inventaireListe, itemId) {
    return (inventaireListe || []).filter((it) => it.id === itemId).reduce((s, it) => s + (it.quantite || 1), 0);
  }

  /* ── Tentatives/jour : compteurs séparés par clé, plafond additionné
     sur toutes les clés "tannerie:*" (cf. en-tête de fichier). ────── */
  function _tentativesAtelier() { return SyncStore.get(STORAGE_ATELIER_TENTATIVES) || {}; }
  function _clesTannerieDe(persoId) {
    const table = _tentativesAtelier();
    return Object.keys(table[persoId] || {}).filter((k) => k.indexOf("tannerie:") === 0);
  }
  function tentativesJourTotal(persoId) {
    const table = _tentativesAtelier();
    const t = table[persoId] || {};
    return _clesTannerieDe(persoId).reduce((s, k) => s + (t[k] || 0), 0);
  }
  function _incrementerTentative(persoId, cle) {
    const table = _tentativesAtelier();
    const nouveau = ((table[persoId] && table[persoId][cle]) || 0) + 1;
    // setChamp, pas SyncStore.set(table) : table PARTAGÉE entre tous les
    // ateliers et tous les persos — cf. même correctif dans js/app.js.
    SyncStore.setChamp(STORAGE_ATELIER_TENTATIVES, persoId + "." + cle, nouveau);
  }

  /* ── §3 : peaux/agents/cuirs portés ─────────────────────────────── */
  // surfaceCuir > 0 identifie une dépouille tannable (peau_cerf_blanc et
  // duvet_caille ont surfaceCuir: 0 — structurellement intannables, cf.
  // data/loot.json).
  function peauxPortees(p) {
    const inv = (p && p.inventaireListe) || [];
    const vus = {};
    const out = [];
    inv.forEach((it) => {
      if (vus[it.id]) return;
      const cat = _itemCatalogue(it.id);
      if (cat && cat.surfaceCuir > 0) { vus[it.id] = true; out.push({ item: cat, surfaceCuir: cat.surfaceCuir }); }
    });
    return out;
  }
  function agentsPortes(p) {
    const inv = (p && p.inventaireListe) || [];
    const out = [];
    AGENTS_TANNAGE.forEach((a) => {
      if (inv.some((it) => it.id === a.id)) {
        const cat = _itemCatalogue(a.id);
        if (cat) out.push({ item: cat, tierMax: a.tierMax, note: a.note });
      }
    });
    return out;
  }
  function cuirsPortes(p) {
    const inv = (p && p.inventaireListe) || [];
    const out = {};
    TIERS_CUIR.forEach((t) => { out[t.id] = _quantiteInventaire(inv, t.id); });
    return out;
  }

  /* ── Recettes disponibles : filtre rang de métier + intrants présents
     (cf. prompt_tanneur_11_moteur.md §3) — contrairement à sortsCopiables
     du Scribe (montre tout, désactive le bouton), le prompt demande ici un
     filtre sur la LISTE elle-même : une recette dont le tanneur n'a ni le
     rang ni un seul cuir du tier minimum requis n'apparaît pas du tout. ── */
  function recettesDisponibles(p) {
    const rang = Metiers.rang(p, METIER_ID);
    const cuirs = cuirsPortes(p);
    const inv = (p && p.inventaireListe) || [];
    return RECETTES_TANNERIE.filter((r) => r.etape === "assemblage" && r.rang <= rang).filter((r) => {
      const tierMin = r.tierCuirMin || 0;
      const auMoinsUnTierSuffisant = TIERS_CUIR.some((t, idx) => idx >= tierMin && cuirs[t.id] >= (r.cuirs || 0));
      if (!auMoinsUnTierSuffisant) return false;
      if (r.clous && _quantiteInventaire(inv, "clous_rivets") < r.clous) return false;
      if (r.duvets && _quantiteInventaire(inv, "duvet_caille") < r.duvets) return false;
      return true;
    });
  }

  /* ── Bandes de qualité — mêmes bandes que js/scribe.js/js/musique.js. ── */
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
  function libelleQualite(qualiteId) {
    const q = (typeof QUALITES !== "undefined") ? QUALITES.find((x) => x.id === qualiteId) : null;
    return q ? q.nom : qualiteId;
  }

  // Bonus du jet de TANNAGE : rang + Mod.DEX, SANS matériau (cf. en-tête).
  function bonusTannage(p) {
    const rang = Metiers.rang(p, METIER_ID);
    const perso = Personnage.depuisJSON(p);
    const modDEX = perso.mod("DEX");
    const total = rang + modDEX;
    return {
      rang, modDEX, total,
      detail: [
        { libelle: "Rang de Tannerie", valeur: rang },
        { libelle: "DEX", valeur: modDEX },
      ],
      texte: `Rang (${signe(rang)}) + DEX (${signe(modDEX)}) = ${signe(total)}`,
    };
  }

  // Bonus du jet d'ASSEMBLAGE : rang + Mod.DEX + bonus du cuir choisi (§3.2).
  function bonusJet(p, tierCuirId) {
    const rang = Metiers.rang(p, METIER_ID);
    const perso = Personnage.depuisJSON(p);
    const modDEX = perso.mod("DEX");
    const tier = TIERS_CUIR.find((t) => t.id === tierCuirId);
    const bonusCuir = tier ? tier.bonus : 0;
    const total = rang + modDEX + bonusCuir;
    return {
      rang, modDEX, bonusCuir, total,
      detail: [
        { libelle: "Rang de Tannerie", valeur: rang },
        { libelle: "DEX", valeur: modDEX },
        { libelle: tier ? `Cuir (${_itemCatalogue(tier.id).nom})` : "Cuir (aucun choisi)", valeur: bonusCuir },
      ],
      texte: `Rang (${signe(rang)}) + DEX (${signe(modDEX)}) + Cuir (${signe(bonusCuir)}) = ${signe(total)}`,
    };
  }

  /* ── Aléas (désastre uniquement), même patron que js/scribe.js
     _appliquerAlea : ne fait JAMAIS App.ajusterPv ici — les dégâts sont
     retournés pour être appliqués par l'appelant APRÈS App.sauverPersos. ── */
  function _appliquerAlea(p, alea) {
    const e = alea.effet;
    switch (e.type) {
      case "degats":
        return { degats: _rollFormule(e.formule), message: `${alea.nom} : ${alea.texte}` };
      case "perteMateriel":
        return { perteMateriel: true, message: `${alea.nom} : ${alea.texte}` };
      case "malusProchain":
        p.tannerieMalusProchain = e.valeur;
        return { message: `${alea.nom} : ${alea.texte}` };
      // malusSocial : pas de mécanique automatisée (aucun test social/CHA
      // n'est piloté par un champ numérique dans ce moteur) — message
      // seul, le MJ arbitre, même traitement que "info"/"rien" plus bas.
      case "malusSocial":
        return { message: `${alea.nom} : ${alea.texte} (malus social ${signe(-e.valeur)} jusqu'au prochain repos, arbitré par le MJ)` };
      case "materielSauve":
        return { materielSauve: true, message: `${alea.nom} : ${alea.texte}` };
      case "quotaRendu":
        return { quotaRendu: true, message: `${alea.nom} : ${alea.texte}` };
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

  function _xpRecette(recette, rangTannerie, qualite) {
    return Math.ceil((2 * recette.rang + 3 * Math.max(0, recette.rang - rangTannerie)) * qualite.xpMult);
  }

  /* ── Jet 1 : tanner() ────────────────────────────────────────────── */
  const RECETTE_TANNAGE = RECETTES_TANNERIE.find((r) => r.id === "tannage");
  const DIFFICULTE_TANNAGE = 12; // fixe, cf. §3.1 — pas 10+2×rang comme l'assemblage

  function tanner(persoId, peauId, agentId) {
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return { ok: false, raison: "Personnage introuvable." };

    const peauEntree = peauxPortees(p).find((e) => e.item.id === peauId);
    if (!peauEntree) return { ok: false, raison: "Cette peau n'est pas en inventaire (ou n'est pas tannable)." };
    const agentEntree = agentsPortes(p).find((e) => e.item.id === agentId);
    if (!agentEntree) return { ok: false, raison: "Cet agent de tannage n'est pas en inventaire." };

    if (tentativesJourTotal(persoId) >= MAX_TENTATIVES_JOUR) {
      return { ok: false, raison: `Quota d'opérations atteint pour aujourd'hui (${MAX_TENTATIVES_JOUR}/jour, tannage et assemblage confondus).` };
    }

    const rangTannerie = Metiers.rang(p, METIER_ID);
    const mods = bonusTannage(p);
    const malusProchain = p.tannerieMalusProchain || 0;
    if (malusProchain) p.tannerieMalusProchain = 0; // consommé à ce jet, quel qu'en soit le résultat

    const jetBrut = App.lancerDe(20);
    const total = jetBrut + mods.total - malusProchain;
    let qualiteId = _qualiteIdPour(jetBrut, total, DIFFICULTE_TANNAGE);

    App.ajouterHisto(`${p.nom} — Tannage (${peauEntree.item.nom})`, jetBrut, jetBrut === 20, jetBrut === 1,
      `d20[${jetBrut}] ${signe(mods.total - malusProchain)} = ${total} vs difficulté ${DIFFICULTE_TANNAGE} — ${libelleQualite(qualiteId)}`);

    // Aléa (désastre uniquement), résolu AVANT consommation/production —
    // une requalification doit pouvoir changer ce qui en dépend (cf.
    // js/scribe.js, même ordre).
    let alea = null, extra = null, degatsAlea = 0;
    if (qualiteId === "desastre") {
      const dAlea = App.lancerDe(20);
      alea = ALEAS_TANNERIE.find((a) => a.d === dAlea);
      App.ajouterHisto(`${p.nom} — Aléa de tannage`, dAlea, dAlea === 20, dAlea === 1, alea.nom);
      extra = _appliquerAlea(p, alea);
      if (extra.qualiteIdForcee) { qualiteId = extra.qualiteIdForcee; extra = null; }
      else degatsAlea = extra.degats || 0;
    }

    // Tier atteint = tier impliqué par la qualité, PLAFONNÉ par l'agent —
    // le plafond de l'agent est DUR (cf. §3.1, tableau) : même un 20
    // naturel au sel gemme (tierMax: 0) ne donne que du cuir_commun.
    let tierProduit = null;
    let unitesCuir = 0;
    if (qualiteId === "mediocre" || qualiteId === "reussi" || qualiteId === "bien" || qualiteId === "chef") {
      const tierViseIdx = qualiteId === "chef" ? 2 : (qualiteId === "bien" ? 1 : 0);
      const tierFinalIdx = Math.min(tierViseIdx, agentEntree.tierMax);
      tierProduit = TIERS_CUIR[tierFinalIdx];
      unitesCuir = peauEntree.surfaceCuir;
      if (qualiteId === "mediocre") unitesCuir = Math.max(1, unitesCuir - 1);
    }

    // Peau + agent consommés sur TOUT résultat — sauf "materielSauve".
    const materielSauve = !!(extra && extra.materielSauve);
    if (!materielSauve) {
      _consommerUnite(p.inventaireListe, peauId, 1);
      _consommerUnite(p.inventaireListe, agentId, 1);
      if (extra && extra.perteMateriel) {
        _consommerUnite(p.inventaireListe, peauId, Infinity);
        _consommerUnite(p.inventaireListe, agentId, Infinity);
      }
    }

    let cuirProduit = null;
    if (tierProduit) {
      const cat = _itemCatalogue(tierProduit.id);
      if (cat) { App.ajouterAInventaire(p, Object.assign({}, cat, { quantite: unitesCuir })); cuirProduit = { id: tierProduit.id, nom: cat.nom, unites: unitesCuir }; }
    }

    const qualite = QUALITES.find((q) => q.id === qualiteId);
    let xpGagne = _xpRecette(RECETTE_TANNAGE, rangTannerie, qualite);
    if (extra && extra.xpBonus) xpGagne += extra.xpBonus;
    const gainXp = Metiers.gagnerXp(p, METIER_ID, xpGagne);

    if (!(extra && extra.quotaRendu)) _incrementerTentative(persoId, CLE_TANNAGE);
    App.sauverPersos(persos);

    if (degatsAlea) App.ajusterPv(persoId, -degatsAlea);
    if (gainXp.montee) toast(`🪶 Nouveau rang : ${Metiers.titre(App.chargerPersos()[persoId], METIER_ID)} !`);

    return {
      ok: true, qualite, qualiteLabel: libelleQualite(qualiteId), jetBrut, total, difficulte: DIFFICULTE_TANNAGE,
      cuirProduit, xpGagne, gainXp,
      alea: alea ? { nom: alea.nom, texte: alea.texte, message: extra ? extra.message : null } : null,
    };
  }

  /* ── Jet 2 : assembler() ─────────────────────────────────────────── */
  function assembler(persoId, recetteId, tierCuirId) {
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return { ok: false, raison: "Personnage introuvable." };

    const recette = recettesDisponibles(p).find((r) => r.id === recetteId);
    if (!recette) return { ok: false, raison: "Cette recette n'est pas disponible." };
    const cuirs = cuirsPortes(p);
    const tierIdx = TIERS_CUIR.findIndex((t) => t.id === tierCuirId);
    if (tierIdx < 0 || tierIdx < (recette.tierCuirMin || 0)) {
      return { ok: false, raison: `Cette recette exige au moins du ${TIERS_CUIR[recette.tierCuirMin || 0].id.replace("_", " ")}.` };
    }
    if (cuirs[tierCuirId] < recette.cuirs) {
      return { ok: false, raison: `Pas assez de ${_itemCatalogue(tierCuirId).nom} (${recette.cuirs} requis, ${cuirs[tierCuirId]} disponible).` };
    }
    if (recette.clous && _quantiteInventaire(p.inventaireListe, "clous_rivets") < recette.clous) {
      return { ok: false, raison: "Pas assez de clous et rivets." };
    }
    if (recette.duvets && _quantiteInventaire(p.inventaireListe, "duvet_caille") < recette.duvets) {
      return { ok: false, raison: "Pas assez de duvet de caille de brume." };
    }
    if (tentativesJourTotal(persoId) >= MAX_TENTATIVES_JOUR) {
      return { ok: false, raison: `Quota d'opérations atteint pour aujourd'hui (${MAX_TENTATIVES_JOUR}/jour, tannage et assemblage confondus).` };
    }

    const rangTannerie = Metiers.rang(p, METIER_ID);
    const difficulte = 10 + 2 * recette.rang;
    const mods = bonusJet(p, tierCuirId);
    const malusProchain = p.tannerieMalusProchain || 0;
    if (malusProchain) p.tannerieMalusProchain = 0;

    const jetBrut = App.lancerDe(20);
    const total = jetBrut + mods.total - malusProchain;
    let qualiteId = _qualiteIdPour(jetBrut, total, difficulte);

    App.ajouterHisto(`${p.nom} — Assemblage (${recette.nom})`, jetBrut, jetBrut === 20, jetBrut === 1,
      `d20[${jetBrut}] ${signe(mods.total - malusProchain)} = ${total} vs difficulté ${difficulte} — ${libelleQualite(qualiteId)}`);

    let alea = null, extra = null, degatsAlea = 0;
    if (qualiteId === "desastre") {
      const dAlea = App.lancerDe(20);
      alea = ALEAS_TANNERIE.find((a) => a.d === dAlea);
      App.ajouterHisto(`${p.nom} — Aléa d'assemblage`, dAlea, dAlea === 20, dAlea === 1, alea.nom);
      extra = _appliquerAlea(p, alea);
      if (extra.qualiteIdForcee) { qualiteId = extra.qualiteIdForcee; extra = null; }
      else degatsAlea = extra.degats || 0;
    }

    // Cuirs/clous/duvets consommés quelle que soit la qualité, y compris
    // désastre (§3.3) — sauf "materielSauve", même patron que le tannage.
    const materielSauve = !!(extra && extra.materielSauve);
    if (!materielSauve) {
      _consommerUnite(p.inventaireListe, tierCuirId, recette.cuirs);
      if (recette.clous) _consommerUnite(p.inventaireListe, "clous_rivets", recette.clous);
      if (recette.duvets) _consommerUnite(p.inventaireListe, "duvet_caille", recette.duvets);
      if (extra && extra.perteMateriel) {
        _consommerUnite(p.inventaireListe, tierCuirId, Infinity);
        if (recette.clous) _consommerUnite(p.inventaireListe, "clous_rivets", Infinity);
        if (recette.duvets) _consommerUnite(p.inventaireListe, "duvet_caille", Infinity);
      }
    }

    const rareteId = RARETE_PAR_QUALITE[qualiteId] || null;
    let objetProduit = null;
    let varianteEnAttente = false;
    if (rareteId) {
      const base = _itemCatalogue(recette.produit);
      if (base) {
        if (recette.rarete) {
          if (rareteId === "rare" && Raretes.variantesDisponibles(recette.produit).length) {
            // Le joueur ne choisit jamais son propre effet magique (§3.3) :
            // demande ouverte au MJ, résolue par résoudreVariante() ou par
            // le repli automatique de _minuteurVariante à l'échéance.
            _ouvrirDemandeVariante(persoId, recette, base, rareteId);
            varianteEnAttente = true;
          } else {
            const fini = Raretes.appliquer(base, rareteId, null);
            objetProduit = Object.assign({}, fini, { artisanal: true, quantite: 1 });
            App.ajouterAInventaire(p, objetProduit);
          }
        } else {
          objetProduit = Object.assign({}, base, { artisanal: true, quantite: 1 });
          App.ajouterAInventaire(p, objetProduit);
        }
      }
    }

    const qualite = QUALITES.find((q) => q.id === qualiteId);
    let xpGagne = _xpRecette(recette, rangTannerie, qualite);
    if (extra && extra.xpBonus) xpGagne += extra.xpBonus;
    const gainXp = Metiers.gagnerXp(p, METIER_ID, xpGagne);

    if (!(extra && extra.quotaRendu)) _incrementerTentative(persoId, `tannerie:${recette.id}`);
    App.sauverPersos(persos);

    if (degatsAlea) App.ajusterPv(persoId, -degatsAlea);
    if (gainXp.montee) toast(`🪶 Nouveau rang : ${Metiers.titre(App.chargerPersos()[persoId], METIER_ID)} !`);

    return {
      ok: true, recette, qualite, qualiteLabel: libelleQualite(qualiteId), jetBrut, total, difficulte,
      objetProduit, varianteEnAttente, xpGagne, gainXp,
      alea: alea ? { nom: alea.nom, texte: alea.texte, message: extra ? extra.message : null } : null,
    };
  }

  /* ── Demande de variante au MJ (rareté "rare" uniquement) ──────────
     Patron js/repos.js._demarrerMinuteurMusique : la requête se clôt
     elle-même à l'échéance (60s) en appliquant variantes[0], contrairement
     à la demande météo qui attend un relais manuel — ici personne ne DOIT
     agir pour que l'objet existe, cf. §3.3 "le repli s'applique". ────── */
  function _ouvrirDemandeVariante(persoId, recette, baseItem, rareteId) {
    const ouvertTs = Date.now();
    SyncStore.set(CLE_VARIANTE, {
      persoId, recetteId: recette.id, produitId: baseItem.id, rareteId,
      variantes: Raretes.variantesDisponibles(baseItem.id).map((v) => ({ id: v.id, nom: v.nom })),
      ouvertTs, echeanceTs: ouvertTs + ECHEANCE_VARIANTE_MS, statut: "en_attente",
    });
  }
  function demandeVarianteEnCours() { return SyncStore.get(CLE_VARIANTE) || null; }

  // Finalise la demande — varianteId explicite (choix du MJ) ou null
  // (repli automatique sur variantes[0], cf. Raretes.appliquer).
  function _finaliserVariante(varianteId, auto) {
    const d = demandeVarianteEnCours();
    if (!d || d.statut !== "en_attente") return;
    const persos = App.chargerPersos();
    const p = persos[d.persoId];
    SyncStore.set(CLE_VARIANTE, null);
    if (!p) return;
    const base = _itemCatalogue(d.produitId);
    if (!base) return;
    const fini = Raretes.appliquer(base, d.rareteId, varianteId);
    const objet = Object.assign({}, fini, { artisanal: true, quantite: 1 });
    App.ajouterAInventaire(p, objet);
    App.sauverPersos(persos);
    App.ajouterHisto(`${p.nom} — Variante rare (${base.nom})`, null, false, false,
      auto ? `Aucune réponse du MJ dans les 60s — repli automatique sur « ${fini.varianteNom || "variante par défaut"} ».`
           : `Choisie par le MJ : « ${fini.varianteNom || "variante par défaut"} ».`);
    toast(`✨ ${p.nom} — « ${fini.nom} » produit${auto ? " (repli automatique, MJ absent)" : ""}.`);
  }
  function resoudreVariante(varianteId) { _finaliserVariante(varianteId, false); }

  // _dernierPersoId : persoId de la dernière zone Tannerie rendue chez CE
  // client — le minuteur redessine cette zone-là pour faire vivre le
  // décompte, jamais celle d'un autre persoId (même patron d'état local
  // que js/repos.js, qui ne redessine que l'overlay ouvert chez soi).
  let _dernierPersoId = null;
  let _minuteurVarianteId = null;
  function _demarrerMinuteurVariante() {
    if (_minuteurVarianteId) return;
    _minuteurVarianteId = setInterval(() => {
      const d = demandeVarianteEnCours();
      if (!d || d.statut !== "en_attente") { _arreterMinuteurVariante(); return; }
      if (Date.now() >= d.echeanceTs) { _finaliserVariante(null, true); _arreterMinuteurVariante(); }
      if (_dernierPersoId) rendreZoneTannerie(_dernierPersoId);
    }, 1000);
  }
  function _arreterMinuteurVariante() {
    if (_minuteurVarianteId) { clearInterval(_minuteurVarianteId); _minuteurVarianteId = null; }
  }

  /* ── UI ──────────────────────────────────────────────────────────── */
  function _htmlRang(p, persoId) {
    const rang = Metiers.rang(p, METIER_ID);
    const titre = Metiers.titre(p, METIER_ID);
    const xp = Metiers.xp(p, METIER_ID);
    const prog = Metiers.progressionVersRangSuivant(p, METIER_ID);
    return `<div class="carte">
      <h3 style="margin-top:0;">${METIERS.tannerie.icone} Tannerie — ${echapper(titre)} (rang ${rang})</h3>
      <div style="font-size:0.85rem;">${xp} XP${prog ? ` — ${prog.actuel}/${prog.requis} vers le rang ${rang + 1}` : " — rang maximum"}</div>
      ${prog ? `<div class="barre-pv" style="margin-top:4px;"><div class="rempli" style="width:${prog.pct}%;"></div></div>` : ""}
      <div style="font-size:0.82rem;margin-top:4px;color:#6a6278;">Opérations aujourd'hui : ${tentativesJourTotal(persoId)}/${MAX_TENTATIVES_JOUR} (tannage et assemblage confondus)</div>
    </div>`;
  }

  function _htmlDemandeVariante(persoId, role) {
    const d = demandeVarianteEnCours();
    if (!d) return "";
    const restant = Math.max(0, Math.ceil((d.echeanceTs - Date.now()) / 1000));
    const base = _itemCatalogue(d.produitId);
    if (role === "mj") {
      return `<div class="carte" style="margin-top:10px;border-color:var(--or, #a8843a);">
        <h3 style="margin-top:0;">✨ Variante rare à choisir — ${echapper(base ? base.nom : d.produitId)}</h3>
        <div style="font-size:0.82rem;color:#6a6278;">⏳ ${restant}s avant repli automatique sur « ${echapper((d.variantes[0] || {}).nom || "?")} ».</div>
        <div style="margin-top:6px;display:flex;gap:6px;flex-wrap:wrap;">
          ${d.variantes.map((v) => `<button class="btn petit or btn-tannerie-variante" data-variante="${echapper(v.id)}">${echapper(v.nom)}</button>`).join("")}
        </div>
      </div>`;
    }
    if (d.persoId !== persoId) return "";
    return `<div class="carte" style="margin-top:10px;">
      <p style="font-size:0.85rem;">✨ Objet rare en cours de finition — le MJ choisit son effet spécial (${restant}s, sinon repli automatique).</p>
    </div>`;
  }

  function _htmlTannage(p, persoId, mods, restantes) {
    const peaux = peauxPortees(p);
    const agents = agentsPortes(p);
    if (!peaux.length) {
      return `<div class="carte" style="margin-top:10px;"><p class="vide">Aucune peau brute en inventaire — la Traque en rapporte une par bête chassée avec succès.</p></div>`;
    }
    if (!agents.length) {
      return `<div class="carte" style="margin-top:10px;"><p class="vide">Aucun agent de tannage en inventaire (sel gemme, tanin d'écorce ou cervelle).</p></div>`;
    }
    const options = (liste, extraire) => liste.map((e) => `<option value="${echapper(e.item.id)}">${echapper(extraire(e))}</option>`).join("");
    return `<div class="carte" style="margin-top:10px;">
      <h3 style="margin-top:0;">🪵 Tannage — difficulté 12</h3>
      <div style="font-size:0.85rem;">${mods.detail.map((l) => `${echapper(l.libelle)} : ${signe(l.valeur)}`).join(" · ")} = <strong>${signe(mods.total)}</strong></div>
      <div style="margin-top:6px;display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
        <label style="font-size:0.85rem;">Peau <select id="tannerie-select-peau">${options(peaux, (e) => `${e.item.nom} (${e.surfaceCuir} unité${e.surfaceCuir > 1 ? "s" : ""} de cuir)`)}</select></label>
        <label style="font-size:0.85rem;">Agent <select id="tannerie-select-agent">${options(agents, (e) => e.item.nom)}</select></label>
      </div>
      <div id="tannerie-plafond-agent" class="aide" style="margin-top:4px;"></div>
      <div style="font-size:0.85rem;margin-top:4px;">Opérations aujourd'hui : ${MAX_TENTATIVES_JOUR - restantes}/${MAX_TENTATIVES_JOUR}</div>
      <button class="btn or" id="tannerie-btn-tanner" ${restantes <= 0 ? "disabled" : ""} style="margin-top:6px;">🪵 Tanner</button>
      ${restantes <= 0 ? `<div class="aide" style="margin-top:4px;color:var(--chaos);">⚠ Quota du jour atteint.</div>` : ""}
    </div>`;
  }

  function _htmlCuirs(cuirs) {
    return `<div class="carte" style="margin-top:10px;">
      <h3 style="margin-top:0;">🟫 Cuirs en stock</h3>
      ${TIERS_CUIR.map((t) => `<div style="font-size:0.85rem;">${echapper(_itemCatalogue(t.id).nom)} : ${cuirs[t.id] || 0}</div>`).join("")}
    </div>`;
  }

  function _htmlCarteRecette(recette, p, persoId, cuirs, restantes) {
    const tierMin = recette.tierCuirMin || 0;
    const tiersOk = TIERS_CUIR.filter((t, idx) => idx >= tierMin && cuirs[t.id] >= recette.cuirs);
    const difficulte = 10 + 2 * recette.rang;
    const desactive = restantes <= 0 || !tiersOk.length;
    let motif = "";
    if (restantes <= 0) motif = "quota du jour atteint";
    else if (!tiersOk.length) motif = tierMin ? `exige au moins du ${_itemCatalogue(TIERS_CUIR[tierMin].id).nom.toLowerCase()}` : "cuir insuffisant";
    return `<div class="carte" style="margin-top:10px;">
      <div><strong>${echapper(recette.nom)}</strong> — rang ${recette.rang} · difficulté ${difficulte} · ${recette.cuirs} cuir${recette.cuirs > 1 ? "s" : ""}${recette.clous ? ` · ${recette.clous} clous` : ""}${recette.duvets ? ` · ${recette.duvets} duvets` : ""}</div>
      <div style="font-size:0.82rem;color:#6a6278;">${echapper(recette.description)}</div>
      ${recette.rarete ? `<div style="font-size:0.82rem;margin-top:2px;">✨ La qualité du jet détermine la rareté de l'objet.</div>` : ""}
      ${tiersOk.length ? `<label style="font-size:0.85rem;margin-top:4px;display:block;">Tier de cuir <select class="tannerie-select-tier" data-recette="${echapper(recette.id)}">${tiersOk.map((t) => `<option value="${echapper(t.id)}">${echapper(_itemCatalogue(t.id).nom)} (${cuirs[t.id]})</option>`).join("")}</select></label>` : ""}
      ${motif ? `<div class="aide" style="margin-top:4px;color:var(--chaos);">⚠ ${echapper(motif)}</div>` : ""}
      <button class="btn or btn-tannerie-assembler" data-recette="${echapper(recette.id)}" ${desactive ? "disabled" : ""} style="margin-top:6px;">✂️ Assembler</button>
    </div>`;
  }

  function rendreZoneTannerie(persoId) {
    const zone = document.getElementById("zone-atelier-tannerie");
    if (!zone) return;
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) { zone.innerHTML = ""; return; }
    _dernierPersoId = persoId;
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    const mods = bonusTannage(p);
    const cuirs = cuirsPortes(p);
    const restantes = MAX_TENTATIVES_JOUR - tentativesJourTotal(persoId);
    const recettes = recettesDisponibles(p);
    const recettesHtml = recettes.length
      ? recettes.map((r) => _htmlCarteRecette(r, p, persoId, cuirs, restantes)).join("")
      : `<div class="carte" style="margin-top:10px;"><p class="vide">Aucune recette accessible — il faut le rang requis et du cuir du tier minimum.</p></div>`;

    zone.innerHTML = _htmlRang(p, persoId) + _htmlDemandeVariante(persoId, role) + _htmlTannage(p, persoId, mods, restantes)
      + `<h3 style="margin-top:14px;">✂️ Assemblage</h3>` + _htmlCuirs(cuirs) + recettesHtml;

    const selPeau = document.getElementById("tannerie-select-peau");
    const selAgent = document.getElementById("tannerie-select-agent");
    const maj = () => {
      const peau = peauxPortees(p).find((e) => e.item.id === (selPeau && selPeau.value));
      const agent = agentsPortes(p).find((e) => e.item.id === (selAgent && selAgent.value));
      const zoneP = document.getElementById("tannerie-plafond-agent");
      if (!zoneP || !agent) return;
      zoneP.textContent = agent.tierMax < 2 ? `⚠ Tannage au ${echapper(agent.item.nom).toLowerCase()} — plafonné au ${_itemCatalogue(TIERS_CUIR[agent.tierMax].id).nom.toLowerCase()}.` : "";
    };
    if (selPeau) selPeau.onchange = maj;
    if (selAgent) selAgent.onchange = maj;
    maj();
    const btnTanner = document.getElementById("tannerie-btn-tanner");
    if (btnTanner) btnTanner.onclick = () => _tanner(persoId, selPeau.value, selAgent.value);

    zone.querySelectorAll(".btn-tannerie-assembler").forEach((btn) => {
      btn.onclick = () => {
        const sel = zone.querySelector(`.tannerie-select-tier[data-recette="${btn.dataset.recette}"]`);
        _assembler(persoId, btn.dataset.recette, sel ? sel.value : null);
      };
    });
    zone.querySelectorAll(".btn-tannerie-variante").forEach((btn) => {
      btn.onclick = () => { resoudreVariante(btn.dataset.variante); rendreZoneTannerie(persoId); };
    });

    if (demandeVarianteEnCours()) _demarrerMinuteurVariante();
  }

  function _tanner(persoId, peauId, agentId) {
    const r = tanner(persoId, peauId, agentId);
    if (!r.ok) { toast(r.raison); return; }
    let msg = `${r.qualiteLabel} — ${r.cuirProduit ? `${r.cuirProduit.unites}× « ${r.cuirProduit.nom} ».` : "cuir perdu."}`;
    if (r.xpGagne) msg += ` +${r.xpGagne} XP Tannerie.`;
    if (r.alea) msg += ` ${r.alea.nom} : ${r.alea.texte}`;
    toast(msg);
    rendreZoneTannerie(persoId);
  }

  function _assembler(persoId, recetteId, tierCuirId) {
    if (!tierCuirId) { toast("Choisis un tier de cuir."); return; }
    const r = assembler(persoId, recetteId, tierCuirId);
    if (!r.ok) { toast(r.raison); return; }
    let msg = `${r.qualiteLabel} — `;
    if (r.varianteEnAttente) msg += "objet rare en cours, le MJ choisit son effet spécial.";
    else msg += r.objetProduit ? `« ${r.objetProduit.nom} » produit.` : "cuirs perdus, rien produit.";
    if (r.xpGagne) msg += ` +${r.xpGagne} XP Tannerie.`;
    if (r.alea) msg += ` ${r.alea.nom} : ${r.alea.texte}`;
    toast(msg);
    rendreZoneTannerie(persoId);
    if (demandeVarianteEnCours()) _demarrerMinuteurVariante();
  }

  return {
    rendreZoneTannerie, peauxPortees, agentsPortes, cuirsPortes, recettesDisponibles,
    bonusJet, bonusTannage, tanner, assembler, libelleQualite,
    demandeVarianteEnCours, resoudreVariante, tentativesJourTotal,
  };
})();

if (typeof window !== "undefined") window.Tannerie = Tannerie;
