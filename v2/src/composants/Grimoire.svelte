<script lang="ts">
  import { coutAvecElement, grimoireDeLaFiche, maitriseDuVerbe, maitriseElement, type VerbeGrimoire } from '../lib/fiche/grimoire';
  import { sortsLancables } from '../lib/fiche/sorts-hors-combat';
  import { texteElement } from '../lib/fiche/texte-sort';
  import type { FicheV2 } from '../lib/schemas/fiche';
  import type { Element, Palier } from '../lib/schemas/effets';
  import DemandeSort from './DemandeSort.svelte';
  import MesSorts from './MesSorts.svelte';

  /*
   * La page de magie (lot G1, décisions de Thomas du 22/10/2026), d'après
   * la maquette 2.0 validée (« écran Joueur · grimoire ») :
   *   - onglets : école, écoles par grimoire, sorts mineurs, éléments (10a) ;
   *   - la voie de l'école en colonne de nœuds R1 à R5 ; au centre, le verbe
   *     choisi et ses paliers ; à gauche l'effet en combat (généré, 3a), à
   *     droite l'usage hors combat (7 : chaque palier ouvre des possibilités,
   *     le joueur et le MJ apprécient le reste) ;
   *   - coût réel détaillé, DD, aperçu avec un élément et la surcharge.
   * Lancer en combat viendra avec L6 (4a).
   *
   * Usage hors combat (lot G2a) : avec `lancer` (le joueur, sur son propre
   * personnage), chaque sort qui a un usage hors combat se demande au MJ
   * (DemandeSort) et les demandes se suivent en tête (MesSorts). Le MJ, qui
   * ouvre le grimoire depuis la fiche, le lit sans rien lancer.
   */

  let { fiche, lancer }: { fiche: FicheV2 & { id?: string }; lancer?: { seance: string | undefined; enScene?: boolean } } = $props();
  const lanceur = $derived(lancer && fiche.id ? { fiche: fiche as FicheV2 & { id: string }, seance: lancer.seance } : null);
  const lancables = $derived(lanceur ? sortsLancables(lanceur.fiche) : []);
  const lancable = (id: string) => lancables.find((s) => s.id === id) ?? null;

  const g = $derived(grimoireDeLaFiche(fiche));
  const ONGLETS = $derived(
    g
      ? [
          { id: 'ecole', nom: 'École', ok: g.verbes.length > 0 },
          { id: 'grimoire', nom: 'Écoles par grimoire', ok: g.parGrimoire.length > 0 },
          { id: 'mineurs', nom: 'Sorts mineurs', ok: g.mineurs.length > 0 },
          { id: 'elements', nom: 'Éléments', ok: g.elements.length > 0 },
        ].filter((o) => o.ok)
      : [],
  );
  let onglet = $state<string | null>(null);
  const ongletActif = $derived(onglet && ONGLETS.some((o) => o.id === onglet) ? onglet : (ONGLETS[0]?.id ?? null));

  let voieChoisie = $state<string | null>(null);
  const voie = $derived(g?.voies.find((v) => v.id === voieChoisie) ?? g?.voies[0] ?? null);
  let verbeChoisi = $state<string | null>(null);
  const verbesDeLaVoie = $derived(g && voie ? g.verbes.filter((v) => voie.noeuds.some((n) => n.verbe === v.id)) : []);
  const verbe = $derived<VerbeGrimoire | null>(verbesDeLaVoie.find((v) => v.id === verbeChoisi) ?? verbesDeLaVoie.find((v) => v.appris) ?? verbesDeLaVoie[0] ?? null);
  let palierChoisi = $state<Palier | null>(null);
  const palier = $derived(verbe ? (verbe.paliers.find((p) => p.palier === palierChoisi) ?? verbe.paliers.find((p) => p.palier === verbe.palierAtteint)!) : null);

  // Aperçu : un élément et la surcharge changent le coût affiché (colonne combat).
  let element = $state<Element | ''>('');
  let surcharge = $state(false);
  const apercu = $derived.by(() => {
    if (!verbe || !verbe.appris) return null;
    const ecole = maitriseDuVerbe(fiche, verbe.id);
    const el = element && verbe.element ? maitriseElement(fiche, element) : null;
    const c = coutAvecElement(verbe.id, verbe.palierAtteint, ecole, el, surcharge && !!verbe.surcharge);
    return c ? { ...c, element: element && verbe.element ? texteElement(element) : null, risque: el === 'nonMaitrise' ? 50 : el === 'initie' ? 20 : 0 } : null;
  });

  const NOMS_TERMES = { base: 'base du rang', palier: 'palier', element: 'élément', combinaison: 'combinaison', surcharge: 'surcharge', ecole: 'maîtrise d’école', plancher: 'plancher' } as const;
  const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');
  const LIMITES: Record<string, string> = { '1x/round': '1 fois par round', '1x/combat': '1 fois par combat', '1x/scene': '1 fois par scène', '1x/scenario': '1 fois par scénario' };
  function choisir(id: string | null) {
    if (!id) return;
    verbeChoisi = id;
    palierChoisi = null;
    surcharge = false;
  }
