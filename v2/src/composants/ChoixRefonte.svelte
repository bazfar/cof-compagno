<script lang="ts">
  import { pointsDeVoies } from '../lib/effets/profil';
  import * as R from '../lib/fiche/refonte';
  import type { ClasseRefonte } from '../lib/schemas/classes';
  import type { RefonteFiche } from '../lib/schemas/fiche';

  /*
   * Étape Voies de la refonte (lot L4.11b, décisions 10a, 11a, 12a) :
   * partagée par l'assistant de création, la montée de niveau et l'écran
   * « Passer à la refonte » / « Refaire mes voies ». L'écran n'applique
   * AUCUNE règle : chaque geste part à `surGeste`, que le parent passe aux
   * fonctions de lib/fiche (création, montée avec ses verrous, conversion),
   * qui rendent le choix suivant ou un refus expliqué. Erreurs et
   * avertissements sont affichés par le parent.
   *
   * `fige` (montée) : les choix déjà faits ; leurs boutons de retrait sont
   * masqués et leurs sélecteurs grisés. La Voie du chaos n'apparaît que si
   * le MJ l'a ouverte (12a).
   */

  let {
    classe,
    r,
    ctx,
    fige = null,
    surGeste,
  }: { classe: ClasseRefonte; r: RefonteFiche; ctx: R.ContexteRefonte; fige?: RefonteFiche | null; surGeste: (g: R.GesteRefonte) => void } = $props();

  const ouverts = $derived(R.choixOuverts(classe, r, ctx));
  const pts = $derived(pointsDeVoies({ niveau: ctx.niveau, rangs: r.rangs, rangOffert: r.rangOffert }));
  const polyvalence = $derived(R.polyvalence(ctx) && !r.rangOffert);
  const variantes = $derived(R.variantesAChoisir(classe, r, ctx));
  const choisir = <K extends R.ChampDeChoix>(champ: K, valeur: RefonteFiche[K]) => surGeste({ type: 'choix', champ, valeur } as R.GesteRefonte);
  const figeChamp = (champ: R.ChampDeChoix) => !!fige && fige[champ] !== null;
</script>

