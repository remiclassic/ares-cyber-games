import "./style.css";
import initSqlJs, { type Database, type SqlJsStatic } from "sql.js";
import wasmUrl from "sql.js/dist/sql-wasm-browser.wasm?url";
import { $, announce, esc } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
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
  POINTS,
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
    <p class="intro-next">Choose how you want to write queries, then start. A short "How to play" walkthrough comes first.</p>
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
    <div class="brand"><h1>ARES: <span>QUERY HUNT</span></h1><p>CASE 01 <i>|</i> ${esc(def().title)} <i>|</i> ${esc(def().variantLabel)}</p><span id="help-slot"></span></div>
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
  return headerHtml() + '<div id="next-slot"></div>' + inventoryHtml() + mapHtml() + builderHtml() + resultHtml();
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

  return `<section class="debrief" aria-labelledby="debrief-title"><div id="next-slot"></div>
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

// ---------- walkthrough and "Next" bar ----------
let tutorialSeen = false;
const nextBar = document.createElement("div");
nextBar.id = "next-step";
nextBar.className = "next-bar";
nextBar.setAttribute("aria-live", "polite");
const pill = (label: string): string => `<span class="tut-pill">${esc(label)}</span>`;
// What the player had entered when each piece of feedback was given. Once they change it, the
// feedback is about an old attempt, so the bar stops repeating it.
const feedbackInput = new WeakMap<object, string>();
function stillCurrent(feedback: object | null, input: string): boolean {
  if (!feedback) return false;
  if (!feedbackInput.has(feedback)) feedbackInput.set(feedback, input);
  return feedbackInput.get(feedback) === input;
}

// The first-time walkthrough: the case, the screen, the moves, how a result is checked (with a
// made-up table, never this case's query), and how it is scored. Reopenable from the header.
function tutorialPages(): TutorialPage[] {
  const d = def();
  const queries = d.challenges.filter((c) => c.kind === "query").length;
  const max = scoreOf(d, createGame(d)).max;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">${esc(d.brief)}</p>
        <p class="tut-lead">You work through ${d.challenges.length} challenges: ${queries} questions you answer with a query, then a final conclusion. Each query challenge runs the same loop:</p>
        <ol class="tut-moves">
          <li><span><b>Read the question</b> and what the result must include.</span></li>
          <li><span><b>Build a query and run it.</b><span class="how">It runs in your browser against a small synthetic dataset.</span></span></li>
          <li><span><b>Pin the evidence</b> the result actually shows.</span></li>
          <li><span><b>Explain the finding</b> in one cautious sentence.</span></li>
        </ol>
        <p class="tut-note">${ico("pin")}<span>Running a query never collects evidence by itself. Evidence is only what you pin, and the final conclusion can only rest on what you pinned.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">${ico("target")}</span><span><b>Header</b>The current challenge and step, Evidence (out of ${EVIDENCE_SLOTS.length}), Investigation score and Hints used.</span></div>
          <div><span class="tut-ico box">${ico("folder")}</span><span><b>Evidence inventory</b>Left. A slot fills each time you pin evidence. Below it: Practice sandbox, Schema and Review material.</span></div>
          <div><span class="tut-ico box">${ico("source")}</span><span><b>Incident map</b>Each challenge lights a node when you finish it. Locked nodes are not revealed yet.</span></div>
          <div><span class="tut-ico box">${ico("filter")}</span><span><b>Query builder</b>Middle. The question, <em>Result must include</em>, <em>Order</em>, and your query.</span></div>
          <div><span class="tut-ico box">${ico("table")}</span><span><b>Query result</b>Right. Rows from your query, any error, and then the pin and explain steps.</span></div>
          <div><span class="tut-ico box">${ico("flask")}</span><span><b>Practice sandbox</b>Run any read-only query to look around. Never scored, never collects evidence.</span></div>
        </div>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Build the query</b><span class="how">In ${pill("Guided blocks")}, click blocks under ${pill("Data")}, ${pill("Combine")}, ${pill("Filter")}, ${pill("Summarize")} and ${pill("Sort")} (or drag them into the tray). A Data block is always needed. The SQL they produce shows underneath; ${pill("Clear all")} starts over. In ${pill("Write SQL")}, type the query yourself; ${pill("Schema help")} lists the tables. You can switch at any time.</span></span></li>
          <li><span><b>Run it</b><span class="how">Press ${pill("Run query")}, or <kbd>Ctrl</kbd>+<kbd>Enter</kbd> in the SQL box. Run as often as you like.</span></span></li>
          <li><span><b>Pin the evidence</b><span class="how">Tick every card under <em>Which of these does your result show?</em> that the rows support (ticked cards highlight their rows), then press ${pill("Pin evidence")}.</span></span></li>
          <li><span><b>Explain the finding</b><span class="how">Choose the sentence the pinned evidence supports, then press ${pill("Submit finding")}.</span></span></li>
          <li><span><b>Conclude</b><span class="how">In the last challenge, choose the conclusion you can defend, tick the pinned evidence behind it, and press ${pill("Submit conclusion")}.</span></span></li>
        </ol>
        <p class="tut-note">${ico("bulb")}<span>Stuck? ${pill("Hint")} shows the next hint for this challenge. Hints cost no points; they are counted and reported.</span></p>`,
    },
    {
      title: "How a result is checked",
      body: `
        <p>Your result is compared with the answer. Only the columns in <em>Result must include</em> are checked, so extra columns are fine. Rows must match, and so must the <em>Order</em> when it says Required. A made-up example, not one of the challenges:</p>
        <div class="tut-ex">
          <div class="row"><span class="then">Question:</span><span>list print jobs over 100 pages. Must include <b>job_id, pages</b>. Order: pages descending.</span></div>
          <div class="row"><span class="tag hot">Not run</span><span class="arrow">→</span><span>A <strong>SQL error</strong> such as a typo: about how it is written, not the investigation.</span></div>
          <div class="row"><span class="tag hot">Valid, but off</span><span class="arrow">→</span><span>Right rows in the wrong order, or a missing condition. The message says which.</span></div>
          <div class="row"><span class="tag ok">Answers it</span><span class="arrow">→</span><span>The pin step opens. Nothing is collected yet.</span></div>
        </div>
        <ol class="tut-moves">
          <li><span><b>Pin observations, not guesses.</b><span class="how">"Job 88 printed 420 pages at 03:10" is in the rows. "Someone stole the plans" is not: no row shows intent.</span></span></li>
          <li><span><b>Pin all of it, and only it.</b><span class="how">Pinning fails if a card the rows do not support is ticked, or if a supported card is missing. Some cards are optional context.</span></span></li>
        </ol>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Correct results <small>${POINTS.query} each</small></b>For a query whose result answers the question. Wrong runs cost nothing.</div>
          <div><b>Evidence selection <small>${POINTS.evidence[0]} per card</small></b>${POINTS.evidence[1]} if the first pin attempt for that challenge was rejected.</div>
          <div><b>Interpretation <small>${POINTS.interpretation[0]}</small></b>Per finding: ${POINTS.interpretation.join(", ")} on the first, second, later try.</div>
          <div><b>Conclusion <small>${POINTS.conclusion[0]}</small></b>${POINTS.conclusion.join(", ")} by try. It needs the right conclusion <strong>and</strong> the evidence that supports it.</div>
        </div>
        <p>Investigation score out of ${max}. Hints used are reported separately, with no points deducted. The debrief shows your queries, your evidence chain, and anything you claimed that the evidence did not support.</p>
        <p class="tut-muted">There is no clock. Take the time to read each result.</p>`,
    },
  ];
}

