<script lang="ts">
  import { donnerLaMain, finirTour, lancerInitiative, noterAction, RefusCombat } from '../lib/actions/combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { actionsDuTour, BONUS_SPRINT, deplacementRestant, ordreCombat, type AvecId } from '../lib/combat/ordre';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import { session } from '../lib/session.svelte';

  /*
   * La colonne d'initiative (lot L6.1, décisions de Thomas du 23/10/2026),
   * pour le MJ et pour le joueur, d'après la maquette 2.0 :
   *   - l'ordre (5a) : initiative, nom, PV (en chiffres, monstres compris :
   *     3b), le combattant qui joue encadré, un combattant à terre barré et
   *     sauté (6a) ; qui n'a pas lancé attend en bas ;
   *   - le joueur lance son initiative ; à son tour, il voit ses actions
   *     (principale, secondaire, cases restantes), le Sprint (+2 cases,
   *     l'action principale : 7a) et « Finir mon tour » ;
   *   - le MJ lance l'initiative d'un PJ absent, finit le tour de celui qui
   *     joue et donne la main à qui il veut (6a).
   * Lot L6.2 (7a) : un PJ à 0 PV est dit Mourant et garde sa place ; mort,
   * il est barré et sauté.
   */

  let {
    role,
    idCombat,
    combat,
    combattants,
    aTerre,
    pvPj,
  }: {
    role: 'mj' | 'joueur';
    idCombat: string;
    combat: Combat;
    combattants: readonly AvecId<Combattant>[];
    /** Ceux dont le tour est sauté (monstres à 0 PV, PJ morts). */
    aTerre: ReadonlySet<string>;
    /** PV des PJ, lus sur leur fiche, par identifiant de combattant. */
    pvPj: ReadonlyMap<string, { actuel: number; max: number }>;
  } = $props();

  const ordre = $derived(ordreCombat(combattants));
  const actif = $derived(combattants.find((c) => c.id === combat.actif) ?? null);
  const moiQuiJoue = $derived(role === 'joueur' && actif !== null && actif.uid === session.uid);
  const actions = $derived(actif ? actionsDuTour(actif, combat.tour) : null);
  const restant = $derived(actif ? deplacementRestant(actif, combat.tour) : 0);
  const pvDe = (c: AvecId<Combattant>) => (c.genre === 'monstre' ? (c.pv !== null && c.pvMax !== null ? { actuel: c.pv, max: c.pvMax } : null) : (pvPj.get(c.id) ?? null));
  let main = $state('');
  let message = $state('');
  let occupe = $state(false);

  async function agir(f: () => Promise<unknown>) {
    message = '';
    occupe = true;
    try {
      await f();
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
  const finir = () => agir(() => finirTour(idCombat, combat.actif, combattants, aTerre));
</script>

<section class="carte ordre" aria-label="Ordre d'initiative">
  <h2>Initiative · round {combat.round}</h2>
  <ol>
    {#each ordre as c (c.id)}
      {@const pv = pvDe(c)}
      {@const terre = aTerre.has(c.id)}
      <li class:joue={c.id === combat.actif} class:monstre={c.genre === 'monstre'} class:terre aria-current={c.id === combat.actif ? 'true' : undefined}>
        <span class="init">{c.initiative ?? '—'}</span>
        <span class="nom">{c.nom}{c.id === combat.actif ? (c.uid === session.uid && role === 'joueur' ? ' · à toi' : ' · joue') : ''}</span>
        {#if terre}
          <span class="pv">{c.genre === 'pj' ? 'mort' : 'à terre'}</span>
        {:else if pv && c.genre === 'pj' && pv.actuel <= 0}
          <span class="pv mourant">Mourant {c.mortSucces}✓ {c.mortEchecs}✗</span>
        {:else if pv}
          <span class="pv">{pv.actuel}/{pv.max}</span>
        {/if}
        {#if c.initiative === null}
          {#if role === 'joueur' && c.uid === session.uid}
            <button class="petit" disabled={occupe} onclick={() => agir(() => lancerInitiative(idCombat, c))}>Lancer mon initiative</button>
          {:else if role === 'mj'}
            <button class="petit discret" disabled={occupe} onclick={() => agir(() => lancerInitiative(idCombat, c))}>Lancer pour {c.nom}</button>
          {/if}
        {/if}
      </li>
    {/each}
  </ol>

  {#if actif && actions && (moiQuiJoue || role === 'mj')}
    <div class="actions" role="group" aria-label="Actions du tour de {actif.nom}">
      <button class="petit" aria-pressed={actions.principale} disabled={occupe || actions.sprint} onclick={() => agir(() => noterAction(idCombat, combat, actif, { principale: !actions.principale }))}>Princ.</button>
      <button class="petit" aria-pressed={actions.secondaire} disabled={occupe} onclick={() => agir(() => noterAction(idCombat, combat, actif, { secondaire: !actions.secondaire }))}>Second.</button>
      <span class="mvt" data-testid="mvt">Mvt {restant}/{actif.mvtBase + (actions.sprint ? BONUS_SPRINT : 0)}</span>
    </div>
    {#if !actions.principale}
      <button disabled={occupe} onclick={() => agir(() => noterAction(idCombat, combat, actif, { sprint: true }))}>Sprint : +{BONUS_SPRINT} cases, coûte l'action principale</button>
    {/if}
  {/if}

  {#if moiQuiJoue}
    <button class="fin" disabled={occupe} onclick={finir}>Finir mon tour</button>
  {:else if role === 'mj'}
    {#if actif}<button class="fin" disabled={occupe} onclick={finir}>Finir le tour de {actif.nom}</button>{/if}
    <form class="main" onsubmit={(e) => (e.preventDefault(), main && agir(() => donnerLaMain(idCombat, combat, main)))}>
      <label
        >Donner la main à
        <select bind:value={main}>
          <option value="">—</option>
          {#each ordre.filter((c) => c.initiative !== null && c.id !== combat.actif) as c (c.id)}<option value={c.id}>{c.nom}</option>{/each}
        </select>
      </label>
      <button class="petit" disabled={occupe || !main}>Donner</button>
    </form>
  {/if}
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</section>

<style>
  .ordre {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h2 {
    font-size: 18px;
  }
  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  li {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 8px;
    padding: 8px 10px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  li.monstre {
    background: var(--couleur-danger-pale);
  }
  li.joue {
    border: 2px solid var(--couleur-accent);
    font-weight: 700;
  }
  li.terre .nom {
    text-decoration: line-through;
    color: var(--couleur-encre-douce);
  }
  .init {
    width: 24px;
    font-weight: 700;
  }
  .nom {
    flex: 1 1 auto;
  }
  .pv {
    font-size: 13px;
  }
  .mourant {
    color: var(--couleur-danger);
    font-weight: 700;
  }
  li button {
    width: 100%;
  }
  .actions {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 6px;
    text-align: center;
  }
  .actions button {
    min-width: 0;
    padding: 0 4px;
    font-size: 13px;
  }
  .actions button[aria-pressed='true'] {
    background: var(--couleur-bordure-douce);
    color: var(--couleur-encre-douce);
    text-decoration: line-through;
  }
  .mvt {
    padding: 8px 2px;
    border-radius: var(--rayon);
    background: var(--couleur-bordure-douce);
    font-size: 13px;
    font-weight: 700;
  }
  .main {
    display: flex;
    align-items: flex-end;
    gap: 6px;
  }
  .main label {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
</style>
