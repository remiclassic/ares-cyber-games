import type { ResponseCard } from "../sim/types";

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.600" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICONS = {
  user: svg(`<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.400 3.600-7 8-7s8 2.600 8 7"/>`),
  mail: svg(`<rect x="3" y="5.500" width="18" height="13" rx="2"/><path d="m3.500 7 8.500 6.500L20.500 7"/>`),
  shield: svg(`<path d="M12 3 5 5.500v6c0 4.300 2.900 7.700 7 9.500 4.100-1.800 7-5.200 7-9.500v-6L12 3Z"/><path d="m9 12 2.200 2.200L15.200 10"/>`),
  host: svg(`<rect x="3.500" y="4.500" width="17" height="11" rx="1.500"/><path d="M9 20h6M12 15.500V20"/>`),
  network: svg(`<circle cx="12" cy="5" r="2.500"/><circle cx="5" cy="18" r="2.500"/><circle cx="19" cy="18" r="2.500"/><path d="M12 7.500v4M12 11.500l-5.500 4.500M12 11.500l5.500 4.500"/>`),
  cloud: svg(`<path d="M7 18.500h10a4 4 0 0 0 .6-7.950A5.500 5.500 0 0 0 7 9.500a4.500 4.500 0 0 0 0 9Z"/>`),
  key: svg(`<circle cx="8" cy="15" r="4"/><path d="m11 12 8.500-8.500M16 7l2.500 2.500M14 9l2 2"/>`),
  phone: svg(`<path d="M5 4h4l2 5-2.500 1.500a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2Z"/>`),
  backup: svg(`<ellipse cx="12" cy="5.500" rx="7" ry="2.800"/><path d="M5 5.500v6c0 1.500 3.100 2.800 7 2.800s7-1.300 7-2.800v-6M5 11.500v6c0 1.500 3.100 2.800 7 2.800s7-1.300 7-2.800v-6"/>`),
  log: svg(`<path d="M5 3.500h10l4 4v13H5z"/><path d="M14.500 3.500v4.500H19M8.500 12h7M8.500 15.500h7"/>`),
  terminal: svg(`<rect x="3" y="4.500" width="18" height="15" rx="2"/><path d="m7 10 3 2.500L7 15M12.500 15.500h4.500"/>`),
  question: svg(`<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.600 2.600 0 1 1 3.600 2.400c-.7.300-1.100.900-1.100 1.600v.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>`),
  cards: svg(`<rect x="3" y="6" width="11" height="15" rx="1.500"/><path d="M8 3.500h11.500a1.500 1.500 0 0 1 1.500 1.500v12.500"/>`),
  actor: svg(`<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.400 3.600-7 8-7s8 2.600 8 7"/><path d="M8.500 7.500h7"/>`),
  retry: svg(`<path d="M4 12a8 8 0 1 0 2.400-5.700"/><path d="M4 4v4h4"/>`),
  next: svg(`<path d="m9.500 6 6 6-6 6"/>`),
  eye: svg(`<path d="M2.500 12s3.500-6 9.500-6 9.500 6 9.500 6-3.500 6-9.500 6-9.500-6-9.500-6Z"/><circle cx="12" cy="12" r="2.200"/>`),
};

export function cardIcon(entry: ResponseCard): string {
  return ICONS[entry.icon];
}
