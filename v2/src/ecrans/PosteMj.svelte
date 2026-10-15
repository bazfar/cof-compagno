<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import ListeJoueurs from '../composants/ListeJoueurs.svelte';

  // L'atelier battlemap (L5.2) est chargé à la demande : son code et les
  // scènes ne pèsent rien tant qu'on ne l'ouvre pas.
  let atelierOuvert = $state(false);
</script>

<BarreHaut etiquette="Poste MJ" />
<main>
  <section class="carte">
    <h1>Poste MJ</h1>
    <p>Séances, groupe, combat, bestiaire et loot arrivent avec les lots L3 à L6. Les joueurs qui rejoignent la table apparaissent ici sans rafraîchir.</p>
  </section>
  <ListeJoueurs />
  {#if atelierOuvert}
    {#await import('../composants/AtelierBattlemap.svelte')}
      <p>Chargement de l'atelier…</p>
    {:then module}
      <module.default />
    {:catch e}
      <p role="alert">Atelier indisponible : {String(e)}</p>
    {/await}
  {:else}
    <button class="ouvrir" onclick={() => (atelierOuvert = true)}>Ouvrir l'atelier battlemap</button>
  {/if}
</main>

<style>
  main {
    max-width: 1400px;
    margin: 0 auto;
    padding: 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  .ouvrir {
    align-self: flex-start;
  }
</style>
