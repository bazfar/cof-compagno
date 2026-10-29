<script lang="ts">
  import { onDestroy } from 'svelte';
  import { attaqueDeMonstre, attaqueSurInvocation, poserEtatSur, repousserDe, retirerEtatDe } from '../lib/actions/attaques';
  import { finirConcentration, maintenirConcentration } from '../lib/actions/invocations';
  import { texteConcentration } from '../lib/combat/concentration';
  import { texteInvocation } from '../lib/combat/invocations';
  import { ajusterPvMonstre, corrigerSauvegardes, RefusCombat } from '../lib/actions/combat';
  import { texteBonus } from '../lib/combat/bonus';
  import { couverture, protegeParSanctuaire, texteZone } from '../lib/combat/zones-sol';
  import { retirerZone } from '../lib/actions/zones';
  import { suivreZonesCombat } from '../lib/magasins/zones.svelte';
  import type { ZoneSol } from '../lib/schemas/zones';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { attaquesDuMonstre, horsDePortee, type AttaqueMonstre, type CarteDuCombat } from '../lib/combat/attaque';
  import { ciblable, defenseVisee, etatsPosables, regleEtat, texteEtat } from '../lib/combat/etats';
  import { etatPj } from '../lib/combat/mort';
  import { actionsDuTour, ordreCombat } from '../lib/combat/ordre';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreArmesMonstres, suivreArmuresMonstres, suivreBestiaire } from '../lib/magasins/bestiaire.svelte';
  import { aDesTraits, traitsDemon } from '../lib/combat/demons';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreCombat, suivreCombattants } from '../lib/magasins/combat.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import { session } from '../lib/session.svelte';
  import { rappelAvantAttaque } from '../lib/combat/reactions';
  import ReactionsMj from './ReactionsMj.svelte';
  import CapacitesMj from './CapacitesMj.svelte';
  import { limiteDeLAttaque, refusDeLimite, texteEffetAttaque } from '../lib/combat/monstres';

  /*
   * Section Combat du MJ, colonne de droite (lot L6.1, maquette 2.0) : le
   * combattant qui joue, ou celui que le MJ choisit.
   *   - Un monstre : ses PV en chiffres, réglés à la main (à 0, il est à
   *     terre et son jeton marqué mort) ; sa DEF, son initiative et ses
   *     attaques, lues dans le bestiaire (le MJ seul les voit) ; les états
   *     arrivent avec L6.3.
   *   - Un PJ : PV, PP et CA de sa fiche.
   * Dessous, les PJ du combat en un coup d'œil.
   *
   * Lot L6.2 (6a, 4a, 10a) : le MJ attaque un PJ avec une attaque du
   * monstre choisi : d20 + bonus contre la CA de la fiche, puis, touché,
   * les dégâts de l'arme après la réduction du PJ, d'un clic, au journal.
   * Hors de portée, le bouton le dit ; le MJ peut passer outre.
   *
   * Lot L6.3 (4b, 14a) : les états du combattant choisi, avec leur règle ;
   * le MJ en pose (état, durée) et en retire. L'état d'une attaque de
   * monstre est posé à la touche (8).
   *
   * Lot L6.4a (8a, 11a, 12a) : les sauvegardes du monstre, dérivées du
   * bestiaire au démarrage, que le MJ corrige ; les PV temporaires et les
   * bonus du combat de chacun.
   *
   * Lot L6.4b1 (16a, 11a) : les zones au sol du combat, que le MJ retire ;
   * un PJ dans un sanctuaire ne se vise pas, sa couverture compte contre
   * une attaque à distance.
   *
   * Lot L6.4b2 (décisions de Thomas du 24/10/2026) : une invocation montre
   * ses PV et sa DEF, que le MJ règle et que ses monstres attaquent (10a) ;
   * un PJ touché pendant sa concentration fait sa sauvegarde de CON pour la
   * maintenir (1a) ; le MJ rompt une concentration d'un bouton (lanceur
   * surpris, 1a).
   *
   * Lot L6.5b (décisions de Thomas du 26/10/2026) : avant l'attaque d'un
   * monstre, les réactions que la cible et ses alliés peuvent encore jouer
   * (6a) ; dessous, ReactionsMj joue leurs demandes (1a) et offre
   * l'attaque d'opportunité des monstres (5a).
   *
   * Lot L6.6a (décisions de Thomas du 28/10/2026) : sous chaque attaque,
   * son effet traduit et sa limite (6b) ; une attaque à plusieurs jets
   * attend les suivants ; repoussée, la cible recule ; CapacitesMj : les
   * immunités, les résistances légendaires et les capacités du monstre.
   */

  let { carte = null }: { carte?: CarteDuCombat | null } = $props();

  const table = suivreTable(session.table);
  const persos = suivrePersos(session.table);
  const bestiaire = suivreBestiaire(session.table);
  const armes = suivreArmesMonstres(session.table);
  const armures = suivreArmuresMonstres(session.table);
  onDestroy(() => {
    table.arreter();
    persos.arreter();
    bestiaire.arreter();
    armes.arreter();
    armures.arreter();
  });
  const idCombat = $derived(table.etat.donnees?.combat ?? null);
  let suivi = $state<{ c: DocumentSuivi<Combat>; m: CollectionSuivie<Combattant>; z: CollectionSuivie<ZoneSol> } | null>(null);
  $effect(() => {
    if (!idCombat) return;
    const x = { c: suivreCombat(session.table, idCombat), m: suivreCombattants(session.table, idCombat), z: suivreZonesCombat(session.table, idCombat) };
    suivi = x;
    return () => {
      x.c.arreter();
      x.m.arreter();
      x.z.arreter();
      suivi = null;
    };
  });
  // L6.4b1 (16a) : les zones au sol du combat, que le MJ retire à la main.
  const zonesCombat = $derived(suivi?.z.etat.elements ?? []);
  const nomDe = (id: string | null) => (id ? (combattants.find((c) => c.id === id)?.nom ?? id) : 'MJ');
  const combat = $derived(suivi?.c.etat.donnees ?? null);
  const combattants = $derived(ordreCombat(suivi?.m.etat.elements ?? []));
  let choisi = $state('');
  const montre = $derived(combattants.find((c) => c.id === choisi) ?? combattants.find((c) => c.id === combat?.actif) ?? combattants[0] ?? null);
  const modele = $derived(montre?.monstre ? (bestiaire.etat.elements.find((m) => m.id === montre.monstre) ?? null) : null);
  // L6.6b : un démon : ses traits (faim, berserk, Puits, Vol de sève, passifs) ; null : un monstre ordinaire.
  const demon = $derived.by(() => {
    const t = modele ? traitsDemon(modele) : null;
    return t && aDesTraits(t) ? t : null;
  });
  const reductions = $derived(new Map((armures.etat.donnees?.liste ?? []).map((a) => [a.id, a.reduction])));
  const fiche = $derived(montre?.perso ? (persos.etat.elements.find((p) => p.id === montre.perso) ?? null) : null);
  const vue = $derived(fiche ? vueFiche(fiche) : null);
  const pjs = $derived(
    combattants
      .filter((c) => c.perso)
      .map((c) => ({ c, f: persos.etat.elements.find((p) => p.id === c.perso) }))
      .filter((x) => !!x.f)
      .map(({ c, f }) => ({ c, v: vueFiche(f!) })),
  );
  const signe = (n: number) => (n >= 0 ? `+${n}` : `−${-n}`);
  // La DEF du monstre et la CA des PJ sont montrées telles que le jet les
  // visera : modifiées par leurs états (Exposé −2…), comme `jetAttaque`.
  const defMontre = $derived(montre?.def == null ? null : defenseVisee(montre.def, montre.etats, montre.bonus));

  // ---- Attaques du monstre (L6.2, 6a) ----
  const listeArmes = $derived(new Map((armes.etat.donnees?.liste ?? []).map((a) => [a.id, a])));
  const attaquesMonstre = $derived(modele ? attaquesDuMonstre(modele.attaques, listeArmes, montre?.monstre ?? null) : []);
  const ciblesPj = $derived(pjs.filter(({ c, v }) => etatPj(v.pv.actuel, c) !== 'mort' && ciblable(c.etats)));
  let cibleChoisie = $state('');
  // L6.4b2 (10a) : les invocations se visent aussi.
  const ciblesInv = $derived(combattants.filter((c) => c.genre === 'invocation' && !c.aTerre && ciblable(c.etats)));
  const cibleInv = $derived(ciblesInv.find((c) => c.id === cibleChoisie) ?? null);
  const ciblePj = $derived(ciblesPj.find((x) => x.c.id === cibleChoisie) ?? ciblesPj[0] ?? null);
  const cibleId = $derived(cibleInv?.id ?? ciblePj?.c.id ?? null);
  let outrePortee = $state(false);
  // L6.5b (6a) : avant l'attaque, les réactions que la cible et ses alliés peuvent jouer ; le MJ attend leur clic.
  const fichesParPerso = $derived(new Map(persos.etat.elements.map((p) => [p.id, p])));
  const rappel = $derived(cibleId ? rappelAvantAttaque(cibleId, combattants, fichesParPerso) : []);
  const principalePrise = $derived(!!montre && !!combat && actionsDuTour(montre, combat.tour).principale);
  const refusPortee = (a: AttaqueMonstre) =>
    montre && cibleId && carte?.zones && protegeParSanctuaire(carte.zones, carte.jetons, montre.id, cibleId)
      ? 'la cible est dans un sanctuaire'
      : montre && cibleId && !outrePortee
        ? horsDePortee(carte?.scene ?? null, carte?.jetons ?? [], montre.id, cibleId, a.portee)
        : null;
  let resultat = $state('');
  // ---- États (L6.3, 4b) ----
  const posables = etatsPosables();
  let poseEtat = $state('');
  let poseRounds = $state<number | null>(1);
  async function etatAgir(f: () => Promise<unknown>) {
    message = '';
    occupe = true;
    try {
      await f();
      poseEtat = '';
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
  async function attaquerInvocation(a: AttaqueMonstre, cible: (typeof combattants)[number]) {
    if (!montre || !combat || !idCombat) return;
    message = '';
    resultat = '';
    occupe = true;
    try {
      const defEnPlus = a.portee.vue && carte?.zones ? couverture(carte.zones, carte.jetons, cible.id) : 0;
      const r = await attaqueSurInvocation(idCombat, combat, montre, { ...a, defEnPlus }, cible);
      resultat = r.net === null ? `${a.nom} : raté (${r.issue.total} contre DEF ${r.issue.def}).` : `${a.nom} : touché, ${r.net} dégâts → ${cible.nom} ${r.pv} PV.`;
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
  /** L6.6a (6b) : les jets qui restent d'une attaque à plusieurs jets, sur la même cible. */
  let suiteJet = $state<{ nom: string; cible: string; reste: number } | null>(null);
  $effect(() => {
    void montre?.id;
    suiteJet = null;
  });
  async function attaquerPj(a: AttaqueMonstre) {
    if (cibleInv) return attaquerInvocation(a, cibleInv);
    const cible = ciblePj;
    const f = cible?.c.perso ? persos.etat.elements.find((p) => p.id === cible.c.perso) : undefined;
    if (!montre || !combat || !idCombat || !cible || !f) return;
    message = '';
    resultat = '';
    occupe = true;
    try {
      // L6.4b1 (11a) : la couverture du PJ contre une attaque à distance.
      const defEnPlus = a.portee.vue && carte?.zones ? couverture(carte.zones, carte.jetons, cible.c.id) : 0;
      const r = suiteJet || demon ? await attaqueDeMonstre(idCombat, combat, montre, { ...a, defEnPlus }, cible.c, f, Math.random, false, !!suiteJet, demon) : await attaqueDeMonstre(idCombat, combat, montre, { ...a, defEnPlus }, cible.c, f);
      // L6.6a (6b) : une attaque à plusieurs jets attend les suivants ; repoussé, son jeton recule.
      suiteJet = suiteJet ? (suiteJet.reste > 1 ? { ...suiteJet, reste: suiteJet.reste - 1 } : null) : a.effet?.jets ? { nom: a.nom, cible: cible.c.id, reste: a.effet.jets - 1 } : null;
      if (r.repousse && carte) await repousserDe(r.repousse, idCombat, combat, montre, cible.c, carte, combattants, fichesParPerso, montre.nom);
      // L6.4b2 (1a) : touché, il fait sa sauvegarde de CON pour maintenir sa concentration.
      if (r.issue.touche && cible.c.concentration) await maintenirConcentration(idCombat, combat.scene, cible.c, f, r.net ?? 0, combattants, montre.nom);
      resultat =
        r.net === null
          ? `${a.nom} : raté (${r.issue.echecCritique ? '1 naturel' : `${r.issue.total} contre CA ${r.issue.def}`}).`
          : `${a.nom} : ${r.issue.critique ? 'critique' : 'touché'}, ${r.net} dégâts → ${f.nom} ${r.pv} PV${r.pv <= 0 ? ', Mourant' : ''}${r.etat ? `, ${texteEtat({ id: r.etat, rounds: a.etatSurTouche?.duree ?? null, cumul: 1, charges: null, des: null, source: null })}` : ''}.`;
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }

  // ---- Sauvegardes du monstre (L6.4a, 8a) ----
  let sauv = $state<{ FOR: number; DEX: number; CON: number; Volonte: number } | null>(null);
  $effect(() => {
    sauv = montre?.genre === 'monstre' ? { ...(montre.sauvegardes ?? { FOR: 0, DEX: 0, CON: 0, Volonte: 0 }) } : null;
  });
  const NOMS_SAUV = [['FOR', 'FOR'], ['DEX', 'DEX'], ['CON', 'CON'], ['Volonte', 'Vol.']] as const;

  let montant = $state(1);
  let message = $state('');
  let occupe = $state(false);
  async function pv(sens: 1 | -1) {
    if (!montre || !combat || !idCombat) return;
    message = '';
    occupe = true;
    try {
      await ajusterPvMonstre(idCombat, combat.scene, montre, sens * Math.max(0, montant));
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
</script>

{#snippet etatsDe(c: (typeof combattants)[number])}
  {#if c.bonus.length}
    <h3>Bonus</h3>
    <ul class="etats" aria-label="Bonus de {c.nom}">
      {#each c.bonus as b, i (i)}<li><span><strong>{texteBonus(b)}</strong>{b.source ? ` · ${b.source}` : ''}</span></li>{/each}
    </ul>
  {/if}
  <h3>États</h3>
  {#if c.etats.length}
    <ul class="etats" aria-label="États de {c.nom}">
      {#each c.etats as e (e.id)}
        <li title={regleEtat(e.id)}>
          <span><strong>{texteEtat(e)}</strong>{e.source ? ` · ${e.source}` : ''}</span>
          <button class="petit discret" aria-label="Retirer {texteEtat(e)}" disabled={occupe} onclick={() => etatAgir(() => retirerEtatDe(idCombat!, c, e.id))}>Retirer</button>
        </li>
      {/each}
    </ul>
  {:else}
    <p class="aide">Aucun état.</p>
  {/if}
  <form class="poser" onsubmit={(e) => (e.preventDefault(), poseEtat && etatAgir(() => poserEtatSur(idCombat!, c, poseEtat, poseRounds, 'MJ')))}>
    <select aria-label="État à poser" bind:value={poseEtat}>
      <option value="">Poser un état…</option>
      {#each posables as p (p.id)}<option value={p.id}>{p.nom}</option>{/each}
    </select>
    <input type="number" min="1" max="99" aria-label="Rounds" placeholder="∞" bind:value={poseRounds} />
    <button class="petit" disabled={occupe || !poseEtat}>Poser</button>
  </form>
{/snippet}

{#if combat && combat.statut === 'encours' && montre}
  <div class="colonne">
    <section class="carte panneau" class:monstre={montre.genre === 'monstre'} aria-label="Combattant choisi">
      <label class="choix"
        >Combattant
        <select value={montre.id} onchange={(e) => (choisi = e.currentTarget.value)}>
          {#each combattants as c (c.id)}<option value={c.id}>{c.nom}{c.id === combat.actif ? ' (joue)' : ''}</option>{/each}
        </select>
      </label>
      <h2>{montre.nom}</h2>
      {#if montre.genre !== 'pj' && montre.pv !== null && montre.pvMax !== null}
        <div class="jauge">
          <div class="fond"><div class="plein" style:width="{(Math.max(0, montre.pv) / montre.pvMax) * 100}%"></div></div>
          <strong data-testid="pv-monstre">{montre.pv}/{montre.pvMax} PV</strong>
        </div>
        <div class="reglage">
          <button aria-label="Retirer des PV" disabled={occupe} onclick={() => pv(-1)}>−</button>
          <input type="number" min="0" max="999" aria-label="PV à ajouter ou retirer" bind:value={montant} />
          <button aria-label="Rendre des PV" disabled={occupe} onclick={() => pv(1)}>+</button>
          {#if montre.aTerre}<span class="aide">à terre</span>{/if}
        </div>
        <div class="pastilles">
          <span>DEF {defMontre}</span>
          <span>Init {signe(montre.modInit)}</span>
          {#if montre.armure}<span>Armure {montre.armure}</span>{/if}
          {#if montre.resistances.physique !== 1}<span>Physique ×{String(montre.resistances.physique).replace('.', ',')}</span>{/if}
          {#if montre.resistances.magique !== 1}<span>Magie ×{String(montre.resistances.magique).replace('.', ',')}</span>{/if}
          {#if montre.pvTemp}<span>PV temp. {montre.pvTemp}</span>{/if}
        </div>
        {#if sauv}
          <form class="sauvegardes" aria-label="Sauvegardes" onsubmit={(e) => (e.preventDefault(), sauv && etatAgir(() => corrigerSauvegardes(idCombat!, montre, sauv!)))}>
            <span class="aide">{montre.sauvegardes ? 'Sauvegardes' : 'Sauvegardes à donner (+0)'}</span>
            {#each NOMS_SAUV as [k, n] (k)}
              <label>{n} <input type="number" min="-10" max="40" aria-label="Sauvegarde {n}" bind:value={sauv[k]} /></label>
            {/each}
            <button class="petit" disabled={occupe}>Corriger</button>
          </form>
        {/if}
        {#if montre.invocation}
          <p class="aide">Invocation de {nomDe(montre.maitre)}{montre.invocation.rounds ? ` · ${montre.invocation.rounds} round${montre.invocation.rounds > 1 ? 's' : ''}` : ''}{montre.invocation.remous ? ` · Remous ${montre.invocation.remous} PP` : ''}{montre.invocation.objet ? ' · un objet : toute attaque la touche' : ''}</p>
        {:else if modele}
          <h3>Attaques</h3>
          {#if ciblesPj.length || ciblesInv.length}
            <label class="choix"
              >Cible
              <select value={cibleId ?? ''} onchange={(e) => (cibleChoisie = e.currentTarget.value)}>
                {#each ciblesPj as { c, v } (c.id)}<option value={c.id}>{c.nom} · CA {defenseVisee(v.stats.ca, c.etats, c.bonus)} · {v.pv.actuel}/{v.pv.max} PV</option>{/each}
                {#each ciblesInv as c (c.id)}<option value={c.id}>{texteInvocation(c)} · DEF {c.def === null ? '—' : defenseVisee(c.def, c.etats, c.bonus)} · {c.pv}/{c.pvMax} PV</option>{/each}
              </select>
            </label>
          {/if}
          <div class="attaques">
            {#each attaquesMonstre as a, i (i)}
              {@const refus = refusPortee(a)}
              {@const limite = refusDeLimite(montre, a.nom, limiteDeLAttaque(a.effet ?? null), combat.round)}
              {@const effet = texteEffetAttaque(a.effet ?? null, a.texte ?? null)}
              <button disabled={occupe || !cibleId || principalePrise || !!refus || !!limite || !!suiteJet} onclick={() => attaquerPj(a)}>{a.nom} {signe(a.bonus)} · {a.formule}</button>
              {#if effet}<span class="aide effet">{effet}</span>{/if}
              {#if refus}<span class="aide">{refus}</span>{/if}
              {#if limite}<span class="aide">{a.nom} : {limite}.</span>{/if}
              {#if suiteJet?.nom === a.nom}
                <button disabled={occupe || cibleId !== suiteJet.cible} onclick={() => attaquerPj(a)}>{a.nom} : jet suivant ({suiteJet.reste})</button>
              {/if}
            {:else}
              <p class="aide">Aucune attaque dont l'arme est dans la liste des armes.</p>
            {/each}
          </div>
          {#if rappel.length}
            <p class="rappel" role="note" aria-label="Réactions possibles">
              Avant l’attaque, ils peuvent réagir : {rappel.map((r) => `${r.nom} (${r.reactions.join(', ')})`).join(' ; ')}.
            </p>
          {/if}
          <label class="case"><input type="checkbox" bind:checked={outrePortee} /> Passer outre la portée</label>
          <CapacitesMj idCombat={idCombat!} {combat} monstre={montre} {modele} {combattants} fiches={fichesParPerso} {carte} {demon} modeles={bestiaire.etat.elements} {reductions} />
          {#if principalePrise}<p class="aide">Action principale prise ce tour.</p>{/if}
          {#if resultat}<p role="status">{resultat}</p>{/if}
        {:else}
          <p class="aide">Monstre posé à la main : pas de fiche de bestiaire, ses attaques se jouent au journal.</p>
        {/if}
        {@render etatsDe(montre)}
      {:else if vue}
        <div class="pastilles">
          <span>PV {vue.pv.actuel}/{vue.pv.max}</span>
          {#if vue.pp}<span>PP {vue.pp.actuel}/{vue.pp.max}</span>{/if}
          <span>CA {vue.stats.ca}</span>
          <span>Init {signe(vue.stats.initiative)}</span>
          {#if montre.pvTemp}<span>PV temp. {montre.pvTemp}</span>{/if}
        </div>
        {#if montre.concentration}
          <p class="concentration" role="status">
            Concentration : <strong>{texteConcentration(montre.concentration)}</strong>
            <button class="petit discret" disabled={occupe} onclick={() => etatAgir(() => finirConcentration(idCombat!, combat.scene, montre, combattants, 'rompue par le MJ', 'MJ'))}>Rompre</button>
          </p>
        {/if}
        {@render etatsDe(montre)}
      {/if}
      {#if message}<p class="erreur" role="alert">{message}</p>{/if}
    </section>

    {#if idCombat}<ReactionsMj {idCombat} {combat} {combattants} fiches={fichesParPerso} bestiaire={bestiaire.etat.elements} armes={listeArmes} {carte} />{/if}

    {#if zonesCombat.length}
      <section class="carte pjs" aria-label="Zones au sol">
        <h2>Zones au sol</h2>
        <ul>
          {#each zonesCombat as z (z.id)}
            <li>
              <span>{texteZone(z)} · {nomDe(z.lanceur)}{z.usageUnique ? ' · piège' : ''}</span>
              <button class="petit discret" aria-label="Retirer {texteZone(z)}" disabled={occupe} onclick={() => etatAgir(() => retirerZone({ combat: idCombat! }, z.id))}>Retirer</button>
            </li>
          {/each}
        </ul>
      </section>
    {/if}

    <section class="carte pjs" aria-label="Les PJ du combat">
      <h2>Les PJ</h2>
      <ul>
        {#each pjs as { c, v } (c.id)}
          {@const e = etatPj(v.pv.actuel, c)}
          <li>
            <span>{c.nom}</span><span
              >{e === 'mort' ? 'mort' : e === 'mourant' ? `Mourant ${c.mortSucces}✓ ${c.mortEchecs}✗` : `${v.pv.actuel}/${v.pv.max} PV`}{v.pp ? ` · ${v.pp.actuel}/${v.pp.max} PP` : ''}{c.initiative === null
                ? ' · initiative à lancer'
                : ''}</span
            >
          </li>
        {/each}
      </ul>
    </section>
  </div>
{/if}

<style>
  .colonne {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .panneau,
  .pjs {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .panneau.monstre {
    border: 2px solid var(--couleur-danger);
  }
  h2 {
    font-size: 20px;
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
  .jauge {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .fond {
    flex: 1;
    height: 12px;
    border-radius: 999px;
    background: var(--couleur-danger-pale);
    overflow: hidden;
  }
  .plein {
    height: 100%;
    background: var(--couleur-danger);
  }
  .reglage {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .reglage button {
    min-width: 44px;
  }
  .reglage input {
    width: 64px;
    text-align: center;
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
  .attaques {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .etats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .etats li {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 6px;
  }
  .poser {
    display: flex;
    gap: 6px;
  }
  .sauvegardes {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    font-size: 13px;
  }
  .sauvegardes input {
    width: 52px;
  }
  .poser select {
    flex: 1;
    min-width: 0;
  }
  .poser input {
    width: 56px;
  }
  .effet {
    font-size: 12px;
  }
  .rappel {
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--couleur-accent-pale);
    font-size: 13px;
  }
  .case {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
  }
  ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 14px;
  }
  li {
    display: flex;
    justify-content: space-between;
    gap: 8px;
  }
</style>
