import { readFileSync } from 'node:fs';
import { beforeEach, describe, expect, it, vi } from 'vitest';

/*
 * La fiche d'un personnage de la refonte (lot L4.12) : actions, magie,
 * passifs comptés, jauges, réserve de PP et Spécimen d'élite. Décisions de
 * Thomas du 21/10/2026 : 1b, 2a (avec tri par voie), 3a à 7a, 8b, 9a à 15b.
 */

const appels: { fn: string; chemin: string; donnees: unknown }[] = [];
vi.mock('../../src/lib/firebase/client', () => ({ db: {}, auth: {} }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...p: string[]) => ({ chemin: p.join('/') }),
  updateDoc: async (r: { chemin: string }, donnees: unknown) => { appels.push({ fn: 'updateDoc', chemin: r.chemin, donnees }); },
  deleteField: () => '<supprimer>',
  runTransaction: async () => undefined,
}));

const { session } = await import('../../src/lib/session.svelte');
const A = await import('../../src/lib/fiche/actions-fiche');
const R = await import('../../src/lib/fiche/refonte');
const K = await import('../../src/lib/fiche/creation-refonte');
const M = await import('../../src/lib/fiche/montee-refonte');
const C = await import('../../src/lib/regles/creation');
const { modifierJauges } = await import('../../src/lib/actions/refonte');
const { vueFiche } = await import('../../src/lib/fiche/vue-fiche');
const { CalculsPersonnage } = await import('../../src/lib/regles/calculs');
const { caracsDeLaRefonte, ficheCalculDepuisFiche, ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { cransRequis } = await import('../../src/lib/regles/progression');
const { classeParId } = await import('../../src/regles');
type FicheV1 = import('../../src/lib/schemas/fiche').FicheV1;
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type RefonteFiche = import('../../src/lib/schemas/fiche').RefonteFiche;
type Brouillon = import('../../src/lib/regles/creation').Brouillon;
type ModsDuPerso = import('../../src/lib/fiche/actions-fiche').ModsDuPerso;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forme v1 non typée
const FICHES: any[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string, patch: Partial<FicheV1> = {}): FicheV1 => ({ ...ficheDepuisV1(FICHES.find((f) => f.nom.startsWith(nom)), 'u', 1).fiche, ...patch });
const classe = (id: string) => classeParId.get(id)!;
const convertie = (nom: string, id: string, choix: Partial<RefonteFiche>, patch: Partial<FicheV1> = {}): FicheV2 => {
  const v1 = reelle(nom, patch);
  return R.convertirFiche(v1, { ...R.refonteVierge(classe(id), v1.niveau), ...choix });
};
const mods = (patch: Partial<ModsDuPerso> = {}): ModsDuPerso => ({ attaqueContact: 2, attaqueDistance: 1, attaqueMagique: 5, mod: () => 3, armure: false, ...patch });

const KYLHIAN = { ecole: 'evocation', elementDepart: 'feu' as const, secondElement: 'glace' as const, elementMaitre: 'feu' as const, rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 3, 'magicien.virtuose': 1 }, mineurs: ['mineur.trait-arcanique', 'mineur.lumiere', 'mineur.main-du-mage'], mineurPalierII: 'mineur.trait-arcanique' };
const ky = () => {
  const f = convertie('Kylhian', 'magicien', KYLHIAN);
  return { ...f, octrois: { ...f.octrois, verbes: [{ id: 'abjuration.bouclier', maitrise: 'initie' as const }] } };
};
const ligne = (l: import('../../src/lib/fiche/actions-fiche').ActionAffichee[], id: string) => l.find((a) => a.id === id)!;

beforeEach(() => {
  appels.length = 0;
  session.table = 't1';
  session.uid = 'alice';
});

