import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Création, montée de niveau, conversion et octrois de la refonte (lot
 * L4.11b1), en fonctions pures et à travers un faux SDK Firestore.
 * Décisions de Thomas du 21/10/2026 : 4a, 5a, 6a, 7a, 10a, 11a, 12a.
 *
 * Garde-fou principal, comme pour la montée v1 : monter d'un niveau donne
 * EXACTEMENT le personnage qu'on aurait créé à ce niveau avec les mêmes
 * choix et les mêmes dés, pour les cinq classes refondues et toutes les
 * races.
 */

const appels: { fn: string; chemin: string; donnees: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ chemin: p.join('/') }),
  updateDoc: async (r: { chemin: string }, donnees: unknown) => { appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees }); },
  deleteField: () => '<supprimer>',
  runTransaction: async (_db: unknown, f: (tx: unknown) => Promise<unknown>) => {
    const ecritures: typeof appels = [];
    const tx = {
      get: async (r: { chemin: string }) => ({ exists: () => base.has(r.chemin), data: () => structuredClone(base.get(r.chemin)) }),
      update: (r: { chemin: string }, donnees: unknown) => { ecritures.push({ fn: 'tx.update', chemin: r.chemin, donnees }); },
    };
    const r = await f(tx); // une exception annule tout : rien n'est écrit
    appels.push(...ecritures);
    return r;
  },
}));

const { session } = await import('../../src/lib/session.svelte');
const C = await import('../../src/lib/regles/creation');
const R = await import('../../src/lib/fiche/refonte');
const K = await import('../../src/lib/fiche/creation-refonte');
const M = await import('../../src/lib/fiche/montee-refonte');
const { monterNiveauRefonte } = await import('../../src/lib/actions/montee');
const A = await import('../../src/lib/actions/refonte');
const { constantes } = await import('../../src/lib/regles/donnees');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { cransRequis } = await import('../../src/lib/regles/progression');
const { octroisVierges, schemaFicheV2 } = await import('../../src/lib/schemas/fiche');
const { classeParId } = await import('../../src/regles');
type Brouillon = import('../../src/lib/regles/creation').Brouillon;
type FicheV1 = import('../../src/lib/schemas/fiche').FicheV1;
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type RefonteFiche = import('../../src/lib/schemas/fiche').RefonteFiche;
type MonteeRefonte = import('../../src/lib/fiche/montee-refonte').MonteeRefonte;
type ContexteRefonte = import('../../src/lib/fiche/refonte').ContexteRefonte;
type ClasseRefonte = import('../../src/lib/schemas/classes').ClasseRefonte;
type ChampDeChoix = import('../../src/lib/fiche/refonte').ChampDeChoix;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forme v1 non typée
const FICHES: any[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, patch: Partial<FicheV1> = {}): FicheV1 => ({ ...ficheDepuisV1(FICHES.find((f) => f.nom.startsWith(nom)), 'u', 1).fiche, ...patch });
const classe = (id: string) => classeParId.get(id)!;
const des = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length]!;
};
const DONS = ['robuste', 'alerte', 'chanceux', 'endurant'];
const REFONDUES = Object.keys(R.CLASSE_REFONTE);

/** Les gestes de la refonte sur un état (brouillon de création ou montée). */
interface Gestes<T> {
  r: (x: T) => RefonteFiche;
  ctx: (x: T) => ContexteRefonte;
  classe: (x: T) => ClasseRefonte;
  b: (x: T) => Brouillon;
  rang: (x: T, voie: string) => T;
  offrir: (x: T, voie: string) => T;
  poser: <K extends ChampDeChoix>(x: T, champ: K, v: RefonteFiche[K]) => T;
  mineur: (x: T, id: string) => T;
  race: (x: T, rang: number, o: string) => T;
  variante: (x: T, c: string) => T;
  don: (x: T, d: string) => T;
}

const gestesCreation: Gestes<Brouillon> = {
  r: (b) => K.refonteDuBrouillon(b)!,
  ctx: (b) => K.contexteDuBrouillon(b, K.classeDuBrouillon(b)!),
  classe: (b) => K.classeDuBrouillon(b)!,
  b: (b) => b,
  rang: (b, v) => K.gesteRefonte(b, (c, r, ctx) => R.prendreRang(c, r, ctx, v)),
  offrir: (b, v) => K.gesteRefonte(b, (c, r, ctx) => R.offrirRang(c, r, ctx, v)),
  poser: (b, k, v) => K.gesteRefonte(b, (_c, r) => R.poserChoix(r, k, v)),
  mineur: (b, id) => K.gesteRefonte(b, (c, r, ctx) => R.basculerMineur(c, r, ctx, id)),
  race: C.choisirOptionRaciale,
  variante: C.choisirVariante,
  don: (b, d) => C.prendreDon(b, d),
};

const gestesMontee: Gestes<MonteeRefonte> = {
  r: (m) => m.r,
  ctx: M.contexteMontee,
  classe: (m) => classe(m.avant.refonte.classe),
  b: (m) => m.b,
  rang: M.prendreRang,
  offrir: M.offrirRang,
  poser: M.poserChoix,
  mineur: M.basculerMineur,
  race: M.choisirOptionRaciale,
  variante: M.choisirVariante,
  don: (m, d) => M.prendreDon(m, d),
};

