<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { RefusSort, repondreDemandeSort, resisterSort } from '../lib/actions/sorts-hors-combat';
  import { suivreDemandesSortsMj } from '../lib/magasins/sorts-hors-combat.svelte';
  import { aTraiter } from '../lib/fiche/sorts-hors-combat';
  import { session } from '../lib/session.svelte';

  /*
   * Les sorts hors combat demandés par les joueurs (lot G2a, décisions de
   * Thomas du 22/10/2026), dans Prépa social à côté des questions (16a) :
   *   - en attente : l'intention, ce qu'ouvre le palier (7), le coût, le
   *     risque d'échec, la sauvegarde ; le MJ accepte ou refuse, avec un
   *     motif possible (5b). Le joueur paie et lance ensuite (15b) ;
   *   - un sort lancé qui a une sauvegarde : le MJ lance celle de la cible
   *     contre le DD, avec le bonus qu'il lui donne (14b) ;
   *   - les derniers sorts traités, repliés.
   */

  const demandes = suivreDemandesSortsMj(session.table);
  onDestroy(() => demandes.arreter());
  const parDate = $derived([...demandes.etat.elements].sort((a, b) => a.creeLe - b.creeLe));
  const enAttente = $derived(parDate.filter((d) => d.statut === 'attente'));
  const aResoudre = $derived(parDate.filter((d) => aTraiter(d) && d.statut === 'lancee'));
  const traitees = $derived(parDate.filter((d) => !aTraiter(d) && d.statut !== 'acceptee').reverse().slice(0, 10));

  let motifs = $state<Record<string, string>>({});
  let bonus = $state<Record<string, number>>({});
  let message = $state('');
  let occupe = $state(false);
  const NOMS_SAUVEGARDES = { FOR: 'FOR', DEX: 'DEX', CON: 'CON', Volonte: 'Volonté' } as const;

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
  const repondre = (id: string, oui: boolean) => agir(async () => {
    await repondreDemandeSort(id, oui, motifs[id] ?? '');
    motifs = { ...motifs, [id]: '' };
  });
  const issue = (d: (typeof parDate)[number]) =>
    d.statut === 'refusee' ? `refusé${d.motif ? ` (${d.motif})` : ''}` : d.statut === 'ratee' ? `raté (d20 : ${d.de})` : d.resistance ? (d.resistance.reussie ? 'lancé, la cible a résisté' : 'lancé, la cible n’a pas résisté') : 'lancé';
</script>

{#if demandes.etat.elements.length}
  <section class="carte sorts" aria-label="Sorts hors combat">
    <h2>Sorts hors combat</h2>
    {#each enAttente as d (d.id)}
      <article class="demande" aria-label="Demande de {d.nom}">
        <p>
          <strong>{d.nom}</strong> veut lancer <strong>{d.nomSort} {d.palier}</strong> : « {d.intention} »
        </p>
        <ol class="textes">
          {#each d.textes as t, i (i)}<li>{t}</li>{/each}
        </ol>
        <p class="aide">
          {d.pp} PP{d.echec ? ` · échec sur 1 à ${d.echec} au d20` : ''}{d.sauvegarde ? ` · sauvegarde de ${NOMS_SAUVEGARDES[d.sauvegarde]}, DD ${d.dd}` : ''}
        </p>
        <div class="ligne">
          <input aria-label="Motif pour {d.nom}" placeholder="Motif (facultatif)" maxlength="120" value={motifs[d.id] ?? ''} oninput={(e) => (motifs = { ...motifs, [d.id]: e.currentTarget.value })} />
          <button disabled={occupe} onclick={() => repondre(d.id, true)}>Accepter</button>
          <button class="discret" disabled={occupe} onclick={() => repondre(d.id, false)}>Refuser</button>
        </div>
      </article>
    {/each}
    {#each aResoudre as d (d.id)}
      <article class="demande" aria-label="Sauvegarde contre {d.nomSort}">
        <p>
          <strong>{d.nom}</strong> a lancé <strong>{d.nomSort} {d.palier}</strong> : « {d.intention} ». La cible fait une sauvegarde de {NOMS_SAUVEGARDES[d.sauvegarde!]} contre DD {d.dd}.
        </p>
        <div class="ligne">
          <label>Bonus de la cible <input type="number" min="-10" max="30" value={bonus[d.id] ?? 0} oninput={(e) => (bonus = { ...bonus, [d.id]: Number(e.currentTarget.value) || 0 })} /></label>
          <button disabled={occupe} onclick={() => agir(() => resisterSort(d, bonus[d.id] ?? 0))}>Lancer la sauvegarde</button>
        </div>
      </article>
    {/each}
    {#if !enAttente.length && !aResoudre.length}<p class="aide">Aucun sort en attente.</p>{/if}
    {#if traitees.length}
      <details>
        <summary>Derniers sorts</summary>
        <ul>
          {#each traitees as d (d.id)}<li>{d.nom} · {d.nomSort} {d.palier} · {d.pp} PP · « {d.intention} » : {issue(d)}</li>{/each}
        </ul>
      </details>
    {/if}
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
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
  .demande {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--couleur-bordure-douce);
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
