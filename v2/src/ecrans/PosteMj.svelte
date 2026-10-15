<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import ListeJoueurs from '../composants/ListeJoueurs.svelte';
</script>

<BarreHaut etiquette="Poste MJ" />
<main>
  <section class="carte">
    <h1>Poste MJ</h1>
    <p>Séances, groupe, combat, bestiaire et loot arrivent avec les lots L3 à L6. Les joueurs qui rejoignent la table apparaissent ici sans rafraîchir.</p>
  </section>
  <ListeJoueurs />
</main>

<style>
  main {
    max-width: 960px;
    margin: 0 auto;
    padding: 24px 32px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
</style>
