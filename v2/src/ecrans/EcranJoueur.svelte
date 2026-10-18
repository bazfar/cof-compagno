<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import JournalDes from '../composants/JournalDes.svelte';

  /*
   * Écran joueur (mise en page L2.6, maquette validée le 18/10) : deux
   * colonnes. À gauche, ce qui prime : les personnages et la fiche vivante.
   * À droite, une carte réduite et le journal de dés compact, toujours
   * visibles. Les joueurs de la table sont dans la barre du haut.
   *
   * En combat (L6), la fiche se repliera et la barre d'actions de la v1
   * prendra place sous la carte, agrandie. Le Lore partagé (L2.7) ajoutera
   * une section à la barre du haut.
   */

  // La battlemap (lot L5.3) est chargée à part, comme côté MJ.
  const carte = import('../composants/CarteTable.svelte');
  // Les personnages aussi (L2.2b) : ils embarquent les données de règles
  // (classes, voies, sorts, objets), trop lourdes pour l'écran d'accueil.
  const personnages = import('../composants/MesPersonnages.svelte');
</script>

<BarreHaut etiquette="Joueur" />
<main>
  <div class="fiche">
    {#await personnages}
      <p>Chargement de tes personnages…</p>
    {:then module}
      <module.default />
    {:catch e}
      <p role="alert">Personnages indisponibles : {String(e)}</p>
    {/await}
  </div>
  <aside class="table" aria-label="Table">
    {#await carte}
      <p>Chargement de la battlemap…</p>
    {:then module}
      <module.default role="joueur" hauteur="340px" />
    {:catch e}
      <p role="alert">Battlemap indisponible : {String(e)}</p>
    {/await}
    <JournalDes compact />
  </aside>
</main>

<style>
  main {
    max-width: 1680px;
    margin: 0 auto;
    padding: 20px 32px;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 420px;
    gap: 20px;
    align-items: start;
  }
  .fiche,
  .table {
    display: flex;
    flex-direction: column;
    gap: 16px;
    min-width: 0;
  }
  /* PC seulement (décision du 18/10) : en dessous, tout passe sur une colonne, sans autre effort. */
  @media (max-width: 1100px) {
    main {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
