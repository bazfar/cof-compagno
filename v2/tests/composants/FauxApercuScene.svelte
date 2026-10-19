<script lang="ts">
  import { onMount } from 'svelte';
  import type { Case } from '../../src/lib/battlemap/geometrie';
  import type { JetonAffiche } from '../../src/lib/battlemap/rendu';
  import type { GeometrieScene } from '../../src/lib/schemas/scene';

  /*
   * Remplace ApercuScene.svelte dans les tests (pas de canvas) : annonce une
   * scène de 10 × 10 cases, montre les jetons reçus, et « déplacer »
   * pousse le premier jeton en (0, 0).
   */
  let { scene, jetons, surDeplacement, surChargee }: { scene: string; jetons: readonly JetonAffiche[]; surDeplacement: (id: string, vers: Case) => void; surChargee?: (g: GeometrieScene) => void } =
    $props();
  onMount(() => surChargee?.({ id: scene, nom: scene, colonnes: 10, lignes: 10 } as GeometrieScene));
</script>

<div data-testid="apercu" data-scene={scene}>
  {#each jetons as j (j.id)}<span data-testid="jeton-apercu">{j.nom} ({j.cx},{j.cy})</span>{/each}
  <button onclick={() => jetons[0] && surDeplacement(jetons[0].id, { cx: 0, cy: 0 })}>déplacer</button>
</div>
