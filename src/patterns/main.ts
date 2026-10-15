import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings, showModal } from "../ui/dom";
import { compile, evaluate, levels, points, type LevelRecord } from "./engine";

const ACTIVITY_ID = "ares-pattern-patrol/v0.1";
const post = (type: string, payload: unknown) => {
  if (window.parent !== window) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};
const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);
$("#logo").innerHTML = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const LEVELS = levels();
let index = 0;
let records: LevelRecord[] = LEVELS.map((level) => ({ level: level.id, solved: false, hints: 0, checks: 0, shown: false, pattern: "", points: 0 }));
let hintShown = false;

function highlight(text: string, pattern: string): string {
  const regex = compile(pattern);
  if (typeof regex === "string") return esc(text);
  const global = new RegExp(regex.source, regex.flags.includes("g") ? regex.flags : `${regex.flags}g`);
  let out = "";
  let last = 0;
  for (const match of text.matchAll(global)) {
    if (match[0] === "") break;
    out += esc(text.slice(last, match.index)) + `<mark>${esc(match[0])}</mark>`;
    last = match.index! + match[0].length;
  }
  return out + esc(text.slice(last));
}

function total(): number {
  return records.reduce((sum, record) => sum + record.points, 0);
}

function render(): void {
  const level = LEVELS[index];
  const record = records[index];
  const result = evaluate(level, record.pattern);
  $("#status").innerHTML = `
    <div class="count"><strong>${index + 1}/${LEVELS.length}</strong><span>Level</span></div>
    <div class="count"><strong>${total()}</strong><span>Points</span></div>`;
  $("#levels").innerHTML = `
    <div class="col-head"><h2>Detections</h2><span class="phase-pill">${records.filter((r) => r.solved).length} solved</span></div>
    <div class="d-scroll">
      <ol class="lvl-list">${LEVELS.map((entry, i) => {
        const r = records[i];
        return `<li><button class="lvl ${i === index ? "on" : ""} ${r.solved ? (r.shown ? "shown" : "done") : ""}" data-go="${i}"><b>${i + 1}</b><span>${esc(entry.title)}</span><em>${r.solved ? (r.shown ? "shown" : `+${r.points}`) : ""}</em></button></li>`;
      }).join("")}</ol>
      <div class="cheat">
        <h3>Cheat sheet</h3>
        <dl>
          <div><dt>.</dt><dd>any character</dd></div>
          <div><dt>\\.</dt><dd>a real dot</dd></div>
          <div><dt>\\d</dt><dd>a digit</dd></div>
          <div><dt>[0-5]</dt><dd>one of a range</dd></div>
          <div><dt>a|b</dt><dd>a or b</dd></div>
          <div><dt>x{3} x{3,}</dt><dd>exactly / at least 3</dd></div>
          <div><dt>.*</dt><dd>anything, any length</dd></div>
          <div><dt>\\b</dt><dd>word boundary</dd></div>
          <div><dt>^ $</dt><dd>start / end of line</dd></div>
          <div><dt>(?i)</dt><dd>ignore case (prefix)</dd></div>
        </dl>
      </div>
    </div>`;
  const good = result.error === null ? result : null;
  const ok = !!good?.solved;
  $("#bench").innerHTML = `
    <div class="col-head"><h2>${esc(level.title)}</h2><span>A detection rule should catch the attack and nothing else</span></div>
    <div class="d-scroll bench">
      <p class="goal">${esc(level.goal)}</p>
      <label class="rx" for="rx"><span>/</span><input id="rx" spellcheck="false" autocomplete="off" value="${esc(record.pattern)}" placeholder="type a regular expression" ${record.solved ? "readonly" : ""} aria-describedby="rx-state" /><span>/</span></label>
      <p id="rx-state" class="rx-state ${!good ? "err" : ok ? "good" : ""}">${
        !good
          ? esc((result as { error: string }).error)
          : ok
            ? "All attack lines caught, no false alarms."
            : `Caught ${good.caught} of ${good.caught + good.missed} · ${good.falseAlarms} false alarm${good.falseAlarms === 1 ? "" : "s"}`
      }</p>
      <ul class="logs">${level.lines
        .map((line, i) => {
          const verdict = good ? good.verdicts[i] : null;
          const state = !verdict ? "" : verdict.bad ? (verdict.matched ? "caught" : "missed") : verdict.matched ? "false" : "quiet";
          const label = { caught: "✓ caught", missed: "✕ missed", false: "⚠ false alarm", quiet: "· ignored", "": "" }[state];
          return `<li class="${state}"><span class="tag ${line.bad ? "bad" : "ok"}">${line.bad ? "attack" : "benign"}</span><code>${good ? highlight(line.text, record.pattern) : esc(line.text)}</code><em>${label}</em>${line.note && state === "false" ? `<small>${esc(line.note)}</small>` : ""}</li>`;
        })
        .join("")}</ul>
      ${hintShown || record.hints ? `<p class="hint-box"><b>Hint.</b> ${esc(level.hint)}</p>` : ""}
      ${record.solved ? `<div class="lesson"><b>${record.shown ? "Reference pattern:" : "Solved."}</b> ${record.shown ? `<code>${esc(level.example)}</code> ` : ""}${esc(level.lesson)}</div>` : ""}
      <div class="row">
        ${record.solved ? `<button class="btn primary" data-act="next">${index + 1 < LEVELS.length ? "Next detection" : "See results"}</button>` : `<button class="btn" data-act="hint">Hint (−3)</button><button class="btn ghost" data-act="show">Show a pattern</button>`}
      </div>
    </div>`;
  const input = $("#rx") as HTMLInputElement;
  input.addEventListener("input", () => onType(input));
}

