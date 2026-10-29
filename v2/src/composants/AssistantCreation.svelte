<script lang="ts">
  import { marquerImportRepris } from '../lib/actions/imports';
  import { creerPerso, enregistrerPortrait, messageErreurPerso, nouvelIdPerso } from '../lib/actions/persos';
  import { garderBrouillon, lireBrouillon, oublierBrouillon } from '../lib/creation/brouillon-local';
  import * as K from '../lib/fiche/creation-refonte';
  import * as RF from '../lib/fiche/refonte';
  import { statistiquesFiche } from '../lib/regles/calculs';
  import * as R from '../lib/regles/creation';
  import { anciensChoixLisibles } from '../lib/regles/import-v1';
  import { classeParId, constantes, donParId, dons, raceParId } from '../lib/regles/donnees';
  import type { Carac } from '../lib/regles/fiche-calcul';
  import { session } from '../lib/session.svelte';
  import ChoixRefonte from './ChoixRefonte.svelte';

  /*
   * Assistant de création de personnage (lot L2.2b). L'écran n'applique
   * AUCUNE règle lui-même : chaque geste appelle une fonction de
   * lib/regles/creation.ts, qui rend le brouillon suivant ou un refus
   * expliqué, affiché tel quel. Les étapes se parcourent librement ; seul
   * « Créer le personnage » exige un brouillon complet.
   *
   * Le brouillon est gardé dans le navigateur à chaque geste et effacé à la
   * création (bug v1 : il ne l'était jamais).
   *
   * `depart` (L2.2c) : brouillon de reprise d'une fiche v1. Classe, race,
   * niveau et caractéristiques y sont verrouillés (les règles refusent d'y
   * toucher) ; les anciens choix s'affichent à côté.
   *
   * Refonte (L4.11b, décision 10a) : pour une classe refondue, l'étape
   * Voies montre les choix de la refonte (ChoixRefonte, gestes de
   * lib/fiche/creation-refonte.ts), l'étape Magie disparaît, et « Créer »
   * écrit une fiche de la refonte. Les anciens choix v1 restent affichés
   * pour mémoire, sans « Reprendre » : leurs voies n'existent plus.
   *
   * Lot L6.7a (12b, décision de Thomas du 29/10/2026) : toutes les classes
   * passent par la refonte ; la branche v1 (voies v1, voies hors profil,
   * Polyvalence, étape Magie, « Reprendre mes anciens choix ») est retirée.
   */

  let {
    surCree,
    surAnnuler,
    depart = null,
  }: { surCree: (id: string) => void; surAnnuler: () => void; depart?: R.Brouillon | null } = $props();

  const ETAPES = ['Identité', 'Caractéristiques', 'Voies', 'PV et dons', 'Récapitulatif'] as const;
  type Etape = (typeof ETAPES)[number];

  // svelte-ignore state_referenced_locally -- `depart` ne sert qu'à l'ouverture
  const idReprise = depart?.reprise?.idImport;
  // svelte-ignore state_referenced_locally
  let b = $state<R.Brouillon>(lireBrouillon(session.table, session.uid, idReprise) ?? depart ?? R.brouillonVide());
  let etape = $state<Etape>('Identité');
  let refus = $state('');
  let enCours = $state(false);

  $effect(() => garderBrouillon(session.table, session.uid, $state.snapshot(b) as R.Brouillon));

  /** Applique un geste ; un refus des règles s'affiche, sans rien changer. */
  function geste(f: (x: R.Brouillon) => R.Brouillon) {
    try {
      b = f($state.snapshot(b) as R.Brouillon);
      refus = '';
    } catch (e) {
      if (e instanceof R.RefusCreation) refus = e.message;
      else throw e;
    }
  }

  const CARACS = constantes.caracs;
  const calc = $derived(R.ficheCalculDuBrouillon(b));
  const stats = $derived(statistiquesFiche(calc));
  const caracs = $derived(R.caracsDuBrouillon(b));
  const erreurs = $derived(K.erreursCreationRefonte(b));
  const avertissements = $derived(K.avertissementsCreationRefonte(b));
  const race = $derived(b.race ? raceParId.get(b.race) : undefined);
  const rangsRace = $derived(R.capacitesRaceDuBrouillon(b));
  const anciens = $derived(b.reprise ? anciensChoixLisibles(b.reprise.anciens) : null);
  const refondue = $derived(K.classeDuBrouillon(b));
  const refonte = $derived(K.refonteDuBrouillon(b));
  const ctxRefonte = $derived(refondue ? K.contexteDuBrouillon(b, refondue) : null);
  const erreursVoiesRefonte = $derived(refondue && refonte && ctxRefonte ? RF.erreursRefonte(refondue, refonte, ctxRefonte) : []);
  const nomDon = (id: string) => donParId.get(id)?.nom ?? id;
  const signe = (n: number | null) => (n === null ? '—' : n >= 0 ? `+${n}` : String(n));

  // Choix en attente pour les dons qui en demandent un.
  let donChoisi = $state('');
  let choixAthlete = $state('FOR');
  let choixAmelioration = $state<[string, string]>(['FOR', 'DEX']);

  function prendreDon() {
    const choix = donChoisi === 'athlete' ? choixAthlete : donChoisi === 'amelioration_carac' ? [...choixAmelioration] : undefined;
    geste((x) => R.prendreDon(x, donChoisi, choix));
    if (!refus) donChoisi = '';
  }

  function recommencer() {
    if (!confirm(depart ? 'Annuler tes choix et repartir de la fiche v1 ?' : 'Effacer cette création et repartir de zéro ?')) return;
    oublierBrouillon(session.table, session.uid, idReprise);
    b = depart ? structuredClone($state.snapshot(depart) as R.Brouillon) : R.brouillonVide();
    etape = 'Identité';
    refus = '';
  }

  async function creer() {
    refus = '';
    enCours = true;
    try {
      const brouillon = $state.snapshot(b) as R.Brouillon;
      const fiche = K.ficheV2DepuisBrouillon(brouillon, session.uid, Date.now());
      const id = nouvelIdPerso();
      await creerPerso(id, fiche);
      // Portrait v1 repris (L2.3) : dans son propre document, après la fiche.
      const portrait = b.reprise?.report.portrait;
      if (portrait) await enregistrerPortrait(id, portrait);
      if (idReprise) await marquerImportRepris(idReprise, id);
      oublierBrouillon(session.table, session.uid, idReprise);
      b = R.brouillonVide();
      etape = 'Identité';
      surCree(id);
    } catch (e) {
      refus = e instanceof R.RefusCreation ? e.message : messageErreurPerso(e);
    } finally {
      enCours = false;
    }
  }

  /** Étapes qui ont encore une erreur bloquante (pastille sur l'onglet). */
  const aFaire = $derived({
    Identité: !b.classe || !b.race || !b.nom.trim() || R.choixRaciauxRequis(b).some(([r]) => !b.capacitesRaceChoix[String(r)]) || (R.varianteRequise(b) && !b.raceVariante),
    Caractéristiques: R.pointsCaracsRestants(b) !== 0,
    Voies: !refondue || erreursVoiesRefonte.length > 0,
    'PV et dons': b.jetsPV.length < b.niveau - 1 || b.dons.length < R.donsRequis(b),
    Récapitulatif: erreurs.length > 0,
  } satisfies Record<Etape, boolean>);