describe('attaques spéciales et arme en main (décision du 21/10/2026)', () => {
  const KARLACH = { rangs: { 'guerrier.maitre-d-armes': 1 } };
  const arme = (id: string, nom: string) => ({ id, nom, type: 'arme' as const, porte: false, degats: '1d8', typedegats: 'physique' as const, enchantement: 0, deuxMains: false, prixPo: 1, description: '' });

  it('sans arme en main, pas d’attaque spéciale d’arme ; les communes et les mains nues restent', () => {
    const f = convertie('Karlach', 'guerrier', KARLACH, { equipement: {} });
    const ids = A.actionsDeLaFiche(f, mods()).map((a) => a.id);
    // Les mains nues ne s'équipent pas : leur spéciale reste, les autres non.
    expect(ids.filter((id) => id.startsWith('arme.')).sort()).toEqual(['arme.attaque', 'arme.frappe-nerveuse', 'arme.opportunite']);
  });

  it('les mains nues ne s’équipent pas : leurs actions restent (le Moine, L4.16)', () => {
    const f = convertie('Vhorgar', 'moine', { elementDepart: 'psionique', rangs: { 'moine.poings': 1 } }, { classe: 'moine', equipement: {} });
    const ids = A.actionsDeLaFiche(f, mods()).map((a) => a.id);
    expect(ids).toContain('moine.mains-nues');
    expect(ids).toContain('moine.frappe-nerveuse');
  });

  it('seule l’attaque spéciale de la famille portée paraît', () => {
    const hache = convertie('Karlach', 'guerrier', KARLACH, { equipement: { main_droite: arme('hache_guerre', 'Hache de guerre') } });
    const idsHache = A.actionsDeLaFiche(hache, mods()).map((a) => a.id);
    expect(idsHache).toContain('arme.fendre');
    expect(idsHache).not.toContain('arme.coup-d-estoc');

    const lance = convertie('Karlach', 'guerrier', KARLACH, { equipement: { main_droite: arme('lance', 'Lance') } });
    const idsLance = A.actionsDeLaFiche(lance, mods()).map((a) => a.id);
    expect(idsLance).toContain('arme.coup-d-estoc');
    expect(idsLance).not.toContain('arme.fendre');
  });
});

describe('actions de la fiche (1b à 5a, 15b)', () => {
  it('Kylhian : attaques d’arme, verbes de l’école, grimoire, sorts mineurs, rangés par type de geste', () => {
    const l = A.actionsDeLaFiche(ky(), mods());
    expect(l.map((a) => a.groupe)).toEqual([...l.map((a) => a.groupe)].sort((x, y) => A.GROUPES.findIndex((g) => g.id === x) - A.GROUPES.findIndex((g) => g.id === y)));
    expect(l.map((a) => a.id)).toEqual([
      'arme.attaque', 'arme.opportunite',
      'evocation.missile', 'evocation.choc', 'abjuration.bouclier',
      'mineur.trait-arcanique', 'mineur.lumiere', 'mineur.main-du-mage',
    ]);
    expect(ligne(l, 'evocation.missile')).toMatchObject({ palier: 'I', cout: '2 PP', typeAction: 'Action', ecole: 'Évocation', voie: 'magicien.ecole', rang: 1, attaque: null, degats: { formule: '1d6' } });
    expect(ligne(l, 'evocation.choc')).toMatchObject({ cout: '3 PP', coutHorsCombat: '2 PP', dd: 'DD 13, sauvegarde de FOR', degats: { formule: '2d6' } });
    expect(ligne(l, 'abjuration.bouclier')).toMatchObject({ grimoire: 'Initié', cout: '3 PP', typeAction: 'Réaction', voie: null });
    // Répertoire : le Trait arcanique au palier II ; attaque magique d20 + bonus, dé du sort mineur selon le niveau.
    expect(ligne(l, 'mineur.trait-arcanique')).toMatchObject({ palier: 'II', cout: '0 PP', attaque: { libelle: 'Trait arcanique : attaque magique', formule: '1d20+5' }, degats: { formule: '1d6' } });
    expect(ligne(l, 'arme.attaque')).toMatchObject({ groupe: 'arme', attaque: { formule: '1d20+2' } });
  });

  it('dé d’un sort mineur selon le niveau : 1d8 au niveau 5', () => {
    const f = convertie('Kylhian', 'magicien', { ...KYLHIAN, rangs: { 'magicien.ecole': 2, 'magicien.virtuose': 1 }, secondElement: null, elementMaitre: null }, { niveau: 5 });
    expect(ligne(A.actionsDeLaFiche(f, mods()), 'mineur.trait-arcanique').degats?.formule).toBe('1d8');
  });

  it('hors combat (4a) : l’usage au palier atteint ; tri par voie (2a) : ordre des voies, puis le reste', () => {
    const l = A.actionsDeLaFiche(ky(), mods());
    expect(ligne(l, 'evocation.missile').horsCombat).toBeTruthy();
    expect(ligne(l, 'arme.attaque').horsCombat).toBeNull();
    const parVoie = A.trierActions(l, 'voie', classe('magicien'));
    expect(parVoie.slice(0, 2).map((a) => a.id)).toEqual(['evocation.missile', 'evocation.choc']);
    expect(parVoie.at(-1)!.groupe).toBe('mineur');
  });

  it('Guerrier : attaques spéciales avec leur coût (Maniement expert −1), distance pour l’arc, techniques et passifs', () => {
    const f = convertie('Karlach', 'guerrier', { rangs: { 'guerrier.soldat': 2, 'guerrier.maitre-d-armes': 1, 'guerrier.peuple': 1 } });
    const l = A.actionsDeLaFiche(f, mods());
    const speciale = l.find((a) => a.groupe === 'arme' && a.cout?.includes('Endurance'))!;
    expect(speciale.cout).toBe('1 Endurance');
    const arc = l.find((a) => a.groupe === 'arme' && a.id.includes('arc'));
    if (arc) expect(arc.attaque?.formule).toBe('1d20+1');
    expect(l.some((a) => a.groupe === 'technique')).toBe(true);
    const passifs = l.filter((a) => a.groupe === 'passif');
    expect(passifs.every((a) => a.condition)).toBe(true);
  });

  it('Prêtre : Vêtements sacrés (classe) listé comme passif, condition « sans armure » ; Cercle nommé', () => {
    const f = convertie('Hermione', 'pretre', { rangs: { 'pretre.guerison': 3, 'pretre.foi': 2 }, mineurs: ['mineur.stabiliser'] });
    const l = A.actionsDeLaFiche(f, mods());
    expect(ligne(l, 'pretre.vetements-sacres')).toMatchObject({ groupe: 'passif', condition: 'sans armure', voie: null });
    expect(l.find((a) => a.groupe === 'verbe')!.ecole).toBe('Guérison');
    expect(A.magieDeLaFiche(f)).toBeNull();
  });

  it('passif à condition (13a) : listé avec elle', () => {
    const f = convertie('Kargash', 'barde', { rangs: { 'barde.rapiere': 1 }, mineurs: ['mineur.moquerie'] });
    expect(ligne(A.actionsDeLaFiche(f, mods()), 'barde.precision')).toMatchObject({ groupe: 'passif', condition: 'avec une arme légère' });
  });
});

