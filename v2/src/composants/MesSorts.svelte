<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { lancerSort, RefusSort } from '../lib/actions/sorts-hors-combat';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreMesDemandesSorts } from '../lib/magasins/sorts-hors-combat.svelte';
  import type { DemandeSort } from '../lib/schemas/sort-hors-combat';
  import { session } from '../lib/session.svelte';

  /*
   * Les sorts hors combat demandés par le joueur (lot G2a) : en attente,
   * refusés (avec le motif), acceptés à lancer (15b : le joueur paie et lance
   * le jet d'échec), lancés ou ratés, et ce que la sauvegarde de la cible a
   * donné (14b). Un sort joint à une action de scène (G2b) se lance depuis
   * la carte de scène, de lui-même (4b).
   */

  let { perso, seance }: { perso: string; seance: string | undefined } = $props();

  const demandes = suivreMesDemandesSorts(session.table, session.uid);
  onDestroy(() => demandes.arreter());
  // L6.7b (6a) : ses PP vont au Remous de la scène active.
  const table = suivreTable(session.table);
  onDestroy(() => table.arreter());
  const miennes = $derived(
    demandes.etat.elements
      .filter((d) => d.perso === perso)
      .sort((a, b) => b.creeLe - a.creeLe)
      .slice(0, 8),
  );

  let message = $state('');
  let occupe = $state(false);
  async function lancer(id: string) {
    message = '';
    occupe = true;
    try {
      await lancerSort(id, seance, undefined, table.etat.donnees?.sceneActive ?? null);
    } catch (e) {
      message = e instanceof RefusSort ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }

  function etat(d: DemandeSort): string {
    const motif = d.motif ? ` : ${d.motif}` : '';
    switch (d.statut) {
      case 'attente':
        return 'En attente du MJ.';
      case 'refusee':
        return `Refusé${motif}.`;
      case 'acceptee':
        return `Accepté${motif}.`;
      case 'ratee':
        return `Raté (d20 : ${d.de}) : les PP sont dépensés.`;
      case 'lancee': {
        const de = d.de !== null ? ` (d20 : ${d.de})` : '';
        const cible = d.sauvegarde === null ? '' : d.resistance === null ? ' Sauvegarde de la cible : au MJ.' : d.resistance.reussie ? ' La cible a résisté.' : ' La cible n’a pas résisté.';
        return `Lancé${de}.${cible}`;
      }
    }
  }
</script>

{#if miennes.length}
  <section class="carte mes-sorts" aria-label="Mes sorts hors combat">
    <h3>Mes sorts hors combat</h3>
    <ul>
      {#each miennes as d (d.id)}
        <li class:attente={d.statut === 'attente' || d.statut === 'acceptee'}>
          <strong>{d.nomSort} {d.palier}</strong> · {d.pp} PP{d.scene ? ' · en scène' : ''} · « {d.intention} »
          <span class="aide">{etat(d)}</span>
          {#if d.statut === 'acceptee'}
            {#if d.scene}<span class="aide">Ta carte de scène le lance.</span>{:else}<button class="petit" disabled={occupe} onclick={() => lancer(d.id)}>Lancer (−{d.pp} PP)</button>{/if}
          {/if}
        </li>
      {/each}
    </ul>
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </section>
{/if}

<style>
  .mes-sorts {
    padding: 12px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  h3 {
    font-size: 16px;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .attente {
    font-weight: 500;
  }
  li .aide {
    display: block;
  }
  li button {
    margin-top: 4px;
  }
</style>
