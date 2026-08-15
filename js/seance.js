/* ============================================================
   Séance — dater les soirées de jeu et cadrer la présence déclarative.

   ⚠️ Collision de vocabulaire : window.SESSION_ID = "table-arbre-monde"
   désigne déjà LA TABLE ENTIÈRE dans Firestore (sessions/{SESSION_ID}/…).
   La soirée de jeu s'appelle donc "Séance", JAMAIS "session" — aucune
   variable, clé, id HTML ou libellé de ce fichier ne doit contenir ce
   mot. Une future passe qui "uniformiserait" les deux termes casserait
   cette distinction délibérée.

   ⚠️ Ce module NE VERROUILLE RIEN. Le butin, le combat, l'atelier, les
   dés, le marché restent utilisables en permanence, séance ouverte ou
   non. Une conception antérieure verrouillait les actions partagées hors
   séance — écartée volontairement comme trop contraignante. La séance
   sert à DEUX choses, et deux seulement : dater les soirées et cadrer la
   présence. Ne pas "compléter" ce module avec un quelconque blocage plus
   tard : c'est une omission volontaire, pas un oubli.

   Trois clés SyncStore, deux API distinctes exposées (Seance/Presence),
   partageant ce fichier parce que la présence n'a de sens qu'adossée à
   une séance (numéro affiché dans le bandeau, réinitialisée à l'ouverture
   et à la clôture) — mais Presence reste déclarable même hors séance
   (cf. Presence.basculer ci-dessous).
   ============================================================ */

