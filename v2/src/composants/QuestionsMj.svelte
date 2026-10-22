<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { RefusScene, repondreQuestion } from '../lib/actions/scenes-hors-combat';
  import { suivreQuestionsMj } from '../lib/magasins/scenes-hors-combat.svelte';
  import { nomNoeud } from '../lib/scenes/vecu-en-scene';
  import { session } from '../lib/session.svelte';

  /*
   * Questions des joueurs au MJ (lot S3, 1a et 9a) : Savant et Réseau de
   * rumeurs, et ce que Lire les gens a révélé (le DD du moment), dont le MJ
   * donne l'intention du PNJ. La réponse n'est lue que du joueur.
   */

  const questions = suivreQuestionsMj(session.table);
  onDestroy(() => questions.arreter());

  const enAttente = $derived([...questions.etat.elements].filter((q) => q.reponse === null).sort((a, b) => a.creeLe - b.creeLe));
  const repondues = $derived([...questions.etat.elements].filter((q) => q.reponse !== null).sort((a, b) => (b.reponduLe ?? 0) - (a.reponduLe ?? 0)).slice(0, 10));
  let reponses = $state<Record<string, string>>({});
  let message = $state('');
  let occupe = $state(false);

  async function repondre(id: string) {
    message = '';
    occupe = true;
    try {
      await repondreQuestion(id, reponses[id] ?? '');
      reponses = { ...reponses, [id]: '' };
    } catch (e) {
      message = e instanceof RefusScene ? e.message : messageErreurPerso(e);
    } finally {
      occupe = false;
    }
  }
</script>

{#if questions.etat.elements.length}
  <section class="carte questions" aria-label="Questions des joueurs">
    <h2>Questions des joueurs</h2>
    {#each enAttente as q (q.id)}
      <div class="question">
        {#if q.noeud === 'lire-les-gens'}
          <p><strong>{q.nom}</strong> a lu son interlocuteur (Lire les gens) : il lui faudra {q.dd}. Donne son intention.</p>
        {:else}
          <p><strong>{q.nom}</strong> ({nomNoeud(q.noeud)}) : {q.question}</p>
        {/if}
        <form onsubmit={(e) => (e.preventDefault(), repondre(q.id))}>
          <input aria-label="Réponse à {q.nom}" maxlength="500" value={reponses[q.id] ?? ''} oninput={(e) => (reponses = { ...reponses, [q.id]: e.currentTarget.value })} />
          <button disabled={occupe || !(reponses[q.id] ?? '').trim()}>Répondre</button>
        </form>
      </div>
    {:else}
      <p class="aide">Aucune question en attente.</p>
    {/each}
    {#if repondues.length}
      <details>
        <summary>Réponses données</summary>
        <ul>
          {#each repondues as q (q.id)}
            <li>{q.nom} · {nomNoeud(q.noeud)} : {q.question ?? `DD ${q.dd}`} — {q.reponse}</li>
          {/each}
        </ul>
      </details>
    {/if}
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </section>
{/if}

<style>
  .questions {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    font-size: 20px;
  }
  p {
    margin: 0;
  }
  .question {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  form {
    display: flex;
    gap: 8px;
  }
  form input {
    flex: 1;
  }
  ul {
    margin: 0;
    padding-left: 18px;
    font-size: 14px;
  }
</style>
