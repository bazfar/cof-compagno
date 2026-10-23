<script lang="ts">
  import BarreHaut from '../composants/BarreHaut.svelte';
  import JournalDes from '../composants/JournalDes.svelte';

  /*
   * Poste MJ (mise en page L2.6, maquette validée le 18/10), en sections
   * dans la barre du haut :
   * - Séance : la carte au centre ; à droite la séance (ouvrir, présents,
   *   clore : L3.1), le butin (vote Besoin / Envie, attribution : L3.4)
   *   et le groupe en cartes compactes (la fiche complète
   *   s'ouvre en panneau latéral) ; le journal en bas ;
   * - Données, en cinq onglets : Bestiaire (L3.2, chargé à la première
   *   visite), Objets (L3.6 : catalogue, ajout au sac, mise au vote),
   *   Fiches v1, Imports (lore et bestiaire de la v1), Joueurs (correctif
   *   du 19/10 : code perso, doublons à retirer) ;
   * - Lore (L2.7b) : fiches, partage, sceaux et édition, chargé à la
   *   première visite seulement.
   * - Prépa combat (L3.5) : rencontres préparées (scène, monstres placés
   *   d'avance, jauge d'équilibrage, butin prévu), chargée à la première
   *   visite seulement.
   * - Prépa social (lot S1) : réputation du groupe et PNJ avec leur
   *   attitude, chargée à la première visite seulement ; en tête, la scène
   *   hors combat (S2). Son arbitre, sans écran, est monté sur tout le
   *   poste : les jets se résolvent même section Séance ouverte.
   *
   * - Combat (lot L6.1, décision 10b) : une section à part. La carte y est
   *   la même que celle de la séance (un seul exemplaire monté, pour que
   *   l'exploration n'ait qu'un écrivain) ; à gauche l'initiative et les
   *   commandes du combat, à droite le combattant qui joue.
   *
   * Changer de section masque les autres sans les démonter : la carte garde
   * ses abonnements, et le client du MJ continue d'enregistrer
   * l'exploration (il en est le seul écrivain, voir CarteTable).
   */

  // Sorts hors combat à traiter (G2a, 16a) : leur nombre suit « Prépa social ».
  let sortsATraiter = $state(0);
  const SECTIONS = $derived([
    { id: 'seance', libelle: 'Séance' },
    { id: 'combat', libelle: 'Combat' },
    { id: 'prepa', libelle: 'Prépa combat' },
    { id: 'social', libelle: sortsATraiter ? `Prépa social (${sortsATraiter})` : 'Prépa social' },
    { id: 'donnees', libelle: 'Données' },
    { id: 'lore', libelle: 'Lore' },
  ]);
  let section = $state('seance');
  // Le lore n'est chargé qu'à la première visite, puis gardé monté.
  let loreOuvert = $state(false);
  $effect(() => {
    if (section === 'lore') loreOuvert = true;
  });
  const lore = $derived(loreOuvert ? import('../composants/LoreMj.svelte') : null);
  // Prépa combat (L3.5), chargée à la première visite, puis gardée montée
  // (un brouillon en cours n'est jamais perdu en changeant de section).
  let prepaOuverte = $state(false);
  $effect(() => {
    if (section === 'prepa') prepaOuverte = true;
  });
  const prepa = $derived(prepaOuverte ? import('../composants/PrepaCombat.svelte') : null);
  // Prépa social (S1), chargée à la première visite, puis gardée montée.
  let socialOuvert = $state(false);
  $effect(() => {
    if (section === 'social') socialOuvert = true;
  });
  const social = $derived(socialOuvert ? import('../composants/PrepaSocial.svelte') : null);

  // La battlemap (lot L5.3) est chargée à part : son code et les scènes ne
  // retardent pas l'ouverture du poste.
  const carte = import('../composants/CarteTable.svelte');
  // Dépôt des fiches v1 (L2.2c) : chargé à part, il embarque les données de règles.
  const importV1 = import('../composants/ImportFichesV1.svelte');
  // Groupe et fiches (L2.3) : chargés à part, comme le dépôt des fiches v1.
  const groupe = import('../composants/GroupeMj.svelte');
  // Séance et présents (L3.1), chargés à part comme le groupe.
  const seance = import('../composants/SeanceMj.svelte');
  // Butin (L3.4), chargé à part : il embarque le catalogue d'objets.
  const butin = import('../composants/ButinMj.svelte');
  // Import du lore v1 (L2.7a) : chargé à part, avec le schéma du lore.
  const importLore = import('../composants/ImportLoreV1.svelte');
  // Import du bestiaire (L3.2), avec son schéma.
  const importBestiaire = import('../composants/ImportBestiaireV1.svelte');
  // Arbitre des scènes hors combat (S2, 5a) : monté quelle que soit la
  // section, il résout les jets dès qu'ils arrivent (le MJ seul lit le DD).
  const arbitre = import('../composants/ArbitreScene.svelte');
  // Compteur des sorts hors combat (G2a, 16a), sans écran, comme l'arbitre.
  const compteurSorts = import('../composants/CompteurSortsMj.svelte');
  // Combat (L6.1), chargé à la première visite, puis gardé monté.
  let combatOuvert = $state(false);
  $effect(() => {
    if (section === 'combat') combatOuvert = true;
  });
  const combatMj = $derived(combatOuvert ? import('../composants/CombatMj.svelte') : null);
  const panneauCombat = $derived(combatOuvert ? import('../composants/PanneauCombat.svelte') : null);
  // Joueurs de la table (correctif du 19/10), chargés à part comme le groupe.
  const joueursMj = import('../composants/JoueursMj.svelte');

  // Données : onglets (L3.2). Le bestiaire n'est chargé (et lu en base)
  // qu'à la première visite de son onglet, puis gardé monté.
  const ONGLETS_DONNEES = [
    { id: 'bestiaire', libelle: 'Bestiaire' },
    { id: 'objets', libelle: 'Objets' },
    { id: 'fiches', libelle: 'Fiches v1' },
    { id: 'imports', libelle: 'Imports' },
    { id: 'joueurs', libelle: 'Joueurs' },
  ];
  let ongletDonnees = $state('bestiaire');
  let bestiaireOuvert = $state(false);
  $effect(() => {
    if (section === 'donnees' && ongletDonnees === 'bestiaire') bestiaireOuvert = true;
  });
  const bestiaire = $derived(bestiaireOuvert ? import('../composants/BestiaireMj.svelte') : null);
  // Catalogue d'objets (L3.6), chargé à la première visite de son onglet.
  let objetsOuvert = $state(false);
  $effect(() => {
    if (section === 'donnees' && ongletDonnees === 'objets') objetsOuvert = true;
  });
  const objetsMj = $derived(objetsOuvert ? import('../composants/ObjetsMj.svelte') : null);
