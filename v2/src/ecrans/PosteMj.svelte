<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import JournalDes from '../composants/JournalDes.svelte';

  /*
   * Poste MJ (mise en page L2.6, maquette validée le 18/10), en sections
   * dans la barre du haut :
   * - Séance : la carte au centre, le groupe en cartes compactes à droite
   *   (la fiche complète s'ouvre en panneau latéral), le journal en bas ;
   * - Données : fiches v1 et lore de la v1 (L2.7a) ; bestiaire et objets en L3.
   * Prépa combat (L3), Lore (L2.7) et Prépa social (2.1) s'ajouteront à
   * SECTIONS avec leur lot, pas avant : pas d'onglet vide.
   *
   * Changer de section masque les autres sans les démonter : la carte garde
   * ses abonnements, et le client du MJ continue d'enregistrer
   * l'exploration (il en est le seul écrivain, voir CarteTable).
   */

  const SECTIONS = [
    { id: 'seance', libelle: 'Séance' },
    { id: 'donnees', libelle: 'Données' },
  ];
  let section = $state('seance');

  // La battlemap (lot L5.3) est chargée à part : son code et les scènes ne
  // retardent pas l'ouverture du poste.
  const carte = import('../composants/CarteTable.svelte');
  // Dépôt des fiches v1 (L2.2c) : chargé à part, il embarque les données de règles.
  const importV1 = import('../composants/ImportFichesV1.svelte');
  // Groupe et fiches (L2.3) : chargés à part, comme le dépôt des fiches v1.
  const groupe = import('../composants/GroupeMj.svelte');
  // Import du lore v1 (L2.7a) : chargé à part, avec le schéma du lore.
  const importLore = import('../composants/ImportLoreV1.svelte');
</script>

<BarreHaut etiquette="Poste MJ" sections={SECTIONS} active={section} surSection={(id) => (section = id)} />
<main>
  <div hidden={section !== 'seance'}>
    <div class="seance">
      <div class="centre">
        {#await carte}
          <p>Chargement de la battlemap…</p>
        {:then module}
          <module.default role="mj" />
        {:catch e}
          <p role="alert">Battlemap indisponible : {String(e)}</p>
        {/await}
      </div>
      <aside class="cote" aria-label="Groupe et progression">
        {#await groupe then module}
          <module.default />
        {:catch e}
          <p role="alert">Groupe indisponible : {String(e)}</p>
        {/await}
      </aside>
      <div class="bas">
        <JournalDes compact />
      </div>
    </div>
  </div>
  <div hidden={section !== 'donnees'}>
    <div class="donnees">
      {#await importV1 then module}
        <module.default />
      {:catch e}
        <p role="alert">Dépôt des fiches v1 indisponible : {String(e)}</p>
      {/await}
      {#await importLore then module}
        <module.default />
      {:catch e}
        <p role="alert">Import du lore indisponible : {String(e)}</p>
      {/await}
    </div>
  </div>
</main>

<style>
  main {
    max-width: 1800px;
    margin: 0 auto;
    padding: 20px 32px;
  }
  .seance {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 340px;
    gap: 20px;
    align-items: start;
  }
  .centre,
  .cote {
    min-width: 0;
  }
  .bas {
    grid-column: 1 / -1;
  }
  .donnees {
    max-width: 1100px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  @media (max-width: 1100px) {
    .seance {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