/** Remplit les choix avec les premières options : race, dons, école, élément, rangs dans l'ordre des voies, Polyvalence, puis ce que les voies demandent. */
function premiersChoix<T>(x: T, g: Gestes<T>): T {
  const b = () => g.b(x);
  for (const [rang, options] of C.choixRaciauxRequis(b())) if (!b().capacitesRaceChoix[String(rang)]) x = g.race(x, rang, options[0]!);
  if (C.varianteRequise(b()) && !b().raceVariante) x = g.variante(x, 'aetharion');
  while (b().dons.length < C.donsRequis(b())) x = g.don(x, DONS.find((d) => !b().dons.includes(d))!);
  const c = g.classe(x);
  if (c.creation.ecoles.length && !g.r(x).ecole) x = g.poser(x, 'ecole', c.creation.ecoles[0]!);
  if (c.creation.elements && !g.r(x).elementDepart) x = g.poser(x, 'elementDepart', c.creation.elements[0]!);
  for (const voie of c.voies) {
    for (;;) {
      try {
        x = g.rang(x, voie);
      } catch {
        break;
      }
    }
  }
  if (R.polyvalence(g.ctx(x)) && !g.r(x).rangOffert) {
    const voie = c.voies.find((v) => !v.endsWith('.chaos') && (g.r(x).rangs[v] ?? 0) < 5)!;
    x = g.offrir(x, voie);
  }
  const erreurs = () => R.erreursRefonte(c, g.r(x), g.ctx(x));
  if (erreurs().some((e) => e.startsWith('Choisis un second élément'))) x = g.poser(x, 'secondElement', c.creation.elementsSecond.find((e) => e !== g.r(x).elementDepart)!);
  if (erreurs().some((e) => e.startsWith('Choisis lequel'))) x = g.poser(x, 'elementMaitre', g.r(x).elementDepart);
  const carac = erreurs().find((e) => e.startsWith('Choisis la caractéristique'));
  if (carac) x = g.poser(x, 'caracEnPlus', carac.split(': ')[1]!.split(',')[0]!.replace('.', '').trim() as RefonteFiche['caracEnPlus']);
  for (const id of c.mineurs.liste) {
    if (g.r(x).mineurs.length >= R.profilDe(c, g.r(x), g.ctx(x)).mineursMax) break;
    if (!g.r(x).mineurs.includes(id)) x = g.mineur(x, id);
  }
  if (erreurs().some((e) => e.startsWith('Répertoire'))) x = g.poser(x, 'mineurPalierII', g.r(x).mineurs[0]!);
  return x;
}

/** Personnage de la refonte créé par l'assistant, barre pleine. */
function cree(classeV1: string, race: string, niveau: number, jet = 0.5): FicheV2 {
  let b = C.changerNiveau({ ...C.brouillonVide(), nom: `${classeV1} ${race}`, classe: classeV1, race, caracsLibres: { DEX: 3, CON: 3 } }, niveau);
  while (b.jetsPV.length < niveau - 1) b = C.lancerJetPV(b, des(jet));
  b = premiersChoix(b, gestesCreation);
  const f = K.ficheV2DepuisBrouillon(b, 'alice', 1);
  return { ...f, progression: { crans: cransRequis(niveau) ?? 0 } };
}

/** Montée complète, choix automatiques. */
function monter(f: FicheV2, jet = 0.5): MonteeRefonte {
  return premiersChoix(M.lancerPV(M.ouvrirMonteeRefonte(f), des(jet)), gestesMontee);
}

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'alice';
});

