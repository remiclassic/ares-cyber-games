import type { Item, Scenario } from "./engine";

// Three rooms at Meridian Freight (fictional) at the end of the day. Drawings are inline SVG in a
// 1000 × 600 scene, no external art. Twelve sensitive objects and eight harmless decoys. Every
// outcome text says who would see what. Pending SME review (docs/design/CLEAN_DESK.md).

const CLEANERS = "18:10 · Cleaning crew";
const TOUR = "09:05 · Client tour";
const FONT = `font-family="Inter, sans-serif"`;

// ---- small drawings ----
const room = (wall: string, floor: string) => `
  <rect width="1000" height="600" fill="${wall}"/>
  <rect y="446" width="1000" height="154" fill="${floor}"/>
  <rect y="442" width="1000" height="6" fill="#1d3a66"/>
  <g opacity=".3" stroke="#2c4b7d" stroke-width="2"><path d="M0 500h1000M0 556h1000M140 446l-70 154M360 446l-36 154M640 446l36 154M860 446l70 154"/></g>`;

const wallClock = (cx: number, cy: number, hour: number, minute: number) => {
  const m = (minute / 60) * 2 * Math.PI;
  const h = ((hour % 12) / 12) * 2 * Math.PI + m / 12;
  const hand = (angle: number, length: number) => `${(cx + Math.sin(angle) * length).toFixed(1)} ${(cy - Math.cos(angle) * length).toFixed(1)}`;
  return `<circle cx="${cx}" cy="${cy}" r="30" fill="#e8f0fb" stroke="#5a77a8" stroke-width="5"/>
    <path d="M${cx} ${cy}L${hand(h, 15)}M${cx} ${cy}L${hand(m, 23)}" stroke="#0d1b33" stroke-width="4" stroke-linecap="round"/>`;
};

const monitor = (x: number, y: number, w: number, h: number, screen: string) => `
  <rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" fill="#0d1b33" stroke="#7d94bb" stroke-width="4"/>
  ${screen}
  <rect x="${x + w / 2 - 9}" y="${y + h}" width="18" height="22" fill="#5a77a8"/>
  <rect x="${x + w / 2 - 44}" y="${y + h + 20}" width="88" height="9" rx="4" fill="#5a77a8"/>`;

const lines = (x: number, y: number, w: number, rows: number, gap: number, color = "#8a98b3") =>
  Array.from({ length: rows }, (_, i) => `<rect x="${x}" y="${y + i * gap}" width="${i % 3 === 2 ? w * 0.6 : w}" height="4" rx="2" fill="${color}"/>`).join("");

const sheet = (x: number, y: number, w: number, h: number, inner: string, fill = "#f4f7fc") =>
  `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="3" fill="${fill}" stroke="#9db2cf" stroke-width="2"/>${inner}`;

// ---- room 1: the desk row ----
const DESK_BACKDROP = `
  ${room("#12264a", "#0b1730")}
  ${wallClock(900, 80, 17, 25)}
  <rect x="318" y="112" width="262" height="186" rx="6" fill="#6b5237" stroke="#8a6a52" stroke-width="6"/>
  <path d="M20 348h960l20 84H0Z" fill="#4a6491"/>
  <rect y="432" width="1000" height="16" fill="#33496f"/>
  <rect x="40" y="448" width="16" height="120" fill="#26406a"/><rect x="944" y="448" width="16" height="120" fill="#26406a"/>
  <rect x="150" y="372" width="120" height="34" rx="5" fill="#26406a"/><rect x="800" y="372" width="120" height="34" rx="5" fill="#26406a"/>
  <rect x="470" y="470" width="120" height="100" rx="6" fill="#1b3a66" stroke="#2c5590" stroke-width="3"/>
  <rect x="488" y="462" width="84" height="12" rx="3" fill="#0a1426"/>
  <text x="530" y="528" ${FONT} font-size="13" font-weight="700" text-anchor="middle" fill="#9db2cf">SHREDDER</text>`;

