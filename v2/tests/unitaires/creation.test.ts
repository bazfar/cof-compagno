import { describe, expect, it } from 'vitest';
import { CalculsPersonnage, statistiquesFiche } from '../../src/lib/regles/calculs';
import {
  ajusterCarac,
  annulerHorsProfil,
  apprendreSort,
  avertissementsCreation,
  brouillonVide,
  capacitesRaceDuBrouillon,
  caracsDuBrouillon,
  changerNiveau,
  CHOIX_CAPACITES,
  choixRaciauxRequis,
  choisirCercle,
  choisirClasse,
  choisirOptionRaciale,
  choisirRace,
  choisirVariante,
  coutHorsProfil,
  debloquerHorsProfil,
  donsRequis,
  erreursCreation,
  ficheCalculDuBrouillon,
  ficheDepuisBrouillon,
  historiquePV,
  kitDepart,
  lancerJetPV,
  pointsVoie,
  polyvalenceAcquise,
  prendreDon,
  prendreRang,
  rangMaxDansVoie,
  rangOffert,
  rangRaceMax,
  RefusCreation,
  retirerDon,
  retirerRang,
  sortsAccordes,
  sortsAChoisir,
  sortsProposes,
  varianteRequise,
  voiesOuvertes,
  type Brouillon,
} from '../../src/lib/regles/creation';
import { constantes } from '../../src/lib/regles/donnees';
import { ficheCalculDepuisFiche } from '../../src/lib/regles/fiche-document';
import { schemaFiche } from '../../src/lib/schemas/fiche';

/*
 * Règles de l'assistant de création (lot L2.2a). Décisions du 16/10 :
 * 1a bugs v1 corrigés, 2a un jet de PV par niveau avec la CON effective,
 * 3a dons, sorts et Cercle dans l'assistant, 4b voie raciale gratuite,
 * un rang tous les 2 niveaux (3, 5, 7, 9), acquis d'office.
 */

const constantesOrdre = { classes: constantes.ordreClasses, races: constantes.ordreRaces };

/** Applique une suite de gestes à un brouillon vide. */
const avec = (...gestes: ((b: Brouillon) => Brouillon)[]) => gestes.reduce((b, g) => g(b), brouillonVide());
const des = (...valeurs: number[]) => {
  let i = 0;
  return () => valeurs[i++ % valeurs.length]!;
};
/** Répartit les 6 points libres : 3 + 3. */
const sixPoints = (a: 'FOR' | 'DEX' | 'CON' | 'INT' | 'SAG' | 'CHA', c: typeof a) => (b: Brouillon) =>
  [a, a, a, c, c, c].reduce((x, k) => ajusterCarac(x, k, 1), b);

/** Guerrier nain niveau 1 complet. */
const guerrierNain = () =>
  avec(
    (b) => ({ ...b, nom: 'Borin' }),
    (b) => choisirClasse(b, 'guerrier'),
    (b) => choisirRace(b, 'nain'),
    sixPoints('FOR', 'CON'),
    (b) => prendreRang(b, 'guerrier.soldat', 1),
    (b) => prendreRang(b, 'guerrier.elite', 1, 'FOR'),
  );

describe('caractéristiques : base 10, bonus de classe, 6 points libres (+3 au plus)', () => {
  it('le guerrier a FOR +2 et CON +1 ; les points libres s’ajoutent', () => {
    const b = avec((x) => choisirClasse(x, 'guerrier'), sixPoints('FOR', 'CON'));
    expect(caracsDuBrouillon(b)).toEqual({ FOR: 15, DEX: 10, CON: 14, INT: 10, SAG: 10, CHA: 10 });
  });

  it('refuse +4 sur une caractéristique, un 7ᵉ point et un retrait sous zéro', () => {
    const b = avec((x) => choisirClasse(x, 'guerrier'), sixPoints('FOR', 'CON'));
    expect(() => ajusterCarac(b, 'FOR', 1)).toThrow(RefusCreation);
    expect(() => ajusterCarac(b, 'DEX', 1)).toThrow('Plus de points libres');
    expect(() => ajusterCarac(brouillonVide(), 'DEX', -1)).toThrow(RefusCreation);
  });
});

