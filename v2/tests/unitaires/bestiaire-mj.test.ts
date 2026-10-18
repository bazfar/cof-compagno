import { describe, expect, it } from 'vitest';
import { depuisDocument, filtrer, ligneArmure, ligneAttaque, nouvelIdMonstre, versDocument } from '../../src/lib/bestiaire/bestiaire';
import { armeMonstreParId, armesMonstres, armureMonstreParId, armuresMonstres, equilibrage, monstres } from '../../src/lib/regles/donnees-bestiaire';
import { schemaExportBestiaire, schemaMonstre, schemaMonstreEnBase } from '../../src/lib/schemas/bestiaire';

/*
 * Bestiaire du MJ en base (lot L3.2) : chaque monstre réel fait l'aller-
 * retour vers le document Firestore sans rien perdre, et les lignes
 * affichées au MJ sont justes.
 */

describe('aller-retour vers Firestore', () => {
  it('les 122 monstres : document valide, sans id, et retour à l’identique', () => {
    expect(monstres).toHaveLength(122);
    for (const m of monstres) {
      const d = schemaMonstreEnBase.parse(versDocument(m, 'v1', 5));
      expect(d).not.toHaveProperty('id');
      expect(d).toMatchObject({ origine: 'v1', majLe: 5 });
      // Firestore refuse `undefined` : le document passe par JSON sans perte.
      expect(JSON.parse(JSON.stringify(d))).toEqual(d);
      expect(depuisDocument(m.id, d)).toEqual(m);
    }
  });

  it('le fichier d’export est valide et complet', () => {
    const e = schemaExportBestiaire.parse({ format: 'cof-compagno/bestiaire-v1', exporteLe: 1, monstres, armes: armesMonstres, armures: armuresMonstres, equilibrage });
    expect([e.monstres.length, e.armes.length, e.armures.length]).toEqual([122, 152, 50]);
  });
});

describe('lignes affichées', () => {
  const gobelin = monstres.find((m) => m.id === 'goblin_eclaireur')!;
  it('attaque : nom, bonus, dégâts de l’arme et portée ; arme inconnue dite', () => {
    const dague = armeMonstreParId.get('dague_rouillee')!;
    expect(ligneAttaque(gobelin.attaques[0]!, armeMonstreParId)).toBe(`Dague rouillée +2 · ${dague.degats} · ${dague.portee}`);
    expect(ligneAttaque({ ...gobelin.attaques[0]!, bonusDegats: 3 }, armeMonstreParId)).toBe(`Dague rouillée +2 · ${dague.degats}+3 · ${dague.portee}`);
    expect(ligneAttaque({ ...gobelin.attaques[0]!, armeId: 'inconnue' }, armeMonstreParId)).toBe('Dague rouillée +2 · arme inconnue (inconnue)');
  });

  it('armure : nom, réduction, naturelle', () => {
    const avec = monstres.find((m) => m.armureId)!;
    const a = armureMonstreParId.get(avec.armureId!)!;
    expect(ligneArmure(avec.armureId, armureMonstreParId)).toBe(`${a.nom} (réduction ${a.reduction}${a.naturelle ? ', naturelle' : ''})`);
    expect(ligneArmure(undefined, armureMonstreParId)).toBeNull();
  });
});

describe('recherche et identifiants', () => {
  it('filtres : texte sans accents, dangerosité, race, boss ; tri par dangerosité puis nom', () => {
    const eclaireur = filtrer(monstres, { recherche: 'ECLAIREUR', dangerosite: 0, race: '', bossSeulement: false });
    expect(eclaireur.map((m) => m.id)).toContain('goblin_eclaireur');
    const boss = filtrer(monstres, { recherche: '', dangerosite: 0, race: '', bossSeulement: true });
    expect(boss.length).toBeGreaterThan(0);
    expect(boss.every((m) => m.boss)).toBe(true);
    const demons = filtrer(monstres, { recherche: '', dangerosite: 0, race: 'démon', bossSeulement: false });
    expect(demons.every((m) => m.race.includes('démon'))).toBe(true);
    const tries = filtrer(monstres, { recherche: '', dangerosite: 0, race: '', bossSeulement: false });
    expect(tries.map((m) => m.dangerosite)).toEqual([...tries.map((m) => m.dangerosite)].sort((a, b) => a - b));
  });

  it('créature du MJ : identifiant lisible, valide et jamais déjà pris', () => {
    const pris = new Set(['mj_rat_geant']);
    expect(nouvelIdMonstre('Rat géant', pris)).toBe('mj_rat_geant_2');
    expect(nouvelIdMonstre('Écorché d’Ysmaal !', new Set())).toBe('mj_ecorche_d_ysmaal');
    expect(nouvelIdMonstre('', new Set())).toBe('mj_creature');
    expect(schemaMonstre.shape.id.safeParse(nouvelIdMonstre('Œil de Solmaris', new Set())).success).toBe(true);
  });
});
