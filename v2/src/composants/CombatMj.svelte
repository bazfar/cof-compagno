<script lang="ts">
  import { onDestroy } from 'svelte';
  import { remettreJetsDeMort } from '../lib/actions/attaques';
  import { marquerMort } from '../lib/actions/carte';
  import { ajouterCombattant, basculerPortees, cloreCombat, demarrerCombat, donnerLaMain, RefusCombat } from '../lib/actions/combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { brouillonDuCombat, manquePourDemarrer, type BrouillonCombattant, type FichePourCombat, type MonstrePourCombat } from '../lib/combat/demarrage';
  import { jetsDeMortARemettre } from '../lib/combat/mort';
  import { aTerreDuCombat, premierActif } from '../lib/combat/ordre';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreArmuresMonstres, suivreBestiaire } from '../lib/magasins/bestiaire.svelte';
  import { suivreJetons, suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreCombat, suivreCombattants } from '../lib/magasins/combat.svelte';
  import { suivrePersos } from '../lib/magasins/persos.svelte';
  import { suivreRencontres } from '../lib/magasins/rencontres.svelte';
  import type { Jeton } from '../lib/schemas/carte';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import { session } from '../lib/session.svelte';
  import OrdreCombat from './OrdreCombat.svelte';

  /*
   * Section Combat du MJ, colonne de gauche (lot L6.1, décisions de Thomas
   * du 23/10/2026 ; maquette 2.0 « MJ · section Combat ») :
   *   - sans combat : le démarrer sur la scène montrée (4a), depuis une
   *     rencontre lancée sur cette scène (ses monstres, avec initiative et PV
   *     du bestiaire) ou en combat libre (les jetons posés ; le MJ donne les
   *     PV des monstres) ;
   *   - en combat : son nom et son round, l'initiative (OrdreCombat), un
   *     combattant qui arrive (9a), la clôture (11a).
   * Personne n'a encore la main (aucune initiative au démarrage) : dès que
   * quelqu'un en a une, le client du MJ la lui donne.
   *
   * Lot L6.2 (décisions de Thomas du 23/10/2026) :
   *   - les monstres entrent avec leur DEF, leur armure et leurs
   *     résistances (1b, 10a) ; un monstre posé à la main attend sa DEF ;
   *   - « Portées libres » : le MJ laisse attaquer hors de portée (4a) ;
   *   - le client du MJ tient ce que les joueurs n'écrivent pas : le jeton
   *     d'un monstre tombé sous leurs coups est marqué mort, et les jets de
   *     mort d'un PJ relevé ou soigné repartent de zéro (7a).
   */

  const table = suivreTable(session.table);
  const persos = suivrePersos(session.table);
  const rencontres = suivreRencontres(session.table);
  const bestiaire = suivreBestiaire(session.table);
  const armures = suivreArmuresMonstres(session.table);
  onDestroy(() => {
    table.arreter();
    persos.arreter();
    rencontres.arreter();
    bestiaire.arreter();
    armures.arreter();
  });
  const idScene = $derived(table.etat.donnees?.sceneActive ?? null);
  const idCombat = $derived(table.etat.donnees?.combat ?? null);

  let jetonsSuivis = $state<CollectionSuivie<Jeton> | null>(null);
  $effect(() => {
    if (!idScene) return;
    const j = suivreJetons(session.table, idScene);
    jetonsSuivis = j;
    return () => {
      j.arreter();
      jetonsSuivis = null;
    };
  });
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

  // ---- Ce que le combat lit des fiches et du bestiaire ----
  const fiches = $derived(
    new Map<string, FichePourCombat>(persos.etat.elements.map((p) => [p.id, { nom: p.nom, uid: p.proprietaireUid, modInit: vueFiche(p).stats.initiative, dons: p.dons }])),
  );
  const reductions = $derived(new Map((armures.etat.donnees?.liste ?? []).map((a) => [a.id, a.reduction])));
  const modeles = $derived(
    new Map<string, MonstrePourCombat>(
      bestiaire.etat.elements.map((m) => [m.id, { init: m.init, pv: m.pv, def: m.def, armure: m.armureId ? (reductions.get(m.armureId) ?? 0) : 0, resistances: m.resistances }]),
    ),
  );
  const pvParPerso = $derived(new Map(persos.etat.elements.map((p) => [p.id, vueFiche(p).pv])));
  const pvPj = $derived(new Map(combattants.filter((c) => c.perso && pvParPerso.has(c.perso)).map((c) => [c.id, pvParPerso.get(c.perso!)!])));
  const aTerre = $derived(aTerreDuCombat(combattants));

  // ---- Démarrer (4a) ----
  const rencontresIci = $derived(rencontres.etat.elements.filter((r) => r.scene === idScene && r.statut === 'lancee').sort((a, b) => (b.lanceeLe ?? 0) - (a.lanceeLe ?? 0)));
  let rencontreChoisie = $state<string | null>(null);
  const rencontre = $derived(rencontreChoisie === '' ? null : (rencontresIci.find((r) => r.id === rencontreChoisie) ?? rencontresIci[0] ?? null));
  let nomSaisi = $state<string | null>(null);
  let pvSaisis = $state<Record<string, number>>({});
  let defSaisies = $state<Record<string, number>>({});
  const avecPv = (b: BrouillonCombattant[]) =>
    b.map((c) =>
      c.genre !== 'monstre' ? c : { ...c, ...(pvSaisis[c.id] ? { pvMax: pvSaisis[c.id]! } : {}), ...(defSaisies[c.id] !== undefined ? { def: defSaisies[c.id]! } : {}) },
    );
  const brouillon = $derived(avecPv(brouillonDuCombat(jetonsSuivis?.etat.elements ?? [], fiches, rencontre, modeles)));
  const manque = $derived(idScene ? manquePourDemarrer(brouillon) : 'Montre d’abord une scène à la table.');

  // ---- Arriver en cours de combat (9a) ----
  const rencontreDuCombat = $derived(combat?.rencontre ? (rencontres.etat.elements.find((r) => r.id === combat.rencontre) ?? null) : null);
  const absents = $derived(idCombat ? brouillonDuCombat(jetonsSuivis?.etat.elements ?? [], fiches, rencontreDuCombat, modeles).filter((b) => !combattants.some((c) => c.id === b.id)) : []);
  let arrivant = $state('');
  let pvArrivant = $state<number | null>(null);
  let defArrivant = $state<number | null>(null);
  const brouillonArrivant = $derived(absents.find((b) => b.id === arrivant) ?? null);

  let message = $state('');
  let occupe = $state(false);
  async function agir(f: () => Promise<unknown>) {
    message = '';
    occupe = true;
    try {
      await f();
      return true;
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
      return false;
    } finally {
      occupe = false;
    }
  }
  async function demarrer() {
    if (!idScene) return;
    const scene = idScene;
    const ok = await agir(() => demarrerCombat({ nom: nomSaisi ?? rencontre?.nom ?? 'Combat', scene, rencontre: rencontre?.id ?? null, combattants: brouillon }, idCombat));
    if (ok) {
      pvSaisis = {};
      defSaisies = {};
      nomSaisi = null;
    }
  }
  async function ajouter() {
    const b = brouillonArrivant;
    if (!b || !idCombat) return;
    const id = idCombat;
    const complet = b.genre !== 'monstre' ? b : { ...b, ...(pvArrivant ? { pvMax: pvArrivant } : {}), ...(defArrivant !== null ? { def: defArrivant } : {}) };
    if (await agir(() => ajouterCombattant(id, complet))) {
      arrivant = '';
      pvArrivant = null;
      defArrivant = null;
    }
  }
  async function clore() {
    if (!idCombat || !confirm('Clore le combat ? L’ordre d’initiative sera effacé.')) return;
    const id = idCombat;
    await agir(() => cloreCombat(id));
  }

  // Personne n'a la main : dès qu'un combattant a une initiative, le client du MJ la lui donne.
  let mainDonnee: string | null = null;
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours' || combat.actif !== null) return;
    const premier = premierActif(combattants, aTerre);
    if (!premier || mainDonnee === `${combat.tour}-${premier}`) return;
    mainDonnee = `${combat.tour}-${premier}`;
    agir(() => donnerLaMain(idCombat, combat, premier));
  });

  // L6.2 : un monstre tombé sous les coups d'un joueur (ou relevé) — son jeton suit.
  const jetonsMarques = new Set<string>();
  $effect(() => {
    if (!combat || combat.statut !== 'encours' || !idScene || idScene !== combat.scene) return;
    const scene = idScene;
    for (const c of combattants) {
      const j = jetonsSuivis?.etat.elements.find((x) => x.id === c.id);
      if (c.genre !== 'monstre' || !j || !!j.mort === c.aTerre || jetonsMarques.has(`${c.id}:${c.aTerre}`)) continue;
      jetonsMarques.add(`${c.id}:${c.aTerre}`);
      jetonsMarques.delete(`${c.id}:${!c.aTerre}`);
      agir(() => marquerMort(scene, c.id, c.aTerre));
    }
  });
  // L6.2 (7a) : un PJ relevé ou soigné repart de zéro jet de mort.
  const jetsRemis = new Set<string>();
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours') return;
    const id = idCombat;
    for (const c of combattants) {
      const cle = `${c.id}:${c.mortSucces}:${c.mortEchecs}:${c.mort}`;
      if (!jetsDeMortARemettre(c, c.perso ? pvParPerso.get(c.perso)?.actuel : undefined) || jetsRemis.has(cle)) continue;
      jetsRemis.add(cle);
      agir(() => remettreJetsDeMort(id, c));
    }
  });
