import "./style.css";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { $, announce, esc } from "../ui/dom";
import { CASES, EVIDENCE_SLOTS, REVIEW_MATERIAL, SME_NOTICE } from "./data/case";
import { DATASETS, seedSql } from "./data/dataset";
import { ACTIVITY_ID, createHuntHost } from "./host";
import { addTile, buildSql, removeTile } from "./sim/blocks";
import {
  completedSteps,
  conclude,
  createGame,
  explainFinding,
  otherVariant,
  pinEvidence,
  scoreOf,
  submitQuery,
  useHint,
  type ConcludeFeedback,
  type ExplainFeedback,
  type PinFeedback,
  type QueryFeedback,
} from "./sim/game";
import { runQuery } from "./sim/sql";
import type { Candidate, CaseDef, Challenge, Mode, QueryChallenge, QueryResult, Tile, Value, VariantId } from "./sim/types";
import { sceneSvg } from "./ui/scene";

type Screen = "loading" | "intro" | "play" | "debrief";

const params = new URLSearchParams(location.search);
const host = createHuntHost();
const root = $("#qh");
const dialog = document.querySelector<HTMLDialogElement>("#qh-dialog")!;
const toastEl = document.createElement("div");
toastEl.className = "qh-toast";
toastEl.setAttribute("aria-hidden", "true");
document.body.append(toastEl);

let SQL: SqlJsStatic | null = null;
let db: Database | null = null;

const ui = {
  screen: "loading" as Screen,
  loadError: "",
  mode: (params.get("mode") === "sql" ? "sql" : "guided") as Mode,
  variant: (params.get("variant") === "b" ? "b" : "a") as VariantId,
  game: createGame(CASES.a),
  // Step-local state.
  tray: [] as Tile[],
  sql: "",
  feedback: null as QueryFeedback | null,
  result: null as QueryResult | null,
  picked: new Set<string>(),
  pinFeedback: null as PinFeedback | null,
  choice: "",
  explainFeedback: null as ExplainFeedback | null,
  hints: [] as string[],
  flash: "",
  conclusion: "",
  cited: new Set<string>(),
  concludeFeedback: null as ConcludeFeedback | null,
  sandboxSql: "SELECT * FROM accounts",
  startedAt: 0,
  reduced: window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false,
};

const def = (): CaseDef => CASES[ui.variant];
const challenge = (): Challenge => def().challenges[ui.game.step];
const allCandidates = (): Candidate[] => def().challenges.flatMap((c) => (c.kind === "query" ? [...c.candidates] : []));
// Stable per-dataset order, so the supported answer is not always listed first.
function mixed<T extends { id: string }>(items: readonly T[]): T[] {
  const rank = (id: string): number => [...(id + ui.variant)].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) % 9973, 7);
  return [...items].sort((a, b) => rank(a.id) - rank(b.id));
}
const candidate = (id: string): Candidate | undefined => allCandidates().find((c) => c.id === id);

