<script lang="ts">
  import { attaquer, boirePotion, infligerDegats, lancerJetDeMort, releverAllie, subirDegats } from '../lib/actions/attaques';
  import { RefusCombat } from '../lib/actions/combat';
  import { lancerEtNoter, messageErreurJournal } from '../lib/actions/journal';
  import { formuleDegats, horsDePortee, type CarteDuCombat } from '../lib/combat/attaque';
  import { attaquesDuPj, NOMS_TYPES_DEGATS, TYPES_DEGATS_SUBIS, type AttaquePj, type TypeDegatsSubis } from '../lib/combat/attaques-pj';
  import { etatPj } from '../lib/combat/mort';
  import { actionsDuTour } from '../lib/combat/ordre';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import { formuleTest } from '../lib/regles/des';
  import { formuleSoin } from '../lib/regles/equipement';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import type { Fiche } from '../lib/schemas/fiche';

  /*
   * La barre du joueur en combat (lot L6.1), sous la carte, d'après la
   * maquette 2.0 (la barre horizontale de la v1) : identité et PV, CA,
   * initiative, PP ; attaques, jets de caractéristique, sorts et
   * capacités, objets, « Subir des dégâts ».
   *
   * Lot L6.2 (décisions de Thomas du 23/10/2026) :
   *   - attaques (1b, 2a, 3a, 4a, 5a) : à son tour, le joueur choisit une
   *     cible parmi les monstres debout (leur DEF est affichée) et attaque
   *     avec son arme ; hors de portée ou hors de vue, refusé, sauf si le
   *     MJ a libéré les portées ; touché, il lance ses dégâts, qui ôtent
   *     les PV du monstre après son armure et ses résistances ;
   *   - Mourant (7a) : à 0 PV, la barre ne propose que le jet de mort, à
   *     son tour ; un allié Mourant se relève d'ici (action principale) ;
   *   - objets (9a) : boire une potion, l'action secondaire ;
   *   - « Subir des dégâts » (8a) : un montant et un type, après réduction.
   * Les sorts (L6.4) et les attaques spéciales (L6.3) le disent.
   */

  let {
    fiche,
    idCombat,
    combat,
    moi,
    combattants,
    fiches,
    carte,
  }: {
    fiche: AvecId<Fiche>;
    idCombat: string;
    combat: Combat;
    moi: AvecId<Combattant>;
    combattants: readonly AvecId<Combattant>[];
    /** Les fiches des PJ du combat, par personnage (relever un allié). */
    fiches: ReadonlyMap<string, AvecId<Fiche>>;
    carte: CarteDuCombat | null;
  } = $props();

  const vue = $derived(vueFiche(fiche));
  const signe = (n: number) => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '+0');
  const part = $derived(vue.pv.max > 0 ? Math.max(0, Math.min(1, vue.pv.actuel / vue.pv.max)) : 0);
  const etat = $derived(etatPj(vue.pv.actuel, moi));
  const monTour = $derived(combat.statut === 'encours' && combat.actif === moi.id);
  const actions = $derived(actionsDuTour(moi, combat.tour));
  const attaques = $derived(attaquesDuPj(fiche));
  const monstres = $derived(combattants.filter((c) => c.genre === 'monstre' && !c.aTerre));
  let cibleChoisie = $state('');
  const cible = $derived(monstres.find((c) => c.id === cibleChoisie) ?? monstres[0] ?? null);
  const refusPortee = (a: AttaquePj) => (cible && !combat.porteesLibres ? horsDePortee(carte?.scene ?? null, carte?.jetons ?? [], moi.id, cible.id, a.portee) : null);
  const mourants = $derived(
    combattants.filter((c) => c.genre === 'pj' && c.id !== moi.id && c.perso && fiches.has(c.perso) && etatPj(vueFiche(fiches.get(c.perso)!).pv.actuel, c) === 'mourant'),
  );
  const potions = $derived(Object.entries(fiche.inventaire).filter(([, o]) => formuleSoin(o)));

  let message = $state('');
  let erreur = $state('');
  let occupe = $state(false);
  /** Une attaque qui a touché : ses dégâts restent à lancer (2a). */
  let aLancer = $state<{ a: AttaquePj; cible: AvecId<Combattant>; critique: boolean } | null>(null);

  async function agir(f: () => Promise<string | void>) {
    message = '';
    erreur = '';
    occupe = true;
    try {
      message = (await f()) ?? '';
    } catch (e) {
      erreur = e instanceof RefusCombat ? e.message : messageErreurJournal(e);
    } finally {
      occupe = false;
    }
  }

  const tester = (carac: string, mod: number) => agir(async () => void (await lancerEtNoter(`Test de ${carac}`, formuleTest(mod), fiche.nom)));

  function attaquerAvec(a: AttaquePj) {
    const c = cible;
    if (!c) return;
    return agir(async () => {
      const i = await attaquer(idCombat, combat, moi, c, a, fiche.nom);
      if (i.touche) aLancer = { a, cible: c, critique: i.critique };
      return i.critique ? `Critique ! d20 ${i.de} : ${c.nom} est touché.` : i.touche ? `Touché : ${i.total} contre DEF ${i.def}.` : i.echecCritique ? 'Raté : 1 naturel.' : `Raté : ${i.total} contre DEF ${i.def}.`;
    });
  }
  function lancerDegats() {
    const x = aLancer;
    if (!x) return;
    return agir(async () => {
      const r = await infligerDegats(idCombat, x.cible, { nom: x.a.nom, formule: x.a.formule, typeDegats: x.a.typeDegats, critique: x.critique }, fiche.nom);
      aLancer = null;
      return `${r.degats.net} dégâts (${r.degats.detail}) : ${r.pv <= 0 ? `${x.cible.nom} tombe.` : `${x.cible.nom} à ${r.pv} PV.`}`;
    });
  }

  let subir = $state(false);
  let brut = $state<number | null>(null);
  let typeSubi = $state<TypeDegatsSubis>('physique');
  function appliquerSubis() {
    const b = brut;
    if (b === null) return;
    return agir(async () => {
      const r = await subirDegats(fiche, b, typeSubi);
      brut = null;
      subir = false;
      return `${r.net} dégâts subis : ${r.pv} PV.`;
    });
  }
