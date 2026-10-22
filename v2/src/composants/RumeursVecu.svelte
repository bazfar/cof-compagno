<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { poserQuestion, RefusScene } from '../lib/actions/scenes-hors-combat';
  import { noeudsPossedes } from '../lib/fiche/vecu';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreMesQuestions } from '../lib/magasins/scenes-hors-combat.svelte';
  import { dejaUtiliseCetteSeance } from '../lib/scenes/vecu-en-scene';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import type { Fiche } from '../lib/schemas/fiche';
  import { session } from '../lib/session.svelte';

  /*
   * Réseau de rumeurs (lot S3, 9a), sur la fiche, hors scène : une question
   * au MJ sur un PNJ ou un lieu, en ville, une fois par séance (11a : noté
   * dans `usages` de la fiche). Le MJ répond dans l'app (Prépa social) ; le
   * joueur seul lit la réponse. Monté pour le propriétaire de la fiche
   * seulement.
   */

  let { fiche }: { fiche: AvecId<Fiche> } = $props();

  const table = suivreTable(session.table);
  const questions = suivreMesQuestions(session.table, session.uid);
  onDestroy(() => {
    table.arreter();
    questions.arreter();
  });
  const seance = $derived(table.etat.donnees?.seanceOuverte?.id);
  const aLeNoeud = $derived(noeudsPossedes(fiche.vecu).includes('reseau-de-rumeurs'));
  const usages = $derived(fiche.usages as Record<string, unknown>);
  const deja = $derived(dejaUtiliseCetteSeance(usages, 'reseau-de-rumeurs', seance));
  const miennes = $derived(questions.etat.elements.filter((q) => q.noeud === 'reseau-de-rumeurs' && q.perso === fiche.id).sort((a, b) => b.creeLe - a.creeLe));

  let question = $state('');
  let message = $state('');
  let occupe = $state(false);
  async function poser() {
    message = '';
    occupe = true;
    try {
      await poserQuestion('reseau-de-rumeurs', question, { perso: fiche.id, nom: fiche.nom, usages, seance, scene: null });
      question = '';
    } catch (e) {
      message = e instanceof RefusScene ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
</script>

{#if aLeNoeud}
  <section class="rumeurs" aria-label="Réseau de rumeurs">
    <h4>Réseau de rumeurs</h4>
    {#if deja}
      <p class="aide">Déjà utilisé cette séance.</p>
    {:else}
      <form onsubmit={(e) => (e.preventDefault(), poser())}>
        <label>Une question au MJ sur un PNJ ou un lieu, en ville <input maxlength="300" bind:value={question} /></label>
        <button disabled={occupe || !question.trim()}>Poser au MJ</button>
      </form>
    {/if}
    {#each miennes as q (q.id)}
      <p class="prive">{q.question} — {q.reponse ?? 'le MJ cherche…'}</p>
    {/each}
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </section>
{/if}

<style>
  .rumeurs {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 12px;
  }
  p,
  h4 {
    margin: 0;
  }
  form {
    display: flex;
    gap: 8px;
    align-items: flex-end;
  }
  form label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  .prive {
    font-size: 14px;
    color: var(--couleur-or-texte);
    border-left: 3px solid var(--couleur-or);
    padding-left: 8px;
  }
</style>
