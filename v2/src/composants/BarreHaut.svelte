<script lang="ts">
  import { onDestroy } from 'svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { session } from '../lib/session.svelte';
  import ListeJoueurs from './ListeJoueurs.svelte';

  /*
   * Barre du haut. Depuis L2.6, elle porte aussi les sections de l'écran
   * (poste MJ : Séance, Données, Lore ; Prépa combat en L3, Prépa social en
   * 2.1 ; joueur : Personnage, Lore) et les joueurs de la table, qui ne
   * prennent plus un bloc en bas de page. `badge` (L2.7b) : un compte à
   * côté d'une section (fiches de lore nouvelles).
   *
   * Séance (L3.1) : « Séance N » quand le MJ en a ouvert une, des deux côtés.
   */

  type Section = { id: string; libelle: string; badge?: number };
  let {
    etiquette,
    sections = [],
    active = '',
    surSection = () => {},
  }: { etiquette: string; sections?: Section[]; active?: string; surSection?: (id: string) => void } = $props();

  const table = suivreTable(session.table);
  onDestroy(table.arreter);
  const seance = $derived(table.etat.donnees?.seanceOuverte ?? null);
</script>

<header>
  <span class="logo">cof-compagno</span>
  <span class="etiquette">{etiquette}</span>
  {#if sections.length > 1}
    <nav aria-label="Sections">
      {#each sections as s (s.id)}
        <button aria-current={active === s.id ? 'page' : undefined} onclick={() => surSection(s.id)}>
          {s.libelle}{#if s.badge}<span class="badge" aria-label={`${s.badge} nouveau${s.badge > 1 ? 'x' : ''}`}>{s.badge}</span>{/if}
        </button>
      {/each}
    </nav>
  {/if}
  <span class="espace"></span>
  {#if seance}<span class="seance" role="status">Séance {seance.numero}</span>{/if}
  <ListeJoueurs />
  <span class="qui">{session.nom} · table {session.table}</span>
</header>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px 16px;
    padding: 10px 32px;
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .logo {
    font-family: var(--police-titre);
    font-size: 22px;
    font-weight: 700;
  }
  .etiquette {
    padding: 4px 12px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-accent-clair);
    font-size: 13px;
  }
  nav {
    display: flex;
    gap: 4px;
    margin-left: 8px;
  }
  nav button {
    min-height: 38px;
    background: transparent;
    color: var(--couleur-sur-accent);
    font-weight: 400;
    opacity: 0.85;
  }
  nav button[aria-current='page'] {
    background: var(--couleur-accent-clair);
    font-weight: 600;
    opacity: 1;
  }
  .badge {
    margin-left: 6px;
    padding: 0 7px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-or);
    color: var(--couleur-encre);
    font-size: 12px;
    font-weight: 700;
  }
  .seance {
    padding: 3px 12px;
    border-radius: var(--rayon-pastille);
    border: 1px solid var(--couleur-or);
    color: var(--couleur-sur-accent);
    font-size: 13px;
    font-weight: 600;
  }
  .espace {
    flex: 1 1 auto;
  }
  .qui {
    font-size: 14px;
  }
</style>