describe('voie raciale (décision 4b) : gratuite, un rang tous les 2 niveaux', () => {
  it('rang 1 au niveau 1, 2 au 3, 3 au 5, 4 au 7, 5 au 9 et au-delà', () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 20].map(rangRaceMax)).toEqual([1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5]);
  });

  it('les rangs sont acquis d’office et ne coûtent aucun point de capacité', () => {
    const b = changerNiveau(guerrierNain(), 5);
    expect(capacitesRaceDuBrouillon(b)).toEqual([1, 2, 3]);
    expect(pointsVoie(b)).toEqual({ total: 10, depenses: 2, restants: 8 });
  });

  it('les choix raciaux sont demandés quand leur rang arrive : Sang de Guerre au niveau 3', () => {
    const b = avec((x) => choisirClasse(x, 'chevalier'), (x) => choisirRace(x, 'demi_orc'));
    expect(erreursCreation(b).some((e) => e.includes('rang racial'))).toBe(false);
    const n3 = changerNiveau(b, 3);
    expect(erreursCreation(n3)).toContain('Fais le choix du rang racial 2.');
    expect(() => choisirOptionRaciale(n3, 2, 'DEX')).toThrow(RefusCreation);
    expect(choisirOptionRaciale(n3, 2, 'CON').capacitesRaceChoix).toEqual({ '2': 'CON' });
    // Redescendre au niveau 1 retire le choix devenu inaccessible.
    expect(changerNiveau(choisirOptionRaciale(n3, 2, 'CON'), 1).capacitesRaceChoix).toEqual({});
  });

  it('la nation elfique est exigée dès le rang 3 (niveau 5), pas avant', () => {
    const elfe = avec((x) => choisirClasse(x, 'magicien'), (x) => choisirRace(x, 'elfe'));
    expect(erreursCreation(changerNiveau(elfe, 4))).not.toContain('Choisis la nation elfique.');
    expect(erreursCreation(changerNiveau(elfe, 5))).toContain('Choisis la nation elfique.');
    expect(() => choisirVariante(elfe, 'atlante')).toThrow(RefusCreation);
    expect(choisirVariante(elfe, 'aelindra').raceVariante).toBe('aelindra');
  });
});

describe('voies : 2 points par niveau, rangs 1-2 à 1 point, 3-5 à 2 points, dans l’ordre', () => {
  it('un niveau 1 prend deux rangs 1, pas un troisième', () => {
    const b = guerrierNain();
    expect(pointsVoie(b).restants).toBe(0);
    expect(() => prendreRang(b, 'guerrier.peuple', 1)).toThrow('Pas assez de points');
  });

  it('ordre obligatoire, retrait par le haut seulement', () => {
    const b = changerNiveau(guerrierNain(), 3);
    expect(() => prendreRang(b, 'guerrier.soldat', 3)).toThrow('dans l’ordre');
    const r2 = prendreRang(b, 'guerrier.soldat', 2);
    expect(() => retirerRang(r2, 'guerrier.soldat', 1)).toThrow('rangs supérieurs');
    expect(retirerRang(r2, 'guerrier.soldat', 2).capacites).toEqual(b.capacites);
  });

  it('les capacités à choix exigent leur option', () => {
    const b = avec((x) => choisirClasse(x, 'guerrier'));
    expect(() => prendreRang(b, 'guerrier.elite', 1)).toThrow('demande un choix');
    expect(() => prendreRang(b, 'guerrier.elite', 1, 'INT')).toThrow('demande un choix');
    expect(() => prendreRang(b, 'guerrier.soldat', 1, 'FOR')).toThrow('aucun choix');
  });

  it('baisser le niveau garde les voies mais bloque l’enregistrement (v1 : accepté)', () => {
    const b = prendreRang(prendreRang(changerNiveau(guerrierNain(), 2), 'guerrier.soldat', 2), 'guerrier.peuple', 1);
    const n1 = changerNiveau(b, 1);
    expect(pointsVoie(n1).restants).toBe(-2);
    expect(erreursCreation(n1).some((e) => e.startsWith('Trop de points de capacité'))).toBe(true);
  });
});

