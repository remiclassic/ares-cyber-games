import "./style.css";
import { $, announce, esc } from "../ui/dom";
import { addHelpButton, isTutorialOpen, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { ACTIONS, BUDGET_PER_DECISION, CASE, EVIDENCE, INITIAL_BUDGET, INVESTIGATE_BUDGET, MAX_DECISIONS, REASONS, SIGNALS, STALL_MINUTES, TRUTH, at } from "./data/scenario";
import { ACTIVITY_ID, createCaseHost, readLastCaseResult } from "./host";
import { availableActions, canRequest, cluesOf, formatClock, outcomeOf, remainingAssets, run, scoreOf, transferred, variantOf, viewOf } from "./sim/case";
import {
  DECISIONS_MAX,
  OUTCOME_MAX,
  REASONING_MAX,
  SOURCES,
  type ActionId,
  type CaseState,
  type Command,
  type DecisionRecord,
  type EvidenceId,
  type Grade,
  type Rating,
  type ReasonId,
  type Source,
  type Target,
  type Variant,
} from "./sim/types";

type Mode = "practice" | "challenge";
type Screen = "intro" | "play" | "update" | "debrief";
type Pick = { action: ActionId | null; target: Target | null; reason: ReasonId | ""; cited: string[] };

const DECISION_SECONDS = 75;
const MAX_CITED = 3;
const params = new URLSearchParams(location.search);
const host = createCaseHost();
const root = $("#soc");

const emptyPick = (): Pick => ({ action: null, target: null, reason: "", cited: [] });

const ui = {
  screen: "intro" as Screen,
  mode: (params.get("mode") === "challenge" ? "challenge" : "practice") as Mode,
  seed: "",
  forced: undefined as Variant | undefined,
  commands: [] as Command[],
  // Command-log index at which each decision point began (for rewind).
  starts: [0],
  state: run("intro", []),
  pick: emptyPick(),
  secondsLeft: DECISION_SECONDS,
  startedAt: 0,
  rewinds: 0,
  notice: "",
};

// ---------- flow ----------
function newSeed(): string {
  const last = readLastCaseResult();
  for (;;) {
    const seed = Math.random().toString(36).slice(2, 8);
    const variant = variantOf(seed);
    // First case is the compromise; after that, usually flip so replays differ.
    if (!last ? variant === "compromise" : variant !== last.variant || Math.random() < 0.3) return seed;
  }
}

function rebuild(): void {
  ui.state = run(ui.seed, ui.commands, ui.forced);
}

function startCase(retry: boolean): void {
  const fromUrl = !retry ? params.get("seed") : null;
  const variantParam = params.get("variant");
  ui.seed = fromUrl ?? newSeed();
  ui.forced = !retry && (variantParam === "compromise" || variantParam === "approved") ? variantParam : undefined;
  ui.commands = [];
  ui.starts = [0];
  ui.pick = emptyPick();
  ui.secondsLeft = DECISION_SECONDS;
  ui.startedAt = Date.now();
  ui.rewinds = 0;
  ui.notice = "";
  rebuild();
  ui.screen = "play";
  host.started(ui.seed);
  if (retry) host.record({ verb: "retried", object: ACTIVITY_ID });
  render();
  announce(`Decision 1 of ${MAX_DECISIONS}. Review the three evidence panels.`);
}

function push(command: Command): void {
  ui.commands.push(command);
  rebuild();
}

function requestEvidence(id: EvidenceId): void {
  if (!canRequest(ui.state, id)) return;
  const before = ui.state.feed.length;
  push({ type: "request", id });
  const def = EVIDENCE.find((entry) => entry.id === id)!;
  host.record({ verb: "requested", object: id, result: { at: formatClock(ui.state.clock) } });
  const arrived = ui.state.feed.length - before;
  ui.notice = "";
  render();
  announce(`${def.label} returned at ${formatClock(ui.state.clock)}.${arrived > 0 ? ` ${arrived} new event while you waited.` : ""}`);
}

function commitDecision(): void {
  const { action, target, reason, cited } = ui.pick;
  if (!action || !reason || (action === "contain" && !target)) return;
  push({ type: "commit", action, target: target ?? undefined, reason, cited });
  const record = ui.state.decisions[ui.state.decisions.length - 1];
  host.record({ verb: "decided", object: `decision-${record.n}`, result: { action, target, reason, cited, grade: record.grade } });
  ui.starts.push(ui.commands.length);
  ui.pick = emptyPick();
  ui.secondsLeft = DECISION_SECONDS;
  ui.notice = "";
  if (ui.state.ended) finish();
  else ui.screen = "update";
  render();
  window.scrollTo({ top: 0 });
}

function finish(): void {
  ui.screen = "debrief";
  host.complete({
    activityId: ACTIVITY_ID,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: Math.round((Date.now() - ui.startedAt) / 1000),
    seed: ui.seed,
    mode: ui.mode,
    variant: ui.state.variant,
    rewinds: ui.rewinds,
    score: scoreOf(ui.state),
    outcome: outcomeOf(ui.state),
    decisions: ui.state.decisions,
  });
}

function rewind(decision: number): void {
  if (ui.mode !== "practice") return;
  ui.commands.length = ui.starts[decision - 1];
  ui.starts.length = decision;
  ui.rewinds += 1;
  ui.pick = emptyPick();
  rebuild();
  ui.screen = "play";
  host.record({ verb: "rewound", object: `decision-${decision}` });
  render();
  announce(`Rewound to decision ${decision}, at ${formatClock(ui.state.clock)}. Try a different call.`);
}

window.setInterval(() => {
  // The decision clock stands still while the "How to play" walkthrough is open.
  if (ui.screen !== "play" || ui.mode !== "challenge" || isTutorialOpen()) return;
  ui.secondsLeft -= 1;
  if (ui.secondsLeft <= 0) {
    push({ type: "stall" });
    ui.secondsLeft = DECISION_SECONDS;
    ui.notice = `You hesitated. ${STALL_MINUTES} minutes passed in the case and it is now ${formatClock(ui.state.clock)}.`;
    render();
    announce(ui.notice);
    return;
  }
  const timer = root.querySelector(".timer b");
  if (timer) timer.textContent = formatSeconds(ui.secondsLeft);
  root.querySelector(".timer")?.classList.toggle("low", ui.secondsLeft <= 15);
}, 1000);

// ---------- helpers ----------
const formatSeconds = (seconds: number) => `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

const ICON: Record<string, string> = {
  login: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20c.8-4 3.8-6 7.5-6s6.7 2 7.5 6"/>',
  endpoint: '<rect x="4" y="5" width="16" height="11" rx="1.5"/><path d="M2.5 19.5h19"/>',
  network: '<path d="M7 18.5a4.5 4.5 0 0 1-.6-8.960 6 6 0 0 1 11.6 1.2A3.9 3.9 0 0 1 17.5 18.5z"/>',
  monitor: '<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/><circle cx="12" cy="12" r="2.8"/>',
  investigate: '<circle cx="10.5" cy="10.5" r="6"/><path d="M15 15l5.5 5.5"/>',
  contain: '<path d="M12 3l7.5 3v5.5c0 4.6-3.2 8-7.5 9.5-4.3-1.5-7.5-4.9-7.5-9.5V6z"/><path d="M9 12l2.2 2.2L15.2 10"/>',
  escalate: '<path d="M12 20V6"/><path d="M6 11l6-6 6 6"/><path d="M5 20h14"/>',
  standdown: '<circle cx="12" cy="12" r="8.5"/><path d="M8.5 12.2l2.4 2.4 4.6-5"/>',
  clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5l3.2 2"/>',
  target: '<circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.5"/><circle cx="12" cy="12" r="1"/>',
  note: '<rect x="5" y="3.5" width="14" height="17" rx="1.5"/><path d="M8.5 8.5h7M8.5 12h7M8.5 15.5h4"/>',
  chart: '<path d="M4 20h16"/><path d="M7 20v-6M12 20V8M17 20v-9"/><path d="M5 9l5-4 4 3 5-4"/>',
};
const icon = (name: string) => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICON[name]}</svg>`;

const GRADE_LABEL: Record<Grade, string> = { best: "Strongest call", defensible: "Defensible", weak: "Weak", harmful: "Harmful" };
const RATING_LABEL: Record<Rating, string> = { lead: "Lead analyst", analyst: "Analyst", trainee: "Trainee", novice: "Needs another shift" };
const TARGET_LABEL: Record<Target, string> = { account: `Account ${CASE.user}`, host: `Laptop ${CASE.host}`, both: "Account and laptop" };
const SOURCE_NAME: Record<Source, string> = { login: "login", endpoint: "endpoint", network: "network" };

const actionLabel = (id: ActionId) => ACTIONS.find((action) => action.id === id)!.label;
const reasonText = (id: ReasonId) => REASONS.find((reason) => reason.id === id)!.text;
const isNew = (seq: number) => ui.state.decisions.length > 0 && seq === ui.state.decisions.length;

function statusOf(state: CaseState): { label: string; level: number } {
  const open = remainingAssets(viewOf(state)).length;
  if (open === 0) return { label: "Contained", level: 3 };
  if (open === 1) return { label: "Partly contained", level: 2 };
  return { label: "Investigating", level: 1 };
}

function citeButton(id: string): string {
  const on = ui.pick.cited.includes(id);
  return `<button class="cite ${on ? "on" : ""}" data-act="cite" data-id="${esc(id)}" data-key="cite-${esc(id)}" aria-pressed="${on}" title="Cite this as support for your decision">${on ? "Cited" : "Cite"}</button>`;
}

// ---------- panels ----------
function loginMap(): string {
  let dots = "";
  for (let y = 0; y < 9; y += 1) for (let x = 0; x < 16; x += 1) if ((x * 7 + y * 13) % 5 !== 0) dots += `<circle cx="${8 + x * 12}" cy="${10 + y * 11}" r="1.1"/>`;
  return `<svg class="map" viewBox="0 0 196 108" role="img" aria-label="Map: sign-ins from New York and London">
    <g class="map-dots">${dots}</g>
    <path class="map-arc" d="M44 62 Q 98 8 150 44"/>
    <circle class="map-ny" cx="44" cy="62" r="4"/><text x="34" y="80">New York</text>
    <circle class="map-ldn" cx="150" cy="44" r="4"/><text x="134" y="34">London</text>
  </svg>`;
}

function trafficChart(state: CaseState): string {
  const from = at(9, 0);
  const step = 3;
  const count = 60;
  const left = 30;
  const top = 6;
  const width = 262;
  const height = 84;
  const max = 300;
  let bars = "";
  for (let index = 0; index < count; index += 1) {
    const start = from + index * step;
    if (start >= state.clock) break;
    const end = Math.min(start + step, state.clock);
    const moved = (transferred(state.variant, end, state.hostContainedAt) - transferred(state.variant, start, state.hostContainedAt)) * 1000;
    const base = 14 + ((index * 37) % 29) + ((index * index * 11) % 17);
    const barHeight = (Math.min(max, base + moved) / max) * height;
    const x = left + (index * width) / count;
    bars += `<rect class="${moved > 0 ? "hot" : ""}" x="${x.toFixed(1)}" y="${(top + height - barHeight).toFixed(1)}" width="${(width / count - 1.2).toFixed(1)}" height="${barHeight.toFixed(1)}"/>`;
  }
  const nowX = left + ((state.clock - from) / (step * count)) * width;
  const ticks = [9, 10, 11, 12].map((hour, index) => `<text x="${left + (index * width) / 3}" y="${top + height + 13}" text-anchor="middle">${String(hour).padStart(2, "0")}:00</text>`).join("");
  const grid = [0, 150, 300].map((value) => `<text x="${left - 5}" y="${top + height - (value / max) * height + 3}" text-anchor="end">${value}</text><path class="grid" d="M${left} ${top + height - (value / max) * height}H${left + width}"/>`).join("");
  return `<svg class="chart" viewBox="0 0 300 112" role="img" aria-label="Outbound volume per three minutes. ${transferred(state.variant, state.clock, state.hostContainedAt).toFixed(2)} GB sent to ${CASE.destination} so far.">
    ${grid}<g class="bars">${bars}</g>
    <path class="now" d="M${nowX.toFixed(1)} ${top}V${top + height}"/>${ticks}
  </svg>`;
}

function panel(source: Source): string {
  const state = ui.state;
  const signal = SIGNALS[source];
  const view = viewOf(state);
  const details = [
    ...state.revealed
      .filter((item) => EVIDENCE.find((entry) => entry.id === item.id)!.source === source)
      .map((item) => ({ id: item.id as string, at: item.at, seq: item.seq, kind: "evidence", title: EVIDENCE.find((entry) => entry.id === item.id)!.label, lines: item.lines, citable: true })),
    ...state.feed.filter((item) => item.source === source).map((item) => ({ id: item.id, at: item.at, seq: item.seq, kind: item.kind, title: item.title, lines: [item.detail], citable: item.kind === "world" })),
  ].sort((a, b) => a.at - b.at);
  const corroborated = view.sources.includes(source);
  const badge =
    ui.mode === "practice" && corroborated
      ? '<span class="badge solid">Corroborated</span>'
      : details.some((item) => item.kind === "evidence")
        ? '<span class="badge detail">Detail added</span>'
        : '<span class="badge">Partial signal</span>';

  const rows = signal.rows
    .map((row) => `<li><span class="dot ${row.alert ? "alert" : ""}"></span><time>${formatClock(row.time)}</time><span>${esc(row.what)}</span><span class="muted">${esc(row.detail)}</span></li>`)
    .join("");
  let body = `<ul class="rows">${rows}</ul>`;
  if (source === "login") body = `<div class="split">${body}${loginMap()}</div>`;
  if (source === "network") {
    const sent = transferred(state.variant, state.clock, state.hostContainedAt);
    const stopped = state.hostContainedAt !== null;
    body = `<div class="split wide">${trafficChart(state)}
      <dl class="stats">
        <dt>Top destination</dt><dd>${CASE.destination}<small>Uncommon destination</small></dd>
        <dt>Total transferred</dt><dd>${sent.toFixed(2)} GB</dd>
        <dt>Time window</dt><dd>10:26 – ${formatClock(stopped ? state.hostContainedAt! : state.clock)}${stopped ? "<small>Stopped</small>" : ""}</dd>
      </dl></div>`;
  }

  const requests = EVIDENCE.filter((entry) => entry.source === source && !state.revealed.some((item) => item.id === entry.id))
    .map(
      (entry) =>
        `<button class="req" data-act="request" data-id="${entry.id}" data-key="req-${entry.id}" ${canRequest(state, entry.id) ? "" : "disabled"}><span>+ ${esc(entry.label)}</span><em>${entry.minutes} min</em></button>`,
    )
    .join("");

  return `<section class="panel" aria-labelledby="panel-${source}">
    <header>
      <span class="ring">${icon(source)}</span>
      <div><h3 id="panel-${source}">${esc(signal.title)} ${badge}</h3><p>${esc(signal.summary)}</p></div>
      ${citeButton(`sig:${source}`)}
    </header>
    ${body}
    ${
      details.length
        ? `<ul class="details">${details
            .map(
              (item) => `<li class="${item.kind} ${isNew(item.seq) ? "new" : ""}">
            <div class="detail-head"><time>${formatClock(item.at)}</time><strong>${esc(item.title)}</strong>${isNew(item.seq) ? '<span class="new-tag">New</span>' : ""}${item.citable ? citeButton(item.id) : ""}</div>
            ${item.lines.map((line) => `<p>${esc(line)}</p>`).join("")}</li>`,
            )
            .join("")}</ul>`
        : ""
    }
    ${requests ? `<div class="requests" aria-label="Request ${SOURCE_NAME[source]} evidence">${requests}</div>` : ""}
  </section>`;
}

function timeline(state: CaseState): string {
  const events = [
    { at: at(10, 14), title: "Login", note: "New York", alert: false },
    { at: at(10, 24), title: "Archive created", note: "finance_q3.zip", alert: true },
    { at: at(10, 26), title: "Outbound connection", note: CASE.destination, alert: true },
    { at: at(10, 31), title: "MFA challenged", note: "London", alert: true },
    { at: at(10, 32), title: "Login successful", note: "London", alert: true },
    ...state.feed.map((item) => ({ at: item.at, title: item.title, note: item.kind === "action" ? "Your action" : "New event", alert: item.kind === "world", action: item.kind === "action" })),
  ].sort((a, b) => a.at - b.at);
  return `<section class="timeline" aria-labelledby="timeline-title">
    <div class="timeline-head">${icon("clock")}<div><h3 id="timeline-title">Evidence timeline</h3><p>Key events in this case (chronological)</p></div></div>
    <ol>${events
      .map((event) => `<li class="${event.alert ? "alert" : ""} ${"action" in event && event.action ? "action" : ""}"><time>${formatClock(event.at)}</time><span>${esc(event.title)}</span><small>${esc(event.note)}</small></li>`)
      .join("")}<li class="now"><time>${formatClock(state.clock)}</time><span>Now</span><small>Case clock</small></li></ol>
  </section>`;
}

// ---------- decision bar ----------
function decisionBar(state: CaseState): string {
  const available = availableActions(state);
  const open = remainingAssets(viewOf(state));
  const { action, target, reason, cited } = ui.pick;
  const ready = !!action && !!reason && (action !== "contain" || !!target);
  const clues = cluesOf(state);
  const cards = ACTIONS.map((entry) => {
    const disabled = !available.includes(entry.id);
    return `<button class="action ${action === entry.id ? "on" : ""}" data-act="action" data-id="${entry.id}" data-key="action-${entry.id}" aria-pressed="${action === entry.id}" ${disabled ? "disabled" : ""}>
      ${icon(entry.id)}<span><strong>${entry.label}</strong><small>${disabled ? "Already contained" : entry.hint}</small></span><em>${entry.id === "investigate" ? "+2 requests · " : ""}${entry.minutes} min</em></button>`;
  }).join("");
  const targets =
    action === "contain" && open.length === 2
      ? `<div class="targets" role="group" aria-label="What to contain">${(["host", "account", "both"] as Target[])
          .map((id) => `<button class="chip ${target === id ? "on" : ""}" data-act="target" data-id="${id}" data-key="target-${id}" aria-pressed="${target === id}">${TARGET_LABEL[id]}</button>`)
          .join("")}</div>`
      : "";
  const pips = Array.from({ length: Math.max(state.budget, 1) }, (_, index) => `<i class="${index < state.budget ? "on" : ""}"></i>`).join("");
  const preview = action
    ? `<div class="preview-pick">${icon(action)}<div><strong>${actionLabel(action)}${action === "contain" && target ? `: ${TARGET_LABEL[target]}` : ""}</strong>
        <span>Reason: ${reason ? esc(reasonText(reason)) : "not chosen"}</span>
        <span>Cited: ${cited.length ? cited.map((id) => esc(clues.find((clue) => clue.id === id)?.title ?? id)).join(", ") : "nothing yet"}</span></div></div>`
    : '<div class="preview-pick empty">Choose a response to preview what will be recorded.</div>';

  return `<section class="decide" aria-label="Your decision">
    <div class="decide-main">
      <div class="block-head">${icon("target")}<div><h3>Your decision</h3><p>Choose the best response for this situation.</p></div>
        <div class="budget" title="Each request advances the case clock">Evidence requests <span class="pips">${pips}</span> <b>${state.budget}</b></div></div>
      <div class="actions">${cards}</div>${targets}
    </div>
    <div class="decide-reason">
      <div class="block-head">${icon("note")}<div><h3>Your reasoning</h3><p>Select the primary reason, and cite up to ${MAX_CITED} pieces of evidence above.</p></div></div>
      <div class="reason-row">
        <select data-act="reason" data-key="reason" aria-label="Primary reason for your decision">
          <option value="">Select a reason…</option>
          ${REASONS.map((entry) => `<option value="${entry.id}" ${reason === entry.id ? "selected" : ""}>${esc(entry.text)}</option>`).join("")}
        </select>
        <button class="commit" data-act="commit" data-key="commit" ${ready ? "" : "disabled"}>Commit decision →</button>
      </div>
    </div>
    <div class="decide-preview">
      <div class="block-head">${icon("chart")}<div><h3>Debrief preview</h3><p>Your decision + your reasoning</p></div></div>
      ${preview}
    </div>
  </section>`;
}

// ---------- screens ----------
function introScreen(): string {
  const last = readLastCaseResult();
  return `<div class="intro">
    <p class="eyebrow">Project Ares / Training minigame</p>
    <h1>SOC Dashboard Challenge</h1>
    <p class="lede">Practice judgment with incomplete evidence</p>
    <div class="intro-card">
      <h2>First case: A Strange Login</h2>
      <p>A finance user's account shows logins from two cities, a new archive on their laptop, and data leaving for an address nobody recognizes. It could be a compromise. It could be approved work. The opening signals look the same either way.</p>
      <p class="intro-next">Pick a mode, then open the case. A short "How to play" walkthrough comes first.</p>
      <fieldset class="modes"><legend>Mode</legend>
        <label class="${ui.mode === "practice" ? "on" : ""}"><input type="radio" name="mode" value="practice" data-act="mode" ${ui.mode === "practice" ? "checked" : ""}/><strong>Practice</strong><span>Untimed. Coach notes after each decision, and you can rewind to compare another choice.</span></label>
        <label class="${ui.mode === "challenge" ? "on" : ""}"><input type="radio" name="mode" value="challenge" data-act="mode" ${ui.mode === "challenge" ? "checked" : ""}/><strong>Challenge</strong><span>${DECISION_SECONDS} seconds per decision. Hesitate and the case moves on without you. No rewind.</span></label>
      </fieldset>
      <button class="commit" data-act="start" data-key="start">Open the case →</button>
      ${last ? `<p class="last">Last result: ${last.score.total} / 100 (${RATING_LABEL[last.score.rating]})</p>` : ""}
    </div>
    <p class="fine">4 to 6 minute practice loop · Prototype · Content to be reviewed with SMEs</p>
  </div>`;
}

function topbar(state: CaseState): string {
  const dots = Array.from({ length: MAX_DECISIONS }, (_, index) => `<i class="${index < state.decisions.length ? "done" : index === state.decision - 1 && !state.ended ? "on" : ""}"></i>`).join("");
  const timer = ui.mode === "challenge" ? `<div class="timer ${ui.secondsLeft <= 15 ? "low" : ""}">${icon("clock")}<b>${formatSeconds(ui.secondsLeft)}</b></div>` : '<div class="timer off">Untimed</div>';
  return `<header class="topbar">
    <div class="brand">Project Ares <span>|</span> SOC Training</div>
    <span class="mode-chip">${ui.mode}</span><span id="help-slot"></span>
    <div class="progress" aria-label="Decision ${Math.min(state.decision, MAX_DECISIONS)} of ${MAX_DECISIONS}">Decision ${Math.min(state.decision, MAX_DECISIONS)} / ${MAX_DECISIONS}<span class="dots">${dots}</span></div>
    ${timer}
  </header>`;
}

function caseHeader(state: CaseState): string {
  const status = statusOf(state);
  return `<section class="case" aria-label="Active case">
    <span class="ring big">${icon("target")}</span>
    <div class="case-title"><p class="eyebrow">Active case</p><h2>${CASE.title}</h2><p>${CASE.summary}</p></div>
    <dl class="facts">
      <div><dt>User</dt><dd>${CASE.user}</dd></div>
      <div><dt>Asset</dt><dd>${CASE.host}</dd></div>
      <div><dt>Location</dt><dd>${CASE.location}</dd></div>
      <div><dt>First seen</dt><dd>Today ${formatClock(CASE.firstSeen)}</dd></div>
      <div class="clock"><dt>Case clock</dt><dd>${formatClock(state.clock)}</dd></div>
    </dl>
    <div class="status"><p class="eyebrow">Case status</p><strong>${status.label}</strong><span class="meter">${[1, 2, 3].map((level) => `<i class="${level <= status.level ? "on" : ""}"></i>`).join("")}</span></div>
  </section>`;
}

function updateOverlay(state: CaseState): string {
  const record = state.decisions[state.decisions.length - 1];
  const fresh = state.feed.filter((item) => item.seq === state.decisions.length);
  return `<div class="overlay" role="dialog" aria-modal="true" aria-labelledby="update-title"><div class="sheet">
    <p class="eyebrow">Decision ${record.n} committed</p>
    <h2 id="update-title" tabindex="-1">${formatClock(record.at)} → ${formatClock(state.clock)}: what changed</h2>
    <p class="you">You chose <strong>${actionLabel(record.action)}${record.target ? `: ${TARGET_LABEL[record.target]}` : ""}</strong>. ${record.action === "investigate" ? "You have 2 more evidence requests." : ""}</p>
    ${
      fresh.length
        ? `<ul class="changes">${fresh.map((item) => `<li class="${item.kind}"><time>${formatClock(item.at)}</time><div><strong>${esc(item.title)}</strong><p>${esc(item.detail)}</p></div></li>`).join("")}</ul>`
        : '<p class="quiet">No new events were logged while you worked. The transfer total on the dashboard reflects the new time.</p>'
    }
    ${ui.mode === "practice" ? `<div class="coach ${record.grade}"><span class="grade ${record.grade}">${GRADE_LABEL[record.grade]}</span><p>${esc(record.why)}</p></div>` : ""}
    <div class="sheet-actions">
      ${ui.mode === "practice" ? `<button class="ghost" data-act="rewind" data-id="${record.n}" data-key="rewind">↺ Rewind and try another choice</button>` : ""}
      <button class="commit" data-act="continue" data-key="continue">Continue to decision ${state.decision} →</button>
    </div>
  </div></div>`;
}

function fitNote(record: DecisionRecord): string {
  const reason = record.reasonFit === 1 ? "Your reason matched the evidence you had." : record.reasonFit > 0 ? "Your reason partly fit: the evidence you had did not fully support it." : "Your reason did not match the action or the evidence you had.";
  if (record.action === "investigate" || record.action === "monitor") return reason;
  const cite =
    record.citeFit === 1
      ? "You cited evidence that separates the two explanations."
      : record.citeFit > 0
        ? "You cited only signals that fit both explanations."
        : record.cited.length
          ? "The evidence you cited did not support this action."
          : "You cited no evidence for a decisive action.";
  return `${reason} ${cite}`;
}

function debriefScreen(state: CaseState): string {
  const score = scoreOf(state);
  const outcome = outcomeOf(state);
  const truth = TRUTH[state.variant];
  const clues = cluesOf(state);
  const bar = (label: string, value: number, max: number) => `<div class="score-row"><span>${label}</span><div class="track"><i style="width:${(value / max) * 100}%"></i></div><b>${value} / ${max}</b></div>`;
  const tiles =
    state.variant === "compromise"
      ? [
          { label: "Data that left", value: `${outcome.exposedGb.toFixed(2)} GB`, bad: outcome.payrollExposed, note: outcome.payrollExposed ? "Includes payroll records" : "Part of the Q3 package only" },
          { label: "Laptop cut off", value: outcome.hostStopAt === null ? "Never" : formatClock(outcome.hostStopAt), bad: outcome.hostStopAt === null || outcome.hostStopAt > at(10, 43), note: `By ${state.hostContainedAt !== null && state.stoodDownAt === null ? "you" : outcome.resolvedBy}` },
          { label: "Mailbox abuse", value: outcome.fraudAttempt ? "Fraud attempt" : outcome.mailRule ? "Forwarding rule" : "None", bad: outcome.mailRule, note: outcome.accountStopAt === null ? "Account never disabled" : `Account disabled ${formatClock(outcome.accountStopAt)}` },
        ]
      : [
          { label: "Laptop offline", value: `${outcome.hostDownMinutes} min`, bad: outcome.hostDownMinutes > 0, note: outcome.exportCut ? "Audit export cut off" : "Export unaffected" },
          { label: "User locked out", value: `${outcome.accountDownMinutes} min`, bad: outcome.accountDownMinutes > 0, note: "During the audit walkthrough" },
          { label: "Case closed by", value: outcome.resolvedBy.replace(/^./, (letter) => letter.toUpperCase()), bad: outcome.resolvedBy !== "you", note: outcome.deadlineMissed ? "Auditor deadline missed" : "Auditor deadline met" },
        ];

  const replay = state.decisions
    .map((record) => {
      const knew =
        record.view.known === 0
          ? "Opening signals only. Nothing yet separated a compromise from approved work."
          : `Strong evidence from ${record.view.known} ${record.view.known === 1 ? "source" : "sources"} (${record.view.sources.join(", ")}), pointing to ${record.view.direction === "compromise" ? "a compromise" : "approved activity"}.`;
      return `<li class="replay ${record.grade}">
        <div class="replay-head"><span class="num">${record.n}</span><div><time>${formatClock(record.at)} → ${formatClock(record.after)}</time>
          <h4>${actionLabel(record.action)}${record.target ? `: ${TARGET_LABEL[record.target]}` : ""}</h4></div><span class="grade ${record.grade}">${GRADE_LABEL[record.grade]}</span></div>
        <dl>
          <dt>What you knew</dt><dd>${knew} ${record.view.transferredGb.toFixed(2)} GB had been sent.</dd>
          <dt>Your reason</dt><dd>${esc(reasonText(record.reason))}</dd>
          <dt>You cited</dt><dd>${record.cited.length ? record.cited.map((id) => esc(clues.find((clue) => clue.id === id)?.title ?? id)).join(", ") : "Nothing"}</dd>
        </dl>
        <p class="why">${esc(record.why)}</p>
        <p class="fit">${fitNote(record)}</p>
        ${ui.mode === "practice" ? `<button class="ghost" data-act="rewind" data-id="${record.n}" data-key="rewind-${record.n}">↺ Rewind to this decision</button>` : ""}
      </li>`;
    })
    .join("");

  const review = SOURCES.map(
    (source) => `<div><h4>${esc(SIGNALS[source].title)}</h4><ul>${EVIDENCE.filter((entry) => entry.source === source)
      .map((entry) => {
        const finding = entry.finding[state.variant];
        const asked = state.revealed.some((item) => item.id === entry.id);
        return `<li><div><strong>${esc(entry.label)}</strong><span class="tag ${finding.strength}">${finding.strength === "strong" ? "Separates the two" : "Fits both"}</span>${asked ? '<span class="tag asked">You requested</span>' : ""}</div><p>${esc(finding.why)}</p></li>`;
      })
      .join("")}</ul></div>`,
  ).join("");

  return `<div class="debrief"><div id="next-slot"></div>
    <header class="debrief-top">
      <div><p class="eyebrow">Debrief · A Strange Login · ${ui.mode}</p><h1 tabindex="-1">${truth.headline}</h1><p class="story">${truth.story}</p></div>
      <div class="scorecard"><div class="total"><b>${score.total}</b><span>/ 100</span></div><strong>${RATING_LABEL[score.rating]}</strong>
        ${bar("Business outcome", score.outcome, OUTCOME_MAX)}${bar("Decisions", score.decisions, DECISIONS_MAX)}${bar("Evidence and reasoning", score.reasoning, REASONING_MAX)}
      </div>
    </header>
    <section><h2>Business consequences</h2>
      <div class="tiles">${tiles.map((tile) => `<div class="tile ${tile.bad ? "bad" : "good"}"><span>${tile.label}</span><b>${esc(tile.value)}</b><small>${esc(tile.note)}</small></div>`).join("")}</div>
      <ul class="epilogue">${outcome.epilogue.map((line) => `<li>${esc(line)}</li>`).join("")}</ul>
    </section>
    <section><h2>Decision replay</h2><p class="sub">Each call is judged on what you knew at the time, not on how the case turned out.</p><ol class="replays">${replay}</ol></section>
    <section><h2>What each piece of evidence was worth</h2><p class="sub">You used ${state.revealed.length} of ${EVIDENCE.length} possible requests${state.stalls ? ` and lost ${state.stalls * STALL_MINUTES} minutes to hesitation` : ""}.</p><div class="review">${review}</div></section>
    <section class="mission"><h2>Mission connection</h2><p>In a full SOC mission you will explain containment and investigation decisions to an incident lead. The habit this case practices is the same: say what you did, what evidence supported it, and what it cost.</p></section>
    <div class="debrief-actions">
      <button class="commit" data-act="retry" data-key="retry">New case →</button>
      <button class="ghost" data-act="home" data-key="home">Change mode</button>
    </div>
  </div>`;
}

// ---------- walkthrough and "Next" bar ----------
let tutorialSeen = false;
const nextBar = document.createElement("div");
nextBar.id = "next-step";
nextBar.className = "next-bar";
nextBar.setAttribute("aria-live", "polite");

const pill = (label: string) => `<span class="tut-pill">${esc(label)}</span>`;
const minutesOf = (id: ActionId) => ACTIONS.find((action) => action.id === id)!.minutes;

// The first-time walkthrough: the situation, what is on the dashboard, the moves, how evidence
// works (a made-up example), and how it is scored. Reopenable from the top bar.
function tutorialPages(): TutorialPage[] {
  const requestMinutes = [...new Set(EVIDENCE.map((entry) => entry.minutes))].sort((a, b) => a - b);
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You are the analyst on shift. A finance user, <strong>${CASE.user}</strong>, has sign-ins from two cities, a new archive on their laptop <strong>${CASE.host}</strong>, and data leaving for an address nobody recognizes.</p>
        <p class="tut-lead">It could be a compromise. It could be approved work. The opening signals look the same either way, and each case is randomly one or the other.</p>
        <ol class="tut-moves">
          <li><span><b>Connect signals.</b><span class="how">Request evidence that tells the two explanations apart.</span></span></li>
          <li><span><b>Choose a response.</b><span class="how">Monitor, Investigate, Contain, Escalate or Stand down. You get up to ${MAX_DECISIONS} decisions.</span></span></li>
          <li><span><b>Justify the decision.</b><span class="how">Pick your reason and cite the evidence behind it.</span></span></li>
        </ol>
        <p class="tut-note">${icon("clock")}<span>The <strong>case clock</strong> moves with everything you do. While you check, data may still be leaving; act too fast, and you may shut down legitimate work.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">${icon("target")}</span><span><b>Case bar</b>The user, the laptop, the <em>case clock</em> (amber) and the case status.</span></div>
          <div><span class="tut-ico box">${icon("login")}</span><span><b>Three evidence panels</b>Login activity, Endpoint event and Outbound traffic. Red dots mark alerting events.</span></div>
          <div><span class="tut-ico box">${icon("network")}</span><span><b>Outbound traffic</b>Red bars are data going to ${CASE.destination}. <em>Total transferred</em> grows as the case clock moves.</span></div>
          <div><span class="tut-ico box">${icon("note")}</span><span><b>Panel badges</b><em>Partial signal</em> until you request detail, then <em>Detail added</em>. In Practice, <em>Corroborated</em> means that panel now holds evidence that settles the question one way.</span></div>
          <div><span class="tut-ico box">${icon("clock")}</span><span><b>Evidence timeline</b>Every event in time order, including new events that arrive while you work and your own actions.</span></div>
          <div><span class="tut-ico box">${icon("chart")}</span><span><b>Your decision</b>The five responses, your reason, a preview of what will be recorded, and <em>Evidence requests</em> left.</span></div>
        </div>
        <p class="tut-note">${icon("monitor")}<span>The top bar shows <strong>Decision 1 / ${MAX_DECISIONS}</strong> and, in Challenge mode, a ${DECISION_SECONDS}-second timer for each decision.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Request evidence</b> · ${requestMinutes.join(" or ")} min each<span class="how">Under each panel, press a button such as ${pill("+ Device and session detail")}. Each one uses an evidence request and moves the case clock. You start with ${INITIAL_BUDGET}, get ${BUDGET_PER_DECISION} more at each new decision, and ${pill("Investigate")} adds ${INVESTIGATE_BUDGET}.</span></span></li>
          <li><span><b>Choose a response</b><span class="how">Press one card under <em>Your decision</em>: ${ACTIONS.map((action) => `${pill(action.label)} ${action.minutes} min`).join(", ")}. For Contain, also pick ${pill(`Account ${CASE.user}`)}, ${pill(`Laptop ${CASE.host}`)} or ${pill("Account and laptop")}.</span></span></li>
          <li><span><b>Give your reason</b><span class="how">Pick one from the ${pill("Select a reason…")} list.</span></span></li>
          <li><span><b>Cite your evidence</b><span class="how">Press ${pill("Cite")} on a panel or on a returned piece of evidence, up to ${MAX_CITED}. Press it again to remove it.</span></span></li>
          <li><span><b>Commit</b><span class="how">Press ${pill("Commit decision →")}. You see what changed, then press ${pill("Continue to decision 2 →")}. ${pill("Escalate")} and ${pill("Stand down")} close the case; otherwise it ends after decision ${MAX_DECISIONS}.</span></span></li>
        </ol>`,
    },
    {
      title: "How evidence works",
      body: `
        <p>Some evidence fits <strong>both</strong> explanations. Some <strong>separates</strong> them. Only the second kind should settle a decision. A made-up example, not this case:</p>
        <div class="tut-ex">
          <div class="row"><span class="then">Alert:</span><span>a file server copies 40 GB to an outside address at 02:00.</span></div>
          <div class="row"><span class="tag">Fits both</span><span class="arrow">→</span><span>"The transfer is large and at night." A backup and a theft both look like that.</span></div>
          <div class="row"><span class="tag ok">Separates</span><span class="arrow">→</span><span>"The address belongs to the company's backup provider, and the job runs every night."</span></div>
          <div class="row"><span class="tag hot">Separates</span><span class="arrow">→</span><span>"The copy was started by an account that was disabled last week."</span></div>
        </div>
        <ol class="tut-moves">
          <li><span><b>Ask the question that splits the two.</b><span class="how">Before requesting something, ask: would the answer look different if this were approved work?</span></span></li>
          <li><span><b>Weigh the cost of waiting.</b><span class="how">Each request moves the case clock. Once the evidence is clear, more checking only adds delay.</span></span></li>
          <li><span><b>Cite what separates.</b><span class="how">For Contain, Escalate or Stand down, cite the evidence that actually supports that call, not only signals that fit both.</span></span></li>
        </ol>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Business outcome <small>${OUTCOME_MAX}</small></b>What your calls cost. In a compromise: data that left and mailbox abuse. In approved work: downtime, a missed deadline, a case left open or escalated.</div>
          <div><b>Decisions <small>${DECISIONS_MAX}</small></b>Each call graded Strongest, Defensible, Weak or Harmful on what you knew at the time, not on how it turned out.</div>
          <div><b>Evidence and reasoning <small>${REASONING_MAX}</small></b>Your reason fits the evidence you had, and for a decisive call, what you cited supports it.</div>
        </div>
        <p>Total out of 100: 85+ ${RATING_LABEL.lead}, 70+ ${RATING_LABEL.analyst}, 50+ ${RATING_LABEL.trainee}. The debrief replays each decision and shows what every piece of evidence was worth.</p>
        <p class="tut-note">${icon("clock")}<span>You are in <strong>${ui.mode === "challenge" ? "Challenge" : "Practice"}</strong> mode. ${
          ui.mode === "challenge"
            ? `You have ${DECISION_SECONDS} seconds per decision. If it runs out, ${STALL_MINUTES} case minutes pass and the timer restarts. No rewind. The timer is paused while this walkthrough is open.`
            : "No timer. After each decision you get a coach note, and you can rewind to try another choice."
        }</span></p>`,
    },
  ];
}

const helpButton = addHelpButton(() => {
  if (ui.screen !== "play") return;
  showTutorial({ kicker: "SOC Dashboard Challenge · How to play", pages: tutorialPages(), startLabel: "Back to the game", midGame: true, onStart: () => {} });
}, "#help-slot");
helpButton.classList.remove("floating");

// One plain instruction for the current moment, with a ring on what to click. It describes the
// method and reads out what is on screen; it never says which explanation is true.
function renderNext(): void {
  const state = ui.state;
  let step: NextStep;
  if (ui.screen === "debrief") {
    const score = scoreOf(state);
    step = {
      label: "Done",
      tone: "ready",
      text: `<strong>Case closed: ${score.total} / 100.</strong> Read the decision replay to see how each call was judged, then press <strong>New case →</strong> at the bottom.`,
      hint: ui.mode === "practice" ? "Or press Rewind to this decision on any call to try a different one." : "Or press Change mode to switch to Practice.",
      targets: ['[data-act="retry"]'],
    };
  } else if (ui.screen === "update") {
    const record = state.decisions[state.decisions.length - 1];
    step = {
      label: "Done",
      tone: "ready",
      text: `<strong>Decision ${record.n} committed.</strong> Read what changed, then press <strong>Continue to decision ${state.decision} →</strong>.`,
      hint: ui.mode === "practice" ? "The coach note grades the call on what you knew. Rewind and try another choice if you want to compare." : "",
      targets: [".sheet .commit"],
    };
  } else {
    const { action, target, reason, cited } = ui.pick;
    const open = remainingAssets(viewOf(state));
    const decisive = action === "contain" || action === "escalate" || action === "standdown";
    const unasked = EVIDENCE.filter((entry) => !state.revealed.some((item) => item.id === entry.id));
    const askedThisDecision = state.revealed.some((item) => item.seq === state.decisions.length);
    if (!action) {
      if (state.budget > 0 && unasked.length && !askedThisDecision) {
        step = {
          text: `${state.decision === 1 && !state.revealed.length ? "Read the three panels, then <strong>request evidence</strong>" : "<strong>Request evidence</strong>"}: press a <strong>+</strong> button under a panel. You have <strong>${state.budget}</strong> request${state.budget === 1 ? "" : "s"}; each moves the case clock.`,
          hint: "Pick the request whose answer would look different if this were approved work. If what you have already settles it, choose a response instead.",
          targets: SOURCES.map((source) => `.panel[aria-labelledby="panel-${source}"] .requests`),
        };
      } else {
        step = {
          text: `Choose a response under <strong>Your decision</strong>: ${ACTIONS.filter((entry) => availableActions(state).includes(entry.id)).map((entry) => `<strong>${entry.label}</strong>`).join(", ")}.`,
          hint:
            state.budget > 0 && unasked.length
              ? `You still have ${state.budget} evidence request${state.budget === 1 ? "" : "s"} if the evidence leaves the question open. Case clock: ${formatClock(state.clock)}.`
              : `No evidence requests left${unasked.length ? "; Investigate adds " + INVESTIGATE_BUDGET : ""}. Case clock: ${formatClock(state.clock)}.`,
          targets: [".decide .actions"],
        };
      }
    } else if (action === "contain" && !target && open.length === 2) {
      step = { text: `Choose what to contain: <strong>Account ${CASE.user}</strong>, <strong>Laptop ${CASE.host}</strong> or <strong>Account and laptop</strong>.`, targets: [".decide .targets"] };
    } else if (!reason) {
      step = {
        text: `Pick your primary reason from the <strong>Select a reason…</strong> list.`,
        hint: `${actionLabel(action)} takes ${minutesOf(action)} case minutes. Choose the reason that matches the evidence you actually have.`,
        targets: ['select[data-act="reason"]'],
      };
    } else if (decisive && cited.length === 0) {
      step = {
        label: "Check",
        tone: "warn",
        text: `You have cited no evidence for <strong>${actionLabel(action)}</strong>. Press <strong>Cite</strong> on the evidence that supports it (up to ${MAX_CITED}).`,
        hint: "You can still commit, but a decisive call with no cited evidence scores lower on reasoning.",
        targets: [state.revealed.length || state.feed.some((item) => item.kind === "world") ? ".details .cite" : ".panel header .cite"],
      };
    } else if (decisive && cited.every((id) => id.startsWith("sig:"))) {
      step = {
        label: "Check",
        tone: "warn",
        text: `You cited only the opening panel signals. They look the same in a compromise and in approved work.`,
        hint: "If evidence you requested, or a new event, supports this call, cite that. Otherwise you can still commit.",
        targets: [".details .cite", '[data-act="commit"]'],
      };
    } else {
      const ends = action === "escalate" || action === "standdown" || state.decision >= MAX_DECISIONS;
      step = {
        label: "Ready",
        tone: "ready",
        text: `Press <strong>Commit decision →</strong>. ${ends ? "This closes the case." : `This is decision ${state.decision} of ${MAX_DECISIONS}.`}`,
        hint: action === "investigate" || action === "monitor" ? "" : `Cited: ${cited.length} of up to ${MAX_CITED}. Check the Debrief preview first if you want.`,
        targets: ['[data-act="commit"]'],
      };
    }
  }
  renderNextStep(nextBar, step);
}

function render(): void {
  const key =(document.activeElement as HTMLElement | null)?.dataset?.key;
  const state = ui.state;
  root.className = `screen-${ui.screen}`;
  if (ui.screen === "intro") root.innerHTML = introScreen();
  else if (ui.screen === "debrief") root.innerHTML = debriefScreen(state);
  else {
    root.innerHTML = `<div class="dash" ${ui.screen === "update" ? "inert" : ""}>
      ${topbar(state)}${caseHeader(state)}<div id="next-slot"></div>
      ${ui.notice ? `<p class="notice" role="status">${esc(ui.notice)}</p>` : ""}
      <div class="panels">${SOURCES.map(panel).join("")}</div>
      ${timeline(state)}${decisionBar(state)}
      <p class="tagline">Connect signals <i></i> Choose a response <i></i> Justify the decision</p>
    </div>${ui.screen === "update" ? updateOverlay(state) : ""}`;
  }
  // The persistent "Next" bar and "How to play" button move into the freshly rendered screen.
  root.querySelector("#next-slot")?.replaceWith(nextBar);
  const helpSlot = root.querySelector("#help-slot");
  if (helpSlot) helpSlot.replaceWith(helpButton);
  else helpButton.remove();
  if (ui.screen === "intro") nextBar.remove();
  else renderNext();
  const focus = ui.screen === "update" ? root.querySelector<HTMLElement>(".sheet .commit") : ui.screen === "debrief" && !key?.startsWith("rewind") ? root.querySelector<HTMLElement>(".debrief h1") : key ? root.querySelector<HTMLElement>(`[data-key="${key}"]`) : null;
  focus?.focus({ preventScroll: ui.screen === "play" });
}

// ---------- input ----------
root.addEventListener("click", (event) => {
  const element = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!element || element.tagName === "SELECT" || element.tagName === "INPUT") return;
  const id = element.dataset.id ?? "";
  switch (element.dataset.act) {
    case "start":
      startCase(false);
      if (!tutorialSeen) {
        tutorialSeen = true;
        showTutorial({
          kicker: "SOC Dashboard Challenge · How to play",
          pages: tutorialPages(),
          startLabel: "Start decision 1",
          onStart: () => {},
        });
      }
      return;
    case "retry":
      startCase(true);
      return;
    case "home":
      ui.screen = "intro";
      break;
    case "request":
      requestEvidence(id as EvidenceId);
      return;
    case "cite":
      if (ui.pick.cited.includes(id)) ui.pick.cited = ui.pick.cited.filter((entry) => entry !== id);
      else if (ui.pick.cited.length < MAX_CITED) ui.pick.cited.push(id);
      else announce(`You can cite up to ${MAX_CITED} pieces of evidence. Remove one first.`);
      break;
    case "action": {
      const open = remainingAssets(viewOf(ui.state));
      ui.pick.action = id as ActionId;
      ui.pick.target = id === "contain" && open.length === 1 ? open[0] : null;
      break;
    }
    case "target":
      ui.pick.target = id as Target;
      break;
    case "commit":
      commitDecision();
      return;
    case "continue":
      ui.screen = "play";
      render();
      announce(`Decision ${ui.state.decision} of ${MAX_DECISIONS}. Case clock ${formatClock(ui.state.clock)}. You have ${ui.state.budget} evidence requests.`);
      return;
    case "rewind":
      rewind(Number(id));
      return;
  }
  render();
});

root.addEventListener("change", (event) => {
  const element = event.target as HTMLInputElement | HTMLSelectElement;
  if (element.dataset.act === "reason") ui.pick.reason = element.value as ReasonId | "";
  else if (element.dataset.act === "mode") ui.mode = element.value as Mode;
  else return;
  render();
});

render();