describe('Druide (lot L4.15)', () => {
  const druide = () =>
    convertie('Hermione', 'druide', { elementDepart: 'eau', rangs: { 'druide.elements': 1, 'druide.formes': 1 }, mineurs: ['mineur.gourdin'] }, { classe: 'druide' });

  it('école nommée, Gourdin un cran au-dessus du dé des mineurs, attaques de forme avec leur forme, Force de la nature', () => {
    const f = druide();
    const l = A.actionsDeLaFiche(f, mods());
    expect(ligne(l, 'nature.enchevetrement')).toMatchObject({ ecole: 'Éléments naturels', cout: '2 PP', voie: 'druide.elements' });
    expect(ligne(l, 'mineur.gourdin').degats?.formule).toBe('1d8');
    expect(ligne(l, 'druide.morsure-du-loup')).toMatchObject({ condition: 'seulement en Forme du loup', attaque: { formule: '1d20+5' } });
    expect(ligne(l, 'druide.forme-du-loup').cout).toBe('1 Force de la nature');
    expect(ligne(l, 'arme.coup-assommant').cout).toBe('2 Force de la nature');
    expect(A.magieDeLaFiche(f)!.elements.map((e) => [e.id, e.maitrise])).toEqual([['eau', 'Adepte']]);
    expect(A.jaugesDeLaFiche(f)[0]).toMatchObject({ cle: 'forceNature', actuel: 4, max: 4 });
  });
});

