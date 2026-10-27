<script lang="ts">
  import { onDestroy } from 'svelte';
  import { RefusCombat } from '../lib/actions/combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { demanderReaction } from '../lib/actions/reactions';
  import type { Case } from '../lib/battlemap/geometrie';
  import type { CarteDuCombat } from '../lib/combat/attaque';
  import { arriveePermise } from '../lib/combat/poussee';
  import { besoinsReaction, OPPORTUNITE, reactionDisponible, reactionsProposees } from '../lib/combat/reactions';
  import { campPermis, coutAffiche } from '../lib/combat/sorts';
  import { viseeCarte } from '../lib/combat/visee.svelte';
  import type { AvecId, CollectionSuivie } from '../lib/firebase/suivre.svelte';
  import { suivreOpportunites, suivreReactions } from '../lib/magasins/combat.svelte';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import type { FicheV2 } from '../lib/schemas/fiche';
  import type { DemandeReaction, Opportunite } from '../lib/schemas/reactions';
  import { session } from '../lib/session.svelte';

  /*
   * Les réactions du joueur (lot L6.5b, décisions de Thomas du 26/10/2026),
   * dans sa barre, hors de son tour (6a) :
   *   - une attaque d'opportunité ouverte sur lui (10a) : un bouton ;
   *   - ses réactions : la cible quand il en faut une, la case d'un bond
   *     sur la carte (6b), la posture ; « Réagir » demande, le client du MJ
   *     joue (1a) et la barre dit ce qu'il en est advenu ;
   *   - une réaction par round, rendue au début de son tour (7a).
   * Le joueur juge du déclencheur (7a) : rien ne les attend.
   */

  let {
    fiche,
    idCombat,
    combat,
    moi,
    combattants,
    carte,
  }: {
    fiche: AvecId<FicheV2>;
    idCombat: string;
    combat: Combat;
    moi: AvecId<Combattant>;
    combattants: readonly AvecId<Combattant>[];
    carte: CarteDuCombat | null;
  } = $props();

  let suivi = $state<{ r: CollectionSuivie<DemandeReaction>; o: CollectionSuivie<Opportunite> } | null>(null);
  $effect(() => {
    const x = { r: suivreReactions(session.table, idCombat), o: suivreOpportunites(session.table, idCombat) };
    suivi = x;
    return () => {
      x.r.arreter();
      x.o.arreter();
      suivi = null;
    };
  });
  onDestroy(() => (viseeCarte.v = null));

  const libre = $derived(reactionDisponible(moi));
  const nomDe = (id: string | null) => (id ? (combattants.find((c) => c.id === id)?.nom ?? id) : '');
  // 10a : les opportunités que le pas d'un ennemi lui ouvre, ce tour.
  const opportunites = $derived((suivi?.o.etat.elements ?? []).filter((o) => o.attaquant === moi.id && o.tour === combat.tour));
  const reactions = $derived(reactionsProposees(fiche));
  let choisie = $state('');
  const reaction = $derived(reactions.find((r) => r.id === choisie) ?? reactions[0] ?? null);
  const besoins = $derived(reaction ? besoinsReaction(fiche, moi, reaction) : null);
  const cout = $derived(reaction ? coutAffiche(reaction, reaction.paliers.at(-1) ?? 'I', false, null) : null);
  const dejaServie = $derived(!!reaction && ((reaction.limite === '1x/round' && moi.usages[reaction.id] === combat.round) || (reaction.limite !== 'volonte' && reaction.limite !== '1x/round' && !!moi.usages[reaction.id])));
  const cibles = $derived(besoins?.cible ? combattants.filter((c) => !c.aTerre && !c.mort && campPermis(c, besoins.cible!)) : []);
  let cibleChoisie = $state('');
  const cible = $derived(cibles.find((c) => c.id === cibleChoisie) ?? null);
  let caseBond = $state<Case | null>(null);
  let choixCase = $state(false);
  let plus = $state('');
  let moins = $state('');
  let valeur = $state<number | null>(null);
  const posture = $derived(besoins?.posture && plus && moins && valeur ? { plus: plus as 'attaque' | 'DEF' | 'degats', moins: moins as 'attaque' | 'DEF' | 'degats', valeur } : null);
  const manque = $derived(!besoins ? null : besoins.cible && !cible ? 'choisis la cible' : besoins.bond !== null && !caseBond ? 'choisis la case du bond' : besoins.posture && !posture ? 'choisis la posture' : null);
  // Une autre réaction : ses choix repartent de zéro.
  $effect(() => {
    void reaction?.id;
    cibleChoisie = plus = moins = '';
    valeur = null;
    caseBond = null;
    choixCase = false;
  });
  // 6b : la case du bond, d'un clic sur la carte.
  $effect(() => {
    const k = carte;
    const n = besoins?.bond ?? null;
    if (!choixCase || !k || n === null) return;
    viseeCarte.v = {
      apercu: (survol) => ({ cases: [survol], jetons: [moi.id], refus: arriveePermise(k.scene, k.jetons, moi.id, survol, n) }),
      choisir: (c) => {
        if (arriveePermise(k.scene, k.jetons, moi.id, c, n)) return;
        caseBond = c;
        choixCase = false;
      },
      fixe: { cases: caseBond ? [caseBond] : [], jetons: [moi.id] },
    };
    return () => (viseeCarte.v = null);
  });
  // Sa dernière demande, ce tour : ce qu'il en est advenu.
  const derniere = $derived(
    (suivi?.r.etat.elements ?? []).filter((d) => d.qui === moi.id && d.uid === session.uid && d.tour === combat.tour).sort((a, b) => b.creeLe - a.creeLe)[0] ?? null,
  );
  const enAttente = $derived(derniere?.statut === 'attente');

  let message = $state('');
  let occupe = $state(false);
  async function demander(d: Pick<DemandeReaction, 'reaction' | 'cible' | 'case' | 'posture' | 'opportunite'>) {
    message = '';
    occupe = true;
    try {
      await demanderReaction(idCombat, combat, moi, d);
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
  const reagir = () => reaction && demander({ reaction: reaction.id, cible: cible?.id ?? null, case: caseBond, posture, opportunite: null });
  const nomAxe = (a: string) => (a === 'degats' ? 'dégâts' : a);
</script>

<div class="bloc reactions" role="group" aria-label="Réactions">
  <h3>Réactions</h3>
  <p class="aide">{libre ? 'Réaction du round : libre.' : 'Réaction du round prise : elle revient au début de ton tour.'}</p>
  {#each opportunites as o (o.id)}
    <button class="opportunite" disabled={occupe || !libre || enAttente} onclick={() => demander({ reaction: OPPORTUNITE, cible: o.cible, case: null, posture: null, opportunite: o.id })}
      >Attaque d’opportunité sur {nomDe(o.cible)}</button
    >
  {/each}
  {#if reaction && besoins}
    <label class="choix"
      >Réaction
      <select value={reaction.id} onchange={(e) => (choisie = e.currentTarget.value)}>
        {#each reactions as r (r.id)}<option value={r.id}>{r.nom}</option>{/each}
      </select>
    </label>
    <p class="aide">{reaction.description}</p>
    <div class="reglages">
      <span class="cout" data-testid="cout-reaction">{cout && 'texte' in cout ? cout.texte : ''}</span>
      {#if reaction.limite !== 'volonte'}<span class="aide">{reaction.limite.replace('1x', '1×')}</span>{/if}
      {#if besoins.cible}
        <label
          >Cible <select aria-label="Cible de la réaction" bind:value={cibleChoisie}
            ><option value="">—</option>{#each cibles as c (c.id)}<option value={c.id}>{c.nom}</option>{/each}</select
          ></label
        >
      {/if}
      {#if besoins.posture}
        <label>Bonus <select aria-label="Axe en bonus" bind:value={plus}><option value="">—</option>{#each besoins.posture.axes as a (a)}<option value={a}>{nomAxe(a)}</option>{/each}</select></label>
        <label>Malus <select aria-label="Axe en malus" bind:value={moins}><option value="">—</option>{#each besoins.posture.axes as a (a)}<option value={a}>{nomAxe(a)}</option>{/each}</select></label>
        <label>Valeur <input type="number" min="1" max={besoins.posture.plafond} aria-label="Valeur de la posture" bind:value={valeur} /></label>
        <span class="aide">1 à {besoins.posture.plafond}</span>
      {/if}
      {#if besoins.bond !== null}
        <button aria-pressed={choixCase} disabled={!carte} onclick={() => (choixCase = !choixCase)}>{choixCase ? 'Fermer la carte' : 'Choisir la case'}</button>
        {#if caseBond}<span class="aide" data-testid="case-bond">Case {caseBond.cx + 1}, {caseBond.cy + 1}</span>{/if}
      {/if}
    </div>
    {#if choixCase}<p class="aide" role="status">Clique la case où il bondit ({besoins.bond} cases au plus).</p>{/if}
    <button class="reagir" disabled={occupe || !libre || enAttente || dejaServie || !!manque} onclick={reagir}>Réagir : {reaction.nom}</button>
    {#if manque}<p class="aide">Pour réagir : {manque}.</p>{/if}
    {#if dejaServie}<p class="aide">{reaction.nom} a déjà servi.</p>{/if}
  {/if}
  {#if derniere}
    <p class="suite" role="status">
      {derniere.statut === 'attente' ? 'Demandée : le MJ la joue…' : derniere.statut === 'refusee' ? `Refusée : ${derniere.texte}` : (derniere.texte ?? 'Jouée.')}
    </p>
  {/if}
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</div>

<style>
  /* Un bloc de la barre (BarreCombat). */
  .reactions {
    flex: 1 1 220px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-right: 1px solid var(--couleur-bordure-douce);
    border-bottom: 1px solid var(--couleur-bordure-douce);
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
  .choix {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .reglages {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    font-size: 13px;
  }
  .reglages label {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }
  .reglages input {
    width: 64px;
  }
  .cout {
    font-weight: 600;
  }
  .suite {
    font-size: 13px;
  }
</style>
