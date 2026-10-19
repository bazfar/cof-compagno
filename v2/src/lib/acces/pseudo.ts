/*
 * Retrouver son joueur (correctif du 19/10/2026, décision de Thomas :
 * pseudo + code perso). La connexion anonyme de la 2.0 liait le joueur au
 * navigateur : un autre navigateur, une fenêtre privée ou un autre PC
 * créaient un second joueur du même nom.
 *
 * Désormais le pseudo et le code perso forment un compte Firebase
 * « e-mail / mot de passe » propre à la table. L'adresse est fabriquée à
 * partir du pseudo et n'est jamais utilisée pour écrire à qui que ce soit
 * (domaine `.invalid`, réservé). Le même pseudo et le même code redonnent
 * le même uid sur n'importe quel appareil, donc le même joueur et les
 * mêmes personnages, sans rien migrer. Et deux joueurs ne peuvent pas
 * protéger le même pseudo : Firebase refuse une adresse déjà prise.
 */

/** Longueur minimale du code perso (minimum de Firebase pour un mot de passe). */
export const LONGUEUR_MIN_CODE = 6;

/** Clé d'un pseudo : sans accents ni casse ; « Thomas », « thomas » et « THOMAS » sont le même joueur. */
export function clePseudo(nom: string): string {
  return nom
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Adresse du compte d'un pseudo à une table (jamais écrite à personne). */
export function emailJoueur(table: string, nom: string): string {
  const cle = clePseudo(nom);
  if (!cle) throw new Error('Le pseudo doit contenir au moins une lettre ou un chiffre.');
  return `${cle}@${table}.joueurs.cof-compagno.invalid`;
}

/** Vérifie un code perso avant de l'envoyer. */
export function verifierCode(code: string): string {
  if (code.length < LONGUEUR_MIN_CODE) throw new Error(`Le code perso doit faire au moins ${LONGUEUR_MIN_CODE} caractères.`);
  return code;
}

/** Message lisible pour une erreur de connexion Firebase Auth (codes « auth/… »). */
export function messageConnexion(erreur: unknown, nom: string): string | null {
  const code = typeof erreur === 'object' && erreur !== null && 'code' in erreur ? String(erreur.code) : '';
  switch (code) {
    case 'auth/email-already-in-use':
    case 'auth/credential-already-in-use':
      return `Le pseudo « ${nom.trim()} » est déjà pris à cette table. Si c'est toi, choisis « Je suis déjà venu ».`;
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'Pseudo ou code perso incorrect.';
    case 'auth/weak-password':
      return `Le code perso doit faire au moins ${LONGUEUR_MIN_CODE} caractères.`;
    case 'auth/too-many-requests':
      return "Trop d'essais : réessaie dans quelques minutes.";
    case 'auth/operation-not-allowed':
      return "La connexion par pseudo n'est pas activée pour ce projet : le MJ doit activer « Adresse e-mail/Mot de passe » dans la console Firebase.";
    case 'auth/network-request-failed':
      return 'Pas de réseau : vérifie ta connexion et réessaie.';
    default:
      return null;
  }
}

/** Les joueurs qui partagent un même pseudo (doublons à faire retirer par le MJ). */
export function doublons<T extends { nom: string }>(joueurs: T[]): Set<string> {
  const parCle = new Map<string, number>();
  for (const j of joueurs) parCle.set(clePseudo(j.nom), (parCle.get(clePseudo(j.nom)) ?? 0) + 1);
  return new Set([...parCle].filter(([, n]) => n > 1).map(([cle]) => cle));
}
