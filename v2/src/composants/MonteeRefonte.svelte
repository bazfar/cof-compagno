<script lang="ts">
  import { noterJet } from '../lib/actions/journal';
  import { monterNiveauRefonte } from '../lib/actions/montee';
  import { messageErreurPerso } from '../lib/actions/persos';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import * as M from '../lib/fiche/montee-refonte';
  import { classeDeLaRefonte } from '../lib/fiche/refonte';
  import * as C from '../lib/regles/creation';
  import { constantes, donParId, dons, raceParId } from '../lib/regles/donnees';
  import type { FicheV2 } from '../lib/schemas/fiche';
  import ChoixRefonte from './ChoixRefonte.svelte';

  /*
   * Montée de niveau d'un personnage de la refonte (lot L4.11b, décision
   * 11a). Même déroulé que MonteeNiveau (dé de vie au journal, rangs
   * raciaux, dons), mais l'étape Voies est celle de la refonte
   * (ChoixRefonte) : les choix déjà faits sont figés, sans bouton pour les
   * retirer. Aucune règle ici : chaque geste appelle
   * lib/fiche/montee-refonte.ts, l'écriture actions/montee.ts.
   */

  let { fiche, surFin }: { fiche: AvecId<FicheV2>; surFin: (message: string) => void } = $props();

  // svelte-ignore state_referenced_locally -- la montée part de la fiche à l'ouverture
  let m = $state<M.MonteeRefonte>(M.ouvrirMonteeRefonte(fiche));
  let refus = $state('');
  let enCours = $state(false);

  function geste(f: (x: M.MonteeRefonte) => M.MonteeRefonte) {
    try {
      m = f($state.snapshot(m) as M.MonteeRefonte);
      refus = '';
    } catch (e) {
      if (e instanceof M.RefusMontee) refus = e.message;
      else throw e;
    }
  }

  const b = $derived(m.b);
  const niveau = $derived(b.niveau);
  const classe = $derived(classeDeLaRefonte(m.avant.refonte.classe)!);
  const ctx = $derived(M.contexteMontee(m));
  const neuf = $derived(M.nouveautes(m));
  const erreurs = $derived(M.erreursMontee(m));
  const avertissements = $derived(M.avertissementsMontee(m));
  const apercu = $derived(M.apercuMontee(m));
  const race = $derived(b.race ? raceParId.get(b.race) : undefined);
  const nomDon = (id: string) => donParId.get(id)?.nom ?? id;
  const CARACS = constantes.caracs;
  const JAUGES = [['endurance', 'Endurance'], ['inspiration', 'Inspiration'], ['sacre', 'Sacré']] as const;

  let donChoisi = $state('');
  let choixAthlete = $state('FOR');
  let choixAmelioration = $state<[string, string]>(['FOR', 'DEX']);

  async function lancerPV() {
    geste((x) => M.lancerPV(x));
    if (refus || m.jetPV === null) return;
    const faces = C.facesDeVie(b);
    try {
      await noterJet(`PV du niveau ${niveau}`, `1d${faces}`, { des: [m.jetPV], faces, bonus: 0, total: m.jetPV }, fiche.nom);
    } catch (e) {
      refus = `Jet non noté au journal : ${messageErreurPerso(e)}`;
    }
  }

  function prendreDon() {
    const choix = donChoisi === 'athlete' ? choixAthlete : donChoisi === 'amelioration_carac' ? [...choixAmelioration] : undefined;
    geste((x) => M.prendreDon(x, donChoisi, choix));
    if (!refus) donChoisi = '';
  }

  async function valider() {
    refus = '';
    enCours = true;
    try {
      const r = await monterNiveauRefonte(fiche.id, $state.snapshot(m) as M.MonteeRefonte);
      surFin(`${fiche.nom} passe au niveau ${r.fiche.niveau} (${r.pvGagnes >= 0 ? '+' : ''}${r.pvGagnes} PV max).`);
    } catch (e) {
      refus = e instanceof M.RefusMontee ? e.message : messageErreurPerso(e);
    } finally {
      enCours = false;
    }
  }
</script>