const DESK_ITEMS: readonly Item[] = [
  {
    id: "screen-crm",
    label: "Monitor on the left desk",
    name: "Unlocked screen with a customer record",
    detail: "Dana's PC is signed in. The customer system is open on Harbourline Logistics: contact names, mobile numbers, credit terms and the notes field. The mouse still moves the pointer.",
    hint: "Anyone who walks past can read it, and anyone who sits down is signed in as Dana. What is the quickest thing that closes both?",
    x: 70, y: 168, w: 210, h: 176,
    svg: monitor(
      70, 170, 210, 140,
      `<rect x="80" y="180" width="190" height="120" fill="#e8f0fb"/><rect x="80" y="180" width="190" height="18" fill="#2f7df6"/>
       <circle cx="108" cy="226" r="14" fill="#8ab4ff"/>${lines(132, 214, 122, 3, 11, "#51648a")}${lines(92, 256, 164, 4, 11, "#8a98b3")}`,
    ),
    severity: 3,
    witness: CLEANERS,
    options: [
      { action: "lock", grade: "best", text: "One key press and the session is closed. The cleaning crew walk past a lock screen; Dana's work is still open for her in the morning." },
      { action: "off", grade: "exposed", text: "A dark monitor is not a locked session. A cleaner dusting the desk bumps the mouse, the screen wakes, and the customer record is there with Dana still signed in." },
      { action: "leave", grade: "exposed", text: "The customer record glows on the screen all evening. The crew can read names, numbers and credit terms, and anyone who sits down is signed in as Dana." },
    ],
    reason: "An unlocked screen exposes the data on it and the account behind it. Locking takes a second and loses nothing. Switching the monitor off only hides the picture.",
  },
  {
    id: "lunch-menu",
    label: "Sheet pinned to the board",
    name: "This week's canteen menu",
    detail: "A printed menu from the staff canteen: soup of the day, Thursday curry, opening hours. No names, nothing internal.",
    hint: "Would it matter if a cleaner or a client read this? If not, it does not deserve any of your minutes.",
    x: 338, y: 128, w: 96, h: 128,
    svg: sheet(
      342, 132, 88, 120,
      `<text x="386" y="154" ${FONT} font-size="15" font-weight="800" text-anchor="middle" fill="#1c62e0">MENU</text>${lines(352, 166, 68, 7, 11)}<circle cx="386" cy="134" r="5" fill="#ff5d6c"/>`,
    ),
    severity: 0,
    witness: CLEANERS,
    options: [
      { action: "shred", grade: "waste", text: "Two minutes at the shredder for a canteen menu. Nobody would have learned anything from it, and tomorrow nobody knows what the soup is." },
      { action: "drawer", grade: "waste", text: "The menu is now locked in a drawer. It was never a risk; those minutes were needed elsewhere." },
      { action: "leave", grade: "best", text: "A canteen menu. The crew glance at it and carry on. Nothing in it helps anyone." },
    ],
    reason: "Clean desk is about information that could hurt someone if seen. A canteen menu cannot. Spending minutes on it means something sensitive goes without.",
  },
  {
    id: "sticky-note",
    label: "Yellow note on the board",
    name: "Sticky note with a password",
    detail: "Handwritten: \"CRM  dana.k  Harbour!2026\". It is Dana's sign-in for the customer system, in plain sight above her desk.",
    hint: "Locking this away keeps a written password in existence. What makes it stop existing, and who needs to know it was on show?",
    x: 464, y: 144, w: 92, h: 92,
    svg: `<g transform="rotate(-5 510 190)"><rect x="470" y="150" width="80" height="80" fill="#fde047" stroke="#c9a80f" stroke-width="2"/>
      <path d="M480 172h56M480 190h42M480 208h60" stroke="#3a2c05" stroke-width="4" stroke-linecap="round"/><path d="M526 208l10 -6" stroke="#3a2c05" stroke-width="3"/></g>`,
    severity: 3,
    witness: CLEANERS,
    options: [
      { action: "shred", grade: "best", text: "The note is gone before anyone arrives. You message Dana to change the password in the morning, because it has been on show all day." },
      { action: "drawer", grade: "ok", text: "Out of sight tonight, so the crew see nothing. But a written password still exists, in a drawer other people open, and nobody told Dana to change it." },
      { action: "leave", grade: "exposed", text: "A phone camera is enough. Whoever reads the note can sign in to the customer system as Dana from anywhere." },
    ],
    reason: "A written password is a key lying on the desk. Destroy it and have the owner change the password; hiding it only moves the problem.",
  },
  {
    id: "photo",
    label: "Picture frame on the desk",
    name: "A colleague's family photo",
    detail: "A framed holiday photo of Tomas and his children on a beach. A personal item on his own desk.",
    hint: "Personal is not the same as sensitive to the company. Is this yours to move?",
    x: 596, y: 258, w: 96, h: 92,
    svg: `<rect x="602" y="262" width="84" height="84" rx="5" fill="#8a6a52" stroke="#b08a6a" stroke-width="3"/><rect x="612" y="272" width="64" height="64" fill="#7fb6ff"/>
      <path d="M612 322q32 -18 64 0v14h-64Z" fill="#f6d28b"/><circle cx="660" cy="284" r="7" fill="#fde047"/>
      <circle cx="634" cy="306" r="7" fill="#0d1b33"/><rect x="628" y="313" width="12" height="16" rx="3" fill="#0d1b33"/><circle cx="652" cy="312" r="5" fill="#0d1b33"/><rect x="648" y="317" width="8" height="12" rx="2" fill="#0d1b33"/>`,
    severity: 0,
    witness: CLEANERS,
    options: [
      { action: "drawer", grade: "waste", text: "You locked a colleague's family photo in a drawer. It told visitors nothing about the company, and Tomas spends tomorrow morning looking for it." },
      { action: "leave", grade: "best", text: "A family photo on a desk. The crew dust around it. It says nothing about customers, systems or staff records." },
    ],
    reason: "A clean desk policy covers company information. A personal photo is not yours to tidy and gives a visitor nothing to use.",
  },
  {
    id: "contract",
    label: "Papers on the desk",
    name: "Signed customer contract (original)",
    detail: "The signed original of a three-year haulage contract with Harbourline Logistics: prices, penalty clauses, both signatures in ink. A note says \"for Legal, Monday\".",
    hint: "It must not be seen, and it must still exist on Monday. Which action does both?",
    x: 366, y: 352, w: 180, h: 74,
    svg: `<path d="M384 358h150l8 62h-170Z" fill="#f4f7fc" stroke="#9db2cf" stroke-width="2"/>
      <path d="M396 370h126M394 382h130M393 394h76" stroke="#8a98b3" stroke-width="4" stroke-linecap="round"/>
      <path d="M392 410q10 -12 18 -2t16 -4t14 4" stroke="#1c62e0" stroke-width="3" fill="none" stroke-linecap="round"/>
      <circle cx="508" cy="402" r="13" fill="none" stroke="#ff5d6c" stroke-width="3"/><path d="M501 402h14" stroke="#ff5d6c" stroke-width="3"/>`,
    severity: 2,
    witness: TOUR,
    options: [
      { action: "drawer", grade: "best", text: "Locked in the desk pedestal with a message to its owner. The tour passes an empty desk, and Legal get the original on Monday." },
      { action: "handin", grade: "ok", text: "Security log it and keep it overnight. It is safe, but it took the longest route and the owner has to go and find it." },
      { action: "shred", grade: "harm", harm: 1, text: "The exposure is gone, and so is the only signed original. On Monday Legal ask for it. The customer has to be asked to sign again." },
      { action: "leave", grade: "exposed", text: "The tour is led past this desk. A visiting client reads another customer's prices and penalty clauses upside down in a few seconds." },
    ],
    reason: "Confidential and needed: lock it away. Shredding is for copies and waste. Destroying a signed original swaps an exposure for a loss.",
  },
  {
    id: "screen-locked",
    label: "Monitor on the right desk",
    name: "A locked screen",
    detail: "Tomas's PC shows the lock screen: a clock, his initials and \"Press Ctrl+Alt+Del to unlock\". Nothing else is visible.",
    hint: "Check what is actually on show before you spend time on it.",
    x: 730, y: 168, w: 210, h: 176,
    svg: monitor(
      730, 170, 210, 140,
      `<rect x="740" y="180" width="190" height="120" fill="#13294f"/>
       <rect x="820" y="236" width="30" height="24" rx="4" fill="#9db2cf"/><path d="M826 236v-8a9 9 0 0 1 18 0v8" stroke="#9db2cf" stroke-width="4" fill="none"/>
       <rect x="800" y="274" width="70" height="5" rx="2" fill="#51648a"/>`,
    ),
    severity: 0,
    witness: CLEANERS,
    options: [
      { action: "lock", grade: "waste", text: "It was already locked. A minute spent pressing keys on a colleague's PC changed nothing." },
      { action: "off", grade: "waste", text: "The monitor is off and the session was already locked. Nothing gained; a minute gone." },
      { action: "leave", grade: "best", text: "A lock screen. The crew see a clock and two initials. This is what every screen should look like at 17:30." },
    ],
    reason: "A locked screen is the clean state. Recognising what is already safe is what leaves you time for what is not.",
  },
];

