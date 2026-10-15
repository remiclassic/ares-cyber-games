import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings, showModal } from "../ui/dom";
import { TACTICS, WAVES, type TacticId } from "./data";
import { FLIGHT_SECONDS, MAX_INTEGRITY, isRight, pointsFor, technique, waveSchedule, type Ship } from "./engine";

const ACTIVITY_ID = "ares-tactic-orbit/v0.1";
const post = (type: string, payload: unknown) => {
  if (window.parent !== window) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};
const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);
$("#logo").innerHTML = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const params = new URLSearchParams(location.search);
let calm = params.get("calm") !== "off";
let paused = true;
let wave = 0;
let clock = 0;
let ships: Ship[] = [];
let allShips: Ship[] = [];
let schedule = waveSchedule(0);
let selected: number | null = null;
let integrity = MAX_INTEGRITY;
let keySeq = 1;
let feedback: { ok: boolean; text: string } | null = null;
const CALM_STOP = 0.3; // ships wait outside the shield ring

const scene = () => $("#space");
const sectorAngle = (i: number) => (i / TACTICS.length) * Math.PI * 2 - Math.PI / 2;

function buildScene(): void {
  scene().innerHTML = `
    <svg class="stars" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">${Array.from({ length: 70 }, (_, i) => `<circle cx="${(i * 37) % 100}" cy="${(i * 53) % 100}" r="${(i % 3) * 0.12 + 0.12}" fill="#fff" opacity="${0.3 + (i % 5) * 0.12}"/>`).join("")}</svg>
    <div class="station" aria-hidden="true"><svg viewBox="0 0 100 100"><defs><radialGradient id="st" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#7fe6ff"/><stop offset="1" stop-color="#14306a"/></radialGradient></defs><circle cx="50" cy="50" r="30" fill="url(#st)"/><ellipse cx="50" cy="50" rx="46" ry="12" fill="none" stroke="#38d6f5" stroke-width="3" opacity=".7"/><path d="M50 30 38 35v8c0 7 5 12 12 15 7-3 12-8 12-15v-8z" fill="#0a1630" stroke="#fff" stroke-width="2"/><path d="m44 42 4 4 8-8" fill="none" stroke="#7df0b0" stroke-width="3"/></svg></div>
    <div class="ring">${TACTICS.map((tactic, i) => {
      const a = sectorAngle(i);
      return `<button class="sector" data-tactic="${tactic.id}" style="left:${50 + Math.cos(a) * 18}%;top:${50 + Math.sin(a) * 22}%"><b>${i + 1}</b><span>${esc(tactic.name)}</span></button>`;
    }).join("")}</div>
    <div class="ships"></div>
    <div class="banner" hidden></div>`;
}

function shipPos(ship: Ship): { x: number; y: number; progress: number } {
  const age = clock - ship.born;
  let progress = Math.min(1, age / FLIGHT_SECONDS);
  if (calm) progress = Math.min(progress, CALM_STOP);
  const r = 46 - progress * 36;
  return { x: 50 + Math.cos(ship.angle) * r, y: 50 + Math.sin(ship.angle) * r * 0.9, progress };
}

function drawShips(): void {
  const layer = scene().querySelector<HTMLElement>(".ships")!;
  layer.innerHTML = ships
    .filter((s) => s.result === "flying")
    .map((ship) => {
      const p = shipPos(ship);
      const t = technique(ship.technique);
      const deg = (ship.angle * 180) / Math.PI + 180;
      return `<button class="ship ${ship.key === selected ? "sel" : ""}" data-ship="${ship.key}" style="left:${p.x}%;top:${p.y}%" aria-label="Incoming: ${esc(t.name)}">
        <svg viewBox="0 0 40 40" style="transform:rotate(${deg}deg)"><path d="M4 20 34 8l-6 12 6 12z" fill="#ff5d6c" stroke="#fff" stroke-width="2" stroke-linejoin="round"/><circle cx="18" cy="20" r="3" fill="#ffd166"/></svg>
        <span>${esc(t.name)}</span></button>`;
    })
    .join("");
}