describe('Moine (lot L4.16)', () => {
  const moine = () => convertie('Vhorgar', 'moine', { elementDepart: 'psionique', rangs: { 'moine.poings': 1, 'moine.elevation': 1 } }, { classe: 'moine' });

  it('mains nues au dé de son niveau + FOR ; techniques à mains nues et en Ki ; Ki à 1 en partant, remis à 1 en fin de combat', () => {
    const f = moine();
    const l = A.actionsDeLaFiche(f, mods());
    expect(ligne(l, 'moine.mains-nues')).toMatchObject({ attaque: { formule: '1d20+2' }, degats: { formule: '1d6+3' } });
    expect(ligne(l, 'moine.frappe-nerveuse')).toMatchObject({ cout: '1 Ki', degats: { formule: '1d6+3' } });
    expect(A.jaugesDeLaFiche(f)[0]).toMatchObject({ cle: 'ki', actuel: 1, max: 2 });
    const plein = { ...f, refonte: { ...f.refonte, jauges: { ...f.refonte.jauges, ki: 2, plongee: 3 } } };
    expect(A.finDuCombat(plein)).toMatchObject({ ki: 1, plongee: 0 });
    expect(A.finDuCombat(convertie('Karlach', 'guerrier', {}))).toMatchObject({ endurance: 4 });
  });

  it('Défense du corps libre : + mod de SAG en DEF, sans armure seulement', () => {
    const f = convertie('Vhorgar', 'moine', { elementDepart: 'psionique', rangs: { 'moine.elevation': 2 } }, { classe: 'moine' });
    expect(A.bonusDesPassifs(f, mods()).DEF).toBe(3);
    expect(A.bonusDesPassifs(f, mods({ armure: true })).DEF).toBe(0);
  });

  it('montée : le Ki garde sa valeur, seul son maximum monte', () => {
    expect(M.jaugesMontees(classe('moine'), 2, { ...moine().refonte.jauges, ki: 1 }).ki).toBe(1);
    expect(M.jaugesMontees(classe('moine'), 2, { ...moine().refonte.jauges, ki: 2 }).ki).toBe(2);
  });
});

describe('magie (6a)', () => {
  it('école et maîtrise, éléments, et les combinaisons ouvertes par un élément Maître', () => {
    const m = A.magieDeLaFiche(ky())!;
    expect(m.ecole).toEqual({ nom: 'Évocation', maitrise: 'Adepte' });
    expect(m.elements.map((e) => [e.id, e.maitrise])).toEqual([['feu', 'Maître'], ['glace', 'Initié']]);
    expect(m.combinaisons.map((c) => c.nom)).toEqual(['Vapeur']);
    const sansMaitre = convertie('Kylhian', 'magicien', { ...KYLHIAN, rangs: { 'magicien.ecole': 2 }, secondElement: null, elementMaitre: null, mineurPalierII: null, mineurs: ['mineur.lumiere'] });
    expect(A.magieDeLaFiche(sansMaitre)!.combinaisons).toEqual([]);
  });
});

describe('passifs comptés (12a)', () => {
  it('Intelligence du combat : mod d’INT en DEF et en initiative ; Entrée en scène : +2 initiative', () => {
    const f = convertie('Kargash', 'barde', { rangs: { 'barde.rapiere': 2, 'barde.spectacle': 1 }, mineurs: ['mineur.moquerie'] });
    expect(A.bonusDesPassifs(f, mods({ mod: (c) => (c === 'INT' ? 2 : 0) }))).toEqual({
      DEF: 2, initiative: 4, detail: ['Intelligence du combat +2 initiative', 'Intelligence du combat +2 DEF', 'Entrée en scène +2 initiative'],
    });
    const brut = new CalculsPersonnage(ficheCalculDepuisFiche(f));
    const vue = vueFiche(f);
    const modINT = brut.mod('INT');
    expect(vue.stats.ca).toBe(brut.calculerCA() + modINT);
    expect(vue.stats.initiative).toBe(brut.calculerInitiative() + modINT + 2);
  });

  it('les passifs à condition (phalange, protéger un allié, immobile) ne comptent pas (13a)', () => {
    const f = convertie('Karlach', 'guerrier', { rangs: { 'guerrier.peuple': 3, 'guerrier.soldat': 2 } }, { niveau: 5 });
    expect(A.actionsDeLaFiche(f, mods()).filter((a) => a.groupe === 'passif').length).toBeGreaterThan(0);
    expect(A.bonusDesPassifs(f, mods())).toEqual({ DEF: 0, initiative: 0, detail: [] });
  });

  it('Vêtements sacrés : + mod de magie en DEF, seulement sans armure', () => {
    const f = convertie('Hermione', 'pretre', { rangs: { 'pretre.guerison': 1 }, mineurs: ['mineur.stabiliser'] });
    const modSAG = R.contexteDe(f, classe('pretre')).modMagie;
    expect(A.bonusDesPassifs(f, mods()).DEF).toBe(modSAG);
    expect(A.bonusDesPassifs(f, mods({ armure: true })).DEF).toBe(0);
  });
});

