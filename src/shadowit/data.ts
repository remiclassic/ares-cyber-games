import type { Item, Scenario, Zone } from "./engine";

// One office floor at Meridian Freight (fictional). Drawings are inline SVG in a 1000 × 600 scene,
// no external art. Six unsanctioned tools and three sanctioned decoys. Every outcome text is tied to
// the evidence the learner reveals. Pending SME review (docs/design/SHADOW_IT.md).

const ZONES: readonly Zone[] = [
  { id: "sales", name: "Sales", x: 20, y: 20, w: 230, h: 270 },
  { id: "eng", name: "Engineering", x: 260, y: 20, w: 260, h: 270 },
  { id: "mkt", name: "Marketing", x: 530, y: 20, w: 220, h: 270 },
  { id: "board", name: "Boardroom", x: 760, y: 20, w: 220, h: 270 },
  { id: "fin", name: "Finance", x: 20, y: 310, w: 230, h: 270 },
  { id: "ops", name: "Operations", x: 260, y: 310, w: 260, h: 270 },
  { id: "hr", name: "HR", x: 530, y: 310, w: 220, h: 270 },
  { id: "support", name: "Support", x: 760, y: 310, w: 220, h: 270 },
];

const desk = (x: number, y: number, w: number) =>
  `<rect x="${x}" y="${y}" width="${w}" height="56" rx="6" fill="#3d5683" stroke="#5a77a8" stroke-width="2"/><circle cx="${x + w / 2}" cy="${y + 78}" r="14" fill="#26406a" stroke="#3b5c90" stroke-width="2"/>`;

const zoneRects = ZONES.map(
  (zone) => `<g class="zone">
    <rect x="${zone.x}" y="${zone.y}" width="${zone.w}" height="${zone.h}" rx="10" fill="#0f2142" stroke="#24467a" stroke-width="2"/>
    <text x="${zone.x + 14}" y="${zone.y + 26}" fill="#8fb4e6" font-family="Exo 2, Inter, sans-serif" font-size="15" font-weight="700" letter-spacing="2">${zone.name.toUpperCase()}</text>
  </g>`,
).join("");

const BACKDROP = `
  <rect width="1000" height="600" fill="#081429"/>
  <g opacity=".25" stroke="#1d3a66" stroke-width="1"><path d="M0 100h1000M0 200h1000M0 300h1000M0 400h1000M0 500h1000M100 0v600M200 0v600M300 0v600M400 0v600M500 0v600M600 0v600M700 0v600M800 0v600M900 0v600"/></g>
  ${zoneRects}
  ${desk(40, 110, 150)}${desk(40, 205, 150)}
  ${desk(280, 110, 200)}${desk(280, 205, 200)}
  ${desk(550, 110, 180)}${desk(550, 205, 180)}
  <ellipse cx="870" cy="205" rx="85" ry="42" fill="#3d5683" stroke="#5a77a8" stroke-width="2"/>
  <g fill="#26406a" stroke="#3b5c90" stroke-width="2"><circle cx="800" cy="250" r="12"/><circle cx="870" cy="262" r="12"/><circle cx="940" cy="250" r="12"/><circle cx="800" cy="160" r="12"/><circle cx="940" cy="160" r="12"/></g>
  <rect x="772" y="112" width="56" height="8" rx="2" fill="#5a77a8"/>
  ${desk(40, 400, 160)}${desk(40, 495, 160)}
  ${desk(280, 400, 200)}${desk(280, 495, 200)}
  ${desk(550, 400, 180)}${desk(550, 495, 180)}
  ${desk(780, 400, 180)}${desk(780, 495, 180)}
  <g fill="#6f8fbf" opacity=".5">
    <rect x="300" y="226" width="50" height="22" rx="3"/><rect x="410" y="226" width="50" height="22" rx="3"/>
    <rect x="70" y="226" width="50" height="22" rx="3"/><rect x="580" y="226" width="50" height="22" rx="3"/>
    <rect x="70" y="516" width="50" height="22" rx="3"/><rect x="310" y="516" width="50" height="22" rx="3"/>
    <rect x="580" y="516" width="50" height="22" rx="3"/><rect x="810" y="516" width="50" height="22" rx="3"/>
  </g>`;