<div class="choix-refonte">
  <p class="compteur" aria-live="polite">Points de voie : <strong data-testid="points-refonte">{pts.restants}</strong> / {pts.total}</p>
  <p class="aide">Rangs 1-2 : 1 point ; rangs 3-5 : 2 points ; dans l'ordre.</p>
  {#if polyvalence}<p class="offert">Polyvalence : un rang gratuit à prendre dans une voie de ta classe (bouton « Offert »).</p>{/if}

  {#if ouverts.ecoles.length}
    <fieldset>
      <legend>École</legend>
      {#each ouverts.ecoles as e (e)}
        <button class="choix" class:actif={r.ecole === e} disabled={figeChamp('ecole')} onclick={() => choisir('ecole', e)}>{R.nomEcole(e)}</button>
      {/each}
    </fieldset>
  {/if}
  {#if ouverts.elementsDepart.length}
    <fieldset>
      <legend>Élément de départ</legend>
      {#each ouverts.elementsDepart as e (e)}
        <button class="choix" class:actif={r.elementDepart === e} disabled={figeChamp('elementDepart')} onclick={() => choisir('elementDepart', e)}>{R.nomElement(e)}</button>
      {/each}
    </fieldset>
  {/if}

  {#each ouverts.voies as idVoie (idVoie)}
    {@const voie = R.voieDeLaRefonte(idVoie)}
    {@const rang = r.rangs[idVoie] ?? 0}
    {@const rangFige = fige?.rangs[idVoie] ?? 0}
    <div class="voie">
      <h3>
        {voie?.nom ?? idVoie}
        {#if voie?.surAccordDuMJ}<span class="badge">chaos — ouverte par le MJ</span>{/if}
      </h3>
      <ol class="rangs">
        {#each voie?.rangs ?? [] as rv (rv.rang)}
          <li class:acquis={rv.rang <= rang}>
            <strong>{rv.rang}. {rv.nom}</strong>
            {#if r.rangOffert?.voie === idVoie && r.rangOffert.rang === rv.rang}<span class="badge">offert</span>{/if}
            <span class="effet">{rv.description}</span>
            {#if rv.rang === rang && rang > rangFige}
              <button class="petit discret" aria-label={`Retirer ${idVoie} rang ${rv.rang}`} onclick={() => surGeste({ type: 'retirer', voie: idVoie })}>Retirer</button>
            {:else if rv.rang === rang + 1}
              <button class="petit" aria-label={`Prendre ${idVoie} rang ${rv.rang}`} onclick={() => surGeste({ type: 'prendre', voie: idVoie })}>Prendre ({rv.rang >= 3 ? 2 : 1})</button>
              {#if polyvalence && !voie?.surAccordDuMJ}
                <button class="petit" aria-label={`Offrir ${idVoie} rang ${rv.rang}`} onclick={() => surGeste({ type: 'offrir', voie: idVoie })}>Offert</button>
              {/if}
            {/if}
          </li>
        {/each}
      </ol>
    </div>
  {/each}

  {#if ouverts.elementsSecond.length}
    <label>
      Second élément
      <select aria-label="Second élément" value={r.secondElement ?? ''} disabled={figeChamp('secondElement')} onchange={(ev) => choisir('secondElement', (ev.currentTarget.value || null) as RefonteFiche['secondElement'])}>
        <option value="">—</option>
        {#each ouverts.elementsSecond as e (e)}<option value={e}>{R.nomElement(e)}</option>{/each}
      </select>
    </label>
  {/if}
  {#if ouverts.elementsMaitre.length}
    <label>
      Élément Maître
      <select aria-label="Élément Maître" value={r.elementMaitre ?? ''} disabled={figeChamp('elementMaitre')} onchange={(ev) => choisir('elementMaitre', (ev.currentTarget.value || null) as RefonteFiche['elementMaitre'])}>
        <option value="">—</option>
        {#each ouverts.elementsMaitre as e (e)}<option value={e}>{R.nomElement(e)}</option>{/each}
      </select>
    </label>
  {/if}
  {#if ouverts.caracEnPlus}
    <label>
      Caractéristique (+{ouverts.caracEnPlus.valeur})
      <select aria-label="Caractéristique en plus" value={r.caracEnPlus ?? ''} disabled={figeChamp('caracEnPlus')} onchange={(ev) => choisir('caracEnPlus', (ev.currentTarget.value || null) as RefonteFiche['caracEnPlus'])}>
        <option value="">—</option>
        {#each ouverts.caracEnPlus.parmi as c (c)}<option value={c}>{c}</option>{/each}
      </select>
    </label>
  {/if}

  {#if ouverts.mineurs.length}
    <fieldset class="mineurs">
      <legend>Sorts mineurs ({r.mineurs.length} / {ouverts.mineursMax})</legend>
      {#each ouverts.mineurs as id (id)}
        <label class="case">
          <input type="checkbox" aria-label={R.nomAction(id)} checked={r.mineurs.includes(id)} disabled={!!fige?.mineurs.includes(id)} onchange={() => surGeste({ type: 'mineur', id })} />
          {R.nomAction(id)}
        </label>
      {/each}
    </fieldset>
  {/if}
  {#if ouverts.repertoire}
    <label>
      Répertoire : le sort mineur qui passe au palier II
      <select aria-label="Répertoire" value={r.mineurPalierII ?? ''} disabled={figeChamp('mineurPalierII')} onchange={(ev) => choisir('mineurPalierII', ev.currentTarget.value || null)}>
        <option value="">—</option>
        {#each r.mineurs as id (id)}<option value={id}>{R.nomAction(id)}</option>{/each}
      </select>
    </label>
  {/if}

  {#each variantes as a (a.id)}
    <label>
      {a.nom}
      <select aria-label={`Variante de ${a.nom}`} value={r.variantes[a.id] ?? ''} disabled={!!fige && a.id in fige.variantes} onchange={(ev) => surGeste({ type: 'variante', action: a.id, variante: ev.currentTarget.value || null })}>
        <option value="">Effet de base</option>
        {#each a.variantes.filter((v) => v.palier === 'I') as v (v.id)}<option value={v.id}>{v.nom}</option>{/each}
      </select>
    </label>
  {/each}
</div>

<style>
  .choix-refonte {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .compteur,
  .aide,
  .offert {
    margin: 0;
  }
  .aide {
    font-size: 13px;
    color: var(--couleur-encre-douce);
  }
  .offert {
    color: var(--couleur-or-texte);
  }
  fieldset {
    border: 0;
    padding: 0;
    margin: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  legend {
    font-weight: 600;
    margin-bottom: 6px;
  }
  .choix,
  .discret {
    background: var(--couleur-surface-claire);
    color: var(--couleur-accent);
    border: 1px solid var(--couleur-bordure);
  }
  .choix.actif {
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  h3 {
    font-size: 17px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px;
    margin: 0 0 6px;
  }
  .rangs {
    margin: 0;
    padding: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .rangs li {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px 10px;
    padding: 8px 12px;
    border-radius: var(--rayon);
    background: var(--couleur-surface-claire);
    border: 1px solid var(--couleur-bordure-douce);
  }
  .rangs li.acquis {
    border-color: var(--couleur-accent-clair);
    background: var(--couleur-accent-pale);
  }
  .effet {
    flex-basis: 100%;
    font-size: 14px;
    color: var(--couleur-encre-douce);
  }
  .badge {
    font-size: 12px;
    padding: 2px 8px;
    border-radius: var(--rayon-pastille);
    background: var(--couleur-or);
    color: #fff;
  }
  .petit {
    min-height: 32px;
    padding: 0 10px;
  }
  label {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  label.case {
    flex-direction: row;
    align-items: center;
    gap: 6px;
    min-height: 40px;
    padding: 0 10px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure-douce);
    background: var(--couleur-surface-claire);
  }
  select {
    min-height: 40px;
    border-radius: var(--rayon);
    border: 1px solid var(--couleur-bordure);
    background: var(--couleur-surface-claire);
    padding: 0 8px;
  }
</style>
