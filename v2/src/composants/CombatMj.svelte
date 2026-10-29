<script lang="ts">
  import { onDestroy } from 'svelte';
  import { debutDeTour, remettreJetsDeMort } from '../lib/actions/attaques';
  import { payerDebutDeTour, retirerInvocations } from '../lib/actions/invocations';
  import { remousDu } from '../lib/combat/invocations';
  import { jouerCapaciteMonstre, jouerCurees } from '../lib/actions/monstres';
  import { compterRoundsSurvecus, debutDeTourDemons, retourALaMer, sursaut } from '../lib/actions/demons';
  import { envoyerButin } from '../lib/actions/rencontres';
  import { airsVicies, estDemon, roundSurvecu, sursautPossible, traitsDemon, USAGE_SURSAUT } from '../lib/combat/demons';
  import { capacitesDuMonstre, ciblesDeZone, cureesApresChute } from '../lib/combat/monstres';
  import { zonesDuDebutDeTour } from '../lib/actions/zones';
  import { suivreZonesCombat } from '../lib/magasins/zones.svelte';
  import type { ZoneSol } from '../lib/schemas/zones';
  import { marquerMort } from '../lib/actions/carte';
  import { ajouterCombattant, basculerPortees, cloreCombat, demarrerCombat, donnerLaMain, finirTour, RefusCombat } from '../lib/actions/combat';
  import { messageErreurJournal } from '../lib/actions/journal';
  import { brouillonDuCombat, manquePourDemarrer, monstrePourCombat, type BrouillonCombattant, type FichePourCombat, type MonstrePourCombat } from '../lib/combat/demarrage';
  import { jetsDeMortARemettre } from '../lib/combat/mort';
  import { jaugesALaFinDuCombat, jaugesAuDebutDuCombat } from '../lib/combat/ressources';
  import { aTerreDuCombat, premierActif } from '../lib/combat/ordre';
  import { vueFiche } from '../lib/fiche/vue-fiche';
  import type { CollectionSuivie, DocumentSuivi } from '../lib/firebase/suivre.svelte';
  import { suivreArmuresMonstres, suivreBestiaire } from '../lib/magasins/bestiaire.svelte';
  import { suivreJetons, suivreTable } from '../lib/magasins/carte.svelte';
  import { suivreCombat, suivreCombattants, suivreRemous } from '../lib/magasins/combat.svelte';
  import { dechirure, offrirMontees } from '../lib/actions/remous';
  import { palierDe } from '../lib/combat/remous';
  import type { Remous } from '../lib/schemas/remous';
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
   *
   * Lot L6.3 (décisions de Thomas du 23/10/2026) : au démarrage, une
   * ressource qui repart à chaque combat reprend sa valeur (Ki) ; à la
   * clôture, la Plongée revient à 0 (9a). Quand la main arrive à un
   * combattant, le client du MJ joue ses dégâts par tour, une fois (6a).
   *
   * Lot L6.4b1 (7a, 11a) : quand la main arrive à un combattant, le client du MJ
   * joue les zones du combat sur sa case (Tempête, Ossuaire, sol en feu).
   *
   * Lot L6.4b2 (2a, 15a, 9a) : quand la main arrive à un mage, le client du
   * MJ lui fait payer en PP le maintien de sa concentration et le Remous de
   * ses invocations ; une invocation à 0 PV retourne à la Mer ; à la
   * clôture, les jetons des invocations s'en vont.
   *
   * Lot L6.6a (9a) : un monstre tombe : Curée, d'office, pour ceux de sa
   * famille qui l'ont.
   *
   * Lot L6.6b (décisions de Thomas du 29/10/2026) : les démons : au début
   * d'un tour, la fin d'un Sursaut, la Repousse (5a), l'Air vicié (8a) ;
   * Dernier souffle quand l'un tombe (8a) ; les rounds survécus (1a). À
   * la clôture, le butin prévu de la rencontre part au vote, sauf si le
   * MJ décoche (12a).
   *
   * Lot L6.7a (4a) : la main arrive à un monstre qui a une aura (Attrait de
   * Celle-qu'on-suit, Lenteur de La Lente) : elle se joue d'office, sans
   * action, sur ce que son rayon prend.
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
  let suivi = $state<{ c: DocumentSuivi<Combat>; m: CollectionSuivie<Combattant>; z: CollectionSuivie<ZoneSol> } | null>(null);
  $effect(() => {
    if (!idCombat) return;
    const x = { c: suivreCombat(session.table, idCombat), m: suivreCombattants(session.table, idCombat), z: suivreZonesCombat(session.table, idCombat) };
    suivi = x;
    return () => {
      x.c.arreter();
      x.m.arreter();
      x.z.arreter();
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
      bestiaire.etat.elements.map((m) => [m.id, monstrePourCombat(m, reductions)]),
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
    const remises = persos.etat.elements.filter((p) => brouillon.some((b) => b.perso === p.id)).map((p) => ({ perso: p.id, jauges: jaugesAuDebutDuCombat(p) }));
    const ok = await agir(() => demarrerCombat({ nom: nomSaisi ?? rencontre?.nom ?? 'Combat', scene, rencontre: rencontre?.id ?? null, combattants: brouillon }, idCombat, Math.random, remises));
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
  // L6.6b (12a) : le butin prévu de la rencontre, pas encore parti : il part au vote à la clôture, sauf si le MJ décoche.
  const butinEnAttente = $derived(rencontreDuCombat && rencontreDuCombat.butin.length && rencontreDuCombat.butinEnvoyeLe === null ? rencontreDuCombat : null);
  let envoyerLeButin = $state(true);
  async function clore() {
    const butin = butinEnAttente && envoyerLeButin ? butinEnAttente : null;
    if (!idCombat || !confirm(`Clore le combat ? L’ordre d’initiative sera effacé.${butin ? ' Le butin part au vote.' : ''}`)) return;
    const id = idCombat;
    const remises = persos.etat.elements.filter((p) => combattants.some((c) => c.perso === p.id)).map((p) => ({ perso: p.id, jauges: jaugesALaFinDuCombat(p) }));
    const invocations = combat ? { scene: combat.scene, ids: combattants.filter((c) => c.genre === 'invocation').map((c) => c.id) } : null;
    await agir(async () => {
      await cloreCombat(id, remises, invocations);
      if (butin) await envoyerButin(butin.id, butin);
    });
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
  // L6.6a (9a) : un monstre que ce client a vu debout tombe : Curée pour ceux de sa famille, une fois par chute.
  // (Un rechargement ne rejoue pas les chutes passées : il ne les a pas vues debout.)
  const vusDebout = new Set<string>();
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours') return;
    const tombes = combattants.filter((c) => c.genre === 'monstre' && c.aTerre && vusDebout.has(c.id));
    for (const c of combattants) if (c.genre === 'monstre' && !c.aTerre) vusDebout.add(c.id);
    if (!tombes.length) return;
    for (const c of tombes) vusDebout.delete(c.id);
    const id = idCombat;
    const parId = new Map(bestiaire.etat.elements.map((m) => [m.id, m]));
    const tous = combattants;
    // L6.6b (11a) : un démon tombé retourne à la Mer, sauf s'il se relève pour son Dernier souffle.
    const alaMer = tombes.filter((t) => estDemon(t.monstre ? parId.get(t.monstre) : undefined) && !sursautPossible(t, traitsDe(t)!));
    agir(async () => {
      await retourALaMer(alaMer);
      for (const t of tombes) await jouerCurees(id, t, cureesApresChute(t, tous, parId));
    });
  });
  // ---- L6.6b : les démons ----
  const traitsParModele = $derived(new Map(bestiaire.etat.elements.map((m) => [m.id, traitsDemon(m)])));
  // Un monstre ordinaire a des traits vides : rien ne s'y joue.
  const traitsDe = (c: { monstre: string | null; genre: string }) => (c.genre === 'monstre' && c.monstre ? (traitsParModele.get(c.monstre) ?? null) : null);
  // 5a, 8a : la main arrive à un combattant : la fin d'un Sursaut, la Repousse, l'Air vicié ; une fois par tour.
  const debutsDemons = new Set<string>();
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours' || !combat.actif || !jetonsSuivis) return;
    const c = combattants.find((x) => x.id === combat.actif);
    const cle = `${combat.tour}:${combat.actif}`;
    if (!c || debutsDemons.has(cle)) return;
    const t = traitsDe(c);
    const jetons = jetonsSuivis.etat.elements;
    const aFaire = (c.genre === 'monstre' && c.usages[USAGE_SURSAUT] !== undefined && !c.aTerre) || (!!t?.repousse && !c.aTerre) || airsVicies(c, combattants, traitsDe, jetons).length > 0;
    if (!aFaire) return;
    debutsDemons.add(cle);
    const id = idCombat;
    const tous = combattants;
    const fichesPj = new Map(persos.etat.elements.map((p) => [p.id, p]));
    agir(() => debutDeTourDemons(id, c, tous, traitsDe, fichesPj, jetons));
  });
  // L6.7a (4a) : la main arrive à un monstre qui a une aura : elle se joue d'office sur ce que son rayon prend, sans action ; une fois par tour.
  const aurasJouees = new Set<string>();
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours' || !combat.actif || !jetonsSuivis) return;
    const c = combattants.find((x) => x.id === combat.actif);
    const cle = `${combat.tour}:${combat.actif}`;
    const modele = c?.genre === 'monstre' && c.monstre ? bestiaire.etat.elements.find((m) => m.id === c.monstre) : undefined;
    if (!c || !modele || c.aTerre || aurasJouees.has(cle)) return;
    const jetons = jetonsSuivis.etat.elements;
    const auras = capacitesDuMonstre(modele).capacites.flatMap((cap) => {
      const cibles = cap.aura && cap.zone ? ciblesDeZone(c, cap.zone, combattants, jetons) : [];
      return cibles.length ? [{ cap, cibles }] : [];
    });
    if (!auras.length) return;
    aurasJouees.add(cle);
    const id = idCombat;
    const k = combat;
    const ctx = { combattants, fiches: new Map(persos.etat.elements.map((p) => [p.id, p])), carte: null, demon: traitsDe(c) };
    agir(async () => {
      for (const a of auras) await jouerCapaciteMonstre(id, k, c, a.cap, a.cibles, ctx);
    });
  });
  // 8a : Dernier souffle : un démon tombe, son berserk au seuil : il se relève pour un dernier tour.
  const sursauts = new Set<string>();
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours') return;
    const prets = combattants.filter((c) => !sursauts.has(c.id) && c.genre === 'monstre' && traitsDe(c) && sursautPossible(c, traitsDe(c)!));
    if (!prets.length) return;
    for (const c of prets) sursauts.add(c.id);
    const id = idCombat;
    const k = combat;
    agir(async () => {
      for (const c of prets) await sursaut(id, k, c);
    });
  });
  // 1a : un round commence : les démons debout qui se nourrissent de rounds survécus en comptent un, une fois.
  const roundsComptes = new Set<number>();
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours' || roundsComptes.has(combat.round)) return;
    const maj = combattants.flatMap((c) => {
      const t = traitsDe(c);
      const usages = t ? roundSurvecu(c, t, combat.round) : null;
      return usages ? [{ c, usages }] : [];
    });
    if (!maj.length) return;
    roundsComptes.add(combat.round);
    const id = idCombat;
    agir(() => compterRoundsSurvecus(id, maj));
  });
  // ---- L6.7b : le Remous du lieu du combat ----
  let remousSuivi = $state<DocumentSuivi<Remous> | null>(null);
  $effect(() => {
    const scene = combat?.scene;
    if (!scene) return;
    const s = suivreRemous(session.table, scene);
    remousSuivi = s;
    return () => {
      s.arreter();
      remousSuivi = null;
    };
  });
  const palierRemous = $derived(palierDe(remousSuivi?.etat.donnees ?? null));
  // Seul un monstre a un modèle au bestiaire.
  const demonDuBestiaire = (c: { monstre: string | null }) => estDemon(c.monstre ? bestiaire.etat.elements.find((m) => m.id === c.monstre) : undefined);
  // 8a : un round que ce client voit commencer : la Déchirure du palier, sur tout le lieu sauf les démons. (Ni le premier round, ni un rechargement.)
  let roundVu: { combat: string; round: number } | null = null;
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours' || !remousSuivi?.etat.pret) return;
    const avant = roundVu;
    roundVu = { combat: idCombat, round: combat.round };
    const formule = palierRemous.dechirure;
    if (!formule || !avant || avant.combat !== idCombat || combat.round <= avant.round) return;
    const id = idCombat;
    const tous = combattants;
    const fichesPj = new Map(persos.etat.elements.map((p) => [p.id, p]));
    agir(() => dechirure(id, formule, tous, demonDuBestiaire, fichesPj));
  });
  // 8a : le Remous que ce client voit franchir un palier (2 et plus) : les démons debout qui ont où monter se le voient offrir (seuls les démons ont des paliers suivants).
  let palierVu: { combat: string; palier: number } | null = null;
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours' || !remousSuivi?.etat.pret) return;
    const avant = palierVu;
    const n = palierRemous.palier;
    palierVu = { combat: idCombat, palier: n };
    if (!avant || avant.combat !== idCombat || n <= avant.palier || n < 2) return;
    const demons = combattants.filter((c) => !c.aTerre && !c.mort && (traitsDe(c)?.paliersSuivants.length ?? 0) > 0);
    const id = idCombat;
    agir(() => offrirMontees(id, demons));
  });
  /*
   * L6.3 (6a) : la main arrive à un combattant : ses dégâts par tour, une
   * fois par tour.
   *
   * Correctif du 29/10/2026 : le début de tour se note même quand il n'y a
   * rien à jouer. `debutTour` ne sert plus seulement aux dégâts : depuis
   * L6.5b (7a) c'est lui qui rend la réaction du round
   * (`reactionDisponible` : `usages.reaction < debutTour`). Tant qu'on ne
   * l'écrivait que pour qui saigne ou paie une concentration, il restait à
   * 0, et la réaction d'un combattant ordinaire était perdue pour tout le
   * reste du combat. NE PAS remettre de condition sur `degatsParTour` ici.
   */
  const debutsJoues = new Set<string>();
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours' || !combat.actif) return;
    const c = combattants.find((x) => x.id === combat.actif);
    const cle = `${combat.tour}:${combat.actif}`;
    // L6.4b2 (2a, 15a) : un mage paie aussi le maintien de sa concentration et le Remous de ses invocations.
    const aPayer = !!c?.concentration?.maintien || (!!c && remousDu(combattants, c.id) > 0);
    if (!c || c.debutTour === combat.tour || debutsJoues.has(cle)) return;
    debutsJoues.add(cle);
    const fiche = c.perso ? (persos.etat.elements.find((p) => p.id === c.perso) ?? null) : null;
    const id = idCombat;
    const scene = combat.scene;
    const tous = combattants;
    agir(async () => {
      if (aPayer) await payerDebutDeTour(id, scene, c, fiche, tous);
      await debutDeTour(id, combat, c, fiche);
    });
  });
  // L6.4b2 (9a) : une invocation à 0 PV retourne à la Mer.
  const invocationsRetirees = new Set<string>();
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours') return;
    const tombees = combattants.filter((c) => c.genre === 'invocation' && c.aTerre && !invocationsRetirees.has(c.id));
    if (!tombees.length) return;
    for (const c of tombees) invocationsRetirees.add(c.id);
    const id = idCombat;
    const scene = combat.scene;
    // Si elle tenait la main, son tour finit d'abord : sinon `actif`
    // montrerait un combattant retiré, et plus personne ne pourrait jouer.
    const actif = combat.actif;
    const tous = combattants;
    const sienne = !!actif && tombees.some((c) => c.id === actif);
    agir(async () => {
      if (sienne) await finirTour(id, actif, tous, aTerre);
      await retirerInvocations(id, scene, tombees, 'à 0 PV, elles retournent à la Mer', 'MJ');
    });
  });
  // L6.4b1 (7a, 11a) : la main arrive à un combattant : les zones sur sa case agissent, une fois par tour.
  const zonesJouees = new Set<string>();
  $effect(() => {
    if (!combat || !idCombat || combat.statut !== 'encours' || !combat.actif || !suivi?.z.etat.elements.length) return;
    const cle = `${combat.tour}:${combat.actif}`;
    if (zonesJouees.has(cle)) return;
    zonesJouees.add(cle);
    const id = idCombat;
    const fiches = new Map(persos.etat.elements.map((p) => [p.id, p]));
    const jetons = jetonsSuivis?.etat.elements ?? [];
    const actif = combat.actif;
    agir(() => zonesDuDebutDeTour({ lieu: { combat: id }, zones: suivi!.z.etat.elements, jetons, combat: { id, tour: combat.tour }, combattants, fiches, auteur: 'MJ' }, actif));
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
      {#if butinEnAttente}
        <label class="case"><input type="checkbox" bind:checked={envoyerLeButin} /> Envoyer le butin au vote à la clôture ({butinEnAttente.butin.length} objet{butinEnAttente.butin.length > 1 ? 's' : ''})</label>
      {/if}
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