</script>

<BarreHaut etiquette="Poste MJ" sections={SECTIONS} active={section} surSection={(id) => (section = id)} />
{#await compteurSorts then module}
  <module.default surNombre={(n: number) => (sortsATraiter = n)} />
{/await}
{#await arbitre then module}
  <module.default />
{:catch e}
  <p role="alert">Arbitre des scènes indisponible : {String(e)}</p>
{/await}
<main>
  <div hidden={section !== 'seance' && section !== 'combat'}>
    <div class="seance" class:en-combat={section === 'combat'}>
      <div class="gauche" hidden={section !== 'combat'}>
        {#if combatMj}
          {#await combatMj then module}
            <module.default />
          {:catch e}
            <p role="alert">Combat indisponible : {String(e)}</p>
          {/await}
        {/if}
      </div>
      <div class="centre">
        {#await carte}
          <p>Chargement de la battlemap…</p>
        {:then module}
          <module.default role="mj" />
        {:catch e}
          <p role="alert">Battlemap indisponible : {String(e)}</p>
        {/await}
      </div>
      <aside class="cote" aria-label="Combattant" hidden={section !== 'combat'}>
        {#if panneauCombat}
          {#await panneauCombat then module}
            <module.default />
          {/await}
        {/if}
      </aside>
      <aside class="cote" aria-label="Groupe et progression" hidden={section !== 'seance'}>
        {#await seance then module}
          <module.default />
        {:catch e}
          <p role="alert">Séance indisponible : {String(e)}</p>
        {/await}
        {#await butin then module}
          <module.default />
        {:catch e}
          <p role="alert">Butin indisponible : {String(e)}</p>
        {/await}
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
  <div hidden={section !== 'prepa'}>
    {#if prepa}
      {#await prepa}
        <p>Chargement de la prépa combat…</p>
      {:then module}
        <module.default />
      {:catch e}
        <p role="alert">Prépa combat indisponible : {String(e)}</p>
      {/await}
    {/if}
  </div>
  <div hidden={section !== 'social'}>
    {#if social}
      {#await social}
        <p>Chargement de la prépa social…</p>
      {:then module}
        <module.default />
      {:catch e}
        <p role="alert">Prépa social indisponible : {String(e)}</p>
      {/await}
    {/if}
  </div>
  <div hidden={section !== 'donnees'}>
    <div class="onglets-donnees" role="tablist" aria-label="Données">
      {#each ONGLETS_DONNEES as o (o.id)}
        <button role="tab" aria-selected={ongletDonnees === o.id} onclick={() => (ongletDonnees = o.id)}>{o.libelle}</button>
      {/each}
    </div>
    <div hidden={ongletDonnees !== 'bestiaire'}>
      {#if bestiaire}
        {#await bestiaire}
          <p>Chargement du bestiaire…</p>
        {:then module}
          <module.default />
        {:catch e}
          <p role="alert">Bestiaire indisponible : {String(e)}</p>
        {/await}
      {/if}
    </div>
    <div hidden={ongletDonnees !== 'objets'}>
      {#if objetsMj}
        {#await objetsMj}
          <p>Chargement du catalogue…</p>
        {:then module}
          <module.default />
        {:catch e}
          <p role="alert">Objets indisponibles : {String(e)}</p>
        {/await}
      {/if}
    </div>
    <div hidden={ongletDonnees !== 'fiches'}>
      <div class="donnees">
        {#await importV1 then module}
          <module.default />
        {:catch e}
          <p role="alert">Dépôt des fiches v1 indisponible : {String(e)}</p>
        {/await}
      </div>
    </div>
    <div hidden={ongletDonnees !== 'imports'}>
      <div class="donnees">
        {#await importLore then module}
          <module.default />
        {:catch e}
          <p role="alert">Import du lore indisponible : {String(e)}</p>
        {/await}
        {#await importBestiaire then module}
          <module.default />
        {:catch e}
          <p role="alert">Import du bestiaire indisponible : {String(e)}</p>
        {/await}
      </div>
    </div>
    <div hidden={ongletDonnees !== 'joueurs'}>
      <div class="donnees">
        {#await joueursMj then module}
          <module.default />
        {:catch e}
          <p role="alert">Joueurs indisponibles : {String(e)}</p>
        {/await}
      </div>
    </div>
  </div>
  <div hidden={section !== 'lore'}>
    {#if lore}
      {#await lore}
        <p>Chargement du lore…</p>
      {:then module}
        <module.default />
      {:catch e}
        <p role="alert">Lore indisponible : {String(e)}</p>
      {/await}
    {/if}
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
  .seance.en-combat {
    grid-template-columns: 260px minmax(0, 1fr) 320px;
  }
  .seance [hidden] {
    display: none;
  }
  .gauche,
  .centre,
  .cote {
    min-width: 0;
  }
  .cote {
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
  .bas {
    grid-column: 1 / -1;
  }
  .onglets-donnees {
    display: flex;
    gap: 4px;
    margin-bottom: 16px;
    border-bottom: 2px solid var(--couleur-bordure);
  }
  .onglets-donnees button {
    min-height: 40px;
    margin-bottom: -2px;
    border-radius: var(--rayon) var(--rayon) 0 0;
    background: transparent;
    color: var(--couleur-encre-douce);
    border-bottom: 2px solid transparent;
  }
  .onglets-donnees button[aria-selected='true'] {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border-bottom-color: var(--couleur-accent);
  }
  .donnees {
    max-width: 1100px;
    display: flex;
    flex-direction: column;
    gap: 20px;
  }
  @media (max-width: 1100px) {
    .seance,
    .seance.en-combat {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
