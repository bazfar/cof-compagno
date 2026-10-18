<script lang="ts">
  import { onDestroy } from 'svelte';
  import { importerLore } from '../lib/actions/lore';
  import { messageErreurPerso } from '../lib/actions/persos';
  import { suivreLoreMj } from '../lib/magasins/lore.svelte';
  import { schemaExportLore, type ExportLore } from '../lib/schemas/lore';
  import { session } from '../lib/session.svelte';

  /*
   * MJ : import du lore de la v1 (lot L2.7a, décision 1a du 18/10/2026).
   * Le fichier vient de `npm run lore:exporter` (outils/exporter-lore-v1.ts) :
   * le lore v1 n'est jamais livré dans le code de l'app, où les joueurs
   * pourraient le lire. Une fiche déjà présente est gardée telle quelle :
   * réimporter ne défait aucune modification faite dans l'app.
   */

  const lore = suivreLoreMj(session.table);
  onDestroy(lore.arreter);

  let lu = $state<ExportLore | null>(null);
  let erreur = $state('');
  let message = $state('');
  let enCours = $state(false);

  const presentes = $derived({
    ids: new Set(lore.etat.elements.map((f) => f.id)),
    sources: new Set(lore.etat.elements.map((f) => f.source).filter((s): s is string => !!s)),
  });
  const nouvelles = $derived(lu ? lu.fiches.filter(({ id, fiche }) => !presentes.ids.has(id) && !(fiche.source && presentes.sources.has(fiche.source))) : []);
  const compte = (v: string) => nouvelles.filter((f) => f.fiche.visibilite === v).length;
  const scelles = $derived(nouvelles.reduce((n, f) => n + f.fiche.passages.filter((p) => p.scelle).length, 0));
  const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? 's' : ''}`;
  const resume = $derived.by(() => {
    if (!lu) return '';
    const gardees = lu.fiches.length - nouvelles.length;
    return (
      `${pluriel(nouvelles.length, 'fiche')} à importer : ${compte('tous')} partagée${compte('tous') > 1 ? 's' : ''} avec tous, ` +
      `${compte('mj')} pour toi seul, ${pluriel(scelles, 'passage')} scellé${scelles > 1 ? 's' : ''}` +
      (gardees ? ` ; ${gardees} déjà présente${gardees > 1 ? 's' : ''}, gardée${gardees > 1 ? 's' : ''}` : '') +
      '.'
    );
  });

  async function choisir(ev: Event) {
    const fichier = (ev.currentTarget as HTMLInputElement).files?.[0];
    lu = null;
    erreur = '';
    message = '';
    if (!fichier) return;
    try {
      const resultat = schemaExportLore.safeParse(JSON.parse(await fichier.text()));
      if (resultat.success) lu = resultat.data;
      else erreur = `${fichier.name} n'est pas un export du lore v1 (attendu : lore-v1.json, produit par « npm run lore:exporter »).`;
    } catch (e) {
      erreur = `${fichier.name} — ${e instanceof Error ? e.message : String(e)}`;
    }
  }

  async function importer() {
    if (!lu) return;
    enCours = true;
    message = '';
    try {
      const { importees, gardees } = await importerLore(lu, presentes);
      message = `${importees} fiche${importees > 1 ? 's' : ''} importée${importees > 1 ? 's' : ''}${gardees ? `, ${gardees} déjà présente${gardees > 1 ? 's' : ''} gardée${gardees > 1 ? 's' : ''} telle${gardees > 1 ? 's' : ''} quelle${gardees > 1 ? 's' : ''}` : ''}.`;
      lu = null;
    } catch (e) {
      erreur = messageErreurPerso(e);
    } finally {
      enCours = false;
    }
  }
</script>

<section class="carte import" aria-label="Lore de la v1">
  <h2>Lore de la v1</h2>
  <p class="aide">
    Produis le fichier avec <code>npm run lore:exporter</code> (dans <code>v2/</code>), puis dépose <code>lore-v1.json</code> ici. Il contient tes secrets :
    ne le partage pas. {#if lore.etat.pret}La table compte {lore.etat.elements.length} fiche{lore.etat.elements.length > 1 ? 's' : ''} de lore.{/if}
  </p>
  <label class="bouton-fichier">Choisir lore-v1.json <input type="file" accept=".json,application/json" onchange={choisir} /></label>
  {#if erreur}<p class="erreur" role="alert">{erreur}</p>{/if}
  {#if lu}
    {#if nouvelles.length === 0}
      <p role="status">Toutes les fiches de ce fichier sont déjà à la table. Rien à importer.</p>
    {:else}
      <p role="status" data-testid="resume-import">{resume}</p>
      <button disabled={enCours} onclick={importer}>{enCours ? 'Import en cours…' : `Importer ${nouvelles.length} fiche${nouvelles.length > 1 ? 's' : ''}`}</button>
    {/if}
  {/if}
  {#if message}<p class="succes" role="status">{message}</p>{/if}
</section>

<style>
  .import {
    display: flex;
    flex-direction: column;
    gap: 10px;
    align-items: flex-start;
  }
  h2 {
    font-size: 20px;
  }
  .aide {
    font-size: 14px;
    color: var(--couleur-encre-douce);
    margin: 0;
  }
  .bouton-fichier {
    font-weight: 600;
    color: var(--couleur-accent);
    cursor: pointer;
    text-decoration: underline;
  }
  .bouton-fichier input {
    display: none;
  }
  .erreur {
    color: var(--couleur-danger);
    margin: 0;
  }
  .succes {
    color: var(--couleur-succes);
    margin: 0;
  }
  p {
    margin: 0;
  }
</style>