// ---- room 2: the meeting room ----
const MEETING_BACKDROP = `
  ${room("#152a4f", "#0b1730")}
  ${wallClock(620, 80, 17, 33)}
  <path d="M790 262l-34 180M920 262l34 180M855 262v180" stroke="#5a77a8" stroke-width="6" stroke-linecap="round"/>
  <rect x="520" y="272" width="200" height="170" rx="6" fill="#33496f" stroke="#4a6491" stroke-width="3"/>
  <path d="M620 272v170" stroke="#4a6491" stroke-width="3"/><circle cx="606" cy="356" r="5" fill="#7d94bb"/><circle cx="634" cy="356" r="5" fill="#7d94bb"/>
  <path d="M120 404h760l90 140H30Z" fill="#4a6491"/>
  <path d="M30 544h940v16H30Z" fill="#33496f"/>
  <g fill="#26406a"><rect x="230" y="330" width="90" height="74" rx="10"/><rect x="455" y="330" width="90" height="74" rx="10"/></g>`;

const MEETING_ITEMS: readonly Item[] = [
  {
    id: "brochure",
    label: "Leaflets on the sideboard",
    name: "Public company brochures",
    detail: "A holder of glossy \"Meridian Freight: Moving What Matters\" brochures. The same text is on the public website. They are put out for visitors.",
    hint: "",
    x: 548, y: 198, w: 144, h: 76,
    svg: `<rect x="556" y="246" width="128" height="26" rx="4" fill="#26406a" stroke="#5a77a8" stroke-width="2"/>
      <g stroke="#0d1b33" stroke-width="1.5"><rect x="566" y="206" width="38" height="52" rx="2" fill="#38d6f5"/><rect x="600" y="202" width="38" height="56" rx="2" fill="#2f7df6"/><rect x="636" y="206" width="38" height="52" rx="2" fill="#38d6f5"/></g>
      <path d="M608 218h22M608 228h22M608 238h14" stroke="#e8f0fb" stroke-width="3"/>`,
    severity: 0,
    witness: TOUR,
    options: [
      { action: "shred", grade: "waste", text: "You shredded the marketing brochures that were printed for tomorrow's visitors. They are public. The tour guide has nothing to hand out." },
      { action: "drawer", grade: "waste", text: "The brochures are locked away. They were meant to be picked up; two minutes went on hiding public material." },
      { action: "leave", grade: "best", text: "The clients each take a brochure. That is what they are for: everything in them is already public." },
    ],
    reason: "Public material is made to be seen. Classify before you act: not every piece of paper is a risk.",
  },
  {
    id: "whiteboard",
    label: "Whiteboard on the wall",
    name: "Whiteboard with network details",
    detail: "Left from an IT planning session: a sketch of the warehouse network with address ranges, the name of the VPN gateway, and \"guest Wi-Fi admin: \" followed by a password. \"DO NOT WIPE\" is written in a corner.",
    hint: "",
    x: 56, y: 46, w: 408, h: 238,
    svg: `<rect x="60" y="50" width="400" height="230" rx="6" fill="#f4f7fc" stroke="#9db2cf" stroke-width="6"/>
      <g fill="none" stroke="#1c62e0" stroke-width="3"><rect x="90" y="80" width="80" height="44" rx="4"/><rect x="230" y="80" width="80" height="44" rx="4"/><rect x="160" y="170" width="80" height="44" rx="4"/><path d="M170 102h60M130 124l60 46M270 124l-50 46"/></g>
      <g ${FONT} font-size="13" font-weight="700" fill="#0d1b33"><text x="100" y="107">VPN-GW</text><text x="244" y="107">CORE</text><text x="176" y="197">WHSE</text>
      <text x="330" y="96" fill="#b3261e">10.20.0.0/24</text><text x="330" y="118" fill="#b3261e">10.20.8.0/24</text><text x="262" y="204" fill="#b3261e">Wi-Fi admin:</text><text x="262" y="224" fill="#b3261e">Fr3ight-…</text></g>
      <text x="80" y="266" ${FONT} font-size="12" font-weight="800" fill="#1a7f43">DO NOT WIPE</text>
      <rect x="200" y="280" width="120" height="10" rx="3" fill="#7d94bb"/><rect x="214" y="272" width="26" height="9" rx="2" fill="#ff5d6c"/><rect x="250" y="272" width="26" height="9" rx="2" fill="#1c62e0"/>`,
    severity: 3,
    witness: TOUR,
    options: [
      { action: "wipe", grade: "best", text: "Wiped clean, with a message to the IT lead that it is gone and why. The tour sits in front of an empty board. The diagram belongs in the documentation system, not on a wall." },
      { action: "leave", grade: "exposed", text: "The clients sit facing the board for twenty minutes. One takes a photo of \"the nice diagram\": address ranges, the VPN gateway and the Wi-Fi admin password leave the building." },
    ],
    reason: "\"Do not wipe\" is a request from a colleague, not a control. Network details and a password on a wall in a visitor room must go; tell the owner.",
  },
  {
    id: "flipchart",
    label: "Flipchart on the easel",
    name: "Flipchart with icebreaker doodles",
    detail: "From this morning's team warm-up: a sun, a smiley, \"IDEAS!\" and a list of favourite pizza toppings. No names, no figures.",
    hint: "",
    x: 772, y: 52, w: 166, h: 216,
    svg: `<rect x="780" y="60" width="150" height="200" rx="3" fill="#f4f7fc" stroke="#9db2cf" stroke-width="3"/><rect x="780" y="56" width="150" height="12" fill="#5a77a8"/>
      <circle cx="820" cy="108" r="16" fill="none" stroke="#f6b93b" stroke-width="4"/><path d="M820 82v-8M846 108h8M794 108h-8M838 90l6-6M802 90l-6-6" stroke="#f6b93b" stroke-width="3"/>
      <circle cx="888" cy="112" r="18" fill="none" stroke="#1c62e0" stroke-width="3"/><circle cx="882" cy="107" r="2.5" fill="#1c62e0"/><circle cx="894" cy="107" r="2.5" fill="#1c62e0"/><path d="M880 117q8 8 16 0" stroke="#1c62e0" stroke-width="3" fill="none"/>
      <text x="855" y="170" ${FONT} font-size="20" font-weight="800" text-anchor="middle" fill="#1a7f43">IDEAS!</text>
      <path d="M800 194h100M800 212h84M800 230h94" stroke="#8a98b3" stroke-width="4" stroke-linecap="round"/>`,
    severity: 0,
    witness: TOUR,
    options: [
      { action: "shred", grade: "waste", text: "You tore off the sheet and shredded a sun, a smiley and a pizza list. The clients would have smiled at it." },
      { action: "leave", grade: "best", text: "The clients see a sun, a smiley and a pizza list. It makes the place look human. Nothing to learn from it." },
    ],
    reason: "It looks like meeting output, but the content is what matters. Read it first: there is nothing here to protect.",
  },
  {
    id: "notebook",
    label: "Notebook on the table",
    name: "A colleague's notebook",
    detail: "Priya's hardback notebook, left open: handwritten notes from customer calls with contact names, a quoted price per pallet and \"they are unhappy with Northway, could switch\". Months of her notes are in it.",
    hint: "",
    x: 176, y: 414, w: 156, h: 100,
    svg: `<path d="M190 424h130l8 80h-146Z" fill="#1b3a2a" stroke="#3ddc84" stroke-width="2"/><path d="M196 430h118l6 68h-130Z" fill="#f4f7fc"/>
      <path d="M254 430l2 68" stroke="#9db2cf" stroke-width="2"/><path d="M204 444h40M203 456h42M202 468h30M266 444h42M267 456h36M268 468h44M269 480h28" stroke="#1c62e0" stroke-width="3" stroke-linecap="round"/>
      <rect x="318" y="452" width="8" height="54" rx="3" fill="#f6b93b" transform="rotate(-28 322 480)"/>`,
    severity: 2,
    witness: TOUR,
    options: [
      { action: "drawer", grade: "best", text: "Closed and locked in the meeting-room cabinet, with a message to Priya saying where it is. The tour sees a clear table; she has her notes in the morning." },
      { action: "handin", grade: "ok", text: "Reception lock it in lost property. Safe, but it cost an extra minute and Priya has to work out where her notebook went." },
      { action: "shred", grade: "harm", harm: 1, text: "Nothing left for the tour to read, and nothing left for Priya either: months of customer notes that existed nowhere else are in the shredder bin." },
      { action: "leave", grade: "exposed", text: "A client waiting for the tour to start flicks through it. It names their competitor, the price that competitor was quoted, and who is thinking of leaving." },
    ],
    reason: "It is sensitive and it is someone else's working record. Secure it and tell the owner. You do not get to destroy other people's information.",
  },
  {
    id: "badge",
    label: "Card and lanyard on the table",
    name: "Visitor badge, still active",
    detail: "A visitor pass issued today to \"K. Olsen, Brightwater Ltd\". It was never returned. The light on the lobby reader goes green when you hold a pass like this to it until midnight.",
    hint: "",
    x: 408, y: 414, w: 136, h: 104,
    svg: `<path d="M430 430q46 -22 92 0q-10 36 -44 44" fill="none" stroke="#ff8a65" stroke-width="6" stroke-linecap="round"/>
      <rect x="436" y="456" width="78" height="54" rx="6" fill="#f4f7fc" stroke="#9db2cf" stroke-width="2"/><rect x="436" y="456" width="78" height="16" rx="6" fill="#ff8a65"/>
      <text x="475" y="469" ${FONT} font-size="10" font-weight="800" text-anchor="middle" fill="#2a1a00">VISITOR</text>
      <circle cx="454" cy="490" r="9" fill="#9db2cf"/><path d="M470 486h34M470 498h24" stroke="#51648a" stroke-width="4" stroke-linecap="round"/>`,
    severity: 2,
    witness: CLEANERS,
    options: [
      { action: "handin", grade: "best", text: "Reception sign it back in and switch it off. Whoever finds a pass on a table tonight finds nothing, and the visitor log is right." },
      { action: "drawer", grade: "ok", text: "Nobody can pick it up tonight. But it is still live, the log still says the visitor is in the building, and reception do not know where it went." },
      { action: "leave", grade: "exposed", text: "A working pass lies on a table in an unlocked room. Anyone who pockets it can walk through the lobby door until midnight, and the log says it was K. Olsen." },
    ],
    reason: "A live badge is a door key with someone else's name on it. Hiding it leaves it live; only the people who issue badges can switch it off.",
  },
  {
    id: "attendee-list",
    label: "Printed sheet on the table",
    name: "Attendee list with client contacts",
    detail: "A printout for this afternoon's meeting: twelve names from three client companies with job titles, direct lines and mobile numbers. The meeting is over; the list is in the calendar invite.",
    hint: "",
    x: 620, y: 412, w: 172, h: 104,
    svg: `<path d="M640 420h136l10 88h-154Z" fill="#f4f7fc" stroke="#9db2cf" stroke-width="2"/>
      <path d="M650 434h60" stroke="#0d1b33" stroke-width="5" stroke-linecap="round"/>
      <path d="M648 450h44M700 450h66M647 463h40M700 463h68M646 476h46M700 476h60M645 489h38M700 489h70" stroke="#8a98b3" stroke-width="4" stroke-linecap="round"/>`,
    severity: 2,
    witness: TOUR,
    options: [
      { action: "shred", grade: "best", text: "A spare copy of personal data with no further use: shredded. The tour finds a clear table, and the list still exists where it belongs." },
      { action: "drawer", grade: "ok", text: "Out of sight for the tour. But now a sheet of other people's mobile numbers sits in a cabinet with no owner and no reason to be kept." },
      { action: "leave", grade: "exposed", text: "Tomorrow's clients read the names, job titles and mobile numbers of people at three other client companies while they wait for coffee." },
    ],
    reason: "A used copy of personal data should stop existing. Shredding is right for copies and waste, which is exactly why it is wrong for originals.",
  },
];