describe('création (10a) : une classe refondue crée une fiche de la refonte', () => {
  it('le brouillon porte le bloc refonte de sa classe ; changer de classe l’efface ; une classe non refondue reste en v1', () => {
    const b = { ...C.brouillonVide(), classe: 'magicien', race: 'humain' };
    expect(K.refonteDuBrouillon(b)).toEqual(R.refonteVierge(classe('magicien'), 1));
    const avec = K.gesteRefonte(b, (_c, r) => R.poserChoix(r, 'ecole', 'evocation'));
    expect(avec.refonte?.ecole).toBe('evocation');
    expect(C.choisirClasse(avec, 'barde').refonte).toBeNull();
    // Un bloc d'une autre classe (brouillon gardé avant un changement) ne compte pas.
    expect(K.refonteDuBrouillon({ ...avec, classe: 'enchanteur' })).toEqual(R.refonteVierge(classe('envouteur'), 1));
    // Depuis L4.17, les dix classes sont refondues : une classe inconnue tient lieu de classe non refondue.
    const necro = { ...C.brouillonVide(), classe: 'inconnue' };
    expect(K.refonteDuBrouillon(necro)).toBeNull();
    expect(K.erreursCreationRefonte(necro)).toEqual(C.erreursCreation(necro));
    expect(() => K.gesteRefonte(necro, (_c, r) => r)).toThrow('pas encore passée à la refonte');
    expect(() => K.ficheV2DepuisBrouillon(necro, 'alice', 1)).toThrow('pas encore passée à la refonte');
  });

  it('les erreurs de l’assistant, puis celles de la refonte ; voies, sorts et Cercle v1 ne comptent plus', () => {
    let b: Brouillon = { ...C.brouillonVide(), nom: 'Ilyra', classe: 'magicien', race: 'humain', caracsLibres: { INT: 3, CON: 3 } };
    expect(K.erreursCreationRefonte(b)).toEqual(['Choisis une école : evocation, abjuration, invocation.', 'Choisis un élément de départ : feu, glace, terre, eau, electricite.']);
    // Des choix v1 restés dans le brouillon (reprise d'une fiche v1) sont ignorés à la création.
    b = { ...b, capacites: [{ id: 'magicien.magie-universitaire.1' }], sorts: ['projectile_magique'] };
    b = premiersChoix(b, gestesCreation);
    expect(K.erreursCreationRefonte(b)).toEqual([]);
    const f = K.ficheV2DepuisBrouillon(b, 'alice', 7);
    expect(f).toMatchObject({ schemaVersion: 2, classe: 'magicien', nom: 'Ilyra', proprietaireUid: 'alice', creeLe: 7, octrois: octroisVierges() });
    expect(f.refonte).toMatchObject({ classe: 'magicien', ecole: 'evocation', elementDepart: 'feu', rangs: { 'magicien.ecole': 2 } });
    expect(f.refonte.mineurs).toHaveLength(2);
    expect('capacites' in f || 'grimoireSortsConnus' in f).toBe(false);
    expect(schemaFicheV2.parse(f)).toEqual(f);
    // Une Voie du chaos v1 restée dans le brouillon n'ouvre pas le chaos, et des voies v1 hors budget ne bloquent pas.
    const chaosV1 = { ...b, capacites: ['1', '2', '3', '4', '5'].map((r) => ({ id: `magicien.chaos.${r}` })) };
    expect(K.erreursCreationRefonte(chaosV1)).toEqual([]);
    expect(K.ficheV2DepuisBrouillon(chaosV1, 'alice', 7).octrois.chaos).toBe(false);
  });

  it('la Voie du chaos est fermée à la création (12a) ; un brouillon incomplet est refusé avec ses erreurs', () => {
    const b = premiersChoix<Brouillon>({ ...C.brouillonVide(), nom: 'Torg', classe: 'guerrier', race: 'nain', caracsLibres: { FOR: 3, CON: 3 } }, gestesCreation);
    expect(() => gestesCreation.rang(gestesCreation.poser(b, 'ecole', null), 'guerrier.chaos')).toThrow('accord du MJ');
    expect(() => K.ficheV2DepuisBrouillon({ ...b, nom: '' }, 'alice', 1)).toThrow('Donne un nom au personnage.');
    expect(() => K.ficheV2DepuisBrouillon({ ...b, refonte: { ...b.refonte!, rangs: { 'guerrier.soldat': 5 } } }, 'alice', 1)).toThrow('8 points de voie pour 2 au niveau 1.');
  });

  it('avertissements : ceux de la refonte (Polyvalence, points), pas ceux des voies v1', () => {
    const b = C.changerNiveau({ ...C.brouillonVide(), classe: 'guerrier', race: 'humain' }, 5);
    expect(K.avertissementsCreationRefonte(b)).toEqual(['Polyvalence : le rang offert reste à choisir.', '10 points de voie à dépenser.']);
    expect(K.avertissementsCreationRefonte({ ...C.brouillonVide(), classe: 'inconnue' })).toEqual(C.avertissementsCreation({ ...C.brouillonVide(), classe: 'inconnue' }));
  });

  it('reprise d’une fiche v1 en refonte : la Corruption d’Âme reprend la corruption majeure', () => {
    const b = premiersChoix<Brouillon>({ ...C.brouillonVide(), nom: 'Repris', classe: 'barde', race: 'humain', caracsLibres: { CHA: 3, DEX: 3 } }, gestesCreation);
    const reprise = { idImport: 'i', anciens: { capacites: [], capacitesRace: [], capacitesRaceChoix: {}, voiesHorsProfil: [], dons: [], donsChoix: {}, bonusCompetences: {} } };
    const report = {
      jetsRepris: 0, pvActuel: null, ppActuel: null, pointsCercle: {}, equipement: {}, inventaire: [], piecesOr: 3, piecesArgent: 0, piecesBronze: 0,
      corruptionMajeure: 2, mutations: null, contratDemoniaquePenalite: null, amesStockees: 0, sortsConnus: ['x'], sortsPrepares: [], modules: {}, notes: '', portrait: null,
    };
    const f = K.ficheV2DepuisBrouillon({ ...b, reprise: { ...reprise, report } }, 'alice', 1);
    expect(f.refonte.jauges.corruptionAme).toBe(2);
    expect(f.piecesOr).toBe(3);
    expect(f.refonte.jauges.inspiration).toBe(2);
    // Vécu (L4.18) : le nœud offert du Barde ; sans capacité v1 hors combat, rien à accorder.
    expect(f.vecu.noeudOffert).toBe('marchander');
    expect(f.octrois.vecuV1).toBeUndefined();
    // Avec l'Acrobate de la v1 (Spectacle 1) : le MJ aura Acrobate à accorder.
    const avecV1 = { ...reprise, anciens: { ...reprise.anciens, capacites: [{ voie: 'barde.spectacle', rang: 1 }] } };
    expect(K.ficheV2DepuisBrouillon({ ...b, reprise: { ...avecV1, report } }, 'alice', 1).octrois.vecuV1).toEqual(['acrobate']);
  });
});

