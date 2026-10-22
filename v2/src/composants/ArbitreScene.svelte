<script lang="ts">
  import { onDestroy } from 'svelte';
  import { resoudreAction } from '../lib/actions/scenes-hors-combat';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreActionsScene, suivreSceneHorsCombat } from '../lib/magasins/scenes-hors-combat.svelte';
  import type { ActionScene, SceneHorsCombat } from '../lib/schemas/scene-hors-combat';
  import { session } from '../lib/session.svelte';

  /*
   * Arbitre des scènes hors combat (lot S2, décision 5a) : sans écran. Monté
   * sur le poste du MJ quelle que soit la section ouverte, il résout chaque
   * jet dès qu'il arrive (le client du MJ est le seul à lire le DD) et
   * ouvre le tour suivant quand chacun a agi ou passé. Écran du MJ fermé :
   * les jets attendent.
   */

  const table = suivreTable(session.table);
  onDestroy(() => table.arreter());
  const id = $derived(table.etat.donnees?.sceneHorsCombat ?? null);

  let scene = $state<DocumentSuivi<SceneHorsCombat> | null>(null);
  let actions = $state<CollectionSuivie<ActionScene> | null>(null);
  $effect(() => {
    if (!id) return;
    const s = suivreSceneHorsCombat(session.table, id);
    const a = suivreActionsScene(session.table, id);
    scene = s;
    actions = a;
    return () => {
      s.arreter();
      a.arreter();
      scene = null;
      actions = null;
    };
  });

  // Une seule résolution à la fois par action (ou par tour à faire tourner).
  const enCours = new Set<string>();
  function lancer(cle: string, idScene: string, idActe: string) {
    if (enCours.has(cle)) return;
    enCours.add(cle);
    resoudreAction(idScene, idActe)
      .catch((e: unknown) => console.error('Scène : jet non résolu', e))
      .finally(() => enCours.delete(cle));
  }

  $effect(() => {
    const s = scene?.etat.donnees;
    const liste = actions?.etat.elements ?? [];
    if (!id || !s || s.statut !== 'ouverte') return;
    const duTour = liste.filter((a) => a.tour === s.tour);
    for (const a of duTour) if (a.resultat === null) lancer(a.id, id, a.id);
    // Tous ont agi ou passé, mais le tour n'a pas tourné (le dernier a passé, par exemple).
    const faits = new Set(duTour.filter((a) => a.resultat !== null).map((a) => a.uid));
    if (duTour.length && s.appelesUids.every((u) => faits.has(u))) lancer(`tour-${s.tour}`, id, duTour[0]!.id);
  });
</script>
