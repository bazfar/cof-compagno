<script lang="ts">
  import { sceneCalcul } from '../../src/lib/battlemap/geometrie';
  import { visionsDesPJ, type VisionJeton } from '../../src/lib/battlemap/visibilite';
  import type { GrilleExploration } from '../../src/lib/battlemap/exploration';
  import type { GeometrieScene } from '../../src/lib/schemas/scene';
  import type { JetonAffiche } from '../../src/lib/battlemap/rendu';

  /*
   * Remplace Battlemap.svelte dans les tests de composants (pas de canvas
   * dans un DOM simulé). Il LIT tout ce que CarteTable lui passe, comme le
   * vrai composant au dessin, et l'affiche en attributs ; le bouton « voir »
   * simule un PJ en (2, 2) qui voit autour de lui. L6.4b1 : les zones,
   * le sol et la visée ; « cliquer 2,3 » clique la case (2, 3).
   */
  let {
    geometrie,
    exploration,
    jetons = [],
    surVisions,
    miens = new Set<string>(),
    actif = null,
    budget = null,
    surDeplacement,
    visee = null,
    zones = [],
    etat = {},
  }: {
    geometrie: GeometrieScene;
    exploration: GrilleExploration | null;
    jetons?: readonly JetonAffiche[];
    surVisions?: (v: VisionJeton[]) => void;
    miens?: ReadonlySet<string>;
    actif?: string | null;
    budget?: { id: string; cases: number } | null;
    surDeplacement?: (id: string, vers: { cx: number; cy: number }, cases?: number) => void;
    /** L6.4a, L6.4b1 : la visée (sort, ou outil « Cases » du MJ). */
    visee?: { choisir: (c: { cx: number; cy: number }, jeton: string | null) => void } | null;
    /** L6.4b1 : zones au sol dessinées. */
    zones?: readonly { cases: readonly { cx: number; cy: number }[]; couleur: string; texte: string; cachee: boolean }[];
    etat?: { infranchissables?: ReadonlySet<string>; difficiles?: ReadonlySet<string>; mursDeZones?: readonly unknown[] };
  } = $props();

  // Combat (L6.1) : simule le glisser du jeton qui a un budget, de 2 cases.
  function glisser() {
    if (budget) surDeplacement?.(budget.id, { cx: 4, cy: 4 }, 2);
  }

  function voir() {
    surVisions?.(visionsDesPJ(sceneCalcul(geometrie), [{ id: 'a', genre: 'pj', cx: 2, cy: 2 }]));
  }
</script>

<div
  data-testid="battlemap"
  data-scene={geometrie.id}
  data-exploration={exploration ? `${exploration.largeur}x${exploration.hauteur}` : 'aucune'}
  data-vu={exploration ? String(exploration.estExploree(4, 4)) : 'aucune'}
  data-jetons={jetons.map((j) => `${j.id}=${j.nom}${j.pv ? ` ${j.pv.actuel}/${j.pv.max}${j.pvChiffres ? '#' : ''}` : ''}`).join('|')}
  data-miens={[...miens].sort().join('|')}
  data-actif={actif ?? ''}
  data-budget={budget ? `${budget.id}:${budget.cases}` : ''}
  data-zones={zones.map((z) => `${z.couleur}:${z.texte}:${z.cases.map((c) => `${c.cx},${c.cy}`).join(';')}${z.cachee ? ':cachee' : ''}`).join('|')}
  data-sol={`${[...(etat.infranchissables ?? [])].join(';')}/${[...(etat.difficiles ?? [])].join(';')}/${etat.mursDeZones?.length ?? 0}`}
  data-visee={visee ? 'oui' : 'non'}
></div>
<button onclick={() => visee?.choisir({ cx: 2, cy: 3 }, null)}>cliquer 2,3</button>
<button onclick={glisser}>glisser</button>
<button onclick={voir}>voir</button>
