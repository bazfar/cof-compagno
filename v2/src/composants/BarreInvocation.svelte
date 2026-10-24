<script lang="ts">
  import { RefusCombat } from '../lib/actions/combat';
  import { attaqueDInvocation, capaciteDInvocation, rompreParAttaque } from '../lib/actions/invocations';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { horsDePortee, type CarteDuCombat } from '../lib/combat/attaque';
  import { ciblable, peutAgir, texteEtat } from '../lib/combat/etats';
  import { capacitesDe, porteeInvocation, texteInvocation } from '../lib/combat/invocations';
  import { actionsDuTour, campDe } from '../lib/combat/ordre';
  import { couverture, protegeParSanctuaire } from '../lib/combat/zones-sol';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import type { Fiche } from '../lib/schemas/fiche';

  /*
   * Le tour d'une invocation (lot L6.4b2, décisions de Thomas du
   * 24/10/2026), sous la barre du joueur de son maître (14a) : ses PV, sa
   * DEF et ses cases (son jeton se glisse sur la carte, comme celui du
   * joueur) ; son attaque, à l'attaque magique du maître (7a) ; ses
   * capacités : celles qui ont des effets se jouent sur un allié, les
   * autres vont au MJ ; pas de sorts. « Finir mon tour » est dans l'ordre
   * d'initiative.
   */

  let {
    inv,
    idCombat,
    combat,
    combattants,
    fiches,
    carte,
  }: {
    inv: AvecId<Combattant>;
    idCombat: string;
    combat: Combat;
    combattants: readonly AvecId<Combattant>[];
    fiches: ReadonlyMap<string, AvecId<Fiche>>;
    carte: CarteDuCombat | null;
  } = $props();

  const actions = $derived(actionsDuTour(inv, combat.tour));
  const agit = $derived(peutAgir(inv.etats));
  const attaque = $derived(inv.invocation?.attaque ?? null);
  const portee = $derived(porteeInvocation(inv.invocation?.creature ?? ''));
  const monstres = $derived(combattants.filter((c) => c.genre === 'monstre' && !c.aTerre && ciblable(c.etats)));
  const allies = $derived(combattants.filter((c) => campDe(c) === 'pj' && c.id !== inv.id));
  let cibleChoisie = $state('');
  const cible = $derived(monstres.find((c) => c.id === cibleChoisie) ?? monstres[0] ?? null);
  const refus = $derived(
    !cible
      ? null
      : carte?.zones && protegeParSanctuaire(carte.zones, carte.jetons, inv.id, cible.id)
        ? 'la cible est dans un sanctuaire'
        : combat.porteesLibres
          ? null
          : horsDePortee(carte?.scene ?? null, carte?.jetons ?? [], inv.id, cible.id, portee),
  );
  const capacites = $derived(capacitesDe(inv.invocation?.creature ?? ''));
  let allieChoisi = $state('');
  const allie = $derived(allies.find((c) => c.id === allieChoisi) ?? allies[0] ?? null);

  let message = $state('');
  let erreur = $state('');
  let occupe = $state(false);
  async function agir(f: () => Promise<string>) {
    message = '';
    erreur = '';
    occupe = true;
    try {
      message = await f();
    } catch (e) {
      erreur = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
  function attaquer() {
    const c = cible;
    if (!c) return;
    return agir(async () => {
      const defEnPlus = portee.vue && carte?.zones ? couverture(carte.zones, carte.jetons, c.id) : 0;
      const r = await attaqueDInvocation(idCombat, combat, inv, c, Math.random, defEnPlus);
      // 1a : une attaque contre la cible d'une concentration qui le dit la rompt.
      await rompreParAttaque(idCombat, combat.scene, c.id, combattants, inv.nom);
      return r.issue.touche ? `Touché : ${r.net ?? 0} dégâts à ${c.nom}.` : `Raté : ${r.issue.total} contre DEF ${r.issue.def}.`;
    });
  }
</script>

<section class="carte barre" aria-label="Tour de {inv.nom}">
  <div class="bloc">
    <strong class="nom">Tour de {texteInvocation(inv)}</strong>
    <div class="pastilles">
      <span>PV {inv.pv}/{inv.pvMax}</span>
      <span>DEF {inv.def}</span>
      <span>{inv.mvtBase} cases</span>
    </div>
    {#if inv.etats.length}
      <ul class="etats" aria-label="États de {inv.nom}">
        {#each inv.etats as e (e.id)}<li>{texteEtat(e)}</li>{/each}
      </ul>
    {/if}
    {#if agit !== 'oui'}<p class="alerte" role="status">{inv.nom} ne peut pas agir ce tour.</p>{/if}
    <p class="aide">Glisse son jeton sur la carte ; « Finir mon tour » est dans l’ordre d’initiative.</p>
  </div>

  {#if attaque}
    <div class="bloc">
      <h3>Attaque</h3>
      {#if monstres.length}
        <label class="cible"
          >Cible
          <select value={cible?.id ?? ''} onchange={(e) => (cibleChoisie = e.currentTarget.value)}>
            {#each monstres as m (m.id)}<option value={m.id}>{m.nom} · DEF {m.def}</option>{/each}
          </select>
        </label>
      {/if}
      <button disabled={occupe || actions.principale || agit !== 'oui' || !cible || !!refus} title={refus ?? undefined} onclick={attaquer}
        >Attaquer · {attaque.bonus >= 0 ? '+' : '−'}{Math.abs(attaque.bonus)} · {attaque.des}</button
      >
      {#if refus}<p class="aide">{refus}.</p>{/if}
      {#if actions.principale}<p class="aide">Action principale prise ce tour.</p>{/if}
    </div>
  {/if}

  {#if capacites.length}
    <div class="bloc">
      <h3>Capacités</h3>
      {#if capacites.some((c) => c.effets) && allies.length}
        <label class="cible"
          >Allié
          <select value={allie?.id ?? ''} onchange={(e) => (allieChoisi = e.currentTarget.value)}>
            {#each allies as a (a.id)}<option value={a.id}>{a.nom}</option>{/each}
          </select>
        </label>
      {/if}
      <ul class="capacites">
        {#each capacites as c (c.nom)}
          <li>
            <strong>{c.nom}</strong> <span class="aide">{c.texte}</span>
            <button
              class="petit"
              disabled={occupe || actions.principale || agit !== 'oui' || (!!c.effets && !allie)}
              onclick={() => agir(() => capaciteDInvocation(idCombat, combat, inv, c.nom, allie ?? inv, fiches))}>{c.effets ? `Sur ${allie?.nom ?? '…'}` : 'Au MJ'}</button
            >
          </li>
        {/each}
      </ul>
    </div>
  {/if}
  {#if message}<p class="message" role="status">{message}</p>{/if}
  {#if erreur}<p class="message erreur" role="alert">{erreur}</p>{/if}
</section>

<style>
  .barre {
    display: flex;
    flex-wrap: wrap;
    padding: 0;
    overflow: hidden;
    border-left: 4px solid var(--couleur-accent);
  }
  .bloc {
    flex: 1 1 220px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-right: 1px solid var(--couleur-bordure-douce);
  }
  .nom {
    font-size: 17px;
  }
  h3 {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--couleur-encre-douce);
  }
  p {
    margin: 0;
  }
  .pastilles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .pastilles span {
    padding: 3px 9px;
    border-radius: 8px;
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .alerte {
    color: var(--couleur-danger);
    font-weight: 700;
  }
  .cible {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .etats,
  .capacites {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 13px;
  }
  .message {
    width: 100%;
    padding: 10px 16px 12px;
  }
</style>
