<script lang="ts">
  import { tableDepuisUrl } from './lib/table';

  const table = tableDepuisUrl(window.location.href);
</script>

<main>
  <section class="carte">
    <h1>cof-compagno 2.0</h1>
    <p>Socle en place. Table : <strong>{table}</strong>.</p>
    <p>La connexion à Firebase arrive avec le prompt suivant du lot L0.</p>
  </section>
</main>

<style>
  main {
    max-width: 640px;
    margin: 96px auto;
    padding: 0 16px;
  }
  h1 {
    font-size: 30px;
    margin-bottom: 8px;
  }
</style>