describe('Polyvalence (Humain, rang 3 au niveau 5) : un rang offert dans une voie de classe', () => {
  const humain = (niveau: number) => avec((x) => choisirClasse(x, 'guerrier'), (x) => choisirRace(x, 'humain'), (x) => changerNiveau(x, niveau));

  it('acquise au niveau 5, pas avant ; seulement pour l’Humain', () => {
    expect(polyvalenceAcquise(humain(4))).toBe(false);
    expect(polyvalenceAcquise(humain(5))).toBe(true);
    expect(polyvalenceAcquise(changerNiveau(guerrierNain(), 5))).toBe(false);
    expect(() => prendreRang(humain(4), 'guerrier.soldat', 1, undefined, true)).toThrow('Polyvalence');
  });

  it('le rang offert ne coûte rien, même un rang 3 ; un seul ; signalé tant qu’il manque', () => {
    let b = humain(5);
    expect(avertissementsCreation(b)).toContain('Polyvalence : le rang offert reste à choisir.');
    b = prendreRang(prendreRang(b, 'guerrier.soldat', 1), 'guerrier.soldat', 2);
    b = prendreRang(b, 'guerrier.soldat', 3, undefined, true);
    expect(pointsVoie(b)).toEqual({ total: 10, depenses: 2, restants: 8 });
    expect(rangOffert(b)).toEqual({ id: 'guerrier.soldat.3', offert: true });
    expect(() => prendreRang(b, 'guerrier.peuple', 1, undefined, true)).toThrow('déjà choisi');
    expect(avertissementsCreation(b)).not.toContain('Polyvalence : le rang offert reste à choisir.');
  });

  it('jamais hors profil ; les capacités à choix gardent leur choix', () => {
    const b = debloquerHorsProfil(humain(5), 'chevalier.noble');
    expect(() => prendreRang(b, 'chevalier.noble', 1, undefined, true)).toThrow('voie de ta classe');
    expect(prendreRang(b, 'guerrier.elite', 1, 'DEX', true).capacites.at(-1)).toEqual({ id: 'guerrier.elite.1', choix: 'DEX', offert: true });
  });

  it('niveau redescendu sous 5 : le rang offert redevient payé, et le budget est vérifié', () => {
    const b = prendreRang(humain(5), 'guerrier.soldat', 1, undefined, true);
    const n4 = changerNiveau(b, 4);
    expect(n4.capacites).toEqual([{ id: 'guerrier.soldat.1' }]);
    expect(pointsVoie(n4).depenses).toBe(1);
  });

  it('la fiche garde la marque « offert » et ses points restants sont les mêmes que pendant la création', () => {
    let b = avec((x) => ({ ...x, nom: 'Aldric' }), (x) => choisirClasse(x, 'guerrier'), (x) => choisirRace(x, 'humain'), sixPoints('FOR', 'CON'));
    b = changerNiveau(b, 5);
    b = [1, 2, 3, 4].reduce((y) => lancerJetPV(y, des(0.5)), b);
    b = prendreDon(b, 'robuste');
    b = prendreRang(b, 'guerrier.elite', 1, 'FOR', true);
    const fiche = ficheDepuisBrouillon(b, 'u', 1);
    expect(fiche.capacites).toEqual([{ id: 'guerrier.elite.1', choix: 'FOR', offert: true }]);
    expect(statistiquesFiche(ficheCalculDepuisFiche(fiche)).pointsVoie).toEqual({ total: 10, depenses: 0, restants: 10 });
  });
});