describe('choix de magie : gestes', () => {
  const m = classe('magicien');
  const ctx: ContexteRefonte = { niveau: 1, race: 'humain', modMagie: 2, octrois: octroisVierges() };

  it('sorts mineurs : de la classe, dans la limite du niveau ; rendre celui du Répertoire efface ce choix', () => {
    let r = R.refonteVierge(m, 1);
    r = R.basculerMineur(m, r, ctx, 'mineur.lumiere');
    r = R.basculerMineur(m, r, ctx, 'mineur.main-du-mage');
    expect(r.mineurs).toEqual(['mineur.lumiere', 'mineur.main-du-mage']);
    expect(() => R.basculerMineur(m, r, ctx, 'mineur.trait-arcanique')).toThrow('2 sorts mineurs au plus à ce niveau.');
    expect(() => R.basculerMineur(m, r, ctx, 'mineur.pique-mentale')).toThrow('pas un sort de ta classe');
    expect(R.basculerMineur(m, r, { ...ctx, niveau: 5 }, 'mineur.trait-arcanique').mineurs).toHaveLength(3);
    const avecRepertoire = { ...r, mineurPalierII: 'mineur.lumiere' };
    expect(R.basculerMineur(m, avecRepertoire, ctx, 'mineur.lumiere')).toMatchObject({ mineurs: ['mineur.main-du-mage'], mineurPalierII: null });
    expect(R.basculerMineur(m, avecRepertoire, ctx, 'mineur.main-du-mage').mineurPalierII).toBe('mineur.lumiere');
  });

  it('variante d’un passif : un choix du palier I, null revient à l’effet de base', () => {
    const r = R.choisirVarianteAction(R.refonteVierge(m, 1), 'chaos.magicien.esprit-fissure', 'garde');
    expect(r.variantes).toEqual({ 'chaos.magicien.esprit-fissure': 'garde' });
    expect(R.choisirVarianteAction(r, 'chaos.magicien.esprit-fissure', null).variantes).toEqual({});
    expect(() => R.choisirVarianteAction(r, 'chaos.magicien.esprit-fissure', 'inconnue')).toThrow('n’existe pas');
    expect(() => R.choisirVarianteAction(r, 'evocation.missile', 'garde')).toThrow('n’existe pas');
  });

  it('variantesAChoisir : les passifs du profil qui offrent un choix permanent', () => {
    const ouvert = { ...ctx, niveau: 8, octrois: { ...octroisVierges(), chaos: true } };
    const sans = { ...R.refonteVierge(m, 8), ecole: 'evocation', elementDepart: 'feu' as const };
    expect(R.variantesAChoisir(m, sans, ouvert)).toEqual([]);
    const ids = (r: RefonteFiche) => R.variantesAChoisir(m, r, ouvert).map((a) => a.id);
    const rangs = Array.from({ length: 5 }, (_, i) => i + 1).find((n) => ids({ ...sans, rangs: { 'magicien.chaos': n } }).length > 0);
    expect(rangs).toBeDefined();
    expect(ids({ ...sans, rangs: { 'magicien.chaos': rangs! } })).toEqual(['chaos.magicien.esprit-fissure']);
  });
});

describe('montée de la refonte (11a) = création directe au niveau suivant', () => {
  const cas = REFONDUES.flatMap((c) => constantes.ordreRaces.flatMap((r) => [1, 2, 3, 4, 6, 8].map((n) => [c, r, n] as const)));
  it.each(cas)('%s %s, niveau %i → suivant', (classeV1, race, niveau) => {
    const avant = cree(classeV1, race, niveau);
    const m = monter(avant);
    expect(M.erreursMontee(m)).toEqual([]);
    const { fiche } = M.appliquerMonteeRefonte(avant, m);
    const direct = K.ficheV2DepuisBrouillon({ ...m.b, refonte: m.r, jetsPV: fiche.pvHistorique.map((j) => j.jet as number) }, 'alice', 1);
    expect(fiche.niveau).toBe(niveau + 1);
    expect(fiche.pvMax).toBe(direct.pvMax);
    expect(fiche.ppActuel).toBe(direct.ppActuel);
    expect(fiche.capacitesRace).toEqual(direct.capacitesRace);
    expect(fiche.refonte).toEqual(direct.refonte);
    expect(fiche.progression.crans).toBe(0);
  });
});

