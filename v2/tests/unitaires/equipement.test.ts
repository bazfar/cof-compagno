import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { statistiquesFiche } from '../../src/lib/regles/calculs';
import { objetParId } from '../../src/lib/regles/donnees';
import {
  ajouterDuCatalogue,
  alertesMaitrise,
  couleurRarete,
  appliquer,
  desequiper,
  effetsObjet,
  equiper,
  formuleSoin,
  jeter,
  nouvelleCle,
  RefusEquipement,
  slotsPourObjet,
  utiliser,
} from '../../src/lib/regles/equipement';
import { ficheCalculDepuisFiche, ficheDepuisV1 } from '../../src/lib/regles/fiche-document';
import { rafraichirObjet, type FicheV1 } from '../../src/lib/regles/import-v1';
import type { Fiche, ObjetFiche } from '../../src/lib/schemas/fiche';

/*
 * Équipement et sac (lot L2.4) : règles v1 reprises telles quelles, chaque
 * refus expliqué, et des changements limités aux champs touchés.
 */

const FICHES: FicheV1[] = JSON.parse(readFileSync('tests/fixtures/fiches-v1.json', 'utf8')).fiches;
const reelle = (nom: string) => ficheDepuisV1(FICHES.find((f) => f.nom.startsWith(nom))!, 'u', 1).fiche;
const objet = (id: string) => structuredClone(objetParId.get(id)!) as ObjetFiche;
/** Ajoute un objet du catalogue et rend [fiche, clé du nouvel objet]. */
function avec(f: Fiche, id: string): [Fiche, string] {
  const ch = ajouterDuCatalogue(f, id);
  return [appliquer(f, ch), Object.keys(ch.inventaire)[0]!];
}
/** Karlach, mains vides. */
const mainsVides = () => {
  const k = reelle('Karlach');
  return appliquer(appliquer(k, desequiper(k, 'main_droite')), desequiper(appliquer(k, desequiper(k, 'main_droite')), 'main_gauche'));
};

describe('où va un objet (v1 slotsPourObjet)', () => {
  it('arme : une main ou l’autre ; deux mains : les deux ; bouclier : main gauche ; armure : torse', () => {
    expect(slotsPourObjet(objet('dague'))).toEqual(['main_droite', 'main_gauche']);
    expect(slotsPourObjet(objet('arc_long'))).toEqual(['main_droite', 'main_gauche']);
    expect(slotsPourObjet(objet('bouclier_acier'))).toEqual(['main_gauche']);
    expect(slotsPourObjet(objet('demi_plaques'))).toEqual(['torse']);
  });

  it('accessoire : son emplacement, sinon collier, bague ou avant-bras ; instrument : jamais ; « botte » = jambes', () => {
    expect(slotsPourObjet(objet('anneau_force'))).toEqual(['bague']);
    expect(slotsPourObjet(objet('ceinture_force'))).toEqual(['collier', 'bague', 'avant_bras']);
    expect(slotsPourObjet(objet('flute_roseau'))).toEqual([]);
    expect(slotsPourObjet({ id: 'x', type: 'accessoire', slot: 'botte' })).toEqual(['jambe']);
    expect(slotsPourObjet(objet('potion_soin'))).toEqual([]);
  });
});

