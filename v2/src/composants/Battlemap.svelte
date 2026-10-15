<script lang="ts">
  import { untrack } from 'svelte';
  import type { GrilleExploration } from '../lib/battlemap/exploration';
  import { sceneCalcul, type Case, type EtatScene, type SceneCalcul } from '../lib/battlemap/geometrie';
  import { jetonsADessiner, jetonSousPointeur, pasDeGlisser, peutDeplacer, porteSousPointeur, type Role } from '../lib/battlemap/interactions';
  import { dessiner, peindreExploration, type JetonAffiche } from '../lib/battlemap/rendu';
  import { jetonsVisiblesDesPJ, segmentsBloquants, visionsDesPJ, type VisionJeton } from '../lib/battlemap/visibilite';
  import { deplacer, ecranVersCase, ecranVersScene, vueAjustee, zoomer, type Vue } from '../lib/battlemap/vue';
  import type { GeometrieScene } from '../lib/schemas/scene';

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
    surDeplacement: (id: string, vers: Case) => void;
    surPorte: (idPorte: string) => void;
    surSelection?: (id: string | null) => void;
    /** Appelé quand la vision des PJ change (pour marquer l'exploration). */
    surVisions?: (visions: VisionJeton[]) => void;
  } = $props();

  let canvas = $state<HTMLCanvasElement | undefined>();
  let largeur = $state(0);
  let hauteur = $state(0);
  let vue = $state<Vue | null>(null);
  let imageChargee = $state<HTMLImageElement | null>(null);
  let survol = $state<Case | null>(null);
  let glisser = $state<{ id: string; depart: Case; case: Case } | null>(null);

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
      visions,
      masqueExploration: masquePret,
      tampon,
      afficherMurs, afficherGrille, selection, survol,
      glisser: glisser ? { id: glisser.id, case: glisser.case } : null,
    };
    const c = canvas;
    cancelAnimationFrame(demande);
    demande = requestAnimationFrame(() => {
      const l = Math.round(largeur * densite), h = Math.round(hauteur * densite);
      if (c.width !== l || c.height !== h) { c.width = l; c.height = h; }
      const ctx = c.getContext('2d');
      if (ctx) dessiner(ctx, etatDessin);
    });
    return () => cancelAnimationFrame(demande);
  });

  // ---------- Gestes ----------
  let deplacementVue: { x: number; y: number; bouge: boolean } | null = null;

  function position(ev: PointerEvent | WheelEvent | MouseEvent): [number, number] {
    const r = canvas!.getBoundingClientRect();
    return [ev.clientX - r.left, ev.clientY - r.top];
  }

  function surAppui(ev: PointerEvent) {
    if (!vue || ev.button !== 0) return;
    const [ex, ey] = position(ev);
    const pt = ecranVersScene(vue, ex, ey);
    const jeton = jetonSousPointeur(dessines, pt);
    if (jeton) {
      surSelection?.(jeton.id);
      if (peutDeplacer(role, jeton, miens)) {
        glisser = { id: jeton.id, depart: { cx: jeton.cx, cy: jeton.cy }, case: { cx: jeton.cx, cy: jeton.cy } };
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
    if (glisser) {
      const visee = ecranVersCase(vue, ex, ey, geometrie);
      const jeton = jetons.find((j) => j.id === glisser!.id);
      if (visee && jeton) glisser = { ...glisser, case: pasDeGlisser(scene, jetons, jeton, glisser.case, visee).case };
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
    if (glisser) {
      const { id, depart, case: arrivee } = glisser;
      glisser = null;
      if (arrivee.cx !== depart.cx || arrivee.cy !== depart.cy) surDeplacement(id, arrivee);
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
    onpointerdown={surAppui}
    onpointermove={surMouvement}
    onpointerup={surRelache}
    onpointercancel={surRelache}
    onpointerleave={() => { if (!glisser && !deplacementVue) survol = null; }}
    ondblclick={recadrer}
  ></canvas>
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
