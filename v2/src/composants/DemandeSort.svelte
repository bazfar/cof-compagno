<script lang="ts">
  import { demanderSort, RefusSort } from '../lib/actions/sorts-hors-combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { ppDisponibles, type SortLancable } from '../lib/fiche/sorts-hors-combat';
  import { dejaUtiliseCetteSeance } from '../lib/scenes/vecu-en-scene';
  import type { Palier } from '../lib/schemas/effets';
  import type { FicheV2 } from '../lib/schemas/fiche';

  /*
   * Demander au MJ de lancer un sort hors combat (lot G2a, décisions de
   * Thomas du 22/10/2026) : le palier, au plus celui atteint (2b : plus bas
   * coûte moins et ouvre moins), et une ligne d'intention (1a). Le MJ
   * accepte ou refuse (5b) ; rien n'est payé avant.
   */

  let { fiche, sort, seance }: { fiche: FicheV2 & { id: string }; sort: SortLancable; seance: string | undefined } = $props();

  let palierChoisi = $state<Palier | null>(null);
  const palier = $derived(sort.paliers.find((p) => p.palier === palierChoisi) ?? sort.paliers[sort.paliers.length - 1]!);
  let intention = $state('');
  let message = $state('');
  let envoye = $state(false);
  let occupe = $state(false);
  const dispo = $derived(ppDisponibles(fiche));
  const deja = $derived(sort.unParSeance && dejaUtiliseCetteSeance(fiche.usages as Record<string, unknown>, sort.id, seance));

  async function demander() {
    message = '';
    occupe = true;
    try {
      await demanderSort(fiche, sort.id, palier.palier, intention, seance);
      intention = '';
      envoye = true;
    } catch (e) {
      message = e instanceof RefusSort ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
</script>

<form class="demande" aria-label="Lancer {sort.nom} hors combat" onsubmit={(e) => (e.preventDefault(), demander())}>
  {#if sort.paliers.length > 1}
    <label
      >Palier
      <select value={palier.palier} onchange={(e) => ((palierChoisi = e.currentTarget.value as Palier), (envoye = false))}>
        {#each sort.paliers as p (p.palier)}<option value={p.palier}>{p.palier} · {p.pp} PP</option>{/each}
      </select>
    </label>
  {/if}
  <p class="aide">
    {palier.pp} PP au palier {palier.palier}{sort.echec ? `, échec sur 1 à ${sort.echec} au d20` : ''}{palier.sauvegarde ? `, sauvegarde de la cible (DD ${palier.dd})` : ''}.{sort.unParSeance ? ' Une fois par séance.' : ''}
  </p>
  <label>Ce que tu veux faire <input maxlength="120" placeholder="Imiter la voix du sergent…" bind:value={intention} oninput={() => (envoye = false)} /></label>
  {#if deja}
    <p class="aide">Déjà lancé cette séance.</p>
  {:else if palier.pp > dispo}
    <p class="aide">Il te faut {palier.pp} PP (tu en as {dispo}).</p>
  {/if}
  <button disabled={occupe || deja || palier.pp > dispo || !intention.trim()}>Demander au MJ</button>
  {#if envoye}<p class="aide" role="status">Demande envoyée au MJ.</p>{/if}
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</form>

<style>
  .demande {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 8px;
    padding-top: 8px;
    border-top: 1px solid var(--couleur-bordure-douce);
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 14px;
  }
  button {
    align-self: flex-start;
  }
</style>