// ---- room 3: print area and reception ----
const PRINT_BACKDROP = `
  ${room("#12264a", "#0a1426")}
  ${wallClock(380, 80, 17, 44)}
  <rect x="50" y="262" width="240" height="180" rx="10" fill="#33496f" stroke="#5a77a8" stroke-width="3"/>
  <rect x="70" y="252" width="160" height="16" rx="4" fill="#0a1426"/><rect x="74" y="300" width="110" height="40" rx="4" fill="#0d1b33"/><circle cx="216" cy="318" r="9" fill="#3ddc84"/><circle cx="246" cy="318" r="9" fill="#5a77a8"/>
  <rect x="70" y="372" width="200" height="50" rx="4" fill="#26406a"/><rect x="286" y="356" width="124" height="12" rx="3" fill="#5a77a8"/>
  <rect x="440" y="170" width="140" height="272" rx="6" fill="#4a6491" stroke="#7d94bb" stroke-width="3"/>
  <g fill="none" stroke="#7d94bb" stroke-width="3"><rect x="452" y="182" width="116" height="74" rx="3"/><rect x="452" y="266" width="116" height="74" rx="3"/><rect x="452" y="350" width="116" height="80" rx="3"/></g>
  <rect x="470" y="196" width="50" height="16" rx="2" fill="#e8f0fb"/><text x="495" y="208" ${FONT} font-size="11" font-weight="800" text-anchor="middle" fill="#0d1b33">HR FILES</text>
  <rect x="488" y="296" width="40" height="8" rx="3" fill="#7d94bb"/><rect x="488" y="384" width="40" height="8" rx="3" fill="#7d94bb"/>
  <rect x="630" y="318" width="360" height="18" rx="4" fill="#5a77a8"/>
  <rect x="640" y="336" width="340" height="226" fill="#26406a" stroke="#33496f" stroke-width="3"/>
  <text x="900" y="420" ${FONT} font-size="20" font-weight="800" text-anchor="middle" letter-spacing="3" fill="#8fb4e6">RECEPTION</text>`;

