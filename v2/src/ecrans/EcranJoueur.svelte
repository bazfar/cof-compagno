<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import ListeJoueurs from '../composants/ListeJoueurs.svelte';
  import { session } from '../lib/session.svelte';

  // La battlemap (lot L5.3) est chargée à part, comme côté MJ.
  const carte = import('../composants/CarteTable.svelte');
  // Les personnages aussi (L2.2b) : ils embarquent les données de règles
  // (classes, voies, sorts, objets), trop lourdes pour l'écran d'accueil.
  const personnages = import('../composants/MesPersonnages.svelte');
</script>

<BarreHaut etiquette="Joueur" />
<main>
  <h1>Bienvenue, {session.nom}</h1>
  {#await personnages}
    <p>Chargement de tes personnages…</p>
  {:then module}
    <module.default />
  {:catch e}
    <p role="alert">Personnages indisponibles : {String(e)}</p>
  {/await}
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