// ---- small drawings ----
const laptop = (x: number, y: number, screen: string, glyph: string) => `
  <rect x="${x}" y="${y}" width="70" height="44" rx="4" fill="#0d1b33" stroke="#7d94bb" stroke-width="3"/>
  <rect x="${x + 5}" y="${y + 5}" width="60" height="34" fill="${screen}"/>
  ${glyph}
  <path d="M${x - 6} ${y + 46}h82l-6 10h-70Z" fill="#7d94bb"/>`;

const monitor = (x: number, y: number, screen: string, glyph: string) => `
  <rect x="${x}" y="${y}" width="90" height="56" rx="5" fill="#0d1b33" stroke="#7d94bb" stroke-width="3"/>
  <rect x="${x + 6}" y="${y + 6}" width="78" height="44" fill="${screen}"/>
  ${glyph}
  <rect x="${x + 40}" y="${y + 56}" width="10" height="8" fill="#5a77a8"/><rect x="${x + 28}" y="${y + 63}" width="34" height="5" rx="2" fill="#5a77a8"/>`;

const cloud = (cx: number, cy: number, color: string) =>
  `<path d="M${cx - 14} ${cy + 8}h28a8 8 0 0 0 0-16a11 11 0 0 0-21-3a8 8 0 0 0-7 19Z" fill="${color}"/>`;

const folder = (cx: number, cy: number, color: string) =>
  `<path d="M${cx - 15} ${cy - 9}h10l3 4h17v15h-30Z" fill="${color}"/><rect x="${cx - 4}" y="${cy - 1}" width="8" height="8" rx="1" fill="#0d1b33"/>`;

const chat = (cx: number, cy: number, color: string, inner: string) =>
  `<path d="M${cx - 18} ${cy - 13}h36v20h-22l-8 7v-7h-6Z" fill="${color}"/>${inner}`;

const kanban = (x: number, y: number) =>
  `<g fill="#f6b93b"><rect x="${x + 9}" y="${y + 9}" width="14" height="6"/><rect x="${x + 28}" y="${y + 9}" width="14" height="6"/><rect x="${x + 47}" y="${y + 9}" width="14" height="6"/></g>
   <g fill="#0f2142"><rect x="${x + 9}" y="${y + 18}" width="14" height="8"/><rect x="${x + 9}" y="${y + 28}" width="14" height="8"/><rect x="${x + 28}" y="${y + 18}" width="14" height="8"/><rect x="${x + 47}" y="${y + 18}" width="14" height="8"/><rect x="${x + 47}" y="${y + 28}" width="14" height="8"/></g>`;

const sheet = (x: number, y: number) =>
  `<g stroke="#4a8b4a" stroke-width="1.5"><path d="M${x + 10} ${y + 16}h50M${x + 10} ${y + 24}h50M${x + 10} ${y + 32}h50M${x + 10} ${y + 40}h50M${x + 26} ${y + 10}v34M${x + 42} ${y + 10}v34"/></g>
   <rect x="${x + 56}" y="${y + 26}" width="26" height="18" rx="2" fill="#f6b93b" stroke="#0d1b33" stroke-width="1.5"/><path d="m${x + 56} ${y + 26} 13 10 13-10" stroke="#0d1b33" stroke-width="1.5" fill="none"/>`;

