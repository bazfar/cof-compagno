<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { lancerJetRepos, RefusRepos } from '../lib/actions/repos';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreReposEnAttente } from '../lib/magasins/repos.svelte';
  import { session } from '../lib/session.svelte';

  /*
   * Le jet de repos du joueur (lot L7.1a, décision 4b du 29/10/2026) : le
   * MJ a lancé un repos ; chaque joueur lance lui-même son jet de PV, pour
   * chacun de ses personnages qui en attend un. Rien quand rien n'attend.
   */

  const persos = suivrePersos(session.table);
  const attentes = suivreReposEnAttente(session.table);
  onDestroy(() => {
    persos.arreter();
    attentes.arreter();
  });
  const miens = $derived(new Set(persos.etat.elements.filter((p) => p.proprietaireUid === session.uid).map((p) => p.id)));
  const aLancer = $derived(attentes.etat.elements.filter((a) => miens.has(a.id)));

  let message = $state('');
  let occupe = $state(false);
  async function lancer(id: string, nom: string) {
    message = '';
    occupe = true;
    try {
      const r = await lancerJetRepos(id);
      message = `${nom} récupère ${r.total} PV : ${r.pv} PV.`;
    } catch (e) {
      message = e instanceof RefusRepos ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
</script>

{#if aLancer.length || message}
  <section class="carte repos" aria-label="Repos en attente">
    <h2>Repos</h2>
    {#each aLancer as a (a.id)}
      <button disabled={occupe} onclick={() => lancer(a.id, a.nom)}>Lancer le jet de repos {a.quoi} de {a.nom} ({a.formule})</button>
    {/each}
    {#if message}<p class="aide" role="status">{message}</p>{/if}
  </section>
{/if}

<style>
  .repos {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 16px;
  }
  h2 {
    font-size: 20px;
    margin: 0;
  }
  .aide {
    margin: 0;
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
</style>
