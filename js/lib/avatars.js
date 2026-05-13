// SVG fencer avatars — Raedyn (red lame) and Kaylan (blue lame).
// Inline SVGs so they tint with currentColor and avoid extra HTTP requests.

const FENCER_BASE = (lameColor, accentColor) => `
<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
  <!-- Mask -->
  <ellipse cx="32" cy="20" rx="14" ry="16" fill="#2c3e50" />
  <ellipse cx="32" cy="22" rx="12" ry="13.5" fill="#dde3e8" />
  <!-- Bib/lame -->
  <path d="M18,32 Q32,28 46,32 L46,52 Q32,56 18,52 Z" fill="${lameColor}" />
  <path d="M22,38 L42,38" stroke="#fff" stroke-width="1" opacity="0.4"/>
  <!-- Weapon arm + blade -->
  <line x1="46" y1="36" x2="62" y2="14" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="46" cy="36" r="3.5" fill="${accentColor}" />
  <!-- Glove -->
  <circle cx="62" cy="14" r="2" fill="#fff" stroke="${accentColor}" stroke-width="1.2"/>
</svg>
`;

export const AVATARS = {
    raedyn: FENCER_BASE('#E63946', '#1a1d24'),   // red lame
    kaylan: FENCER_BASE('#2B6BFF', '#1a1d24'),   // blue lame
    parent: `<svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg"><circle cx="32" cy="22" r="12" fill="#5a7a8c"/><path d="M14,52 Q32,42 50,52 L50,60 L14,60 Z" fill="#5a7a8c"/></svg>`
};

export function avatarSvg(role) {
    return AVATARS[role] || AVATARS.parent;
}
