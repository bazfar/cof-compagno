<script lang="ts">
  import { messageErreurPerso } from '../lib/actions/persos';
  import { convertirPerso, refaireVoiesPerso } from '../lib/actions/refonte';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import * as RF from '../lib/fiche/refonte';
  import { nomNoeud, vecuDesCapacitesV1 } from '../lib/fiche/vecu';
  import { RefusCreation } from '../lib/regles/creation';
  import { voieParId } from '../lib/regles/donnees';
  import { octroisVierges, type Fiche, type RefonteFiche } from '../lib/schemas/fiche';
  import ChoixRefonte from './ChoixRefonte.svelte';

  /*
   * « Passer à la refonte » et « Refaire mes voies » (lot L4.11b, décisions
   * 4a, 5a, 8a, 9a, 12a). Le joueur refait ses voies au même niveau, avec
   * l'étape Voies de la refonte (ChoixRefonte) ; ses anciennes voies v1 sont
   * rappelées à côté. Il valide seul ; la conversion est définitive, sauf si
   * le MJ la rouvre (`octrois.reconversion`), et l'écran sert alors à
   * « Refaire mes voies », jauges gardées.
   *
   * Aucune règle ici : gestes et vérifications dans lib/fiche/refonte.ts,
   * écriture en transaction dans lib/actions/refonte.ts.
   */

  let { fiche, surFin }: { fiche: AvecId<Fiche>; surFin: (message: string) => void } = $props();

  // svelte-ignore state_referenced_locally -- l'écran part de la fiche à l'ouverture
  const v1 = fiche.schemaVersion === 1 ? fiche : null;
  // svelte-ignore state_referenced_locally
  const classe = fiche.schemaVersion === 1 ? RF.classeRefonteDe(fiche.classe) : (RF.classeDeLaRefonte(fiche.refonte.classe) ?? null);
  // svelte-ignore state_referenced_locally
  const octrois = fiche.schemaVersion === 2 ? fiche.octrois : { ...octroisVierges(), chaos: RF.avaitLeChaos(fiche) };
  // svelte-ignore state_referenced_locally
  let r = $state<RefonteFiche | null>(classe ? (fiche.schemaVersion === 2 ? structuredClone($state.snapshot(fiche.refonte) as RefonteFiche) : RF.refonteVierge(classe, fiche.niveau)) : null);
  let refus = $state('');
  let enCours = $state(false);

  const ctx = $derived(classe ? RF.contexteDe(fiche, classe, octrois) : null);
  const erreurs = $derived(classe && r && ctx ? RF.erreursRefonte(classe, r, ctx) : []);
  const avertissements = $derived(r && ctx ? RF.avertissementsRefonte(r, ctx) : []);
  const anciennes = $derived(
    v1
      ? [...new Set(v1.capacites.map((c) => c.id.split('.').slice(0, -1).join('.')))].map((voie) => {
          const rangs = v1.capacites.filter((c) => c.id.startsWith(`${voie}.`)).length;
          return `${voieParId.get(voie)?.nom ?? voie} (rang ${rangs})`;
        })
      : [],
  );

  /** Vécu (L4.18, 5a) : les nœuds que les capacités v1 hors combat appellent. */
  const vecuV1 = $derived(v1 ? vecuDesCapacitesV1(v1.capacites).map(nomNoeud) : []);

  function geste(g: RF.GesteRefonte) {
    if (!classe || !r || !ctx) return;
    try {
      r = RF.appliquerGeste(classe, $state.snapshot(r) as RefonteFiche, ctx, g);
      refus = '';
    } catch (e) {
      if (e instanceof RefusCreation) refus = e.message;
      else throw e;
    }
  }

  async function valider() {
    if (!r) return;
    if (v1 && !confirm(`Passer ${fiche.nom} à la refonte ? Ses voies, son grimoire et ses points de Cercle v1 seront remplacés ; seul le MJ peut rouvrir la conversion.`)) return;
    refus = '';
    enCours = true;
    try {
      const choix = $state.snapshot(r) as RefonteFiche;
      if (v1) await convertirPerso(fiche.id, choix);
      else await refaireVoiesPerso(fiche.id, choix);
      surFin(v1 ? `${fiche.nom} est passé(e) à la refonte.` : `Les voies de ${fiche.nom} sont refaites.`);
    } catch (e) {
      refus = e instanceof RefusCreation ? e.message : messageErreurPerso(e);
    } finally {
      enCours = false;
    }
  }
</script>

<section class="conversion" aria-label={v1 ? 'Passer à la refonte' : 'Refaire mes voies'}>
  <div class="tete">
    <h3>{v1 ? 'Passer à la refonte' : 'Refaire mes voies'}{classe ? ` — ${classe.nom}` : ''}</h3>
    <span class="espace"></span>
    <button class="discret" onclick={() => surFin('')}>Annuler</button>
  </div>
  {#if refus}<p class="refus" role="alert">{refus}</p>{/if}

  {#if !classe || !r || !ctx}
    <p>Cette classe n'est pas encore passée à la refonte.</p>
  {:else}
    {#if v1}
      <p class="aide">
        Au même niveau ({fiche.niveau}), tu refais tes voies avec les règles de la refonte. Tu gardes caractéristiques, PV, équipement, bourse, mutations,
        notes, crans et Vécu, ainsi que ta voie raciale et tes dons. Le grimoire et les points de Cercle v1 disparaissent ; Endurance, Inspiration et Sacré
        partent pleins, ta corruption majeure devient la Corruption d'Âme. Le MJ t'accordera à part les éléments et sorts appris en jeu.
      </p>
      {#if anciennes.length}<p class="anciennes"><strong>Tes voies en v1 :</strong> {anciennes.join(' ; ')}</p>{/if}
      {#if octrois.chaos}<p class="aide">Tu avais la Voie du chaos en v1 : elle t'est ouverte.</p>{/if}
      {#if vecuV1.length}<p class="aide">Vécu (L4.18) : tes capacités hors combat de la v1 deviennent {vecuV1.join(', ')} ; le MJ te les accordera, un palier chacune.</p>{/if}
    {:else}
      <p class="aide">Le MJ a rouvert ta conversion : refais tes voies une fois, tes jauges sont gardées.</p>
    {/if}
    <ChoixRefonte {classe} {r} {ctx} surGeste={geste} />
    {#if erreurs.length}
      <ul class="erreurs" aria-label="À compléter">{#each erreurs as e (e)}<li>{e}</li>{/each}</ul>
    {/if}
    {#if avertissements.length}
      <ul class="avertissements" aria-label="À noter">{#each avertissements as a (a)}<li>{a}</li>{/each}</ul>
    {/if}
    <button onclick={valider} disabled={erreurs.length > 0 || enCours}>{v1 ? 'Passer à la refonte' : 'Valider mes voies'}</button>
  {/if}
</section>

<style>
  .conversion {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 12px;
    border: 1px solid var(--couleur-accent-clair);
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
  }
  .tete {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }
  .espace {
    flex: 1;
  }
  h3 {
    font-size: 20px;
  }
  p {
    margin: 0;
  }
  .aide {
    font-size: 14px;
    color: var(--couleur-encre-douce);
  }
  .anciennes {
    padding: 8px 12px;
    border-radius: var(--rayon);
    border: 1px dashed var(--couleur-or);
  }
  ul {
    margin: 0;
    padding-left: 18px;
  }
  .discret {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .refus,
  .erreurs {
    color: var(--couleur-danger);
  }
  .avertissements {
    color: var(--couleur-or-texte);
  }
</style>
