<script lang="ts">
  import { onDestroy } from 'svelte';
  import { resoudreAction } from '../lib/actions/scenes-hors-combat';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { effetEnScene } from '../lib/fiche/sorts-hors-combat';
  import { suivreActionsScene, suivreSceneHorsCombat } from '../lib/magasins/scenes-hors-combat.svelte';
  import { suivreDemandesSortsMj } from '../lib/magasins/sorts-hors-combat.svelte';
  import type { ActionScene, SceneHorsCombat } from '../lib/schemas/scene-hors-combat';
  import { session } from '../lib/session.svelte';

  /*
   * Arbitre des scènes hors combat (lot S2, décision 5a) : sans écran. Monté
   * sur le poste du MJ quelle que soit la section ouverte, il résout chaque
   * jet dès qu'il arrive (le client du MJ est le seul à lire le DD) et
   * ouvre le tour suivant quand chacun a agi ou passé. Écran du MJ fermé :
   * les jets attendent.
   * Sorts en scène (lot G2b) : une action qui porte un sort n'est résolue
   * qu'une fois le sort tranché (accordé, lancé, sauvegarde faite).
   */

  const table = suivreTable(session.table);
  const demandes = suivreDemandesSortsMj(session.table);
  onDestroy(() => {
    table.arreter();
    demandes.arreter();
  });
  const sortTranche = (idSort: string | null) => {
    if (!idSort) return true;
    const d = demandes.etat.elements.find((x) => x.id === idSort);
    return !!d && effetEnScene(d) !== null;
  };
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
    if (!id || !s) return;
    // Relances de Mémoire eidétique (S3, 8a) : même scène terminée, tant qu'elle n'est pas close.
    if (s.statut !== 'close') for (const a of liste) if (a.relance && a.resultat === null) lancer(a.id, id, a.id);
    if (s.statut !== 'ouverte') return;
    const duTour = liste.filter((a) => a.tour === s.tour && !a.relance);
    for (const a of duTour) if (a.resultat === null && sortTranche(a.sort)) lancer(a.id, id, a.id);
    // Tous ont agi ou passé, mais le tour n'a pas tourné (le dernier a passé, par exemple).
    const faits = new Set(duTour.filter((a) => a.resultat !== null).map((a) => a.uid));
    if (duTour.length && s.appelesUids.every((u) => faits.has(u))) lancer(`tour-${s.tour}`, id, duTour[0]!.id);
  });
</script>
