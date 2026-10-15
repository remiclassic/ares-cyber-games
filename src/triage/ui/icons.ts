import type { Alert } from "../sim/types";

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  person: svg(`<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.600 8 7"/>`),
  network: svg(`<circle cx="12" cy="5" r="2.500"/><circle cx="5" cy="18" r="2.500"/><circle cx="19" cy="18" r="2.500"/><path d="M12 7.500v4M12 11.500l-5.500 4.500M12 11.500l5.500 4.500"/>`),
  database: svg(`<ellipse cx="12" cy="5.500" rx="7" ry="2.800"/><path d="M5 5.500v6c0 1.500 3.100 2.800 7 2.800s7-1.300 7-2.800v-6M5 11.500v6c0 1.500 3.100 2.800 7 2.800s7-1.300 7-2.800v-6"/>`),
  lock: svg(`<rect x="5" y="10.500" width="14" height="10" rx="2"/><path d="M8 10.500V7.500a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.500" r="1.200"/>`),
  mail: svg(`<rect x="3" y="5.500" width="18" height="13" rx="2"/><path d="m3.500 7 8.500 6.500L20.500 7"/>`),
  laptop: svg(`<rect x="5" y="5" width="14" height="10" rx="1.500"/><path d="M2.500 18.500h19"/>`),
  alert: svg(`<circle cx="12" cy="12" r="9"/><path d="M12 7.500v5.500"/><circle cx="12" cy="16.300" r=".6" fill="currentColor"/>`),
  search: svg(`<circle cx="10.500" cy="10.500" r="6.500"/><path d="m15.500 15.500 5 5"/>`),
  bars: svg(`<path d="M5 20v-6M10 20V9M15 20v-9M20 20V5" stroke-width="2.600"/>`),
  clock: svg(`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.500 2M9.500 2.500h5"/>`),
  shield: svg(`<path d="M12 3 5 5.500v6c0 4.300 2.900 7.700 7 9.500 4.100-1.800 7-5.200 7-9.500v-6L12 3Z"/><path d="m9 12 2.200 2.200L15.200 10"/>`),
  link: svg(`<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>`),
  left: svg(`<path d="m14.500 6-6 6 6 6"/>`),
  right: svg(`<path d="m9.500 6 6 6-6 6"/>`),
  play: svg(`<circle cx="12" cy="12" r="9.500"/><path d="M10 8.200v7.600l6-3.800-6-3.800Z" fill="currentColor"/>`),
  pause: svg(`<circle cx="12" cy="12" r="9.500"/><path d="M10 8.500v7M14 8.500v7" stroke-width="2.200"/>`),
  review: svg(`<path d="M6 3h9l3 3v6M6 3v18h6"/><path d="M9 8h6M9 12h4"/><circle cx="16.500" cy="16.500" r="3"/><path d="m18.700 18.700 2.300 2.300"/>`),
  rank: svg(`<path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h1M4 12h1M4 18h1" stroke-width="2.600"/>`),
  explain: svg(`<path d="M4 5.500a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-7l-4.500 4v-4H6a2 2 0 0 1-2-2v-9Z"/>`),
  megaphone: svg(`<path d="M4 10v4h3l6 4V6l-6 4H4Z"/><path d="M16.500 9a4 4 0 0 1 0 6M19 6.500a7.500 7.500 0 0 1 0 11"/>`),
  check: svg(`<path d="m5 12.500 4.500 4.500L19 7.500" stroke-width="2.400"/>`),
} as const;

const BY_CATEGORY: Record<Alert["category"], string> = {
  Identity: ICONS.person,
  Network: ICONS.network,
  Operations: ICONS.database,
  Email: ICONS.mail,
  Endpoint: ICONS.laptop,
};

export function alertIcon(alert: Alert): string {
  return alert.id === "logins" ? ICONS.lock : BY_CATEGORY[alert.category];
}

export const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.600" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