function renderSide(): void {
  const ship = ships.find((s) => s.key === selected && s.result === "flying");
  const t = ship ? technique(ship.technique) : null;
  $("#status").innerHTML = `
    <div class="count"><strong>${wave + 1}/${WAVES.length}</strong><span>Wave</span></div>
    <div class="count"><strong>${allShips.reduce((s, x) => s + pointsFor(x), 0)}</strong><span>Score</span></div>
    <div class="count"><strong class="hull">${"■".repeat(integrity)}${"□".repeat(MAX_INTEGRITY - integrity)}</strong><span>Shields</span></div>`;
  $("#intel").innerHTML = `
    <div class="col-head"><h2>Target intel</h2><button class="btn small-btn ghost" data-pause>${paused ? "Resume" : "Pause"}</button></div>
    <div class="d-scroll">
      ${
        t
          ? `<p class="kicker">${esc(t.attack)}</p><h3 class="case-title">${esc(t.name)}</h3><p class="brief">${esc(t.detail)}</p>
             <h4 class="sub-head">Which tactic? Raise that shield</h4>
             <div class="tlist">${TACTICS.map((tactic, i) => `<button class="tbtn" data-tactic="${tactic.id}"><kbd>${i + 1}</kbd><b>${esc(tactic.name)}</b><span>${esc(tactic.short)}</span></button>`).join("")}</div>`
          : `<p class="muted">${paused ? "Paused." : "Select an incoming ship to read its intel."}</p>`
      }
      ${feedback ? `<p class="fb ${feedback.ok ? "good" : "bad"}">${esc(feedback.text)}</p>` : ""}
      <label class="check"><input type="checkbox" id="calm" ${calm ? "checked" : ""}/> Calm mode: ships wait for you</label>
    </div>`;
  ($("#calm") as HTMLInputElement).addEventListener("change", (e) => {
    calm = (e.target as HTMLInputElement).checked;
  });
}

function tag(tactic: TacticId): void {
  const ship = ships.find((s) => s.key === selected && s.result === "flying");
  if (!ship) return;
  ship.tries += 1;
  const t = technique(ship.technique);
  if (isRight(ship.technique, tactic)) {
    ship.result = "shielded";
    feedback = { ok: true, text: `Shield up. ${t.why}` };
    play("success");
    flash(tactic, "good");
    selected = nextSelectable();
  } else {
    const chosen = TACTICS.find((x) => x.id === tactic)!;
    feedback = { ok: false, text: `Not ${chosen.name}. ${t.detail} Think about what this step achieves for the attacker.` };
    play("setback");
    flash(tactic, "bad");
  }
  announce(feedback.text);
  renderSide();
  drawShips();
}

function flash(tactic: TacticId, tone: string): void {
  const el = scene().querySelector<HTMLElement>(`.sector[data-tactic="${tactic}"]`);
  if (!el) return;
  el.classList.remove("good", "bad");
  void el.offsetWidth;
  el.classList.add(tone);
}

function nextSelectable(): number | null {
  const flying = ships.filter((s) => s.result === "flying").sort((a, b) => a.born - b.born);
  return flying[0]?.key ?? null;
}

let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  if (!paused && !isModalOpen()) step(dt);
  requestAnimationFrame(frame);
}

function step(dt: number): void {
  clock += dt;
  while (schedule.length && schedule[0].at <= clock) {
    const next = schedule.shift()!;
    const ship: Ship = { key: keySeq++, technique: next.technique, born: clock, tries: 0, result: "flying", angle: ((keySeq * 137) % 360) * (Math.PI / 180) };
    ships.push(ship);
    allShips.push(ship);
    if (selected === null) selected = ship.key;
    renderSide();
  }
  for (const ship of ships) {
    if (ship.result === "flying" && shipPos(ship).progress >= 1) {
      ship.result = "impact";
      integrity = Math.max(0, integrity - 1);
      feedback = { ok: false, text: `Impact: ${technique(ship.technique).name} got through. It was ${technique(ship.technique).why}` };
      play("alarm");
      if (selected === ship.key) selected = nextSelectable();
      renderSide();
    }
  }
  drawShips();
  const waveDone = !schedule.length && ships.every((s) => s.result !== "flying");
  if (integrity === 0) return finish();
  if (waveDone) {
    paused = true;
    if (wave + 1 >= WAVES.length) return finish();
    const banner = scene().querySelector<HTMLElement>(".banner")!;
    banner.hidden = false;
    banner.innerHTML = `<h3>Wave ${wave + 1} cleared</h3><p>${ships.filter((s) => s.result === "shielded").length} of ${ships.length} stopped.</p><button class="btn primary" data-wave>Next wave</button>`;
    banner.querySelector<HTMLElement>("button")?.focus();
  }
}

