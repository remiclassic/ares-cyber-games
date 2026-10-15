// Hand-written SVG art for Secure Stack, in a glossy sticker style: die-cut stickers
// with a thick white border, a soft drop shadow, a glossy highlight and a chunky icon.
// Threats are wobbly blobs with mischievous eyes; defences are rounded badges. Shape tells them
// apart as well as colour.

import type { StickerDef } from "./data";

const PALETTE: Record<StickerDef["hue"] | "grey", [string, string, string]> = {
  // light, dark, outline
  red: ["#ff7a7a", "#d6304a", "#5a0f1e"],
  orange: ["#ffb35c", "#ee6a1f", "#5a2408"],
  purple: ["#c98bff", "#7c3bd6", "#2e0d5a"],
  pink: ["#ff9ccf", "#e0458f", "#5a0f35"],
  amber: ["#ffd76a", "#e39a12", "#5a3a04"],
  rose: ["#ff8fa3", "#d93a5c", "#5a0f22"],
  plum: ["#e08ad8", "#9c2f8f", "#3d0d38"],
  coral: ["#ff9a7a", "#e2553a", "#5a1a0e"],
  blue: ["#7cc4ff", "#2f74e6", "#0c2a5a"],
  teal: ["#6fe3d6", "#169e95", "#063d3a"],
  green: ["#8ae69a", "#2aa54a", "#0c3d1a"],
  sky: ["#8adcff", "#1f9ad6", "#06334d"],
  indigo: ["#a2a8ff", "#4b4fd6", "#141652"],
  mint: ["#9cf0c8", "#25b37a", "#08402a"],
  cyan: ["#7ff0ff", "#13a8c4", "#053d48"],
  navy: ["#8fb0ff", "#2c4fb3", "#0b1a4d"],
  lime: ["#d4f57a", "#7cb81f", "#2b4206"],
  grey: ["#d9e2ee", "#8a99b0", "#2c3646"],
};

