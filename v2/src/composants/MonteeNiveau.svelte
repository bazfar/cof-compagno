<script lang="ts">
  import { noterJet } from '../lib/actions/journal';
  import { monterNiveau } from '../lib/actions/montee';
  import { messageErreurPerso } from '../lib/actions/persos';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import * as C from '../lib/regles/creation';
  import { constantes, donParId, dons, raceParId, sortParId, voieParId, classeParId } from '../lib/regles/donnees';
  import * as M from '../lib/regles/montee';
  import type { Fiche } from '../lib/schemas/fiche';

  /*
   * Montée de niveau guidée (lot L2.5b, décision 3a). L'écran n'applique
   * AUCUNE règle lui-même : chaque geste appelle regles/montee.ts, qui rend
   * la montée suivante ou un refus expliqué, affiché tel quel. Les choix
   * déjà acquis s'affichent sans bouton pour les retirer.
   *
   * Le dé de vie part au journal commun dès qu'il est lancé : toute la table
   * le voit, comme les autres jets.
   */

  let { fiche, surFin }: { fiche: AvecId<Fiche>; surFin: (message: string) => void } = $props();

  // svelte-ignore state_referenced_locally -- la montée part de la fiche à l'ouverture
  let m = $state<M.Montee>(M.ouvrirMontee(fiche));
  let refus = $state('');
  let enCours = $state(false);

  function geste(f: (x: M.Montee) => M.Montee) {
    try {
      m = f($state.snapshot(m) as M.Montee);
      refus = '';
    } catch (e) {
      if (e instanceof M.RefusMontee) refus = e.message;
      else throw e;
    }
  }

  const b = $derived(m.b);
  const niveau = $derived(b.niveau);
  const pts = $derived(C.pointsVoie(b));
  const neuf = $derived(M.nouveautes(m));
  const erreurs = $derived(M.erreursMontee(m));
  const avertissements = $derived(M.avertissementsMontee(m));
  const apercu = $derived(M.apercuMontee(m));
  const race = $derived(b.race ? raceParId.get(b.race) : undefined);
  const polyvalence = $derived(C.polyvalenceAcquise(b) && !C.rangOffert(b));
  const nomVoie = (id: string) => voieParId.get(id)?.nom ?? id;
  const nomDon = (id: string) => donParId.get(id)?.nom ?? id;
  const nomSort = (id: string) => sortParId.get(id)?.nom ?? id;
  const CARACS = constantes.caracs;

  let choixCapacite = $state<Record<string, string>>({});
  let voieHorsProfil = $state('');
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
      const r = await monterNiveau(fiche.id, $state.snapshot(m) as M.Montee);
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
  <p>Points de capacité : <strong data-testid="points-montee">{pts.restants}</strong> à dépenser (rangs 1-2 : 1 point ; rangs 3-5 : 2 points ; dans l'ordre).</p>
  {#if polyvalence}<p class="offert">Polyvalence : un rang gratuit à prendre dans une voie de ta classe (bouton « Offert »).</p>{/if}
  <ul class="voies">
    {#each C.voiesOuvertes(b) as idVoie (idVoie)}
      {@const voie = voieParId.get(idVoie)}
      {@const max = C.rangMaxDansVoie(b, idVoie)}
      {@const suivant = voie?.rangs.find((r) => r.rang === max + 1)}
      {@const dernier = b.capacites.find((c) => c.id === `${idVoie}.${max}`)}
      {@const horsProfil = b.voiesHorsProfil.some((h) => h.voie === idVoie)}
      <li>
        <strong>{voie?.nom ?? idVoie}</strong> <span class="aide">rang {max}</span>
        {#if dernier && neuf.capacites.some((c) => c.id === dernier.id)}
          <span class="badge">{voie?.rangs.find((r) => r.rang === max)?.nom}{dernier.offert ? ' (offert)' : ''}</span>
          <button class="petit discret" aria-label={`Retirer ${idVoie}.${max}`} onclick={() => geste((x) => M.retirerRang(x, idVoie, max))}>Retirer</button>
        {/if}
        {#if max === 0 && neuf.voiesHorsProfil.some((h) => h.voie === idVoie)}
          <button class="petit discret" onclick={() => geste((x) => M.annulerHorsProfil(x, idVoie))}>Annuler le déblocage</button>
        {/if}
        {#if suivant}
          {@const options = C.CHOIX_CAPACITES[suivant.id]}
          <div class="suivant">
            <span>{suivant.rang}. {suivant.nom}</span> <span class="effet">{suivant.effet}</span>
            {#if options}
              <select aria-label={`Choix pour ${suivant.id}`} value={choixCapacite[suivant.id] ?? ''} onchange={(ev) => (choixCapacite[suivant.id] = ev.currentTarget.value)}>
                <option value="" disabled>choix…</option>
                {#each options as o (o)}<option value={o}>{o}</option>{/each}
              </select>
            {/if}
            <button class="petit" aria-label={`Prendre ${suivant.id}`} onclick={() => geste((x) => M.prendreRang(x, idVoie, suivant.rang, options ? choixCapacite[suivant.id] : undefined))}>
              Prendre ({suivant.rang >= 3 ? 2 : 1})
            </button>
            {#if polyvalence && !horsProfil}
              <button class="petit" aria-label={`Prendre ${suivant.id} offert`} onclick={() => geste((x) => M.prendreRang(x, idVoie, suivant.rang, options ? choixCapacite[suivant.id] : undefined, true))}>Offert</button>
            {/if}
          </div>
        {/if}
      </li>
    {/each}
  </ul>
  <div class="ligne">
    <select aria-label="Voie hors profil" bind:value={voieHorsProfil}>
      <option value="">Débloquer une voie hors profil…</option>
      {#each C.voiesHorsProfilProposees(b) as id (id)}
        <option value={id}>{nomVoie(id)} ({classeParId.get(voieParId.get(id)?.classe ?? '')?.nom}) — {C.coutHorsProfil(b, id)} pts</option>
      {/each}
    </select>
    <button disabled={!voieHorsProfil} onclick={() => { geste((x) => M.debloquerHorsProfil(x, voieHorsProfil)); voieHorsProfil = ''; }}>Débloquer</button>
  </div>

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

  {#if (b.classe === 'pretre' && !m.avant.cercleSpecialisation) || (C.aUnGrimoire(b.classe) && (C.sortsAChoisir(b) > 0 || neuf.sorts.length > 0))}
    <h4>Magie</h4>
    {#if b.classe === 'pretre' && !m.avant.cercleSpecialisation}
      <label>
        Cercle
        <select aria-label="Cercle" value={b.cercleSpecialisation ?? ''} onchange={(ev) => geste((x) => M.choisirCercle(x, ev.currentTarget.value || null))}>
          <option value="">Aucun pour l'instant</option>
          {#each C.CERCLES as c (c)}<option value={c}>{c} (sort offert : {nomSort(constantes.cercleSortGratuit[c] ?? '')})</option>{/each}
        </select>
      </label>
    {/if}
    {#if C.aUnGrimoire(b.classe)}
      <p>Sorts à apprendre : <strong data-testid="sorts-montee">{Math.max(0, C.sortsAChoisir(b))}</strong></p>
      <ul class="liste">
        {#each neuf.sorts as s (s)}
          <li>{nomSort(s)} <button class="petit discret" onclick={() => geste((x) => M.oublierSort(x, s))}>Oublier</button></li>
        {/each}
      </ul>
      {#if C.sortsAChoisir(b) > 0}
        <ul class="liste">
          {#each C.sortsProposes(b) as s (s)}
            {@const sort = sortParId.get(s)}
            <li>
              <strong>{sort?.nom}</strong> <span class="aide">rang {sort?.rang}, {sort?.categorie}</span>
              <span class="effet">{sort?.effet}</span>
              <button class="petit" aria-label={`Apprendre ${sort?.nom}`} onclick={() => geste((x) => M.apprendreSort(x, s))}>Apprendre</button>
            </li>
          {/each}
        </ul>
      {/if}
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
  .voies li {
    margin-bottom: 6px;
  }
  .suivant {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
    margin-top: 2px;
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
  .offert {
    color: var(--couleur-succes);
  }
</style>