describe('montée : ouvrir, verrous, jauges', () => {
  it('fiche v1, barre pas pleine, niveau 12 : refusé, avec la raison', () => {
    expect(() => M.ouvrirMonteeRefonte(reelle('Karlach'))).toThrow('pas passé à la refonte');
    const f = cree('guerrier', 'nain', 3);
    expect(() => M.ouvrirMonteeRefonte({ ...f, progression: { crans: 1 } })).toThrow('Il manque 2 cran(s)');
    expect(() => M.ouvrirMonteeRefonte({ ...f, niveau: 12 })).toThrow('Niveau maximum atteint.');
  });

  it('un rang acquis ne se retire pas, un rang de ce niveau si ; le dé de vie une seule fois', () => {
    const f = cree('guerrier', 'nain', 3);
    let m = M.lancerPV(M.ouvrirMonteeRefonte(f), des(0.5));
    expect(() => M.lancerPV(m)).toThrow('déjà lancé');
    expect(() => M.retirerRang(m, 'guerrier.soldat')).toThrow('Ce rang est acquis : un choix fait ne se reprend pas');
    m = M.prendreRang(m, 'guerrier.ingenieur');
    expect(M.nouveautes(m).rangs).toEqual([{ voie: 'guerrier.ingenieur', de: 0, a: 1 }]);
    m = M.retirerRang(m, 'guerrier.ingenieur');
    expect(m.r.rangs['guerrier.ingenieur']).toBeUndefined();
  });

  it('choix figés : école, élément, sorts mineurs acquis ; un choix encore vide se fait à la montée', () => {
    const f = cree('magicien', 'humain', 4);
    let m = M.lancerPV(M.ouvrirMonteeRefonte(f), des(0.5));
    expect(() => M.poserChoix(m, 'ecole', 'abjuration')).toThrow('Ce choix est fait');
    expect(() => M.basculerMineur(m, f.refonte.mineurs[0]!)).toThrow('Ce sort mineur est acquis');
    // Niveau 5 : un sort mineur de plus (plusUnAuNiveau).
    expect(M.avertissementsMontee(m)).toContain('1 sort mineur encore à choisir.');
    const libre = classe('magicien').mineurs.liste.find((x) => !f.refonte.mineurs.includes(x))!;
    m = M.basculerMineur(m, libre);
    expect(M.nouveautes(m).mineurs).toEqual([libre]);
    m = M.basculerMineur(m, libre);
    expect(m.r.mineurs).toEqual(f.refonte.mineurs);
    // Le second élément vient avec la Voie élémentaire : vide jusque-là, il se pose à la montée qui l'apporte.
    const sansSecond = { ...f, refonte: { ...f.refonte, secondElement: null } };
    expect(M.poserChoix(M.ouvrirMonteeRefonte(sansSecond), 'secondElement', 'glace').r.secondElement).toBe('glace');
    const avecVariante = { ...f, refonte: { ...f.refonte, variantes: { 'chaos.magicien.esprit-fissure': 'garde' } } };
    expect(() => M.choisirVarianteAction(M.ouvrirMonteeRefonte(avecVariante), 'chaos.magicien.esprit-fissure', null)).toThrow('Ce choix est fait');
  });

  it('la Voie du chaos se prend à la montée si le MJ l’a ouverte (12a)', () => {
    const f = cree('guerrier', 'nain', 3);
    expect(() => M.prendreRang(M.ouvrirMonteeRefonte(f), 'guerrier.chaos')).toThrow('accord du MJ');
    const ouverte = { ...f, octrois: { ...f.octrois, chaos: true } };
    expect(M.prendreRang(M.ouvrirMonteeRefonte(ouverte), 'guerrier.chaos').r.rangs['guerrier.chaos']).toBe(1);
  });

  it('dons et choix raciaux acquis : figés', () => {
    const f = cree('barde', 'elfe', 6);
    const m = M.ouvrirMonteeRefonte(f);
    expect(() => M.retirerDon(m, f.dons[0]!)).toThrow('Ce don est acquis');
    expect(() => M.choisirVariante(m, 'aelindra')).toThrow('La nation est choisie');
    expect(() => M.choisirOptionRaciale({ ...m, avant: { ...m.avant, capacitesRaceChoix: { '3': 'DEX' } } }, 3, 'FOR')).toThrow('Ce choix racial est fait');
  });

  it('jauges : chaque réserve gagne l’écart de son maximum, sans rendre ce qui a été dépensé', () => {
    const g = classe('guerrier');
    const j = { endurance: 1, inspiration: null, sacre: null, plongee: 3, corruptionAme: 2 };
    expect(M.jaugesMontees(g, 2, j)).toEqual({ endurance: 2, inspiration: null, sacre: null, plongee: 3, corruptionAme: 2 });
    expect(M.jaugesMontees(g, 3, j)).toEqual(j);
    expect(M.jaugesMontees(classe('barde'), 7, { ...j, endurance: null, inspiration: 0 })).toMatchObject({ endurance: null, inspiration: 1 });
    expect(M.jaugesMontees(classe('pretre'), 5, { ...j, endurance: null, sacre: 3 })).toMatchObject({ sacre: 4 });
  });

  it('les jauges relues à l’écriture comptent (dépensées pendant la montée) ; les choix figés changés : à refaire', () => {
    const f = cree('guerrier', 'nain', 2);
    const m = monter(f);
    const depense = { ...f, refonte: { ...f.refonte, jauges: { ...f.refonte.jauges, endurance: 0 } } };
    expect(M.appliquerMonteeRefonte(depense, m).fiche.refonte.jauges.endurance).toBe(1);
    expect(() => M.appliquerMonteeRefonte({ ...f, refonte: { ...f.refonte, rangs: {} } }, m)).toThrow('La fiche a changé');
    expect(() => M.appliquerMonteeRefonte({ ...f, octrois: { ...f.octrois, chaos: true } }, m)).toThrow('La fiche a changé');
    expect(() => M.appliquerMonteeRefonte({ ...f, progression: { crans: 0 } }, m)).toThrow('plus pleine');
    expect(() => M.appliquerMonteeRefonte(reelle('Karlach'), m)).toThrow('pas passé à la refonte');
    expect(() => M.appliquerMonteeRefonte(f, { ...m, jetPV: null })).toThrow('Lance le dé de vie du niveau 3.');
    expect(() => M.appliquerMonteeRefonte(f, { ...m, r: { ...m.r, rangs: { 'guerrier.soldat': 5 } } })).toThrow('8 points de voie pour 6 au niveau 3.');
    expect(M.apercuMontee({ ...m, jetPV: null })).toBeNull();
    expect(M.apercuMontee(m)?.fiche.niveau).toBe(3);
  });
});

