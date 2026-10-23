<script lang="ts">
  import { onDestroy } from 'svelte';
  import { idJetonPerso } from '../lib/battlemap/jetons-pj';
  import type { CarteDuCombat } from '../lib/combat/attaque';
  import { aTerreDuCombat } from '../lib/combat/ordre';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreCombat, suivreCombattants } from '../lib/magasins/combat.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreJoueurs } from '../lib/magasins/presents.svelte';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import { session } from '../lib/session.svelte';
  import BandeauCombat from './BandeauCombat.svelte';
  import BarreCombat from './BarreCombat.svelte';
  import CarteTable from './CarteTable.svelte';
  import OrdreCombat from './OrdreCombat.svelte';

  /*
   * Le joueur en combat (lot L6.1, maquette 2.0 « Joueur · en combat ») :
   * l'initiative à gauche, la carte au centre, la barre de son personnage
   * dessous ; la fiche se replie. Monté en permanence dans la section
   * Personnage de l'écran joueur : `surEnCombat` dit à l'écran si son
   * personnage joué est dans le combat en cours, pour qu'il range la
   * disposition ordinaire.
   *
   * Lot L6.2 : la barre reçoit le combat, son combattant, les fiches des PJ
   * (relever un allié) et la carte (portées, 4a).
   * Lot L6.3 : le bandeau des combattants, leurs PV et leurs états, au-dessus
   * de la carte (C).
   */

  let { surEnCombat }: { surEnCombat?: (oui: boolean) => void } = $props();

  const table = suivreTable(session.table);
  const persos = suivrePersos(session.table);
  const joueurs = suivreJoueurs(session.table);
  onDestroy(() => {
    table.arreter();
    persos.arreter();
    joueurs.arreter();
  });
  const idCombat = $derived(table.etat.donnees?.combat ?? null);
  let suivi = $state<{ c: DocumentSuivi<Combat>; m: CollectionSuivie<Combattant> } | null>(null);
  $effect(() => {
    if (!idCombat) return;
    const x = { c: suivreCombat(session.table, idCombat), m: suivreCombattants(session.table, idCombat) };
    suivi = x;
    return () => {
      x.c.arreter();
      x.m.arreter();
      suivi = null;
    };
  });
  const combat = $derived(suivi?.c.etat.donnees ?? null);
  const combattants = $derived(suivi?.m.etat.elements ?? []);
  const persoActif = $derived(joueurs.etat.elements.find((j) => j.id === session.uid)?.persoActif ?? null);
  const fiche = $derived(persoActif ? (persos.etat.elements.find((p) => p.id === persoActif && p.proprietaireUid === session.uid) ?? null) : null);
  const enCombat = $derived(!!combat && combat.statut === 'encours' && !!persoActif && combattants.some((c) => c.id === idJetonPerso(persoActif)));
  $effect(() => surEnCombat?.(enCombat));

  const pvParPerso = $derived(new Map(persos.etat.elements.map((p) => [p.id, vueFiche(p).pv])));
  const pvPj = $derived(new Map(combattants.filter((c) => c.perso && pvParPerso.has(c.perso)).map((c) => [c.id, pvParPerso.get(c.perso!)!])));
  const aTerre = $derived(aTerreDuCombat(combattants));
  const moi = $derived(persoActif ? (combattants.find((c) => c.id === idJetonPerso(persoActif)) ?? null) : null);
  const fiches = $derived(new Map(persos.etat.elements.map((p) => [p.id, p])));
  let carte = $state<CarteDuCombat | null>(null);
</script>

{#if enCombat && combat && idCombat}
  <div class="combat">
    <OrdreCombat role="joueur" {idCombat} {combat} {combattants} {aTerre} {pvPj} />
    <div class="centre">
      <BandeauCombat />
      <CarteTable role="joueur" hauteur="560px" surCarte={(c) => (carte = c)} />
      {#if fiche && moi}<BarreCombat {fiche} {idCombat} {combat} {moi} {combattants} {fiches} {carte} />{/if}
    </div>
  </div>
{/if}

<style>
  .combat {
    display: grid;
    grid-template-columns: 250px minmax(0, 1fr);
    gap: 16px;
    align-items: start;
  }
  .centre {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  @media (max-width: 900px) {
    .combat {
      grid-template-columns: minmax(0, 1fr);
    }
  }
</style>
