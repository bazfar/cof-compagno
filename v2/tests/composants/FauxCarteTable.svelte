<script lang="ts">
  import { carteFaux } from './faux-magasins.svelte';
  /* Remplace CarteTable.svelte dans les tests du combat (L6.1) : la carte a ses propres tests. L6.2 : elle rend `carteFaux` à l'écran qui la monte. */
  let { role, hauteur = '', surCarte }: { role: string; hauteur?: string; surCarte?: (c: never) => void } = $props();
  $effect(() => surCarte?.(carteFaux.valeur as never));
</script>

<div data-testid="carte-table" data-role={role} data-hauteur={hauteur}></div>
