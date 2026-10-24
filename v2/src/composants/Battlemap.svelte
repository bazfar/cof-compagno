<script lang="ts">
  import { untrack } from 'svelte';
  import type { GrilleExploration } from '../lib/battlemap/exploration';
  import { aimanter, bornerPoint, estUnTrace, type TypeDessin } from '../lib/battlemap/dessins';
  import { sceneCalcul, type Case, type EtatScene, type Point, type SceneCalcul } from '../lib/battlemap/geometrie';
  import { jetonsADessiner, jetonSousPointeur, pasDeGlisser, pasDeGlisserBorne, peutDeplacer, porteSousPointeur, type Role } from '../lib/battlemap/interactions';
  import { dessiner, peindreExploration, type JetonAffiche, type ZoneDessinee } from '../lib/battlemap/rendu';
  import { jetonsVisiblesDesPJ, segmentsBloquants, visionsDesPJ, type VisionJeton } from '../lib/battlemap/visibilite';
  import { deplacer, ecranVersCase, ecranVersScene, vueAjustee, zoomer, type Vue } from '../lib/battlemap/vue';
  import type { GeometrieScene } from '../lib/schemas/scene';
  import type { ViseeCarte } from '../lib/combat/visee.svelte';

  /*
   * La battlemap à l'écran (lot L5.2). Composant d'affichage : il reçoit
   * l'état (scène, jetons, portes, exploration) et signale les gestes par
   * des fonctions. Il n'écrit nulle part ; c'est le parent qui décide
   * (atelier local aujourd'hui, actions Firestore en L5.3).
   *
   * Gestes : molette = zoom sous la souris ; glisser dans le vide = déplacer
   * la vue ; glisser un jeton (si on en a le droit) = le déplacer case par
   * case ; clic sur une porte = l'ouvrir ou la fermer ; clic sur un jeton =
   * le sélectionner ; double-clic = recadrer toute la scène.
   *
   * Avec un outil de dessin du MJ (L5.4) : cliquer-glisser trace, un
   * simple clic efface l'élément du même outil le plus proche (comme en v1).
   * La molette zoome toujours ; pour déplacer la vue, on repose l'outil.
   *
   * Avec une visée de sort (L6.4a, 6a) : le survol montre les cases de la
   * zone et les jetons pris ; un clic rend la case (et son jeton) à la
   * visée, sans sélectionner ni glisser.
   *
   * Zones au sol (L6.4b1, 16a) : dessinées en couleur, leur nom et leurs
   * rounds au survol d'une de leurs cases.
   */

  let {
    geometrie,
    image,
    etat = {},
    jetons,
    role,
    miens = new Set<string>(),
    exploration = null,
    revisionExploration = 0,
    afficherMurs = true,
    afficherGrille = false,
    selection = null,
    surDeplacement,
    surPorte,
    surSelection,
    surVisions,
    outil = null,
    mursDeForce = [],
    surTrace,
    surGomme,
    actif = null,
    budget = null,
    visee = null,
    zones = [],
  }: {
    geometrie: GeometrieScene;
    /** Adresse de l'image de la scène. */
    image: string;
    etat?: EtatScene;
    jetons: readonly JetonAffiche[];
    role: Role;
    /** Jetons que ce joueur a le droit de déplacer (son PJ, ses invocations). */
    miens?: ReadonlySet<string>;
    /** Brouillard partagé ; null = pas de brouillard. */
    exploration?: GrilleExploration | null;
    /** À incrémenter quand `exploration` a changé (l'objet n'est pas réactif). */
    revisionExploration?: number;
    afficherMurs?: boolean;
    afficherGrille?: boolean;
    selection?: string | null;
    /** `cases` : ce que le glisser a coûté, quand le jeton avait un budget (combat, L6.1). */
    surDeplacement: (id: string, vers: Case, cases?: number) => void;
    surPorte: (idPorte: string) => void;
    surSelection?: (id: string | null) => void;
    /** Appelé quand la vision des PJ change (pour marquer l'exploration). */
    surVisions?: (visions: VisionJeton[]) => void;
    /** Outil de dessin actif (MJ, L5.4) ; null = gestes ordinaires. */
    outil?: { type: TypeDessin; force: boolean; aimant: boolean } | null;
    mursDeForce?: readonly { a: Point; b: Point; tours: number }[];
    surTrace?: (type: TypeDessin, a: Point, b: Point, force: boolean) => void;
    surGomme?: (type: TypeDessin, pt: Point, force: boolean) => void;
    /** Combat (L6.1) : le combattant qui joue, cerclé d'or. */
    actif?: string | null;
    /** Combat (L6.1, 7a) : ce jeton ne parcourt pas plus de `cases` cases ; elles se dessinent autour de lui. */
    budget?: { id: string; cases: number } | null;
    /** Visée d'un sort (L6.4a) : le clic lui revient. */
    visee?: ViseeCarte | null;
    /** Zones au sol (L6.4b1) : cases, couleur, texte du survol ; `cachee` : le MJ seul la voit. */
    zones?: readonly ZoneDessinee[];
  } = $props();

  let canvas = $state<HTMLCanvasElement | undefined>();
  let largeur = $state(0);
  let hauteur = $state(0);
  let vue = $state<Vue | null>(null);
  let imageChargee = $state<HTMLImageElement | null>(null);
  let survol = $state<Case | null>(null);
  let glisser = $state<{ id: string; depart: Case; case: Case; cout: number } | null>(null);
  // `clic` : point exact du clic (non aimanté), pour la gomme.
  let trace = $state<{ a: Point; b: Point; clic: Point } | null>(null);

  const scene: SceneCalcul = $derived(sceneCalcul(geometrie, etat));

  // Positions vues par le calcul de vision : celle du glisser en cours compte.
  const jetonsPlaces = $derived(
    glisser ? jetons.map((j) => (j.id === glisser!.id ? { ...j, cx: glisser!.case.cx, cy: glisser!.case.cy } : j)) : jetons,
  );

  // La vision ne se recalcule que si la scène change ou qu'un PJ change de
  // case (et non à chaque image, comme en v1 pendant un glisser : sur
  // Ambush, un calcul coûte plusieurs dizaines de millisecondes par PJ).
  let cacheScene: SceneCalcul | null = null;
  let cacheCle = '';
  let cacheVisions: VisionJeton[] = [];
  const visions = $derived.by(() => {
    const cle = jetonsPlaces.filter((j) => j.genre === 'pj').map((j) => `${j.id}:${j.cx}:${j.cy}`).join('|');
    if (scene !== cacheScene || cle !== cacheCle) {
      cacheScene = scene;
      cacheCle = cle;
      cacheVisions = visionsDesPJ(scene, jetonsPlaces, segmentsBloquants(scene));
    }
    return cacheVisions;
  });
  const visibles = $derived(jetonsVisiblesDesPJ(visions, jetonsPlaces));
  const dessines = $derived(jetonsADessiner(jetons, role, visibles) as JetonAffiche[]);

  $effect(() => {
    const v = visions;
    untrack(() => surVisions?.(v));
  });

  // Image de la scène.
  $effect(() => {
    const img = new Image();
    let actif = true;
    img.onload = () => { if (actif) imageChargee = img; };
    img.src = image;
    imageChargee = null;
    return () => { actif = false; };
  });

  // Recadrage à l'ouverture d'une scène ou au premier affichage.
  let sceneCadree: string | null = null;
  $effect(() => {
    if (largeur > 0 && hauteur > 0 && (vue === null || sceneCadree !== geometrie.id)) {
      sceneCadree = geometrie.id;
      vue = vueAjustee(geometrie, largeur, hauteur);
    }
  });

  // Masque d'exploration : repeint seulement quand l'exploration change.
  const masque = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const tampon = typeof document !== 'undefined' ? document.createElement('canvas') : null;
  const masquePret = $derived.by(() => {
    void revisionExploration;
    if (!exploration || !masque) return null;
    peindreExploration(masque, exploration);
    return masque;
  });

  // Dessin : à chaque changement de ce qui est affiché, au plus une fois par image.
  let demande = 0;
  $effect(() => {
    if (!canvas || !vue || !tampon) return;
    const densite = window.devicePixelRatio || 1;
    const etatDessin = {
      largeur, hauteur, densite, vue, scene,
      image: imageChargee,
      jetons: dessines,
      pvChiffres: role === 'mj',
      visions,
      masqueExploration: masquePret,
      tampon,
      afficherMurs, afficherGrille, selection, survol,
      glisser: glisser ? { id: glisser.id, case: glisser.case } : null,
      mursDeForce,
      trace: trace && outil ? { a: trace.a, b: trace.b, type: outil.type, force: outil.force } : null,
      actif,
      portee: porteeDessinee,
      visee: viseeDessinee,
      zones,
    };
    const c = canvas;
    cancelAnimationFrame(demande);
    demande = requestAnimationFrame(() => {
      const l = Math.round(largeur * densite), h = Math.round(hauteur * densite);
      // Section masquée (L2.6) : la zone fait 0 px. Un canvas de 0 × 0 ferait
      // lever drawImage sur le tampon du brouillard. Rien à dessiner tant
      // qu'on ne voit rien ; le retour à l'écran relance cet effet.
      if (l <= 0 || h <= 0) return;
      if (c.width !== l || c.height !== h) { c.width = l; c.height = h; }
      const ctx = c.getContext('2d');
      if (ctx) dessiner(ctx, etatDessin);
    });
    return () => cancelAnimationFrame(demande);
  });

  // Combat (L6.1) : les cases encore atteignables, depuis la case du jeton (ou celle du glisser).
  const porteeDessinee = $derived.by(() => {
    if (!budget) return null;
    const j = jetons.find((x) => x.id === budget.id);
    if (!j) return null;
    return glisser?.id === j.id ? { cx: glisser.depart.cx, cy: glisser.depart.cy, cases: budget.cases } : { cx: j.cx, cy: j.cy, cases: budget.cases };
  });

  // Visée d'un sort (L6.4a) : ce qui est choisi, et ce que le survol prendrait.
  const viseeDessinee = $derived.by(() => {
    if (!visee) return null;
    const a = survol ? visee.apercu(survol) : null;
    return {
      cases: [...visee.fixe.cases, ...(a?.cases ?? [])],
      jetons: [...new Set([...visee.fixe.jetons, ...(a?.jetons ?? [])])],
      refus: !!a?.refus,
    };
  });

  // Zones au sol (16a) : ce que dit la case survolée.
  const texteSurvol = $derived(survol ? zones.filter((z) => z.cases.some((c) => c.cx === survol!.cx && c.cy === survol!.cy)).map((z) => z.texte) : []);

  // ---------- Gestes ----------
  let deplacementVue: { x: number; y: number; bouge: boolean } | null = null;

  function position(ev: PointerEvent | WheelEvent | MouseEvent): [number, number] {
    const r = canvas!.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  /** Point de la scène sous le pointeur, aimanté si demandé. */
  function pointOutil(ex: number, ey: number): Point {
    const brut = bornerPoint(ecranVersScene(vue!, ex, ey), geometrie.colonnes, geometrie.lignes);
    return outil?.aimant ? aimanter(brut) : brut;
  }

  function surAppui(ev: PointerEvent) {
    if (!vue || ev.button !== 0) return;
    const [ex, ey] = position(ev);
    if (outil) {
      const p = pointOutil(ex, ey);
      trace = { a: p, b: p, clic: ecranVersScene(vue, ex, ey) };
      canvas!.setPointerCapture(ev.pointerId);
      return;
    }
    const pt = ecranVersScene(vue, ex, ey);
    const jeton = jetonSousPointeur(dessines, pt);
    if (visee) {
      const c = ecranVersCase(vue, ex, ey, geometrie);
      if (c) visee.choisir(c, jeton?.id ?? null);
      return;
    }
    if (jeton) {
      surSelection?.(jeton.id);
      if (peutDeplacer(role, jeton, miens)) {
        glisser = { id: jeton.id, depart: { cx: jeton.cx, cy: jeton.cy }, case: { cx: jeton.cx, cy: jeton.cy }, cout: 0 };
        canvas!.setPointerCapture(ev.pointerId);
      }
      return;
    }
    const porte = porteSousPointeur(scene, pt, vue.echelle);
    if (porte) {
      surPorte(porte.id);
      return;
    }
    deplacementVue = { x: ex, y: ey, bouge: false };
    canvas!.setPointerCapture(ev.pointerId);
  }

  function surMouvement(ev: PointerEvent) {
    if (!vue) return;
    const [ex, ey] = position(ev);
    if (trace) {
      trace = { ...trace, b: pointOutil(ex, ey) };
      return;
    }
    if (glisser) {
      const visee = ecranVersCase(vue, ex, ey, geometrie);
      const jeton = jetons.find((j) => j.id === glisser!.id);
      if (visee && jeton) {
        if (budget?.id === jeton.id) {
          const p = pasDeGlisserBorne(scene, jetons, jeton, glisser.case, visee, budget.cases - glisser.cout);
          glisser = { ...glisser, case: p.case, cout: glisser.cout + p.cout };
        } else glisser = { ...glisser, case: pasDeGlisser(scene, jetons, jeton, glisser.case, visee).case };
      }
      return;
    }
    if (deplacementVue) {
      const dx = ex - deplacementVue.x, dy = ey - deplacementVue.y;
      if (Math.abs(dx) + Math.abs(dy) > 0) {
        vue = deplacer(vue, dx, dy, geometrie, largeur, hauteur);
        deplacementVue = { x: ex, y: ey, bouge: true };
      }
      return;
    }
    const c = ecranVersCase(vue, ex, ey, geometrie);
    if (c?.cx !== survol?.cx || c?.cy !== survol?.cy) survol = c;
  }

  function surRelache() {
    if (trace && outil) {
      const { a, b, clic } = trace;
      trace = null;
      if (estUnTrace(a, b)) surTrace?.(outil.type, a, b, outil.force);
      else surGomme?.(outil.type, clic, outil.force);
      return;
    }
    trace = null;
    if (glisser) {
      const { id, depart, case: arrivee, cout } = glisser;
      glisser = null;
      if (arrivee.cx !== depart.cx || arrivee.cy !== depart.cy) {
        if (budget?.id === id) surDeplacement(id, arrivee, cout);
        else surDeplacement(id, arrivee);
      }
    } else if (deplacementVue && !deplacementVue.bouge) {
      surSelection?.(null); // clic dans le vide : désélection
    }
    deplacementVue = null;
  }

  function surMolette(ev: WheelEvent) {
    if (!vue) return;
    ev.preventDefault();
    const [ex, ey] = position(ev);
    vue = zoomer(vue, Math.exp(-ev.deltaY * 0.0015), ex, ey, geometrie, largeur, hauteur);
  }

  // La molette doit pouvoir empêcher le défilement de la page : écouteur non passif.
  $effect(() => {
    const c = canvas;
    if (!c) return;
    c.addEventListener('wheel', surMolette, { passive: false });
    return () => c.removeEventListener('wheel', surMolette);
  });

  function recadrer() {
    if (largeur > 0 && hauteur > 0) vue = vueAjustee(geometrie, largeur, hauteur);
  }
</script>

<div class="battlemap" bind:clientWidth={largeur} bind:clientHeight={hauteur}>
  <canvas
    bind:this={canvas}
    style:width="{largeur}px"
    style:height="{hauteur}px"
    class:glisse={glisser !== null}
    class:vise={visee !== null}
    onpointerdown={surAppui}
    onpointermove={surMouvement}
    onpointerup={surRelache}
    onpointercancel={surRelache}
    onpointerleave={() => { if (!glisser && !deplacementVue) survol = null; }}
    ondblclick={recadrer}
  ></canvas>
  {#if texteSurvol.length}
    <p class="survol-zone" role="status">{texteSurvol.join(' · ')}</p>
  {/if}
  {#if !imageChargee}
    <p class="chargement">Chargement de la scène…</p>
  {/if}
</div>

<style>
  .battlemap {
    position: relative;
    width: 100%;
    height: 100%;
    min-height: 320px;
    overflow: hidden;
    border-radius: var(--rayon-carte);
    background: #1b1622;
  }
  canvas {
    display: block;
    touch-action: none;
    cursor: grab;
  }
  canvas.glisse {
    cursor: grabbing;
  }
  canvas.vise {
    cursor: crosshair;
  }
  .survol-zone {
    position: absolute;
    left: 8px;
    bottom: 8px;
    margin: 0;
    max-width: calc(100% - 16px);
    padding: 4px 10px;
    border-radius: 8px;
    background: rgba(27, 22, 34, 0.85);
    color: #fff;
    font-size: 13px;
    pointer-events: none;
  }
  .chargement {
    position: absolute;
    inset: 0;
    margin: 0;
    display: grid;
    place-items: center;
    color: var(--couleur-sur-accent);
    pointer-events: none;
  }
</style>