function onType(input: HTMLInputElement): void {
  const record = records[index];
  record.pattern = input.value;
  const result = evaluate(LEVELS[index], input.value);
  if (result.error === null && result.solved && !record.solved) {
    record.solved = true;
    record.points = points(record);
    play("success");
    announce(`Solved. ${record.points} points.`);
    post("statement", { at: new Date().toISOString(), verb: "solved", object: LEVELS[index].id, result: { pattern: record.pattern, points: record.points } });
  }
  const caret = input.selectionStart;
  render();
  const again = $("#rx") as HTMLInputElement;
  again.focus();
  if (caret !== null) again.setSelectionRange(caret, caret);
}

document.addEventListener("click", (event) => {
  const target = (event.target as HTMLElement).closest<HTMLElement>("[data-act],[data-go]");
  if (!target) return;
  const record = records[index];
  if (target.dataset.go) {
    index = Number(target.dataset.go);
    hintShown = false;
  } else if (target.dataset.act === "hint") {
    record.hints += 1;
    hintShown = true;
    play("click");
  } else if (target.dataset.act === "show") {
    record.pattern = LEVELS[index].example;
    record.shown = true;
    record.solved = true;
    record.points = 0;
  } else if (target.dataset.act === "next") {
    if (index + 1 >= LEVELS.length) return results();
    index += 1;
    hintShown = false;
  } else if (target.dataset.act === "retry") {
    records = LEVELS.map((level) => ({ level: level.id, solved: false, hints: 0, checks: 0, shown: false, pattern: "", points: 0 }));
    index = 0;
    $("#game").hidden = false;
    $("#debrief").hidden = true;
  }
  render();
  if (!records[index].solved) ($("#rx") as HTMLInputElement).focus();
});

function results(): void {
  const max = LEVELS.length * 10;
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), score: total(), max, levels: records });
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head"><p class="kicker">Debrief · Pattern Patrol</p><h2 id="debrief-title" tabindex="-1">Detection score ${total()}<small>/${max}</small></h2>
      <p class="muted">${records.filter((r) => r.solved && !r.shown).length} of ${LEVELS.length} detections written yourself.</p></header>
      <section class="panel"><h3>Your detection rules</h3>
        <table class="plan-table"><thead><tr><th scope="col">Detection</th><th scope="col">Your pattern</th><th scope="col">Points</th></tr></thead><tbody>
        ${records.map((r, i) => `<tr><th scope="row">${esc(LEVELS[i].title)}</th><td><code>${esc(r.pattern || "–")}</code>${r.shown ? " <small>(shown)</small>" : ""}</td><td>${r.points}</td></tr>`).join("")}
        </tbody></table></section>
      <section class="panel"><h3>What this practised</h3><ul class="objectives">
        <li>Writing a pattern that catches an attack and nothing else: precision and recall, the core of detection engineering.</li>
        <li>Escaping, character classes, alternation, quantifiers, word boundaries and anchors.</li>
        <li>Why a broad match is not a good detection: every false alarm costs an analyst's time.</li></ul></section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">A remix of RegExile by the Project Ares games team · new content and twist · pending SME review</p>
    </div>`;
  $("#debrief-title").focus();
}

render();
showModal({
  kicker: "Remix · Detection engineering",
  title: "Pattern Patrol",
  body: `<p>Each level is a log excerpt with real attack lines and their <strong>benign look-alikes</strong>. Write a regular expression that flags every attack line and <strong>nothing else</strong>.</p>
    <p>Lines light up as you type: <b class="g">✓ caught</b>, <b class="r">✕ missed</b> or <b class="a">⚠ false alarm</b>. A cheat sheet is on the left.</p>
    <p class="note"><span>10 points per detection; a hint costs 3. Showing a reference pattern scores 0 but teaches the trick.</span></p>`,
  actions: [{ label: "Start patrolling", primary: true, onClick: () => ($("#rx") as HTMLInputElement).focus() }],
});
