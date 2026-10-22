<script lang="ts">
  import { onDestroy } from 'svelte';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { cloreScene, donnerVecuDeScene, levierEnScene, ouvrirScene, RefusScene } from '../lib/actions/scenes-hors-combat';
  import type { AvecId, CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { suivreActionsScene, suivreSceneHorsCombat, suivreSceneHorsCombatMj, suivreUtilisationsScene } from '../lib/magasins/scenes-hors-combat.svelte';
  import { suivreSeances } from '../lib/magasins/seances.svelte';
  import { MOD_DD_ATTITUDE, NOMS_CRANS } from '../lib/pnj/attitude';
  import { constantes } from '../lib/regles/donnees';
  import { aLeNoeud, contributeurs, cranScene, ddEffectif, DIFFICULTES, NOMS_TYPES, OPTIONS, toleresPourLeGroupe, type Difficulte } from '../lib/scenes/hors-combat';
  import { nomNoeud } from '../lib/scenes/vecu-en-scene';
  import type { Pnj } from '../lib/schemas/pnj';
  import type { ActionScene, Appele, SceneHorsCombat, SceneHorsCombatMj, TypeScene, UtilisationVecu } from '../lib/schemas/scene-hors-combat';
  import { session } from '../lib/session.svelte';

  /*
   * Scène hors combat, côté MJ (lot S2, décisions de Thomas du 22/10/2026).
   *   - Ouvrir (1a, 2a) : type, cible (un PNJ rencontré en social, sinon
   *     un lieu), objectif, difficulté (les repères du cadre pré-remplissent
   *     DD, réussites et échecs tolérés, ces derniers selon le nombre
   *     d'appelés, 11a), mode, compétence du groupe, marquante, compteur
   *     d'échecs visible ou non des joueurs (6a), appelés (les présents qui
   *     ont un personnage joué, par défaut).
   *   - En cours : les jets arrivent, résolus par le client du MJ
   *     (ArbitreScene, 5a) ; le MJ voit le DD effectif, les joueurs non.
   *   - Clore (8a) : l'issue proposée se confirme, ou la scène se clôt sans
   *     issue. Marquante gagnée (10a) : un cran de Vécu à ceux qui ont
   *     réussi. Puis « Nouvelle scène avec ce PNJ » (11a).
   * Vécu en scène (lot S3) : cases « foule » (Orateur) et « autorité »
   * (Citer le précédent) à l'ouverture ; Levier (±2 crans, un secret ne
   * sert qu'une fois) ; les notes du Vécu sur les jets, les relances, les
   * capacités utilisées.
   */

  let { pnjs, pnjPropose = null, surPnjPris }: { pnjs: readonly AvecId<Pnj>[]; pnjPropose?: string | null; surPnjPris?: () => void } = $props();

  const table = suivreTable(session.table);
  const joueurs = suivreJoueurs(session.table);
  const persos = suivrePersos(session.table);
  const seances = suivreSeances(session.table);
  onDestroy(() => {
    table.arreter();
    joueurs.arreter();
    persos.arreter();
    seances.arreter();
  });

  const idEnCours = $derived(table.etat.donnees?.sceneHorsCombat ?? null);
  const seanceOuverte = $derived(table.etat.donnees?.seanceOuverte ?? null);
  // Après la clôture, la scène reste à l'écran pour le Vécu et l'enchaînement.
  let idCloture = $state<string | null>(null);
  const idMontre = $derived(idEnCours ?? idCloture);

  let suivi = $state<{ s: DocumentSuivi<SceneHorsCombat>; mj: DocumentSuivi<SceneHorsCombatMj>; a: CollectionSuivie<ActionScene>; u: CollectionSuivie<UtilisationVecu> } | null>(null);
  $effect(() => {
    if (!idMontre) return;
    const x = {
      s: suivreSceneHorsCombat(session.table, idMontre),
      mj: suivreSceneHorsCombatMj(session.table, idMontre),
      a: suivreActionsScene(session.table, idMontre),
      u: suivreUtilisationsScene(session.table, idMontre),
    };
    suivi = x;
    return () => {
      x.s.arreter();
      x.mj.arreter();
      x.a.arreter();
      x.u.arreter();
      suivi = null;
    };
  });
  const utilisations = $derived([...(suivi?.u.etat.elements ?? [])].sort((a, b) => a.creeLe - b.creeLe));
  const scene = $derived(suivi?.s.etat.donnees ?? null);
  const dd = $derived(suivi?.mj.etat.donnees?.dd ?? null);
  const actions = $derived([...(suivi?.a.etat.elements ?? [])].sort((a, b) => a.tour - b.tour || a.creeLe - b.creeLe));

  // ---- Formulaire d'ouverture ----
  const COMPETENCES = Object.values(constantes.competencesParCarac).flat().sort((a, b) => a.localeCompare(b, 'fr'));
  const rencontres = $derived([...pnjs].filter((p) => p.rencontre).sort((a, b) => a.nom.localeCompare(b.nom, 'fr')));
  let type = $state<TypeScene>('social');
  let pnj = $state('');
  let lieu = $state('');
  let objectif = $state('');
  let difficulte = $state<Difficulte>('moyenne');
  let ddSaisi = $state<number | null>(null);
  let requisSaisi = $state<number | null>(null);
  let toleresSaisi = $state<number | null>(null);
  let mode = $state<'individuel' | 'groupe'>('individuel');
  let competence = $state('Perception');
  let marquante = $state(false);
  let echecsVisibles = $state(true);
  let foule = $state(false);
  let autorite = $state(false);
  let secret = $state('');
  let coches = $state<Record<string, boolean> | null>(null);
  let message = $state('');
  let occupe = $state(false);

  // Le PNJ choisi depuis sa fiche (11a, et « Nouvelle scène avec ce PNJ »).
  $effect(() => {
    if (pnjPropose) {
      type = 'social';
      mode = 'individuel';
      pnj = pnjPropose;
      surPnjPris?.();
    }
  });

  const presents = $derived(new Set(seances.etat.elements.find((s) => s.id === seanceOuverte?.id)?.presents ?? []));
  const jouables = $derived(
    joueurs.etat.elements
      .map((j) => {
        const f = j.persoActif ? persos.etat.elements.find((p) => p.id === j.persoActif) : undefined;
        return f ? { uid: j.id, joueur: j.nom, perso: f.id, nom: f.nom } : null;
      })
      .filter((x): x is { uid: string; joueur: string; perso: string; nom: string } => x !== null)
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  );
  // 2a : par défaut, les présents de la séance ouverte ; sans séance, tous ceux qui ont un personnage joué.
  const cochesAffichees = $derived(coches ?? Object.fromEntries(jouables.map((j) => [j.uid, seanceOuverte ? presents.has(j.uid) : true])));
  const appeles = $derived<Appele[]>(jouables.filter((j) => cochesAffichees[j.uid]).map((j) => ({ uid: j.uid, perso: j.perso, nom: j.nom })));
  const repere = $derived(DIFFICULTES[difficulte]);
  const ddAffiche = $derived(ddSaisi ?? repere.dd);
  const requisAffiche = $derived(requisSaisi ?? repere.requis);
  const toleresAffiche = $derived(toleresSaisi ?? toleresPourLeGroupe(repere.toleres, appeles.length));
  const pnjChoisi = $derived(rencontres.find((p) => p.id === pnj) ?? null);

  async function agir(f: () => Promise<unknown>, succes = '') {
    message = '';
    occupe = true;
    try {
      await f();
      message = succes;
      return true;
    } catch (e) {
      message = e instanceof RefusScene ? e.message : messageErreurPerso(e);
      return false;
    } finally {
      occupe = false;
    }
  }

  async function ouvrir() {
    const ok = await agir(() =>
      ouvrirScene(
        {
          type,
          pnj: type === 'social' ? pnj || null : null,
          cible: type === 'social' ? (pnjChoisi?.nom ?? '') : lieu,
          objectif,
          mode: type === 'social' ? 'individuel' : mode,
          competence: type !== 'social' && mode === 'groupe' ? competence : null,
          dd: ddAffiche,
          requis: requisAffiche,
          toleres: toleresAffiche,
          echecsVisibles,
          marquante,
          foule: type === 'social' && foule,
          autorite: type === 'social' && autorite,
          appeles,
        },
        seanceOuverte?.id,
      ),
    );
    if (ok) {
      idCloture = null;
      objectif = '';
      foule = autorite = false;
      ddSaisi = requisSaisi = toleresSaisi = null;
      coches = null;
    }
  }

  // ---- Clôture et Vécu ----
  let vecuCoches = $state<Record<string, boolean> | null>(null);
  let vecuDonne = $state(false);
  const aContribue = $derived(scene ? contributeurs(scene, actions) : []);
  const vecuAffiche = $derived(vecuCoches ?? Object.fromEntries(aContribue.map((a) => [a.perso, true])));

  async function clore(issue: 'gagnee' | 'perdue' | 'abandonnee') {
    if (issue === 'abandonnee' && !confirm('Clore la scène sans issue ? Les crans perdus restent perdus.')) return;
    const id = idEnCours;
    if (!id) return;
    if (await agir(() => cloreScene(id, issue))) {
      idCloture = id;
      vecuCoches = null;
      vecuDonne = false;
    }
  }
  async function donnerVecu() {
    if (!scene) return;
    const choisis = Object.entries(vecuAffiche).filter(([, v]) => v).map(([p]) => p);
    if (await agir(() => donnerVecuDeScene(scene, actions, choisis), `Un cran de Vécu donné à ${choisis.length} personnage${choisis.length > 1 ? 's' : ''}.`)) vecuDonne = true;
  }
  function enchainer() {
    if (!scene?.pnj) return;
    type = 'social';
    mode = 'individuel';
    pnj = scene.pnj;
    idCloture = null;
  }

  const NOMS_RESULTATS = { reussite: 'réussite', echec: 'échec', passe: 'passe' } as const;
  const NOMS_ISSUES = { gagnee: 'gagnée', perdue: 'perdue', abandonnee: 'close sans issue' } as const;
  const NOMS_VECU = { lire: 'Lire les gens', citer: 'Citer le précédent' } as const;
  const nomOption = (a: ActionScene) =>
    a.option in OPTIONS ? OPTIONS[a.option as keyof typeof OPTIONS].nom : a.option in NOMS_VECU ? NOMS_VECU[a.option as keyof typeof NOMS_VECU] : a.option === 'passer' ? 'Passe' : a.competence;
  /** « Convaincre, 15 — réussite (Langue d'argent) », « … — échec, relancé ». */
  const resume = (a: ActionScene) =>
    a.resultat === 'passe'
      ? `passe${a.note ? ` (${a.note})` : ''}`
      : `${a.relance ? 'relance, ' : ''}${nomOption(a)}, ${a.de! + a.bonus} — ${a.resultat === null ? 'en cours…' : NOMS_RESULTATS[a.resultat]}${a.note ? ` (${a.note})` : ''}${a.annule ? ', relancé' : ''}`;
  async function levier(sens: 1 | -1) {
    if (!idEnCours) return;
    if (await agir(() => levierEnScene(idEnCours!, sens, secret), `Levier : ${sens > 0 ? '+2' : '−2'} crans pour la scène.`)) secret = '';
  }
  const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0');
</script>

<section class="carte scene" aria-label="Scène">
  {#if scene && idMontre}
    {@const cran = cranScene(scene)}
    <div class="tete">
      <h2>Scène · {NOMS_TYPES[scene.type]} · {scene.cible}</h2>
      {#if scene.marquante}<span class="marque">Marquante</span>{/if}
    </div>
    <p class="objectif">{scene.objectif}</p>
    <p class="compteurs">
      <span data-testid="scene-reussites">Réussites {scene.reussites} / {scene.requis}</span>
      <span data-testid="scene-echecs">Échecs {scene.echecs} / {scene.toleres + 1}{scene.echecsVisibles ? '' : ' (cachés aux joueurs)'}</span>
      {#if scene.statut === 'ouverte'}<span>Tour {scene.tour}</span>{/if}
    </p>
    {#if scene.peuple}<p class="aide">Homme du peuple : la scène a commencé un cran plus haut.</p>{/if}
    {#if scene.foule || scene.autorite}<p class="aide">{[scene.foule ? 'Face à une foule' : '', scene.autorite ? 'face à une autorité' : ''].filter(Boolean).join(', ')}.</p>{/if}
    {#if cran}
      <p>Attitude en scène : <strong>{NOMS_CRANS[cran]}</strong>{#if dd !== null}<span class="aide">{' · '}DD effectif {ddEffectif(dd, scene)} (base {dd}, {signe(MOD_DD_ATTITUDE[cran])})</span>{/if}</p>
    {:else if dd !== null}
      <p class="aide">DD {dd}</p>
    {/if}
    <ul class="jets">
      {#each scene.appeles as ap (ap.uid)}
        {@const a = actions.find((x) => x.uid === ap.uid && x.tour === scene.tour && !x.relance)}
        {#if scene.statut === 'ouverte'}
          <li>{ap.nom} : {a ? resume(a) : 'à lui de jouer'}</li>
        {/if}
      {/each}
    </ul>
    {#if actions.some((a) => a.tour < scene.tour || scene.statut !== 'ouverte')}
      <details>
        <summary>Tous les jets</summary>
        <ul class="jets">
          {#each actions as a (a.id)}
            <li>Tour {a.tour} · {a.nom} : {a.de !== null ? `${resume(a)} (${a.de} ${signe(a.bonus)})` : resume(a)}</li>
          {/each}
        </ul>
      </details>
    {/if}
    {#if utilisations.length}
      <p class="aide" data-testid="scene-capacites">Capacités du Vécu : {utilisations.map((u) => `${u.nom} — ${nomNoeud(u.noeud)} (tour ${u.tour})`).join(' ; ')}</p>
    {/if}
    {#if scene.statut === 'ouverte' && scene.type === 'social' && scene.appelesUids.some((u) => aLeNoeud(scene, u, 'levier'))}
      <div class="levier">
        <label>Levier : le secret utilisé <input maxlength="120" bind:value={secret} placeholder="La dette envers le Roi" /></label>
        <button disabled={occupe || !secret.trim()} onclick={() => levier(1)}>+2 crans</button>
        <button class="discret" disabled={occupe || !secret.trim()} onclick={() => levier(-1)}>−2 crans</button>
      </div>
    {/if}

    {#if scene.statut === 'terminee' && scene.issue}
      <p class="issue">La scène est {NOMS_ISSUES[scene.issue]}. À toi de conclure.</p>
      <div class="actions">
        <button disabled={occupe} onclick={() => clore(scene.issue === 'gagnee' ? 'gagnee' : 'perdue')}>Confirmer : scène {NOMS_ISSUES[scene.issue]}</button>
        <button class="discret" disabled={occupe} onclick={() => clore('abandonnee')}>Clore sans issue</button>
      </div>
    {:else if scene.statut === 'ouverte'}
      <div class="actions"><button class="discret" disabled={occupe} onclick={() => clore('abandonnee')}>Clore sans issue</button></div>
    {:else}
      <p class="issue">Scène {scene.issue ? NOMS_ISSUES[scene.issue] : 'close'}.</p>
      {#if scene.marquante && scene.issue === 'gagnee' && !vecuDonne}
        <fieldset disabled={occupe}>
          <legend>Un cran de Vécu (scène marquante)</legend>
          {#each aContribue as c (c.perso)}
            <label><input type="checkbox" checked={!!vecuAffiche[c.perso]} onchange={(e) => (vecuCoches = { ...vecuAffiche, [c.perso]: e.currentTarget.checked })} /> {c.nom}</label>
          {:else}
            <span class="aide">Personne n'a réussi de jet.</span>
          {/each}
        </fieldset>
        {#if aContribue.length}<button disabled={occupe} onclick={donnerVecu}>Donner le Vécu</button>{/if}
      {/if}
      <div class="actions">
        {#if scene.pnj}<button disabled={occupe} onclick={enchainer}>Nouvelle scène avec {scene.cible}</button>{/if}
        <button class="discret" onclick={() => (idCloture = null)}>Fermer</button>
      </div>
    {/if}
  {:else}
    <h2>Nouvelle scène</h2>
    <form onsubmit={(e) => (e.preventDefault(), ouvrir())}>
      <div class="grille">
        <label
          >Type
          <select bind:value={type}>
            <option value="social">Social</option>
            <option value="exploration">Exploration</option>
            <option value="enquete">Enquête</option>
          </select>
        </label>
        {#if type === 'social'}
          <label
            >PNJ
            <select bind:value={pnj}>
              <option value="">— un PNJ rencontré —</option>
              {#each rencontres as p (p.id)}<option value={p.id}>{p.nom} ({p.cran ? NOMS_CRANS[p.cran] : ''})</option>{/each}
            </select>
          </label>
        {:else}
          <label>Lieu <input maxlength="80" bind:value={lieu} /></label>
        {/if}
        <label class="large">Objectif <input maxlength="200" bind:value={objectif} placeholder="Obtenir le nom du commanditaire" /></label>
        <label
          >Difficulté
          <select bind:value={difficulte} onchange={() => (ddSaisi = requisSaisi = toleresSaisi = null)}>
            {#each Object.entries(DIFFICULTES) as [cle, d] (cle)}<option value={cle}>{d.nom}</option>{/each}
          </select>
        </label>
        <label>DD <input type="number" min="5" max="30" value={ddAffiche} oninput={(e) => (ddSaisi = Number(e.currentTarget.value) || null)} /></label>
        <label>Réussites requises <input type="number" min="1" max="12" value={requisAffiche} oninput={(e) => (requisSaisi = Number(e.currentTarget.value) || null)} /></label>
        <label>Échecs tolérés <input type="number" min="0" max="12" value={toleresAffiche} oninput={(e) => (toleresSaisi = Number.isFinite(e.currentTarget.valueAsNumber) ? e.currentTarget.valueAsNumber : null)} /></label>
        {#if type !== 'social'}
          <label
            >Mode
            <select bind:value={mode}>
              <option value="individuel">Individuel (compétence au choix)</option>
              <option value="groupe">Groupe (une compétence pour tous)</option>
            </select>
          </label>
          {#if mode === 'groupe'}
            <label
              >Compétence
              <select bind:value={competence}>
                {#each COMPETENCES as c (c)}<option value={c}>{c}</option>{/each}
              </select>
            </label>
          {/if}
        {/if}
      </div>
      <div class="cases">
        <label><input type="checkbox" bind:checked={marquante} /> Scène marquante (un cran de Vécu si elle est gagnée)</label>
        <label><input type="checkbox" bind:checked={echecsVisibles} /> Les joueurs voient le compteur d'échecs</label>
        {#if type === 'social'}
          <label><input type="checkbox" bind:checked={foule} /> Face à une foule ou un groupe (Orateur)</label>
          <label><input type="checkbox" bind:checked={autorite} /> Face à une autorité (Citer le précédent)</label>
        {/if}
      </div>
      <fieldset>
        <legend>Appelés</legend>
        {#each jouables as j (j.uid)}
          <label><input type="checkbox" checked={!!cochesAffichees[j.uid]} onchange={(e) => (coches = { ...cochesAffichees, [j.uid]: e.currentTarget.checked })} /> {j.nom} <span class="aide">({j.joueur})</span></label>
        {:else}
          <span class="aide">Aucun joueur n'a de personnage joué.</span>
        {/each}
      </fieldset>
      <button disabled={occupe}>Ouvrir la scène</button>
    </form>
  {/if}
  {#if message}<p class="erreur" role="alert">{message}</p>{/if}
</section>

<style>
  .scene {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  h2 {
    font-size: 20px;
  }
  p {
    margin: 0;
  }
  .tete,
  .actions,
  .compteurs,
  .cases {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    align-items: center;
  }
  .marque {
    font-size: 13px;
    color: var(--couleur-or-texte);
    border: 1px solid var(--couleur-or);
    border-radius: var(--rayon);
    padding: 2px 8px;
  }
  .objectif {
    font-style: italic;
  }
  .compteurs {
    font-weight: 600;
    color: var(--couleur-accent);
  }
  .issue {
    font-weight: 600;
  }
  ul {
    margin: 0;
    padding-left: 18px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .grille {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 8px 12px;
  }
  .grille label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .grille .large {
    grid-column: 1 / -1;
  }
  .levier {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: flex-end;
  }
  .levier label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  .cases label,
  fieldset label {
    display: inline-flex;
    align-items: center;
    gap: 6px;
  }
  fieldset {
    border: 1px solid var(--couleur-bordure-douce);
    border-radius: var(--rayon);
    padding: 8px 10px;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px 14px;
  }
</style>