describe('octrois du MJ (5a, 6a, 7a, 12a)', () => {
  const v2 = R.convertirFiche(reelle('Karlach'), { ...R.refonteVierge(classe('guerrier'), 3), rangs: { 'guerrier.soldat': 2 } });

  it('Voie du chaos : l’ouvrir ; la fermer est refusé tant qu’elle a des rangs', () => {
    const ouvert = { ...v2, octrois: R.ouvrirChaos(v2, true) };
    expect(ouvert.octrois.chaos).toBe(true);
    const avecRangs = { ...ouvert, refonte: { ...ouvert.refonte, rangs: { ...ouvert.refonte.rangs, 'guerrier.chaos': 1 } } };
    expect(() => R.ouvrirChaos(avecRangs, false)).toThrow('rouvre sa conversion');
    expect(R.ouvrirChaos(ouvert, false).chaos).toBe(false);
  });

  it('éléments et verbes accordés, retirés avec null ; seul un verbe s’apprend, 30 au plus', () => {
    let o = R.accorderElement(octroisVierges(), 'glace', 'initie');
    o = R.accorderElement(o, 'feu', 'adepte');
    expect(o.elements).toEqual({ glace: 'initie', feu: 'adepte' });
    expect(R.accorderElement(o, 'glace', null).elements).toEqual({ feu: 'adepte' });
    expect(() => R.accorderElement(o, 'lumiere' as never, 'initie')).toThrow('Élément inconnu');
    expect(() => R.accorderElement(o, 'feu', 'grand' as never)).toThrow('Maîtrise inconnue');
    o = R.accorderVerbe(o, 'evocation.missile', 'initie');
    o = R.accorderVerbe(o, 'evocation.missile', 'nonMaitrise');
    expect(o.verbes).toEqual([{ id: 'evocation.missile', maitrise: 'nonMaitrise' }]);
    expect(R.accorderVerbe(o, 'evocation.missile', null).verbes).toEqual([]);
    expect(() => R.accorderVerbe(o, 'mineur.lumiere', 'initie')).toThrow('Seul un verbe');
    const plein = { ...o, verbes: Array.from({ length: R.VERBES_ACCORDES_MAX }, (_, i) => ({ id: `v${i}`, maitrise: 'initie' as const })) };
    expect(() => R.accorderVerbe(plein, 'evocation.missile', 'initie')).toThrow('30 verbes accordés au plus.');
    expect(R.rouvrirConversion(o, true).reconversion).toBe(true);
  });

  it('alignement : le plafond des verbes est celui de firestore.rules', () => {
    expect(readFileSync('firestore.rules', 'utf8')).toContain(`o.verbes.size() <= ${R.VERBES_ACCORDES_MAX}`);
  });
});