<section class="montee" aria-label="Montée de niveau">
  <div class="tete">
    <h3>Niveau {fiche.niveau} → {niveau}</h3>
    <span class="espace"></span>
    <button class="discret" onclick={() => surFin('')}>Annuler</button>
  </div>
  {#if refus}<p class="refus" role="alert">{refus}</p>{/if}

  <h4>Points de vie</h4>
  {#if m.jetPV === null}
    <button onclick={lancerPV}>Lancer le dé de vie (d{C.facesDeVie(b)})</button>
  {:else}
    <p data-testid="jet-pv">Dé de vie : <strong>{m.jetPV}</strong>{#if apercu}{` — PV max ${fiche.pvMax} → `}<strong>{apercu.fiche.pvMax}</strong>{/if}</p>
    {#if apercu}
      {#each JAUGES.filter(([k]) => apercu.fiche.refonte.jauges[k] !== null) as [k, nom] (k)}
        <p class="aide">{nom} : {fiche.refonte.jauges[k]} → {apercu.fiche.refonte.jauges[k]}</p>
      {/each}
    {/if}
  {/if}

  {#if race && (neuf.rangsRace.length || C.choixRaciauxRequis(b).some(([r]) => !(String(r) in m.avant.capacitesRaceChoix)) || (C.varianteRequise(b) && !m.avant.raceVariante))}
    <h4>{race.voie.nom}</h4>
    {#each neuf.rangsRace as rang (rang)}
      {@const r = race.voie.rangs.find((x) => x.rang === rang)}
      <p><strong>Rang {rang} : {r?.nom}</strong> <span class="aide">acquis d'office</span> <span class="effet">{r?.effet}</span></p>
    {/each}
    {#each C.choixRaciauxRequis(b).filter(([r]) => !(String(r) in m.avant.capacitesRaceChoix)) as [rang, options] (rang)}
      <label>
        Choix du rang {rang}
        <select aria-label={`Choix du rang racial ${rang}`} value={b.capacitesRaceChoix[String(rang)] ?? ''} onchange={(ev) => geste((x) => M.choisirOptionRaciale(x, rang, ev.currentTarget.value))}>
          <option value="" disabled>—</option>
          {#each options as o (o)}<option value={o}>{o}</option>{/each}
        </select>
      </label>
    {/each}
    {#if C.varianteRequise(b) && !m.avant.raceVariante}
      <label>
        Nation
        <select aria-label="Nation" value={b.raceVariante ?? ''} onchange={(ev) => geste((x) => M.choisirVariante(x, ev.currentTarget.value || null))}>
          <option value="">—</option>
          {#each race.variantes as v (v.code)}<option value={v.code}>{v.nom}</option>{/each}
        </select>
      </label>
    {/if}
  {/if}

  <h4>Voies</h4>
  <ChoixRefonte {classe} r={m.r} {ctx} fige={m.avant.refonte} surGeste={(g) => geste((x) => M.appliquerGeste(x, g))} />

  {#if C.donsRequis(b) > m.avant.dons.length}
    <h4>Dons</h4>
    <p>Dons : {b.dons.length} / {C.donsRequis(b)}</p>
    <ul class="liste">
      {#each neuf.dons as d (d)}
        <li>{nomDon(d)} {#if b.donsChoix[d]}<span class="badge">{String(b.donsChoix[d])}</span>{/if}
          <button class="petit discret" onclick={() => geste((x) => M.retirerDon(x, d))}>Retirer</button></li>
      {/each}
    </ul>
    {#if b.dons.length < C.donsRequis(b)}
      <div class="ligne">
        <select aria-label="Don" bind:value={donChoisi}>
          <option value="">Choisir un don…</option>
          {#each dons.filter((d) => !b.dons.includes(d.id)) as d (d.id)}<option value={d.id}>{d.nom} ({d.categorie})</option>{/each}
        </select>
        {#if donChoisi === 'athlete'}
          <select aria-label="Choix d'Athlète" bind:value={choixAthlete}><option>FOR</option><option>DEX</option></select>
        {:else if donChoisi === 'amelioration_carac'}
          <select aria-label="Première caractéristique" bind:value={choixAmelioration[0]}>{#each CARACS as c (c.code)}<option>{c.code}</option>{/each}</select>
          <select aria-label="Seconde caractéristique" bind:value={choixAmelioration[1]}>{#each CARACS as c (c.code)}<option>{c.code}</option>{/each}</select>
        {/if}
        <button disabled={!donChoisi} onclick={prendreDon}>Prendre</button>
      </div>
      {#if donChoisi}<p class="effet">{donParId.get(donChoisi)?.effet}</p>{/if}
    {/if}
  {/if}
  {#if erreurs.length}
    <ul class="erreurs" aria-label="À compléter">{#each erreurs as e (e)}<li>{e}</li>{/each}</ul>
  {/if}
  {#if avertissements.length}
    <ul class="avertissements" aria-label="À noter">{#each avertissements as a (a)}<li>{a}</li>{/each}</ul>
  {/if}
  <button onclick={valider} disabled={erreurs.length > 0 || enCours}>Passer au niveau {niveau}</button>
</section>

<style>
  .montee {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
    border: 1px solid var(--couleur-accent-clair);
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
  }
  .tete,
  .ligne {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .espace {
    flex: 1;
  }
  h3 {
    font-size: 20px;
  }
  h4 {
    margin: 6px 0 0;
    font-size: 16px;
  }
  ul {
    margin: 0;
    padding-left: 18px;
  }
  .effet,
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-or);
    color: #fff;
  }
  p {
    margin: 0;
  }
  .petit {
    min-height: 32px;
    padding: 0 10px;
  }
  .discret {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .refus,
  .erreurs {
    color: var(--couleur-danger);
  }
</style>
