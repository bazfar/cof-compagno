<script lang="ts">
  /* Remplace CarteTable.svelte dans les tests du combat (L6.1) : la carte a ses propres tests. */
  let { role, hauteur = '' }: { role: string; hauteur?: string } = $props();
</script>

<div data-testid="carte-table" data-role={role} data-hauteur={hauteur}></div>
