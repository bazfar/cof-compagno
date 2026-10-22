<script lang="ts">
  import { onDestroy } from 'svelte';
  import { agirEnScene, RefusScene } from '../lib/actions/scenes-hors-combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreActionsScene, suivreSceneHorsCombat } from '../lib/magasins/scenes-hors-combat.svelte';
  import { NOMS_CRANS } from '../lib/pnj/attitude';
  import { choixPossibles, cranScene, NOMS_TYPES, OPTIONS, type ChoixScene } from '../lib/scenes/hors-combat';
  import type { ActionScene, SceneHorsCombat } from '../lib/schemas/scene-hors-combat';
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
   */

  const table = suivreTable(session.table);
  const persos = suivrePersos(session.table);
  onDestroy(() => {
    table.arreter();
    persos.arreter();
  });
  const id = $derived(table.etat.donnees?.sceneHorsCombat ?? null);

  let suivi = $state<{ s: DocumentSuivi<SceneHorsCombat>; a: CollectionSuivie<ActionScene> } | null>(null);
  $effect(() => {
    if (!id) return;
    const x = { s: suivreSceneHorsCombat(session.table, id), a: suivreActionsScene(session.table, id) };
    suivi = x;
    return () => {
      x.s.arreter();
      x.a.arreter();
      suivi = null;
    };
  });
  const scene = $derived(suivi?.s.etat.donnees ?? null);
  const actions = $derived([...(suivi?.a.etat.elements ?? [])].sort((a, b) => a.tour - b.tour || a.creeLe - b.creeLe));
  const moi = $derived(scene?.appeles.find((a) => a.uid === session.uid) ?? null);
  const monActe = $derived(scene && moi ? (actions.find((a) => a.uid === moi.uid && a.tour === scene.tour) ?? null) : null);

  // Bonus de chaque compétence, depuis la fiche du personnage appelé (Vécu compris).
  const fiche = $derived(moi ? (persos.etat.elements.find((p) => p.id === moi.perso) ?? null) : null);
  const mods = $derived(fiche ? new Map(vueFiche(fiche).competences.map((c) => [c.nom, c.mod])) : new Map<string, number>());
  const competences = $derived([...mods.keys()].sort((a, b) => a.localeCompare(b, 'fr')));
  const choix = $derived(scene ? choixPossibles(scene) : []);
  let competenceLibre = $state('Perception');

  let message = $state('');
  let occupe = $state(false);
  async function jouer(c: ChoixScene | null) {
    if (!scene || !id) return;
    const competence = c ? (c.competence ?? competenceLibre) : null;
    message = '';
    occupe = true;
    try {
      await agirEnScene(id, scene, c ? c.option : 'passer', competence, competence ? (mods.get(competence) ?? 0) : 0);
    } catch (e) {
      message = e instanceof RefusScene ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }

  const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0');
  const nomOption = (a: ActionScene) => (a.option in OPTIONS ? OPTIONS[a.option as keyof typeof OPTIONS].nom : a.option === 'passer' ? 'passe son tour' : a.competence);
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
      <div class="choix" role="group" aria-label="Ton action">
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
          <button disabled={occupe || c.refus !== null} title={c.refus ?? ''} onclick={() => jouer(c)}>
            {c.option === 'competence' ? `Lancer ${comp}` : `${c.nom} · ${comp}`} {signe(mods.get(comp) ?? 0)}
          </button>
        {/each}
        <button class="discret" disabled={occupe} onclick={() => jouer(null)}>Passer mon tour</button>
      </div>
    {:else if moi && monActe}
      <p class="aide">{monActe.resultat === null ? 'Le MJ tranche…' : 'Tu as joué ce tour : on attend les autres.'}</p>
    {/if}

    {#if actions.length}
      <ul class="jets">
        {#each actions as a (a.id)}
          <li>Tour {a.tour} · {a.nom} : {nomOption(a)}{a.de !== null ? ` — ${a.de + a.bonus}` : ''}{a.resultat && a.resultat !== 'passe' ? `, ${NOMS_RESULTATS[a.resultat]}` : a.resultat === null ? ', en cours…' : ''}</li>
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
  .jets {
    margin: 0;
    padding-left: 18px;
    font-size: 14px;
  }
</style>
