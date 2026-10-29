<script lang="ts">
  import { RefusCombat } from '../lib/actions/combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { cleCapacite, corrigerLegendaire, jouerCapaciteMonstre } from '../lib/actions/monstres';
  import { corrigerFaim, monterDemon } from '../lib/actions/demons';
  import { viseeCarte } from '../lib/combat/visee.svelte';
  import { aDesTraits, bonusBerserk, faimDe, peutMonter, rappelsDemon, touchesBerserk, type TraitsDemon } from '../lib/combat/demons';
  import type { CarteDuCombat } from '../lib/combat/attaque';
  import { etatDuCatalogue } from '../lib/combat/etats';
  import { capacitesDuMonstre, casesDeZone, ciblesDeZone, immunitesAuMj, legendairesRestantes, refusDeLimite, type CapaciteMonstre } from '../lib/combat/monstres';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import type { MonstreEnBase } from '../lib/schemas/bestiaire';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import type { Fiche } from '../lib/schemas/fiche';

  /*
   * Le monstre avancé, dans le panneau du MJ (lot L6.6a, décisions de
   * Thomas du 28/10/2026) :
   *   - ses immunités (8a), et celles que le MJ applique lui-même ;
   *   - ses résistances légendaires (7a), que le MJ corrige ;
   *   - ses capacités actives (2a, 3a, 10a) : leur limite, leurs cibles à
   *     cocher, « Jouer » ; celles que l'app ne lit pas, en texte ;
   *   - ses capacités spéciales, en texte.
   *
   * Lot L6.6b (décisions de Thomas du 29/10/2026) : un démon : sa faim
   * (1a), corrigée au −/+ ; au seuil, « Monter » vers son palier suivant
   * (2a) ; son berserk (6a) ; ce qui se joue d'office (5a, 7a, 8a) et les
   * passifs que le MJ applique lui-même.
   *
   * Lot L6.7a (décisions du 29/10/2026) : une capacité en zone coche d'office
   * ce que son rayon prend (2a, 3a) et se montre sur la carte ; une aura le
   * dit (4a).
   */

  let {
    idCombat,
    combat,
    monstre,
    modele,
    combattants,
    fiches,
    carte,
    demon = null,
    modeles = [],
    reductions = new Map(),
  }: {
    idCombat: string;
    combat: Combat;
    monstre: AvecId<Combattant>;
    modele: AvecId<MonstreEnBase>;
    combattants: readonly AvecId<Combattant>[];
    /** Par personnage. */
    fiches: ReadonlyMap<string, AvecId<Fiche>>;
    carte: CarteDuCombat | null;
    /** L6.6b : ce que le bestiaire dit du démon ; null : un monstre ordinaire. */
    demon?: TraitsDemon | null;
    /** L6.6b (2a) : le bestiaire, pour ses paliers suivants. */
    modeles?: readonly AvecId<MonstreEnBase>[];
    /** L6.6b (2a) : la réduction des armures, par identifiant. */
    reductions?: ReadonlyMap<string, number>;
  } = $props();

  const lues = $derived(capacitesDuMonstre(modele));
  const auMj = $derived(immunitesAuMj(modele));
  const restantes = $derived(legendairesRestantes(monstre));
  const ciblesPossibles = (cap: CapaciteMonstre) =>
    combattants.filter((c) => !c.mort && !(c.genre !== 'pj' && c.aTerre) && (cap.cible === 'zone' || (cap.cible === 'ennemi' ? c.genre !== 'monstre' : c.genre === 'monstre')));
  // L6.7a (2a, 3a) : une capacité en zone coche d'office ce que son rayon prend sur la carte ; le MJ décoche.
  const parDefaut = (cap: CapaciteMonstre) => (cap.zone && carte ? ciblesDeZone(monstre, cap.zone, combattants, carte.jetons) : []);
  let cochees = $state<Record<string, string[]>>({});
  const cochesDe = (cap: CapaciteMonstre) => cochees[cap.nom] ?? parDefaut(cap);
  const coche = (cap: CapaciteMonstre, id: string, oui: boolean) => (cochees = { ...cochees, [cap.nom]: oui ? [...cochesDe(cap), id] : cochesDe(cap).filter((x) => x !== id) });
  // L6.7a (2a) : la zone d'une capacité, montrée sur la carte du MJ.
  let zoneMontree = $state<string | null>(null);
  $effect(() => {
    const cap = lues.capacites.find((c) => c.nom === zoneMontree);
    const centre = carte?.jetons.find((j) => j.id === monstre.id);
    if (!cap?.zone || !carte || !centre) return;
    const cases = casesDeZone(centre, cap.zone, carte.scene);
    const jetons = cochesDe(cap);
    viseeCarte.v = { apercu: () => ({ cases, jetons, refus: null }), choisir: () => {}, fixe: { cases, jetons } };
    return () => (viseeCarte.v = null);
  });
  const LIBELLE_PREND = { principale: 'action', secondaire: 'action bonus', reaction: 'réaction' } as const;
  const texteLimite = (cap: CapaciteMonstre) =>
    cap.limite.parCombat ? `${cap.limite.parCombat}×/combat` : cap.limite.parRound ? `${cap.limite.parRound}×/round` : cap.limite.recharge ? `recharge ${cap.limite.recharge} round${cap.limite.recharge > 1 ? 's' : ''}` : 'à volonté';

  let message = $state('');
  let resultat = $state('');
  let occupe = $state(false);
  async function agir(f: () => Promise<string | void>) {
    message = '';
    resultat = '';
    occupe = true;
    try {
      resultat = (await f()) ?? '';
    } catch (e) {
      message = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }
  const LIBELLE_FAIM = { pp_draines: 'PP drainés', degats_infliges: 'PV infligés', etats_controle: 'états de contrôle', rounds_survecus: 'rounds survécus' } as const;
  const estDemon = $derived(!!demon && aDesTraits(demon));
  const paliers = $derived(demon && peutMonter(monstre, demon) ? demon.paliersSuivants.map((id) => ({ id, m: modeles.find((x) => x.id === id) ?? null })) : []);
  const passifsJoues = $derived(
    demon
      ? [
          ...(demon.repousse ? [`Repousse : +${demon.repousse} PV au début de son tour.`] : []),
          ...(demon.soinParPPDraine ? [`Puits : +${demon.soinParPPDraine} PV par PP drainé.`] : []),
          ...(demon.soinSurDegats ? [`Vol de sève : il regagne ${demon.soinSurDegats * 100} % des dégâts qu’il inflige.`] : []),
          ...(demon.passifs.airVicie ? [`Air vicié : ${demon.passifs.airVicie.formule} à qui commence son tour à ${demon.passifs.airVicie.rayon} m.`] : []),
          ...(demon.passifs.reflet ? [`Reflet : +${demon.passifs.reflet} PV par sauvegarde ratée contre lui.`] : []),
          ...(demon.passifs.dernierSouffle ? [`Dernier souffle : à 0 PV avec ${demon.passifs.dernierSouffle} touches de berserk, un dernier tour.`] : []),
        ]
      : [],
  );
  const monter = (m: AvecId<MonstreEnBase>) => agir(() => monterDemon(idCombat, combat.scene, monstre, demon!, m, reductions));
  const jouer = (cap: CapaciteMonstre) =>
    agir(async () => {
      const t = await jouerCapaciteMonstre(idCombat, combat, monstre, cap, cochesDe(cap), { combattants, fiches, carte, demon });
      const { [cap.nom]: _jouee, ...reste } = cochees;
      cochees = reste;
      return t;
    });
</script>

{#if monstre.immunites?.length || auMj.length}
  <p class="aide" data-testid="immunites">
    {#if monstre.immunites?.length}Immunisé : {monstre.immunites.map((id) => etatDuCatalogue(id)?.nom ?? id).join(', ')}.{/if}
    {#each auMj as x (x)}<span class="aumj">Au MJ : {x}.</span>{/each}
  </p>
{/if}
{#if monstre.legendaire}
  <div class="legendaire">
    <span data-testid="legendaire">Résistance légendaire : {restantes}/{monstre.legendaire}</span>
    <button class="petit discret" aria-label="Une résistance légendaire de moins" disabled={occupe || restantes === 0} onclick={() => agir(() => corrigerLegendaire(idCombat, monstre, 1))}>−</button>
    <button class="petit discret" aria-label="Une résistance légendaire de plus" disabled={occupe || restantes === monstre.legendaire} onclick={() => agir(() => corrigerLegendaire(idCombat, monstre, -1))}>+</button>
  </div>
{/if}
{#if demon && estDemon}
  <div class="demon" role="group" aria-label="Démon">
    {#if demon.faim}
      <div class="ligne">
        <span data-testid="faim">Faim : {faimDe(monstre)}/{demon.faim.seuil} ({LIBELLE_FAIM[demon.faim.type]})</span>
        <button class="petit discret" aria-label="Une faim de moins" disabled={occupe || faimDe(monstre) === 0} onclick={() => agir(() => corrigerFaim(idCombat, monstre, -1))}>−</button>
        <button class="petit discret" aria-label="Une faim de plus" disabled={occupe} onclick={() => agir(() => corrigerFaim(idCombat, monstre, 1))}>+</button>
      </div>
    {/if}
    {#each paliers as p (p.id)}
      <button class="petit" disabled={occupe || !p.m} onclick={() => p.m && monter(p.m)}>Monter : {p.m?.nom ?? p.id}</button>
    {/each}
    {#if demon.berserk}<span data-testid="berserk">Berserk : {touchesBerserk(monstre)} touche{touchesBerserk(monstre) > 1 ? 's' : ''}, +{bonusBerserk(monstre, demon)} aux dégâts</span>{/if}
    {#each passifsJoues as x (x)}<span class="aide">{x}</span>{/each}
    {#each rappelsDemon(demon) as x (x)}<span class="aide">Au MJ : {x}</span>{/each}
  </div>
{/if}
{#if lues.capacites.length || lues.illisibles.length}
  <h3>Capacités</h3>
  <ul class="capacites" aria-label="Capacités de {monstre.nom}">
    {#each lues.capacites as cap (cap.nom)}
      {@const refus = refusDeLimite(monstre, cleCapacite(cap.nom), cap.limite, combat.round)}
      <li>
        <strong>{cap.nom}</strong>
        <span class="aide">{cap.aura ? 'aura, au début de son tour' : LIBELLE_PREND[cap.prend]} · {texteLimite(cap)}{cap.portee !== null ? ` · ${cap.portee} cases` : ''}{cap.zone ? ` · zone ${cap.zone} m` : ''}{cap.sauvegarde ? ` · ${cap.sauvegarde.type} ${cap.sauvegarde.dd}` : ''}{cap.jetAttaque !== null ? ` · attaque +${cap.jetAttaque}` : ''}</span>
        <span class="aide">{cap.description}</span>
        {#if cap.cible === 'ennemi' || cap.cible === 'allie' || cap.cible === 'zone'}
          <fieldset>
            <legend>Cibles de {cap.nom}</legend>
            {#each ciblesPossibles(cap) as c (c.id)}
              <label><input type="checkbox" checked={cochesDe(cap).includes(c.id)} onchange={(e) => coche(cap, c.id, e.currentTarget.checked)} /> {c.nom}</label>
            {/each}
            {#if cap.cible === 'zone' && cap.zone}
              <button class="petit discret" aria-pressed={zoneMontree === cap.nom} disabled={!carte} onclick={() => (zoneMontree = zoneMontree === cap.nom ? null : cap.nom)}>{zoneMontree === cap.nom ? 'Cacher la zone' : 'Voir la zone'}</button>
            {/if}
          </fieldset>
        {/if}
        <button class="petit" disabled={occupe || !!refus} onclick={() => jouer(cap)}>Jouer {cap.nom}</button>
        {#if refus}<span class="aide">{cap.nom} : {refus}.</span>{/if}
      </li>
    {/each}
    {#each lues.illisibles as cap (cap.nom)}
      <li><strong>{cap.nom}</strong> <span class="aide">au MJ : {cap.description}</span></li>
    {/each}
  </ul>
{/if}
{#if modele.capacitesSpeciales.length}
  <details>
    <summary>Capacités spéciales</summary>
    <ul class="capacites">
      {#each modele.capacitesSpeciales as c (c.nom)}<li><strong>{c.nom}</strong> <span class="aide">{c.description}</span></li>{/each}
    </ul>
  </details>
{/if}
{#if resultat}<p role="status">{resultat}</p>{/if}
{#if message}<p class="erreur" role="alert">{message}</p>{/if}

<style>
  h3 {
    margin: 0;
    font-size: 12px;
    letter-spacing: 0.6px;
    text-transform: uppercase;
    color: var(--couleur-encre-douce);
  }
  p {
    margin: 0;
  }
  .aumj {
    display: block;
  }
  .demon {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .demon .ligne {
    display: flex;
    align-items: center;
    gap: 6px;
    font-weight: 600;
  }
  .legendaire {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .capacites {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 13px;
  }
  .capacites li {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }
  fieldset {
    display: flex;
    flex-wrap: wrap;
    gap: 4px 10px;
    border: 1px solid var(--couleur-bordure-douce);
    border-radius: 8px;
    padding: 4px 8px;
  }
  legend {
    font-size: 12px;
  }
  details summary {
    cursor: pointer;
    font-size: 13px;
    font-weight: 600;
  }
</style>
