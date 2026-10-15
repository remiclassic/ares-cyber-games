import "../ui/practice.css";
import "./style.css";
import { $, esc } from "../ui/dom";

// Playtest hub: one card per Party Plaza port, each opening its own page.

type Entry = Readonly<{
  page: string;
  external?: boolean; // hosted elsewhere: always opens in a new tab, no seed
  core?: boolean; // one of the original Ares practices (listed in their own section)
  video: string;
  title: string;
  tagline: string;
  origin: string;
  minutes: string;
  practises: string;
  watch: readonly string[];
}>;

const GAMES: readonly Entry[] = [
  {
    page: "stack.html",
    video: "videos/secure-stack.mp4",
    title: "Secure Stack",
    tagline: "Match every threat with the defence that stops it",
    origin: "a sticker-merge pile game",
    minutes: "5 islands · 2–4 min each",
    practises: "A bright, touch-first physics pile: drag each defence onto the threat it really stops. Wrong drops explain why; every match teaches one line.",
    watch: ["Is it fun enough to replay for three stars?", "Do players read the crab's explanations, or just guess faster?"],
  },
  {
    page: "https://ares-cyber-game-remi.remiclassic.chatgpt.site/",
    external: true,
    video: "videos/spot-the-phish.mp4",
    title: "Spot the Phish",
    tagline: "Ares Cyber Game · Mission 01",
    origin: "the Ares Cyber Game site",
    minutes: "10 messages · untimed",
    practises: "An inbox of ten fictional messages with a robot coach: read the evidence, then report, verify another way, or continue safely.",
    watch: ["Do players read the context line before deciding?", "Is “Verify another way” understood as a real option?"],
  },
  {
    page: "blastradius.html",
    video: "videos/blast-radius.mp4",
    title: "Blast Radius",
    tagline: "Scope before you contain",
    origin: "Honey Hive",
    minutes: "4–6 min",
    practises: "Scoping a compromise from aggregate sensors, then isolating, keeping or watching each host.",
    watch: ["Does case 1 teach “triage the overlap” without help?", "Is Watch understood as honest uncertainty?"],
  },
  {
    page: "defense.html",
    video: "videos/defense-in-depth.mp4",
    title: "Defense in Depth",
    tagline: "Layer it. They will adapt.",
    origin: "Picnic Patrol",
    minutes: "5–7 min",
    practises: "Placing controls along the attack chain over three waves while attackers switch to fallbacks.",
    watch: ["Do testers ask “what if that control failed?” by wave 2?", "Is the friction budget noticed?"],
  },
  {
    page: "counterplay.html",
    video: "videos/counterplay.mp4",
    title: "Counterplay",
    tagline: "Read it. Name it. Counter it.",
    origin: "Leaf Stone Wave",
    minutes: "5–7 min",
    practises: "Reading a raw log line, naming the technique, and playing the response that actually removes it.",
    watch: ["Are the look-alikes too easy or too hard?", "Do partial fixes feel fair?"],
  },
  {
    page: "bits.html",
    video: "videos/bit-by-bit.mp4",
    title: "Bit by Bit",
    tagline: "Binary, masks and subnets",
    origin: "Bolt Buddies",
    minutes: "about 5 min",
    practises: "Building octets with eight bit gears: binary, subnet masks, sizing a subnet, and finding the network an alert came from.",
    watch: ["Does the live “/26 · 62 usable” readout help or give it away?", "Is the AND view clear without the hint?"],
  },
  {
    page: "rules.html",
    video: "videos/rule-order.mp4",
    title: "Rule Order",
    tagline: "First match wins",
    origin: "Fix-it bench and Tangle Lines",
    minutes: "about 5 min",
    practises: "Reordering and switching off firewall rules until every test packet gets the right verdict, in the fewest changes.",
    watch: ["Do testers trace before they move rules?", "Is the allow-by-default ticket a surprise?"],
  },
  {
    page: "risks.html",
    video: "videos/spot-the-risks.mp4",
    title: "Spot the Risks",
    tagline: "See it. Name it. Fix it.",
    origin: "Picture hunts",
    minutes: "about 5 min",
    practises: "A walk-round of an office after hours and a home office before a client call: find the risks, name them, pick the fix.",
    watch: ["Which risks get missed most?", "Do the decoys cause false alarms?"],
  },
  // ---------- the original Ares practices ----------
  {
    core: true,
    page: "network-defense.html",
    video: "videos/network-defense.mp4",
    title: "Network Defense",
    tagline: "Keep Finance Online",
    origin: "Ares core",
    minutes: "about 5 min",
    practises: "An isometric network board: inspect traffic, write access rules and add backup routes, keeping Finance available while denying prohibited activity.",
    watch: ["Is the first action understood without coaching?", "Do players avoid blanket blocking?"],
  },
  {
    core: true,
    page: "phishing.html",
    video: "videos/phishing-speed-drill.mp4",
    title: "Phishing Speed Drill",
    tagline: "The Payroll Request",
    origin: "Ares core",
    minutes: "3–5 min",
    practises: "An inbox of eight messages: pick up to two cues as evidence, then report, mark safe or verify first. Feedback on every cue.",
    watch: ["Do players pick evidence before deciding?", "Is “Verify first” used for the ambiguous ones?"],
  },
  {
    core: true,
    page: "triage.html",
    video: "videos/incident-triage.mp4",
    title: "Incident Triage Race",
    tagline: "The Busy Morning",
    origin: "Ares core",
    minutes: "4–5 min",
    practises: "Six alerts, three lanes and only two analysts free: rank urgency, justify each call, link alerts that are the same incident, and revise as updates arrive.",
    watch: ["Do loud-but-routine alerts get over-prioritised?", "Is linking alerts discovered?"],
  },
  {
    core: true,
    page: "privilege.html",
    video: "videos/privilege-path.mp4",
    title: "Privilege Path Puzzle",
    tagline: "Who can read payroll?",
    origin: "Ares core",
    minutes: "3–5 min",
    practises: "An access graph of users, nested groups and grants: predict who can reach a resource, test the path, then make the minimal fix.",
    watch: ["Are nested groups understood?", "Do players find the minimal fix?"],
  },
  {
    core: true,
    page: "soc.html",
    video: "videos/soc-dashboard.mp4",
    title: "SOC Dashboard Challenge",
    tagline: "A Strange Login",
    origin: "Ares core",
    minutes: "4–6 min",
    practises: "One incident in depth: request evidence on a time budget, then monitor, investigate, contain or escalate while a transfer keeps running.",
    watch: ["Do players over-investigate a real compromise?", "Is containment justified with evidence?"],
  },
  {
    core: true,
    page: "dispatch.html",
    video: "videos/cyber-dispatch.mp4",
    title: "Cyber Dispatch",
    tagline: "First Shift",
    origin: "Ares core",
    minutes: "about 5 min",
    practises: "Three colleagues report something odd: ask questions, record evidence, set a priority, give a safe next step and hand off to the right analyst.",
    watch: ["Are irrelevant questions avoided?", "Does the handoff carry the evidence?"],
  },
  {
    core: true,
    page: "queryhunt.html",
    video: "videos/query-hunt.mp4",
    title: "Query Hunt",
    tagline: "Unusual Access",
    origin: "Ares core",
    minutes: "about 10 min",
    practises: "An SQL investigation with guided blocks or free SQL: run queries, pin the evidence a result shows, and explain the finding.",
    watch: ["Do beginners manage with guided blocks?", "Is the evidence-pinning step clear?"],
  },
  {
    core: true,
    page: "cloud.html",
    video: "videos/cloud-command.mp4",
    title: "Cloud Command",
    tagline: "First Orbit",
    origin: "Ares core",
    minutes: "about 5 min",
    practises: "Fly between three orbital checkpoints: collect diagnostics, then scale capacity, right-size and narrow access, and see the consequences.",
    watch: ["Is the flight a distraction or a motivator?", "Is the access-review security gate understood?"],
  },
];

