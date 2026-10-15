<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import ListeJoueurs from '../composants/ListeJoueurs.svelte';
  import { session } from '../lib/session.svelte';

  // La battlemap (lot L5.3) est chargée à part, comme côté MJ.
  const carte = import('../composants/CarteTable.svelte');
</script>

<BarreHaut etiquette="Joueur" />
<main>
  <section class="carte">
    <h1>Bienvenue, {session.nom}</h1>
    <p>Ta fiche arrive avec le lot L2. La carte ci-dessous est celle que le MJ montre à la table.</p>
  </section>
  {#await carte}
    <p>Chargement de la battlemap…</p>
  {:then module}
    <module.default role="joueur" />
  {:catch e}
    <p role="alert">Battlemap indisponible : {String(e)}</p>
  {/await}
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