describe('voies hors profil : 2 points dans la famille, 4 sinon, annulables', () => {
  it('coûts et déblocage', () => {
    const b = changerNiveau(avec((x) => choisirClasse(x, 'guerrier')), 4);
    expect(coutHorsProfil(b, 'chevalier.noble')).toBe(2);
    expect(coutHorsProfil(b, 'magicien.magie-elementaire')).toBe(4);
    const d = debloquerHorsProfil(b, 'chevalier.noble');
    expect(pointsVoie(d)).toMatchObject({ depenses: 2, restants: 6 });
    expect(prendreRang(d, 'chevalier.noble', 1).capacites).toEqual([{ id: 'chevalier.noble.1' }]);
  });

  it('une Voie du chaos n’est jamais proposée hors profil', () => {
    const b = changerNiveau(avec((x) => choisirClasse(x, 'guerrier')), 4);
    expect(() => debloquerHorsProfil(b, 'chevalier.chaos')).toThrow(RefusCreation);
  });

  it('annuler un déblocage rend ses points, seulement si aucun rang n’y est pris (v1 : impossible)', () => {
    const b = debloquerHorsProfil(changerNiveau(avec((x) => choisirClasse(x, 'guerrier')), 4), 'chevalier.noble');
    const avecRang = prendreRang(b, 'chevalier.noble', 1);
    expect(() => annulerHorsProfil(avecRang, 'chevalier.noble')).toThrow('Retire d’abord');
    expect(pointsVoie(annulerHorsProfil(b, 'chevalier.noble')).restants).toBe(8);
  });

  it('Initié aux arcanes : un déblocage gratuit vers une classe à magie d’INT, perdu avec le don', () => {
    const b = avec((x) => choisirClasse(x, 'guerrier'), (x) => changerNiveau(x, 4), (x) => prendreDon(x, 'initie_arcanes'));
    expect(coutHorsProfil(b, 'magicien.magie-elementaire')).toBe(0);
    const d = prendreRang(debloquerHorsProfil(b, 'magicien.magie-elementaire'), 'magicien.magie-elementaire', 1);
    expect(coutHorsProfil(d, 'necromancien.outre-tombe')).toBe(4);
    const sansDon = retirerDon(d, 'initie_arcanes');
    expect(sansDon.voiesHorsProfil).toEqual([]);
    expect(sansDon.capacites).toEqual([]);
  });
});

describe('points de vie (décision 2a) : un jet par niveau, CON effective', () => {
  it('niveau 1 : dé max + mod CON + 2 (code v1, écart connu avec les règles validées)', () => {
    const b = guerrierNain(); // CON 14 → +2 ; nain rang 1 : +2 PV par niveau
    expect(ficheCalculDuBrouillon(b).pvMax).toBe(10 + 2 + 2 + 2);
  });

  it('au-dessus du niveau 1, chaque niveau exige son jet ; les bonus par niveau comptent le vrai niveau (v1 : niveau 1)', () => {
    const b = changerNiveau(guerrierNain(), 3);
    expect(erreursCreation(b)).toContain('Lance les PV des niveaux 2 à 3.');
    const lance = lancerJetPV(lancerJetPV(b, des(0.55)), des(0)); // d10 → 6, puis 1
    expect(lance.jetsPV).toEqual([6, 1]);
    expect(() => lancerJetPV(lance)).toThrow('déjà leur jet');
    expect(historiquePV(lance).map((j) => j.total)).toEqual([8, 3]);
    // 14 au niveau 1 + 8 + 3, nain +2 × 3 niveaux
    expect(ficheCalculDuBrouillon(lance).pvMax).toBe(14 + 8 + 3 + 6);
  });

  it('le modificateur de CON est l’effectif et suit les changements après coup', () => {
    const b = avec(
      (x) => choisirClasse(x, 'chevalier'),
      (x) => choisirRace(x, 'demi_orc'),
      (x) => changerNiveau(x, 3),
      (x) => lancerJetPV(x, des(0.35)), // d10 → 4
      (x) => lancerJetPV(x, des(0.35)),
    );
    expect(historiquePV(b)[0]).toMatchObject({ jet: 4, modCON: 0, total: 4 });
    expect(historiquePV(choisirOptionRaciale(b, 2, 'CON'))[0]).toMatchObject({ modCON: 0 }); // 10 + 1 = 11 → 0
    const plusCon = ajusterCarac(choisirOptionRaciale(b, 2, 'CON'), 'CON', 1); // 12 brut → 13 effectif → +1
    expect(historiquePV(plusCon)[0]).toMatchObject({ modCON: 1, total: 5 });
  });
});

