import type { HostKind, SensorKind } from "../sim/types";

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.600" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.600" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

export const ICONS = {
  workstation: svg(`<rect x="3.500" y="4.500" width="17" height="11" rx="1.500"/><path d="M9 20h6M12 15.500V20"/>`),
  laptop: svg(`<rect x="5" y="5" width="14" height="10" rx="1.500"/><path d="M2.500 18.500h19"/>`),
  server: svg(`<rect x="4" y="3.500" width="16" height="7" rx="1.500"/><rect x="4" y="13.500" width="16" height="7" rx="1.500"/><path d="M8 7h.01M8 17h.01"/>`),
  critical: svg(`<ellipse cx="12" cy="5.500" rx="7" ry="2.800"/><path d="M5 5.500v6c0 1.500 3.100 2.800 7 2.800s7-1.300 7-2.800v-6M5 11.500v6c0 1.500 3.100 2.800 7 2.800s7-1.300 7-2.800v-6"/>`),
  dns: svg(`<circle cx="12" cy="12" r="8.500"/><path d="M3.500 12h17M12 3.500c2.500 2.600 2.500 14.400 0 17M12 3.500c-2.500 2.600-2.500 14.400 0 17"/>`),
  proxy: svg(`<path d="M4 7h11l-3-3M20 17H9l3 3"/><path d="M15 7l5 0M4 17h5"/>`),
  ids: svg(`<path d="M2.500 12s3.500-6 9.500-6 9.500 6 9.500 6-3.500 6-9.500 6-9.500-6-9.500-6Z"/><circle cx="12" cy="12" r="2.800"/>`),
  vpn: svg(`<rect x="5" y="10.500" width="14" height="10" rx="2"/><path d="M8 10.500V7.500a4 4 0 0 1 8 0v3"/>`),
  isolate: svg(`<rect x="4" y="4" width="16" height="16" rx="2"/><path d="m8.500 8.500 7 7M15.500 8.500l-7 7"/>`),
  keep: svg(`<circle cx="12" cy="12" r="8.500"/><path d="m8 12.300 2.800 2.700L16 9.500"/>`),
  watch: svg(`<path d="M2.500 12s3.500-6 9.500-6 9.500 6 9.500 6-3.500 6-9.500 6-9.500-6-9.500-6Z"/><circle cx="12" cy="12" r="2.200"/>`),
  search: svg(`<circle cx="10.500" cy="10.500" r="6.500"/><path d="m15.500 15.500 5 5"/>`),
  clock: svg(`<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.500 2M9.500 2.500h5"/>`),
  radius: svg(`<circle cx="12" cy="12" r="2.500"/><circle cx="12" cy="12" r="6" stroke-dasharray="2 2.500"/><circle cx="12" cy="12" r="9.500"/>`),
  logic: svg(`<path d="M4 6h7M4 12h10M4 18h6"/><path d="m15 15 2.500 2.500L21 13"/>`),
  shield: svg(`<path d="M12 3 5 5.500v6c0 4.300 2.900 7.700 7 9.500 4.100-1.800 7-5.200 7-9.500v-6L12 3Z"/><path d="m9 12 2.200 2.200L15.200 10"/>`),
  play: svg(`<circle cx="12" cy="12" r="9"/><path d="m10 8.500 5 3.500-5 3.500v-7Z" fill="currentColor"/>`),
  retry: svg(`<path d="M4 12a8 8 0 1 0 2.400-5.700"/><path d="M4 4v4h4"/>`),
  question: svg(`<circle cx="12" cy="12" r="9"/><path d="M9.500 9.500a2.600 2.600 0 1 1 3.600 2.400c-.7.300-1.100.900-1.100 1.600v.5"/><circle cx="12" cy="17" r=".6" fill="currentColor"/>`),
};

export function hostIcon(kind: HostKind): string {
  return ICONS[kind];
}

export function sensorIcon(kind: SensorKind): string {
  return ICONS[kind];
}