const PRINT_ITEMS: readonly Item[] = [
  {
    id: "test-page",
    label: "Sheet on the side tray",
    name: "Printer test page",
    detail: "A printer status page: toner levels, a colour grid, \"Tray 2: A4\". No names, no network settings.",
    hint: "",
    x: 296, y: 288, w: 112, h: 78,
    svg: sheet(
      302, 294, 100, 64,
      `<g><rect x="312" y="304" width="14" height="14" fill="#38d6f5"/><rect x="330" y="304" width="14" height="14" fill="#ff5d6c"/><rect x="348" y="304" width="14" height="14" fill="#fde047"/><rect x="366" y="304" width="14" height="14" fill="#0d1b33"/></g>${lines(312, 328, 76, 3, 9)}`,
    ),
    severity: 0,
    witness: CLEANERS,
    options: [
      { action: "shred", grade: "waste", text: "You shredded a toner report. The crew would have put it in the recycling for you. Two minutes you did not have." },
      { action: "collect", grade: "waste", text: "You collected a toner report and went looking for an owner. There is none. Two minutes you did not have." },
      { action: "leave", grade: "best", text: "A colour grid and toner levels. The crew drop it in the recycling. Nothing was on it." },
    ],
    reason: "Not everything on a printer is a print job. Thirty seconds of reading saves two minutes of handling.",
  },
  {
    id: "payroll",
    label: "Pages on the printer tray",
    name: "Printed payroll report",
    detail: "Eleven pages, face up: \"Payroll run: November\". Names, salaries, bank sort codes and the last digits of account numbers for the whole depot. Printed 16:52 by HR; nobody came for it.",
    hint: "",
    x: 76, y: 172, w: 148, h: 88,
    svg: `${sheet(92, 184, 124, 74, "", "#dfe6f2")}${sheet(
      84, 178, 124, 76,
      `<path d="M94 192h70" stroke="#0d1b33" stroke-width="5" stroke-linecap="round"/><g stroke="#8a98b3" stroke-width="3"><path d="M94 208h104M94 219h104M94 230h104M94 241h104M134 202v46M170 202v46"/></g>`,
    )}`,
    severity: 3,
    witness: CLEANERS,
    options: [
      { action: "collect", grade: "best", text: "Collected, put in a sealed envelope in HR's locked post tray, and HR messaged. The crew find an empty printer; HR get their report." },
      { action: "shred", grade: "ok", text: "Nobody will read it tonight. But it was not yours: HR come looking in the morning, print all eleven pages again, and never learn it sat here for an hour." },
      { action: "leave", grade: "exposed", text: "Everyone's salary and bank details lie face up on a shared printer. The crew empty the bin beside it; the first person to print tomorrow picks the pages up with their own." },
    ],
    reason: "Uncollected printing is the classic exposure. It has an owner: get it to them securely and tell them. Shredding hides the problem from the person who caused it.",
  },
  {
    id: "parcel",
    label: "Box in front of the counter",
    name: "Sealed outbound parcel",
    detail: "A taped box with a courier label to a supplier's public address and \"Collection booked 08:00\". The contents list says: 2 × sample pallet straps.",
    hint: "",
    x: 692, y: 448, w: 146, h: 112,
    svg: `<rect x="700" y="462" width="130" height="92" rx="4" fill="#b08a5a" stroke="#8a6a3a" stroke-width="3"/><path d="M700 462l18 -10h130l-18 10" fill="#c9a373" stroke="#8a6a3a" stroke-width="2"/><path d="M830 462l18 -10v92l-18 10" fill="#8a6a3a"/>
      <rect x="756" y="462" width="18" height="92" fill="#e6d3a8" opacity=".8"/><rect x="712" y="492" width="56" height="36" fill="#f4f7fc"/><path d="M718 502h44M718 511h44M718 520h26" stroke="#51648a" stroke-width="3"/>`,
    severity: 0,
    witness: CLEANERS,
    options: [
      { action: "drawer", grade: "waste", text: "You locked the parcel in a cupboard. At 08:00 the courier finds nothing at reception and leaves. The samples go a day late." },
      { action: "leave", grade: "best", text: "A sealed box waiting for its courier, exactly where the courier expects it. The crew mop around it." },
    ],
    reason: "Sealed, public address, expected at reception. Securing things that are already where they should be breaks the process around them.",
  },
  {
    id: "usb",
    label: "Small object on the floor",
    name: "Unknown USB stick",
    detail: "A USB stick on the floor by the printer. No company asset tag. A handwritten label says \"Bonus list Q4\". Nobody you ask has lost one.",
    hint: "",
    x: 312, y: 466, w: 136, h: 74,
    svg: `<g transform="rotate(-12 380 503)"><rect x="336" y="486" width="70" height="34" rx="6" fill="#0d1b33" stroke="#7d94bb" stroke-width="3"/><rect x="406" y="492" width="28" height="22" fill="#c5cfdf" stroke="#7d94bb" stroke-width="2"/>
      <rect x="414" y="498" width="6" height="4" fill="#51648a"/><rect x="424" y="498" width="6" height="4" fill="#51648a"/><rect x="344" y="494" width="50" height="18" rx="2" fill="#f4f7fc"/>
      <path d="M349 500h38M349 507h26" stroke="#b3261e" stroke-width="3" stroke-linecap="round"/><circle cx="330" cy="503" r="7" fill="none" stroke="#7d94bb" stroke-width="3"/></g>`,
    severity: 3,
    witness: CLEANERS,
    options: [
      { action: "report", grade: "best", text: "Picked up, not plugged in, bagged and handed to IT security with where and when you found it. They open it on an isolated machine. Nobody at Meridian becomes the test." },
      { action: "drawer", grade: "ok", text: "Nobody finds it tonight. But nobody knows about it either: a dropped lure means someone tried, and the stick is still waiting for the next curious person to open that drawer." },
      { action: "plug", grade: "harm", harm: 2, text: "You plugged it into the print station \"just to see whose it is\". A file called Bonus_list_Q4 opens to a blank sheet. By morning the print server is beaconing to an outside address and IT are pulling machines off the network." },
      { action: "leave", grade: "exposed", text: "The label does its job. Someone picks it up, reads \"Bonus list Q4\", and plugs it into the nearest PC to have a look." },
    ],
    reason: "An unknown stick with a tempting label is a known attack. Never plug it in, not even to find the owner. Remove it so nobody else does, and report it so security know someone tried.",
  },
  {
    id: "poster",
    label: "Notice on the wall",
    name: "Fire evacuation plan",
    detail: "The floor's evacuation plan: exits, assembly point, a \"you are here\" dot. It is required to be on display, and visitors are meant to read it.",
    hint: "",
    x: 614, y: 44, w: 132, h: 152,
    svg: `<rect x="620" y="50" width="120" height="140" rx="3" fill="#f4f7fc" stroke="#3ddc84" stroke-width="5"/><rect x="620" y="50" width="120" height="22" fill="#1a7f43"/>
      <text x="680" y="66" ${FONT} font-size="11" font-weight="800" text-anchor="middle" fill="#fff">EVACUATION</text>
      <path d="M636 88h88v60h-40v24h-48Z" fill="none" stroke="#51648a" stroke-width="3"/><path d="M700 118h-34v40" stroke="#1a7f43" stroke-width="4" fill="none"/><path d="M660 150l6 10l6 -10" fill="#1a7f43"/><circle cx="706" cy="118" r="5" fill="#ff5d6c"/>`,
    severity: 0,
    witness: TOUR,
    options: [
      { action: "drawer", grade: "waste", text: "You took the evacuation plan off the wall and locked it away. It is a safety notice that must be on display, and it showed nothing but the way out. Facilities put it back." },
      { action: "leave", grade: "best", text: "The tour guide points at it during the safety briefing. It shows the way out, which is exactly what visitors should know." },
    ],
    reason: "It shows a floor layout, but it is meant for visitors and has to be displayed. Being on a wall does not make something an exposure.",
  },
  {
    id: "keys",
    label: "Something hanging from the cabinet",
    name: "Keys left in the HR cabinet",
    detail: "A bunch of keys hangs from the lock of the \"HR FILES\" cabinet. The top drawer is not pushed home. Personnel files are inside.",
    hint: "",
    x: 506, y: 186, w: 92, h: 100,
    svg: `<circle cx="552" cy="208" r="8" fill="#0d1b33" stroke="#c5cfdf" stroke-width="3"/><path d="M552 208v14" stroke="#c5cfdf" stroke-width="5"/>
      <circle cx="556" cy="234" r="12" fill="none" stroke="#f6b93b" stroke-width="4"/>
      <path d="M550 244l-8 28m0 -8h-7m5 -6h-6" stroke="#f6b93b" stroke-width="4" fill="none" stroke-linecap="round"/><path d="M562 244l10 26m0 -8h7" stroke="#c5cfdf" stroke-width="4" fill="none" stroke-linecap="round"/>`,
    severity: 2,
    witness: CLEANERS,
    options: [
      { action: "handin", grade: "best", text: "Drawer pushed home, cabinet locked, keys signed over to security with a note for HR. The files are shut and the keys are with people whose job it is to hold them." },
      { action: "drawer", grade: "ok", text: "Cabinet locked and the keys in your own desk drawer. The files are safe tonight. Tomorrow HR cannot open their cabinet, and you are holding keys to personnel files you have no reason to hold." },
      { action: "leave", grade: "exposed", text: "The crew clean around an open cabinet of personnel files with the keys in the lock. Anyone can read a file, or take the keys and come back." },
    ],
    reason: "Keys in a lock are an open door. Lock it, and give the keys to someone accountable for them rather than becoming an unofficial key holder.",
  },
  {
    id: "sign-in",
    label: "Open book on the counter",
    name: "Visitor sign-in book",
    detail: "The reception sign-in book, open at today's page: visitor names, who they came to see, their companies and car registrations. Tomorrow's visitors will sign the next line.",
    hint: "",
    x: 652, y: 254, w: 150, h: 68,
    svg: `<path d="M664 274q32 -8 64 0q32 -8 64 0v40q-32 -8 -64 0q-32 -8 -64 0Z" fill="#f4f7fc" stroke="#9db2cf" stroke-width="2"/><path d="M728 274v40" stroke="#9db2cf" stroke-width="2"/>
      <path d="M672 284h46M672 293h46M672 302h30M738 284h46M738 293h34" stroke="#1c62e0" stroke-width="3" stroke-linecap="round"/>`,
    severity: 2,
    witness: TOUR,
    options: [
      { action: "drawer", grade: "best", text: "Closed and locked in the reception drawer. Tomorrow reception put it out on a fresh page; the clients sign in without reading who came yesterday." },
      { action: "shred", grade: "harm", harm: 1, text: "Today's page is shredded. The visitor record is something the company has to keep: it is the roll call in a fire and the first thing asked for after an incident. It is gone." },
      { action: "leave", grade: "exposed", text: "Each client on the tour signs in under yesterday's page and reads it while they do: which competitors visited, who they met, what they drive." },
    ],
    reason: "A visitor log is personal data and a record that must be kept. Protect it from the next reader; never destroy it.",
  },
  {
    id: "reception-pc",
    label: "Monitor on the counter",
    name: "Unlocked reception PC",
    detail: "The reception PC is signed in to the delivery booking system: tomorrow's collections with customer names, addresses and gate codes. The screen faces the visitor chairs.",
    hint: "",
    x: 816, y: 196, w: 160, h: 126,
    svg: monitor(
      820, 200, 150, 96,
      `<rect x="828" y="208" width="134" height="80" fill="#e8f0fb"/><rect x="828" y="208" width="134" height="14" fill="#1a7f43"/>${lines(836, 230, 118, 5, 11, "#51648a")}`,
    ),
    severity: 3,
    witness: CLEANERS,
    options: [
      { action: "lock", grade: "best", text: "Locked. The crew wipe the counter in front of a lock screen, and reception sign back in at 08:00." },
      { action: "off", grade: "exposed", text: "The monitor is dark, the session is not locked. A cloth across the keyboard wakes it: tomorrow's collections, addresses and gate codes, signed in as reception." },
      { action: "leave", grade: "exposed", text: "Tomorrow's collections, with customer addresses and gate codes, face the visitor chairs all night, signed in and ready to use." },
    ],
    reason: "The same rule as at your own desk, in the most public spot in the building. One minute, and the cheapest high-value action in the room.",
  },
];

