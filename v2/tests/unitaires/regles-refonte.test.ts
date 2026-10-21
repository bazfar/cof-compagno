import { describe, expect, it } from 'vitest';
import { coutHorsCombat, coutSort } from '../../src/lib/effets/cout';
import { actionAuPalier, horsCombatAuPalier, paliersDefinis } from '../../src/lib/effets/paliers';
import { actionParId, actions, verbesDeLEcole } from '../../src/regles';

/*
 * Règles de la 2.0 écrites à la main (src/regles/, lot L4) : chaque action
 * se charge, chaque palier se résout, et les chiffres du doc de cadre
 * sortent tels quels du calcul.
 */

describe('toutes les actions des règles', () => {
  it('se chargent (le schéma les valide au chargement), identifiants uniques', () => {
    expect(actions.length).toBeGreaterThan(0);
    expect(new Set(actions.map((a) => a.id)).size).toBe(actions.length);
  });

  it.each(actions.map((a) => [a.id, a] as const))('%s : chaque palier défini, et chaque variante, se résout', (_id, a) => {
    for (const p of paliersDefinis(a)) expect(() => actionAuPalier(a, p)).not.toThrow();
    for (const v of a.variantes) expect(() => actionAuPalier(a, v.palier, v.id)).not.toThrow();
  });

  it.each(actions.filter((a) => a.nature === 'verbe').map((a) => [a.id, a] as const))(
    '%s : coût par palier = base du rang + palier (« 2 / 3 / 4 »), usage hors combat à moitié prix',
    (_id, a) => {
      paliersDefinis(a).forEach((p, i) => {
        const c = coutSort(a, { palier: p });
        expect(c.ok && c.pp).toBe(a.rang + 1 + i);
        if (c.ok && a.horsCombat) expect(coutHorsCombat(c.pp)).toBe(Math.ceil((a.rang + 1 + i) / 2));
      });
    },
  );

  it.each(actions.filter((a) => a.horsCombat).map((a) => [a.id, a] as const))(
    '%s : pas plus de textes hors combat que de paliers (validé : autant de paliers que l’effet en combat)',
    (_id, a) => {
      expect(a.horsCombat!.paliers.length).toBeLessThanOrEqual(paliersDefinis(a).length);
    },
  );
});

describe('Évocation (doc de cadre, « Verbes d’Évocation »)', () => {
  const v = verbesDeLEcole('evocation');

  it('cinq verbes, un par rang : Missile, Choc, Rayon, Vortex, Nova', () => {
    expect(v.map((a) => [a.rang, a.nom])).toEqual([
      [1, 'Missile'],
      [2, 'Choc'],
      [3, 'Rayon'],
      [4, 'Vortex'],
      [5, 'Nova'],
    ]);
    expect(v.every((a) => a.horsCombat !== null)).toBe(true);
  });

  it('Missile : 1, 2 puis 3 projectiles de 1d6 qui touchent d’office ; l’élément sur chacun au palier III', () => {
    const m = actionParId.get('evocation.missile')!;
    expect(m.resolution.jet).toBe('auto');
    expect(paliersDefinis(m).map((p) => actionAuPalier(m, p).ciblage.nbCibles)).toEqual([1, 2, 3]);
    expect(actionAuPalier(m, 'II').element).toEqual({ application: 'ciblePrincipale' });
    expect(actionAuPalier(m, 'III').element).toEqual({ application: 'chaqueProjectile' });
    expect(m.effets).toEqual([{ type: 'degats', des: '1d6', plusMod: false, typeDegats: 'magique', vise: 'cible' }]);
    expect(horsCombatAuPalier(m, 'III')).toMatch(/contourne/);
  });

  it('Choc (1a, 2b) : 6 cases, pleins jusqu’à 3 puis moitié ; FOR réussie = moitié et pas de poussée ; II : 3d6 et 2 cases', () => {
    const c = actionParId.get('evocation.choc')!;
    expect(c.ciblage.portee).toBe(6);
    expect(c.effets[0]).toMatchObject({ des: '2d6', attenuation: { pleinsJusqua: 3, auDela: 'moitie' } });
    expect(c.resolution).toEqual({ jet: 'sauvegarde', sauvegarde: 'FOR', siSauvegarde: 'moitie' });
    expect(c.effets[1]).toMatchObject({ type: 'deplacement', sens: 'repousse', cases: 1, condition: 'sauvegardeRatee' });
    const ii = actionAuPalier(c, 'II');
    expect(ii.effets[0]).toMatchObject({ des: '3d6', attenuation: { pleinsJusqua: 3 } });
    expect(ii.effets[1]).toMatchObject({ cases: 2, condition: 'sauvegardeRatee' });
    expect(paliersDefinis(c)).toEqual(['I', 'II']);
  });

  it('Rayon : ligne de 5 cases depuis le mage, 3d6 puis 4d6, DEX pour moitié', () => {
    const r = actionParId.get('evocation.rayon')!;
    expect(r.zone).toEqual({ forme: 'ligne', taille: 5, origine: 'lanceur', filtre: 'tous', degressif: false });
    expect(r.resolution).toEqual({ jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' });
    expect(actionAuPalier(r, 'II').effets[0]).toMatchObject({ des: '4d6', vise: 'zone' });
  });

  it('Vortex (3b, 4c) : à 6 cases, zone 3×3 dégressive, 4d6 ; DEX pour moitié, attiré au centre sur échec ; un seul palier', () => {
    const x = actionParId.get('evocation.vortex')!;
    expect(x.ciblage.portee).toBe(6);
    expect(x.zone).toMatchObject({ forme: 'carre', taille: 3, degressif: true, filtre: 'tous' });
    expect(x.resolution).toEqual({ jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' });
    expect(x.effets.map((e) => e.type)).toEqual(['degats', 'deplacement']);
    expect(x.effets[1]).toMatchObject({ sens: 'attire', condition: 'sauvegardeRatee' });
    expect(coutSort(x, { palier: 'I', surcharge: true })).toMatchObject({ ok: false });
  });

  it('Nova (5a) : rayon 2 autour du mage, 6d6, DEX pour moitié, 1x/combat, jamais surchargée, alliés compris', () => {
    const n = actionParId.get('evocation.nova')!;
    expect(n.resolution).toEqual({ jet: 'sauvegarde', sauvegarde: 'DEX', siSauvegarde: 'moitie' });
    expect(n.limite).toBe('1x/combat');
    expect(n.zone).toMatchObject({ forme: 'cercle', taille: 2, origine: 'lanceur', filtre: 'tous' });
    expect(coutSort(n, { palier: 'I' })).toMatchObject({ ok: true, pp: 6 });
    expect(coutSort(n, { palier: 'I', surcharge: true })).toMatchObject({ ok: false });
  });
});
