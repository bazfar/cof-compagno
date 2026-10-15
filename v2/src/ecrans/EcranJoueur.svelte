<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import ListeJoueurs from '../composants/ListeJoueurs.svelte';
  import { session } from '../lib/session.svelte';
</script>

<BarreHaut etiquette="Joueur" />
<main>
  <section class="carte">
    <h1>Bienvenue, {session.nom}</h1>
    <p>Ta fiche arrive avec le lot L2. En attendant, la table se remplit en direct ci-dessous.</p>
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