document.addEventListener("click", (event) => {
  const t = event.target as HTMLElement;
  const ship = t.closest<HTMLElement>("[data-ship]");
  if (ship) {
    selected = Number(ship.dataset.ship);
    renderSide();
    drawShips();
    return;
  }
  const sector = t.closest<HTMLElement>("[data-tactic]");
  if (sector) return tag(sector.dataset.tactic as TacticId);
  if (t.closest("[data-pause]")) {
    paused = !paused;
    renderSide();
    return;
  }
  if (t.closest("[data-wave]")) {
    wave += 1;
    ships = [];
    clock = 0;
    schedule = waveSchedule(wave);
    selected = null;
    feedback = null;
    scene().querySelector<HTMLElement>(".banner")!.hidden = true;
    paused = false;
    renderSide();
    return;
  }
  if (t.closest("[data-retry]")) location.reload();
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey) return;
  if (/^[1-8]$/.test(event.key)) tag(TACTICS[Number(event.key) - 1].id);
  else if (event.key === " ") {
    event.preventDefault();
    paused = !paused;
    renderSide();
  }
});

let finished = false;
function finish(): void {
  if (finished) return;
  finished = true;
  paused = true;
  const score = allShips.reduce((s, x) => s + pointsFor(x), 0);
  const missed = allShips.filter((s) => s.result !== "shielded" || s.tries > 1);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), score, integrity, ships: allShips });
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head"><p class="kicker">Debrief · Tactic Orbit</p><h2 id="debrief-title" tabindex="-1">Score ${score}<small>/${WAVES.flat().length * 100}</small></h2>
      <p class="muted">${allShips.filter((s) => s.result === "shielded" && s.tries === 1).length} of ${allShips.length} tagged first time · shields ${integrity}/${MAX_INTEGRITY}.</p></header>
      <section class="panel"><h3>Techniques to revisit</h3>${
        missed.length
          ? `<ul class="habits">${missed.map((s) => `<li><b>${esc(technique(s.technique).name)} (${esc(technique(s.technique).attack)}):</b> ${esc(technique(s.technique).why)}</li>`).join("")}</ul>`
          : "<p>None: every technique tagged first time.</p>"
      }</section>
      <section class="panel"><h3>What this practised</h3><ul class="objectives">
        <li>Reading a technique and naming the tactic it serves: the “why” behind an attacker's action.</li>
        <li>Seeing that some techniques serve several tactics (a scheduled task runs code, persists, and can escalate).</li>
        <li>Tactics follow the shape of an intrusion: in, run, stay, escalate, steal logins, look around, move, take out.</li></ul></section>
      <div class="debrief-actions"><button class="btn primary" data-retry>Fly again</button></div>
      <p class="fineprint">A remix of Astro-Defense by the Project Ares games team · new content and twist · pending SME review</p>
    </div>`;
  $("#debrief-title").focus();
}

// ?debug exposes the selected ship's tactics for automated playtests and videos.
if (params.has("debug")) {
  (window as unknown as { __orbit: unknown }).__orbit = {
    selectedTactics: () => {
      const ship = ships.find((s) => s.key === selected && s.result === "flying");
      return ship ? technique(ship.technique).tactics : null;
    },
  };
}

buildScene();
renderSide();
requestAnimationFrame(frame);
showModal({
  kicker: "Remix · MITRE ATT&CK tactics",
  title: "Tactic Orbit",
  body: `<p>Ships are closing on the station, each carrying an ATT&amp;CK <strong>technique</strong>. The station is ringed by eight <strong>tactic</strong> shields.</p>
    <ol class="brief-steps"><li><span><strong>Select a ship</strong> to read its intel.</span></li><li><span><strong>Raise the shield</strong> for the tactic it serves: click the sector, or press 1–8.</span></li></ol>
    <p class="note"><span>Calm mode (on by default) stops ships before they reach the station, so it's about knowing, not reflexes. Turn it off for a challenge. Space pauses.</span></p>`,
  actions: [{ label: "Launch wave 1", primary: true, onClick: () => { paused = false; renderSide(); } }],
});
