<script lang="ts">
  import { onDestroy } from 'svelte';
  import { aTraiter } from '../lib/fiche/sorts-hors-combat';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreDemandesSortsMj } from '../lib/magasins/sorts-hors-combat.svelte';
  import { session } from '../lib/session.svelte';
  import DemandeSortMj from './DemandeSortMj.svelte';

  /*
   * Les sorts hors combat demandés par les joueurs (lot G2a, décisions de
   * Thomas du 22/10/2026), dans Prépa social à côté des questions (16a) :
   *   - à traiter : les demandes en attente et les sauvegardes de cible à
   *     lancer (DemandeSortMj) ;
   *   - les derniers sorts traités, repliés.
   * Lot G2b : un sort joint à une action de la scène en cours se traite dans
   * la carte de la scène (SceneMj), pas ici.
   */

  const demandes = suivreDemandesSortsMj(session.table);
  const table = suivreTable(session.table);
  onDestroy(() => {
    demandes.arreter();
    table.arreter();
  });
  const sceneEnCours = $derived(table.etat.donnees?.sceneHorsCombat ?? null);
  const parDate = $derived([...demandes.etat.elements].sort((a, b) => a.creeLe - b.creeLe));
  const aFaire = $derived(parDate.filter((d) => aTraiter(d) && (d.scene === null || d.scene !== sceneEnCours)));
  const traitees = $derived(parDate.filter((d) => !aTraiter(d) && d.statut !== 'acceptee').reverse().slice(0, 10));
  const issue = (d: (typeof parDate)[number]) =>
    d.statut === 'refusee' ? `refusé${d.motif ? ` (${d.motif})` : ''}` : d.statut === 'ratee' ? `raté (d20 : ${d.de})` : d.resistance ? (d.resistance.reussie ? 'lancé, la cible a résisté' : 'lancé, la cible n’a pas résisté') : 'lancé';
</script>

{#if demandes.etat.elements.length}
  <section class="carte sorts" aria-label="Sorts hors combat">
    <h2>Sorts hors combat</h2>
    {#each aFaire as d (d.id)}<DemandeSortMj {d} />{/each}
    {#if !aFaire.length}<p class="aide">Aucun sort en attente.</p>{/if}
    {#if traitees.length}
      <details>
        <summary>Derniers sorts</summary>
        <ul>
          {#each traitees as d (d.id)}<li>{d.nom} · {d.nomSort} {d.palier} · {d.pp} PP{d.scene ? ' · en scène' : ''} · « {d.intention} » : {issue(d)}</li>{/each}
        </ul>
      </details>
    {/if}
  </section>
{/if}

<style>
  .sorts {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    font-size: 20px;
  }
</style>