// ---------- icons ----------
const ICONS: Record<string, string> = {
  target: '<circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="3"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>',
  folder: '<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/>',
  doc: '<path d="M6 3h8l4 4v14H6zM14 3v4h4M9 12h6M9 16h6"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  pin: '<path d="M14 3l7 7-3 1-3 3 .5 4.5-1.5 1.500-4.5-4.5L4 21l5.500-5.500L5 11l1.500-1.500 4.5.5 3-3z"/>',
  play: '<path d="M7 4.500v15l12-7.500z" fill="currentColor"/>',
  bulb: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.500c.7.700 1 1.500 1 2.500h6c0-1 .3-1.800 1-2.500A6 6 0 0 0 12 3z"/>',
  source: '<ellipse cx="12" cy="6" rx="7" ry="3"/><path d="M5 6v6c0 1.700 3.100 3 7 3s7-1.300 7-3V6M5 12v6c0 1.700 3.100 3 7 3s7-1.300 7-3v-6"/>',
  filter: '<path d="M4 5h16l-6 7.500V19l-4 1.500v-8z"/>',
  join: '<circle cx="9" cy="12" r="5.500"/><circle cx="15" cy="12" r="5.500"/>',
  group: '<path d="M5 20V10M10 20V4M15 20v-8M20 20V8"/>',
  sort: '<path d="M7 4v16M7 20l-3-3M7 20l3-3M13 6h8M13 12h6M13 18h3"/>',
  table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 10h18M9 4v16"/>',
  flask: '<path d="M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.800 3h10.400a2 2 0 0 0 1.800-3l-5-9V3"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2zM4 21V5M8 7h7"/>',
  redo: '<path d="M20 11a8 8 0 1 0-2.300 6M20 5v6h-6"/>',
  x: '<path d="M6 6l12 12M18 6L6 18"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};
const ico = (name: string): string => `<svg class="ico" viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

// ---------- flow ----------
function resetStep(): void {
  ui.tray = [];
  ui.sql = "";
  ui.feedback = null;
  ui.result = null;
  ui.picked = new Set();
  ui.pinFeedback = null;
  ui.choice = "";
  ui.explainFeedback = null;
  ui.hints = [];
}

function startCase(variant: VariantId, retry: boolean): void {
  if (!SQL) return;
  db?.close();
  db = new SQL.Database();
  db.run(seedSql(DATASETS[variant]));
  ui.variant = variant;
  ui.game = createGame(def());
  resetStep();
  ui.flash = "";
  ui.conclusion = "";
  ui.cited = new Set();
  ui.concludeFeedback = null;
  ui.startedAt = Date.now();
  ui.screen = "play";
  host.started(variant);
  if (retry) host.record({ verb: "retried", object: ACTIVITY_ID, result: { variant } });
  render("first");
  announce(`Challenge 1 of ${def().challenges.length}. ${challenge().question}`);
}

function toast(text: string): void {
  toastEl.innerHTML = `${ico("star")}<span>${text}</span>`;
  toastEl.classList.remove("on");
  void toastEl.offsetWidth;
  toastEl.classList.add("on");
}

function currentSql(): string | null {
  return ui.mode === "guided" ? buildSql(ui.tray) : ui.sql;
}

function run(): void {
  if (!db || ui.game.phase !== "query") return;
  const sql = currentSql();
  if (sql === null) {
    ui.feedback = { kind: "sql-error", blocked: true, message: "Start with a data block: choose where the rows come from." };
    ui.result = null;
    render();
    announce(ui.feedback.message);
    return;
  }
  const out = submitQuery(def(), ui.game, db, sql, ui.mode);
  ui.game = out.game;
  ui.feedback = out.feedback;
  ui.result = out.feedback.kind === "sql-error" ? null : out.feedback.result;
  ui.flash = "";
  host.record({ verb: "queried", object: challenge().id, result: { outcome: out.feedback.kind, mode: ui.mode } });
  if (out.feedback.kind === "match") {
    render("pin-first");
    announce("The result answers the question. Now pin the evidence it shows.");
  } else {
    render();
    announce(out.feedback.kind === "sql-error" ? `SQL error. ${out.feedback.message}` : `The query ran, but ${out.feedback.message}`);
  }
}

function pin(): void {
  const out = pinEvidence(def(), ui.game, [...ui.picked]);
  ui.game = out.game;
  ui.pinFeedback = out.feedback;
  host.record({ verb: "pinned", object: challenge().id, result: { accepted: out.feedback.accepted, selected: [...ui.picked] } });
  if (out.feedback.accepted) {
    const points = ui.game.steps[ui.game.step].points.evidence;
    toast(`Evidence pinned <b>+${points}</b>`);
    render("explain-first");
    announce(`Evidence pinned. ${ui.game.evidence.length} of ${EVIDENCE_SLOTS.length} collected. Now explain the finding.`);
  } else {
    render();
    announce(`${out.feedback.message} ${out.feedback.notes.map((n) => n.text).join(" ")}`);
  }
}

function explain(): void {
  if (!ui.choice) return;
  const step = ui.game.step;
  const out = explainFinding(def(), ui.game, ui.choice);
  ui.game = out.game;
  ui.explainFeedback = out.feedback;
  host.record({ verb: "explained", object: def().challenges[step].id, result: { answer: ui.choice, correct: out.feedback.correct } });
  if (out.feedback.correct) {
    toast(`Connection discovered <b>+${ui.game.steps[step].points.interpretation}</b>`);
    resetStep();
    ui.flash = out.feedback.message;
    render("first");
    announce(`Finding recorded. Challenge ${ui.game.step + 1} of ${def().challenges.length}. ${challenge().question}`);
  } else {
    render();
    announce(`Not supported. ${out.feedback.message}`);
  }
}

function submitConclusion(): void {
  if (!ui.conclusion) return;
  const out = conclude(def(), ui.game, ui.conclusion, [...ui.cited]);
  ui.game = out.game;
  ui.concludeFeedback = out.feedback;
  host.record({ verb: "concluded", object: challenge().id, result: { answer: ui.conclusion, cited: [...ui.cited], correct: out.feedback.correct } });
  if (!out.feedback.correct) {
    render();
    announce([out.feedback.conclusion, out.feedback.evidence].filter(Boolean).join(" "));
    return;
  }
  const score = scoreOf(def(), ui.game);
  host.complete({
    activityId: ACTIVITY_ID,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: Math.round((Date.now() - ui.startedAt) / 1000),
    variant: ui.variant,
    score,
    challenges: def().challenges.map((c, i) => {
      const s = ui.game.steps[i];
      return { id: c.id, sql: s.solvedSql, mode: s.solvedMode, runs: s.runs, sqlErrors: s.sqlErrors, mismatches: s.mismatches, wrongPins: s.wrongPins, wrongExplanations: s.wrongExplains, hints: s.hints };
    }),
    conclusion: { chosen: ui.game.conclusion.chosen, cited: ui.game.conclusion.cited, wrong: ui.game.conclusion.wrong, tries: ui.game.conclusion.tries },
  });
  ui.screen = "debrief";
  render("first");
  announce(`Case closed. Investigation score ${score.total} of ${score.max}.`);
}

function hint(): void {
  const out = useHint(def(), ui.game);
  if (!out.hint) return;
  ui.game = out.game;
  ui.hints.push(out.hint);
  host.record({ verb: "hinted", object: challenge().id });
  render();
  announce(`Hint. ${out.hint}`);
}

// ---------- shared pieces ----------
const cell = (v: Value): string => (v === null ? '<i class="null">NULL</i>' : esc(v));

function highlighted(result: QueryResult, cards: readonly Candidate[]): Set<number> {
  const rows = new Set<number>();
  for (const card of cards) {
    if (!card.highlight) continue;
    const at = result.columns.findIndex((c) => c.toLowerCase() === card.highlight!.column);
    if (at < 0) continue;
    result.rows.forEach((row, i) => String(row[at]) === card.highlight!.value && rows.add(i));
  }
  return rows;
}

function tableHtml(result: QueryResult, marked: Set<number> = new Set(), label = "Query result"): string {
  if (!result.columns.length || !result.rows.length) return '<p class="meta">The query ran and returned no rows.</p>';
  const max = 100;
  const head = result.columns.map((c) => `<th scope="col">${esc(c)}</th>`).join("");
  const body = result.rows
    .slice(0, max)
    .map((row, i) => `<tr data-row="${i}"${marked.has(i) ? ' class="hl"' : ""}>${row.map((v) => `<td>${cell(v)}</td>`).join("")}</tr>`)
    .join("");
  const count = `${result.truncated ? "More than " : ""}${result.rows.length} row${result.rows.length === 1 ? "" : "s"}${result.rows.length > max ? `, first ${max} shown` : ""}`;
  return `<p class="meta">${count}</p><div class="tablewrap" tabindex="0" role="region" aria-label="${label}, ${count}" data-key="table"><table><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`;
}

function cardHtml(card: Candidate, compact = false): string {
  return `<div class="card-head">${ico("doc")}<div><strong>${esc(card.title)}</strong><span>${card.source === "none" ? "no source" : `${esc(card.source)} table`}</span></div></div>
    <dl>${card.fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl>${compact ? "" : `<p>${esc(card.note)}</p>`}`;
}

const PHASE_LABEL: Record<string, string> = {
  query: "Build and run a query",
  pin: "Pin what the result shows",
  explain: "Explain the finding",
  conclude: "State your conclusion",
  done: "Case closed",
};

// ---------- intro ----------
function introHtml(): string {
  const modeCard = (mode: Mode, title: string, text: string): string =>
    `<label class="mode-card"><input type="radio" name="mode" value="${mode}" ${ui.mode === mode ? "checked" : ""} data-key="mode-${mode}"/><span><strong>${title}</strong>${text}</span></label>`;
  return `<section class="intro" aria-labelledby="intro-title">
    <p class="eyebrow">Case 01 · SQL investigation practice</p>
    <h1 id="intro-title">ARES: <span>QUERY HUNT</span></h1>
    <h2>Unusual Access</h2>
    <p class="lead">${esc(def().brief)}</p>
    <ol class="loop"><li>Read the question</li><li>Build a query</li><li>Run it locally</li><li>Pin the evidence</li><li>Explain the finding</li></ol>
    <ul class="goals">
      <li>Filter and aggregate records.</li>
      <li>Correlate events using identifiers and time.</li>
      <li>Tell a suspicious observation from a confirmed conclusion.</li>
    </ul>
    <fieldset class="modes"><legend>How do you want to write queries? You can switch at any time.</legend>
      ${modeCard("guided", "Beginner: guided blocks", "Pick blocks and watch the SQL they produce.")}
      ${modeCard("sql", "Practice: write SQL", "Type the query yourself, with the schema at hand.")}
    </fieldset>
    <button class="commit" data-act="start" data-key="first">${ico("play")} Start the investigation</button>
    <p class="fine">Five challenges, about 10 minutes. Queries run in your browser against a small synthetic dataset: no real accounts, no network access. Running a query never collects evidence by itself.</p>
    <p class="sme">${SME_NOTICE}</p>
  </section>`;
}

// ---------- play ----------
function headerHtml(): string {
  const c = challenge();
  const score = scoreOf(def(), ui.game);
  return `<header class="top">
    <div class="brand"><h1>ARES: <span>QUERY HUNT</span></h1><p>CASE 01 <i>|</i> ${esc(def().title)} <i>|</i> ${esc(def().variantLabel)}</p></div>
    <div class="objective">${ico("target")}<div><strong>${esc(c.title)}</strong><span>Challenge ${ui.game.step + 1} of ${def().challenges.length} · ${PHASE_LABEL[ui.game.phase]}</span></div></div>
    <div class="stat">${ico("folder")}<div><span>Evidence</span><b>${ui.game.evidence.length} / ${EVIDENCE_SLOTS.length}</b></div></div>
    <div class="stat gold">${ico("star")}<div><span>Investigation score</span><b>${score.total}</b></div></div>
    <div class="stat plain">${ico("bulb")}<div><span>Hints used</span><b>${score.hints}</b></div></div>
  </header>`;
}

function inventoryHtml(): string {
  const slots = EVIDENCE_SLOTS.map((slot, i) => {
    const card = ui.game.evidence.includes(slot.id) ? candidate(slot.id) : undefined;
    if (!card) return `<li class="slot empty">${ico("doc")}<div><strong>Evidence ${i + 1}</strong><span>Not collected yet</span></div></li>`;
    return `<li class="slot got"><details><summary data-key="slot-${slot.id}">${ico("doc")}<div><strong>${esc(slot.title)}</strong><span>${esc(card.source)}</span></div><i class="tick">${ico("check")}</i></summary>
      <div class="slot-body"><p class="slot-title">${esc(card.title)}</p><dl>${card.fields.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join("")}</dl></div></details></li>`;
  }).join("");
  return `<aside class="inventory" aria-label="Evidence inventory">
    <h2><span>Evidence inventory</span><b>${ui.game.evidence.length} / ${EVIDENCE_SLOTS.length}</b></h2>
    <ul>${slots}</ul>
    <div class="tools">
      <button class="ghost" data-act="sandbox" data-key="sandbox">${ico("flask")} Practice sandbox</button>
      <button class="ghost" data-act="schema" data-key="schema">${ico("table")} Schema</button>
      <button class="ghost" data-act="review" data-key="review">${ico("book")} Review material</button>
      <button class="ghost" data-act="motion" data-key="motion" aria-pressed="${ui.reduced}">Reduced motion: ${ui.reduced ? "on" : "off"}</button>
    </div>
  </aside>`;
}

function mapHtml(): string {
  const done = completedSteps(ui.game);
  const nodes = def().challenges.map((c, i) => ({ title: c.node, state: i < done ? ("done" as const) : i === done ? ("active" as const) : ("locked" as const) }));
  const list = nodes.map((n, i) => `<li>${i + 1}. ${n.state === "locked" ? "Not yet revealed" : esc(n.title)}: ${n.state === "done" ? "discovered" : n.state === "active" ? "current" : "locked"}</li>`).join("");
  return `<section class="map" aria-label="Incident map">
    ${sceneSvg(nodes)}
    <ol class="sr-only">${list}</ol>
    <p class="sme">${SME_NOTICE}</p>
  </section>`;
}

const KIND_LABEL: Record<Tile["kind"], string> = { source: "Data", join: "Combine", filter: "Filter", group: "Summarize", sort: "Sort" };

function guidedHtml(c: QueryChallenge, locked: boolean): string {
  const sql = buildSql(ui.tray);
  const tray = ui.tray
    .map(
      (t) => `<li class="tile k-${t.kind}">${ico(t.kind)}<span>${esc(t.label)}</span>${locked ? "" : `<button data-act="tile-del" data-id="${t.id}" data-key="del-${t.id}" aria-label="Remove ${esc(t.label)}">${ico("x")}</button>`}</li>`,
    )
    .join("");
  const kinds = [...new Set(c.tiles.map((t) => t.kind))];
  const palette = kinds
    .map(
      (kind) => `<div class="pal-group"><span>${KIND_LABEL[kind]}</span>${c.tiles
        .filter((t) => t.kind === kind)
        .map((t) => {
          const on = ui.tray.some((x) => x.id === t.id);
          return `<button class="tile k-${t.kind}" draggable="true" data-act="tile-toggle" data-id="${t.id}" data-key="tile-${t.id}" aria-pressed="${on}">${ico(t.kind)}<span>${esc(t.label)}</span></button>`;
        })
        .join("")}</div>`,
    )
    .join("");
  return `<ol class="tray" aria-label="Your query blocks, in order" data-drop>${tray}<li class="slot-plus" aria-hidden="true">+</li></ol>
    ${locked ? "" : `<div class="palette" role="group" aria-label="Available blocks. Press Enter to add or remove a block.">${palette}</div>`}
    <div class="sqlview"><span>SQL produced by your blocks</span><pre><code>${sql ? esc(sql) : "-- add a data block to begin"}</code></pre></div>`;
}

function builderHtml(): string {
  const c = challenge();
  const hints = ui.hints.length ? `<ol class="hints" aria-label="Hints shown">${ui.hints.map((h) => `<li>${esc(h)}</li>`).join("")}</ol>` : "";
  const left = c.hints.length - ui.game.steps[ui.game.step].hints;
  const hintButton = `<button class="ghost" data-act="hint" data-key="hint" ${left ? "" : "disabled"}>${ico("bulb")} Hint (${left} left)</button>`;
  const head = `<div class="q"><p class="eyebrow">Challenge ${ui.game.step + 1} of ${def().challenges.length} · ${esc(c.node)}</p><h2 id="q-title">${esc(c.question)}</h2>`;

  if (c.kind === "conclusion") {
    return `<section class="builder" aria-labelledby="q-title">${head}
      <p class="req-note">No new query is needed. Use the evidence you pinned. The practice sandbox stays open if you want to check something first.</p></div>
      <div class="bar">${hintButton}</div>${hints}</section>`;
  }

  const locked = ui.game.phase !== "query";
  const modeBtn = (mode: Mode, label: string): string => `<button data-act="mode" data-mode="${mode}" data-key="tab-${mode}" aria-pressed="${ui.mode === mode}" ${locked ? "disabled" : ""}>${label}</button>`;
  const solved = ui.game.steps[ui.game.step].solvedSql;
  const editor = locked
    ? `<div class="sqlview done"><span>${ico("check")} Your query, checked against the expected result</span><pre><code>${esc(solved ?? "")}</code></pre></div>`
    : ui.mode === "guided"
      ? guidedHtml(c, false)
      : `<label class="editor"><span>SQL (SQLite). Ctrl+Enter runs it.</span><textarea id="sql" data-key="sql" spellcheck="false" rows="6" placeholder="SELECT ...">${esc(ui.sql)}</textarea></label>
         <details class="schema-inline"><summary data-key="schema-inline">Schema help</summary>${schemaHtml()}</details>`;
  return `<section class="builder" aria-labelledby="q-title">${head}
      <dl class="req"><dt>Result must include</dt><dd>${esc(c.mustInclude)}</dd><dt>Order</dt><dd>${esc(c.ordering)}</dd></dl></div>
    <div class="bar">
      <div class="seg" role="group" aria-label="Query mode">${modeBtn("guided", "Guided blocks")}${modeBtn("sql", "Write SQL")}</div>
      ${hintButton}
      ${!locked && ui.mode === "guided" ? `<button class="ghost" data-act="clear" data-key="clear" ${ui.tray.length ? "" : "disabled"}>${ico("redo")} Clear all</button>` : ""}
    </div>
    ${editor}
    ${hints}
    <div class="runrow"><p>Runs in your browser on synthetic data. Read-only.</p>
      <button class="commit run" data-act="run" data-key="run" ${locked ? "disabled" : ""}>${ico("play")} Run query</button></div>
  </section>`;
}

function queryFeedbackHtml(): string {
  const f = ui.feedback;
  if (!f) return `<p class="placeholder">${ico("table")}Rows from your query appear here.</p>`;
  if (f.kind === "sql-error") {
    return `<div class="note bad" role="alert"><strong>${f.blocked ? "Not run" : "SQL error: the statement did not run"}</strong><p>${esc(f.message)}</p>${f.detail ? `<code>${esc(f.detail)}</code>` : ""}
      ${f.blocked ? "" : "<p class=\"sub\">This is about how the query is written, not about the investigation.</p>"}</div>`;
  }
  if (f.kind === "mismatch") {
    return `<div class="note warn" role="alert"><strong>The SQL is valid, but the result does not answer the question</strong><p>${esc(f.message)}</p></div>${tableHtml(f.result)}`;
  }
  return "";
}

function resultHtml(): string {
  const c = challenge();
  const flash = ui.flash ? `<div class="note good"><strong>Finding recorded</strong><p>${esc(ui.flash)}</p></div>` : "";
  let body = "";

  if (c.kind === "conclusion") {
    const fb = ui.concludeFeedback;
    const options = mixed(c.options)
      .map((o) => `<label class="choice"><input type="radio" name="conclusion" value="${o.id}" data-key="con-${o.id}" ${ui.conclusion === o.id ? "checked" : ""}/><span>${esc(o.text)}</span></label>`)
      .join("");
    const evidence = ui.game.evidence
      .map((id) => {
        const card = candidate(id)!;
        return `<label class="choice ev"><input type="checkbox" name="cited" value="${id}" data-key="cite-${id}" ${ui.cited.has(id) ? "checked" : ""}/><span><strong>${esc(card.title)}</strong>${esc(card.note)}</span></label>`;
      })
      .join("");
    const notes = fb && !fb.correct ? `<div class="note warn" role="alert"><strong>Not supported yet</strong>${fb.conclusion ? `<p>${esc(fb.conclusion)}</p>` : ""}${fb.evidence ? `<p>${esc(fb.evidence)}</p>` : ""}</div>` : "";
    body = `${flash}<fieldset><legend>1. Which conclusion can you defend?</legend>${options}</fieldset>
      <fieldset><legend>2. Which evidence supports it?</legend>${evidence}</fieldset>
      ${notes}<button class="commit" data-act="conclude" data-key="conclude">${ico("check")} Submit conclusion</button>`;
    return `<aside class="result" aria-label="Conclusion"><h2>Final conclusion</h2>${body}</aside>`;
  }

  if (ui.game.phase === "query") {
    body = flash + queryFeedbackHtml();
  } else if (ui.game.phase === "pin" && ui.result) {
    const fb = ui.pinFeedback;
    const picked = c.candidates.filter((x) => ui.picked.has(x.id));
    const cards = mixed(c.candidates)
      .map((x, i) => `<label class="cand"><input type="checkbox" name="cand" value="${x.id}" data-key="${i === 0 ? "pin-first" : `cand-${x.id}`}" ${ui.picked.has(x.id) ? "checked" : ""}/><div>${cardHtml(x)}</div></label>`)
      .join("");
    const notes = fb && !fb.accepted
      ? `<div class="note warn" role="alert"><strong>${esc(fb.message)}</strong>${fb.notes.map((n) => `<p><b>${esc(n.title)}:</b> ${esc(n.text)}</p>`).join("")}</div>`
      : "";
    body = `<div class="note good"><strong>${ico("check")} The result answers the question</strong><p>Nothing is collected yet. Pin the observations this result supports.</p></div>
      ${tableHtml(ui.result, highlighted(ui.result, picked))}
      <fieldset class="cands"><legend>Which of these does your result show?</legend>${cards}</fieldset>
      ${notes}<button class="commit" data-act="pin" data-key="pin">${ico("pin")} Pin evidence</button>`;
  } else if (ui.game.phase === "explain") {
    const fb = ui.explainFeedback;
    const pinned = c.candidates.filter((x) => x.verdict === "relevant");
    const kept = ui.pinFeedback?.notes.filter((n) => n.tone === "optional") ?? [];
    const options = mixed(c.explain.options)
      .map((o, i) => `<label class="choice"><input type="radio" name="explain" value="${o.id}" data-key="${i === 0 ? "explain-first" : `exp-${o.id}`}" ${ui.choice === o.id ? "checked" : ""}/><span>${esc(o.text)}</span></label>`)
      .join("");
    body = `${pinned.map((x) => `<div class="pinned">${cardHtml(x, true)}</div>`).join("")}
      ${kept.map((n) => `<p class="context"><b>${esc(n.title)}.</b> ${esc(n.text)}</p>`).join("")}
      <fieldset><legend>${esc(c.explain.prompt)}</legend>${options}</fieldset>
      ${fb && !fb.correct ? `<div class="note warn" role="alert"><strong>The evidence does not support that</strong><p>${esc(fb.message)}</p></div>` : ""}
      <button class="commit" data-act="explain" data-key="explain">${ico("check")} Submit finding</button>`;
  }
  return `<aside class="result" aria-label="Query result"><h2>Query result</h2>${body}</aside>`;
}

function playHtml(): string {
  return headerHtml() + inventoryHtml() + mapHtml() + builderHtml() + resultHtml();
}

// ---------- debrief ----------
function debriefHtml(): string {
  const d = def();
  const score = scoreOf(d, ui.game);
  const final = d.challenges[d.challenges.length - 1];
  if (final.kind !== "conclusion") return "";
  const part = (label: string, value: number, max: number): string => `<div class="part"><span>${label}</span><b>${value}<small> / ${max}</small></b></div>`;
  const q = d.challenges.filter((c) => c.kind === "query").length;

  const chain = ui.game.evidence
    .map((id) => {
      const card = candidate(id)!;
      const cited = ui.game.conclusion.cited.includes(id);
      return `<li class="${cited ? "cited" : ""}">${cardHtml(card, true)}<span class="tag">${cited ? "Cited in your conclusion" : "Context, not cited"}</span></li>`;
    })
    .join("");

  const queries = d.challenges
    .map((c, i) => {
      const s = ui.game.steps[i];
      if (c.kind !== "query") return "";
      const extra = [`${s.runs} run${s.runs === 1 ? "" : "s"}`, s.sqlErrors ? `${s.sqlErrors} SQL error${s.sqlErrors === 1 ? "" : "s"}` : "", s.mismatches ? `${s.mismatches} off-target result${s.mismatches === 1 ? "" : "s"}` : "", s.hints ? `${s.hints} hint${s.hints === 1 ? "" : "s"}` : ""].filter(Boolean).join(" · ");
      return `<li><h4>${i + 1}. ${esc(c.title)}</h4><p class="muted">${s.solvedMode === "guided" ? "Guided blocks" : "Written SQL"} · ${extra}</p><pre><code>${esc(s.solvedSql ?? "")}</code></pre><p class="concept">${esc(c.concept)}</p></li>`;
    })
    .join("");

  const missed: string[] = [];
  d.challenges.forEach((c, i) => {
    if (c.kind !== "query") return;
    const s = ui.game.steps[i];
    s.wrongPins.forEach((id) => {
      const card = c.candidates.find((x) => x.id === id)!;
      missed.push(`<li><b>Challenge ${i + 1}, pinned “${esc(card.title)}”.</b> ${esc(card.feedback)}</li>`);
    });
    s.wrongExplains.forEach((id) => {
      const o = c.explain.options.find((x) => x.id === id)!;
      missed.push(`<li><b>Challenge ${i + 1}, said “${esc(o.text)}”</b> ${esc(o.feedback)}</li>`);
    });
  });
  ui.game.conclusion.wrong.forEach((id) => {
    const o = final.options.find((x) => x.id === id)!;
    missed.push(`<li><b>Conclusion tried: “${esc(o.text)}”</b> ${esc(o.feedback)}</li>`);
  });
  const unsupported = ui.game.conclusion.tries - ui.game.conclusion.wrong.length;
  if (unsupported > 0) missed.push(`<li><b>Conclusion submitted without enough evidence (${unsupported}×).</b> ${esc(final.evidenceFeedback.attemptsOnly)}</li>`);

  return `<section class="debrief" aria-labelledby="debrief-title">
    <header><p class="eyebrow">Debrief · Case 01 · ${esc(d.variantLabel)}</p><h1 id="debrief-title" tabindex="-1" data-key="first">Case closed: ${esc(d.title)}</h1></header>
    <div class="scorebox">
      <div class="total">${ico("star")}<div><span>Investigation score</span><b>${score.total}<small> / ${score.max}</small></b></div></div>
      ${part("Correct results", score.query, q * 100)}${part("Evidence selection", score.evidence, EVIDENCE_SLOTS.length * 50)}${part("Interpretation", score.interpretation, q * 50)}${part("Conclusion", score.conclusion, 150)}
      <div class="part hintpart"><span>Hints used</span><b>${score.hints}</b><em>Reported separately. No points deducted.</em></div>
    </div>
    <div class="cols">
      <section><h2>What the evidence supports</h2><p class="supported">${esc(final.supported)}</p>
        <h3>Evidence chain</h3><ol class="chain">${chain}</ol></section>
      <section><h2>Your queries</h2><ol class="queries">${queries}</ol></section>
      <section><h2>Missed information</h2>
        ${missed.length ? `<h3>Where the evidence did not support you</h3><ul class="missed">${missed.join("")}</ul>` : "<p class=\"muted\">No unsupported claims on the way. Every finding followed from a result.</p>"}
        <h3>What these records do not show</h3><ul class="open">${final.openQuestions.map((x) => `<li>${esc(x)}</li>`).join("")}</ul>
      </section>
    </div>
    <footer>
      <button class="ghost" data-act="retry" data-key="retry">${ico("redo")} Retry with ${esc(CASES[otherVariant(ui.variant)].variantLabel)}</button>
      <button class="ghost" data-act="review" data-key="review">${ico("book")} Review material</button>
      <button class="commit" data-act="mission" data-key="mission">Continue to mission →</button>
    </footer>
    <p class="fine">The retry uses different accounts, times and addresses, and the account with the most failures is not always the one that matters.</p>
    <p class="sme">${SME_NOTICE}</p>
  </section>`;
}

// ---------- dialogs ----------
function schemaHtml(): string {
  return `<div class="schema">${DATASETS[ui.variant].tables
    .map((t) => `<div><h4>${t.name} <small>${t.rows.length} rows · ${esc(t.description)}</small></h4><ul>${t.columns.map(([name, type, text]) => `<li><code>${name}</code> <em>${type}</em> ${esc(text)}</li>`).join("")}</ul></div>`)
    .join("")}</div>`;
}

function openDialog(title: string, body: string, wide = false): void {
  dialog.className = wide ? "wide" : "";
  dialog.innerHTML = `<div class="dlg-head"><h2 id="qh-dialog-title">${title}</h2><button class="ghost" data-act="close" aria-label="Close">${ico("x")}</button></div>${body}`;
  if (!dialog.open) dialog.showModal();
}

function openSandbox(): void {
  openDialog(
    "Practice sandbox",
    `<p class="muted">Explore freely. Nothing here is scored, and nothing here collects evidence. Read-only, ${esc(DATASETS[ui.variant].label)}.</p>
     <label class="editor"><span>SQL (SQLite). Ctrl+Enter runs it.</span><textarea id="sandbox-sql" spellcheck="false" rows="5">${esc(ui.sandboxSql)}</textarea></label>
     <div class="runrow"><p>Tables: accounts, devices, logins, file_access</p><button class="commit run" data-act="sandbox-run">${ico("play")} Run</button></div>
     <div id="sandbox-out"></div><details class="schema-inline"><summary>Schema help</summary>${schemaHtml()}</details>`,
    true,
  );
  dialog.querySelector<HTMLTextAreaElement>("#sandbox-sql")?.focus();
}

function runSandbox(): void {
  const out = dialog.querySelector<HTMLElement>("#sandbox-out");
  if (!db || !out) return;
  const outcome = runQuery(db, ui.sandboxSql);
  out.innerHTML = outcome.ok
    ? tableHtml(outcome.result, new Set(), "Sandbox result")
    : `<div class="note bad" role="alert"><strong>${outcome.kind === "blocked" ? "Not run" : "SQL error"}</strong><p>${esc(outcome.message)}</p>${outcome.detail ? `<code>${esc(outcome.detail)}</code>` : ""}</div>`;
  announce(outcome.ok ? `${outcome.result.rows.length} rows returned.` : outcome.message);
}

function openReview(): void {
  host.navigate("study");
  openDialog(
    "Review material",
    `<p class="muted">MOCK: in the course this opens the module's study material.</p><div class="review">${REVIEW_MATERIAL.map((r) => `<div><h4>${esc(r.title)}</h4><p>${esc(r.body)}</p><pre><code>${esc(r.example)}</code></pre></div>`).join("")}</div>`,
    true,
  );
}