</script>

<section class="carte assistant" aria-label="Création de personnage">
  <div class="tete">
    <h2>{b.reprise ? `Reprise de « ${b.nom} » (v1)` : 'Nouveau personnage'}</h2>
    <span class="espace"></span>
    <button class="discret" onclick={recommencer}>Recommencer</button>
    <button class="discret" onclick={surAnnuler}>Fermer</button>
  </div>

  <nav aria-label="Étapes">
    {#each ETAPES as e (e)}
      <button class="onglet" class:actif={etape === e} aria-current={etape === e ? 'step' : undefined} onclick={() => (etape = e)}>
        {e}{#if aFaire[e]}<span class="pastille" aria-label="à compléter">•</span>{/if}
      </button>
    {/each}
  </nav>

  {#if refus}<p class="refus" role="alert">{refus}</p>{/if}

  {#if anciens && (etape === 'Voies' || etape === 'PV et dons' || etape === 'Identité')}
    <aside class="anciens" aria-label="Anciens choix (v1)">
      <h3>Tes choix en v1</h3>
      <p class="aide">À rechoisir avec les règles actuelles. La voie raciale suit maintenant son propre calendrier (gratuite, un rang tous les 2 niveaux).</p>
      {#if anciens.voies.length}<p><strong>Voies :</strong> {anciens.voies.join(' ; ')}</p>{/if}
      {#if anciens.race.length}<p><strong>Voie raciale :</strong> {anciens.race.join(' ; ')}</p>{/if}
      <p><strong>Dons :</strong> {anciens.dons.length ? anciens.dons.join(' ; ') : 'aucun'}</p>
    </aside>
  {/if}

  {#if etape === 'Identité'}
    {#if b.reprise}<p class="aide">Fiche reprise de la v1 : classe, race, niveau, caractéristiques et jets de PV sont repris tels quels.</p>{/if}
    <div class="grille2">
      <label>Nom <input aria-label="Nom" value={b.nom} maxlength="40" oninput={(ev) => geste((x) => ({ ...x, nom: ev.currentTarget.value }))} /></label>
      <label>
        Niveau
        <input aria-label="Niveau" type="number" min="1" max={R.NIVEAU_MAX} value={b.niveau} onchange={(ev) => geste((x) => R.changerNiveau(x, Number(ev.currentTarget.value)))} />
      </label>
      <fieldset>
        <legend>Genre</legend>
        {#each [['homme', 'Homme'], ['femme', 'Femme']] as [g, libelle] (g)}
          <button class="choix" class:actif={b.genre === g} onclick={() => geste((x) => ({ ...x, genre: g as 'homme' | 'femme' }))}>{libelle}</button>
        {/each}
      </fieldset>
    </div>
    <fieldset>
      <legend>Race</legend>
      {#each constantes.ordreRaces as id (id)}
        <button class="choix" class:actif={b.race === id} onclick={() => geste((x) => R.choisirRace(x, id))}>{raceParId.get(id)?.nom ?? id}</button>
      {/each}
    </fieldset>
    <fieldset>
      <legend>Classe</legend>
      {#each constantes.ordreClasses as id (id)}
        <button class="choix" class:actif={b.classe === id} onclick={() => geste((x) => R.choisirClasse(x, id))}>{classeParId.get(id)?.nom ?? id}</button>
      {/each}
    </fieldset>
    {#if race}
      <h3>{race.voie.nom} <span class="aide">— gratuite, un rang tous les 2 niveaux (1, 3, 5, 7, 9)</span></h3>
      <ol class="rangs">
        {#each race.voie.rangs as r (r.id)}
          <li class:acquis={rangsRace.includes(r.rang)}>
            <strong>{r.rang}. {r.rang === 3 && b.raceVariante ? (race.variantes.find((v) => v.code === b.raceVariante)?.nomCapacite ?? r.nom) : r.nom}</strong>
            {#if !rangsRace.includes(r.rang)}<span class="aide">(niveau {2 * r.rang - 1})</span>{/if}
            <span class="effet">{r.effet}</span>
            {#each R.choixRaciauxRequis(b).filter(([rang]) => rang === r.rang) as [rang, options] (rang)}
              <label>
                Choix
                <select aria-label={`Choix du rang racial ${rang}`} value={b.capacitesRaceChoix[String(rang)] ?? ''} onchange={(ev) => geste((x) => R.choisirOptionRaciale(x, rang, ev.currentTarget.value))}>
                  <option value="" disabled>—</option>
                  {#each options as o (o)}<option value={o}>{o}</option>{/each}
                </select>
              </label>
            {/each}
          </li>
        {/each}
      </ol>
      {#if race.variantes.length}
        <label>
          Nation {R.varianteRequise(b) ? '(exigée)' : '(dès le niveau 5)'}
          <select aria-label="Nation" value={b.raceVariante ?? ''} onchange={(ev) => geste((x) => R.choisirVariante(x, ev.currentTarget.value || null))}>
            <option value="">—</option>
            {#each race.variantes as v (v.code)}<option value={v.code}>{v.nom}</option>{/each}
          </select>
        </label>
      {/if}
    {/if}
  {:else if etape === 'Caractéristiques'}
    <p class="aide">Base 10, bonus de classe automatique, {R.CARACS_LIBRES_TOTAL} points libres (au plus +{R.CARACS_LIBRES_MAX_PAR_CARAC} par caractéristique). Restants : <strong>{R.pointsCaracsRestants(b)}</strong></p>
    <table>
      <thead><tr><th></th><th>Classe</th><th>Libres</th><th>Valeur</th><th>Modificateur</th></tr></thead>
      <tbody>
        {#each CARACS as c (c.code)}
          <tr>
            <th scope="row">{c.nom}</th>
            <td>{signe(R.bonusClasseCarac(b.classe, c.code as Carac))}</td>
            <td>
              <button class="petit" aria-label={`Retirer un point en ${c.code}`} onclick={() => geste((x) => R.ajusterCarac(x, c.code as Carac, -1))}>−</button>
              {b.caracsLibres[c.code as Carac] ?? 0}
              <button class="petit" aria-label={`Ajouter un point en ${c.code}`} onclick={() => geste((x) => R.ajusterCarac(x, c.code as Carac, 1))}>+</button>
            </td>
            <td>{caracs[c.code as Carac]}</td>
            <td>{signe(stats.mods[c.code as Carac])}</td>
          </tr>
        {/each}
      </tbody>
    </table>
    <p class="aide">Le modificateur inclut les bonus raciaux et de capacités.</p>
  {:else if etape === 'Voies'}
    {#if !b.classe}
      <p>Choisis d'abord une classe.</p>
    {:else if refondue && refonte && ctxRefonte}
      <ChoixRefonte classe={refondue} r={refonte} ctx={ctxRefonte} surGeste={(g) => geste((x) => K.gesteRefonte(x, (c, r, ctx) => RF.appliquerGeste(c, r, ctx, g)))} />
      {#if erreursVoiesRefonte.length}
        <ul class="erreurs" aria-label="Voies à compléter">{#each erreursVoiesRefonte as e (e)}<li>{e}</li>{/each}</ul>
      {/if}
    {/if}
  {:else if etape === 'PV et dons'}
    <h3>Points de vie</h3>
    <p>Dé de vie : d{R.facesDeVie(b)}. Niveau 1 : dé maximum + modificateur de CON + 2.</p>
    {#if b.niveau > 1}
      <ol class="jets">
        {#each R.historiquePV(b) as j (j.niveau)}
          <li>Niveau {j.niveau} : {j.jet} {signe(j.modCON)} = <strong>{j.total}</strong></li>
        {/each}
      </ol>
      {#if b.jetsPV.length < b.niveau - 1}
        <button onclick={() => geste((x) => R.lancerJetPV(x))}>Lancer les PV du niveau {b.jetsPV.length + 2}</button>
      {:else}
        <button class="discret" onclick={() => geste(R.effacerJetsPV)}>Relancer tous les niveaux</button>
      {/if}
    {/if}
    <p>PV maximum : <strong data-testid="pv-max">{calc.pvMax}</strong></p>

    <h3>Dons</h3>
    {#if R.donsRequis(b) === 0}
      <p class="aide">Aucun don avant le niveau 4 (puis 8 et 12).</p>
    {:else}
      <p>Dons : {b.dons.length} / {R.donsRequis(b)}</p>
      <ul class="liste">
        {#each b.dons as d (d)}
          <li>{nomDon(d)} {#if b.donsChoix[d]}<span class="badge">{String(b.donsChoix[d])}</span>{/if}
            <button class="petit discret" onclick={() => geste((x) => R.retirerDon(x, d))}>Retirer</button></li>
        {/each}
      </ul>
      {#if b.dons.length < R.donsRequis(b)}
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
  {:else}
    <div class="grille2">
      <dl class="stats">
        <dt>PV</dt><dd>{calc.pvMax}</dd>
        <dt>PP</dt><dd>{stats.ppMax ?? '—'}</dd>
        <dt>CA</dt><dd>{stats.ca}</dd>
        <dt>Initiative</dt><dd>{stats.initiative}</dd>
        <dt>Attaque contact / distance / magique</dt><dd>{signe(stats.attaque.contact)} / {signe(stats.attaque.distance)} / {signe(stats.attaque.magique)}</dd>
        {#each Object.entries(stats.sauvegardes) as [n, v] (n)}<dt>{n}</dt><dd>{signe(v)}</dd>{/each}
      </dl>
      <div>
        <h3>{b.reprise ? 'Équipement repris de la v1' : 'Équipement de départ'}</h3>
        <ul class="liste">
          {#each Object.entries(calc.equipement ?? {}).filter(([, o]) => o) as [slot, o] (slot)}<li>{o?.nom} <span class="aide">({slot.replace('_', ' ')})</span></li>{/each}
          {#each calc.inventaireListe ?? [] as o, i (i)}<li>{o.nom} <span class="aide">(sac)</span></li>{/each}
        </ul>
      </div>
    </div>
    {#if erreurs.length}
      <h3>À compléter</h3>
      <ul class="erreurs" aria-label="À compléter">{#each erreurs as e (e)}<li>{e}</li>{/each}</ul>
    {/if}
    {#if avertissements.length}
      <ul class="avertissements" aria-label="À noter">{#each avertissements as a (a)}<li>{a}</li>{/each}</ul>
    {/if}
    <button onclick={creer} disabled={erreurs.length > 0 || enCours}>Créer le personnage</button>
  {/if}
</section>

<style>
  .assistant {
    display: flex;
    flex-direction: column;
    gap: 14px;
  }
  .tete,
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 12px;
  }
  .espace {
    flex: 1 1 auto;
  }
  nav {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .onglet,
  .choix,
  .discret {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .onglet.actif,
  .choix.actif {
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .pastille {
    color: var(--couleur-danger);
    margin-left: 4px;
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  legend {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .grille2 {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 12px 20px;
    align-items: start;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  h3 {
    font-size: 17px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
  }
  .rangs,
  .liste,
  .jets,
  .erreurs,
  .avertissements {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rangs li,
  .liste li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: 8px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .rangs li.acquis {
    border-color: var(--couleur-accent-clair);
    background: var(--couleur-accent-pale);
  }
  .effet {
    flex-basis: 100%;
    font-size: 14px;
    color: var(--couleur-encre-douce);
  }
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
  .petit {
    min-height: 32px;
    padding: 0 10px;
  }
  .anciens {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 12px 16px;
    border-radius: var(--rayon);
    border: 1px dashed var(--couleur-or);
    background: var(--couleur-surface-claire);
  }
  .anciens p {
    margin: 0;
  }
  .refus,
  .erreurs li {
    color: var(--couleur-danger);
    background: var(--couleur-danger-pale);
    padding: 8px 12px;
    border-radius: var(--rayon);
    margin: 0;
  }
  .avertissements li {
    color: var(--couleur-or-texte);
    margin: 0;
  }
  table {
    border-collapse: collapse;
  }
  th,
  td {
    padding: 6px 12px;
    text-align: center;
    border-bottom: 1px solid var(--couleur-bordure-douce);
  }
  th[scope='row'] {
    text-align: left;
  }
  .stats {
    display: grid;
    grid-template-columns: auto auto;
    gap: 4px 16px;
    margin: 0;
  }
  .stats dt {
    color: var(--couleur-encre-douce);
  }
  .stats dd {
    margin: 0;
    font-weight: 600;
  }
  select {
    min-height: 40px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure);
    background: var(--couleur-surface-claire);
    padding: 0 8px;
  }
</style>
