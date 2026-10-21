<script lang="ts">
  import { GROUPES, trierActions, type ActionAffichee, type MagieAffichee } from '../lib/fiche/actions-fiche';
  import type { ClasseRefonte } from '../lib/schemas/classes';

  /*
   * Onglet Actions d'une fiche de la refonte (lot L4.12, décisions 1b à 6a,
   * 13a, 15b du 21/10/2026). Dessine ce que calcule lib/fiche/actions-fiche.ts,
   * sans règle : bloc Magie, bascule combat / hors combat, tri par type de
   * geste ou par voie, et les jets (attaque, dégâts) que le parent lance au
   * journal commun.
   */

  let {
    actions,
    magie,
    passifs,
    classe,
    modifiable,
    surLancer,
  }: {
    actions: ActionAffichee[];
    magie: MagieAffichee | null;
    passifs: string[];
    classe: ClasseRefonte | null;
    modifiable: boolean;
    surLancer: (libelle: string, formule: string) => void;
  } = $props();

  let usage = $state<'combat' | 'hors'>('combat');
  let ordre = $state<'type' | 'voie'>('type');

  const montrees = $derived(actions.filter((a) => usage === 'combat' || a.horsCombat));
  const triees = $derived(classe ? trierActions(montrees, ordre, classe) : montrees);
  /** Titres de section : le groupe (tri par type) ou la voie (tri par voie). */
  const titre = (a: ActionAffichee) =>
    ordre === 'type'
      ? (GROUPES.find((g) => g.id === a.groupe)?.nom ?? a.groupe)
      : (a.nomVoie ?? (a.grimoire ? 'Appris par grimoire' : a.groupe === 'mineur' ? 'Sorts mineurs' : 'Classe et communes'));
  const sections = $derived(
    triees.reduce<{ titre: string; actions: ActionAffichee[] }[]>((l, a) => {
      const t = titre(a);
      if (l.at(-1)?.titre === t) l.at(-1)!.actions.push(a);
      else l.push({ titre: t, actions: [a] });
      return l;
    }, []),
  );
  const PALIERS = { I: 'palier I', II: 'palier II', III: 'palier III' } as const;
</script>

<div class="actions-refonte">
  {#if magie}
    <section class="magie" aria-label="Magie">
      <h3>Magie</h3>
      <ul class="puces">
        {#if magie.ecole}<li>École : <strong>{magie.ecole.nom}</strong> ({magie.ecole.maitrise})</li>{/if}
        {#if magie.secondeEcole}<li>Seconde école : <strong>{magie.secondeEcole.nom}</strong> ({magie.secondeEcole.maitrise})</li>{/if}
        {#each magie.elements as e (e.id)}<li>{e.nom} : <strong>{e.maitrise}</strong></li>{/each}
      </ul>
      {#if magie.combinaisons.length}
        <h4>Combinaisons de Maître</h4>
        <ul class="puces">
          {#each magie.combinaisons as c (c.nom)}<li><strong>{c.nom}</strong> <span class="aide">({c.elements})</span> — {c.texte}</li>{/each}
        </ul>
      {/if}
    </section>
  {/if}
  {#if passifs.length}<p class="aide" data-testid="passifs-comptes">Comptés dans la fiche : {passifs.join(' ; ')}.</p>{/if}

  <div class="barre-outils">
    <div class="usage" role="group" aria-label="Usage des actions">
      <button class="bascule" aria-pressed={usage === 'combat'} onclick={() => (usage = 'combat')}>En combat</button>
      <button class="bascule" aria-pressed={usage === 'hors'} onclick={() => (usage = 'hors')}>Hors combat</button>
    </div>
    <div class="usage" role="group" aria-label="Tri des actions">
      <button class="bascule" aria-pressed={ordre === 'type'} onclick={() => (ordre = 'type')}>Par type</button>
      <button class="bascule" aria-pressed={ordre === 'voie'} onclick={() => (ordre = 'voie')}>Par voie</button>
    </div>
  </div>

  {#if !sections.length}
    <p class="aide">{usage === 'hors' ? 'Aucune action hors combat pour l’instant.' : 'Aucune action pour l’instant.'}</p>
  {/if}
  {#each sections as s, i (`${s.titre}-${i}`)}
    <h3>{s.titre}</h3>
    <ul class="liste">
      {#each s.actions as a (a.id)}
        <li class="action" aria-label={a.nom}>
          <div class="ligne">
            <strong>{a.nom}</strong>
            {#if a.palier}<span class="badge">{PALIERS[a.palier]}</span>{/if}
            {#if a.grimoire}<span class="badge">grimoire · {a.grimoire}</span>{/if}
            {#if a.manuel}<span class="badge mj" title={a.manuel}>MJ</span>{/if}
            <span class="aide">{[a.ecole, a.typeAction, usage === 'hors' && a.coutHorsCombat ? `${a.coutHorsCombat} hors combat` : a.cout, a.limite].filter(Boolean).join(' · ')}</span>
          </div>
          <p class="effet">{usage === 'hors' && a.horsCombat ? a.horsCombat : a.description}</p>
          {#if a.condition}<p class="aide">Passif : {a.condition}</p>{/if}
          {#if a.variantes.length}<p class="aide">Variantes : {a.variantes.join(', ')}</p>{/if}
          {#if a.manuel}<p class="aide">Laissée au MJ : {a.manuel}</p>{/if}
          {#if usage === 'combat' && (a.attaque || a.degats || a.dd)}
            <div class="ligne">
              {#if a.dd}<span class="aide">{a.dd}</span>{/if}
              {#if a.attaque}
                {#if modifiable}<button class="jet" aria-label={`Lancer ${a.attaque.libelle}`} onclick={() => surLancer(a.attaque!.libelle, a.attaque!.formule)}>Attaque {a.attaque.formule}</button>{:else}<span class="aide">Attaque {a.attaque.formule}</span>{/if}
              {/if}
              {#if a.degats}
                {#if modifiable}<button class="jet" aria-label={`Lancer ${a.degats.libelle}`} onclick={() => surLancer(a.degats!.libelle, a.degats!.formule)}>Dégâts {a.degats.formule}</button>{:else}<span class="aide">Dégâts {a.degats.formule}</span>{/if}
              {/if}
            </div>
          {/if}
        </li>
      {/each}
    </ul>
  {/each}
</div>

<style>
  .actions-refonte {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }
  .magie {
    padding: 10px 14px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-accent-clair);
    background: var(--couleur-accent-pale);
  }
  h3 {
    font-size: 17px;
    margin: 6px 0 0;
  }
  h4 {
    font-size: 15px;
    margin: 8px 0 4px;
  }
  .puces {
    margin: 0;
    padding-left: 18px;
  }
  .barre-outils {
    display: flex;
    flex-wrap: wrap;
    gap: 8px 16px;
  }
  .usage {
    display: flex;
    gap: 6px;
  }
  .bascule {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .bascule[aria-pressed='true'] {
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .liste {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .action {
    padding: 8px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .ligne {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
  }
  p {
    margin: 0;
  }
  .effet {
    font-size: 14px;
    color: var(--couleur-encre-douce);
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-or);
    color: #fff;
  }
  .badge.mj {
    background: var(--couleur-danger);
  }
  .jet {
    min-height: 32px;
    padding: 0 10px;
  }
</style>
