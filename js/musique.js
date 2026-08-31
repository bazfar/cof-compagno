/* ============================================================
   Musique — métier Musicien (répertoire de veillée), moteur.
   Module self-contained, même convention que js/cuisine.js/js/recolte.js/
   js/alchimie.js : ses propres echapper()/toast(), accès à App/SyncStore/
   Metiers/Personnage uniquement par leurs API publiques. Données pures
   dans data/musique.js (REPERTOIRE_MUSIQUE, INSTRUMENTS_MUSIQUE,
   difficulteMorceau).

   Modèle de jet : DIFFICULTÉ ABSOLUE (cf. data/musique.js en-tête), pas
   seuil relatif (Cuisine/Traque/Alchimie-cueillette). Le rang de métier
   compte ×1 au bonus (PAS ×2 comme l'Alchimie-brassage) : le Musicien
   porte en plus un terme d'instrument qui monte jusqu'à +4, cf. le
   calibrage du prompt (à ×2, un maître à la harpe réussirait le rang 5
   sur un 2). Ne pas "harmoniser" ce coefficient avec celui de l'Alchimie.

   Bandes de qualité : mêmes décalages que Cuisine/Récolte (-8/-4/-1/+3/+7),
   mesurés contre `total` (jet + bonus), pas contre le jet nu — 1 naturel
   est toujours un désastre, 20 naturel toujours une Ovation (id "chef",
   simple surcharge d'affichage côté Musicien, cf. libelleQualite).

   La qualité règle la PORTÉE (qui est couvert), jamais la valeur du buff
   (qui reste celle du morceau) — un bon musicien gagne la tablée, il ne
   gonfle pas les chiffres.

   Contrat avec js/repos.js (Veillée) : jouer() exige un
   SyncStore["repos:encours"] actif et écrit encours.veillee (compteur
   "une seule veillée par repos long", même contrat que Recolte.tenter/
   encours.recoltes) — la veillée ne se déclenche que depuis la modale
   sollicitée par le MJ dans l'overlay de repos long, jamais en dehors.
   Le buff numérique (SyncStore["musique:veillee"]) est lu par
   Personnage.bonusSauvegardeMusique et expire dans Repos.validerRepos.
   ============================================================ */