describe('dons (décision 3a) : choisis dans l’assistant aux niveaux 4, 8 et 12', () => {
  it('nombre requis et refus au-delà', () => {
    const b = changerNiveau(guerrierNain(), 4);
    expect(erreursCreation(b)).toContain('Choisis 1 don(s).');
    const d = prendreDon(b, 'robuste');
    expect(() => prendreDon(d, 'alerte')).toThrow('Aucun don');
    expect(() => prendreDon(changerNiveau(guerrierNain(), 8), 'inconnu')).toThrow('Don inconnu');
  });

  it('Robuste ajoute 2 PV par niveau, au vrai niveau', () => {
    const b = changerNiveau(guerrierNain(), 4);
    const jets = { ...b, jetsPV: [5, 5, 5] };
    expect((ficheCalculDuBrouillon(prendreDon(jets, 'robuste')).pvMax ?? 0) - (ficheCalculDuBrouillon(jets).pvMax ?? 0)).toBe(8);
  });

  it('Amélioration de caractéristique : deux caractéristiques différentes sous leur plafond ; Athlète : FOR ou DEX', () => {
    const b = changerNiveau(guerrierNain(), 4);
    expect(() => prendreDon(b, 'amelioration_carac', ['FOR', 'FOR'])).toThrow(RefusCreation);
    expect(prendreDon(b, 'amelioration_carac', ['FOR', 'DEX']).donsChoix).toEqual({ amelioration_carac: ['FOR', 'DEX'] });
    expect(() => prendreDon(b, 'athlete', 'CON')).toThrow('FOR ou DEX');
    expect(() => prendreDon(b, 'robuste', 'FOR')).toThrow('aucun choix');
  });

  it('baisser le niveau sous 4 retire le don et son choix', () => {
    const b = prendreDon(changerNiveau(guerrierNain(), 4), 'athlete', 'DEX');
    expect(changerNiveau(b, 3)).toMatchObject({ dons: [], donsChoix: {} });
  });
});

describe('sorts et Cercle (décision 3a)', () => {
  const magicien = () => avec((x) => choisirClasse(x, 'magicien'), (x) => choisirRace(x, 'humain'));

  it('plafond d’inscription : 4 au niveau 1, +1 par niveau au-delà du 3 ; sorts accordés compris', () => {
    expect(sortsAChoisir(magicien())).toBe(4);
    expect(sortsAChoisir(changerNiveau(magicien(), 6))).toBe(7);
    const pretre = avec((x) => choisirClasse(x, 'pretre'), (x) => prendreRang(x, 'pretre.guerison', 1));
    expect(sortsAccordes(pretre)).toEqual(['imposition_des_mains']);
    expect(sortsAChoisir(pretre)).toBe(3);
  });

  it('seuls les sorts de la liste de la classe, d’un rang permis par le niveau', () => {
    const proposes = sortsProposes(magicien());
    expect(proposes).toContain('trait_de_feu');
    expect(proposes.length).toBeGreaterThan(0);
    expect(sortsProposes(avec((x) => choisirClasse(x, 'guerrier')))).toEqual([]);
    expect(sortsAChoisir(avec((x) => choisirClasse(x, 'barde')))).toBe(0);
  });

  it('plafond atteint : refus', () => {
    let b = magicien();
    for (const s of sortsProposes(b).slice(0, 4)) b = apprendreSort(b, s);
    expect(sortsAChoisir(b)).toBe(0);
    expect(() => apprendreSort(b, sortsProposes(b)[0]!)).toThrow('Plafond');
  });

  it('Cercle : Prêtre seulement ; son sort gratuit sort des sorts appris', () => {
    expect(() => choisirCercle(magicien(), 'vie')).toThrow(RefusCreation);
    const pretre = avec((x) => choisirClasse(x, 'pretre'), (x) => apprendreSort(x, 'benediction'));
    const vie = choisirCercle(pretre, 'vie');
    expect(vie.sorts).toEqual([]);
    expect(sortsAccordes(vie)).toContain('benediction');
  });
});

