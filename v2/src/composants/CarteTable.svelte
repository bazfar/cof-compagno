<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    basculerPorte,
    deplacerJeton,
    effacerDessin,
    enregistrerExploration,
    marquerMort,
    messageErreurCarte,
    montrerScene,
    poserJeton,
    reinitialiserExploration,
    retirerJeton,
    toutReveler,
    tracerDessin,
  } from '../lib/actions/carte';
  import { placementParDefaut } from '../lib/battlemap/deplacement';
  import { enrichirJetons, idJetonPerso, persoDuJeton, pjAPoser, type InfoPersoJeton } from '../lib/battlemap/jetons-pj';
  import { dessinProche, etatDepuisDessins, type DessinCarte, type TypeDessin } from '../lib/battlemap/dessins';
  import { explorationAffichee, explorationLocalePerimee, GrilleExploration, type RepereExploration } from '../lib/battlemap/exploration';
  import { sceneCalcul, type Case, type Point } from '../lib/battlemap/geometrie';
  import type { Role } from '../lib/battlemap/interactions';
  import type { JetonAffiche } from '../lib/battlemap/rendu';
  import { adresseImage, catalogueScenes, chargerGeometrie } from '../lib/battlemap/scenes';
  import type { VisionJeton } from '../lib/battlemap/visibilite';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { estSceneImportee, geometrieImportee, sourceScene } from '../lib/battlemap/import-image';
  import { suivreDessins, suivreEtatScene, suivreImageScene, suivreJetons, suivreScenesImportees, suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivrePortraitsJetons } from '../lib/magasins/portraits-jetons.svelte';
  import type { Dessin, EtatSceneDoc, ImageScene, Jeton } from '../lib/schemas/carte';
  import type { GeometrieScene } from '../lib/schemas/scene';
  import { session } from '../lib/session.svelte';
  import Battlemap from './Battlemap.svelte';
  import ImportScene from './ImportScene.svelte';

  /*
   * La battlemap de la table (lot L5.3) : la scène que le MJ montre, ses
   * jetons, ses portes et son exploration, partagés en direct. Même
   * composant pour le MJ (avec ses outils) et pour les joueurs.
   *
   * Exploration partagée : chaque client marque localement ce que les PJ
   * voient (affichage immédiat) ; seul le client du MJ l'enregistre dans
   * Firestore, fusionné par OU. Un seul écrivain évite que chaque joueur
   * réécrive le même document à chaque pas. L'affichage montre l'union de
   * ce qui est enregistré et de ce que ce client a vu.
   */

  let { role }: { role: Role } = $props();

  const COULEURS_PJ = ['#2980b9', '#27ae60', '#8e44ad', '#d35400', '#16a085', '#b8924a'];
  const COULEUR_MONSTRE = '#c0392b';

  const table = suivreTable(session.table);
  const joueurs = suivreJoueurs(session.table); // MJ : PJ à poser
  const importees = suivreScenesImportees(session.table); // descriptions seules (L5.5)
  const persos = suivrePersos(session.table); // nom, PV des jetons de PJ (L2.3)
  const portraitsJetons = suivrePortraitsJetons(session.table);
  onDestroy(() => {
    table.arreter();
    joueurs.arreter();
    importees.arreter();
    persos.arreter();
    portraitsJetons.arreter();
  });

  const idScene = $derived(table.etat.donnees?.sceneActive ?? null);

  // Scène du catalogue (fichier livré avec l'app) ou importée par le MJ
  // (description et image dans Firestore, L5.5).
  const importee = $derived(idScene !== null && estSceneImportee(idScene));
  let geometrieCatalogue = $state<GeometrieScene | null>(null);
  let imageSuivie = $state<DocumentSuivi<ImageScene> | null>(null);
  const descriptionImportee = $derived(importee ? (importees.etat.elements.find((s) => s.id === idScene) ?? null) : null);
  const geometrie: GeometrieScene | null = $derived(
    importee
      ? descriptionImportee && idScene
        ? geometrieImportee(idScene, descriptionImportee.nom, descriptionImportee, descriptionImportee.pxParCase)
        : null
      : geometrieCatalogue,
  );
  const image = $derived(idScene === null ? '' : importee ? (imageSuivie?.etat.donnees?.image ?? '') : adresseImage(idScene));
  let erreurCatalogue = $state('');
  const erreurChargement = $derived(
    erreurCatalogue ||
      (idScene && sourceScene(idScene, importees.etat.pret, importees.etat.elements.map((s) => s.id)) === 'introuvable'
        ? "Cette scène importée n'existe plus : choisis-en une autre."
        : ''),
  );
  let jetonsSuivis = $state<CollectionSuivie<Jeton> | null>(null);
  let etatSuivi = $state<DocumentSuivi<EtatSceneDoc> | null>(null);
  let dessinsSuivis = $state<CollectionSuivie<Dessin> | null>(null);

  $effect(() => {
    const id = idScene;
    geometrieCatalogue = null;
    erreurCatalogue = '';
    if (!id) return;
    let actif = true;
    const img = estSceneImportee(id) ? suivreImageScene(session.table, id) : null;
    imageSuivie = img;
    if (!img) {
      chargerGeometrie(id)
        .then((g) => { if (actif) geometrieCatalogue = g; })
        .catch((e: unknown) => { if (actif) erreurCatalogue = String(e); });
    }
    const j = suivreJetons(session.table, id);
    const e = suivreEtatScene(session.table, id);
    const d = suivreDessins(session.table, id);
    jetonsSuivis = j;
    etatSuivi = e;
    dessinsSuivis = d;
    return () => {
      actif = false;
      img?.arreter();
      imageSuivie = null;
      j.arreter();
      e.arreter();
      d.arreter();
      jetonsSuivis = null;
      etatSuivi = null;
      dessinsSuivis = null;
    };
  });

  // ---------- Dessins du MJ (L5.4) ----------
  const dessins: DessinCarte[] = $derived(
    (dessinsSuivis?.etat.elements ?? []).map((d) => ({
      id: d.id, type: d.type, a: [d.ax, d.ay] as Point, b: [d.bx, d.by] as Point, ouverte: d.ouverte, tours: d.tours ?? null,
    })),
  );
  const mursDeForce = $derived(dessins.filter((d) => d.type === 'mur' && d.tours).map((d) => ({ a: d.a, b: d.b, tours: d.tours as number })));

  // ---------- Jetons ----------
  // Jetons de PJ reliés à leur fiche (L2.3) : nom, PV et portrait relus en direct.
  const fiches = $derived(new Map(persos.etat.elements.map((p) => [p.id, p])));
  const idsPersosPoses = $derived(
    (jetonsSuivis?.etat.elements ?? []).map((j) => persoDuJeton(j.id)).filter((id): id is string => !!id && fiches.has(id)),
  );
  $effect(() => portraitsJetons.suivre(idsPersosPoses));
  const infosPersos = $derived(
    new Map<string, InfoPersoJeton>(
      persos.etat.elements.map((p) => [p.id, { nom: p.nom, pv: { actuel: p.pvActuel ?? p.pvMax, max: p.pvMax }, portrait: portraitsJetons.images[p.id] ?? null }]),
    ),
  );
  const jetons: JetonAffiche[] = $derived(
    enrichirJetons(
      (jetonsSuivis?.etat.elements ?? []).map((j) => ({ id: j.id, genre: j.genre, nom: j.nom, couleur: j.couleur, cx: j.cx, cy: j.cy, mort: j.mort })),
      infosPersos,
    ),
  );
  const proprietaires = $derived(new Map((jetonsSuivis?.etat.elements ?? []).map((j) => [j.id, j.proprietaire])));
  const miens = $derived(new Set(jetons.filter((j) => proprietaires.get(j.id) === session.uid).map((j) => j.id)));
  let selection = $state<string | null>(null);
  const selectionne = $derived(jetons.find((j) => j.id === selection) ?? null);

  // ---------- Exploration ----------
  const etatScene = $derived(etatSuivi?.etat.donnees ?? null);
  let locale: GrilleExploration | null = null; // ce que ce client a vu (non réactif)
  let revisionLocale = $state(0);
  let repere: RepereExploration | null = null;

  // Nouvelle scène, ou remise à zéro par le MJ : on oublie l'exploration locale.
  $effect(() => {
    const g = geometrie;
    const raz = etatScene?.explorationRaz ?? 0;
    if (!g) return;
    if (explorationLocalePerimee(repere, g.id, raz)) {
      repere = { scene: g.id, raz };
      locale = new GrilleExploration(g.colonnes, g.lignes);
      revisionLocale++;
    }
  });

  // Fusion sans risque : voir explorationAffichee (bug du changement de
  // scène d'une autre taille, 8f2e7ff ; testé par tests/composants).
  const exploration = $derived.by(() => {
    void revisionLocale;
    const g = geometrie;
    return g ? explorationAffichee(g.colonnes, g.lignes, etatScene?.exploration, locale) : null;
  });

  let attenteEnregistrement: ReturnType<typeof setTimeout> | undefined;
  function surVisions(visions: VisionJeton[]) {
    if (!locale || !geometrie) return;
    if (locale.marquerVisions(visions) === 0) return;
    revisionLocale++;
    if (role !== 'mj' || !idScene) return;
    // Le MJ enregistre, au plus une fois par seconde.
    const scene = idScene, g = geometrie, grille = locale;
    clearTimeout(attenteEnregistrement);
    attenteEnregistrement = setTimeout(() => {
      enregistrerExploration(scene, g.colonnes, g.lignes, grille).catch(signaler);
    }, 1000);
  }
  onDestroy(() => clearTimeout(attenteEnregistrement));

  // ---------- Actions ----------
  let message = $state('');
  function signaler(e: unknown) {
    message = messageErreurCarte(e);
  }
  const agir = (p: Promise<unknown>) => {
    message = '';
    p.catch(signaler);
  };

  function surDeplacement(id: string, vers: Case) {
    if (idScene) agir(deplacerJeton(idScene, id, vers));
  }

  function surPorte(idPorte: string) {
    if (!idScene || !geometrie) return;
    const origine = (geometrie.portes.find((p) => p.id === idPorte) ?? dessins.find((d) => d.id === idPorte))?.ouverte ?? false;
    const actuelle = etatScene?.portesOuvertes?.[idPorte] ?? origine;
    agir(basculerPorte(idScene, idPorte, !actuelle));
  }

  // Personnage joué (L2.3) : c'est son jeton que le joueur pose.
  const moi = $derived(joueurs.etat.elements.find((j) => j.id === session.uid) ?? null);
  const monPerso = $derived(moi?.persoActif ? (fiches.get(moi.persoActif) ?? null) : null);
  const monJetonPose = $derived(!!monPerso && jetons.some((j) => j.id === idJetonPerso(monPerso.id)));

  function poserMonJeton() {
    if (!idScene || !geometrie || !monPerso) return;
    const pos = placementParDefaut(sceneCalcul(geometrie), jetons, true);
    const couleur = moi?.couleur ?? (COULEURS_PJ[jetons.filter((j) => j.genre === 'pj').length % COULEURS_PJ.length] as string);
    agir(poserJeton(idScene, idJetonPerso(monPerso.id), { genre: 'pj', nom: monPerso.nom, couleur, ...pos, proprietaire: session.uid }));
  }

  // MJ : poser le personnage joué de chaque joueur qui n'a pas encore son jeton.
  const joueursSansJeton = $derived(pjAPoser(joueurs.etat.elements, fiches, jetons));
  function poserPJDesJoueurs() {
    if (!idScene || !geometrie) return;
    const scene = sceneCalcul(geometrie);
    const places = [...jetons];
    for (const [i, { joueur, idPerso, nom }] of joueursSansJeton.entries()) {
      const pos = placementParDefaut(scene, places, true);
      const couleur = joueur.couleur ?? (COULEURS_PJ[(places.filter((j) => j.genre === 'pj').length + i) % COULEURS_PJ.length] as string);
      places.push({ id: idJetonPerso(idPerso), genre: 'pj', nom, couleur, ...pos });
      agir(poserJeton(idScene, idJetonPerso(idPerso), { genre: 'pj', nom, couleur, ...pos, proprietaire: joueur.id }));
    }
  }

  let nomMonstre = $state('Gobelin');
  function poserMonstre() {
    if (!idScene || !geometrie || !nomMonstre.trim()) return;
    const pos = placementParDefaut(sceneCalcul(geometrie), jetons, false);
    const id = `m-${Date.now().toString(36)}`;
    // Noms distincts, comme en v1 (_labelDistinct) : « Gobelin », « Gobelin 2 »…
    const base = nomMonstre.trim().slice(0, 36);
    let nom = base;
    for (let n = 2; jetons.some((j) => j.nom === nom); n++) nom = `${base} ${n}`;
    agir(poserJeton(idScene, id, { genre: 'monstre', nom, couleur: COULEUR_MONSTRE, ...pos, proprietaire: null }));
  }

  function retirerSelection() {
    if (!idScene || !selection) return;
    agir(retirerJeton(idScene, selection));
    selection = null;
  }

  // ---------- Affichage ----------
  let afficherMurs = $state(true);
  let afficherGrille = $state(false);
  let apercuJoueur = $state(false); // MJ : voir la carte comme un joueur
  let importOuvert = $state(false); // MJ : panneau d'import d'image (L5.5)

  // ---------- Outils de dessin du MJ (L5.4) ----------
  type ChoixOutil = 'aucun' | TypeDessin | 'force';
  let choixOutil = $state<ChoixOutil>('aucun');
  let toursForce = $state(3);
  let aimant = $state(true);
  const outil = $derived(
    role === 'mj' && !apercuJoueur && choixOutil !== 'aucun'
      ? { type: (choixOutil === 'force' ? 'mur' : choixOutil) as TypeDessin, force: choixOutil === 'force', aimant }
      : null,
  );
  const NOMS: Record<TypeDessin, string> = { mur: 'mur', obstacle: 'obstacle', porte: 'porte' };

  function surTrace(type: TypeDessin, a: Point, b: Point, force: boolean) {
    if (!idScene) return;
    agir(tracerDessin(idScene, type, a, b, force ? { tours: Math.max(1, Math.min(100, Math.round(toursForce))) } : {}));
  }

  function surGomme(type: TypeDessin, pt: Point, force: boolean) {
    if (!idScene) return;
    const cible = dessinProche(dessins, type, pt, force);
    if (!cible) {
      message = force ? 'Aucun mur de force à cet endroit.' : `Aucun ${NOMS[type]} dessiné à cet endroit.`;
      return;
    }
    agir(effacerDessin(idScene, cible.id));
  }
  const roleAffiche: Role = $derived(role === 'mj' && !apercuJoueur ? 'mj' : 'joueur');
