<script lang="ts">
  import { marquerImportRepris } from '../lib/actions/imports';
  import { creerPerso, messageErreurPerso, nouvelIdPerso } from '../lib/actions/persos';
  import { garderBrouillon, lireBrouillon, oublierBrouillon } from '../lib/creation/brouillon-local';
  import { statistiquesFiche } from '../lib/regles/calculs';
  import * as R from '../lib/regles/creation';
  import { anciensChoixLisibles, reprendreAnciensChoix } from '../lib/regles/import-v1';
  import { classeParId, constantes, donParId, dons, raceParId, sortParId, voieParId } from '../lib/regles/donnees';
  import type { Carac } from '../lib/regles/fiche-calcul';
  import { session } from '../lib/session.svelte';

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
   * toucher) ; les anciens choix s'affichent à côté, et « Reprendre mes
   * anciens choix » les rejoue à travers les règles actuelles.
   */

  let {
    surCree,
    surAnnuler,
    depart = null,
  }: { surCree: (id: string) => void; surAnnuler: () => void; depart?: R.Brouillon | null } = $props();

  const ETAPES = ['Identité', 'Caractéristiques', 'Voies', 'PV et dons', 'Magie', 'Récapitulatif'] as const;
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
  const pts = $derived(R.pointsVoie(b));
  const erreurs = $derived(R.erreursCreation(b));
  const avertissements = $derived(R.avertissementsCreation(b));
  const magie = $derived(R.aUnGrimoire(b.classe));
  const race = $derived(b.race ? raceParId.get(b.race) : undefined);
  const rangsRace = $derived(R.capacitesRaceDuBrouillon(b));
  const polyvalence = $derived(R.polyvalenceAcquise(b) && !R.rangOffert(b));
  const anciens = $derived(b.reprise ? anciensChoixLisibles(b.reprise.anciens) : null);
  let nonRepris = $state<string[] | null>(null);

  function reprendre() {
    const r = reprendreAnciensChoix($state.snapshot(b) as R.Brouillon);
    b = r.brouillon;
    nonRepris = r.nonRepris;
    refus = '';
  }

  const nomVoie = (id: string) => voieParId.get(id)?.nom ?? id;
  const nomDon = (id: string) => donParId.get(id)?.nom ?? id;
  const nomSort = (id: string) => sortParId.get(id)?.nom ?? id;
  const signe = (n: number | null) => (n === null ? '—' : n >= 0 ? `+${n}` : String(n));

  // Choix en attente pour les capacités et dons qui en demandent un.
  let choixCapacite = $state<Record<string, string>>({});
  let voieHorsProfil = $state('');
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
    nonRepris = null;
    etape = 'Identité';
    refus = '';
  }

  async function creer() {
    refus = '';
    enCours = true;
    try {
      const fiche = R.ficheDepuisBrouillon($state.snapshot(b) as R.Brouillon, session.uid, Date.now());
      const id = nouvelIdPerso();
      await creerPerso(id, fiche);
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
    Voies: pts.restants < 0,
    'PV et dons': b.jetsPV.length < b.niveau - 1 || b.dons.length < R.donsRequis(b),
    Magie: magie && b.sorts.length > 0 && R.sortsAChoisir(b) < 0,
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
      {#if etape === 'Voies'}
        <button onclick={reprendre}>Reprendre mes anciens choix</button>
      {/if}
      {#if nonRepris}
        {#if nonRepris.length}
          <ul class="erreurs" aria-label="Non repris">{#each nonRepris as n (n)}<li>{n}</li>{/each}</ul>
        {:else}
          <p class="offert" role="status">Tous tes anciens choix ont été repris.</p>
        {/if}
      {/if}
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
    {:else}
      <p class="compteur" aria-live="polite">Points de capacité : <strong data-testid="points-voie">{pts.restants}</strong> / {pts.total}</p>
      <p class="aide">Rangs 1-2 : 1 point ; rangs 3-5 : 2 points ; dans l'ordre.</p>
      {#if polyvalence}<p class="offert">Polyvalence : un rang gratuit à prendre dans une voie de ta classe (bouton « Offert »).</p>{/if}
      {#each R.voiesOuvertes(b) as idVoie (idVoie)}
        {@const voie = voieParId.get(idVoie)}
        {@const max = R.rangMaxDansVoie(b, idVoie)}
        {@const horsProfil = b.voiesHorsProfil.find((h) => h.voie === idVoie)}
        <div class="voie">
          <h3>
            {voie?.nom ?? idVoie}
            {#if voie?.speciale}<span class="badge">chaos — accord MJ</span>{/if}
            {#if horsProfil}<span class="badge">hors profil ({horsProfil.cout} pts)</span>
              <button class="petit discret" onclick={() => geste((x) => R.annulerHorsProfil(x, idVoie))}>Annuler le déblocage</button>{/if}
          </h3>
          <ol class="rangs">
            {#each voie?.rangs ?? [] as r (r.id)}
              {@const entree = b.capacites.find((c) => c.id === r.id)}
              {@const options = R.CHOIX_CAPACITES[r.id]}
              <li class:acquis={!!entree}>
                <strong>{r.rang}. {r.nom}</strong>
                {#if entree?.choix}<span class="badge">{entree.choix}</span>{/if}
                {#if entree?.offert}<span class="badge">offert</span>{/if}
                <span class="effet">{r.effet}</span>
                {#if entree && r.rang === max}
                  <button class="petit discret" aria-label={`Retirer ${r.id}`} onclick={() => geste((x) => R.retirerRang(x, idVoie, r.rang))}>Retirer</button>
                {:else if !entree && r.rang === max + 1}
                  {#if options}
                    <select aria-label={`Choix pour ${r.id}`} value={choixCapacite[r.id] ?? ''} onchange={(ev) => (choixCapacite[r.id] = ev.currentTarget.value)}>
                      <option value="" disabled>choix…</option>
                      {#each options as o (o)}<option value={o}>{o}</option>{/each}
                    </select>
                  {/if}
                  <button class="petit" aria-label={`Prendre ${r.id}`} onclick={() => geste((x) => R.prendreRang(x, idVoie, r.rang, options ? choixCapacite[r.id] : undefined))}>
                    Prendre ({r.rang >= 3 ? 2 : 1})
                  </button>
                  {#if polyvalence && !horsProfil}
                    <button class="petit" aria-label={`Prendre ${r.id} offert`} onclick={() => geste((x) => R.prendreRang(x, idVoie, r.rang, options ? choixCapacite[r.id] : undefined, true))}>Offert</button>
                  {/if}
                {/if}
              </li>
            {/each}
          </ol>
        </div>
      {/each}
      <div class="ligne">
        <select aria-label="Voie hors profil" bind:value={voieHorsProfil}>
          <option value="">Débloquer une voie hors profil…</option>
          {#each R.voiesHorsProfilProposees(b) as id (id)}
            <option value={id}>{nomVoie(id)} ({classeParId.get(voieParId.get(id)?.classe ?? '')?.nom}) — {R.coutHorsProfil(b, id)} pts</option>
          {/each}
        </select>
        <button disabled={!voieHorsProfil} onclick={() => { geste((x) => R.debloquerHorsProfil(x, voieHorsProfil)); voieHorsProfil = ''; }}>Débloquer</button>
      </div>
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
  {:else if etape === 'Magie'}
    {#if b.classe === 'pretre'}
      <label>
        Cercle
        <select aria-label="Cercle" value={b.cercleSpecialisation ?? ''} onchange={(ev) => geste((x) => R.choisirCercle(x, ev.currentTarget.value || null))}>
          <option value="">Aucun pour l'instant</option>
          {#each R.CERCLES as c (c)}<option value={c}>{c} (sort offert : {nomSort(constantes.cercleSortGratuit[c] ?? '')})</option>{/each}
        </select>
      </label>
    {/if}
    {#if !magie}
      <p>{b.classe ? `${classeParId.get(b.classe)?.nom} n'a pas de Grimoire : aucun sort à choisir.` : "Choisis d'abord une classe."}</p>
    {:else}
      <p>Sorts à apprendre : <strong data-testid="sorts-restants">{R.sortsAChoisir(b)}</strong> (plafond d'inscription du Grimoire, sorts offerts compris).</p>
      {#if R.sortsAccordes(b).length}<p class="aide">Offerts par tes voies et ton Cercle : {R.sortsAccordes(b).map(nomSort).join(', ')}.</p>{/if}
      <ul class="liste">
        {#each b.sorts as s (s)}
          <li>{nomSort(s)} <button class="petit discret" onclick={() => geste((x) => R.oublierSort(x, s))}>Oublier</button></li>
        {/each}
      </ul>
      {#if R.sortsAChoisir(b) > 0}
        <ul class="liste proposes">
          {#each R.sortsProposes(b) as s (s)}
            {@const sort = sortParId.get(s)}
            <li>
              <strong>{sort?.nom}</strong> <span class="aide">rang {sort?.rang}, {sort?.categorie}</span>
              <span class="effet">{sort?.effet}</span>
              <button class="petit" aria-label={`Apprendre ${sort?.nom}`} onclick={() => geste((x) => R.apprendreSort(x, s))}>Apprendre</button>
            </li>
          {/each}
        </ul>
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
  .avertissements li,
  .offert {
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