</script>

{#if g}
  <section class="grimoire" aria-label="Grimoire">
    <header>
      <h2>Grimoire · {fiche.nom}</h2>
      {#if g.reservePP}<span class="reserve">Réserve : {fiche.ppActuel ?? g.reservePP} / {g.reservePP} PP</span>{/if}
    </header>
    {#if lanceur}<MesSorts perso={lanceur.fiche.id} seance={lanceur.seance} />{/if}
    {#if lancer?.enScene}<p class="note-scene" role="note">Une scène est en cours : pour appuyer ton jet, joins le sort à ton action dans la carte de scène. Demandé d'ici, il reste hors scène.</p>{/if}
    <div class="onglets" role="tablist" aria-label="Grimoire">
      {#each ONGLETS as o (o.id)}
        <button role="tab" aria-selected={ongletActif === o.id} onclick={() => (onglet = o.id)}>{o.nom}</button>
      {/each}
    </div>

    {#if ongletActif === 'ecole' && voie}
      {#if g.voies.length > 1}
        <div class="voies" role="group" aria-label="Voies d'école">
          {#each g.voies as v (v.id)}
            <button class="petit" aria-pressed={voie.id === v.id} onclick={() => ((voieChoisie = v.id), (verbeChoisi = null), (palierChoisi = null))}>{v.ecole}</button>
          {/each}
        </div>
      {/if}
      <div class="page">
        <nav class="colonne" aria-label={voie.nom}>
          <h3>{voie.nom}</h3>
          <ol>
            {#each voie.noeuds as n (n.rang)}
              {@const v = n.verbe ? g.verbes.find((x) => x.id === n.verbe) : null}
              <li class:pris={n.pris}>
                <span class="rang">R{n.rang}</span>
                {#if v}
                  <button class="noeud" class:choisi={verbe?.id === v.id} aria-pressed={verbe?.id === v.id} onclick={() => choisir(v.id)}>{v.nom}{v.appris ? ` · ${v.palierAtteint}` : ''}</button>
                {:else}
                  <span class="capacite">{n.nom}</span>
                {/if}
              </li>
            {/each}
          </ol>
          <p class="aide">Rang {voie.rang} / 5</p>
        </nav>

        {#if verbe && palier}
          <div class="combat" aria-label="En combat">
            <h4>En combat · palier {palier.palier}</h4>
            <ul>
              {#each palier.combat as l, i (i)}<li>{l}</li>{/each}
            </ul>
            {#if verbe.dd !== null}<p class="aide">DD {verbe.dd}</p>{/if}
            {#if verbe.limite}<p class="aide">{LIMITES[verbe.limite] ?? verbe.limite}</p>{/if}
            <p class="aide">Se lance au combat (module de combat, à venir).</p>
          </div>

          <div class="centre" aria-label="Verbe">
            <h3>{verbe.nom}</h3>
            <p class="aide">{verbe.ecole} · rang {verbe.rang} · {verbe.maitrise}{verbe.appris ? '' : ' · pas encore appris'}</p>
            <p>{verbe.description}</p>
            <div class="paliers" role="tablist" aria-label="Paliers">
              {#each verbe.paliers as p (p.palier)}
                <button role="tab" aria-selected={palier.palier === p.palier} class:atteint={p.atteint} onclick={() => (palierChoisi = p.palier)}>{p.palier}<small>{p.atteint ? 'atteint' : `au rang ${p.rang}`}</small></button>
              {/each}
            </div>
            {#if verbe.appris && verbe.cout}
              <div class="cout" data-testid="cout">
                <strong>{apercu?.pp ?? verbe.cout.pp} PP</strong> au palier {verbe.palierAtteint}{surcharge && verbe.surcharge ? `, surchargé en ${verbe.surcharge.palier}` : ''}
                <ul>
                  {#each apercu?.detail ?? verbe.cout.detail as t, i (i)}<li>{NOMS_TERMES[t.terme]} {signe(t.valeur)}</li>{/each}
                </ul>
              </div>
              {#if verbe.element && g.elements.length}
                <label
                  >Élément
                  <select bind:value={element}>
                    <option value="">Sans élément</option>
                    {#each g.elements as e (e.id)}<option value={e.id}>{e.nom} ({e.maitrise})</option>{/each}
                  </select>
                </label>
                {#if apercu?.element}<p class="aide">{apercu.element.nom} : {apercu.element.sort}{apercu.risque ? ` Dérapage ${apercu.risque} % : ${apercu.element.derapage}` : ''}</p>{/if}
              {/if}
              {#if verbe.surcharge}
                <label class="case"><input type="checkbox" bind:checked={surcharge} /> Surcharge : palier {verbe.surcharge.palier}</label>
              {/if}
            {/if}
          </div>

          <div class="hors-combat" aria-label="Hors combat">
            <h4>Hors combat</h4>
            {#if verbe.paliers.some((p) => p.horsCombat)}
              <ol>
                {#each verbe.paliers.filter((p) => p.horsCombat) as p (p.palier)}
                  <li class:atteint={p.atteint && verbe.appris}><strong>{p.palier}</strong> {p.horsCombat}{p.atteint && verbe.appris ? '' : ` (au rang ${p.rang})`}</li>
                {/each}
              </ol>
              {#if verbe.appris && verbe.coutHorsCombat !== null}<p class="aide">{verbe.coutHorsCombat} PP hors combat, au palier {verbe.palierAtteint}.</p>{/if}
              <p class="aide">Chaque palier ouvre ces possibilités ; le reste s'apprécie entre le joueur et le MJ.</p>
              {#if lanceur && lancable(verbe.id)}
                {#key verbe.id}<DemandeSort fiche={lanceur.fiche} sort={lancable(verbe.id)!} seance={lanceur.seance} />{/key}
              {/if}
            {:else}
              <p class="aide">Pas d'usage hors combat.</p>
            {/if}
          </div>
        {/if}
      </div>
    {:else if ongletActif === 'grimoire'}
      <div class="cartes">
        {#each g.parGrimoire as v (v.id)}
          <article class="carte-sort" aria-label={v.nom}>
            <h3>{v.nom}</h3>
            <p class="aide">{v.ecole} · rang {v.rang} · {v.maitrise} · palier I seulement</p>
            {#if v.echec}<p class="risque">Échec sur 1 à {v.echec} au d20 ({v.echec * 5} %) : les PP sont dépensés.</p>{/if}
            {#if v.cout}<p><strong>{v.cout.pp} PP</strong>{v.coutHorsCombat !== null ? ` · ${v.coutHorsCombat} PP hors combat` : ''}</p>{/if}
            <ul>
              {#each v.paliers[0]!.combat as l, i (i)}<li>{l}</li>{/each}
            </ul>
            {#if v.paliers[0]!.horsCombat}<p class="hc">Hors combat : {v.paliers[0]!.horsCombat}</p>{/if}
            {#if lanceur && lancable(v.id)}<DemandeSort fiche={lanceur.fiche} sort={lancable(v.id)!} seance={lanceur.seance} />{/if}
          </article>
        {/each}
      </div>
    {:else if ongletActif === 'mineurs'}
      <div class="cartes">
        {#each g.mineurs as m (m.id)}
          <article class="carte-sort" aria-label={m.nom}>
            <h3>{m.nom} <small>palier {m.palier} · 0 PP</small></h3>
            <p class="aide">{m.description}</p>
            <ul>
              {#each m.combat as l, i (i)}<li>{l}</li>{/each}
            </ul>
            {#if m.horsCombat}<p class="hc">Hors combat : {m.horsCombat}</p>{/if}
            {#if lanceur && lancable(m.id)}<DemandeSort fiche={lanceur.fiche} sort={lancable(m.id)!} seance={lanceur.seance} />{/if}
          </article>
        {/each}
      </div>
    {:else if ongletActif === 'elements'}
      <div class="cartes">
        {#each g.elements as e (e.id)}
          <article class="carte-sort" aria-label={e.nom}>
            <h3>{e.nom} <small>{e.maitrise}</small></h3>
            <p class="aide">{e.role}</p>
            <p>Sur un sort : {e.sort}</p>
            <p class="risque">Dérapage{e.risque ? ` (${e.risque} %)` : ' (jamais à cette maîtrise)'} : {e.derapage}</p>
          </article>
        {/each}
      </div>
      {#if g.combinaisons.length}
        <h3>Combinaisons ouvertes</h3>
        <ul class="combis">
          {#each g.combinaisons as c (c.nom)}<li><strong>{c.nom}</strong> ({c.elements}) : {c.texte}</li>{/each}
        </ul>
      {/if}
    {/if}
  </section>
{:else}
  <p class="aide">Ce personnage n'a pas de sorts.</p>
{/if}

<style>
  .note-scene {
    margin: 0 0 8px;
    font-size: 14px;
    color: var(--couleur-or-texte);
    border-left: 3px solid var(--couleur-or);
    padding-left: 8px;
  }
  .grimoire {
    display: flex;
    flex-direction: column;
    gap: 12px;
    container-type: inline-size;
  }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 12px;
  }
  h2 {
    font-size: 22px;
    margin: 0;
  }
  h3,
  h4,
  p {
    margin: 0;
  }
  .reserve {
    color: var(--couleur-accent);
    font-weight: 600;
  }
  .onglets,
  .voies,
  .paliers {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .onglets {
    border-bottom: 2px solid var(--couleur-bordure);
  }
  .onglets button {
    background: transparent;
    color: var(--couleur-encre-douce);
    border-radius: var(--rayon) var(--rayon) 0 0;
    border-bottom: 2px solid transparent;
    margin-bottom: -2px;
  }
  .onglets button[aria-selected='true'] {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border-bottom-color: var(--couleur-accent);
  }
  .voies button[aria-pressed='false'] {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
  }
  .page {
    display: grid;
    grid-template-columns: 1fr;
    gap: 12px;
  }
  @container (min-width: 900px) {
    .page {
      grid-template-columns: 190px minmax(0, 1fr) minmax(0, 1.1fr) minmax(0, 1fr);
      align-items: start;
    }
  }
  .colonne,
  .combat,
  .centre,
  .hors-combat,
  .carte-sort {
    background: var(--couleur-surface);
    border: 1px solid var(--couleur-bordure);
    border-radius: var(--rayon);
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .centre {
    border-color: var(--couleur-accent-clair);
  }
  .colonne ol,
  .hors-combat ol {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .colonne li {
    display: flex;
    gap: 6px;
    align-items: center;
    opacity: 0.6;
  }
  .colonne li.pris {
    opacity: 1;
  }
  .rang {
    font-size: 12px;
    color: var(--couleur-encre-douce);
    width: 22px;
  }
  .noeud {
    min-height: 30px;
    padding: 2px 10px;
    border-radius: 999px;
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-accent-clair);
    font-size: 14px;
  }
  .noeud.choisi {
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .capacite {
    font-size: 13px;
    font-style: italic;
  }
  .paliers button {
    display: flex;
    flex-direction: column;
    align-items: center;
    min-width: 64px;
    background: var(--couleur-surface-claire);
    color: var(--couleur-encre-douce);
    border: 1px dashed var(--couleur-bordure);
  }
  .paliers button.atteint {
    border-style: solid;
    color: var(--couleur-accent);
  }
  .paliers button[aria-selected='true'] {
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .paliers small {
    font-size: 11px;
    font-weight: 400;
    color: inherit;
  }
  .cout ul,
  .combat ul,
  .carte-sort ul {
    margin: 0;
    padding-left: 18px;
    font-size: 14px;
  }
  .hors-combat li {
    opacity: 0.6;
    font-size: 14px;
  }
  .hors-combat li.atteint {
    opacity: 1;
  }
  .case {
    display: inline-flex;
    gap: 6px;
    align-items: center;
  }
  label:not(.case) {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .cartes {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
    gap: 12px;
  }
  .risque {
    font-size: 13px;
    color: var(--couleur-danger);
  }
  .hc {
    font-size: 14px;
    color: var(--couleur-or-texte);
  }
  small {
    font-size: 12px;
    color: var(--couleur-encre-douce);
    font-weight: 400;
  }
  .combis {
    margin: 0;
    padding-left: 18px;
  }
</style>