</script>

<section class="carte-table" aria-label="Battlemap">
  {#if role === 'mj'}
    <div class="outils">
      <label>Scène montrée
        <select value={idScene ?? ''} onchange={(e) => agir(montrerScene(e.currentTarget.value || null))}>
          <option value="">Aucune</option>
          <optgroup label="Catalogue">
            {#each catalogueScenes as s (s.id)}
              <option value={s.id}>{s.nom} ({s.colonnes} × {s.lignes})</option>
            {/each}
          </optgroup>
          {#if importees.etat.elements.length}
            <optgroup label="Importées">
              {#each importees.etat.elements as s (s.id)}
                <option value={s.id}>{s.nom} ({s.colonnes} × {s.lignes})</option>
              {/each}
            </optgroup>
          {/if}
        </select>
      </label>
      <button onclick={() => (importOuvert = !importOuvert)}>{importOuvert ? "Fermer l'import" : 'Importer une image…'}</button>
      {#if idScene}
        <button onclick={poserPJDesJoueurs} disabled={joueursSansJeton.length === 0}>+ PJ des joueurs ({joueursSansJeton.length})</button>
        <input class="nom" bind:value={nomMonstre} maxlength="40" aria-label="Nom du monstre" />
        <button onclick={poserMonstre}>+ Monstre</button>
        <button onclick={() => selectionne && idScene && agir(marquerMort(idScene, selectionne.id, !selectionne.mort))} disabled={selectionne?.genre !== 'monstre'}>
          {selectionne?.mort ? 'Ranimer' : 'Tuer'}
        </button>
        <button onclick={retirerSelection} disabled={!selectionne}>Retirer</button>
        <span class="separateur"></span>
        <button onclick={() => idScene && agir(reinitialiserExploration(idScene))}>Réinitialiser l'exploration</button>
        <button onclick={() => idScene && geometrie && agir(toutReveler(idScene, geometrie.colonnes, geometrie.lignes))}>Tout révéler</button>
        <label><input type="checkbox" bind:checked={apercuJoueur} /> Vue joueur</label>
      {/if}
    </div>
    {#if importOuvert}
      <ImportScene
        scenes={importees.etat.elements}
        sceneMontree={idScene}
        surImportee={(id) => {
          importOuvert = false;
          agir(montrerScene(id));
        }}
      />
    {/if}
    {#if idScene}
      <div class="outils">
        <label>Outil
          <select bind:value={choixOutil} disabled={apercuJoueur}>
            <option value="aucun">Déplacer (aucun outil)</option>
            <option value="mur">Mur</option>
            <option value="obstacle">Obstacle (bloque la vue)</option>
            <option value="porte">Porte ou fenêtre</option>
            <option value="force">Mur de force</option>
          </select>
        </label>
        {#if choixOutil === 'force'}
          <label>Tours <input class="tours" type="number" min="1" max="100" bind:value={toursForce} /></label>
        {/if}
        {#if choixOutil !== 'aucun'}
          <label><input type="checkbox" bind:checked={aimant} /> Aimanter aux demi-cases</label>
          <span class="aide">Cliquer-glisser : tracer · clic : effacer le plus proche</span>
        {/if}
        <span class="separateur"></span>
        <label><input type="checkbox" bind:checked={afficherMurs} /> Murs</label>
        <label><input type="checkbox" bind:checked={afficherGrille} /> Grille</label>
      </div>
    {/if}
  {:else if idScene && geometrie && !monJetonPose}
    <div class="outils">
      {#if monPerso}
        <button onclick={poserMonJeton}>Poser le jeton de {monPerso.nom}</button>
      {:else}
        <span class="aide">Choisis ton personnage joué pour poser ton jeton.</span>
      {/if}
    </div>
  {/if}

  {#if message}
    <p class="erreur" role="alert">{message}</p>
  {/if}

  <div class="zone">
    {#if table.etat.erreur}
      <p class="vide erreur" role="alert">{table.etat.erreur}</p>
    {:else if !idScene}
      <p class="vide">{role === 'mj' ? 'Choisis une scène à montrer à la table.' : "Le MJ n'a pas encore montré de scène."}</p>
    {:else if erreurChargement}
      <p class="vide erreur" role="alert">{erreurChargement}</p>
    {:else if geometrie}
      <Battlemap
        {geometrie}
        {image}
        etat={etatDepuisDessins(dessins, etatScene?.portesOuvertes ?? {})}
        {jetons}
        role={roleAffiche}
        {miens}
        {exploration}
        revisionExploration={revisionLocale}
        {afficherMurs}
        {afficherGrille}
        {selection}
        {surDeplacement}
        {surPorte}
        surSelection={(id) => (selection = id)}
        {surVisions}
        {outil}
        {mursDeForce}
        {surTrace}
        {surGomme}
      />
    {:else}
      <p class="vide">Chargement de la scène…</p>
    {/if}
  </div>
</section>

<style>
  .carte-table {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .outils {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .outils label {
    display: inline-flex;
    flex-direction: row;
    align-items: center;
    gap: 6px;
    margin: 0;
  }
  .nom {
    width: 140px;
  }
  .tours {
    width: 64px;
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .separateur {
    flex: 1 1 auto;
  }
  .zone {
    height: 72vh;
    min-height: 360px;
  }
  .vide {
    height: 100%;
    margin: 0;
    display: grid;
    place-items: center;
    border-radius: var(--rayon-carte);
    background: var(--couleur-surface);
    border: 1px dashed var(--couleur-bordure);
    color: var(--couleur-encre-douce);
  }
  .erreur {
    color: var(--couleur-danger);
    margin: 0;
  }
</style>