function openMission(): void {
  host.navigate("mission");
  openDialog("Continue to mission", `<p>MOCK: in the course this hands over to the mission, where you will run the same loop on a larger case: question, query, evidence, cautious finding.</p><p class="muted">Your result has been sent to the course (or kept on this device when the practice runs on its own).</p>`);
}

// ---------- render and events ----------
function render(focusKey?: string): void {
  const active = document.activeElement as HTMLElement | null;
  const key = focusKey ?? active?.dataset?.key;
  const area = active instanceof HTMLTextAreaElement ? [active.selectionStart, active.selectionEnd] : null;
  document.documentElement.classList.toggle("reduce-motion", ui.reduced);
  root.className = `screen-${ui.screen}`;
  root.innerHTML =
    ui.screen === "loading"
      ? `<div class="loading" role="status">${ui.loadError ? `<p class="note bad">${esc(ui.loadError)}</p>` : "<p>Loading the local query engine…</p>"}</div>`
      : ui.screen === "intro"
        ? introHtml()
        : ui.screen === "play"
          ? playHtml()
          : debriefHtml();
  if (!key) return;
  const target = root.querySelector<HTMLElement>(`[data-key="${key}"]`) ?? (key === "first" ? root.querySelector<HTMLElement>(".builder [data-key]") : null);
  if (!target) return;
  target.focus({ preventScroll: focusKey === undefined });
  if (area && target instanceof HTMLTextAreaElement) target.setSelectionRange(area[0], area[1]);
}

