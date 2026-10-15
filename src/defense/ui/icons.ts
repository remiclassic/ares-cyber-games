import type { StageId } from "../sim/types";

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.600" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICONS = {
  initial: svg(`<path d="M3 12h11M10 8l4 4-4 4"/><path d="M14 4h5a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-5"/>`),
  execution: svg(`<rect x="3.500" y="4.500" width="17" height="15" rx="2"/><path d="m7.500 10 3 2.500-3 2.500M12.500 15.500h4"/>`),
  credential: svg(`<circle cx="8" cy="15" r="4"/><path d="m11 12 8.500-8.500M16 7l2.500 2.500M14 9l2 2"/>`),
  lateral: svg(`<rect x="2.500" y="4" width="7" height="6" rx="1"/><rect x="14.500" y="14" width="7" height="6" rx="1"/><path d="M6 10v4.500a2 2 0 0 0 2 2h6.500M12 14l2.500 2.500L12 19"/>`),
  impact: svg(`<ellipse cx="12" cy="5.500" rx="7" ry="2.800"/><path d="M5 5.500v6c0 1.500 3.100 2.800 7 2.800s7-1.300 7-2.800v-6M5 11.500v6c0 1.500 3.100 2.800 7 2.800s7-1.300 7-2.800v-6"/>`),
  block: svg(`<path d="M12 3 5 5.500v6c0 4.300 2.900 7.700 7 9.500 4.100-1.800 7-5.200 7-9.500v-6L12 3Z"/><path d="m9 12 2.200 2.200L15.200 10"/>`),
  detect: svg(`<path d="M2.500 12s3.500-6 9.500-6 9.500 6 9.500 6-3.500 6-9.500 6-9.500-6-9.500-6Z"/><circle cx="12" cy="12" r="2.200"/>`),
  recover: svg(`<path d="M4 12a8 8 0 1 0 2.400-5.700"/><path d="M4 4v4h4"/>`),
  responds: svg(`<circle cx="12" cy="8" r="3.500"/><path d="M5 20c0-3.900 3.100-6 7-6s7 2.100 7 6"/><path d="M18 4.500a5 5 0 0 1 0 7"/>`),
  credits: svg(`<circle cx="12" cy="12" r="8.500"/><path d="M14.500 9.200c-.5-.9-1.500-1.400-2.700-1.400-1.600 0-2.700.8-2.700 2s1 1.700 2.700 2.100 2.900.9 2.900 2.200-1.200 2.100-2.900 2.100c-1.300 0-2.400-.6-2.900-1.600M12 6v1.800M12 16.200V18"/>`),
  friction: svg(`<path d="M4 18h16M6 18l3-8 3 4 3-7 3 11"/>`),
  intel: svg(`<path d="M5 3.500h10l4 4v13H5z"/><path d="M14.500 3.500v4.500H19M8.500 12h7M8.500 15.500h7"/>`),
  layers: svg(`<path d="m12 3 9 5-9 5-9-5 9-5Z"/><path d="m3 12.500 9 5 9-5M3 16.500l9 5 9-5"/>`),
  play: svg(`<circle cx="12" cy="12" r="9"/><path d="m10 8.500 5 3.500-5 3.500v-7Z" fill="currentColor"/>`),
  retry: svg(`<path d="M4 12a8 8 0 1 0 2.400-5.700"/><path d="M4 4v4h4"/>`),
  question: svg(`<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.600 2.600 0 1 1 3.600 2.400c-.7.300-1.100.900-1.100 1.600v.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>`),
  actor: svg(`<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.400 3.600-7 8-7s8 2.600 8 7"/><path d="M8.500 7.500h7"/>`),
  plus: svg(`<path d="M12 5v14M5 12h14"/>`),
  minus: svg(`<path d="M5 12h14"/>`),
  lock: svg(`<rect x="5" y="10.500" width="14" height="10" rx="2"/><path d="M8 10.500V7.500a4 4 0 0 1 8 0v3"/>`),
  check: svg(`<path d="m5 12.500 4.500 4.500L19 7.500"/>`),
  cross: svg(`<path d="m6 6 12 12M18 6 6 18"/>`),
};

export function stageIcon(stage: StageId): string {
  return ICONS[stage];
}