export const SCENARIO: Scenario = {
  id: "last-one-out",
  title: "Last One Out",
  org: "Meridian Freight",
  brief:
    "It is 17:25 and you are the last one out. The cleaning crew arrive at 18:10 and a client tour comes through at 09:05 tomorrow. Three rooms are on your way to the door, and the building alarm sets at 17:55.",
  scenes: [
    {
      id: "desk",
      title: "The desk row",
      brief: "Your team's desks. The cleaning crew work through here first; tomorrow's tour is led past on the way to the meeting room.",
      start: 17 * 60 + 25,
      budget: 7,
      hints: true,
      feedback: true,
      guided: "screen-crm",
      backdrop: DESK_BACKDROP,
      items: DESK_ITEMS,
    },
    {
      id: "meeting",
      title: "The meeting room",
      brief: "Tomorrow's clients sit in this room for twenty minutes before their tour. Three meetings were held here today and nobody tidied up.",
      start: 17 * 60 + 33,
      budget: 10,
      hints: false,
      feedback: true,
      backdrop: MEETING_BACKDROP,
      items: MEETING_ITEMS,
    },
    {
      id: "print",
      title: "Print area and reception",
      brief: "The last stop before the door, and the first thing every visitor sees. No hints here, no feedback until the night plays out, and not a minute to spare.",
      start: 17 * 60 + 44,
      budget: 11,
      hints: false,
      feedback: false,
      backdrop: PRINT_BACKDROP,
      items: PRINT_ITEMS,
    },
  ],
};