function act(el: HTMLElement): void {
  const c = challenge();
  switch (el.dataset.act) {
    case "start": {
      ui.mode = root.querySelector<HTMLInputElement>('input[name="mode"]:checked')?.value === "sql" ? "sql" : "guided";
      startCase(ui.variant, false);
      break;
    }
    case "mode":
      if (el.dataset.mode === "sql" && !ui.sql.trim()) ui.sql = buildSql(ui.tray) ?? "";
      ui.mode = el.dataset.mode === "sql" ? "sql" : "guided";
      render();
      break;
    case "tile-toggle": {
      if (c.kind !== "query") break;
      const tile = c.tiles.find((t) => t.id === el.dataset.id);
      if (!tile) break;
      const on = ui.tray.some((t) => t.id === tile.id);
      ui.tray = on ? removeTile(ui.tray, tile.id) : addTile(ui.tray, tile);
      render();
      announce(`${tile.label} ${on ? "removed" : "added"}. ${ui.tray.length} block${ui.tray.length === 1 ? "" : "s"} in the query.`);
      break;
    }
    case "tile-del":
      ui.tray = removeTile(ui.tray, el.dataset.id ?? "");
      render(`tile-${el.dataset.id}`);
      break;
    case "clear":
      ui.tray = [];
      render("first");
      break;
    case "run":
      run();
      break;
    case "hint":
      hint();
      break;
    case "pin":
      pin();
      break;
    case "explain":
      explain();
      break;
    case "conclude":
      submitConclusion();
      break;
    case "schema":
      openDialog("Schema", `<p class="muted">${esc(DATASETS[ui.variant].label)}: synthetic records. Times are text and compare in order.</p>${schemaHtml()}`, true);
      break;
    case "sandbox":
      openSandbox();
      break;
    case "sandbox-run":
      runSandbox();
      break;
    case "review":
      openReview();
      break;
    case "mission":
      openMission();
      break;
    case "retry":
      startCase(otherVariant(ui.variant), true);
      break;
    case "motion":
      ui.reduced = !ui.reduced;
      render();
      break;
    case "close":
      dialog.close();
      break;
  }
}

