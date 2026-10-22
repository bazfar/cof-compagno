<script lang="ts">
  import { onDestroy } from 'svelte';
  import { aTraiter } from '../lib/fiche/sorts-hors-combat';
  import { suivreDemandesSortsMj } from '../lib/magasins/sorts-hors-combat.svelte';
  import { session } from '../lib/session.svelte';

  /*
   * Compteur des sorts hors combat qui attendent le MJ (lot G2a, 16a), sans
   * écran : monté sur tout le poste, il donne son nombre à l'onglet
   * « Prépa social ».
   */

  let { surNombre }: { surNombre: (n: number) => void } = $props();
  const demandes = suivreDemandesSortsMj(session.table);
  onDestroy(() => demandes.arreter());
  const n = $derived(demandes.etat.elements.filter(aTraiter).length);
  $effect(() => surNombre(n));
</script>
