<script lang="ts">
  import { session } from '../lib/session.svelte';

  let { etiquette }: { etiquette: string } = $props();
</script>

<header>
  <span class="logo">cof-compagno</span>
  <span class="etiquette">{etiquette}</span>
  <span class="espace"></span>
  <span class="qui">{session.nom} · table {session.table}</span>
</header>

<style>
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 16px;
    padding: 12px 32px;
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
  .espace {
    flex: 1 1 auto;
  }
  .qui {
    font-size: 14px;
  }
</style>
