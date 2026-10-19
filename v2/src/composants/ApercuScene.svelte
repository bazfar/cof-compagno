<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { Case } from '../lib/battlemap/geometrie';
  import { estSceneImportee, geometrieImportee } from '../lib/battlemap/import-image';
  import type { JetonAffiche } from '../lib/battlemap/rendu';
  import { adresseImage, chargerGeometrie } from '../lib/battlemap/scenes';
  import type { DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreImageScene, suivreScenesImportees } from '../lib/magasins/carte.svelte';
  import type { ImageScene } from '../lib/schemas/carte';
  import type { GeometrieScene } from '../lib/schemas/scene';
  import { session } from '../lib/session.svelte';
  import Battlemap from './Battlemap.svelte';

  /*
   * Aperçu d'une scène pour le MJ seul (lot L3.5, prépa combat) : la carte
   * de la scène avec des jetons qui n'existent pas encore en base. Rien n'y
   * est écrit : déplacer un jeton appelle `surDeplacement`, et le parent
   * met à jour son brouillon. Mêmes scènes que la carte de la table
   * (catalogue livré, ou image importée par le MJ). `surChargee` signale la
   * géométrie, pour placer les jetons qui ne le sont pas encore.
   */

  let {
    scene,
    jetons,
    hauteur = '460px',
    surDeplacement,
    surChargee,
  }: {
    scene: string;
    jetons: readonly JetonAffiche[];
    hauteur?: string;
    surDeplacement: (id: string, vers: Case) => void;
    surChargee?: (g: GeometrieScene) => void;
  } = $props();

  const importees = suivreScenesImportees(session.table);
  onDestroy(() => importees.arreter());

  let geometrieCatalogue = $state<GeometrieScene | null>(null);
  let imageSuivie = $state<DocumentSuivi<ImageScene> | null>(null);
  let erreur = $state('');
  let selection = $state<string | null>(null);

  const importee = $derived(estSceneImportee(scene));
  const description = $derived(importee ? (importees.etat.elements.find((s) => s.id === scene) ?? null) : null);
  const geometrie: GeometrieScene | null = $derived(
    importee ? (description ? geometrieImportee(scene, description.nom, description, description.pxParCase) : null) : geometrieCatalogue,
  );
  const image = $derived(importee ? (imageSuivie?.etat.donnees?.image ?? '') : erreur ? '' : safeAdresse(scene));

  function safeAdresse(id: string): string {
    try {
      return adresseImage(id);
    } catch {
      return '';
    }
  }

  $effect(() => {
    const id = scene;
    geometrieCatalogue = null;
    erreur = '';
    let actif = true;
    const img = estSceneImportee(id) ? suivreImageScene(session.table, id) : null;
    imageSuivie = img;
    if (!img) {
      chargerGeometrie(id)
        .then((g) => {
          if (actif) geometrieCatalogue = g;
        })
        .catch((e: unknown) => {
          if (actif) erreur = String(e);
        });
    }
    return () => {
      actif = false;
      img?.arreter();
      imageSuivie = null;
    };
  });

  $effect(() => {
    if (geometrie) surChargee?.(geometrie);
  });

  const introuvable = $derived(importee && importees.etat.pret && !description);
</script>

<div class="apercu" style:height={hauteur} aria-label="Aperçu de la scène">
  {#if erreur || introuvable}
    <p class="vide erreur" role="alert">{erreur || 'Cette scène importée n’existe plus : choisis-en une autre.'}</p>
  {:else if geometrie}
    <Battlemap {geometrie} {image} {jetons} role="mj" {selection} {surDeplacement} surPorte={() => {}} surSelection={(id) => (selection = id)} />
  {:else}
    <p class="vide">Chargement de la scène…</p>
  {/if}
</div>

<style>
  .apercu {
    min-height: 240px;
  }
  .vide {
    height: 100%;
    margin: 0;
    display: grid;
    place-items: center;
    border-radius: var(--rayon-carte);
    background: var(--couleur-surface);
    border: 1px dashed var(--couleur-bordure);
    color: var(--couleur-encre-douce);
  }
  .erreur {
    color: var(--couleur-danger);
  }
</style>
