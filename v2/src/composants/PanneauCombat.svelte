<script lang="ts">
  import { onDestroy } from 'svelte';
  import { attaqueDeMonstre, poserEtatSur, retirerEtatDe } from '../lib/actions/attaques';
  import { ajusterPvMonstre, RefusCombat } from '../lib/actions/combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { attaquesDuMonstre, horsDePortee, type AttaqueMonstre, type CarteDuCombat } from '../lib/combat/attaque';
  import { ciblable, etatsPosables, regleEtat, texteEtat } from '../lib/combat/etats';
  import { etatPj } from '../lib/combat/mort';
  import { actionsDuTour, ordreCombat } from '../lib/combat/ordre';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreArmesMonstres, suivreBestiaire } from '../lib/magasins/bestiaire.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreCombat, suivreCombattants } from '../lib/magasins/combat.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import { session } from '../lib/session.svelte';

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
   */

  let { carte = null }: { carte?: CarteDuCombat | null } = $props();

  const table = suivreTable(session.table);
  const persos = suivrePersos(session.table);
  const bestiaire = suivreBestiaire(session.table);
  const armes = suivreArmesMonstres(session.table);
  onDestroy(() => {
    table.arreter();
    persos.arreter();
    bestiaire.arreter();
    armes.arreter();
  });
  const idCombat = $derived(table.etat.donnees?.combat ?? null);
  let suivi = $state<{ c: DocumentSuivi<Combat>; m: CollectionSuivie<Combattant> } | null>(null);
  $effect(() => {
    if (!idCombat) return;
    const x = { c: suivreCombat(session.table, idCombat), m: suivreCombattants(session.table, idCombat) };
    suivi = x;
    return () => {
      x.c.arreter();
      x.m.arreter();
      suivi = null;
    };
  });
  const combat = $derived(suivi?.c.etat.donnees ?? null);
  const combattants = $derived(ordreCombat(suivi?.m.etat.elements ?? []));
  let choisi = $state('');
  const montre = $derived(combattants.find((c) => c.id === choisi) ?? combattants.find((c) => c.id === combat?.actif) ?? combattants[0] ?? null);
  const modele = $derived(montre?.monstre ? (bestiaire.etat.elements.find((m) => m.id === montre.monstre) ?? null) : null);
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

  // ---- Attaques du monstre (L6.2, 6a) ----
  const listeArmes = $derived(new Map((armes.etat.donnees?.liste ?? []).map((a) => [a.id, a])));
  const attaquesMonstre = $derived(modele ? attaquesDuMonstre(modele.attaques, listeArmes) : []);
  const ciblesPj = $derived(pjs.filter(({ c, v }) => etatPj(v.pv.actuel, c) !== 'mort' && ciblable(c.etats)));
  let cibleChoisie = $state('');
  const ciblePj = $derived(ciblesPj.find((x) => x.c.id === cibleChoisie) ?? ciblesPj[0] ?? null);
  let outrePortee = $state(false);
  const principalePrise = $derived(!!montre && !!combat && actionsDuTour(montre, combat.tour).principale);
  const refusPortee = (a: AttaqueMonstre) => (montre && ciblePj && !outrePortee ? horsDePortee(carte?.scene ?? null, carte?.jetons ?? [], montre.id, ciblePj.c.id, a.portee) : null);
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
  async function attaquerPj(a: AttaqueMonstre) {
    const cible = ciblePj;
    const f = cible?.c.perso ? persos.etat.elements.find((p) => p.id === cible.c.perso) : undefined;
    if (!montre || !combat || !idCombat || !cible || !f) return;
    message = '';
    resultat = '';
    occupe = true;
    try {
      const r = await attaqueDeMonstre(idCombat, combat, montre, a, cible.c, f);
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
      {#if montre.genre === 'monstre' && montre.pv !== null && montre.pvMax !== null}
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
          <span>DEF {montre.def}</span>
          <span>Init {signe(montre.modInit)}</span>
          {#if montre.armure}<span>Armure {montre.armure}</span>{/if}
          {#if montre.resistances.physique !== 1}<span>Physique ×{String(montre.resistances.physique).replace('.', ',')}</span>{/if}
          {#if montre.resistances.magique !== 1}<span>Magie ×{String(montre.resistances.magique).replace('.', ',')}</span>{/if}
        </div>
        {#if modele}
          <h3>Attaques</h3>
          {#if ciblesPj.length}
            <label class="choix"
              >Cible
              <select value={ciblePj?.c.id ?? ''} onchange={(e) => (cibleChoisie = e.currentTarget.value)}>
                {#each ciblesPj as { c, v } (c.id)}<option value={c.id}>{c.nom} · CA {v.stats.ca} · {v.pv.actuel}/{v.pv.max} PV</option>{/each}
              </select>
            </label>
          {/if}
          <div class="attaques">
            {#each attaquesMonstre as a, i (i)}
              {@const refus = refusPortee(a)}
              <button disabled={occupe || !ciblePj || principalePrise || !!refus} onclick={() => attaquerPj(a)}>{a.nom} {signe(a.bonus)} · {a.formule}</button>
              {#if refus}<span class="aide">{refus}</span>{/if}
            {:else}
              <p class="aide">Aucune attaque dont l'arme est dans la liste des armes.</p>
            {/each}
          </div>
          <label class="case"><input type="checkbox" bind:checked={outrePortee} /> Passer outre la portée</label>
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
        </div>
        {@render etatsDe(montre)}
      {/if}
      {#if message}<p class="erreur" role="alert">{message}</p>{/if}
    </section>

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
  .poser select {
    flex: 1;
    min-width: 0;
  }
  .poser input {
    width: 56px;
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