// Icons are drawn in a 48 × 48 box: white shapes with a dark outline (stroke is set by the caller).
const ICON: Record<string, string> = {
  hook: `<rect x="4" y="12" width="26" height="19" rx="3"/><path d="M4.5 13 17 23l12.5-10" fill="none"/><path d="M38 4v22a8 8 0 0 1-16 0v-3" fill="none" stroke-width="5"/><path d="M22 23l-4 5h8z"/>`,
  lockfile: `<path d="M10 4h18l8 8v30H10z"/><path d="M28 4v8h8" fill="none"/><rect x="15" y="25" width="17" height="13" rx="2"/><path d="M18 25v-4a5.5 5.5 0 0 1 11 0v4" fill="none"/><circle cx="23.5" cy="31" r="2" fill="#333"/>`,
  bug: `<ellipse cx="24" cy="29" rx="11" ry="14"/><circle cx="24" cy="13" r="7"/><path d="M24 17v25M13 24l-8-4M13 31H4M13 37l-8 5M35 24l8-4M35 31h9M35 37l8 5M20 7l-4-5M28 7l4-5" fill="none"/>`,
  weakkey: `<circle cx="14" cy="18" r="9"/><path d="M21 22l20 14-3 4-4-3-3 3-3-3" /><text x="24" y="15" font-family="Fredoka, Arial Rounded MT Bold, sans-serif" font-size="11" font-weight="700" stroke-width="1">1234</text>`,
  crack: `<rect x="5" y="7" width="38" height="32" rx="4"/><path d="M5 15h38" fill="none"/><path d="M22 15l-4 8 7 3-5 13" fill="none" stroke-width="3.5"/><circle cx="10" cy="11" r="1.6" fill="#333"/><circle cx="15" cy="11" r="1.6" fill="#333"/>`,
  usb: `<rect x="12" y="4" width="18" height="12" rx="2"/><rect x="9" y="14" width="24" height="30" rx="5"/><path d="M17 8h2M23 8h2" fill="none"/><text x="21" y="36" font-family="Fredoka, Arial Rounded MT Bold, sans-serif" font-size="15" font-weight="700" text-anchor="middle" stroke-width="1">?</text>`,
  hammer: `<rect x="6" y="6" width="26" height="12" rx="3" transform="rotate(-25 19 12)"/><rect x="20" y="16" width="7" height="28" rx="3" transform="rotate(-25 23 30)"/><path d="M37 7l4-3M40 14h5M36 2l1-4" fill="none"/>`,
  leak: `<path d="M4 12h14l4 4h22v20H4z"/><path d="M14 38c0 3-2 5-2 6a2 2 0 0 0 4 0c0-1-2-3-2-6zM28 38c0 4-3 6-3 7a3 3 0 0 0 6 0c0-1-3-3-3-7z"/>`,
  question: `<text x="24" y="38" font-family="Fredoka, Arial Rounded MT Bold, sans-serif" font-size="38" font-weight="700" text-anchor="middle" stroke-width="2.5">?</text>`,
  phonecheck: `<rect x="12" y="2" width="24" height="44" rx="5"/><path d="M20 6h8" fill="none"/><path d="m17 25 5 5 9-10" fill="none" stroke-width="4"/>`,
  flag: `<path d="M10 4v40" fill="none" stroke-width="4"/><path d="M12 6c8-4 14 4 26 0v18c-12 4-18-4-26 0z"/>`,
  vault: `<rect x="4" y="6" width="40" height="36" rx="5"/><circle cx="24" cy="24" r="10"/><path d="M24 15v18M15 24h18" fill="none"/><path d="M8 42v4M40 42v4" fill="none" stroke-width="4"/>`,
  backup: `<path d="M13 34a9 9 0 0 1-1-18 12 12 0 0 1 23-2 8 8 0 0 1 1 20z"/><path d="M24 40V22m-6 6 6-6 6 6" fill="none" stroke-width="4"/>`,
  shield: `<path d="M24 3 6 9v13c0 11 8 19 18 23 10-4 18-12 18-23V9z"/><path d="m15 24 7 7 12-13" fill="none" stroke-width="4"/>`,
  bandage: `<rect x="2" y="17" width="44" height="14" rx="7" transform="rotate(-35 24 24)"/><rect x="2" y="17" width="44" height="14" rx="7" transform="rotate(35 24 24)"/><circle cx="24" cy="24" r="2" fill="#333"/><circle cx="20" cy="21" r="1.4" fill="#333"/><circle cx="28" cy="27" r="1.4" fill="#333"/>`,
  plug: `<rect x="14" y="2" width="14" height="14" rx="2"/><rect x="10" y="14" width="22" height="16" rx="4"/><path d="M21 30v6" fill="none" stroke-width="4"/><rect x="26" y="30" width="18" height="14" rx="3"/><path d="M29 30v-4a6 6 0 0 1 12 0v4" fill="none"/>`,
  timer: `<circle cx="24" cy="27" r="17"/><path d="M20 4h8M24 4v6M24 27V17M24 27l7 5" fill="none" stroke-width="3.5"/><path d="M38 10l4-3" fill="none"/>`,
  lockdoc: `<path d="M6 4h22l8 8v32H6z"/><path d="M28 4v8h8" fill="none"/><path d="M11 18h14M11 24h18" fill="none"/><rect x="24" y="28" width="20" height="16" rx="3"/><path d="M28 28v-4a6 6 0 0 1 12 0v4" fill="none"/><circle cx="34" cy="36" r="2" fill="#333"/>`,
};

// A wobbly blob for threats, a squircle badge for defences.
const BLOB = "M60 8c20 0 38 9 45 26 8 18 4 40-9 54-12 13-31 22-49 19C27 104 10 91 8 71 5 51 10 31 24 19 33 12 46 8 60 8z";
const BADGE = "M30 10h60c11 0 20 9 20 20v60c0 11-9 20-20 20H30c-11 0-20-9-20-20V30c0-11 9-20 20-20z";