describe('kit de départ (bug v1 corrigé : il n’écrase plus l’équipement mis à la main)', () => {
  it('arme à deux mains dans les deux mains ; accessoire de Grimoire et consommables dans le sac', () => {
    const kit = kitDepart('chasseur');
    expect(kit.equipement.main_droite?.id).toBe('arc_long');
    expect(kit.equipement.main_gauche).toBe(kit.equipement.main_droite);
    expect(kitDepart('magicien').inventaire.map((o) => o.id)).toEqual(['manuel_incantation', 'parchemin_trait_de_feu', 'potion_soin']);
  });

  it('le magicien créé a ses 6 emplacements de Grimoire (manuel Commun du kit)', () => {
    const calc = ficheCalculDuBrouillon(avec((x) => choisirClasse(x, 'magicien')));
    expect(new CalculsPersonnage(calc).slotsGrimoire()).toBe(6);
  });

  it('un objet mis à la main remplace le kit sur son emplacement, et lui seul', () => {
    const b = { ...avec((x) => choisirClasse(x, 'guerrier')), equipementManuel: { main_droite: { id: 'dague', nom: 'Dague' } } };
    const eq = ficheCalculDuBrouillon(b).equipement!;
    expect(eq.main_droite?.id).toBe('dague');
    expect(eq.torse?.id).toBe('armure_cuir');
  });

  it('changer de classe repart de zéro sur les voies et sorts, pas sur les caractéristiques libres', () => {
    const b = choisirClasse(guerrierNain(), 'magicien');
    expect(b).toMatchObject({ capacites: [], voiesHorsProfil: [], sorts: [], caracsLibres: { FOR: 3, CON: 3 } });
  });
});

describe('enregistrement : la fiche créée', () => {
  it('un brouillon incomplet est refusé avec toutes ses erreurs', () => {
    expect(erreursCreation(brouillonVide())).toEqual([
      'Choisis une classe.',
      'Choisis une race.',
      'Répartis tes 6 points de caractéristique.',
      'Donne un nom au personnage.',
    ]);
    expect(() => ficheDepuisBrouillon(brouillonVide(), 'u', 1)).toThrow(RefusCreation);
  });

  it('un brouillon complet donne une fiche valide, dont les statistiques sont celles affichées pendant la création', () => {
    const b = avec(
      (x) => ({ ...x, nom: 'Hilda' }),
      (x) => choisirClasse(x, 'pretre'),
      (x) => choisirRace(x, 'demi_orc'),
      sixPoints('SAG', 'CON'),
      (x) => changerNiveau(x, 5),
      (x) => choisirOptionRaciale(x, 2, 'CON'),
      (x) => [1, 2, 3, 4].reduce((y) => lancerJetPV(y, des(0.5)), x),
      (x) => prendreDon(x, 'robuste'),
      (x) => prendreRang(x, 'pretre.guerison', 1),
      (x) => prendreRang(x, 'pretre.guerison', 2),
      (x) => prendreRang(x, 'pretre.guerison', 3),
      (x) => prendreRang(x, 'pretre.conversion', 1),
      (x) => prendreRang(x, 'pretre.conversion', 2),
      (x) => prendreRang(x, 'pretre.exorcisme', 1),
      (x) => prendreRang(x, 'pretre.exorcisme', 2),
      (x) => choisirCercle(x, 'vie'),
      (x) => apprendreSort(x, sortsProposes(x)[0]!),
    );
    expect(erreursCreation(b)).toEqual([]);
    const fiche = ficheDepuisBrouillon(b, 'uid-joueur', 7);
    expect(schemaFiche.parse(fiche)).toEqual(fiche);
    expect(fiche).toMatchObject({
      proprietaireUid: 'uid-joueur', creeLe: 7, niveau: 5, capacitesRace: [1, 2, 3],
      capacitesRaceChoix: { '2': 'CON' }, piecesOr: 0, progression: { crans: 0 }, modules: {},
    });
    expect(fiche.pvActuel).toBe(fiche.pvMax);
    expect(fiche.ppActuel).toBe(new CalculsPersonnage(ficheCalculDepuisFiche(fiche)).calculerPPMax());
    expect(statistiquesFiche(ficheCalculDepuisFiche(fiche))).toEqual(statistiquesFiche(ficheCalculDuBrouillon(b)));
    expect(new CalculsPersonnage(ficheCalculDepuisFiche(fiche)).pvCalcule()).toBe(fiche.pvMax);
    // Des points et des sorts restent : signalé, pas bloquant.
    expect(avertissementsCreation(b)).toEqual(['2 point(s) de capacité non dépensé(s).', '2 sort(s) encore à apprendre.']);
  });

  it('avertissements sans blocage : points non dépensés, Voie du chaos', () => {
    const b = avec((x) => choisirClasse(x, 'guerrier'), (x) => prendreRang(x, 'guerrier.chaos', 1));
    expect(avertissementsCreation(b)).toEqual(['1 point(s) de capacité non dépensé(s).', 'Voie du chaos : à valider avec le MJ.']);
  });
});