const Seance = (() => {
  "use strict";

  const KEY_SEANCE = "seance:courante"; // objet, ou null si aucune séance
  const KEY_HISTO = "seance:histo";     // liste des séances closes

  function lireCourante() { return SyncStore.get(KEY_SEANCE) || null; }
  function sauverCourante(s) { SyncStore.set(KEY_SEANCE, s); }
  function lireHisto() { return SyncStore.get(KEY_HISTO) || []; }
  function sauverHisto(h) { SyncStore.set(KEY_HISTO, h); }

  function echapper(s) {
    const d = document.createElement("div"); d.textContent = s || ""; return d.innerHTML;
  }
  function toast(msg) {
    const t = document.getElementById("toast");
    if (!t) return;
    t.textContent = msg; t.classList.add("visible");
    setTimeout(() => t.classList.remove("visible"), 2800);
  }

  function courante() { return lireCourante(); }
  function estActive() { return !!lireCourante(); }

  // max(numéros connus) + 1 — jamais réutilisé, l'historique garde tous
  // les anciens numéros même après une longue pause entre deux séances.
  function numeroSuivant() {
    const cour = lireCourante();
    const nums = lireHisto().map((s) => s.numero).concat(cour ? [cour.numero] : []);
    return nums.length ? Math.max(...nums) + 1 : 1;
  }

  // Ouvrir OU clore une séance réinitialise la présence — sans ça, la
  // déclaration de mardi dernier traîne jusqu'au mardi suivant et le futur
  // scrutin de repos long attendrait un joueur qui n'est pas là. Chacun
  // redéclare en début de soirée : un clic, l'équivalent de l'appel fait
  // de vive voix. Effet de bord qui paraîtra gratuit à la relecture — il
  // est volontaire, ne pas le retirer au motif qu'il "ne fait rien d'utile
  // ici".
  function ouvrir(titre) {
    if (typeof App === "undefined" || !App.obtenirRole || App.obtenirRole() !== "mj") return null;
    if (estActive()) return lireCourante(); // déjà ouverte — no-op, pas de double-ouverture
    const s = {
      numero: numeroSuivant(),
      titre: (titre || "").trim(),
      debutTs: Date.now(),
      mjNom: (typeof App !== "undefined" && App.obtenirJoueurNom && App.obtenirJoueurNom()) || "MJ",
    };
    sauverCourante(s);
    Presence.reinitialiser();
    toast(`▶ Séance ${s.numero} ouverte.`);
    rendreZoneSeance();
    return s;
  }

  function fermer() {
    if (typeof App === "undefined" || !App.obtenirRole || App.obtenirRole() !== "mj") return null;
    const cour = lireCourante();
    if (!cour) return null;
    const histo = lireHisto();
    histo.push(Object.assign({}, cour, { finTs: Date.now(), presents: Presence.presents().map((p) => p.nom) }));
    sauverHisto(histo);
    sauverCourante(null);
    Presence.reinitialiser();
    toast(`« Séance ${cour.numero} close — ${histo.length} séances jouées. »`);
    rendreZoneSeance();
    return cour;
  }

  function nbSeancesJouees() { return lireHisto().length; }

  /* ── Rendu — bandeau commun + vue joueur/MJ dans #zone-seance ────── */

  function _formatHeure(ts) {
    return new Date(ts).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  }
  function _formatDuree(ms) {
    const totalMin = Math.max(0, Math.floor(ms / 60000));
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return h > 0 ? `${h}h${String(m).padStart(2, "0")}` : `${m} min`;
  }

  function _htmlBandeau(cour, presents) {
    if (!cour) return `<div class="carte"><span style="opacity:.7;">○ Aucune séance en cours</span></div>`;
    const listePresents = presents.length ? ` : ${presents.map((p) => echapper(p.nom)).join(", ")}` : "";
    return `<div class="carte">
      <strong>● Séance ${cour.numero}${cour.titre ? " — " + echapper(cour.titre) : ""}</strong>
      — ouverte à ${_formatHeure(cour.debutTs)} · ${presents.length} présent${presents.length > 1 ? "s" : ""}${listePresents}
    </div>`;
  }

  function _htmlVueJoueur(presents) {
    const jePresent = Presence.suisJePresent();
    const monId = (typeof App !== "undefined" && App.obtenirJoueurId) ? App.obtenirJoueurId() : null;
    const autres = presents.filter((p) => p.joueurId !== monId);
    return `<div class="carte">
      <button class="btn ${jePresent ? "or" : "secondaire"}" id="btn-presence-basculer" style="width:100%;font-size:1rem;">
        ${jePresent ? "✓ Présent — me retirer" : "✋ Je suis là"}
      </button>
      ${autres.length ? `<p style="margin-top:8px;font-size:0.85rem;color:#6a6278;">Aussi présents : ${autres.map((p) => echapper(p.nom)).join(", ")}</p>` : ""}
    </div>`;
  }

  // Veillée du Musicien (prompt_musicien_7_veillee.md §6) : côté MJ, la
  // liste des personnages couverts par le buff en cours — pour qu'il en
  // tienne compte en posant ses DD. Purement informatif, ne pilote rien.
  function _htmlVeilleeMj() {
    if (typeof SyncStore === "undefined") return "";
    const buff = SyncStore.get("musique:veillee");
    if (!buff) return "";
    const persos = (typeof App !== "undefined" && App.chargerPersos) ? App.chargerPersos() : {};
    const morceau = (typeof REPERTOIRE_MUSIQUE !== "undefined") ? REPERTOIRE_MUSIQUE.find((m) => m.id === buff.morceauId) : null;
    const noms = buff.portee.map((id) => (persos[id] ? persos[id].nom : id));
    const libelleSauv = (buff.cible && typeof Sauvegardes !== "undefined" && Sauvegardes.LIBELLES[buff.cible]) || buff.cible;
    const signeVal = (n) => (n >= 0 ? "+" : "") + n;
    return `<div class="carte" style="margin-top:10px;">
      <strong>🎵 Veillée active</strong> — ${echapper(morceau ? morceau.nom : buff.morceauId)}${libelleSauv ? ` (${signeVal(buff.valeur)} ${echapper(libelleSauv)})` : ""}
      <p style="font-size:0.85rem;color:#6a6278;margin-top:4px;">Convives couverts : ${noms.length ? noms.map(echapper).join(", ") : "—"}</p>
    </div>`;
  }

  function _htmlVueMj(cour, presents) {
    const nb = nbSeancesJouees();
    const compteur = `<p style="margin-top:8px;font-size:0.85rem;color:#6a6278;">${nb} séance${nb > 1 ? "s" : ""} jouée${nb > 1 ? "s" : ""}</p>`;
    if (!cour) {
      return `<div class="carte">
        <label>Titre
          <input type="text" id="seance-titre" placeholder="Titre de la séance — facultatif" style="width:100%;" />
        </label>
        <button class="btn or" id="btn-seance-ouvrir" style="margin-top:8px;">▶ Ouvrir la séance ${numeroSuivant()}</button>
        ${compteur}
      </div>${_htmlVeilleeMj()}`;
    }
    const lignes = presents.length
      ? presents.map((p) => `<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 0;border-bottom:1px solid rgba(0,0,0,.06);">
          <span>${echapper(p.nom)}</span>
          <button class="btn petit secondaire" data-retirer-presence="${echapper(p.joueurId)}">retirer</button>
        </div>`).join("")
      : `<p class="vide" style="font-size:0.85rem;">Personne ne s'est encore déclaré présent.</p>`;
    return `<div class="carte">
      <strong>Séance ${cour.numero}${cour.titre ? " — " + echapper(cour.titre) : ""}</strong>
      <p style="font-size:0.85rem;color:#6a6278;">Ouverte à ${_formatHeure(cour.debutTs)} · ${_formatDuree(Date.now() - cour.debutTs)}</p>
      ${lignes}
      <button class="btn danger" id="btn-seance-fermer" style="margin-top:8px;">⏹ Clore la séance</button>
      ${compteur}
    </div>${_htmlVeilleeMj()}`;
  }

  function rendreZoneSeance() {
    const zone = document.getElementById("zone-seance");
    if (!zone) return;
    const role = (typeof App !== "undefined" && App.obtenirRole) ? App.obtenirRole() : "joueur";
    const cour = lireCourante();
    const presents = Presence.presents();

    zone.innerHTML = _htmlBandeau(cour, presents) + (role === "mj" ? _htmlVueMj(cour, presents) : _htmlVueJoueur(presents));

    const btnBasculer = document.getElementById("btn-presence-basculer");
    if (btnBasculer) btnBasculer.onclick = () => { Presence.basculer(); rendreZoneSeance(); };
    const btnOuvrir = document.getElementById("btn-seance-ouvrir");
    if (btnOuvrir) btnOuvrir.onclick = () => {
      const champTitre = document.getElementById("seance-titre");
      ouvrir(champTitre ? champTitre.value : "");
    };
    const btnFermer = document.getElementById("btn-seance-fermer");
    if (btnFermer) btnFermer.onclick = () => {
      if (confirm("Clore la séance en cours ?")) fermer();
    };
    document.querySelectorAll("[data-retirer-presence]").forEach((btn) => {
      btn.onclick = () => { Presence.reinitialiser(btn.dataset.retirerPresence); rendreZoneSeance(); };
    });
  }

  function _rendreSiPartyActif() {
    const p = document.getElementById("panneau-party");
    if (p && p.classList.contains("actif")) rendreZoneSeance();
  }

  // Temps réel — même patron que Repos/marche : un abonnement posé une
  // fois au chargement du script, qui re-rend #zone-seance sur tous les
  // postes dès que l'un ou l'autre document change.
  // Toast sur ouverture/clôture (transition détectée via _dernierNumero,
  // sentinelle `undefined` pour ne PAS toaster sur le tout premier
  // snapshot reçu au chargement de la page — sinon rejoindre une séance
  // déjà ouverte déclencherait le toast d'ouverture à chaque rechargement).
  // Aucun toast sur la présence (cf. subscribe KEY_PRESENCE) : à sept
  // joueurs qui se déclarent en même temps, ce serait une avalanche.
  let _dernierNumero;
  SyncStore.subscribe(KEY_SEANCE, (val) => {
    if (_dernierNumero !== undefined) {
      if (!_dernierNumero && val) toast(`▶ La séance ${val.numero} est ouverte — déclare ta présence.`);
      else if (_dernierNumero && !val) toast("⏹ La séance est terminée.");
    }
    _dernierNumero = val ? val.numero : null;
    _rendreSiPartyActif();
  });
  SyncStore.subscribe("presence:table", () => { _rendreSiPartyActif(); });
  // Veillée du Musicien (cf. _htmlVeilleeMj ci-dessus) : re-rend le panneau
  // MJ dès que le buff change (posé, remplacé, ou expiré dans validerRepos).
  SyncStore.subscribe("musique:veillee", () => { _rendreSiPartyActif(); });

  return { courante, estActive, numeroSuivant, ouvrir, fermer, nbSeancesJouees, rendreZoneSeance };
})();

