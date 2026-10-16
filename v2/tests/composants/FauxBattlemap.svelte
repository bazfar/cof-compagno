<script lang="ts">
  import { sceneCalcul } from '../../src/lib/battlemap/geometrie';
  import { visionsDesPJ, type VisionJeton } from '../../src/lib/battlemap/visibilite';
  import type { GrilleExploration } from '../../src/lib/battlemap/exploration';
  import type { GeometrieScene } from '../../src/lib/schemas/scene';

  /*
   * Remplace Battlemap.svelte dans les tests de composants (pas de canvas
   * dans un DOM simulé). Il LIT tout ce que CarteTable lui passe, comme le
   * vrai composant au dessin, et l'affiche en attributs ; le bouton « voir »
   * simule un PJ en (2, 2) qui voit autour de lui.
   */
  let {
    geometrie,
    exploration,
    surVisions,
  }: { geometrie: GeometrieScene; exploration: GrilleExploration | null; surVisions?: (v: VisionJeton[]) => void } = $props();

  function voir() {
    surVisions?.(visionsDesPJ(sceneCalcul(geometrie), [{ id: 'a', genre: 'pj', cx: 2, cy: 2 }]));
  }
</script>

<div
  data-testid="battlemap"
  data-scene={geometrie.id}
  data-exploration={exploration ? `${exploration.largeur}x${exploration.hauteur}` : 'aucune'}
  data-vu={exploration ? String(exploration.estExploree(4, 4)) : 'aucune'}
></div>
<button onclick={voir}>voir</button>