function url(entry: Entry): string {
  if (entry.external) return entry.page;
  const seed = ($("#seed") as HTMLInputElement).value.trim();
  return seed ? `${entry.page}?seed=${encodeURIComponent(seed)}` : entry.page;
}

const card = (entry: Entry, index: number) => `
  <article class="game-card">
    <p class="kicker">${index + 1} · from ${esc(entry.origin)} · ${esc(entry.minutes)}</p>
    <h2>${esc(entry.title)}</h2>
    <p class="tag">${esc(entry.tagline)}</p>
    <video controls preload="metadata" src="${entry.video}#t=1.5" aria-label="How to play ${esc(entry.title)}"></video>
    <p>${esc(entry.practises)}</p>
    <h3>Watch for</h3>
    <ul>${entry.watch.map((item) => `<li>${esc(item)}</li>`).join("")}</ul>
    <a class="btn primary" href="${entry.page}" data-index="${index}" ${entry.external ? 'target="_blank" rel="noopener"' : ""}>Play ${esc(entry.title)}${entry.external ? " ↗" : ""}</a>
  </article>`;
const numbered = GAMES.map((entry, index) => ({ entry, index }));
$("#games").innerHTML = numbered.filter(({ entry }) => !entry.core).map(({ entry, index }) => card(entry, index)).join("");
$("#core").innerHTML = numbered.filter(({ entry }) => entry.core).map(({ entry, index }) => card(entry, index)).join("");

const openGame = (event: Event) => {
  const link = (event.target as HTMLElement).closest<HTMLAnchorElement>("a[data-index]");
  if (!link) return;
  event.preventDefault();
  const target = url(GAMES[Number(link.dataset.index)]);
  if (GAMES[Number(link.dataset.index)].external || ($("#newtab") as HTMLInputElement).checked) window.open(target, "_blank", "noopener");
  else location.href = target;
};
$("#games").addEventListener("click", openGame);
$("#core").addEventListener("click", openGame);