const Presence = (() => {
  "use strict";

  const KEY_PRESENCE = "presence:table"; // { [joueurId]: { nom, present, ts } }

  function lire() { return SyncStore.get(KEY_PRESENCE) || {}; }
  function sauver(p) { SyncStore.set(KEY_PRESENCE, p); }

  // La présence est portée par le JOUEUR, pas par le personnage — un
  // joueur qui tient deux fiches est une seule voix au scrutin, c'est ce
  // qu'on veut pour une décision de table (cf. le futur vote de repos
  // long). Indexé par joueurId (App.obtenirJoueurId), jamais par persoId.
  function basculer() {
    if (typeof App === "undefined" || !App.obtenirRole) return false;
    // Le MJ ne se déclare pas présent : il l'est par définition, et il ne
    // vote pas au scrutin de repos (à confirmer lors du chantier suivant —
    // d'ici là, on ne l'inscrit jamais dans presence:table).
    if (App.obtenirRole() === "mj") return false;
    const id = App.obtenirJoueurId && App.obtenirJoueurId();
    const nom = App.obtenirJoueurNom && App.obtenirJoueurNom();
    if (!id || !nom) return false;
    const table = lire();
    const present = !(table[id] && table[id].present);
    // setChamp, pas sauver(table) : chaque joueur bascule SA PROPRE
    // présence, typiquement à quelques instants d'écart d'un autre —
    // écrire toute la map depuis une copie locale risquerait d'effacer la
    // présence qu'un autre joueur vient de déclarer entre-temps.
    SyncStore.setChamp(KEY_PRESENCE, id, { nom, present, ts: Date.now() });
    return present;
  }

  function suisJePresent() {
    const id = (typeof App !== "undefined" && App.obtenirJoueurId) ? App.obtenirJoueurId() : null;
    return id ? estPresent(id) : false;
  }

  function presents() {
    const table = lire();
    return Object.keys(table)
      .filter((id) => table[id] && table[id].present)
      .map((id) => ({ joueurId: id, nom: table[id].nom }));
  }

  function nbPresents() { return presents().length; }

  function estPresent(joueurId) {
    const table = lire();
    return !!(table[joueurId] && table[joueurId].present);
  }

  // Sans argument : MJ uniquement, remet tout le monde à absent (appelé
  // par Seance.ouvrir/fermer). Avec un joueurId : retire cette seule
  // entrée — filet de sécurité MJ pour un onglet resté ouvert sans
  // personne devant (cf. bouton "retirer" de la vue MJ).
  function reinitialiser(joueurId) {
    if (typeof App === "undefined" || !App.obtenirRole || App.obtenirRole() !== "mj") return;
    if (joueurId) {
      // supprimerChamp, pas sauver(table) : ce retrait ciblé par le MJ ne
      // doit pas écraser la présence qu'un AUTRE joueur vient de basculer
      // au même instant (cf. basculer() ci-dessus).
      SyncStore.supprimerChamp(KEY_PRESENCE, joueurId);
    } else {
      sauver({});
    }
  }

  return { basculer, suisJePresent, presents, nbPresents, estPresent, reinitialiser };
})();

if (typeof window !== "undefined") {
  window.Seance = Seance;
  window.Presence = Presence;
}