describe('réserve de PP (11a) et Spécimen d’élite (14a)', () => {
  it('la fiche montre la réserve de la refonte ; Pacte de sang : pas de PP, la réserve en PV max', () => {
    const f = ky();
    const reserve = 4 + 2 * f.niveau + 2 * R.contexteDe(f, classe('magicien')).modMagie;
    expect(vueFiche(f).pp).toEqual({ actuel: Math.min(f.ppActuel ?? reserve, reserve), max: reserve });
    const pacte = convertie('Kylhian', 'magicien', { ...KYLHIAN, rangs: { 'magicien.ecole': 2, 'magicien.hemomancie': 1 }, secondElement: null, elementMaitre: null, mineurPalierII: null, mineurs: ['mineur.lumiere', 'mineur.main-du-mage'] });
    const vue = vueFiche(pacte);
    expect(vue.pp).toBeNull();
    expect(vue.pv.max).toBe(pacte.pvMax + reserve);
  });

  it('Spécimen d’élite : la caractéristique gagne +1 dans les calculs, la valeur stockée ne change pas', () => {
    const base = convertie('Karlach', 'guerrier', { rangs: { 'guerrier.maitre-d-armes': 2 }, caracEnPlus: 'FOR' }, { niveau: 5 });
    expect(caracsDeLaRefonte(base)).toEqual({ ...base.caracs, FOR: (base.caracs.FOR ?? 10) + 1 });
    const avec = { ...base, refonte: { ...base.refonte, caracEnPlus: 'CON' as const } };
    expect(caracsDeLaRefonte(avec).CON).toBe((base.caracs.CON ?? 10) + 1);
    expect(avec.caracs.CON).toBe(base.caracs.CON);
    // Une caractéristique hors de la liste du Spécimen ne compte pas.
    expect(caracsDeLaRefonte({ ...avec, refonte: { ...avec.refonte, caracEnPlus: 'INT' } })).toEqual(base.caracs);
    // Sans le rang qui le donne, le choix ne compte pas.
    expect(caracsDeLaRefonte({ ...avec, refonte: { ...avec.refonte, rangs: { 'guerrier.maitre-d-armes': 1 } } })).toEqual(base.caracs);
    expect(new CalculsPersonnage(ficheCalculDepuisFiche(avec)).mod('CON')).toBe(Math.floor(((base.caracs.CON ?? 10) + 1 - 10) / 2));
  });

  it('création : PV avec le Spécimen, PP = réserve pleine ; la montée qui l’apporte = la création directe', () => {
    let b: Brouillon = C.changerNiveau({ ...C.brouillonVide(), nom: 'Brann', classe: 'guerrier', race: 'nain', caracsLibres: { FOR: 3, CON: 2, DEX: 1 } }, 2);
    b = C.lancerJetPV(b, () => 0.5);
    const gk = (f: (c: never, r: RefonteFiche, ctx: never) => RefonteFiche) => (b = K.gesteRefonte(b, f as never));
    gk((c, r, ctx) => R.prendreRang(c, r, ctx, 'guerrier.maitre-d-armes'));
    gk((c, r, ctx) => R.prendreRang(c, r, ctx, 'guerrier.maitre-d-armes'));
    gk((_c, r) => R.poserChoix(r, 'caracEnPlus', 'CON'));
    const avec = K.ficheV2DepuisBrouillon(b, 'alice', 1);
    const sans = K.ficheV2DepuisBrouillon({ ...b, refonte: { ...b.refonte!, caracEnPlus: 'FOR' } }, 'alice', 1);
    // CON 13 → 14 : +1 au mod de CON, donc +1 PV par niveau (2 niveaux).
    expect(new CalculsPersonnage(ficheCalculDepuisFiche(avec)).mod('CON')).toBe(new CalculsPersonnage(ficheCalculDepuisFiche(sans)).mod('CON') + 1);
    expect(avec.pvMax).toBe(sans.pvMax + 2);
    // Montée du niveau 1 au 2 qui prend le Spécimen : la même fiche que la création directe.
    let b1: Brouillon = { ...C.brouillonVide(), nom: 'Brann', classe: 'guerrier', race: 'nain', caracsLibres: { FOR: 3, CON: 2, DEX: 1 } };
    b1 = K.gesteRefonte(b1, (c, r, ctx) => R.prendreRang(c, r, ctx, 'guerrier.maitre-d-armes'));
    const n1 = { ...K.ficheV2DepuisBrouillon(b1, 'alice', 1), progression: { crans: cransRequis(1) ?? 0 } };
    let m = M.lancerPV(M.ouvrirMonteeRefonte(n1), () => 0.5);
    m = M.prendreRang(m, 'guerrier.maitre-d-armes');
    m = M.poserChoix(m, 'caracEnPlus', 'CON');
    const monte = M.appliquerMonteeRefonte(n1, m).fiche;
    expect(monte.pvMax).toBe(avec.pvMax);
    expect(monte.refonte).toEqual(avec.refonte);
  });

  it('création : PP actuels = réserve pleine (Magicien) ; aucun PP sans réserve (Guerrier)', () => {
    let b: Brouillon = { ...C.brouillonVide(), nom: 'Ilyra', classe: 'magicien', race: 'humain', caracsLibres: { INT: 3, CON: 3 } };
    b = K.gesteRefonte(b, (_c, r) => ({ ...r, ecole: 'evocation', elementDepart: 'feu', mineurs: ['mineur.lumiere', 'mineur.main-du-mage'] }));
    const f = K.ficheV2DepuisBrouillon(b, 'alice', 1);
    expect(f.ppActuel).toBe(4 + 2 + 2 * R.contexteDe(f, classe('magicien')).modMagie);
    const g = K.ficheV2DepuisBrouillon({ ...C.brouillonVide(), nom: 'Torg', classe: 'guerrier', race: 'nain', caracsLibres: { FOR: 3, CON: 3 } }, 'alice', 1);
    expect('ppActuel' in g).toBe(false);
  });
});

