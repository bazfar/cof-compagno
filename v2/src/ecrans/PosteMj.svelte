<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import ListeJoueurs from '../composants/ListeJoueurs.svelte';

  // La battlemap (lot L5.3) est chargée à part : son code et les scènes ne
  // retardent pas l'ouverture du poste.
  const carte = import('../composants/CarteTable.svelte');
</script>

<BarreHaut etiquette="Poste MJ" />
<main>
  {#await carte}
    <p>Chargement de la battlemap…</p>
  {:then module}
    <module.default role="mj" />
  {:catch e}
    <p role="alert">Battlemap indisponible : {String(e)}</p>
  {/await}
  <section class="carte">
    <h2>Poste MJ</h2>
    <p>Séances, groupe, combat, bestiaire et loot arrivent avec les lots L3 à L6. Les joueurs qui rejoignent la table apparaissent ici sans rafraîchir.</p>
  </section>
  <ListeJoueurs />
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
</style>
