<script lang="ts">
  import { messageErreurJournal } from '../lib/actions/journal';
  import { RefusSort, repondreDemandeSort, resisterSort } from '../lib/actions/sorts-hors-combat';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import { BONUS_PALIER, type DemandeSort } from '../lib/schemas/sort-hors-combat';

  /*
   * Une demande de sort, côté MJ (lots G2a et G2b) :
   *   - en attente : l'intention, ce qu'ouvrent les paliers (7), le coût, le
   *     risque d'échec, la sauvegarde ; accepter ou refuser, avec un motif
   *     (5b). En scène, le MJ fixe aussi le bonus au jet, de 0 à celui du
   *     palier (13a) ; un refus défait l'action, que le joueur rejoue (2b) ;
   *   - lancée, avec une sauvegarde : le MJ lance celle de la cible, avec le
   *     bonus qu'il lui donne (14b).
   */

  let { d }: { d: AvecId<DemandeSort> } = $props();

  const NOMS_SAUVEGARDES = { FOR: 'FOR', DEX: 'DEX', CON: 'CON', Volonte: 'Volonté' } as const;
  const maxBonus = $derived(BONUS_PALIER[d.palier]);
  let motif = $state('');
  let bonusJet = $state<number | null>(null);
  let bonusCible = $state(0);
  let message = $state('');
  let occupe = $state(false);

  async function agir(f: () => Promise<unknown>) {
    message = '';
    occupe = true;
    try {
      await f();
    } catch (e) {
      message = e instanceof RefusSort ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
</script>

{#if d.statut === 'attente'}
  <article class="demande" aria-label="Demande de {d.nom}">
    <p>
      <strong>{d.nom}</strong> veut lancer <strong>{d.nomSort} {d.palier}</strong>{d.scene ? ' pour appuyer son jet' : ''} : « {d.intention} »
    </p>
    <ol class="textes">
      {#each d.textes as t, i (i)}<li>{t}</li>{/each}
    </ol>
    <p class="aide">
      {d.pp} PP{d.echec ? ` · échec sur 1 à ${d.echec} au d20` : ''}{d.sauvegarde ? ` · sauvegarde de ${NOMS_SAUVEGARDES[d.sauvegarde]}, DD ${d.dd}` : ''}
    </p>
    <div class="ligne">
      <input aria-label="Motif pour {d.nom}" placeholder="Motif (facultatif)" maxlength="120" bind:value={motif} />
      {#if d.scene}
        <label
          >Bonus au jet
          <select value={bonusJet ?? maxBonus} onchange={(e) => (bonusJet = Number(e.currentTarget.value))}>
            {#each Array.from({ length: maxBonus + 1 }, (_, i) => maxBonus - i) as b (b)}<option value={b}>+{b}</option>{/each}
          </select>
        </label>
      {/if}
      <button disabled={occupe} onclick={() => agir(() => repondreDemandeSort(d, true, motif, d.scene ? (bonusJet ?? maxBonus) : 0))}>Accepter</button>
      <button class="discret" disabled={occupe} onclick={() => agir(() => repondreDemandeSort(d, false, motif))}>{d.scene ? 'Refuser (il rejoue son tour)' : 'Refuser'}</button>
    </div>
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </article>
{:else if d.statut === 'lancee' && d.sauvegarde !== null && d.resistance === null}
  <article class="demande" aria-label="Sauvegarde contre {d.nomSort}">
    <p>
      <strong>{d.nom}</strong> a lancé <strong>{d.nomSort} {d.palier}</strong> : « {d.intention} ». La cible fait une sauvegarde de {NOMS_SAUVEGARDES[d.sauvegarde]} contre DD {d.dd}.
    </p>
    <div class="ligne">
      <label>Bonus de la cible <input type="number" min="-10" max="30" value={bonusCible} oninput={(e) => (bonusCible = Number(e.currentTarget.value) || 0)} /></label>
      <button disabled={occupe} onclick={() => agir(() => resisterSort(d, bonusCible))}>Lancer la sauvegarde</button>
    </div>
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </article>
{/if}

<style>
  .demande {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--couleur-bordure-douce);
  }
  p {
    margin: 0;
  }
  .textes {
    margin: 0;
    padding-left: 20px;
    font-size: 14px;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .ligne input:not([type='number']) {
    flex: 1;
    min-width: 160px;
  }
  input[type='number'] {
    width: 64px;
  }
</style>