// ---- items ----
const ITEMS: readonly Item[] = [
  {
    id: "personal-share",
    label: "Laptop on a Sales desk",
    name: "Personal cloud drive (free tier)",
    team: "Sales",
    x: 64, y: 72, w: 82, h: 58,
    svg: laptop(70, 74, "#e8f0fb", cloud(105, 96, "#8ab4ff")),
    sanctioned: false,
    evidence: [
      { id: "data", label: "Data", value: "Customer contact list (names, phones, emails) and signed contract PDFs for 40 accounts." },
      { id: "owner", label: "Owner", value: "Sales team lead, signed up with a personal email address. Three reps share the login." },
      { id: "why", label: "Why they use it", value: "Proposal packs are too big for email, and they need a link they can send to prospects." },
      { id: "alt", label: "Sanctioned option", value: "Company file share: SSO, expiring external links, files stay in company control." },
    ],
    key: "owner",
    approveAs: "Sanction the personal account with conditions (stronger password, MFA).",
    migrateTo: "Move the files into the company file share and send expiring external links from there; delete the personal copies.",
    outcomes: {
      block: { risk: -8, morale: -10, grade: "ok", text: "The exposure stops, but Sales still has no way to send big proposal packs. The company file share already does this, so blocking without pointing them to it costs morale and invites the next workaround." },
      approve: { risk: 12, morale: 2, grade: "poor", text: "No condition fixes this: the account belongs to a person, not the company. Customer personal data sits where IT cannot see it, offboard it or recover it, and three people share one login." },
      migrate: { risk: -10, morale: 2, grade: "best", text: "Right call. The need is real (big files, an external link) and a sanctioned tool already meets it. Moving the files to the company share keeps Sales working and brings customer data back under company control." },
      leave: { risk: 6, morale: 0, grade: "poor", text: "Customer contact data and contracts stay in a personal account with a shared login. Now that it is known, leaving it is accepting the risk." },
    },
    lesson: "A personal account can never be sanctioned: the company does not own it. When a sanctioned tool already meets the need, migrate.",
  },
  {
    id: "ai-tool",
    label: "Developer's monitor",
    name: "Free online AI chatbot",
    team: "Engineering",
    x: 304, y: 50, w: 96, h: 76,
    svg: monitor(306, 52, "#e8f0fb", chat(351, 80, "#2f7df6", `<text x="351" y="81" font-size="11" font-family="monospace" font-weight="700" text-anchor="middle" fill="#fff">&lt;/&gt;</text>`)),
    sanctioned: false,
    evidence: [
      { id: "data", label: "Data", value: "Chat history shows pasted source code from the billing service, including a database connection string." },
      { id: "terms", label: "Terms", value: "Free tier: the provider may keep inputs and use them to train its models." },
      { id: "why", label: "Why they use it", value: "Four developers use it daily to explain errors and review code. They say it saves hours a week." },
      { id: "alt", label: "Sanctioned option", value: "Company-licensed AI assistant: enterprise terms, no training on inputs, SSO." },
    ],
    key: "terms",
    approveAs: "Sanction the free chatbot with a rule: no secrets in prompts.",
    migrateTo: "Move the developers to the licensed AI assistant; rotate the exposed connection string.",
    outcomes: {
      block: { risk: -8, morale: -15, grade: "ok", text: "The leak stops, but four developers lose a tool that saves them hours, and a licensed equivalent exists. Expect them to try it from a phone instead." },
      approve: { risk: 14, morale: 4, grade: "poor", text: "A 'no secrets' rule does not change the terms: the free tier may keep and train on everything pasted in. Source code with a connection string is already out." },
      migrate: { risk: -10, morale: 3, grade: "best", text: "Right call. The terms are the problem, not AI itself. The licensed assistant gives the same help with no training on inputs. Rotate the exposed connection string as part of the move." },
      leave: { risk: 8, morale: 0, grade: "poor", text: "Proprietary code keeps flowing to a provider that may train on it. The exposure grows every day." },
    },
    lesson: "Free AI tools often keep and train on inputs. Keep the productivity, change the terms: move to the licensed assistant.",
  },
  {
    id: "saas-nosso",
    label: "Marketing planning screen",
    name: "Team-bought project board (SaaS)",
    team: "Marketing",
    x: 594, y: 72, w: 82, h: 58,
    svg: laptop(600, 74, "#e8f0fb", kanban(600, 74)),
    sanctioned: false,
    evidence: [
      { id: "data", label: "Data", value: "Campaign plans and deadlines. Internal only; no customer or personal data." },
      { id: "access", label: "Access", value: "Username and password, no SSO. A contractor who left in March can still log in." },
      { id: "why", label: "Why they use it", value: "The whole team of nine plans every campaign in it, every day. Bought on the manager's expense card." },
      { id: "alt", label: "Sanctioned option", value: "None fits. The vendor offers SSO and an admin console on its business plan." },
    ],
    key: "alt",
    approveAs: "Sanction it on the business plan: turn on SSO, remove the ex-contractor, name an owner, add it to the register.",
    migrateTo: "There is no sanctioned project board. 'Migrating' means moving the team onto shared spreadsheets.",
    outcomes: {
      block: { risk: -4, morale: -18, grade: "poor", text: "The data was low sensitivity and no sanctioned replacement exists. Nine people lose the tool they plan every campaign in, for little risk reduction. They will find another unsanctioned tool by Friday." },
      approve: { risk: -6, morale: 4, grade: "best", text: "Right call. The data is internal, the team depends on it, and nothing sanctioned replaces it. Sanctioning it with SSO closes the real gap (the ex-contractor's access) and puts it on the register." },
      migrate: { risk: -3, morale: -12, grade: "poor", text: "There is no sanctioned equivalent to move to. Spreadsheets slow the team down and the ex-contractor's account is still open until someone closes it." },
      leave: { risk: 5, morale: 0, grade: "poor", text: "A former contractor still has access to campaign plans, and nobody in IT owns the account." },
    },
    lesson: "Low-sensitivity data, a real need and no sanctioned equivalent: approve with conditions. SSO fixes the access problem at the root.",
  },
  {
    id: "smart-speaker",
    label: "Device on the boardroom shelf",
    name: "Smart speaker",
    team: "Boardroom (Facilities)",
    x: 782, y: 62, w: 40, h: 52,
    svg: `<rect x="788" y="66" width="28" height="44" rx="12" fill="#2a3b5c" stroke="#7d94bb" stroke-width="2.5"/><ellipse cx="802" cy="70" rx="12" ry="4" fill="#38d6f5" opacity=".9"/><g stroke="#7d94bb" stroke-width="1.5"><path d="M792 86h20M792 92h20M792 98h20"/></g>`,
    sanctioned: false,
    evidence: [
      { id: "mic", label: "Data", value: "Always-on microphone in the room where acquisitions and pricing are discussed." },
      { id: "net", label: "Network", value: "Joined to the corporate Wi-Fi, not the guest network. Default settings." },
      { id: "owner", label: "Owner", value: "The office manager brought it in as a leaving gift for the team." },
      { id: "why", label: "Why they use it", value: "Background music before meetings and the occasional timer." },
    ],
    key: "mic",
    approveAs: "Sanction it if the mute button stays on during meetings.",
    migrateTo: "Move it to the guest Wi-Fi network.",
    outcomes: {
      block: { risk: -8, morale: -1, grade: "best", text: "Right call. There is no business need (music and timers) and an always-on microphone in the boardroom on the corporate network is a real exposure. Almost nobody misses it." },
      approve: { risk: 10, morale: 1, grade: "poor", text: "A mute rule depends on someone remembering every meeting. An always-listening device in the boardroom, on the corporate network, for background music is not worth it." },
      migrate: { risk: -4, morale: 0, grade: "ok", text: "The guest network takes it off the corporate network, which helps. But the microphone is still in the room where acquisitions are discussed." },
      leave: { risk: 6, morale: 0, grade: "poor", text: "An unmanaged, always-listening device stays on the corporate network in the most sensitive room in the building." },
    },
    lesson: "No business need plus a sensitive location: block. Productivity barely moves when nobody needed the tool.",
  },
  {
    id: "usb-nas",
    label: "Box under a Finance desk",
    name: "USB network storage box",
    team: "Finance",
    x: 132, y: 458, w: 60, h: 40,
    svg: `<rect x="136" y="462" width="52" height="32" rx="4" fill="#1c2b45" stroke="#7d94bb" stroke-width="2.5"/><circle cx="146" cy="472" r="3" fill="#3ddc84"/><circle cx="156" cy="472" r="3" fill="#f6b93b"/><path d="M142 484h40" stroke="#7d94bb" stroke-width="2"/><path d="M188 478c20 0 18-20 0-24" stroke="#7d94bb" stroke-width="2" fill="none"/>`,
    sanctioned: false,
    evidence: [
      { id: "data", label: "Data", value: "Nightly copies of finance spreadsheets, including payroll exports. The disk is not encrypted." },
      { id: "owner", label: "Owner", value: "A finance analyst set it up after a slow restore last year. Nobody else knows the admin password." },
      { id: "why", label: "Why they use it", value: "Peace of mind: a copy they can restore themselves, fast, at month-end." },
      { id: "alt", label: "Sanctioned option", value: "Managed backup with versioning on the finance share; restores now take minutes." },
    ],
    key: "data",
    approveAs: "Sanction it if the analyst turns on disk encryption.",
    migrateTo: "Move the copies to the managed finance share with versioning, then wipe and retire the box.",
    outcomes: {
      block: { risk: -8, morale: -8, grade: "ok", text: "Unplugging it removes the unencrypted payroll copy, but Finance lost confidence in backups for a reason. Without showing them the faster managed restore, they will rebuild it." },
      approve: { risk: 12, morale: 2, grade: "poor", text: "Encryption helps, but payroll still sits on a box under a desk that one person controls, outside managed backup and monitoring. It can walk out of the building." },
      migrate: { risk: -10, morale: 2, grade: "best", text: "Right call. The worry (slow restores) is fixed in the managed backup. Moving the data there, then wiping the box, keeps Finance's peace of mind and removes an unencrypted payroll copy." },
      leave: { risk: 6, morale: 0, grade: "poor", text: "Unencrypted payroll data stays on a portable device only one person can manage." },
    },
    lesson: "Sensitive data on an unmanaged device: migrate to the sanctioned store and retire the device. Fix the reason they built it (slow restores).",
  },
  {
    id: "macro",
    label: "Operations reporting spreadsheet",
    name: "Spreadsheet macro that emails data out",
    team: "Operations",
    x: 304, y: 340, w: 112, h: 76,
    svg: monitor(306, 342, "#e8f0fb", sheet(306, 342)),
    sanctioned: false,
    evidence: [
      { id: "dest", label: "Destination", value: "Every night it emails the report to ops-reports@harbourline.example, a partner whose contract ended in June." },
      { id: "data", label: "Data", value: "Daily shipment report with customer delivery addresses and phone numbers." },
      { id: "why", label: "Why they use it", value: "It replaced a 40-minute manual report the team still reads every morning." },
      { id: "alt", label: "Sanctioned option", value: "Scheduled report in the company BI tool, sent to internal recipients only." },
    ],
    key: "dest",
    approveAs: "Sanction the macro and document it.",
    migrateTo: "Rebuild the report as a scheduled BI report to internal recipients; switch off the external send.",
    outcomes: {
      block: { risk: -8, morale: -12, grade: "ok", text: "Disabling the macro stops customer data leaving, but the team is back to a 40-minute manual report every morning, and the BI tool could have done it for them." },
      approve: { risk: 12, morale: 2, grade: "poor", text: "Documenting it does not change where the data goes: customer addresses and phone numbers are emailed every night to a partner with no contract." },
      migrate: { risk: -10, morale: 3, grade: "best", text: "Right call. The automation is worth keeping; the destination is the problem. A scheduled BI report keeps the time saving and stops customer data going to an ex-partner." },
      leave: { risk: 7, morale: 0, grade: "poor", text: "Customer data keeps going nightly to an external address with no contract behind it." },
    },
    lesson: "Automation is fine; an external destination with no contract is not. Rebuild it on the sanctioned platform and keep the time saving.",
  },
  // ---- sanctioned decoys: they look like the problems above, but IT already runs them ----
  {
    id: "company-share",
    label: "HR laptop",
    name: "Company file share",
    team: "HR",
    x: 574, y: 362, w: 82, h: 58,
    svg: laptop(580, 364, "#e8f0fb", folder(615, 386, "#38d6f5")),
    sanctioned: true,
    evidence: [
      { id: "data", label: "Data", value: "Offer letters and contracts for new starters (personal data)." },
      { id: "access", label: "Access", value: "Company SSO with MFA. Links to candidates expire after 7 days." },
      { id: "owner", label: "Owner", value: "IT runs it; it is on the sanctioned tools register." },
      { id: "why", label: "Why they use it", value: "Sending offer packs to candidates outside the company." },
    ],
    key: "owner",
    approveAs: "Run a fresh approval review.",
    migrateTo: "This is the sanctioned file share. There is nothing to migrate to.",
    outcomes: {
      block: { risk: 4, morale: -18, grade: "poor", text: "This is the sanctioned file share, with SSO and expiring links. Blocking it stops HR sending offers and pushes them toward exactly the personal accounts you are trying to remove." },
      approve: { risk: 0, morale: -2, grade: "ok", text: "Harmless, but it is already on the register. A second review only costs HR some time." },
      migrate: { risk: 2, morale: -10, grade: "poor", text: "It is already the sanctioned tool. Moving HR off it disrupts hiring for no gain." },
      leave: { risk: 0, morale: 0, grade: "best", text: "Right call. Personal data, but in the sanctioned share with SSO, MFA and expiring links. This is what good looks like." },
    },
    lesson: "Sensitive data is not the same as shadow IT. Check the owner and controls: sanctioned tools with SSO stay.",
  },
  {
    id: "licensed-ai",
    label: "Support agent's screen",
    name: "Licensed AI assistant",
    team: "Support",
    x: 804, y: 340, w: 96, h: 76,
    svg: monitor(806, 342, "#e8f0fb", chat(851, 370, "#3ddc84", `<path d="m845 370 4 4 8-8" stroke="#0d1b33" stroke-width="2.5" fill="none"/>`)),
    sanctioned: true,
    evidence: [
      { id: "data", label: "Data", value: "Drafts replies to customer emails, so customer names and order numbers go in." },
      { id: "terms", label: "Terms", value: "Enterprise licence: inputs not kept or used for training; data stays in region." },
      { id: "access", label: "Access", value: "Company SSO; IT manages the licences." },
      { id: "why", label: "Why they use it", value: "Cuts first-reply time for the support queue by about a third." },
    ],
    key: "terms",
    approveAs: "Run a fresh approval review.",
    migrateTo: "This is the sanctioned AI assistant. There is nothing to migrate to.",
    outcomes: {
      block: { risk: 4, morale: -16, grade: "poor", text: "This is the licensed assistant, on enterprise terms with no training on inputs. Blocking it slows the support queue and pushes agents toward free tools." },
      approve: { risk: 0, morale: -2, grade: "ok", text: "Harmless, but it is already licensed and managed. A second review only costs Support time." },
      migrate: { risk: 2, morale: -10, grade: "poor", text: "It is already the sanctioned assistant. Moving Support off it costs time for no gain." },
      leave: { risk: 0, morale: 0, grade: "best", text: "Right call. Same kind of tool as the free chatbot, but the terms are the difference: enterprise licence, no training, SSO." },
    },
    lesson: "AI is not the problem; terms and control are. The licensed assistant is the sanctioned equivalent you migrate others to.",
  },
  {
    id: "video-bar",
    label: "Boardroom wall unit",
    name: "Managed video-conference bar",
    team: "Boardroom (IT)",
    x: 846, y: 38, w: 118, h: 70,
    svg: `<rect x="850" y="42" width="110" height="46" rx="4" fill="#0d1b33" stroke="#7d94bb" stroke-width="3"/><rect x="856" y="48" width="98" height="34" fill="#1d3a66"/><rect x="856" y="92" width="98" height="12" rx="5" fill="#2a3b5c" stroke="#7d94bb" stroke-width="2"/><circle cx="905" cy="98" r="3.5" fill="#38d6f5"/><g fill="#7d94bb"><circle cx="870" cy="98" r="1.6"/><circle cx="876" cy="98" r="1.6"/><circle cx="934" cy="98" r="1.6"/><circle cx="940" cy="98" r="1.6"/></g>`,
    sanctioned: true,
    evidence: [
      { id: "mic", label: "Data", value: "Camera and microphones, active only when a meeting is started from the room panel." },
      { id: "net", label: "Network", value: "On the isolated meeting-room network. Patched and monitored by IT." },
      { id: "owner", label: "Owner", value: "IT bought and manages it; it is on the asset register." },
      { id: "why", label: "Why they use it", value: "Every client and board call from this room runs through it." },
    ],
    key: "owner",
    approveAs: "Run a fresh approval review.",
    migrateTo: "This is the sanctioned meeting-room system. There is nothing to migrate to.",
    outcomes: {
      block: { risk: 2, morale: -12, grade: "poor", text: "This is the managed meeting-room system. Blocking it stops every client and board call from the room; people fall back to laptops and personal accounts." },
      approve: { risk: 0, morale: -2, grade: "ok", text: "Harmless, but it is already on the register and managed by IT." },
      migrate: { risk: 0, morale: -8, grade: "poor", text: "It is already the sanctioned system on the isolated network. Moving it achieves nothing and breaks meetings." },
      leave: { risk: 0, morale: 0, grade: "best", text: "Right call. A microphone in the boardroom like the speaker, but managed by IT, on an isolated network, and only live in a meeting. Ownership and control make the difference." },
    },
    lesson: "Two devices with microphones in the same room: one unmanaged and always listening, one managed and isolated. Ownership decides.",
  },
];

export const SCENARIO: Scenario = {
  id: "the-floor-walk",
  title: "The Floor Walk",
  org: "Meridian Freight",
  brief: "IT has a list of sanctioned tools. The floor has more than that. Walk it, inspect what teams are really using, and decide what happens to each: keep people working and keep data under control.",
  start: { risk: 55, morale: 70 },
  zones: ZONES,
  backdrop: BACKDROP,
  guided: "personal-share",
  items: ITEMS,
};
