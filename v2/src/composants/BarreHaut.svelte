<script lang="ts">
  import { session } from '../lib/session.svelte';
  import ListeJoueurs from './ListeJoueurs.svelte';

  /*
   * Barre du haut. Depuis L2.6, elle porte aussi les sections de l'écran
   * (poste MJ : Séance, Données ; Prépa combat en L3, Lore en L2.7, Prépa
   * social en 2.1) et les joueurs de la table, qui ne prennent plus un
   * bloc en bas de page.
   */

  type Section = { id: string; libelle: string };
  let {
    etiquette,
    sections = [],
    active = '',
    surSection = () => {},
  }: { etiquette: string; sections?: Section[]; active?: string; surSection?: (id: string) => void } = $props();
</script>

<header>
  <span class="logo">cof-compagno</span>
  <span class="etiquette">{etiquette}</span>
  {#if sections.length > 1}
    <nav aria-label="Sections">
      {#each sections as s (s.id)}
        <button aria-current={active === s.id ? 'page' : undefined} onclick={() => surSection(s.id)}>{s.libelle}</button>
      {/each}
    </nav>
  {/if}
  <span class="espace"></span>
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
  .espace {
    flex: 1 1 auto;
  }
  .qui {
    font-size: 14px;
  }
</style>