describe('écritures (faux SDK Firestore)', () => {
  const chemin = 'tables/t1/persos/p-1';
  const choixK = { ...R.refonteVierge(classe('guerrier'), 3), rangs: { 'guerrier.soldat': 3, 'guerrier.peuple': 2 } };

  it('conversion : une transaction ; version, refonte et octrois écrits, champs v1 retirés', async () => {
    base.set(chemin, reelle('Karlach'));
    const v2 = await A.convertirPerso('p-1', choixK);
    expect(appels).toHaveLength(1);
    expect(appels[0]).toEqual({
      fn: 'tx.update',
      chemin,
      donnees: {
        schemaVersion: 2,
        refonte: v2.refonte,
        octrois: v2.octrois,
        ...Object.fromEntries(R.CHAMPS_V1_RETIRES.map((k) => [k, '<supprimer>'])),
      },
    });
  });

  it('conversion refusée : fiche déjà convertie, absente, choix invalides ; rien n’est écrit', async () => {
    await expect(A.convertirPerso('p-1', choixK)).rejects.toThrow('n’existe plus');
    base.set(chemin, R.convertirFiche(reelle('Karlach'), choixK));
    await expect(A.convertirPerso('p-1', choixK)).rejects.toThrow('déjà passé à la refonte');
    base.set(chemin, reelle('Karlach'));
    await expect(A.convertirPerso('p-1', { ...choixK, rangs: { 'guerrier.soldat': 5 } })).rejects.toThrow('points de voie');
    expect(appels).toEqual([]);
  });

  it('refaire ses voies : seuls refonte et octrois.reconversion ; jauges relues gardées', async () => {
    const v2 = R.convertirFiche(reelle('Karlach'), choixK);
    base.set(chemin, { ...v2, refonte: { ...v2.refonte, jauges: { ...v2.refonte.jauges, endurance: 0 } }, octrois: { ...v2.octrois, reconversion: true } });
    await A.refaireVoiesPerso('p-1', { ...choixK, rangs: { 'guerrier.peuple': 3, 'guerrier.soldat': 2 } });
    expect(appels).toEqual([
      { fn: 'tx.update', chemin, donnees: { refonte: { ...choixK, rangs: { 'guerrier.peuple': 3, 'guerrier.soldat': 2 }, jauges: { ...v2.refonte.jauges, endurance: 0 } }, 'octrois.reconversion': false } },
    ]);
    base.set(chemin, reelle('Karlach'));
    await expect(A.refaireVoiesPerso('p-1', choixK)).rejects.toThrow('pas passé à la refonte');
    base.delete(chemin);
    await expect(A.refaireVoiesPerso('p-1', choixK)).rejects.toThrow('n’existe plus');
  });

  it('octrois (MJ) : le champ entier, validé par le schéma', async () => {
    await A.modifierOctrois('p-1', { ...octroisVierges(), chaos: true });
    expect(appels).toEqual([{ fn: 'updateDoc', chemin, donnees: { octrois: { ...octroisVierges(), chaos: true } } }]);
    await expect(A.modifierOctrois('p-1', { ...octroisVierges(), autre: 1 } as never)).rejects.toThrow();
    expect(appels).toHaveLength(1);
  });

  it('montée : un seul tx.update, les champs de la montée et les crans restants ; deux clics, une montée', async () => {
    const f = { ...cree('pretre', 'humain', 3), progression: { crans: 4 } };
    base.set(chemin, f);
    const m = monter(f);
    await monterNiveauRefonte('p-1', m);
    expect(appels).toHaveLength(1);
    expect(appels[0]!.donnees).toMatchObject({ niveau: 4, 'progression.crans': 1, refonte: m.r.rangs === f.refonte.rangs ? expect.anything() : expect.objectContaining({ rangs: m.r.rangs }) });
    base.set(chemin, { ...f, niveau: 4, progression: { crans: 0 } });
    await expect(monterNiveauRefonte('p-1', m)).rejects.toThrow(M.RefusMontee);
    base.delete(chemin);
    await expect(monterNiveauRefonte('p-1', m)).rejects.toThrow('n’existe plus');
    expect(appels).toHaveLength(1);
  });

  it('alignement sur firestore.rules : chaque champ écrit par la montée est permis par ficheV2Valide', () => {
    const regles = readFileSync('firestore.rules', 'utf8');
    const corps = regles.slice(regles.indexOf('function ficheV2Valide('));
    const permis = /hasOnly\(\[([^\]]*)\]\)/.exec(corps)![1]!.split(',').map((c) => c.trim().replace(/'/g, ''));
    for (const c of [...M.CHAMPS_MONTEE_REFONTE, 'progression']) expect(permis).toContain(c);
  });
});

describe('pour les écrans (L4.11b2)', () => {
  const m = classe('magicien');
  const ctx: ContexteRefonte = { niveau: 6, race: 'elfe', modMagie: 2, octrois: octroisVierges() };
  const base = { ...R.refonteVierge(m, 6), ecole: 'evocation', elementDepart: 'feu' as const };

  it('appliquerGeste : chaque geste de l’écran passe par la fonction de règles correspondante', () => {
    let r = R.appliquerGeste(m, base, ctx, { type: 'prendre', voie: 'magicien.elementaire' });
    expect(r.rangs).toEqual({ 'magicien.elementaire': 1 });
    r = R.appliquerGeste(m, r, ctx, { type: 'retirer', voie: 'magicien.elementaire' });
    expect(r.rangs).toEqual({});
    expect(R.appliquerGeste(m, r, ctx, { type: 'choix', champ: 'ecole', valeur: 'abjuration' }).ecole).toBe('abjuration');
    expect(R.appliquerGeste(m, r, ctx, { type: 'mineur', id: 'mineur.lumiere' }).mineurs).toEqual(['mineur.lumiere']);
    expect(R.appliquerGeste(m, r, ctx, { type: 'variante', action: 'chaos.magicien.esprit-fissure', variante: 'garde' }).variantes).toEqual({ 'chaos.magicien.esprit-fissure': 'garde' });
    expect(() => R.appliquerGeste(m, r, ctx, { type: 'offrir', voie: 'magicien.ecole' })).toThrow('Polyvalence');
  });

  it('choixOuverts : école et élément de la classe ; second élément et Maître selon les voies ; chaos caché tant qu’il est fermé', () => {
    const o = R.choixOuverts(m, base, ctx);
    expect(o).toMatchObject({ ecoles: ['evocation', 'abjuration', 'invocation'], elementsSecond: [], elementsMaitre: [], caracEnPlus: null, repertoire: false, mineursMax: 3 });
    expect(o.voies).not.toContain('magicien.chaos');
    expect(R.choixOuverts(m, base, { ...ctx, octrois: { ...octroisVierges(), chaos: true } }).voies).toContain('magicien.chaos');
    // Le second élément s'ouvre avec la voie qui le donne ; il exclut l'élément de départ.
    const elem = Array.from({ length: 5 }, (_, i) => i + 1).find((n) => R.choixOuverts(m, { ...base, rangs: { 'magicien.elementaire': n } }, ctx).elementsSecond.length > 0)!;
    const ouverts = R.choixOuverts(m, { ...base, rangs: { 'magicien.elementaire': elem }, secondElement: 'glace' }, ctx);
    expect(ouverts.elementsSecond).toEqual(['glace', 'terre', 'eau', 'electricite']);
    // Le Spécimen d'élite du Maître d'armes : la caractéristique et sa liste.
    const g = classe('guerrier');
    const specimen = Array.from({ length: 5 }, (_, i) => i + 1).find((n) => R.choixOuverts(g, { ...R.refonteVierge(g, 12), rangs: { 'guerrier.maitre-d-armes': n } }, { ...ctx, niveau: 12 }).caracEnPlus)!;
    expect(R.choixOuverts(g, { ...R.refonteVierge(g, 12), rangs: { 'guerrier.maitre-d-armes': specimen } }, { ...ctx, niveau: 12 }).caracEnPlus).toMatchObject({ valeur: expect.any(Number) });
  });

  it('montée : appliquerGeste garde les verrous', () => {
    const f = cree('guerrier', 'nain', 3);
    const mo = M.ouvrirMonteeRefonte(f);
    const voie = Object.keys(f.refonte.rangs)[0]!;
    expect(() => M.appliquerGeste(mo, { type: 'retirer', voie })).toThrow('Ce rang est acquis');
    expect(M.appliquerGeste(mo, { type: 'prendre', voie: 'guerrier.ingenieur' }).r.rangs['guerrier.ingenieur']).toBe(1);
    expect(() => M.appliquerGeste(mo, { type: 'offrir', voie: 'guerrier.ingenieur' })).toThrow('Polyvalence');
    expect(() => M.appliquerGeste(mo, { type: 'mineur', id: 'mineur.lumiere' })).toThrow('pas un sort de ta classe');
    expect(M.appliquerGeste(mo, { type: 'choix', champ: 'caracEnPlus', valeur: 'FOR' }).r.caracEnPlus).toBe('FOR');
    expect(M.appliquerGeste(mo, { type: 'variante', action: 'chaos.magicien.esprit-fissure', variante: 'garde' }).r.variantes).toEqual({ 'chaos.magicien.esprit-fissure': 'garde' });
  });

  it('etatRefonte : refonte, conversion rouverte, à convertir, v1', () => {
    const v2 = R.convertirFiche(reelle('Karlach'), R.refonteVierge(classe('guerrier'), 3));
    expect(R.etatRefonte(v2)).toBe('refonte');
    expect(R.etatRefonte({ ...v2, octrois: { ...v2.octrois, reconversion: true } })).toBe('reconversion');
    expect(R.etatRefonte(reelle('Karlach'))).toBe('aConvertir');
    expect(R.etatRefonte(reelle('Hyrma'))).toBe('aConvertir');
    expect(R.etatRefonte(reelle('Hyrma', { classe: 'necromancien' }))).toBe('aConvertir');
    expect(R.etatRefonte(reelle('Hyrma', { classe: 'inconnue' }))).toBe('v1');
  });

  it('verbes accordables : tous les verbes, par école puis rang ; noms des écoles et éléments', () => {
    const v = R.verbesAccordables();
    expect(v.every((a) => a.nature === 'verbe')).toBe(true);
    expect(v.map((a) => `${a.ecole}:${a.rang}`)).toEqual([...v].sort((x, y) => (x.ecole ?? '').localeCompare(y.ecole ?? '') || x.rang - y.rang).map((a) => `${a.ecole}:${a.rang}`));
    expect(v.some((a) => a.id === 'evocation.missile')).toBe(true);
    expect([R.nomEcole('evocation'), R.nomEcole('inconnue'), R.nomElement('electricite'), R.nomAction('mineur.lumiere')]).toEqual(['Évocation', 'inconnue', 'Électricité', 'Lumière']);
  });
});