const helpButton = addHelpButton(() => {
  if (ui.screen !== "play") return;
  showTutorial({ kicker: "Query Hunt · How to play", pages: tutorialPages(), startLabel: "Back to the game", midGame: true, onStart: () => {} });
}, "#help-slot");
helpButton.classList.remove("floating");

// One plain instruction for the current step, with a ring on what to click. It reads out what
// is on screen and describes the method; it never writes the query or names the right card.
function renderNext(): void {
  const c = challenge();
  const step = ui.game.steps[ui.game.step];
  const total = def().challenges.length;
  let next: NextStep;
  if (ui.screen === "debrief") {
    const score = scoreOf(def(), ui.game);
    next = {
      label: "Done",
      tone: "ready",
      text: `<strong>Case closed: ${score.total} / ${score.max}.</strong> Read <strong>Missed information</strong> and <strong>What these records do not show</strong>, then press <strong>Retry with ${esc(CASES[otherVariant(ui.variant)].variantLabel)}</strong> or <strong>Continue to mission →</strong>.`,
      targets: ['[data-act="retry"]'],
    };
  } else if (c.kind === "conclusion") {
    const fb = ui.concludeFeedback;
    if (fb && !fb.correct && stillCurrent(fb, `${ui.conclusion}|${[...ui.cited].sort().join()}`)) {
      next = { label: "Check", tone: "warn", text: "<strong>Not supported yet.</strong> Read the note above the button, change your conclusion or the evidence you ticked, then press <strong>Submit conclusion</strong> again.", targets: ['[data-act="conclude"]'] };
    } else if (!ui.conclusion) {
      next = {
        text: `Final challenge. Under <strong>1. Which conclusion can you defend?</strong>, choose the one your pinned evidence supports.`,
        hint: "Supported means every part of it is shown by a pinned card. A suspicious observation is not yet a confirmed conclusion.",
        targets: [".result fieldset"],
      };
    } else if (!ui.cited.size) {
      next = { text: "Under <strong>2. Which evidence supports it?</strong>, tick each pinned card your conclusion relies on.", targets: [".result fieldset + fieldset"] };
    } else {
      next = { label: "Ready", tone: "ready", text: `Press <strong>Submit conclusion</strong>. You cited ${ui.cited.size} of ${ui.game.evidence.length} pinned cards.`, targets: ['[data-act="conclude"]'] };
    }
  } else if (ui.game.phase === "query") {
    const sql = ui.mode === "guided" ? buildSql(ui.tray) : ui.sql.trim() || null;
    const f = stillCurrent(ui.feedback, `${ui.mode}|${sql}`) ? ui.feedback : null;
    const required = /^required/i.test(c.ordering);
    const sorted = ui.mode === "guided" ? ui.tray.some((t) => t.kind === "sort") : /\border\s+by\b/i.test(ui.sql);
    const where = `Challenge ${ui.game.step + 1} of ${total}`;
    if (f?.kind === "sql-error") {
      next = { label: "Check", tone: "warn", text: `<strong>${f.blocked ? "Not run." : "SQL error: the statement did not run."}</strong> Read the message under Query result, fix the query, then press <strong>Run query</strong>.`, hint: "This is about how the query is written, not about the investigation.", targets: ['[data-act="run"]'] };
    } else if (f?.kind === "mismatch") {
      next = {
        label: "Check",
        tone: "warn",
        text: `<strong>The query ran, but the result does not answer the question yet.</strong> Compare it with <strong>Result must include</strong> and <strong>Order</strong>, change it, then press <strong>Run query</strong>.`,
        hint: `${esc(f.message)}${step.hints < c.hints.length ? " A Hint is free if you are stuck." : ""}`,
        targets: [ui.mode === "guided" ? ".palette" : "#sql"],
      };
    } else if (!sql) {
      next =
        ui.mode === "guided"
          ? { text: `${where}: read the question, then <strong>click a block under Data</strong> to choose where the rows come from.`, hint: "Then add the blocks the question needs and watch the SQL they produce. Write SQL lets you type it instead.", targets: [".palette .pal-group"] }
          : { text: `${where}: read the question, then <strong>type a SELECT query</strong> in the SQL box that returns what <strong>Result must include</strong> asks for.`, hint: "Schema help, under the box, lists the tables and columns.", targets: ["#sql"] };
    } else if (ui.mode === "guided" && ui.tray.length === 1) {
      next = {
        text: `Now add whichever other blocks the question needs, and check the SQL they produce. Then press <strong>Run query</strong>.`,
        hint: `Compare with <strong>Result must include</strong> and <strong>Order</strong>. Not every group is needed every time. You can run at any time to see the rows.`,
        targets: [".palette"],
      };
    } else if (required && !sorted && (ui.mode === "guided" || /\bfrom\b/i.test(ui.sql))) {
      next = {
        label: "Check",
        tone: "warn",
        text: `The <strong>Order</strong> line says the order is required, and your query has no ${ui.mode === "guided" ? "Sort block" : "ORDER BY"} yet.`,
        hint: "You can still run it to see the rows.",
        targets: [ui.mode === "guided" ? ".palette" : "#sql", '[data-act="run"]'],
      };
    } else {
      next = {
        text: `Check your query against the question and <strong>Result must include</strong>, then press <strong>Run query</strong>${ui.mode === "sql" ? " (or <kbd>Ctrl</kbd>+<kbd>Enter</kbd>)" : ""}.`,
        hint: ui.flash ? "Finding recorded. A new node is lit on the incident map." : "",
        targets: ['[data-act="run"]'],
      };
    }
  } else if (ui.game.phase === "pin") {
    const fb = ui.pinFeedback;
    if (fb && !fb.accepted && stillCurrent(fb, [...ui.picked].sort().join())) {
      next = { label: "Check", tone: "warn", text: `<strong>${esc(fb.message)}</strong> Change the ticks, then press <strong>Pin evidence</strong> again.`, hint: "Each card must be shown by rows in the result. Ticked cards highlight their rows.", targets: [".cands", '[data-act="pin"]'] };
    } else if (!ui.picked.size) {
      next = {
        text: "<strong>The result answers the question.</strong> Under <strong>Which of these does your result show?</strong>, tick every card the rows support.",
        hint: "Ticked cards highlight their rows in the table. Leave out claims the rows do not show.",
        targets: [".cands"],
      };
    } else {
      next = { label: "Ready", tone: "ready", text: `Press <strong>Pin evidence</strong> when every card you ticked (${ui.picked.size}) is backed by rows in the result.`, targets: ['[data-act="pin"]'] };
    }
  } else {
    const fb = ui.explainFeedback;
    if (fb && !fb.correct && stillCurrent(fb, ui.choice)) {
      next = { label: "Check", tone: "warn", text: "<strong>The evidence does not support that.</strong> Read why, choose another sentence, then press <strong>Submit finding</strong>.", targets: [".result fieldset"] };
    } else if (!ui.choice) {
      next = { text: `Evidence pinned. Now <strong>explain the finding</strong>: choose the sentence the pinned evidence supports.`, hint: "Pick the one that claims no more than the evidence shows.", targets: [".result fieldset"] };
    } else {
      next = { label: "Ready", tone: "ready", text: "Press <strong>Submit finding</strong>.", targets: ['[data-act="explain"]'] };
    }
  }
  renderNextStep(nextBar, next);
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
  // The persistent "Next" bar and "How to play" button move into the freshly rendered screen.
  root.querySelector("#next-slot")?.replaceWith(nextBar);
  const helpSlot = root.querySelector("#help-slot");
  if (helpSlot) helpSlot.replaceWith(helpButton);
  else helpButton.remove();
  if (ui.screen === "play" || ui.screen === "debrief") renderNext();
  else nextBar.remove();
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
      if (!tutorialSeen) {
        tutorialSeen = true;
        showTutorial({ kicker: "Query Hunt · How to play", pages: tutorialPages(), startLabel: "Start challenge 1", onStart: () => {
            window.scrollTo(0, 0);
            root.querySelector<HTMLElement>(".builder [data-key]")?.focus({ preventScroll: true });
          },
        });
      }
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
  if (ui.screen === "play") renderNext();
}

function onInput(event: Event): void {
  const el = event.target as HTMLTextAreaElement;
  if (el.id === "sql") {
    ui.sql = el.value;
    renderNext();
  }
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
