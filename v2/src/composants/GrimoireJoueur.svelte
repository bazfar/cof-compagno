<script lang="ts">
  import { onDestroy } from 'svelte';
  import { grimoireDeLaFiche } from '../lib/fiche/grimoire';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreSceneHorsCombat } from '../lib/magasins/scenes-hors-combat.svelte';
  import type { DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import type { SceneHorsCombat } from '../lib/schemas/scene-hors-combat';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import { session } from '../lib/session.svelte';
  import Grimoire from './Grimoire.svelte';

  /*
   * Le grimoire du personnage joué, section Grimoire de l'écran joueur
   * (lot G1, décision 1a). La section n'apparaît que si ce personnage a des
   * sorts (fiche de la refonte avec verbes ou sorts mineurs, 2a) :
   * `surDisponible` le dit à l'écran. Le joueur y demande ses sorts hors
   * combat (lot G2a), avec la séance ouverte pour les « une fois par
   * séance ». Appelé dans une scène ouverte (G2b, 8b), il peut encore le
   * faire ; un mot lui rappelle que, pour appuyer son jet, le sort se joint
   * à son action dans la carte de scène.
   */

  let { surDisponible }: { surDisponible?: (oui: boolean) => void } = $props();

  const joueurs = suivreJoueurs(session.table);
  const persos = suivrePersos(session.table);
  const table = suivreTable(session.table);
  onDestroy(() => {
    joueurs.arreter();
    persos.arreter();
    table.arreter();
  });
  const seance = $derived(table.etat.donnees?.seanceOuverte?.id);
  const idScene = $derived(table.etat.donnees?.sceneHorsCombat ?? null);
  let scene = $state<DocumentSuivi<SceneHorsCombat> | null>(null);
  $effect(() => {
    if (!idScene) return;
    const x = suivreSceneHorsCombat(session.table, idScene);
    scene = x;
    return () => {
      x.arreter();
      scene = null;
    };
  });
  const enScene = $derived(!!scene?.etat.donnees && scene.etat.donnees.statut === 'ouverte' && scene.etat.donnees.appelesUids.includes(session.uid));

  const fiche = $derived.by(() => {
    const id = joueurs.etat.elements.find((j) => j.id === session.uid)?.persoActif;
    const f = id ? persos.etat.elements.find((p) => p.id === id && p.proprietaireUid === session.uid) : undefined;
    return f && f.schemaVersion === 2 ? f : null;
  });
  const disponible = $derived(!!fiche && grimoireDeLaFiche(fiche) !== null);
  $effect(() => surDisponible?.(disponible));
</script>

{#if fiche && disponible}
  <Grimoire {fiche} lancer={{ seance, enScene }} />
{/if}
