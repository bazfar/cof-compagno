/* ============================================================
   Emblèmes de classe — icônes SVG dessinées (aucune image externe)
   Utilisables comme avatar par défaut et sur les cartes de classe.
   ============================================================ */

const ICONES_CLASSES = {
  // Guerrier — épées croisées
  guerrier: `
    <g stroke="var(--violet)" stroke-width="5" stroke-linecap="round" fill="none">
      <line x1="28" y1="30" x2="70" y2="74"/>
      <line x1="72" y1="30" x2="30" y2="74"/>
    </g>
    <g stroke="var(--or)" stroke-width="5" stroke-linecap="round">
      <line x1="22" y1="26" x2="34" y2="34"/>
      <line x1="78" y1="26" x2="66" y2="34"/>
    </g>
    <circle cx="69" cy="77" r="4" fill="var(--violet)"/>
    <circle cx="31" cy="77" r="4" fill="var(--violet)"/>`,

  // Barde — note de musique
  barde: `
    <rect x="48" y="28" width="4.5" height="40" rx="2" fill="var(--violet)"/>
    <path d="M52 28 q15 3 15 19 q-5 -11 -15 -11 z" fill="var(--or)"/>
    <ellipse cx="40" cy="68" rx="12" ry="9" fill="var(--violet)" transform="rotate(-18 40 68)"/>`,

  // Chasseur — réticule de visée
  chasseur: `
    <g fill="none" stroke="var(--violet)" stroke-width="5">
      <circle cx="50" cy="50" r="24"/>
      <line x1="50" y1="16" x2="50" y2="34"/>
      <line x1="50" y1="66" x2="50" y2="84"/>
      <line x1="16" y1="50" x2="34" y2="50"/>
      <line x1="66" y1="50" x2="84" y2="50"/>
    </g>
    <circle cx="50" cy="50" r="5" fill="var(--or)"/>`,

  // Druide — feuille
  druide: `
    <path d="M50 20 C30 38 30 66 50 82 C70 66 70 38 50 20 Z" fill="#bcd9a8" stroke="var(--violet)" stroke-width="3.5"/>
    <line x1="50" y1="26" x2="50" y2="80" stroke="var(--violet)" stroke-width="3"/>
    <g stroke="var(--violet)" stroke-width="2.5" fill="none" stroke-linecap="round">
      <path d="M50 40 L38 47"/><path d="M50 52 L62 59"/>
      <path d="M50 34 L60 40"/><path d="M50 58 L40 65"/>
    </g>`,

  // Prêtre — soleil sacré
  pretre: `
    <g stroke="var(--or)" stroke-width="5" stroke-linecap="round">
      <line x1="50" y1="16" x2="50" y2="27"/><line x1="50" y1="73" x2="50" y2="84"/>
      <line x1="16" y1="50" x2="27" y2="50"/><line x1="73" y1="50" x2="84" y2="50"/>
      <line x1="26" y1="26" x2="34" y2="34"/><line x1="66" y1="66" x2="74" y2="74"/>
      <line x1="74" y1="26" x2="66" y2="34"/><line x1="34" y1="66" x2="26" y2="74"/>
    </g>
    <circle cx="50" cy="50" r="15" fill="var(--or)" stroke="var(--violet)" stroke-width="3.5"/>`,

  // Enchanteur — étoiles / magie
  enchanteur: `
    <path d="M44 24 L50 46 L72 52 L50 58 L44 80 L38 58 L16 52 L38 46 Z" fill="var(--violet)"/>
    <path d="M70 26 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 z" fill="var(--or)"/>
    <circle cx="28" cy="74" r="3.5" fill="var(--or)"/>`,

  // Chevalier — bouclier à croix
  chevalier: `
    <path d="M50 20 L78 28 V52 C78 70 64 78 50 84 C36 78 22 70 22 52 V28 Z"
          fill="#e7ddf0" stroke="var(--violet)" stroke-width="4"/>
    <line x1="50" y1="32" x2="50" y2="72" stroke="var(--or)" stroke-width="5" stroke-linecap="round"/>
    <line x1="37" y1="47" x2="63" y2="47" stroke="var(--or)" stroke-width="5" stroke-linecap="round"/>`,

  // Moine — yin-yang (équilibre)
  moine: `
    <circle cx="50" cy="50" r="28" fill="#fff8e8" stroke="var(--violet)" stroke-width="4"/>
    <path d="M50 22 A14 14 0 0 1 50 50 A14 14 0 0 0 50 78 A28 28 0 0 1 50 22 Z" fill="var(--violet)"/>
    <circle cx="50" cy="36" r="4" fill="#fff8e8"/>
    <circle cx="50" cy="64" r="4" fill="var(--violet)"/>`,

  // Magicien — chapeau de mage étoilé
  magicien: `
    <path d="M50 22 L66 64 H34 Z" fill="var(--violet)"/>
    <rect x="26" y="64" width="48" height="9" rx="4.5" fill="var(--violet)"/>
    <path d="M50 38 l3 7 l7.5 1 l-5.5 5 l1.5 7.5 l-6.5 -3.5 l-6.5 3.5 l1.5 -7.5 l-5.5 -5 l7.5 -1 z" fill="var(--or)"/>`,

  // Nécromancien — crâne
  necromancien: `
    <path d="M50 20 C33 20 23 33 23 49 C23 60 29 66 34 70 L34 78 L66 78 L66 70 C71 66 77 60 77 49 C77 33 67 20 50 20 Z"
          fill="#efe9da" stroke="var(--violet)" stroke-width="3.5"/>
    <circle cx="40" cy="50" r="7.5" fill="var(--violet)"/>
    <circle cx="60" cy="50" r="7.5" fill="var(--violet)"/>
    <path d="M50 58 l-5 9 l10 0 z" fill="var(--violet)"/>
    <g stroke="var(--violet)" stroke-width="2.5" stroke-linecap="round">
      <line x1="44" y1="78" x2="44" y2="71"/>
      <line x1="50" y1="78" x2="50" y2="71"/>
      <line x1="56" y1="78" x2="56" y2="71"/>
    </g>`,
};

/* Renvoie le SVG complet d'un emblème (badge circulaire + icône). */
function embleme(classe, taille) {
  taille = taille || 64;
  const icone = ICONES_CLASSES[classe] || "";
  return (
    `<svg class="embleme" viewBox="0 0 100 100" width="${taille}" height="${taille}" ` +
    `xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<circle cx="50" cy="50" r="46" fill="#fff8e8" stroke="var(--or)" stroke-width="3"/>` +
    `<g>${icone}</g>` +
    `</svg>`
  );
}

/* Avatar d'un personnage : portrait uploadé si présent, sinon emblème de classe. */
function avatarHtml(p, taille) {
  taille = taille || 64;
  if (p && p.portrait) {
    return `<img class="avatar" style="width:${taille}px;height:${taille}px;" src="${p.portrait}" alt="portrait" />`;
  }
  return `<span class="avatar-embleme" style="width:${taille}px;height:${taille}px;">${embleme(p ? p.classe : null, taille)}</span>`;
}