export function stickerSvg(def: StickerDef, stage: "plain" | "frozen" = "plain"): string {
  const threat = def.kind === "threat";
  const [light, dark, line] = def.id === "unknown" ? PALETTE.grey : PALETTE[def.hue];
  const shape = threat ? BLOB : BADGE;
  const id = `${def.id}${stage}`;
  const icon = ICON[def.icon] ?? "";
  const iconT = threat ? "translate(36 50) scale(1)" : "translate(30 30) scale(1.25)";
  const eyes = threat && def.id !== "unknown"
    ? `<g transform="translate(0 2)">
        <ellipse cx="44" cy="36" rx="9" ry="10" fill="#fff" stroke="${line}" stroke-width="3"/>
        <ellipse cx="76" cy="36" rx="9" ry="10" fill="#fff" stroke="${line}" stroke-width="3"/>
        <circle cx="46" cy="38" r="4.5" fill="${line}"/><circle cx="74" cy="38" r="4.5" fill="${line}"/>
        <circle cx="47.5" cy="36" r="1.5" fill="#fff"/><circle cx="75.5" cy="36" r="1.5" fill="#fff"/>
        <path d="M34 24l17 6M86 24l-17 6" stroke="${line}" stroke-width="4" stroke-linecap="round"/>
      </g>`
    : "";
  const sparkle = !threat ? `<path d="M98 20l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" opacity=".9"/>` : "";
  const frost =
    stage === "frozen"
      ? `<path d="${shape}" fill="url(#ice${id})" opacity=".85"/>
         <g stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".9"><path d="M22 30l14 10M30 22l4 14M98 86l-14-8M92 98l-6-14M20 92l12-10"/></g>`
      : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-6 -6 132 136" width="132" height="136">
    <defs>
      <radialGradient id="g${id}" cx="35%" cy="28%" r="80%"><stop offset="0" stop-color="${light}"/><stop offset="1" stop-color="${dark}"/></radialGradient>
      <linearGradient id="ice${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e8f7ff"/><stop offset="1" stop-color="#9fd6f5"/></linearGradient>
    </defs>
    <path d="${shape}" transform="translate(0 6)" fill="rgba(20,30,50,.28)"/>
    <path d="${shape}" fill="#fff" stroke="#fff" stroke-width="14" stroke-linejoin="round"/>
    <path d="${shape}" fill="url(#g${id})" stroke="${line}" stroke-opacity=".25" stroke-width="2"/>
    <ellipse cx="${threat ? 42 : 40}" cy="${threat ? 24 : 26}" rx="22" ry="10" fill="#fff" opacity=".45" transform="rotate(-20 40 24)"/>
    ${eyes}
    <g transform="${iconT}" fill="#fff" stroke="${line}" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${icon}</g>
    ${sparkle}
    ${frost}
  </svg>`;
}

export const STAR_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64">
  <defs><radialGradient id="st" cx="35%" cy="30%" r="75%"><stop offset="0" stop-color="#fff6b0"/><stop offset="1" stop-color="#f5a90a"/></radialGradient></defs>
  <path d="M32 3l8.6 18 19.4 2.4-14.3 13.3L49.6 56 32 46.3 14.4 56l3.9-19.3L4 23.4 23.4 21z" fill="url(#st)" stroke="#fff" stroke-width="4" stroke-linejoin="round"/>
  <path d="M32 3l8.6 18 19.4 2.4-14.3 13.3L49.6 56 32 46.3 14.4 56l3.9-19.3L4 23.4 23.4 21z" fill="none" stroke="#a35d00" stroke-opacity=".35" stroke-width="1.5"/>
  <ellipse cx="25" cy="22" rx="7" ry="4" fill="#fff" opacity=".6" transform="rotate(-25 25 22)"/>
</svg>`;

// Beach backdrop for the play area (portrait, 420 × 760).
export const BACKDROP_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 420 760" preserveAspectRatio="xMidYMid slice">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#5fc4ff"/><stop offset="1" stop-color="#c8f0ff"/></linearGradient>
    <linearGradient id="sea" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#1fb5d6"/><stop offset="1" stop-color="#7fe6e0"/></linearGradient>
    <linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe3b0"/><stop offset="1" stop-color="#f2cd8a"/></linearGradient>
  </defs>
  <rect width="420" height="760" fill="url(#sky)"/>
  <circle cx="330" cy="70" r="34" fill="#fff6c2"/><circle cx="330" cy="70" r="48" fill="#fff6c2" opacity=".35"/>
  <g fill="#fff" opacity=".9"><ellipse cx="80" cy="70" rx="38" ry="12"/><ellipse cx="105" cy="62" rx="26" ry="14"/><ellipse cx="230" cy="40" rx="30" ry="9"/></g>
  <path d="M250 150c20-40 50-50 70-48 22 2 40 20 58 48z" fill="#3fae6a"/>
  <rect x="300" y="88" width="16" height="44" fill="#f4f7fb"/><rect x="300" y="100" width="16" height="7" fill="#e5484d"/><rect x="300" y="116" width="16" height="7" fill="#e5484d"/>
  <path d="M296 88h24l-12-12z" fill="#2f74e6"/><path d="M308 74l-6 2v4c0 3 3 6 6 7 3-1 6-4 6-7v-4z" fill="#fff"/>
  <rect y="148" width="420" height="70" fill="url(#sea)"/>
  <g fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".7"><path d="M20 168q10-6 20 0t20 0M150 180q10-6 20 0t20 0M290 170q10-6 20 0t20 0M90 198q10-6 20 0t20 0M340 200q10-6 20 0t20 0"/></g>
  <path d="M0 214c60-12 120 6 210-2s150-14 210-4v552H0z" fill="url(#sand)"/>
  <path d="M0 214c60-12 120 6 210-2s150-14 210-4" fill="none" stroke="#fff" stroke-width="5" opacity=".8"/>
  <g fill="#e8c27f" opacity=".6"><circle cx="60" cy="320" r="3"/><circle cx="350" cy="380" r="3"/><circle cx="200" cy="460" r="2.5"/><circle cx="120" cy="560" r="3"/><circle cx="310" cy="620" r="2.5"/></g>
  <g transform="translate(-30 -20) rotate(20)"><path d="M40 20c40 10 70 40 80 80-30-30-60-40-80-40" fill="#2f9e54"/><path d="M40 20c20 30 20 70 10 100-10-30-20-60-30-70" fill="#3fbf66"/></g>
  <g transform="translate(450 -30) scale(-1 1) rotate(20)"><path d="M40 20c40 10 70 40 80 80-30-30-60-40-80-40" fill="#2f9e54"/><path d="M40 20c20 30 20 70 10 100-10-30-20-60-30-70" fill="#3fbf66"/></g>
</svg>`;

// "Shelby" the security crab: the guide, holding a shield.
export const CRAB_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 140 110">
  <g stroke="#7a1d12" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">
    <path d="M30 78l-16 14M38 84l-10 18M102 84l10 18M110 78l16 14" fill="none"/>
    <ellipse cx="70" cy="70" rx="44" ry="28" fill="#ff7046"/>
    <path d="M28 54C10 50 6 30 18 22c6 8 14 10 20 6-2 10 0 18 -10 26z" fill="#ff7046"/>
    <path d="M58 46l-6-22M82 46l6-22" fill="none"/>
    <circle cx="52" cy="22" r="10" fill="#fff"/><circle cx="88" cy="22" r="10" fill="#fff"/>
    <circle cx="54" cy="24" r="4.5" fill="#2b1a1a" stroke="none"/><circle cx="86" cy="24" r="4.5" fill="#2b1a1a" stroke="none"/>
    <path d="M58 78q12 10 24 0" fill="none"/>
    <path d="M112 30l-14 5v10c0 9 6 15 14 18 8-3 14-9 14-18V35z" fill="#2f74e6"/>
    <path d="m105 46 5 5 9-9" fill="none" stroke="#fff"/>
    <path d="M100 58c6 4 10 4 14 0" fill="none"/>
  </g>
  <ellipse cx="54" cy="66" rx="16" ry="6" fill="#fff" opacity=".35"/>
</svg>`;