describe('équiper et retirer', () => {
  it('un changement ne touche que l’emplacement, la clé de l’objet et celle de l’ancien occupant', () => {
    const [k, cle] = avec(reelle('Karlach'), 'dague');
    const ch = equiper(k, cle, 'main_droite');
    expect(Object.keys(ch.equipement)).toEqual(['main_droite']);
    expect(ch.equipement.main_droite?.id).toBe('dague');
    expect(ch.inventaire[cle]).toBeNull();
    // L'épée longue retourne au sac sous une clé neuve, sans écraser la cupidité déjà rangée.
    const retour = Object.entries(ch.inventaire).find(([, o]) => o)!;
    expect(retour[1]?.id).toBe('epee_longue');
    expect(k.inventaire).not.toHaveProperty(retour[0]);
  });

  it('emplacement choisi sinon le premier libre : deux anneaux, une seule bague — le second remplace le premier', () => {
    let [f, cle] = avec(reelle('Karlach'), 'anneau_protection');
    f = appliquer(f, equiper(f, cle));
    expect(f.equipement.bague?.id).toBe('anneau_protection');
    let cle2: string;
    [f, cle2] = avec(f, 'anneau_resistance');
    const ch = equiper(f, cle2);
    expect(ch.equipement.bague?.id).toBe('anneau_resistance');
    expect(Object.values(ch.inventaire).some((o) => o?.id === 'anneau_protection')).toBe(true);
  });

  it('arme à deux mains : les deux mains doivent être libres ; le même objet dans les deux ; retirer libère les deux', () => {
    const [k, arc] = avec(reelle('Karlach'), 'arc_long');
    expect(() => equiper(k, arc)).toThrow('Libère tes deux mains');
    const [vide, arc2] = avec(mainsVides(), 'arc_long');
    const f = appliquer(vide, equiper(vide, arc2));
    expect(f.equipement.main_droite?.id).toBe('arc_long');
    expect(f.equipement.main_gauche).toEqual(f.equipement.main_droite);
    const retrait = desequiper(f, 'main_gauche');
    expect(retrait.equipement).toEqual({ main_droite: null, main_gauche: null });
    expect(Object.values(retrait.inventaire).filter((o) => o?.id === 'arc_long')).toHaveLength(1);
  });

  it('refus expliqués : deux armes à distance, arme à distance et bouclier, objet qui ne s’équipe pas', () => {
    let [f, fronde] = avec(mainsVides(), 'fronde');
    f = appliquer(f, equiper(f, fronde, 'main_droite'));
    let javelot: string;
    [f, javelot] = avec(f, 'javelot');
    expect(() => equiper(f, javelot, 'main_gauche')).toThrow('Pas deux armes à distance en même temps.');
    let bouclier: string;
    [f, bouclier] = avec(f, 'bouclier_acier');
    expect(() => equiper(f, bouclier)).toThrow('Pas d’arme à distance avec un bouclier.');
    let flute: string;
    [f, flute] = avec(f, 'flute_roseau');
    expect(() => equiper(f, flute)).toThrow(RefusEquipement);
    expect(() => equiper(f, bouclier, 'torse')).toThrow('ne va pas en torse');
  });

  it('équiper change les statistiques : une armure de plaques relève la CA', () => {
    const k = reelle('Karlach');
    const [f, cle] = avec(k, 'demi_plaques');
    const apres = appliquer(f, equiper(f, cle));
    expect(statistiquesFiche(ficheCalculDepuisFiche(apres)).ca).toBeGreaterThan(statistiquesFiche(ficheCalculDepuisFiche(k)).ca);
  });

  it('PV max +1d4 : le dé est lancé une fois et figé ; PV max et actuels suivent, et redescendent au retrait', () => {
    const k = reelle('Karlach');
    const [f, cle] = avec(appliquer(k, desequiper(k, 'collier')), 'amulette_sante');
    const ch = equiper(f, cle, 'collier', () => 0.99);
    expect(ch.equipement.collier?.bonusPvMax).toBe(4);
    expect(ch.pvMax).toBe(f.pvMax + 4);
    expect(ch.pvActuel).toBe((f.pvActuel ?? f.pvMax) + 4);
    const porte = appliquer(f, ch);
    expect(desequiper(porte, 'collier').pvMax).toBe(f.pvMax);
  });

  it('maîtrise : un avertissement, jamais un refus', () => {
    const kylhian = reelle('Kylhian');
    const [f, cle] = avec(kylhian, 'demi_plaques');
    const apres = appliquer(f, equiper(f, cle));
    expect(alertesMaitrise(kylhian)).toEqual([]);
    expect(alertesMaitrise(apres)[0]).toMatch(/^Armure non maîtrisée/);
  });
});