</script>

{#if combat && idCombat && combat.statut === 'encours'}
  <div class="colonne">
    <section class="carte tete" aria-label="Combat en cours">
      <h2>{combat.nom}</h2>
      <p class="aide">Round {combat.round} · {combattants.filter((c) => c.genre === 'pj').length} PJ, {combattants.filter((c) => c.genre === 'monstre').length} monstres</p>
      {#if absents.length}
        <details>
          <summary>Ajouter un combattant</summary>
          <form onsubmit={(e) => (e.preventDefault(), ajouter())}>
            <label
              >Jeton de la scène
              <select bind:value={arrivant}>
                <option value="">—</option>
                {#each absents as b (b.id)}<option value={b.id}>{b.nom}</option>{/each}
              </select>
            </label>
            {#if brouillonArrivant?.genre === 'monstre' && brouillonArrivant.pvMax === null}
              <label>PV <input type="number" min="1" max="9999" bind:value={pvArrivant} /></label>
            {/if}
            {#if brouillonArrivant?.genre === 'monstre' && brouillonArrivant.def === null}
              <label>DEF <input type="number" min="-10" max="99" bind:value={defArrivant} /></label>
            {/if}
            <button
              class="petit"
              disabled={occupe ||
                !brouillonArrivant ||
                (brouillonArrivant.genre === 'monstre' && ((brouillonArrivant.pvMax === null && !pvArrivant) || (brouillonArrivant.def === null && defArrivant === null)))}>Ajouter</button
            >
          </form>
        </details>
      {/if}
      <label class="case"
        ><input type="checkbox" checked={combat.porteesLibres} disabled={occupe} onchange={(e) => agir(() => basculerPortees(idCombat, e.currentTarget.checked))} /> Portées libres : les joueurs
        attaquent hors de portée</label
      >
      <button class="discret" disabled={occupe} onclick={clore}>Clore le combat</button>
    </section>
    <OrdreCombat role="mj" {idCombat} {combat} {combattants} {aTerre} {pvPj} />
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </div>
{:else}
  <section class="carte demarrer" aria-label="Démarrer un combat">
    <h2>Démarrer un combat</h2>
    {#if !idScene}
      <p class="aide">Montre d'abord une scène à la table (section Séance).</p>
    {:else}
      <label
        >D'où vient-il
        <select value={rencontre?.id ?? ''} onchange={(e) => (rencontreChoisie = e.currentTarget.value)}>
          {#each rencontresIci as r (r.id)}<option value={r.id}>{r.nom}</option>{/each}
          <option value="">Combat libre (les jetons posés)</option>
        </select>
      </label>
      <label>Nom <input maxlength="80" value={nomSaisi ?? rencontre?.nom ?? 'Combat'} oninput={(e) => (nomSaisi = e.currentTarget.value)} /></label>
      <table>
        <thead><tr><th>Combattant</th><th>Init.</th><th>PV</th><th>DEF</th></tr></thead>
        <tbody>
          {#each brouillon as c (c.id)}
            <tr>
              <td>{c.nom}</td>
              <td>{c.modInit >= 0 ? '+' : '−'}{Math.abs(c.modInit)}</td>
              <td>
                {#if c.genre === 'pj'}
                  <span class="aide">sa fiche</span>
                {:else}
                  <input
                    type="number"
                    min="1"
                    max="9999"
                    aria-label="PV de {c.nom}"
                    value={c.pvMax ?? ''}
                    oninput={(e) => (pvSaisis = { ...pvSaisis, [c.id]: Number(e.currentTarget.value) || 0 })}
                  />
                {/if}
              </td>
              <td>
                {#if c.genre === 'pj'}
                  <span class="aide">sa CA</span>
                {:else}
                  <input
                    type="number"
                    min="-10"
                    max="99"
                    aria-label="DEF de {c.nom}"
                    value={c.def ?? ''}
                    oninput={(e) => {
                      const v = e.currentTarget.value;
                      const { [c.id]: _retire, ...reste } = defSaisies;
                      defSaisies = v === '' ? reste : { ...reste, [c.id]: Number(v) };
                    }}
                  />
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
      {#if manque}<p class="aide">{manque}</p>{/if}
      <button disabled={occupe || !!manque} onclick={demarrer}>Démarrer le combat</button>
      <p class="aide">Les monstres lancent leur initiative ; chaque joueur lance la sienne.</p>
    {/if}
    {#if message}<p class="erreur" role="alert">{message}</p>{/if}
  </section>
{/if}

<style>
  .colonne {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .tete,
  .demarrer {
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  h2 {
    font-size: 18px;
  }
  p {
    margin: 0;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 14px;
  }
  table {
    border-collapse: collapse;
    font-size: 14px;
  }
  th,
  td {
    text-align: left;
    padding: 4px 6px;
    border-bottom: 1px solid var(--couleur-bordure-douce);
  }
  td input {
    width: 64px;
  }
  .case {
    flex-direction: row;
    align-items: center;
    gap: 8px;
  }
  form {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 6px;
  }
</style>
