import { describe, expect, it } from 'vitest';
import { clePseudo, doublons, emailJoueur, messageConnexion, verifierCode } from '../../src/lib/acces/pseudo';

/*
 * Retrouver son joueur (correctif du 19/10/2026) : le pseudo et le code
 * perso forment un compte propre à la table, le même sur tous les appareils.
 */

describe('pseudo', () => {
  it('« Thomas », « thomas » et « THOMAS » sont le même joueur ; accents et espaces ne comptent pas', () => {
    expect(clePseudo('Thomas')).toBe('thomas');
    expect(clePseudo('  THOMAS ')).toBe('thomas');
    expect(clePseudo('Aëlys la Brave')).toBe('aelys-la-brave');
    expect(clePseudo('**')).toBe('');
  });

  it('une adresse par pseudo et par table, jamais écrite à personne (domaine .invalid)', () => {
    expect(emailJoueur('arbre-monde', 'Thomas')).toBe('thomas@arbre-monde.joueurs.cof-compagno.invalid');
    expect(emailJoueur('test', 'thomas')).not.toBe(emailJoueur('arbre-monde', 'thomas'));
    expect(() => emailJoueur('arbre-monde', '!!')).toThrow('au moins une lettre ou un chiffre');
  });

  it('code perso : 6 caractères au moins', () => {
    expect(() => verifierCode('12345')).toThrow('au moins 6 caractères');
    expect(verifierCode('123456')).toBe('123456');
  });

  it('erreurs de connexion en phrases', () => {
    expect(messageConnexion({ code: 'auth/email-already-in-use' }, ' thomas ')).toBe(
      "Le pseudo « thomas » est déjà pris à cette table. Si c'est toi, choisis « Je suis déjà venu ».",
    );
    expect(messageConnexion({ code: 'auth/invalid-credential' }, 'x')).toBe('Pseudo ou code perso incorrect.');
    expect(messageConnexion({ code: 'auth/operation-not-allowed' }, 'x')).toMatch(/console Firebase/);
    expect(messageConnexion(new Error('autre'), 'x')).toBeNull();
  });

  it('doublons : les joueurs d’un même pseudo, casse et accents ignorés', () => {
    expect([...doublons([{ nom: 'thomas' }, { nom: 'Thomas' }, { nom: 'Alice' }])]).toEqual(['thomas']);
    expect(doublons([{ nom: 'Alice' }, { nom: 'Carol' }]).size).toBe(0);
  });
});