function onClick(event: Event): void {
  const el = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (el && !(el as HTMLButtonElement).disabled) act(el);
}

function onChange(event: Event): void {
  const input = event.target as HTMLInputElement;
  const toggle = (set: Set<string>): void => void (input.checked ? set.add(input.value) : set.delete(input.value));
  if (input.name === "cand") {
    toggle(ui.picked);
    const c = challenge();
    if (c.kind === "query" && ui.result) {
      const marked = highlighted(ui.result, c.candidates.filter((x) => ui.picked.has(x.id)));
      root.querySelectorAll<HTMLElement>(".result tr[data-row]").forEach((tr) => tr.classList.toggle("hl", marked.has(Number(tr.dataset.row))));
    }
  } else if (input.name === "cited") toggle(ui.cited);
  else if (input.name === "explain") ui.choice = input.value;
  else if (input.name === "conclusion") ui.conclusion = input.value;
}

function onInput(event: Event): void {
  const el = event.target as HTMLTextAreaElement;
  if (el.id === "sql") ui.sql = el.value;
  if (el.id === "sandbox-sql") ui.sandboxSql = el.value;
}

function onKey(event: KeyboardEvent): void {
  if (event.key !== "Enter" || !(event.ctrlKey || event.metaKey)) return;
  const el = event.target as HTMLElement;
  if (el.id === "sql") {
    event.preventDefault();
    run();
  } else if (el.id === "sandbox-sql") {
    event.preventDefault();
    runSandbox();
  }
}

