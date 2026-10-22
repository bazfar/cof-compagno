<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import JournalDes from '../composants/JournalDes.svelte';
  import ProtegerJoueur from '../composants/ProtegerJoueur.svelte';

  /*
   * Écran joueur (mise en page L2.6, maquette validée le 18/10) : deux
   * colonnes. À gauche, ce qui prime : les personnages et la fiche vivante.
   * À droite, une carte réduite, le butin au vote (L3.4) et le journal de
   * dés compact, toujours visibles. Les joueurs de la table sont dans la barre du haut.
   *
   * Section Lore (L2.7b) : le lore que le MJ a partagé, avec le nombre de
   * fiches nouvelles dans la barre du haut. Changer de section masque
   * l'autre sans la démonter : une saisie en cours dans la fiche n'est
   * jamais perdue, et la marque « nouveau » se met à jour même section
   * Personnage ouverte.
   *
   * Scène hors combat (lot S2, décision 3a) : pendant une scène, sa carte
   * s'ouvre en haut de la colonne de droite ; dans les autres sections, en
   * haut de la page. Les appelés y agissent.
   *
   * Section Relations (lot S1) : la réputation du groupe et les PNJ
   * rencontrés, avec leur attitude.
   *
   * Code perso (correctif du 19/10) : un joueur inscrit avant le correctif
   * est invité, en tête de colonne, à choisir un code pour se retrouver sur
   * un autre appareil.
   *
   * En combat (L6), la fiche se repliera et la barre d'actions de la v1
   * prendra place sous la carte, agrandie.
   */

  // La battlemap (lot L5.3) est chargée à part, comme côté MJ.
  const carte = import('../composants/CarteTable.svelte');
  // Les personnages aussi (L2.2b) : ils embarquent les données de règles
  // (classes, voies, sorts, objets), trop lourdes pour l'écran d'accueil.
  const personnages = import('../composants/MesPersonnages.svelte');
  // Le butin (L3.4), chargé à part : il embarque le catalogue d'objets.
  const butin = import('../composants/ButinJoueur.svelte');
  // Le lore (L2.7b), chargé à part lui aussi.
  const lore = import('../composants/LoreJoueur.svelte');
  // La scène hors combat (S2), chargée à part : elle lit la fiche pour les bonus.
  const scene = import('../composants/SceneJoueur.svelte');
  // Les relations (S1), chargées à la première visite seulement.
  let relationsOuvertes = $state(false);

  let section = $state('perso');
  let nouvelles = $state(0);
  const sections = $derived([
    { id: 'perso', libelle: 'Personnage' },
    { id: 'lore', libelle: 'Lore', badge: nouvelles },
    { id: 'relations', libelle: 'Relations' },
  ]);
  $effect(() => {
    if (section === 'relations') relationsOuvertes = true;
  });
  const relations = $derived(relationsOuvertes ? import('../composants/RelationsJoueur.svelte') : null);
</script>

<BarreHaut etiquette="Joueur" {sections} active={section} surSection={(id) => (section = id)} />
<main>
  {#if section !== 'perso'}
    <div class="scene-haut">
      {#await scene then module}
        <module.default />
      {/await}
    </div>
  {/if}
  <div hidden={section !== 'perso'}>
    <div class="personnage">
      <div class="fiche">
        <ProtegerJoueur />
        {#await personnages}
          <p>Chargement de tes personnages…</p>
        {:then module}
          <module.default />
        {:catch e}
          <p role="alert">Personnages indisponibles : {String(e)}</p>
        {/await}
      </div>
      <aside class="table" aria-label="Table">
        {#if section === 'perso'}
          {#await scene then module}
            <module.default />
          {/await}
        {/if}
        {#await carte}
          <p>Chargement de la battlemap…</p>
        {:then module}
          <module.default role="joueur" hauteur="340px" />
        {:catch e}
          <p role="alert">Battlemap indisponible : {String(e)}</p>
        {/await}
        {#await butin then module}
          <module.default />
        {:catch e}
          <p role="alert">Butin indisponible : {String(e)}</p>
        {/await}
        <JournalDes compact />
      </aside>
    </div>
  </div>
  <div hidden={section !== 'lore'}>
    {#await lore then module}
      <module.default surNouveautes={(n: number) => (nouvelles = n)} />
    {:catch e}
      <p role="alert">Lore indisponible : {String(e)}</p>
    {/await}
  </div>
  <div hidden={section !== 'relations'}>
    {#if relations}
      {#await relations then module}
        <module.default />
      {:catch e}
        <p role="alert">Relations indisponibles : {String(e)}</p>
      {/await}
    {/if}
  </div>
</main>

<style>
  main {
    max-width: 1680px;
    margin: 0 auto;
    padding: 20px 32px;
  }
  .personnage {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 420px;
    gap: 20px;
    align-items: start;
  }
  .scene-haut {
    max-width: 640px;
    margin-bottom: 16px;
  }
  .scene-haut:empty {
    display: none;
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
    .personnage {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
