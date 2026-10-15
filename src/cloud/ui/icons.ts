import type { EvidenceIcon } from "../sim/types";

const svg = (body: string) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  surge: svg('<path d="M4 20V11M9 20V6M14 20v-9M19 20V3"/>'),
  quiet: svg('<circle cx="9" cy="12" r="6"/><path d="M15 6.5a6 6 0 0 1 0 11"/><path d="M9 9.5v5M7.5 11h3M7.500 13h3"/>'),
  access: svg('<path d="M12 3l8 3v6c0 4.500-3.200 7.800-8 9-4.800-1.200-8-4.500-8-9V6z"/><path d="M9 12l2 2 4-4"/>'),
  add: svg('<rect x="4" y="4" width="16" height="6" rx="2"/><rect x="4" y="14" width="16" height="6" rx="2"/><path d="M12 6v2M11 7h2"/>'),
  rightsize: svg('<path d="M12 3l8 4.500v9L12 21l-8-4.500v-9z"/><path d="M12 12l8-4.500M12 12v9M12 12L4 7.500"/>'),
  inspect: svg('<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.500-4.500"/>'),
  link: svg('<path d="M10 14a4 4 0 0 0 5.700 0l3-3a4 4 0 0 0-5.700-5.700l-1 1"/><path d="M14 10a4 4 0 0 0-5.700 0l-3 3a4 4 0 0 0 5.700 5.700l1-1"/>'),
  key: svg('<circle cx="8" cy="14" r="4"/><path d="M11 11l8-8M16 6l3 3"/>'),
  doc: svg('<path d="M7 3h8l4 4v14H7z"/><path d="M10 12h6M10 16h6"/>'),
  coin: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v8M9.500 10h4a1.500 1.500 0 0 1 0 3h-3a1.500 1.500 0 0 0 0 3h4"/>'),
  clock: svg('<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>'),
  lock: svg('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  check: svg('<path d="M5 12l5 5 9-10"/>'),
  cross: svg('<path d="M6 6l12 12M18 6L6 18"/>'),
  arrow: svg('<path d="M9 5l7 7-7 7"/>'),
  pulse: svg('<path d="M3 12h4l2-6 4 12 2-6h6"/>'),
};

export const EVIDENCE_ICON: Record<EvidenceIcon, string> = {
  demand: ICONS.surge,
  capacity: ICONS.add,
  errors: ICONS.doc,
  cost: ICONS.coin,
  forecast: ICONS.clock,
  ticket: ICONS.doc,
  keys: ICONS.key,
  log: ICONS.doc,
  link: ICONS.link,
};

export const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="12" stroke="#38d6f5" stroke-width="3.500"/><ellipse cx="24" cy="24" rx="22" ry="8" transform="rotate(-28 24 24)" stroke="#38d6f5" stroke-width="2.500"/><circle cx="24" cy="24" r="4" fill="#38d6f5"/></svg>`;
