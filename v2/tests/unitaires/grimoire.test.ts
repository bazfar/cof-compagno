import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/*
 * Le grimoire (lot G1) : décisions de Thomas du 22/10/2026, 1a (une section
 * du joueur, lue par le MJ depuis la fiche), 2a (toutes les classes qui ont
 * des verbes ou des mineurs), 3a (l'effet en combat généré depuis les
 * données), 7 (chaque palier ouvre des possibilités hors combat, sans effet
 * automatique ; le reste s'apprécie entre le joueur et le MJ).
 */

const R = await import('../../src/lib/fiche/refonte');
const G = await import('../../src/lib/fiche/grimoire');
const T = await import('../../src/lib/fiche/texte-sort');
const { ficheDepuisV1 } = await import('../../src/lib/regles/fiche-document');
const { actionParId, classeParId } = await import('../../src/regles');
const { actionAuPalier, paliersDefinis } = await import('../../src/lib/effets/paliers');
type FicheV1 = import('../../src/lib/schemas/fiche').FicheV1;
type FicheV2 = import('../../src/lib/schemas/fiche').FicheV2;
type RefonteFiche = import('../../src/lib/schemas/fiche').RefonteFiche;
type Action = import('../../src/lib/schemas/effets').Action;

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- forme v1 non typée
const FICHES: any[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const convertie = (nom: string, id: string, choix: Partial<RefonteFiche>, patch: Partial<FicheV1> = {}): FicheV2 => {
  const v1 = { ...ficheDepuisV1(FICHES.find((f) => f.nom.startsWith(nom)), 'u', 1).fiche, ...patch };
  return R.convertirFiche(v1, { ...R.refonteVierge(classeParId.get(id)!, v1.niveau), ...choix });
};
const kylhian = (): FicheV2 => {
  const f = convertie('Kylhian', 'magicien', { ecole: 'evocation', elementDepart: 'feu', mineurs: ['mineur.trait-arcanique', 'mineur.lumiere'], rangs: { 'magicien.ecole': 4 } }, { niveau: 5 });
  return { ...f, octrois: { ...f.octrois, verbes: [{ id: 'illusion.leurre', maitrise: 'nonMaitrise' }], elements: { glace: 'initie' } } } as FicheV2;
};
const verbeDe = (g: NonNullable<ReturnType<typeof G.grimoireDeLaFiche>>, id: string) => g.verbes.find((v) => v.id === id)!;
const sorts = [...actionParId.values()].filter((a) => a.nature === 'verbe' || a.nature === 'mineur');
const auPalier = (a: Action, p: 'I' | 'II' | 'III') => (p === 'I' ? a : actionAuPalier(a, p));

describe('texte du sort en combat (3a)', () => {
  it('chaque verbe et chaque mineur, à chaque palier, donne des lignes lisibles', () => {
    expect(sorts.length).toBeGreaterThan(50);
    for (const a of sorts)
      for (const p of paliersDefinis(a)) {
        const l = T.texteDuSort(auPalier(a, p));
        expect(l.length, `${a.id} ${p}`).toBeGreaterThan(0);
        for (const x of l) {
          expect(x.trim(), `${a.id} ${p}`).not.toBe('');
          expect(x, `${a.id} ${p}`).not.toMatch(/undefined|null|NaN|\[object/);
        }
      }
  });

  it('Missile, Choc, Leurre : cibles, sauvegarde, durée et effets', () => {
    const a = (id: string) => actionParId.get(id)!;
    expect(T.texteDuSort(a('evocation.missile'))).toEqual(['1 cible ennemie, portée 10 cases', '1d6 dégâts magiques']);
    expect(T.texteDuSort(auPalier(a('evocation.missile'), 'II'))[0]).toBe('2 cibles ennemies, portée 10 cases');
    expect(T.texteDuSort(a('evocation.choc'))).toEqual([
      '1 cible ennemie, portée 6 cases',
      'Sauvegarde de FOR : moitié',
      '2d6 dégâts magiques, pleins jusqu’à 3 cases, moitié au-delà',
      'Repousse de 1 case, si la sauvegarde est ratée',
    ]);
    expect(T.texteDuSort(auPalier(a('illusion.leurre'), 'II'))).toEqual([
      '1 cible ennemie, portée 6 cases',
      'Sauvegarde de Volonté : annule',
      'Concentration, 2 rounds',
      'Leurré, 2 rounds',
      'Le leurre se déplace de 2 cases par round.',
    ]);
  });

  it('zones depuis le lanceur, malus en dés, ressources nommées, invocation par élément', () => {
    const tout = (id: string) => T.texteDuSort(actionParId.get(id)!);
    expect(tout('evocation.rayon')).toContain('Zone : ligne de 5 cases depuis le lanceur, alliés compris');
    expect(tout('malediction.toucher-fletrissant')).toContain('−1d4 attaque, 2 rounds, si la sauvegarde est ratée');
    expect(tout('ames.capture-d-ame')).toContain('+1 âme (le lanceur), si l’attaque touche');
    expect(tout('invocation.serviteur')).toContain('Invoque la créature de l’élément choisi, jusqu’à la fin du combat');
    expect(tout('evocation.nova')).toContain('Sauvegarde de DEX : moitié');
    // Une sauvegarde qui n'annule ni ne divise : rien d'autre à dire.
    expect(tout('nature.enchevetrement')).toContain('Sauvegarde de FOR');
  });

  it('les éléments : rôle, effet sur un sort, dérapage', () => {
    expect(T.texteElement('feu')).toEqual({ nom: 'Feu', role: 'Dégâts dans la durée', sort: 'Brûlure 1d4 pendant 2 tours.', derapage: 'Le lanceur prend la brûlure.' });
    expect(T.texteElement('inconnu')).toBeNull();
  });
});

describe('le grimoire de la fiche', () => {
  it('Voie de l’école : les cinq nœuds, pris jusqu’au rang, tous les verbes même non appris', () => {
    const g = G.grimoireDeLaFiche(kylhian())!;
    expect(g.reservePP).toBe(20);
    expect(g.voies).toHaveLength(1);
    const v = g.voies[0]!;
    expect(v).toMatchObject({ id: 'magicien.ecole', ecole: 'Évocation', rang: 4 });
    expect(v.noeuds.map((n) => [n.rang, n.pris, n.verbe])).toEqual([
      [1, true, 'evocation.missile'],
      [2, true, 'evocation.choc'],
      [3, true, 'evocation.rayon'],
      [4, true, 'evocation.vortex'],
      [5, false, 'evocation.nova'],
    ]);
    expect(g.verbes.map((x) => [x.id, x.appris])).toEqual([
      ['evocation.missile', true],
      ['evocation.choc', true],
      ['evocation.rayon', true],
      ['evocation.vortex', true],
      ['evocation.nova', false],
    ]);
  });

  it('un verbe : palier atteint, paliers débloqués par rang, hors combat palier par palier (7), coûts', () => {
    const m = verbeDe(G.grimoireDeLaFiche(kylhian())!, 'evocation.missile');
    expect(m).toMatchObject({ nom: 'Missile', ecole: 'Évocation', maitrise: 'Maître', parGrimoire: false, echec: 0, palierAtteint: 'II', dd: null, element: true, limite: null });
    expect(m.paliers.map((p) => [p.palier, p.rang, p.atteint, p.horsCombat])).toEqual([
      ['I', 1, true, 'Briser ou couper un objet à distance.'],
      ['II', 3, true, 'Deux objets à la fois.'],
      ['III', 5, false, 'Trajectoire courbe : le trait contourne un obstacle.'],
    ]);
    expect(m.paliers[1]!.combat[0]).toBe('2 cibles ennemies, portée 10 cases');
    expect(m.cout).toEqual({ pp: 2, detail: [{ terme: 'base', valeur: 2 }, { terme: 'palier', valeur: 1 }, { terme: 'ecole', valeur: -1 }] });
    expect(m.coutHorsCombat).toBe(1);
    expect(m.surcharge).toEqual({ palier: 'III', pp: 5 });
  });

  it('un verbe non appris est montré au palier I ; le dernier verbe n’a pas de surcharge', () => {
    const g = G.grimoireDeLaFiche(kylhian())!;
    const n = verbeDe(g, 'evocation.nova');
    expect(n.appris).toBe(false);
    expect(n.palierAtteint).toBe('I');
    expect(n.paliers.every((p) => !p.atteint)).toBe(true);
    expect(verbeDe(g, 'evocation.choc').surcharge).toBeNull();
  });

  it('écoles par grimoire : palier I seulement, risque d’échec, DD de la sauvegarde', () => {
    const g = G.grimoireDeLaFiche(kylhian())!;
    expect(g.parGrimoire).toHaveLength(1);
    const l = g.parGrimoire[0]!;
    expect(l).toMatchObject({ id: 'illusion.leurre', parGrimoire: true, maitrise: 'Non maîtrisé', echec: 10, palierAtteint: 'I', surcharge: null, coutHorsCombat: 1 });
    expect(l.paliers.map((p) => [p.palier, p.atteint])).toEqual([['I', true]]);
    expect(l.cout?.pp).toBe(2);
    expect(l.dd).toBeGreaterThan(0);
  });

  it('mineurs et éléments', () => {
    const g = G.grimoireDeLaFiche(kylhian())!;
    expect(g.mineurs.map((m) => [m.id, m.palier, m.horsCombat])).toEqual([
      ['mineur.trait-arcanique', 'I', null],
      ['mineur.lumiere', 'I', 'Éclairer.'],
    ]);
    expect(g.elements.map((e) => [e.id, e.maitrise, e.risque])).toEqual([
      ['feu', 'Initié', 20],
      ['glace', 'Initié', 20],
    ]);
    expect(g.combinaisons).toEqual([]);
  });

  it('un élément maître ouvre les combinaisons avec les éléments connus', () => {
    const f = convertie('Kylhian', 'magicien', { ecole: 'evocation', elementDepart: 'feu', secondElement: 'glace', elementMaitre: 'feu', rangs: { 'magicien.ecole': 2, 'magicien.elementaire': 3 }, mineurs: ['mineur.lumiere'] });
    const g = G.grimoireDeLaFiche(f)!;
    expect(g.elements.find((e) => e.id === 'feu')).toMatchObject({ maitrise: 'Maître', risque: 0 });
    expect(g.combinaisons.length).toBeGreaterThan(0);
    for (const c of g.combinaisons) expect(c.elements).toMatch(/Feu/);
    expect(g.combinaisons.every((c) => c.elements.split(' + ').every((e) => ['Feu', 'Glace'].includes(e)))).toBe(true);
  });

  it('prêtre : les Cercles sont des voies d’école ; guerrier : pas de grimoire (2a)', () => {
    const h = G.grimoireDeLaFiche(convertie('Hermione', 'pretre', { rangs: { 'pretre.guerison': 3, 'pretre.jugement': 2 } }))!;
    expect(h.voies.map((v) => [v.id, v.rang])).toEqual(expect.arrayContaining([['pretre.guerison', 3], ['pretre.jugement', 2]]));
    expect(h.verbes.find((v) => v.id === h.voies[0]!.noeuds[0]!.verbe)?.appris).toBe(true);
    expect(G.grimoireDeLaFiche(convertie('Karlach', 'guerrier', {}))).toBeNull();
  });

  it('seconde école de l’Envoûteur : paliers plafonnés à II, pas de surcharge au plafond', () => {
    const g = G.grimoireDeLaFiche(convertie('Magnus', 'envouteur', { ecole: 'illusion', elementDepart: 'psionique', rangs: { 'envouteur.ecole': 4, 'envouteur.seconde-ecole': 5 } }, { niveau: 10 }))!;
    const charme = verbeDe(g, 'enchantement.charme');
    expect(charme.palierAtteint).toBe('II');
    expect(charme.paliers.map((p) => p.palier)).toEqual(['I', 'II']);
    expect(charme.surcharge).toBeNull();
    expect(verbeDe(g, 'illusion.leurre').surcharge).toEqual({ palier: 'III', pp: 5 });
  });

  it('un verbe accordé que la voie donne déjà n’est pas repris « par grimoire »', () => {
    const k = kylhian();
    const g = G.grimoireDeLaFiche({ ...k, octrois: { ...k.octrois, verbes: [{ id: 'evocation.missile', maitrise: 'initie' }] } } as FicheV2)!;
    expect(g.parGrimoire).toEqual([]);
    expect(g.verbes.filter((v) => v.id === 'evocation.missile')).toHaveLength(1);
  });

  it('barde : ses mineurs suffisent à ouvrir le grimoire', () => {
    const g = G.grimoireDeLaFiche(convertie('Kargash', 'barde', { rangs: { 'barde.rapiere': 1 }, mineurs: ['mineur.moquerie'] }))!;
    expect(g.mineurs.map((m) => m.id)).toEqual(['mineur.moquerie']);
  });

  it('coût avec élément et surcharge (aperçu) ; maîtrises', () => {
    expect(G.coutAvecElement('evocation.missile', 'II', 'maitre', 'initie')).toEqual({ pp: 3, detail: [{ terme: 'base', valeur: 2 }, { terme: 'palier', valeur: 1 }, { terme: 'element', valeur: 1 }, { terme: 'ecole', valeur: -1 }] });
    expect(G.coutAvecElement('evocation.missile', 'II', 'maitre', 'initie', true)?.pp).toBe(6);
    expect(G.coutAvecElement('evocation.missile', 'II', 'maitre', null)?.pp).toBe(2);
    expect(G.coutAvecElement('inconnu', 'I', 'adepte', null)).toBeNull();
    const k = kylhian();
    expect(G.maitriseDuVerbe(k, 'illusion.leurre')).toBe('nonMaitrise');
    expect(G.maitriseDuVerbe(k, 'evocation.choc')).toBe('maitre');
    expect(G.maitriseDuVerbe(k, 'inconnu')).toBe('adepte');
    expect(G.maitriseElement(k, 'glace')).toBe('initie');
    expect(G.maitriseElement(k, 'sang')).toBeNull();
  });
});