const Musique = (() => {
  "use strict";

  const METIER_ID = "musicien";
  const KEY_BUFF = "musique:veillee";

  function echapper(s) {
    const d = document.createElement("div"); d.textContent = s == null ? "" : String(s); return d.innerHTML;
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2800);
  }

  /* ── §7 : accès au répertoire (rang + réservation Barde) ──────── */
  // rangMorceau ≤ rangMusicien + 1 (un cran au-dessus, jamais deux — même
  // règle que la Récolte) ; rang 3+ réservé à p.classe === "barde", sur le
  // CLASSE réel, jamais sur le métier déclaré (un guerrier peut monter
  // Musique au rang 5 sans jamais accéder au Chant de la Fracture).
  function morceauxDisponibles(p, rangMusicien) {
    return REPERTOIRE_MUSIQUE.filter((m) => m.rang <= rangMusicien + 1 && (!m.bardeSeul || p.classe === "barde"));
  }

  // Meilleur bonusInstrument PORTÉ (inventaireListe, PAS p.equipement) —
  // "on ne les équipe pas, on les porte" (cf. data/loot.json §5, slot: null
  // sur les 6 instruments : ils ne peuvent de toute façon jamais rejoindre
  // un slot d'équipement).
  function instrumentDe(p) {
    const parId = {};
    INSTRUMENTS_MUSIQUE.forEach((i) => { parId[i.id] = i.bonus; });
    let meilleur = 0;
    (p.inventaireListe || []).forEach((it) => {
      if (Object.prototype.hasOwnProperty.call(parId, it.id) && parId[it.id] > meilleur) meilleur = parId[it.id];
    });
    return meilleur;
  }

  // Bonus au jet = rang ×1 + mod CHA + instrument, avec detail[] (§3, "aucun
  // modificateur silencieux").
  function bonusJet(p) {
    const rang = Metiers.rang(p, METIER_ID);
    const perso = Personnage.depuisJSON(p);
    const modCHA = perso.mod("CHA");
    const instrument = instrumentDe(p);
    const bonus = rang + modCHA + instrument;
    const signe = (n) => (n >= 0 ? "+" : "") + n;
    return {
      rang, modCHA, instrument, bonus,
      detail: [
        { libelle: "Rang de Musique", valeur: rang },
        { libelle: "CHA", valeur: modCHA },
        { libelle: "Instrument", valeur: instrument },
      ],
      texte: `Rang (${signe(rang)}) + CHA (${signe(modCHA)}) + Instrument (${signe(instrument)}) = ${signe(bonus)}`,
    };
  }

  /* ── §2 : résolution du jet — mêmes décalages que Cuisine/Récolte ── */
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

  // Libellé "Ovation" pour la bande chef côté Musicien (§3) — surcharge
  // d'affichage SEULE, l'id reste "chef" pour rester compatible avec
  // QUALITES.xpMult (même patron que Recolte.libelleQualite pour "chef" ↔
  // "Belle prise" côté Traque).
  function libelleQualite(qualiteId) {
    if (qualiteId === "chef") return "Ovation";
    const q = (typeof QUALITES !== "undefined") ? QUALITES.find((x) => x.id === qualiteId) : null;
    return q ? q.nom : qualiteId;
  }

  // La qualité règle la PORTÉE (qui est couvert) — la VALEUR reste celle du
  // morceau (valeurBase) par défaut, seuls Désastre (punition fixe -1,
  // jamais la valeur du morceau) et Bien réussi/Ovation (+1 EN PLUS de
  // valeurBase) s'en écartent. "Un bon musicien gagne la tablée, il ne
  // gonfle pas les chiffres" (§3) : Réussi/Médiocre gardent valeurBase telle
  // quelle, ce n'est que le NOMBRE DE PERSONNES couvertes qui change.
  function _porteePour(qualiteId, valeurBase, musicienId, convives) {
    switch (qualiteId) {
      case "desastre": return { portee: [musicienId], valeur: -1, survitUnReposDePlus: false };
      case "rate": return { portee: [], valeur: 0, survitUnReposDePlus: false };
      case "mediocre": return { portee: [musicienId], valeur: valeurBase, survitUnReposDePlus: false };
      case "reussi": return { portee: convives.slice(), valeur: valeurBase, survitUnReposDePlus: false };
      case "bien": return { portee: convives.slice(), valeur: valeurBase + 1, survitUnReposDePlus: false };
      case "chef": return { portee: convives.slice(), valeur: valeurBase + 1, survitUnReposDePlus: true };
      default: return { portee: [], valeur: 0, survitUnReposDePlus: false };
    }
  }

  /* ── 2.1 jouer() : effets de bord + retour ─────────────────────── */
  function jouer(persoId, morceauId, cibleChoisie) {
    const persos = App.chargerPersos();
    const p = persos[persoId];
    if (!p) return { ok: false, raison: "Personnage introuvable." };

    const rangMusicien = Metiers.rang(p, METIER_ID);
    const morceau = REPERTOIRE_MUSIQUE.find((m) => m.id === morceauId);
    if (!morceau) return { ok: false, raison: "Morceau introuvable." };
    if (morceau.rang > rangMusicien + 1) return { ok: false, raison: "Ce morceau est hors de portée." };
    if (morceau.bardeSeul && p.classe !== "barde") return { ok: false, raison: "Réservé aux Bardes." };

    // La veillée ne se tente QUE depuis l'overlay de repos long (cf.
    // js/repos.js, modale sollicitée) — sans encours actif, rien à faire.
    const encours = SyncStore.get("repos:encours") || null;
    if (!encours) return { ok: false, raison: "Aucun repos long en cours." };
    if (encours.veillee) return { ok: false, raison: "Une veillée a déjà été jouée ce repos-ci." };

    // "Le Repas long" (cible: "choix") : la sauvegarde visée est déclarée
    // AVANT le jet, jamais après (sinon c'est un joker) — cibleChoisie
    // porte ce choix, fait par l'appelant (modale, js/repos.js).
    let cible = morceau.cible;
    if (cible === "choix") {
      if (!cibleChoisie) return { ok: false, raison: "Choisis la sauvegarde visée avant de jouer." };
      cible = cibleChoisie;
    }

    const mods = bonusJet(p);
    const jetBrut = App.lancerDe(20);
    const difficulte = difficulteMorceau(morceau);
    const total = jetBrut + mods.bonus;
    const qualiteId = _qualiteIdPour(jetBrut, total, difficulte);
    const qualite = QUALITES.find((q) => q.id === qualiteId);

    const signeBonus = (n) => (n >= 0 ? "+" : "") + n;
    App.ajouterHisto(`${p.nom} — Musique (${morceau.nom})`, jetBrut, jetBrut === 20, jetBrut === 1,
      `d20[${jetBrut}] ${signeBonus(mods.bonus)} = ${total} vs difficulté ${difficulte} — ${libelleQualite(qualiteId)}`);

    const { portee, valeur, survitUnReposDePlus } = _porteePour(qualiteId, morceau.valeur, persoId, encours.convives);

    // Un nouveau morceau REMPLACE le précédent, il ne s'y ajoute jamais
    // (§4, même règle que Note discordante côté Barde) — donc on écrit
    // TOUJOURS musique:veillee, y compris null, pour effacer un buff de la
    // veillée précédente qui aurait survécu (Ovation) mais que ce nouveau
    // jet ne reconduit pas.
    let buff = null;
    // effetSpecial non-numérique (Chant de veille) : pas de buff de
    // sauvegarde à poser — cf. l'état visible sur la fiche ci-dessous.
    const estEffetSpecialSansValeur = morceau.effetSpecial === "initiative_avantage";
    if (!estEffetSpecialSansValeur && cible && valeur !== 0 && portee.length) {
      buff = { morceauId, cible, valeur, portee, poseTs: Date.now(), survitUnReposDePlus };
    }
    SyncStore.set(KEY_BUFF, buff);

    // Chant de veille (initiative_avantage) : aucun point d'accroche
    // "avantage" dans js/combat.js (lancerInitiativeJoueur fait un d20+mod
    // nu, cf. audit du prompt) — repli assumé sur un état VISIBLE sur la
    // fiche, retiré à la main après le premier jet d'initiative du prochain
    // combat (cf. js/app.js, htmlEtatsActifs/wireCapacitesEtEtats). Posé
    // uniquement sur une réussite au moins "Réussi" (portee non vide).
    if (estEffetSpecialSansValeur && portee.length) {
      portee.forEach((pid) => { if (persos[pid]) persos[pid].chantDeVeilleActif = true; });
    }

    // setChamp, pas set(encours) : même règle que la récolte et les
    // attributions — on n'écrit que le champ `veillee`, jamais le document
    // entier, sinon la veillée effacerait les plats et les attributions
    // posés par les autres convives dans la même seconde.
    SyncStore.setChamp("repos:encours", "veillee", { persoId, morceauId, qualiteId, portee });

    const xpGagne = Math.ceil((2 * morceau.rang + 3 * Math.max(0, morceau.rang - rangMusicien)) * qualite.xpMult);
    const gainXp = Metiers.gagnerXp(p, METIER_ID, xpGagne);
    App.sauverPersos(persos);

    if (gainXp.montee) toast(`🎵 Nouveau rang : ${Metiers.titre(p, METIER_ID)} !`);

    return { ok: true, qualiteId, jetBrut, total, difficulte, gainXp, portee, valeur, morceau };
  }

  function buffsActifs() {
    return SyncStore.get(KEY_BUFF) || null;
  }

  return { LISTE: REPERTOIRE_MUSIQUE, morceauxDisponibles, instrumentDe, bonusJet, jouer, buffsActifs, libelleQualite };
})();

if (typeof window !== "undefined") window.Musique = Musique;
