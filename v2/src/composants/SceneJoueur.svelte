<script lang="ts">
  import { onDestroy } from 'svelte';
  import { agirEnScene, poserQuestion, RefusScene, relancerEnScene, utiliserCapacite } from '../lib/actions/scenes-hors-combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { lancerSort, RefusSort } from '../lib/actions/sorts-hors-combat';
  import { ppDisponibles, sortsLancables } from '../lib/fiche/sorts-hors-combat';
  import { suivreMesDemandesSorts } from '../lib/magasins/sorts-hors-combat.svelte';
  import type { Palier } from '../lib/schemas/effets';
  import { BONUS_PALIER } from '../lib/schemas/sort-hors-combat';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreActionsScene, suivreMesQuestions, suivreSceneHorsCombat, suivreUtilisationsScene } from '../lib/magasins/scenes-hors-combat.svelte';
  import { NOMS_CRANS } from '../lib/pnj/attitude';
  import { aLeNoeud, choixPossibles, cranScene, idAction, NOMS_TYPES, OPTIONS, OPTIONS_AVEC_SORT, relancable, type ChoixScene } from '../lib/scenes/hors-combat';
  import { dejaUtiliseCetteSeance, NARRATIFS, nomNoeud } from '../lib/scenes/vecu-en-scene';
  import type { ActionScene, SceneHorsCombat, UtilisationVecu } from '../lib/schemas/scene-hors-combat';
  import { session } from '../lib/session.svelte';

  /*
   * Scène hors combat, côté joueur (lot S2, décisions de Thomas du
   * 22/10/2026). Visible de toute la table pendant la scène ; seuls les
   * appelés agissent, avec le personnage joué à l'ouverture (2a).
   *   - Social : Convaincre, Menacer, Tromper, Séduire (8a), chacune avec sa
   *     compétence et le bonus de la fiche (Vécu compris) ; Séduire grisé
   *     sous Neutre. Exploration et enquête : la compétence au choix (4b) ;
   *     en mode groupe, celle du MJ. Toujours : passer son tour (7a).
   *   - Le d20 part au journal ; le client du MJ dit réussite ou échec (5a).
   *   - On voit l'objectif, l'attitude du PNJ en ce moment de la scène, les
   *     réussites, les échecs si le MJ les montre (6a), et les jets de
   *     chacun. Jamais le DD.
   * Vécu en scène (lot S3) : Lire les gens et Citer le précédent parmi les
   * options ; la relance de Mémoire eidétique après un échec d'INT ou de
   * CHA ; une question au MJ (Savant) ; les « Capacités du Vécu »
   * narratives. Ce que Lire les gens révèle et les réponses du MJ ne
   * s'affichent que chez le joueur concerné.
   * Sorts en scène (lot G2b, décisions de Thomas du 22/10/2026) : un sort
   * peut appuyer une option sociale ou une compétence (7a), avec une ligne
   * d'intention (1a) ; le d20 part comme d'habitude, le jet attend que le
   * MJ tranche le sort. Accordé, ce client le lance de lui-même (4b : PP
   * payés, jet d'échec) ; refusé, l'action est défaite et le joueur rejoue
   * son tour (2b).
   */

  const table = suivreTable(session.table);
  const persos = suivrePersos(session.table);
  const questions = suivreMesQuestions(session.table, session.uid);
  const demandes = suivreMesDemandesSorts(session.table, session.uid);
  onDestroy(() => {
    table.arreter();
    persos.arreter();
    questions.arreter();
    demandes.arreter();
  });
  const id = $derived(table.etat.donnees?.sceneHorsCombat ?? null);

  let suivi = $state<{ s: DocumentSuivi<SceneHorsCombat>; a: CollectionSuivie<ActionScene>; u: CollectionSuivie<UtilisationVecu> } | null>(null);
  $effect(() => {
    if (!id) return;
    const x = { s: suivreSceneHorsCombat(session.table, id), a: suivreActionsScene(session.table, id), u: suivreUtilisationsScene(session.table, id) };
    suivi = x;
    return () => {
      x.s.arreter();
      x.a.arreter();
      x.u.arreter();
      suivi = null;
    };
  });
  const utilisations = $derived([...(suivi?.u.etat.elements ?? [])].sort((a, b) => a.creeLe - b.creeLe));
  const scene = $derived(suivi?.s.etat.donnees ?? null);
  const actions = $derived([...(suivi?.a.etat.elements ?? [])].sort((a, b) => a.tour - b.tour || a.creeLe - b.creeLe));
  const moi = $derived(scene?.appeles.find((a) => a.uid === session.uid) ?? null);
  const monActe = $derived(scene && moi ? (actions.find((a) => a.uid === moi.uid && a.tour === scene.tour && !a.relance) ?? null) : null);

  // Bonus de chaque compétence, depuis la fiche du personnage appelé (Vécu compris).
  const fiche = $derived(moi ? (persos.etat.elements.find((p) => p.id === moi.perso) ?? null) : null);
  const mods = $derived(fiche ? new Map(vueFiche(fiche).competences.map((c) => [c.nom, c.mod])) : new Map<string, number>());
  const competences = $derived([...mods.keys()].sort((a, b) => a.localeCompare(b, 'fr')));
  const choix = $derived(scene ? choixPossibles(scene, session.uid) : []);

  // ---- Vécu en scène (S3) ----
  const usages = $derived((fiche?.usages ?? {}) as Record<string, unknown>);
  // Mémoire eidétique (8a) : mes échecs relançables, sans relance déjà faite, une fois par séance.
  const aRelancer = $derived(
    scene && moi && !dejaUtiliseCetteSeance(usages, 'memoire-eidetique', scene.seance)
      ? actions.filter((a) => a.uid === moi.uid && relancable(scene, a) && !actions.some((r) => r.relance && r.tour === a.tour && r.uid === a.uid))
      : [],
  );
  const capacites = $derived(scene && moi ? (scene.vecus[moi.uid] ?? []).filter((n) => n in NARRATIFS) : []);
  const capaciteUtilisee = (n: string) =>
    NARRATIFS[n] === 'scene' ? utilisations.some((u) => u.uid === session.uid && u.noeud === n) : NARRATIFS[n] === 'jour' ? dejaUtiliseCetteSeance(usages, n, scene?.seance) : false;
  const mesQuestions = $derived(questions.etat.elements.filter((q) => q.scene === id));
  const lecture = $derived(mesQuestions.find((q) => q.noeud === 'lire-les-gens') ?? null);
  const savant = $derived(mesQuestions.find((q) => q.noeud === 'savant') ?? null);
  let question = $state('');

  async function vecu(f: () => Promise<unknown>) {
    message = '';
    occupe = true;
    try {
      await f();
      return true;
    } catch (e) {
      message = e instanceof RefusScene ? e.message : messageErreurJournal(e);
      return false;
    } finally {
      occupe = false;
    }
  }
  let competenceLibre = $state('Perception');

  // ---- Sorts en scène (G2b) ----
  const ficheV2 = $derived(fiche && fiche.schemaVersion === 2 ? fiche : null);
  const lancables = $derived(ficheV2 ? sortsLancables(ficheV2) : []);
  const dispo = $derived(ficheV2 ? ppDisponibles(ficheV2) : 0);
  let sortChoisi = $state('');
  let intentionSort = $state('');
  const sortJoint = $derived.by(() => {
    if (!sortChoisi || !ficheV2) return null;
    const [sort, palier] = sortChoisi.split('|') as [string, Palier];
    return { fiche: ficheV2, sort, palier, intention: intentionSort };
  });
  const mesSorts = $derived(demandes.etat.elements.filter((d) => d.scene === id));
  const sortDuTour = $derived(monActe?.sort ? (mesSorts.find((d) => d.id === monActe.sort) ?? null) : null);
  const sortRefuse = $derived(scene && moi && !monActe ? (mesSorts.find((d) => d.action === idAction(scene.tour, moi.uid) && d.statut === 'refusee') ?? null) : null);
  // 4b : un sort accordé se lance de lui-même depuis ce client, une fois.
  const lances = new Set<string>();
  $effect(() => {
    for (const d of mesSorts)
      if (d.statut === 'acceptee' && !lances.has(d.id)) {
        lances.add(d.id);
        lancerSort(d.id, scene?.seance, undefined, table.etat.donnees?.sceneActive ?? null).catch((e: unknown) => {
          lances.delete(d.id);
          message = e instanceof RefusSort ? e.message : messageErreurJournal(e);
        });
      }
  });
  const attenteSort = (d: { statut: string; sauvegarde: unknown; resistance: unknown }) =>
    d.statut === 'attente' ? 'Ton sort attend l’accord du MJ…' : d.statut === 'acceptee' ? 'Sort accordé : lancement…' : d.statut === 'lancee' && d.sauvegarde !== null && d.resistance === null ? 'La cible fait sa sauvegarde…' : 'Le MJ tranche…';

  let message = $state('');
  let occupe = $state(false);
  async function jouer(c: ChoixScene | null) {
    if (!scene || !id) return;
    const competence = c ? (c.competence ?? competenceLibre) : null;
    message = '';
    occupe = true;
    const avecSort = c && sortJoint && OPTIONS_AVEC_SORT.includes(c.option) ? sortJoint : null;
    try {
      await agirEnScene(id, scene, c ? c.option : 'passer', competence, competence ? (mods.get(competence) ?? 0) : 0, avecSort);
      sortChoisi = '';
      intentionSort = '';
    } catch (e) {
      message = e instanceof RefusScene ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }

  const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0');
  const NOMS_VECU = { lire: 'Lire les gens', citer: 'Citer le précédent' } as const;
  const nomOption = (a: ActionScene) =>
    a.option in OPTIONS ? OPTIONS[a.option as keyof typeof OPTIONS].nom : a.option in NOMS_VECU ? NOMS_VECU[a.option as keyof typeof NOMS_VECU] : a.option === 'passer' ? 'passe son tour' : a.competence;
  const NOMS_RESULTATS = { reussite: 'réussite', echec: 'échec', passe: '' } as const;
</script>

{#if scene}
  {@const cran = cranScene(scene)}
  <section class="carte scene" aria-label="Scène en cours">
    <h2>Scène · {NOMS_TYPES[scene.type]} · {scene.cible}</h2>
    <p class="objectif">{scene.objectif}</p>
    {#if cran}<p>Attitude : <strong data-testid="scene-attitude">{NOMS_CRANS[cran]}</strong></p>{/if}
    <p class="compteurs">
      <span data-testid="scene-reussites">Réussites {scene.reussites} / {scene.requis}</span>
      {#if scene.echecsVisibles}<span data-testid="scene-echecs">Échecs {scene.echecs} / {scene.toleres + 1}</span>{/if}
      {#if scene.statut === 'ouverte'}<span>Tour {scene.tour}</span>{/if}
    </p>

    {#if scene.statut !== 'ouverte'}
      <p class="aide">Scène terminée : le MJ conclut.</p>
    {:else if moi && !monActe}
      {#if sortRefuse}<p class="prive">Le MJ a refusé ton sort{sortRefuse.motif ? ` : ${sortRefuse.motif}` : ''}. Rejoue ton tour.</p>{/if}
      <div class="choix" role="group" aria-label="Ton action">
        {#if lancables.length}
          <label
            >Un sort pour appuyer ton jet (facultatif)
            <select bind:value={sortChoisi}>
              <option value="">Aucun</option>
              {#each lancables as s (s.id)}
                {#each s.paliers as p (p.palier)}
                  <option value="{s.id}|{p.palier}" disabled={p.pp > dispo}>{s.nom} {p.palier} · {p.pp} PP · bonus +{BONUS_PALIER[p.palier]}{s.echec ? ` · échec sur 1 à ${s.echec}` : ''}</option>
                {/each}
              {/each}
            </select>
          </label>
          {#if sortChoisi}
            <label>Ce que fait le sort <input maxlength="120" placeholder="Le charme rend le garde bienveillant…" bind:value={intentionSort} /></label>
          {/if}
        {/if}
        {#if scene.type !== 'social' && scene.mode === 'individuel'}
          <label
            >Compétence
            <select bind:value={competenceLibre}>
              {#each competences as c (c)}<option value={c}>{c} ({signe(mods.get(c) ?? 0)})</option>{/each}
            </select>
          </label>
        {/if}
        {#each choix as c (c.option)}
          {@const comp = c.competence ?? competenceLibre}
          {@const refusSort = sortChoisi ? (!OPTIONS_AVEC_SORT.includes(c.option) ? 'Un sort n’appuie pas cette option.' : !intentionSort.trim() ? 'Dis ce que fait le sort.' : null) : null}
          <button disabled={occupe || c.refus !== null || refusSort !== null} title={c.refus ?? refusSort ?? ''} onclick={() => jouer(c)}>
            {c.option === 'competence' ? `Lancer ${comp}` : `${c.nom} · ${comp}`} {signe(mods.get(comp) ?? 0)}
          </button>
        {/each}
        <button class="discret" disabled={occupe || !!sortChoisi} onclick={() => jouer(null)}>Passer mon tour</button>
      </div>
    {:else if moi && monActe}
      <p class="aide">{monActe.resultat === null ? (sortDuTour ? attenteSort(sortDuTour) : 'Le MJ tranche…') : 'Tu as joué ce tour : on attend les autres.'}</p>
    {/if}

    {#each aRelancer as a (a.id)}
      <button disabled={occupe} onclick={() => vecu(() => relancerEnScene(id!, scene, a, usages, scene.seance))}>Relancer (Mémoire eidétique) : {a.competence}</button>
    {/each}
    {#if lecture}
      <p class="prive" data-testid="lecture">Lire les gens : il te faudra {lecture.dd}. {lecture.reponse ? `Intention : ${lecture.reponse}` : 'Le MJ te dit son intention…'}</p>
    {/if}
    {#if moi && aLeNoeud(scene, moi.uid, 'savant')}
      {#if savant}
        <p class="prive">Savant : {savant.question} — {savant.reponse ?? 'le MJ réfléchit…'}</p>
      {:else}
        <form class="savant" onsubmit={(e) => (e.preventDefault(), vecu(() => poserQuestion('savant', question, { perso: moi.perso, nom: moi.nom, usages, seance: scene.seance, scene: id })).then((ok) => ok && (question = '')))}>
          <label>Savant : une question au MJ, un fait sûr <input maxlength="300" bind:value={question} /></label>
          <button disabled={occupe || !question.trim()}>Poser au MJ</button>
        </form>
      {/if}
    {/if}
    {#if capacites.length}
      <div class="capacites" role="group" aria-label="Capacités du Vécu">
        {#each capacites as n (n)}
          <button class="discret" disabled={occupe || scene.statut === 'close' || capaciteUtilisee(n)} onclick={() => vecu(() => utiliserCapacite(id!, scene, n, usages))}>Utiliser {nomNoeud(n)}</button>
        {/each}
      </div>
    {/if}
    {#if utilisations.length}
      <p class="aide">Capacités utilisées : {utilisations.map((u) => `${u.nom} — ${nomNoeud(u.noeud)}`).join(' ; ')}</p>
    {/if}

    {#if actions.length}
      <ul class="jets">
        {#each actions as a (a.id)}
          <li>
            Tour {a.tour} · {a.nom} : {a.relance ? 'relance, ' : ''}{nomOption(a)}{a.de !== null ? ` — ${a.de + a.bonus}` : ''}{a.resultat && a.resultat !== 'passe' ? `, ${NOMS_RESULTATS[a.resultat]}` : a.resultat === null ? ', en cours…' : ''}{a.note
              ? ` (${a.note})`
              : ''}{a.annule ? ', relancé' : ''}
          </li>
        {/each}
      </ul>
    {/if}
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </section>
{/if}

<style>
  .scene {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    border-color: var(--couleur-accent-clair);
  }
  h2 {
    font-size: 18px;
  }
  p {
    margin: 0;
  }
  .objectif {
    font-style: italic;
  }
  .compteurs {
    display: flex;
    flex-wrap: wrap;
    gap: 12px;
    font-weight: 600;
    color: var(--couleur-accent);
  }
  .choix {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: flex-end;
  }
  .choix label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    width: 100%;
  }
  .prive {
    font-size: 14px;
    color: var(--couleur-or-texte);
    border-left: 3px solid var(--couleur-or);
    padding-left: 8px;
  }
  .savant,
  .capacites {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: flex-end;
  }
  .savant label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }
  .jets {
    margin: 0;
    padding-left: 18px;
    font-size: 14px;
  }
</style>