for (const scope of [root, dialog]) {
  scope.addEventListener("click", onClick);
  scope.addEventListener("input", onInput);
  scope.addEventListener("keydown", onKey);
}
root.addEventListener("change", onChange);

// Drag a block from the palette into the tray (clicking does the same).
root.addEventListener("dragstart", (event) => {
  const tile = (event.target as HTMLElement).closest<HTMLElement>("[data-act='tile-toggle']");
  if (tile && event.dataTransfer) event.dataTransfer.setData("text/plain", tile.dataset.id ?? "");
});
root.addEventListener("dragover", (event) => {
  if ((event.target as HTMLElement).closest("[data-drop]")) event.preventDefault();
});
root.addEventListener("drop", (event) => {
  const c = challenge();
  if (!(event.target as HTMLElement).closest("[data-drop]") || c.kind !== "query" || ui.game.phase !== "query") return;
  event.preventDefault();
  const tile = c.tiles.find((t) => t.id === event.dataTransfer?.getData("text/plain"));
  if (!tile) return;
  ui.tray = addTile(ui.tray, tile);
  render(`tile-${tile.id}`);
});

render();
initSqlJs({ locateFile: () => wasmUrl })
  .then((engine) => {
    SQL = engine;
    ui.screen = "intro";
    render("first");
  })
  .catch((error: unknown) => {
    ui.loadError = `The local query engine could not start (${error instanceof Error ? error.message : String(error)}). Reload the page to try again.`;
    render();
  });