describe('le sac', () => {
  it('le MJ ajoute : les consommables s’empilent, le reste prend une clé par exemplaire', () => {
    const k = reelle('Karlach');
    const potions = ajouterDuCatalogue(k, 'potion_soin', 3);
    expect(Object.values(potions.inventaire)).toEqual([expect.objectContaining({ id: 'potion_soin', quantite: 3 })]);
    const f = appliquer(k, potions);
    const encore = ajouterDuCatalogue(f, 'potion_soin', 2);
    expect(Object.keys(encore.inventaire)).toEqual(Object.keys(potions.inventaire));
    expect(Object.values(encore.inventaire)[0]?.quantite).toBe(5);
    expect(Object.keys(ajouterDuCatalogue(k, 'dague', 2).inventaire)).toEqual(['dague', 'dague~2']);
    expect(() => ajouterDuCatalogue(k, 'epee_de_lumiere')).toThrow('Objet inconnu');
  });

  it('jeter une unité ou toute la pile (décision 3a)', () => {
    const k = reelle('Karlach');
    const ch = ajouterDuCatalogue(k, 'potion_soin', 3);
    const f = appliquer(k, ch);
    const cle = Object.keys(ch.inventaire)[0]!;
    expect(jeter(f, cle, 'un').inventaire[cle]?.quantite).toBe(2);
    expect(jeter(f, cle, 'tout').inventaire[cle]).toBeNull();
    expect(jeter(appliquer(f, jeter(f, cle, 'un')), cle, 'un').inventaire[cle]?.quantite).toBe(1);
  });

  it('clé neuve : sans point (chemin Firestore), suffixée en cas de doublon', () => {
    expect(nouvelleCle({ dague: {} }, { id: 'dague' })).toBe('dague~2');
    expect(nouvelleCle({}, { id: 'objet.forge' })).toBe('objet_forge');
  });
});

describe('utiliser une potion de soin (décision 2a)', () => {
  it('une unité en moins, le dé lancé, les PV rendus sans dépasser le maximum', () => {
    const k = { ...reelle('Karlach'), pvActuel: 10 };
    const ch = ajouterDuCatalogue(k, 'potion_soin', 2);
    const f = appliquer(k, ch);
    const cle = Object.keys(ch.inventaire)[0]!;
    const u = utiliser(f, cle, () => 0.5); // 1d6 → 4
    expect(u.formule).toBe('1d6');
    expect(u.jet.total).toBe(4);
    expect(u.changement.pvActuel).toBe(14);
    expect(u.changement.inventaire[cle]?.quantite).toBe(1);
    const pleine = { ...f, pvActuel: f.pvMax - 1 };
    expect(utiliser(pleine, cle, () => 0.99).soin).toBe(1);
  });

  it('potion rare : le bonus de soin de l’exemplaire s’ajoute au dé du catalogue, et survit au rafraîchissement v1', () => {
    const rare = { ...objet('potion_soin'), rarete: 'rare', soinBonusRarete: 2, description: 'Régénère 1d6+2 PV immédiatement.' } as ObjetFiche;
    expect(formuleSoin(rare)).toBe('1d6+2');
    expect(formuleSoin(rafraichirObjet(rare))).toBe('1d6+2');
    expect(effetsObjet(rare)).toContain('soigne 1d6+2 PV');
  });

  it('couleur de rareté : celle de l’objet, sauf pour un objet commun', () => {
    expect(couleurRarete({ id: 'a', rarete: 'rare', rareteCouleur: '#8a4fd1' })).toBe('#8a4fd1');
    expect(couleurRarete({ id: 'a', rarete: 'commun', rareteCouleur: '#9c9c9c' })).toBeUndefined();
    expect(couleurRarete({ id: 'a' })).toBeUndefined();
  });

  it('un objet sans soin ne s’utilise pas encore depuis la fiche', () => {
    const k = reelle('Karlach');
    const ch = ajouterDuCatalogue(k, 'dague');
    expect(() => utiliser(appliquer(k, ch), Object.keys(ch.inventaire)[0]!)).toThrow('ne s’utilise pas');
  });
});
