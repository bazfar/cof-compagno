<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import ListeJoueurs from '../composants/ListeJoueurs.svelte';

  // La battlemap (lot L5.3) est chargée à part : son code et les scènes ne
  // retardent pas l'ouverture du poste.
  const carte = import('../composants/CarteTable.svelte');
  // Dépôt des fiches v1 (L2.2c) : chargé à part, il embarque les données de règles.
  const importV1 = import('../composants/ImportFichesV1.svelte');
  // Groupe et fiches (L2.3) : chargés à part, comme le dépôt des fiches v1.
  const groupe = import('../composants/GroupeMj.svelte');
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
  {#await groupe then module}
    <module.default />
  {:catch e}
    <p role="alert">Groupe indisponible : {String(e)}</p>
  {/await}
  {#await importV1 then module}
    <module.default />
  {:catch e}
    <p role="alert">Dépôt des fiches v1 indisponible : {String(e)}</p>
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