</script>

<section class="carte barre" aria-label="Mon personnage en combat">
  <div class="bloc identite">
    <strong class="nom">{fiche.nom}</strong>
    <div class="jauge">
      <div class="fond"><div class="plein" style:width="{part * 100}%"></div></div>
      <strong data-testid="pv-combat">{vue.pv.actuel}/{vue.pv.max}</strong>
    </div>
    <div class="pastilles">
      <span>CA {vue.stats.ca}</span>
      <span>Init {signe(vue.stats.initiative)}</span>
      {#if vue.pp}<span>PP {vue.pp.actuel}/{vue.pp.max}</span>{/if}
    </div>
    {#if etat === 'mourant'}<p class="alerte" role="status">Mourant · {moi.mortSucces}/3 réussites, {moi.mortEchecs}/3 échecs</p>{/if}
    {#if etat === 'mort'}<p class="alerte" role="status">{fiche.nom} est mort.</p>{/if}
  </div>

  {#if etat === 'mourant'}
    <div class="bloc">
      <h3>Jet de mort</h3>
      <p class="aide">11 ou plus : réussite. 3 réussites, tu te relèves à 1 PV ; 3 échecs, tu meurs.</p>
      <div class="boutons">
        <button class="degats" disabled={occupe || !monTour || actions.principale} onclick={() => agir(async () => void (await lancerJetDeMort(idCombat, combat, moi, fiche)))}>Lancer mon jet de mort</button>
      </div>
      {#if !monTour}<p class="aide">À ton tour.</p>{:else if actions.principale}<p class="aide">Fait pour ce tour.</p>{/if}
    </div>
  {:else if etat === 'debout'}
    <div class="bloc attaques">
      <h3>Attaques</h3>
      {#if monstres.length}
        <label class="cible"
          >Cible
          <select value={cible?.id ?? ''} onchange={(e) => (cibleChoisie = e.currentTarget.value)}>
            {#each monstres as m (m.id)}<option value={m.id}>{m.nom} · DEF {m.def}</option>{/each}
          </select>
        </label>
      {/if}
      <div class="boutons">
        {#each attaques as a (a.mode)}
          {@const refus = refusPortee(a)}
          <button disabled={occupe || !monTour || actions.principale || !cible || !!refus || !!aLancer} title={refus ?? undefined} onclick={() => attaquerAvec(a)}
            >{a.mode === 'contact' ? 'Contact' : 'Distance'} · {a.nom} {signe(a.bonus)}</button
          >
          {#if refus && monTour}<span class="aide">{a.nom} : {refus}.</span>{/if}
        {:else}
          <span class="aide">Aucune arme équipée.</span>
        {/each}
        {#if vue.stats.attaque.magique !== null}<button disabled>Magique {signe(vue.stats.attaque.magique)} · L6.4</button>{/if}
        <button disabled>Attaques spéciales · L6.3</button>
      </div>
      {#if aLancer}
        <button class="degats" disabled={occupe} onclick={lancerDegats}>Lancer les dégâts {formuleDegats(aLancer.a.formule, aLancer.critique)}{aLancer.critique ? ' (critique)' : ''}</button>
      {/if}
      {#if monTour && actions.principale && !aLancer}<p class="aide">Action principale prise ce tour.</p>{/if}
      {#each mourants as m (m.id)}
        <button disabled={occupe || !monTour || actions.principale} onclick={() => agir(async () => void (await releverAllie(idCombat, combat, moi, m, fiches.get(m.perso!)!, fiche.nom)))}>Relever {m.nom}</button>
      {/each}
    </div>
  {/if}

  <div class="bloc">
    <h3>Jets de carac</h3>
    <div class="boutons">
      {#each vue.caracs as c (c.code)}
        <button class="carac" aria-label="Test de {c.nom} {signe(c.mod)}" onclick={() => tester(c.nom, c.mod)}>{c.code}<br />{signe(c.mod)}</button>
      {/each}
    </div>
  </div>

  <div class="bloc">
    <h3>Sorts et capacités · L6.4</h3>
    <div class="boutons"><button disabled>Bientôt depuis cette barre</button></div>
  </div>

  <div class="bloc">
    <h3>Objets</h3>
    <div class="boutons">
      {#each potions as [cle, o] (cle)}
        <button disabled={occupe || !monTour || actions.secondaire || etat !== 'debout'} onclick={() => agir(async () => `${o.nom} : ${await boirePotion(idCombat, combat, moi, fiche, cle)} PV rendus.`)}
          >Boire {o.nom}{typeof o.quantite === 'number' && o.quantite > 1 ? ` (×${o.quantite})` : ''}</button
        >
      {:else}
        <span class="aide">Pas de potion dans le sac.</span>
      {/each}
      <button class="degats" aria-expanded={subir} disabled={etat === 'mort'} onclick={() => (subir = !subir)}>Subir des dégâts</button>
    </div>
    {#if potions.length && monTour && actions.secondaire}<p class="aide">Action secondaire prise ce tour.</p>{/if}
    {#if subir}
      <form class="subir" onsubmit={(e) => (e.preventDefault(), appliquerSubis())}>
        <input type="number" min="0" max="9999" aria-label="Dégâts bruts" placeholder="Dégâts" bind:value={brut} />
        <select aria-label="Type de dégâts" bind:value={typeSubi}>
          {#each TYPES_DEGATS_SUBIS as t (t)}<option value={t}>{NOMS_TYPES_DEGATS[t]}</option>{/each}
        </select>
        <button class="petit" disabled={occupe || brut === null}>Appliquer</button>
      </form>
    {/if}
  </div>
  {#if message}<p class="message" role="status">{message}</p>{/if}
  {#if erreur}<p class="message erreur" role="alert">{erreur}</p>{/if}
</section>

<style>
  .barre {
    display: flex;
    flex-wrap: wrap;
    padding: 0;
    overflow: hidden;
  }
  .bloc {
    flex: 1 1 220px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 14px 16px;
    border-right: 1px solid var(--couleur-bordure-douce);
    border-bottom: 1px solid var(--couleur-bordure-douce);
  }
  .identite {
    flex-basis: 280px;
  }
  .attaques {
    flex-basis: 300px;
  }
  .nom {
    font-size: 17px;
  }
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
  .jauge {
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .fond {
    flex: 1;
    height: 12px;
    border-radius: 999px;
    background: var(--couleur-danger-pale);
    overflow: hidden;
  }
  .plein {
    height: 100%;
    background: var(--couleur-succes);
  }
  .pastilles {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    font-size: 13px;
    font-weight: 600;
  }
  .pastilles span {
    padding: 3px 9px;
    border-radius: 8px;
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .alerte {
    color: var(--couleur-danger);
    font-weight: 700;
  }
  .cible {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .boutons {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    align-items: center;
  }
  .carac {
    min-width: 52px;
    min-height: 48px;
    font-weight: 700;
    font-size: 13px;
  }
  .degats {
    background: var(--couleur-danger);
    color: var(--couleur-sur-accent);
  }
  .subir {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .subir input {
    width: 90px;
  }
  .message {
    width: 100%;
    padding: 10px 16px 12px;
  }
</style>