describe('toutes les classes × toutes les races, aux niveaux 1, 5 et 9', () => {
  const classes = constantesOrdre.classes;
  const racesListe = constantesOrdre.races;
  /** Complète un brouillon automatiquement : premières options, premiers rangs, premiers dons et sorts. */
  function completer(classe: string, race: string, niveau: number): Brouillon {
    let b = avec((x) => ({ ...x, nom: `${classe} ${race}` }), (x) => choisirClasse(x, classe), (x) => choisirRace(x, race), sixPoints('DEX', 'CON'));
    b = changerNiveau(b, niveau);
    for (const [rang, options] of choixRaciauxRequis(b)) b = choisirOptionRaciale(b, rang, options[0]!);
    if (varianteRequise(b)) b = choisirVariante(b, 'aetharion');
    while (b.jetsPV.length < niveau - 1) b = lancerJetPV(b, des(0.5));
    while (b.dons.length < donsRequis(b)) b = prendreDon(b, ['robuste', 'alerte', 'chanceux'][b.dons.length]!);
    // Rangs dans l'ordre, voie après voie, tant qu'il reste des points (hors Voie du chaos et choix).
    for (const voie of voiesOuvertes(b).filter((v) => !v.endsWith('.chaos'))) {
      for (let r = 1; r <= 5; r++) {
        try {
          b = prendreRang(b, voie, r, CHOIX_CAPACITES[`${voie}.${r}`]?.[0]);
        } catch {
          break;
        }
      }
    }
    if (polyvalenceAcquise(b)) {
      const voie = voiesOuvertes(b).find((v) => !v.endsWith('.chaos') && !CHOIX_CAPACITES[`${v}.${rangMaxDansVoie(b, v) + 1}`] && rangMaxDansVoie(b, v) < 5)!;
      b = prendreRang(b, voie, rangMaxDansVoie(b, voie) + 1, undefined, true);
    }
    while (sortsAChoisir(b) > 0 && sortsProposes(b).length) b = apprendreSort(b, sortsProposes(b)[0]!);
    return b;
  }

  it.each(classes.flatMap((c) => racesListe.flatMap((r) => [1, 5, 9].map((n) => [c, r, n] as const))))(
    '%s %s niveau %i : fiche valide, points dépensés sans excès, statistiques identiques',
    (classe, race, niveau) => {
      const b = completer(classe, race, niveau);
      expect(erreursCreation(b)).toEqual([]);
      expect(pointsVoie(b).restants).toBeGreaterThanOrEqual(0);
      const fiche = ficheDepuisBrouillon(b, 'u', 1);
      expect(fiche.capacitesRace).toHaveLength(rangRaceMax(niveau));
      expect(statistiquesFiche(ficheCalculDepuisFiche(fiche))).toEqual(statistiquesFiche(ficheCalculDuBrouillon(b)));
    },
  );
});