describe('jauges (7a à 10a)', () => {
  const pretre = () => convertie('Hermione', 'pretre', { rangs: { 'pretre.guerison': 1 } });

  it('ressource de classe et Sacré avec leur maximum, puis Plongée (sans plafond) et Corruption d’Âme (sur 10)', () => {
    expect(A.jaugesDeLaFiche(pretre()).map((j) => [j.cle, j.actuel, j.max])).toEqual([
      ['sacre', 3, 3],
      ['plongee', 0, null],
      ['corruptionAme', 0, 10],
    ]);
    const k = convertie('Karlach', 'guerrier', {});
    expect(A.jaugesDeLaFiche(k)[0]).toMatchObject({ cle: 'endurance', actuel: 4, max: 4 });
  });

  it('bornes : 0 et le maximum', () => {
    const f = pretre();
    expect(A.changerJauge(f, 'sacre', 9).jauges.sacre).toBe(3);
    expect(A.changerJauge(f, 'sacre', -2).jauges.sacre).toBe(0);
    expect(A.changerJauge(f, 'plongee', 40).jauges.plongee).toBe(40);
  });

  it('Plongée qui dépasse un multiple de 6 : +1 Corruption d’Âme par multiple ; palier de mutation annoncé (9a, 10a)', () => {
    const f = pretre();
    const sept = A.changerJauge(f, 'plongee', 7);
    expect(sept.jauges).toMatchObject({ plongee: 7, corruptionAme: 1 });
    expect(sept.annonces).toEqual(['La Plongée dépasse 6 : +1 Corruption d’Âme.', 'Palier de mutation 1 franchi : mutation à tirer avec le MJ.']);
    expect(A.changerJauge(f, 'plongee', 6).jauges.corruptionAme).toBe(0);
    const f6 = { ...f, refonte: { ...f.refonte, jauges: { ...f.refonte.jauges, plongee: 5 } } };
    expect(A.changerJauge(f6, 'plongee', 13).jauges.corruptionAme).toBe(2);
    const neuf = { ...f, refonte: { ...f.refonte, jauges: { ...f.refonte.jauges, corruptionAme: 9 } } };
    expect(A.changerJauge(neuf, 'corruptionAme', 10).annonces).toEqual(['Rupture : la Corruption d’Âme atteint 10, voir avec le MJ.']);
    expect(A.changerJauge(neuf, 'corruptionAme', 12).jauges.corruptionAme).toBe(10);
    expect(A.finDuCombat(sept.jauges ? { ...f, refonte: { ...f.refonte, jauges: sept.jauges } } : f)).toMatchObject({ plongee: 0, corruptionAme: 1 });
  });

  it('écriture : seul refonte.jauges, validé par le schéma', async () => {
    const f = pretre();
    await modifierJauges('p-1', { ...f.refonte.jauges, sacre: 1 });
    expect(appels).toEqual([{ fn: 'updateDoc', chemin: 'tables/t1/persos/p-1', donnees: { 'refonte.jauges': { ...f.refonte.jauges, sacre: 1 } } }]);
    await expect(modifierJauges('p-1', { ...f.refonte.jauges, plongee: -1 })).rejects.toThrow();
    expect(appels).toHaveLength(1);
  });
});
