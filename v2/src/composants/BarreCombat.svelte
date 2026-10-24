<script lang="ts">
  import { attaquer, boirePotion, decharger, infligerDegats, lancerJetDeMort, poserEtatSur, releverAllie, retirerEtatDe, subirDegats, viser } from '../lib/actions/attaques';
  import { RefusCombat } from '../lib/actions/combat';
  import { lancerEtNoter, messageErreurJournal } from '../lib/actions/journal';
  import { formuleDegats, horsDePortee, type CarteDuCombat } from '../lib/combat/attaque';
  import { attaquesDuPj, NOMS_TYPES_DEGATS, TYPES_DEGATS_SUBIS, type AttaquePj, type TypeDegatsSubis } from '../lib/combat/attaques-pj';
  import { ciblable, contactSeulement, defenseVisee, etatsPosables, peutAgir, regleEtat, texteEtat } from '../lib/combat/etats';
  import { etatPj } from '../lib/combat/mort';
  import { attaquesSpecialesDuPj, type AttaqueSpeciale } from '../lib/combat/speciales';
  import { actionsDuTour } from '../lib/combat/ordre';
  import { lancerSortEnCombat, placerParSort, type APlacer } from '../lib/actions/sorts-combat';
  import { texteBonus } from '../lib/combat/bonus';
  import { arriveePermise } from '../lib/combat/poussee';
  import { apercu, campPermis, ciblageDe, coutAffiche, palierLance, sortsDeCombat, surchargeable, viseeComplete, type CiblageSort, type Visee } from '../lib/combat/sorts';
  import { viseeCarte } from '../lib/combat/visee.svelte';
  import { couverture, protegeParSanctuaire } from '../lib/combat/zones-sol';
  import type { Palier } from '../lib/schemas/effets';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { AvecId } from '../lib/firebase/suivre.svelte';
  import { formuleTest } from '../lib/regles/des';
  import { formuleSoin } from '../lib/regles/equipement';
  import type { Combat, Combattant } from '../lib/schemas/combat';
  import type { Fiche, FicheV2 } from '../lib/schemas/fiche';

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
   * Les sorts (L6.4) le disent.
   *
   * Lot L6.3 (décisions de Thomas du 23/10/2026) :
   *   - ses jauges de classe et ses états, avec leur règle (14a) ; un état
   *     qui l'empêche d'agir le dit, et il passe lui-même (7b) ;
   *   - les attaques spéciales de ses armes, avec leur coût (11a) ; Coup
   *     d'estoc au choix : Déséquilibrer ou Repousser (12a) ; Précision et
   *     Décharge (13a) ;
   *   - à son tour, il pose un état à la main sur qui il veut, ou en
   *     retire un (4b, D).
   *
   * Lot L6.4a (décisions de Thomas du 23/10/2026) : le bloc « Sorts et
   * capacités » (13a) liste ses verbes, sorts mineurs et capacités
   * actives (3a), avec palier, surcharge, élément et coût de combat (4a) ;
   * « Viser sur la carte » ouvre la visée (6a : un jeton, ou une case pour
   * un point, une ligne ou un cône ; la zone et les jetons pris se
   * montrent au survol) ; « Lancer » résout (2a) et le journal dit la
   * suite. Un sort qui téléporte fait cliquer la case d'arrivée (10a). Ses
   * PV temporaires et ses bonus du combat s'affichent (11a, 12a).
   *
   * Lot L6.4b1 (11a) : une cible dans un sanctuaire où il n'est pas ne se
   * vise pas ; la couverture d'une cible ajoute 2 à sa DEF contre une
   * attaque à distance.
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
  const speciales = $derived(attaquesSpecialesDuPj(fiche));
  const agit = $derived(peutAgir(moi.etats));
  const aveugle = $derived(contactSeulement(moi.etats));
  const monstres = $derived(combattants.filter((c) => c.genre === 'monstre' && !c.aTerre && ciblable(c.etats)));
  // La DEF montrée au choix de la cible est celle que le jet visera :
  // celle du monstre modifiée par ses états (Exposé −2…), comme
  // `jetAttaque` la calcule.
  const defVisee = (c: Combattant) => (c.def === null ? null : defenseVisee(c.def, c.etats, c.bonus));
  let cibleChoisie = $state('');
  const cible = $derived(monstres.find((c) => c.id === cibleChoisie) ?? monstres[0] ?? null);
  // L6.4b1 (11a) : une cible dans un sanctuaire où il n'est pas ne se vise pas.
  const sanctuaire = $derived(!!cible && !!carte?.zones && protegeParSanctuaire(carte.zones, carte.jetons, moi.id, cible.id));
  const refusPortee = (a: AttaquePj) =>
    a.mode === 'distance' && aveugle
      ? 'il n’attaque qu’au contact'
      : sanctuaire
        ? 'la cible est dans un sanctuaire'
        : cible && !combat.porteesLibres
          ? horsDePortee(carte?.scene ?? null, carte?.jetons ?? [], moi.id, cible.id, a.portee)
          : null;
  /** Couverture de la cible contre une attaque à distance (L6.4b1, 11a). */
  const defEnPlus = (a: Pick<AttaquePj, 'mode'>, c: AvecId<Combattant>) => (a.mode === 'distance' && carte?.zones ? couverture(carte.zones, carte.jetons, c.id) : 0);
  const jauges = $derived(vue.refonte?.jauges.filter((j) => j.cle !== 'corruptionAme') ?? []);
  const coutDe = (s: AttaqueSpeciale) => (s.cout === 'unParCombat' ? '1×/combat' : `${s.cout.montant} ${jauges.find((j) => j.cle === (s.cout as { ressource: string }).ressource)?.nom ?? (s.cout as { ressource: string }).ressource}`);
  const specialeFaite = $derived(!!moi.usages.attaqueSpeciale);
  let cibles3 = $state<string[]>([]);
  const mourants = $derived(
    combattants.filter((c) => c.genre === 'pj' && c.id !== moi.id && c.perso && fiches.has(c.perso) && etatPj(vueFiche(fiches.get(c.perso)!).pv.actuel, c) === 'mourant'),
  );
  const potions = $derived(Object.entries(fiche.inventaire).filter(([, o]) => formuleSoin(o)));

  let message = $state('');
  let erreur = $state('');
  let occupe = $state(false);
  /** Une attaque qui a touché : ses dégâts restent à lancer (2a). */
  let aLancer = $state<{ a: Pick<AttaquePj, 'nom' | 'formule' | 'typeDegats'>; cible: AvecId<Combattant>; critique: boolean } | null>(null);

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

  const texteIssue = (i: { de: number; total: number; def: number; touche: boolean; critique: boolean; echecCritique: boolean }, nom: string) =>
    i.critique ? `Critique ! d20 ${i.de} : ${nom} est touché.` : i.touche ? `Touché : ${i.total} contre DEF ${i.def}.` : i.echecCritique ? 'Raté : 1 naturel.' : i.de === 0 ? 'Raté d’office.' : `Raté : ${i.total} contre DEF ${i.def}.`;
  function attaquerAvec(a: AttaquePj, s: AttaqueSpeciale | null = null, estoc?: 'etat' | 'repousse') {
    const c = cible;
    if (!c) return;
    return agir(async () => {
      const i = await attaquer(idCombat, combat, moi, c, { nom: a.nom, bonus: a.bonus, seuilCritique: a.seuilCritique, mode: a.mode, defEnPlus: defEnPlus(a, c) }, fiche, Math.random, s ? { s, estoc, carte, fiches, combattants } : null);
      if (i.touche && a.formule) aLancer = { a, cible: c, critique: i.critique };
      return texteIssue(i, c.nom);
    });
  }
  function jouerSpeciale(s: AttaqueSpeciale, estoc?: 'etat' | 'repousse') {
    if (s.effet.type === 'precision') return agir(async () => (await viser(idCombat, combat, moi, s, fiche), 'Tu vises : ta prochaine attaque gagne +1d6.'));
    if (s.effet.type === 'decharge') {
      const choisies = monstres.filter((m) => cibles3.includes(m.id)).slice(0, 3);
      return agir(async () => `Décharge : ${await decharger(idCombat, combat, moi, choisies.length ? choisies : cible ? [cible] : [], s, fiche)} balle(s) au but.`);
    }
    return attaquerAvec(s.arme, s, estoc);
  }
  function lancerDegats() {
    const x = aLancer;
    if (!x) return;
    return agir(async () => {
      const r = await infligerDegats(idCombat, x.cible, { nom: x.a.nom, formule: x.a.formule, typeDegats: x.a.typeDegats, critique: x.critique }, fiche.nom, Math.random, moi);
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
      const r = await subirDegats(fiche, b, typeSubi, { idCombat, c: moi });
      brut = null;
      subir = false;
      return `${r.net} dégâts subis : ${r.pv} PV.`;
    });
  }

  // ---- Poser un état à la main (4b, D) ----
  const posables = etatsPosables();
  let poseSur = $state('');
  let poseEtat = $state('');
  let poseRounds = $state<number | null>(1);
  function poser() {
    const c = combattants.find((x) => x.id === (poseSur || cible?.id));
    if (!c || !poseEtat) return;
    return agir(async () => {
      await poserEtatSur(idCombat, c, poseEtat, poseRounds, fiche.nom);
      poseEtat = '';
    });
  }

  // ---- Sorts et capacités (L6.4a) ----
  const sorts = $derived(sortsDeCombat(fiche));
  let sortChoisi = $state('');
  const sort = $derived(sorts.find((x) => x.id === sortChoisi) ?? sorts[0] ?? null);
  let palierChoisi = $state<Palier | ''>('');
  const palier: Palier = $derived(sort ? (sort.paliers.includes(palierChoisi as Palier) ? (palierChoisi as Palier) : (sort.paliers.at(-1) ?? 'I')) : 'I');
  let surchargeVoulue = $state(false);
  const surcharge = $derived(!!sort && surchargeVoulue && surchargeable(sort.id, palier));
  let elementChoisi = $state('');
  const element = $derived(sort ? (sort.elements.find((e) => e.id === elementChoisi) ?? (sort.elementRequis ? (sort.elements[0] ?? null) : null)) : null);
  const coutSort = $derived(sort ? coutAffiche(sort, palier, surcharge, element?.maitrise ?? null) : null);
  const ciblage = $derived(sort ? ciblageDe(sort.id, palierLance(sort.id, palier, surcharge), attaques[0]?.portee?.max ?? 1) : null);
  let visee = $state<Visee>({ cibles: [], point: null });
  let viseEnCours = $state(false);
  let aPlacer = $state<APlacer[]>([]);
  const cleSort = $derived(`${sort?.id}|${palier}|${surcharge}`);
  $effect(() => {
    void cleSort;
    visee = { cibles: [], point: null };
    viseEnCours = false;
  });
  const nomDe = (id: string) => combattants.find((c) => c.id === id)?.nom ?? id;
  const typeTexte = { principale: 'action', secondaire: 'action mineure', gratuite: 'gratuite' } as const;
  function texteCiblage(c: CiblageSort): string {
    const camp = c.camp === 'ennemi' ? ' ennemie' : c.camp === 'allie' ? ' alliée' : '';
    const qui = c.type === 'soi' ? 'Soi' : c.type === 'aucun' ? 'Sans cible' : c.type === 'point' ? `Une case, à ${c.portee} cases au plus` : `${c.nbCibles > 1 ? `${c.nbCibles} créatures` : 'Une créature'}${camp}, ${c.portee <= 1 ? 'au contact' : `à ${c.portee} cases`}`;
    const formes = { carre: 'carré', cercle: 'cercle', ligne: 'ligne', cone: 'cône' } as const;
    const zone = c.zone ? ` · zone : ${formes[c.zone.forme]} de ${c.zone.taille}${c.zone.origine === 'lanceur' && (c.zone.forme === 'carre' || c.zone.forme === 'cercle') ? ' autour de toi' : ''}` : '';
    return `${qui}${zone}`;
  }
  const jetonSur = (k: { cx: number; cy: number }) => carte?.jetons.find((j) => j.cx === k.cx && j.cy === k.cy && !j.mort)?.id ?? null;
  /** La visée si on cliquait cette case (le survol de la carte). */
  function essai(c: CiblageSort, v: Visee, k: { cx: number; cy: number }, jeton: string | null): Visee {
    if (c.clicCase) return { ...v, point: k };
    const x = jeton ? combattants.find((m) => m.id === jeton) : undefined;
    if (c.type === 'creature' && x && campPermis(x, c.camp)) return { ...v, cibles: [...v.cibles, x.id].slice(-c.nbCibles) };
    return v;
  }
  // La visée ouverte sur la carte (6a) ; à la fermeture, la carte reprend ses gestes.
  $effect(() => {
    const c = ciblage;
    const v = visee;
    const k = carte;
    if (!viseEnCours || !c || !k) return;
    const voir = (x: Visee) => {
      const a = apercu(k.scene, k.jetons, moi.id, c, x, combat.porteesLibres, k.zones ?? []);
      return { cases: a.cases, jetons: a.touches, refus: a.refus };
    };
    viseeCarte.v = {
      apercu: (survol) => voir(essai(c, v, survol, jetonSur(survol))),
      choisir: (k2, jeton) => (visee = essai(c, v, k2, jeton ?? jetonSur(k2))),
      fixe: v.cibles.length || v.point ? voir(v) : { cases: [], jetons: [] },
    };
    return () => (viseeCarte.v = null);
  });
  // Placer un jeton qu'un sort téléporte (10a) : la case d'arrivée, d'un clic.
  $effect(() => {
    const p = aPlacer[0];
    const k = carte;
    if (!p || !k) return;
    viseeCarte.v = {
      apercu: (survol) => ({ cases: [survol], jetons: [p.cible], refus: arriveePermise(k.scene, k.jetons, p.cible, survol, p.cases) }),
      choisir: (k2) =>
        void agir(async () => {
          await placerParSort(combat.scene, k, p, k2);
          aPlacer = aPlacer.slice(1);
          return `${p.nom} est placé.`;
        }),
      fixe: { cases: [], jetons: [p.cible] },
    };
    return () => (viseeCarte.v = null);
  });
  const dejaServi = $derived(
    !!sort && ((sort.limite === '1x/round' && moi.usages[sort.id] === combat.round) || (sort.limite !== 'volonte' && sort.limite !== '1x/round' && !!moi.usages[sort.id])),
  );
  const actionPrise = $derived(!!sort && ((sort.typeAction === 'principale' && actions.principale) || (sort.typeAction === 'secondaire' && actions.secondaire)));
  function lancerLeSort() {
    const s = sort;
    if (!s || fiche.schemaVersion !== 2) return;
    return agir(async () => {
      const r = await lancerSortEnCombat(idCombat, combat, moi, fiche as AvecId<FicheV2>, { sort: s.id, palier, surcharge, element: element?.id ?? null, visee }, carte, combattants, fiches);
      visee = { cibles: [], point: null };
      viseEnCours = false;
      aPlacer = r.aPlacer;
      return `${r.texte}${r.aPlacer.length ? ` Clique sur la carte la case d’arrivée de ${r.aPlacer[0]!.nom} (${r.aPlacer[0]!.cases} cases au plus).` : ''}`;
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
      {#each jauges as j (j.cle)}<span>{j.nom} {j.actuel}{j.max !== null ? `/${j.max}` : ''}</span>{/each}
      {#if moi.pvTemp}<span>PV temp. {moi.pvTemp}</span>{/if}
    </div>
    {#if moi.bonus.length}
      <ul class="etats" aria-label="Mes bonus">
        {#each moi.bonus as b, i (i)}<li><strong>{texteBonus(b)}</strong>{b.source ? ` · ${b.source}` : ''}</li>{/each}
      </ul>
    {/if}
    {#if moi.etats.length}
      <ul class="etats" aria-label="Mes états">
        {#each moi.etats as e (e.id)}
          <li title={regleEtat(e.id)}>
            <strong>{texteEtat(e)}</strong> <span class="aide">{regleEtat(e.id)}</span>
            {#if monTour}<button class="lien" aria-label="Retirer {texteEtat(e)}" disabled={occupe} onclick={() => agir(() => retirerEtatDe(idCombat, moi, e.id))}>retirer</button>{/if}
          </li>
        {/each}
      </ul>
    {/if}
    {#if agit !== 'oui' && etat === 'debout'}<p class="alerte" role="status">{agit === 'non' ? 'Tu ne peux pas agir ce tour : finis ton tour.' : 'Tu ne peux que te déplacer ce tour.'}</p>{/if}
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
            {#each monstres as m (m.id)}<option value={m.id}>{m.nom} · DEF {defVisee(m)}</option>{/each}
          </select>
        </label>
      {/if}
      <div class="boutons">
        {#each attaques as a (a.mode)}
          {@const refus = refusPortee(a)}
          <button disabled={occupe || !monTour || actions.principale || agit !== 'oui' || !cible || !!refus || !!aLancer} title={refus ?? undefined} onclick={() => attaquerAvec(a)}
            >{a.mode === 'contact' ? 'Contact' : 'Distance'} · {a.nom} {signe(a.bonus)}</button
          >
          {#if refus && monTour}<span class="aide">{a.nom} : {refus}.</span>{/if}
        {:else}
          <span class="aide">Aucune arme équipée.</span>
        {/each}
      </div>
      {#if speciales.length}
        <h3>Attaques spéciales</h3>
        <div class="boutons">
          {#each speciales as s (s.id)}
            {@const refus = s.effet.type === 'precision' ? null : refusPortee(s.arme)}
            {@const bloque = occupe || !monTour || actions.principale || agit !== 'oui' || (s.effet.type !== 'precision' && !cible) || !!refus || !!aLancer || (s.cout === 'unParCombat' && specialeFaite)}
            {#if s.effet.type === 'estoc'}
              <button disabled={bloque} title={s.description} onclick={() => jouerSpeciale(s, 'etat')}>{s.nom} · Déséquilibrer · {coutDe(s)}</button>
              <button disabled={bloque} title={s.description} onclick={() => jouerSpeciale(s, 'repousse')}>{s.nom} · Repousser · {coutDe(s)}</button>
            {:else}
              <button disabled={bloque} title={s.description} onclick={() => jouerSpeciale(s)}>{s.nom} · {coutDe(s)}</button>
            {/if}
            {#if refus && monTour}<span class="aide">{s.nom} : {refus}.</span>{/if}
            {#if s.effet.type === 'decharge'}
              <fieldset class="cibles3">
                <legend>Cibles de la Décharge (3 au plus)</legend>
                {#each monstres as m (m.id)}
                  <label
                    ><input
                      type="checkbox"
                      checked={cibles3.includes(m.id)}
                      disabled={!cibles3.includes(m.id) && cibles3.length >= 3}
                      onchange={(e) => (cibles3 = e.currentTarget.checked ? [...cibles3, m.id] : cibles3.filter((x) => x !== m.id))}
                    />
                    {m.nom}</label
                  >
                {/each}
              </fieldset>
            {/if}
          {/each}
        </div>
        {#if specialeFaite && speciales.some((s) => s.cout === 'unParCombat')}<p class="aide">Attaque spéciale du combat faite.</p>{/if}
        {#if moi.visee}<p class="aide">Tu as visé : ta prochaine attaque gagne +1d6 aux dégâts.</p>{/if}
      {/if}
      {#if aLancer}
        <button class="degats" disabled={occupe} onclick={lancerDegats}
          >Lancer les dégâts {formuleDegats(aLancer.a.formule, aLancer.critique)}{moi.visee ? (aLancer.critique ? '+1d10' : '+1d6') : ''}{aLancer.critique ? ' (critique)' : ''}</button
        >
      {/if}
      {#if monTour && actions.principale && !aLancer}<p class="aide">Action principale prise ce tour.</p>{/if}
      {#each mourants as m (m.id)}
        <button disabled={occupe || !monTour || actions.principale} onclick={() => agir(async () => void (await releverAllie(idCombat, combat, moi, m, fiches.get(m.perso!)!, fiche.nom)))}>Relever {m.nom}</button>
      {/each}
    </div>
  {/if}

  {#if monTour && etat !== 'mort'}
    <div class="bloc">
      <h3>Poser un état</h3>
      <form class="poser" onsubmit={(e) => (e.preventDefault(), poser())}>
        <select aria-label="Sur qui" bind:value={poseSur}>
          <option value="">{cible?.nom ?? '—'}</option>
          {#each combattants.filter((c) => c.id !== cible?.id) as c (c.id)}<option value={c.id}>{c.nom}</option>{/each}
        </select>
        <select aria-label="État à poser" bind:value={poseEtat}>
          <option value="">État…</option>
          {#each posables as p (p.id)}<option value={p.id} title={p.regle}>{p.nom}</option>{/each}
        </select>
        <input type="number" min="1" max="99" aria-label="Rounds" bind:value={poseRounds} />
        <button class="petit" disabled={occupe || !poseEtat}>Poser</button>
      </form>
      <p class="aide">Pour l’état qu’une de tes capacités pose ; le MJ peut le retirer.</p>
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

  <div class="bloc sorts">
    <h3>Sorts et capacités</h3>
    {#if sort && ciblage}
      <label class="cible"
        >Sort ou capacité
        <select value={sort.id} onchange={(e) => ((sortChoisi = e.currentTarget.value), (palierChoisi = ''), (elementChoisi = ''), (surchargeVoulue = false))}>
          {#each sorts as x (x.id)}<option value={x.id}>{x.nom}{x.grimoire ? ' (grimoire)' : ''} · {typeTexte[x.typeAction]}</option>{/each}
        </select>
      </label>
      <p class="aide">{sort.description}</p>
      <div class="reglages">
        {#if sort.paliers.length > 1}
          <select aria-label="Palier" value={palier} onchange={(e) => (palierChoisi = e.currentTarget.value as Palier)}>
            {#each sort.paliers as p (p)}<option value={p}>Palier {p}</option>{/each}
          </select>
        {/if}
        {#if surchargeable(sort.id, palier)}<label><input type="checkbox" bind:checked={surchargeVoulue} /> Surcharge</label>{/if}
        {#if sort.elements.length}
          <select aria-label="Élément" value={element?.id ?? ''} onchange={(e) => (elementChoisi = e.currentTarget.value)}>
            {#if !sort.elementRequis}<option value="">Sans élément</option>{/if}
            {#each sort.elements as el (el.id)}<option value={el.id}>{el.nom}</option>{/each}
          </select>
        {/if}
        <span class="cout" data-testid="cout-sort">{coutSort && 'texte' in coutSort ? coutSort.texte : (coutSort?.refus ?? '')}</span>
        {#if sort.limite !== 'volonte'}<span class="aide">{sort.limite.replace('1x', '1×')}</span>{/if}
      </div>
      <p class="aide">{texteCiblage(ciblage)}</p>
      {#if sort.manuel}<p class="aide">Au MJ : {sort.manuel}</p>{/if}
      <div class="boutons">
        {#if ciblage.type === 'creature' || ciblage.clicCase}
          <button aria-pressed={viseEnCours} disabled={!monTour || !carte} onclick={() => (viseEnCours = !viseEnCours)}>{viseEnCours ? 'Fermer la visée' : 'Viser sur la carte'}</button>
        {/if}
        <button
          class="lancer"
          disabled={occupe || !monTour || agit !== 'oui' || actionPrise || dejaServi || !coutSort || 'refus' in coutSort || !viseeComplete(ciblage, visee) || aPlacer.length > 0}
          onclick={lancerLeSort}>Lancer {sort.nom}</button
        >
      </div>
      {#if viseEnCours}<p class="aide" role="status">{ciblage.clicCase ? 'Clique la case visée sur la carte.' : `Clique ${ciblage.nbCibles > 1 ? `jusqu’à ${ciblage.nbCibles} cibles` : 'ta cible'} sur la carte.`}</p>{/if}
      {#if visee.cibles.length || visee.point}
        <p class="aide" data-testid="visee"
          >Visée : {[...visee.cibles.map(nomDe), visee.point ? `case ${visee.point.cx + 1}, ${visee.point.cy + 1}` : ''].filter(Boolean).join(', ')}
          <button class="lien" onclick={() => (visee = { cibles: [], point: null })}>effacer</button></p
        >
      {/if}
      {#if monTour && actionPrise}<p class="aide">{sort.typeAction === 'principale' ? 'Action principale' : 'Action secondaire'} prise ce tour.</p>{/if}
      {#if dejaServi}<p class="aide">{sort.nom} a déjà servi.</p>{/if}
      {#if aPlacer.length}<p class="alerte" role="status">Place {aPlacer[0]!.nom} : clique la case d’arrivée ({aPlacer[0]!.cases} cases au plus).</p>{/if}
    {:else}
      <p class="aide">{fiche.schemaVersion === 2 ? 'Aucun sort ni capacité à lancer.' : 'Les sorts se lancent depuis une fiche de la refonte.'}</p>
    {/if}
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
  .etats {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 13px;
  }
  .lien {
    background: none;
    border: none;
    padding: 0;
    min-height: 0;
    color: var(--couleur-accent);
    text-decoration: underline;
    font-size: 12px;
  }
  .cibles3 {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 12px;
    font-size: 13px;
    border: 1px solid var(--couleur-bordure-douce);
    border-radius: 8px;
  }
  .poser {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .poser input {
    width: 64px;
  }
  .subir {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .subir input {
    width: 90px;
  }
  .sorts {
    flex-basis: 340px;
  }
  .reglages {
    display: flex;
    flex-wrap: wrap;
    gap: 6px 10px;
    align-items: center;
    font-size: 13px;
  }
  .reglages label {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 4px;
  }
  .cout {
    font-weight: 700;
  }
  .lancer {
    background: var(--couleur-accent);
    color: var(--couleur-sur-accent);
  }
  .message {
    width: 100%;
    padding: 10px 16px 12px;
  }
</style>
