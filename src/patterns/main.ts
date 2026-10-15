import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
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
  $("#bench-head").innerHTML = `<h2>${esc(level.title)}</h2><span>A detection rule should catch the attack and nothing else</span>`;
  $("#bench-main").innerHTML = `
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
  renderNext();
}

// The live "Next" bar: what to do with the pattern now, read from what the log lines already
// show. Kept free of live counts so it does not chatter while you type, and it never suggests
// a pattern.
function renderNext(): void {
  const level = LEVELS[index];
  const record = records[index];
  const result = evaluate(level, record.pattern);
  const stuck = record.hints ? "The hint is under the log lines; pressing Hint again costs another 3 and shows the same clue." : "Stuck? <strong>Hint (−3)</strong> gives a clue; <strong>Show a pattern</strong> gives a working answer for 0 points.";
  let step: NextStep;
  if (record.solved) {
    const last = index + 1 >= LEVELS.length;
    step = {
      label: "Done",
      tone: "ready",
      text: `${record.shown ? "Reference pattern shown (0 points)." : `Solved: <strong>+${record.points}</strong>.`} Read the lesson, then press <strong>${last ? "See results" : "Next detection"}</strong>.`,
      hint: unsolvedOther() ? "You can also click any unsolved detection in the list on the left." : "",
      targets: ['[data-act="next"]'],
    };
  } else if (!record.pattern.trim()) {
    step = {
      text: "Read the goal, then type a pattern in the box. Start with text that only the <strong>attack</strong> lines contain.",
      hint: "Lines mark themselves as you type. The cheat sheet on the left lists the building blocks.",
      targets: [".rx"],
    };
  } else if (result.error !== null) {
    step = {
      label: "Check",
      tone: "warn",
      text: "The pattern is not usable yet: the message under the box says why. Fix that and the log lines light up again.",
      hint: "Common causes: an unclosed ( or [, a lone \\ at the end, or a pattern that can match empty text.",
      targets: [".rx"],
    };
  } else if (result.falseAlarms > 0) {
    step = {
      label: "Check",
      tone: "warn",
      text: `<strong>⚠ False alarms:</strong> your pattern also flags benign lines. Make it more specific: what do the attack lines have that those lines do not?${result.missed ? " Some attack lines are still <strong>✕ missed</strong> too." : ""}`,
      hint: `Highlighted text shows exactly what matched. ${stuck}`,
      targets: [".rx"],
    };
  } else {
    step = {
      text: `No false alarms so far, but some attack lines are still <strong>✕ missed</strong>. Widen the pattern to catch them too, without touching the benign lines.`,
      hint: `Compare a caught line with a missed one: what do they share? ${stuck}`,
      targets: [".rx"],
    };
  }
  renderNextStep($("#next-step"), step);
}

function unsolvedOther(): boolean {
  return records.some((r, i) => i !== index && !r.solved);
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

// The first-time walkthrough: the job, what is on screen, the moves, a made-up worked example,
// and how it is scored. Reopenable from the header at any time.
function tutorialPages(): TutorialPage[] {
  const max = LEVELS.length * 10;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You are writing <strong>detection rules</strong>. Each of the ${LEVELS.length} levels is a short log excerpt: some lines are a real attack, the others are <strong>benign look-alikes</strong> from normal work.</p>
        <p class="tut-lead">Write one regular expression (a text pattern) that flags <strong>every attack line and nothing else</strong>.</p>
        <p class="tut-note"><span>A rule that misses an attack lets it through. A rule that also flags normal activity buries the analysts in false alarms. You need both right at once.</span></p>
        <p class="tut-muted">New to regular expressions? The cheat sheet on the left has every building block you need, and the first level needs nothing but plain words.</p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">/ /</span><span><b>The pattern box</b>Type your pattern between the slashes. The line under it counts what you caught, missed and falsely flagged.</span></div>
          <div><span class="tut-ico box" style="font-size:.7rem">ATTACK</span><span><b>Log lines</b>Each line is tagged <em>attack</em> or <em>benign</em>. Text your pattern matches is highlighted.</span></div>
          <div><span class="tut-ico box" style="color:#7df0b0">✓</span><span><b>Verdicts</b><span style="color:#7df0b0">✓ caught</span> · <span style="color:#ff9aa4">✕ missed</span> · <span style="color:#ffd98a">⚠ false alarm</span> · ignored. Some false alarms show a note on why that line is normal.</span></div>
          <div><span class="tut-ico box">1</span><span><b>Detections list</b>Left panel: the ${LEVELS.length} levels. Green number: solved. Below it, the cheat sheet.</span></div>
        </div>
        <p class="tut-muted">Top right: the level you are on and your points. The <strong>Next</strong> bar above the workbench always says what to do now.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Read the goal</b><span class="how">The bold line at the top of the workbench says which lines count as the attack.</span></span></li>
          <li><span><b>Type a pattern</b><span class="how">Click the box and type. The log lines update on every key press. When every attack line is caught with no false alarms, the level is solved on its own: no submit button.</span></span></li>
          <li><span><b>If you are stuck</b><span class="how"><span class="tut-pill">Hint (−3)</span> shows a clue under the log lines and costs 3 points each time you press it. <span class="tut-pill">Show a pattern</span> fills in a working pattern and scores 0 for that level.</span></span></li>
          <li><span><b>Move on</b><span class="how">Read the lesson, then press <span class="tut-pill">Next detection</span> (after the last level, <span class="tut-pill">See results</span>). You can also click any level in the left list to jump to it.</span></span></li>
        </ol>
        <p class="tut-muted">Add <kbd>(?i)</kbd> at the very start of a pattern to ignore upper and lower case.</p>`,
    },
    {
      title: "Worked example",
      body: `
        <p>A made-up level, not one of the ${LEVELS.length}. Goal: flag downloads of <b>.zip</b> files.</p>
        <div class="tut-ex">
          <div class="row"><span class="tag hot">attack</span><code>GET /exports/clients.zip 200</code></div>
          <div class="row"><span class="tag hot">attack</span><code>GET /tmp/a.zip 200</code></div>
          <div class="row"><span class="tag">benign</span><code>GET /zipcodes.csv 200</code></div>
          <div class="row"><span class="tag">benign</span><code>GET /docs/unzip-help.html 200</code></div>
        </div>
        <ol class="tut-moves">
          <li><span><b>Try <code>zip</code></b>: both attacks caught, but 2 false alarms.<span class="how">"zipcodes" and "unzip" contain the letters too. Too broad.</span></span></li>
          <li><span><b>Ask what only the attacks have</b>: a dot right before "zip".<span class="how">In a pattern a plain dot means "any character", so write a real dot as <code>\\.</code></span></span></li>
          <li><span><b>Try <code>\\.zip</code></b>: 2 caught, 0 false alarms. Solved.<span class="how">Start broad, look at what is falsely flagged, then narrow.</span></span></li>
        </ol>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Solve <small>10</small></b>Points for each detection you write yourself.</div>
          <div><b>Hint <small>−3</small></b>Each press of Hint on that level. A solve still scores at least 4.</div>
          <div><b>Shown <small>0</small></b>Using Show a pattern scores nothing for that level.</div>
        </div>
        <p>The best possible score is ${max}. There is no timer and no penalty for trying patterns: experiment freely.</p>
        <p class="tut-muted">At the end you see every pattern you wrote, side by side.</p>
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
          <label class="tut-check"><input type="checkbox" id="opt-large" ${settings.largeText ? "checked" : ""} /> Larger text</label>
        </div>`,
    },
  ];
}

function bindSettings(root: HTMLElement): void {
  root.querySelector<HTMLInputElement>("#opt-sound")!.addEventListener("change", (event) => {
    settings.sound = (event.target as HTMLInputElement).checked;
    saveSettings(settings);
    setSoundEnabled(settings.sound);
  });
  root.querySelector<HTMLInputElement>("#opt-large")!.addEventListener("change", (event) => {
    settings.largeText = (event.target as HTMLInputElement).checked;
    saveSettings(settings);
  });
}

const KICKER = "Pattern Patrol · How to play";

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: KICKER, pages: tutorialPages(), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

render();
showTutorial({
  kicker: KICKER,
  pages: tutorialPages(),
  startLabel: "Start patrolling",
  onStart: () => ($("#rx") as HTMLInputElement).focus(),
  onLastPage: bindSettings,
});
