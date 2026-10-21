import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * Montée de niveau guidée (lot L2.5b, décision 3a : règles actuelles).
 * Garde-fou principal : monter d'un niveau donne EXACTEMENT le personnage
 * qu'on aurait créé à ce niveau avec les mêmes choix et les mêmes dés, pour
 * toutes les classes et toutes les races. S'y ajoutent les verrous (on
 * ajoute, on ne retire rien d'acquis), les 9 fiches réelles reprises de la
 * v1, l'écriture en transaction et l'alignement sur firestore.rules.
 */

const appels: { fn: string; chemin: string; donnees: unknown }[] = [];
const base = new Map<string, Record<string, unknown>>();
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ chemin: p.join('/') }),
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
const M = await import('../../src/lib/regles/montee');
const { monterNiveau } = await import('../../src/lib/actions/montee');
const { CalculsPersonnage, statistiquesFiche } = await import('../../src/lib/regles/calculs');
const { constantes } = await import('../../src/lib/regles/donnees');
const { ficheCalculDepuisFiche, ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { cransRequis } = await import('../../src/lib/regles/progression');
type Fiche = import('../../src/lib/schemas/fiche').Fiche;
type FicheV1 = import('../../src/lib/schemas/fiche').FicheV1;
type Brouillon = import('../../src/lib/regles/creation').Brouillon;
type Montee = import('../../src/lib/regles/montee').Montee;

const des = (...v: number[]) => {
  let i = 0;
  return () => v[i++ % v.length]!;
};
const DONS = ['robuste', 'alerte', 'chanceux', 'endurant'];

/** Remplit les choix obligatoires d'un état (brouillon ou montée) avec les premières options. */
function premiersChoix<T>(x: T, b: (x: T) => Brouillon, g: {
  race: (x: T, r: number, o: string) => T; variante: (x: T, c: string) => T; don: (x: T, d: string) => T;
  rang: (x: T, v: string, r: number, choix?: string, offert?: boolean) => T; sort: (x: T, s: string) => T;
}, choixFaits: (r: number) => boolean = () => false): T {
  for (const [rang, options] of C.choixRaciauxRequis(b(x))) if (!choixFaits(rang) && !b(x).capacitesRaceChoix[String(rang)]) x = g.race(x, rang, options[0]!);
  if (C.varianteRequise(b(x)) && !b(x).raceVariante) x = g.variante(x, 'aetharion');
  while (b(x).dons.length < C.donsRequis(b(x))) x = g.don(x, DONS.find((d) => !b(x).dons.includes(d))!);
  for (const voie of C.voiesOuvertes(b(x)).filter((v) => !v.endsWith('.chaos'))) {
    for (let r = C.rangMaxDansVoie(b(x), voie) + 1; r <= 5; r++) {
      try {
        x = g.rang(x, voie, r, C.CHOIX_CAPACITES[`${voie}.${r}`]?.[0]);
      } catch {
        break;
      }
    }
  }
  if (C.polyvalenceAcquise(b(x)) && !C.rangOffert(b(x))) {
    const voie = C.voiesOuvertes(b(x)).find((v) => !v.endsWith('.chaos') && !C.CHOIX_CAPACITES[`${v}.${C.rangMaxDansVoie(b(x), v) + 1}`] && C.rangMaxDansVoie(b(x), v) < 5)!;
    x = g.rang(x, voie, C.rangMaxDansVoie(b(x), voie) + 1, undefined, true);
  }
  while (C.sortsAChoisir(b(x)) > 0 && C.sortsProposes(b(x)).length) x = g.sort(x, C.sortsProposes(b(x))[0]!);
  return x;
}

const gestesBrouillon = {
  race: C.choisirOptionRaciale, variante: C.choisirVariante, don: (x: Brouillon, d: string) => C.prendreDon(x, d),
  rang: C.prendreRang, sort: C.apprendreSort,
};
const gestesMontee = {
  race: M.choisirOptionRaciale, variante: M.choisirVariante, don: (x: Montee, d: string) => M.prendreDon(x, d),
  rang: M.prendreRang, sort: M.apprendreSort,
};

/** Personnage créé par l'assistant, barre pleine. */
function cree(classe: string, race: string, niveau: number, jet = 0.5): FicheV1 {
  let b = C.changerNiveau({ ...C.brouillonVide(), nom: `${classe} ${race}`, classe, race, caracsLibres: { DEX: 3, CON: 3 } }, niveau);
  while (b.jetsPV.length < niveau - 1) b = C.lancerJetPV(b, des(jet));
  b = premiersChoix(b, (x) => x, gestesBrouillon);
  const f = C.ficheDepuisBrouillon(b, 'alice', 1);
  return { ...f, progression: { crans: cransRequis(niveau) ?? 0 } };
}

/** Montée complète, choix automatiques. */
function monter(f: Fiche, jet = 0.5): Montee {
  const m = M.lancerPV(M.ouvrirMontee(f), des(jet));
  return premiersChoix(m, (x) => x.b, gestesMontee, (r) => String(r) in f.capacitesRaceChoix);
}

beforeEach(() => {
  appels.length = 0;
  base.clear();
  session.table = 't1';
  session.uid = 'alice';
});

describe('monter = créer directement au niveau suivant (mêmes choix, mêmes dés)', () => {
  const cas = constantes.ordreClasses.flatMap((c) => constantes.ordreRaces.flatMap((r) => [1, 2, 3, 4, 6, 8].map((n) => [c, r, n] as const)));
  it.each(cas)('%s %s, niveau %i → suivant', (classe, race, niveau) => {
    const avant = cree(classe, race, niveau);
    const m = monter(avant);
    expect(M.erreursMontee(m)).toEqual([]);
    const { fiche } = M.appliquerMontee(avant, m);
    // Le même personnage, créé d'un coup au niveau suivant.
    // Un rang qui accorde un sort peut faire déborder un Grimoire plein : la création ferait oublier
    // un sort appris, la montée (qui n'en retire aucun) le laisse hors plafond, comme la v1.
    const sorts = m.b.sorts.slice(0, m.b.sorts.length + Math.min(0, C.sortsAChoisir(m.b)));
    const direct = C.ficheDepuisBrouillon({ ...m.b, sorts, jetsPV: fiche.pvHistorique.map((j) => j.jet as number) }, 'alice', 1);
    expect(fiche.niveau).toBe(niveau + 1);
    expect(fiche.pvMax).toBe(direct.pvMax);
    expect(fiche.capacitesRace).toEqual(direct.capacitesRace);
    const stats = statistiquesFiche(ficheCalculDepuisFiche(fiche));
    expect(stats.grimoire?.horsPlafond ?? []).toEqual(m.b.sorts.slice(sorts.length));
    const sansHorsPlafond = (s: typeof stats) => ({ ...s, grimoire: s.grimoire && { ...s.grimoire, horsPlafond: [] } });
    expect(sansHorsPlafond(stats)).toEqual(sansHorsPlafond(statistiquesFiche(ficheCalculDepuisFiche(direct))));
    expect(fiche.progression.crans).toBe(0);
  });
});

describe('ouvrir, lancer, verrous', () => {
  it('barre pas pleine ou niveau 12 : refusé, avec la raison', () => {
    const f = cree('guerrier', 'nain', 3);
    expect(() => M.ouvrirMontee({ ...f, progression: { crans: 1 } })).toThrow('Il manque 2 cran(s)');
    expect(() => M.ouvrirMontee({ ...f, niveau: 12, progression: { crans: 9 } })).toThrow('Niveau maximum atteint.');
  });

  it('le dé de vie se lance une fois, avec le dé de la classe', () => {
    const m = M.lancerPV(M.ouvrirMontee(cree('guerrier', 'nain', 3)), () => 0.99);
    expect(m.jetPV).toBe(10);
    expect(() => M.lancerPV(m)).toThrow('déjà lancé');
  });

  it('rien d’acquis ne se retire : rang, don, sort, Cercle, nation, choix racial ; ce qu’on vient d’ajouter, si', () => {
    const pretre = cree('pretre', 'humain', 7);
    let m = M.ouvrirMontee({ ...pretre, cercleSpecialisation: 'vie' });
    const [acquis] = pretre.capacites;
    const { voie, rang } = { voie: acquis!.id.split('.').slice(0, 2).join('.'), rang: Number(acquis!.id.split('.')[2]) };
    const sommet = Math.max(...pretre.capacites.filter((c) => c.id.startsWith(voie + '.')).map((c) => Number(c.id.split('.')[2])));
    expect(() => M.retirerRang(m, voie, sommet)).toThrow('acquis');
    expect(() => M.retirerDon(m, pretre.dons[0]!)).toThrow('acquis');
    expect(() => M.oublierSort(m, pretre.grimoireSortsConnus[0]!)).toThrow('acquis');
    expect(() => M.choisirCercle(m, 'foi')).toThrow('acquis');
    expect(() => M.choisirOptionRaciale(m, 4, 'FOR')).toThrow('acquis');
    expect(rang).toBeGreaterThan(0);
    // Ce qui vient d'être pris se retire.
    const libre = C.voiesOuvertes(m.b).find((v) => C.rangMaxDansVoie(m.b, v) < 2 && !v.endsWith('.chaos'))!;
    m = M.prendreRang(m, libre, C.rangMaxDansVoie(m.b, libre) + 1);
    expect(M.nouveautes(m).capacites).toHaveLength(1);
    m = M.retirerRang(m, libre, C.rangMaxDansVoie(m.b, libre));
    expect(M.nouveautes(m).capacites).toEqual([]);
    const elfe = M.ouvrirMontee({ ...cree('magicien', 'elfe', 4), raceVariante: 'aelindra' });
    expect(() => M.choisirVariante(elfe, 'mordanel')).toThrow('acquis');
  });

  it('au niveau 4 un don à choisir ; au 5 le rang racial 3 (et Polyvalence pour l’Humain) ; au 7 Ambition ; nation elfique au 5', () => {
    expect(M.erreursMontee(M.lancerPV(M.ouvrirMontee(cree('guerrier', 'nain', 3))))).toEqual(['Choisis 1 don(s).']);
    const humain = M.lancerPV(M.ouvrirMontee(cree('guerrier', 'humain', 4)));
    expect(M.nouveautes(humain).rangsRace).toEqual([3]);
    expect(M.avertissementsMontee(humain)).toContain('Polyvalence : le rang offert reste à choisir.');
    const ambition = M.lancerPV(M.ouvrirMontee(cree('guerrier', 'humain', 6)));
    expect(M.erreursMontee(ambition)).toContain('Fais le choix du rang racial 4.');
    const elfe = M.lancerPV(M.ouvrirMontee({ ...cree('magicien', 'elfe', 4), raceVariante: null }));
    expect(M.erreursMontee(elfe)).toContain('Choisis la nation elfique.');
    expect(M.erreursMontee(M.ouvrirMontee(cree('guerrier', 'nain', 1)))).toEqual(['Lance le dé de vie du niveau 2.']);
  });

  it('Grimoire plein et rang qui accorde un sort : le sort passe hors plafond, signalé sans bloquer', () => {
    let m = M.lancerPV(M.ouvrirMontee(cree('pretre', 'nain', 2)));
    m = M.prendreRang(m, 'pretre.guerison', 4);
    expect(C.sortsAChoisir(m.b)).toBe(-1);
    expect(M.erreursMontee(m)).toEqual([]);
    expect(M.avertissementsMontee(m)).toContain('Grimoire plein : 1 sort(s) hors plafond, non inscrit(s).');
  });

  it('Polyvalence : le rang offert ne coûte aucun point', () => {
    let m = M.lancerPV(M.ouvrirMontee(cree('guerrier', 'humain', 4)));
    const avant = C.pointsVoie(m.b).restants;
    const voie = C.voiesOuvertes(m.b).find((v) => !v.endsWith('.chaos') && C.rangMaxDansVoie(m.b, v) < 5 && !C.CHOIX_CAPACITES[`${v}.${C.rangMaxDansVoie(m.b, v) + 1}`])!;
    m = M.prendreRang(m, voie, C.rangMaxDansVoie(m.b, voie) + 1, undefined, true);
    expect(C.pointsVoie(m.b).restants).toBe(avant);
    expect(M.nouveautes(m).capacites[0]?.offert).toBe(true);
  });
});

describe('appliquer : PV, PP, crans et champs écrits', () => {
  it('PV max et actuels gagnent dé + CON (+ bonus du Nain) ; un blessé le reste ; le surplus de crans reste', () => {
    const f = { ...cree('guerrier', 'nain', 3), pvActuel: 5, progression: { crans: 5 } };
    // Alerte : un don sans effet sur les PV (Robuste en aurait).
    const m = M.prendreDon(M.lancerPV(M.ouvrirMontee(f), () => 0.99), 'alerte');
    const r = M.appliquerMontee(f, m);
    const modCON = new CalculsPersonnage(ficheCalculDepuisFiche(r.fiche)).mod('CON');
    expect(r.pvGagnes).toBe(10 + modCON + 2); // dé 10, CON, et +2 par niveau du Nain (rang racial 1)
    expect(r.fiche.pvMax).toBe(f.pvMax + r.pvGagnes);
    expect(r.fiche.pvActuel).toBe(5 + r.pvGagnes);
    expect(r.fiche.progression.crans).toBe(2);
    expect(r.requis).toBe(3);
  });

  it('PV max d’une fiche v1 qui s’écartent du calcul : l’écart est gardé, seul le gain s’ajoute', () => {
    const f = { ...cree('guerrier', 'nain', 3), pvMax: 99, pvActuel: 99 };
    const r = M.appliquerMontee(f, monter(f));
    expect(r.fiche.pvMax).toBe(99 + r.pvGagnes);
  });

  it('CON relevée à la montée (Amélioration au niveau 4) : tous les jets passés en profitent (décision 2a)', () => {
    const f = { ...cree('guerrier', 'nain', 3), caracs: { ...cree('guerrier', 'nain', 3).caracs, CON: 15 } };
    let m = M.lancerPV(M.ouvrirMontee(f), () => 0.5);
    m = M.prendreDon(m, 'amelioration_carac', ['CON', 'FOR']);
    const r = M.appliquerMontee(f, m);
    expect(r.fiche.pvHistorique.every((j) => j.modCON === 3)).toBe(true);
    // CON 15 → 17 : +1 au modificateur, pour le niveau 1, les 2 jets passés et le nouveau.
    expect(r.pvGagnes).toBe(6 + 3 + 2 + 1 + 2);
  });

  it('seuls les champs de la montée changent ; sac, bourse, notes, modules intacts', () => {
    const f = { ...cree('magicien', 'humain', 3), notes: 'Doit 3 po.', piecesOr: 12 };
    const r = M.appliquerMontee(f, monter(f));
    for (const k of Object.keys(r.champs)) expect(M.CHAMPS_MONTEE).toContain(k);
    expect(r.champs).toHaveProperty('niveau', 4);
    expect(r.champs).not.toHaveProperty('progression');
    const { niveau: _n, progression: _p, ...reste } = r.fiche;
    for (const k of ['equipement', 'inventaire', 'piecesOr', 'notes', 'modules', 'caracs'] as const) expect(reste[k]).toEqual(f[k]);
  });

  it('fiche changée entre-temps ou barre plus pleine : refusé', () => {
    const f = cree('guerrier', 'nain', 3);
    const m = monter(f);
    expect(() => M.appliquerMontee({ ...f, dons: ['alerte'] }, m)).toThrow('La fiche a changé');
    expect(() => M.appliquerMontee({ ...f, progression: { crans: 2 } }, m)).toThrow('n’est plus pleine');
    // Les PV changés en combat, eux, ne gênent pas : ils suivent.
    expect(M.appliquerMontee({ ...f, pvActuel: 3 }, m).fiche.pvActuel).toBeGreaterThan(3);
  });
});

describe('les 9 fiches réelles reprises de la v1 montent d’un niveau', () => {
  const FICHES: { nom: string }[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
  it.each(FICHES.map((v1) => [v1.nom.split(' ')[0]!, v1] as const))('%s', (_nom, v1) => {
    const { fiche } = ficheDepuisV1(v1 as never, 'alice', 1);
    const f = { ...fiche, progression: { crans: cransRequis(fiche.niveau)! } };
    const m = monter(f);
    expect(M.erreursMontee(m)).toEqual([]);
    const r = M.appliquerMontee(f, m);
    expect(r.fiche.niveau).toBe(f.niveau + 1);
    expect(r.fiche.inventaire).toEqual(f.inventaire);
    expect(r.fiche.modules).toEqual(f.modules);
    expect(r.pvGagnes).toBeGreaterThan(0);
  });
});

describe('écriture : une transaction, refusée si la fiche a changé', () => {
  it('un seul tx.update : les champs de la montée et les crans restants', async () => {
    const f = { ...cree('guerrier', 'nain', 3), progression: { crans: 4 } };
    base.set('tables/t1/persos/p-1', f);
    await monterNiveau('p-1', monter(f));
    expect(appels).toHaveLength(1);
    expect(appels[0]).toMatchObject({ fn: 'tx.update', chemin: 'tables/t1/persos/p-1' });
    expect(appels[0]!.donnees).toMatchObject({ niveau: 4, 'progression.crans': 1 });
  });

  it('deux clics : la seconde montée trouve la fiche déjà montée, rien n’est écrit deux fois', async () => {
    const f = cree('guerrier', 'nain', 3);
    base.set('tables/t1/persos/p-1', f);
    const m = monter(f);
    await monterNiveau('p-1', m);
    base.set('tables/t1/persos/p-1', { ...f, niveau: 4, progression: { crans: 0 } });
    await expect(monterNiveau('p-1', m)).rejects.toThrow(M.RefusMontee);
    expect(appels).toHaveLength(1);
  });
});

describe('alignement sur firestore.rules', () => {
  const regles = readFileSync('firestore.rules', 'utf8');
  it('cransRequis : même table des deux côtés', () => {
    const corps = /function cransRequis\(n\) \{\s*(return [^;]+;)/.exec(regles)![1]!;
    const deRegles = new Function('n', corps) as (n: number) => number;
    for (let n = 1; n < 12; n++) expect(deRegles(n), `niveau ${n}`).toBe(cransRequis(n));
  });

  it('chaque champ écrit par la montée est permis par ficheValide', () => {
    const corps = regles.slice(regles.indexOf('function ficheValide('));
    const permis = /hasOnly\(\[([^\]]*)\]\)/.exec(corps)![1]!.split(',').map((c) => c.trim().replace(/'/g, ''));
    for (const c of [...M.CHAMPS_MONTEE, 'progression']) expect(permis).toContain(c);
  });
});
