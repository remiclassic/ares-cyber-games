import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { SCENARIO } from "./data";
import {
  DECISIONS,
  POINTS,
  THRESHOLDS,
  WEIGHTS,
  bestDecision,
  canDecide,
  createGame,
  decide,
  finish,
  inspect,
  isAvailable,
  isInspected,
  itemById,
  learning,
  meters,
  pickFact,
  score,
  type Decision,
  type GameState,
  type Item,
  type Outcome,
} from "./engine";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-shadow-it/the-floor-walk/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const DECISION_NAME: Record<Decision, string> = Object.fromEntries(DECISIONS.map((entry) => [entry.id, entry.name])) as Record<Decision, string>;
const GRADE_LABEL = { best: "Best call", ok: "Partly right", poor: "Poor call" } as const;

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(SCENARIO);
let selected: string | null = null;
let lastDelta: { risk: number; morale: number } | null = null;
const started = performance.now();
$("#logo").innerHTML = LOGO;

const items = SCENARIO.items;

function signed(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

function meterHtml(): string {
  const { risk, morale } = meters(state);
  const bar = (id: string, label: string, value: number, limit: number, bad: boolean, note: string, delta?: number) => `
    <div class="meter ${id} ${bad ? "bad" : ""}" role="meter" aria-label="${label}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${value}">
      <div class="meter-top"><span>${label}</span><strong>${value}</strong>${delta ? `<em class="delta ${(id === "risk" ? delta < 0 : delta > 0) ? "up" : "down"}">${signed(delta)}</em>` : ""}</div>
      <div class="meter-track"><i style="width:${value}%"></i><b style="left:${limit}%" title="${note}"></b></div>
      <small>${note}</small>
    </div>`;
  return (
    bar("risk", "Risk", risk, THRESHOLDS.maxRisk, risk > THRESHOLDS.maxRisk, `Keep at or below ${THRESHOLDS.maxRisk}`, lastDelta?.risk) +
    bar("morale", "Team productivity", morale, THRESHOLDS.minMorale, morale < THRESHOLDS.minMorale, `Keep at or above ${THRESHOLDS.minMorale}`, lastDelta?.morale)
  );
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const decided = Object.keys(state.decisions).length;
  $("#status").innerHTML = `
    <div class="count"><strong>${state.inspected.length}/${items.length}</strong><span>Inspected</span></div>
    <div class="count"><strong>${decided}/${items.length}</strong><span>Decided</span></div>`;
  const register = state.inspected.map((id) => itemById(SCENARIO, id));
  $("#register").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Asset register</h2><span class="phase-pill">${state.phase === "guided" ? "Guided" : "Floor walk"}</span></div>
    <div class="d-scroll">
      ${meterHtml()}
      <h4 class="sub-head">Found on the floor</h4>
      ${
        register.length
          ? `<ol class="assets">${register
              .map((entry) => {
                const decision = state.decisions[entry.id];
                return `<li><button class="link-row" data-act="select" data-id="${entry.id}"><span><b>${esc(entry.name)}</b><small>${esc(entry.team)}</small></span>${decision ? `<em class="dec-${decision}">${DECISION_NAME[decision]}</em>` : `<em class="todo">decide</em>`}</button></li>`;
              })
              .join("")}</ol>`
          : `<p class="muted small">Nothing yet. Inspect something on the floor to add it here.</p>`
      }
      <p class="muted small">Anything you do not decide is left as it is when you finish.</p>
      <button class="btn primary" data-act="finish" ${state.phase === "guided" ? "disabled" : ""}>Finish the floor walk</button>
    </div>`;
  $("#floor-head").innerHTML = `<h2>${esc(SCENARIO.title)}</h2><span class="muted">${state.phase === "guided" ? "Guided first finding" : "Click anything to inspect it"}</span>`;
  const drawn = items
    .map((entry) => {
      const available = isAvailable(state, entry.id);
      const decision = state.decisions[entry.id];
      const seen = isInspected(state, entry.id);
      const cls = [
        "item",
        available ? "" : "locked",
        selected === entry.id ? "sel" : "",
        state.phase === "guided" && entry.id === SCENARIO.guided ? "guide" : "",
        decision ? `done dec-${decision}` : seen ? "seen" : "",
      ].join(" ");
      const badge = decision ? DECISIONS.find((d) => d.id === decision)!.key : seen ? "?" : "";
      const name = seen ? `${entry.label}: ${entry.name}` : entry.label;
      return `<g class="${cls}" data-id="${entry.id}" role="button" tabindex="${available ? 0 : -1}" aria-disabled="${!available}" aria-label="${esc(name)}${decision ? `, decided: ${DECISION_NAME[decision]}` : seen ? ", inspected" : ""}">
        ${entry.svg}
        <rect class="hit" x="${entry.x - 4}" y="${entry.y - 4}" width="${entry.w + 8}" height="${entry.h + 8}" rx="10"/>
        ${badge ? `<g class="badge"><circle cx="${entry.x + entry.w}" cy="${entry.y}" r="13"/><text x="${entry.x + entry.w}" y="${entry.y + 5}" text-anchor="middle">${badge}</text></g>` : ""}
      </g>`;
    })
    .join("");
  $("#floor-view").innerHTML = `<svg viewBox="0 0 1000 600" class="scene" role="group" aria-label="Office floor plan">${SCENARIO.backdrop}${drawn}</svg>`;
  renderInspector();
  renderNext();
}

// Coach lines for the guided first finding: what to look at, never which button to press.
function coach(entry: Item): string {
  if (state.phase !== "guided") return "";
  let text: string;
  if (!state.facts[entry.id]) text = `Read the four facts. Shadow IT decisions turn on <strong>who owns it</strong>, <strong>what data is in it</strong> and <strong>whether a sanctioned tool already does the job</strong>. Click the fact that matters most.`;
  else if (!state.decisions[entry.id]) text = `Now weigh it. Blocking stops the exposure but leaves Sales stuck. Approving keeps them working but the account is not the company's. Is there a third way in the facts?`;
  else text = `That is the loop. Watch both meters on the left: every call moves risk <em>and</em> productivity. The rest of the floor is open now.`;
  return `<div class="coach"><strong>Guided finding.</strong> ${text}</div>`;
}

function renderInspector(): void {
  const box = $("#inspector");
  if (!selected) {
    box.innerHTML = `<div class="col-head"><h2>Inspect</h2></div><div class="d-scroll">
      <p class="kicker">${esc(SCENARIO.org)}</p>
      <p class="brief">${esc(SCENARIO.brief)}</p>
      <p class="muted small">Select something on the floor to inspect it. Keyboard: Tab through the floor, Enter to inspect.</p></div>`;
    return;
  }
  const entry = itemById(SCENARIO, selected);
  const decision = state.decisions[entry.id];
  const fact = state.facts[entry.id];
  const outcome: Outcome | null = decision ? entry.outcomes[decision] : null;
  const ready = canDecide(state, entry.id);
  const describe = (id: Decision) => (id === "approve" ? entry.approveAs : id === "migrate" ? entry.migrateTo : DECISIONS.find((d) => d.id === id)!.rule);
  box.innerHTML = `
    <div class="col-head"><h2>Inspect</h2><span>${esc(entry.team)}</span></div>
    <div class="d-scroll">
      <h3 class="d-title">${esc(entry.name)}</h3>
      <p class="muted small">${esc(entry.label)}</p>
      ${coach(entry)}
      <h4 class="sub-head">Evidence ${decision ? "" : "· pick the deciding fact"}</h4>
      <div class="evidence" role="group" aria-label="Evidence">
        ${entry.evidence
          .map((row) => {
            const cls = [row.id === fact ? "on" : "", decision && row.id === entry.key ? "key" : ""].join(" ");
            return `<button class="fact ${cls}" data-act="fact" data-value="${row.id}" ${decision ? "disabled" : ""} aria-pressed="${row.id === fact}"><b>${esc(row.label)}</b><span>${esc(row.value)}</span>${decision && row.id === entry.key ? `<em>key fact</em>` : ""}</button>`;
          })
          .join("")}
      </div>
      <h4 class="sub-head">Decision</h4>
      <div class="decisions">
        ${DECISIONS.map(
          (d) => `<button class="dec-btn sit-${d.id} ${decision === d.id ? "on" : ""} ${decision && bestDecision(entry) === d.id && decision !== d.id ? "best" : ""}" data-act="decide" data-value="${d.id}" ${ready ? "" : "disabled"} aria-pressed="${decision === d.id}">
            <kbd>${d.key}</kbd><span><b>${d.name}</b><small>${esc(describe(d.id))}</small></span></button>`,
        ).join("")}
      </div>
      ${
        outcome
          ? `<div class="outcome ${outcome.grade === "best" ? "good" : outcome.grade === "ok" ? "ok" : "bad"}" role="status">
              <strong>${GRADE_LABEL[outcome.grade]} · Risk ${signed(outcome.risk)} · Productivity ${signed(outcome.morale)}</strong>
              <span>${esc(outcome.text)}</span>
              ${outcome.grade === "best" ? "" : `<span class="muted small">Best here: <b>${DECISION_NAME[bestDecision(entry)]}</b>. ${esc(entry.lesson)}</span>`}
            </div>`
          : ""
      }
    </div>`;
}

function renderNext(): void {
  const bar = $("#next-step");
  const sel = selected ? itemById(SCENARIO, selected) : null;
  const undecided = items.filter((entry) => !state.decisions[entry.id]);
  const unseen = items.filter((entry) => !isInspected(state, entry.id));
  let step: NextStep;
  if (state.phase === "guided" && !sel) {
    step = {
      text: `Start with the guided finding: click the <strong>${esc(itemById(SCENARIO, SCENARIO.guided).label.toLowerCase())}</strong> (pulsing) to inspect it.`,
      hint: "The rest of the floor opens after your first decision.",
      targets: [`g.item[data-id="${SCENARIO.guided}"]`],
    };
  } else if (sel && !state.decisions[sel.id] && !state.facts[sel.id]) {
    step = {
      text: `Read the evidence on the right and click the <strong>one fact that decides it</strong>.`,
      hint: "Not scored: it records your reasoning for the debrief.",
      targets: ["#inspector .evidence"],
    };
  } else if (sel && !state.decisions[sel.id]) {
    step = {
      text: `Choose <strong>Block</strong>, <strong>Approve</strong>, <strong>Migrate</strong> or <strong>Leave as is</strong> (or press <kbd>B</kbd> <kbd>A</kbd> <kbd>M</kbd> <kbd>L</kbd>). The decision is final.`,
      hint: "Blocking a tool people need, with no alternative, drains productivity. Approving a risky one raises risk.",
      targets: ["#inspector .decisions"],
    };
  } else if (unseen.length) {
    step = {
      label: sel ? "Done" : "Next",
      tone: sel ? "ready" : "",
      text: `${sel ? "Read why, then keep" : "Keep"} walking: <strong>${unseen.length} of ${items.length}</strong> things on the floor are not inspected yet. Some are sanctioned tools that only look like shadow IT.`,
      hint: undecided.length > unseen.length ? `${undecided.length - unseen.length} inspected item${undecided.length - unseen.length === 1 ? "" : "s"} still need a decision (marked <em>decide</em> in the register).` : undefined,
      targets: ["#floor-view .scene"],
    };
  } else if (undecided.length) {
    step = {
      label: "Check",
      tone: "warn",
      text: `Everything is inspected. ${undecided.length} still need${undecided.length === 1 ? "s" : ""} a decision; open ${undecided.length === 1 ? "it" : "one"} from the register on the left.`,
      hint: "Anything undecided is left as it is when you finish.",
      targets: [`#register [data-act="select"][data-id="${undecided[0].id}"]`],
    };
  } else {
    step = {
      label: "Ready",
      tone: "ready",
      text: `Every finding has a decision. Press <strong>Finish the floor walk</strong> on the left for the debrief.`,
      targets: ['[data-act="finish"]'],
    };
  }
  renderNextStep(bar, step);
}

function select(id: string): void {
  if (!isAvailable(state, id)) {
    announce("Finish the guided finding first.");
    return;
  }
  const first = !isInspected(state, id);
  inspect(state, id);
  selected = id;
  lastDelta = null;
  play("click");
  if (first) post("statement", { at: new Date().toISOString(), verb: "inspected", object: id });
  render();
  announce(`${itemById(SCENARIO, id).name}, ${itemById(SCENARIO, id).team}. Evidence revealed.`);
  document.querySelector<HTMLElement>("#inspector .fact:not(:disabled), #inspector .outcome")?.focus();
}

function onFact(value: string): void {
  if (!selected || !pickFact(state, selected, value)) return;
  play("click");
  render();
  document.querySelector<HTMLElement>("#inspector .dec-btn:not(:disabled)")?.focus();
}

function onDecide(decision: Decision): void {
  if (!selected) return;
  const id = selected;
  const outcome = decide(state, id, decision);
  if (!outcome) return;
  lastDelta = { risk: outcome.risk, morale: outcome.morale };
  play(outcome.grade === "best" ? "success" : outcome.grade === "ok" ? "deliver" : "setback");
  const entry = itemById(SCENARIO, id);
  post("statement", { at: new Date().toISOString(), verb: "decided", object: id, result: { decision, grade: outcome.grade, fact: state.facts[id], keyFact: state.facts[id] === entry.key } });
  render();
  announce(`${GRADE_LABEL[outcome.grade]}. Risk ${signed(outcome.risk)}, productivity ${signed(outcome.morale)}. ${outcome.text}`);
}

document.addEventListener("click", (event) => {
  const target = event.target as HTMLElement;
  const scenic = target.closest<SVGGElement>("g.item");
  if (scenic) return select(scenic.dataset.id!);
  const button = target.closest<HTMLElement>("[data-act]");
  if (!button || (button as HTMLButtonElement).disabled) return;
  const { act, value, id } = button.dataset;
  if (act === "fact") onFact(value!);
  else if (act === "decide") onDecide(value as Decision);
  else if (act === "select") select(id!);
  else if (act === "finish") {
    finish(state);
    play("success");
    selected = null;
    render();
  } else if (act === "retry") start(true);
});

document.addEventListener("keydown", (event) => {
  const target = event.target as Element;
  if ((event.key === "Enter" || event.key === " ") && target instanceof SVGGElement && target.classList.contains("item")) {
    event.preventDefault();
    return select(target.dataset.id!);
  }
  if (isModalOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey || !selected) return;
  const match = DECISIONS.find((d) => d.key.toLowerCase() === event.key.toLowerCase());
  if (match && canDecide(state, selected)) {
    event.preventDefault();
    onDecide(match.id);
  }
});

function tile(label: string, value: number, max: number, note: string, good = max * 0.85, ok = max * 0.5): string {
  const tone = value >= good ? "good" : value >= ok ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}

function renderDebrief(): void {
  const result = score(state);
  const learn = learning(state);
  const name = (id: string) => esc(itemById(SCENARIO, id).name);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), durationSeconds: Math.round((performance.now() - started) / 1000), score: result, learning: learn, decisions: state.decisions, facts: state.facts });
  try {
    localStorage.setItem("ares-shadowit:lastResult", JSON.stringify({ total: result.total, passed: result.passed }));
  } catch {
    // Optional.
  }
  const habits: string[] = [];
  if (learn.blockedWithAlternative.length) habits.push(`<strong>Blocked where a better path existed:</strong> ${learn.blockedWithAlternative.map(name).join(", ")}. Blocking a tool people need, without giving them the sanctioned alternative, costs productivity and breeds the next workaround.`);
  if (learn.approvedRisky.length) habits.push(`<strong>Approved what conditions cannot fix:</strong> ${learn.approvedRisky.map(name).join(", ")}. Conditions work when the problem is access (SSO); not when the company does not own the account, the terms keep your data, or the data leaves.`);
  if (learn.unaddressed.length) habits.push(`<strong>Left shadow IT in place:</strong> ${learn.unaddressed.map(name).join(", ")}. Once you know about it, leaving it is accepting the risk.`);
  if (learn.disruptedSanctioned.length) habits.push(`<strong>Disrupted sanctioned tools:</strong> ${learn.disruptedSanctioned.map(name).join(", ")}. Check the owner and controls before acting: these were already IT's.`);
  if (!habits.length) habits.push("Balanced: you kept teams working and brought the data back under control.");
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(SCENARIO.title)}</p>
        <h2 id="debrief-title" tabindex="-1">Score ${result.total}<small>/100</small> · <span class="${result.passed ? "pass" : "fail"}">${result.passed ? "Passed" : "Not yet"}</span></h2>
        <p class="muted">${result.grades.best} best calls · ${result.grades.ok} partly right · ${result.grades.poor} poor${result.undecided ? ` · ${result.undecided} left undecided (counted as Leave as is)` : ""}. Pass: score ${THRESHOLDS.score}+, risk ${THRESHOLDS.maxRisk} or less, productivity ${THRESHOLDS.minMorale} or more.</p>
        ${result.reasons.length ? `<ul class="reasons">${result.reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>` : ""}
      </header>
      <div class="score-grid wide">
        ${tile("Decisions", result.decisionPct, 100, `${Math.round(WEIGHTS.decisions * 100)}% of the score`)}
        ${tile("Risk control", result.safety, 100, `100 − final risk (${result.risk}) · ${Math.round(WEIGHTS.safety * 100)}%`, 80, 100 - THRESHOLDS.maxRisk)}
        ${tile("Productivity", result.productivity, 100, `Final team productivity · ${Math.round(WEIGHTS.productivity * 100)}%`, 75, THRESHOLDS.minMorale)}
        ${tile("Total", result.total, 100, `Pass mark ${THRESHOLDS.score}`, 85, THRESHOLDS.score)}
      </div>
      <section class="panel">
        <h3>Your calls</h3>
        <table class="plan-table"><thead><tr><th scope="col">Finding</th><th scope="col">Team</th><th scope="col">You</th><th scope="col">Best</th><th scope="col">Risk</th><th scope="col">Productivity</th></tr></thead><tbody>
          ${items
            .map((entry) => {
              const decision = state.decisions[entry.id] ?? "leave";
              const outcome = entry.outcomes[decision];
              return `<tr class="${outcome.grade}"><th scope="row">${esc(entry.name)}${entry.sanctioned ? ` <span class="tag-ok">sanctioned</span>` : ""}</th><td>${esc(entry.team)}</td><td>${DECISION_NAME[decision]}${state.decisions[entry.id] ? "" : " (undecided)"}</td><td>${DECISION_NAME[bestDecision(entry)]}</td><td>${signed(outcome.risk)}</td><td>${signed(outcome.morale)}</td></tr>`;
            })
            .join("")}</tbody></table>
      </section>
      <section class="panel">
        <h3>Your habits</h3>
        <ul class="habits">${habits.map((habit) => `<li>${habit}</li>`).join("")}</ul>
      </section>
      <section class="panel">
        <h3>Learning evidence <small class="muted">(not part of the score)</small></h3>
        <ul class="objectives">
          <li><strong>Asset awareness:</strong> inspected ${learn.inspected} of ${learn.total} things on the floor.</li>
          <li><strong>Reasoning from evidence:</strong> your deciding fact matched the key fact on ${learn.factsMatched} of ${learn.factsPicked} decisions.</li>
          <li><strong>Telling sanctioned from shadow:</strong> left ${learn.sanctionedRecognised} of ${learn.sanctionedTotal} sanctioned tools alone.</li>
          <li><strong>Balancing security with productivity:</strong> ${learn.blockedWithAlternative.length} block${learn.blockedWithAlternative.length === 1 ? "" : "s"} where a better path existed · ${learn.approvedRisky.length} risky approval${learn.approvedRisky.length === 1 ? "" : "s"}.</li>
        </ul>
      </section>
      <section class="panel">
        <h3>What each finding teaches</h3>
        <ul class="habits">${items
          .map((entry) => {
            const decision = state.decisions[entry.id] ?? "leave";
            const grade = entry.outcomes[decision].grade;
            return `<li class="${grade}"><strong>${esc(entry.name)}</strong> · best: ${DECISION_NAME[bestDecision(entry)]}<br /><span class="muted">${esc(entry.lesson)}</span></li>`;
          })
          .join("")}</ul>
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Fictional company · Content pending SME review (docs/design/SHADOW_IT.md)</p>
    </div>`;
  $("#debrief-title").focus();
}

function tutorialPages(retry: boolean): TutorialPage[] {
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You are on the IT team at <strong>${esc(SCENARIO.org)}</strong>. Teams have quietly picked up their own tools. Some put company data at risk; some are fine; some are already sanctioned.</p>
        <p class="tut-lead">Walk the office floor, inspect what people are using, and decide what happens to each one.</p>
        <p class="tut-note"><span>The catch: <strong>blocking everything loses</strong>. People use these tools because they need them. Take a tool away with no alternative and productivity drops, and they find another workaround.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">▦</span><span><b>The office floor</b>Middle. Eight teams. Anything you can inspect gets a yellow outline when you point at it.</span></div>
          <div><span class="tut-ico box">▮</span><span><b>Risk and Team productivity</b>Left. Both move with every decision. Keep risk at or below ${THRESHOLDS.maxRisk} and productivity at or above ${THRESHOLDS.minMorale}.</span></div>
          <div><span class="tut-ico box">☰</span><span><b>Asset register</b>Left. Everything you have inspected, and what you decided.</span></div>
          <div><span class="tut-ico box">?</span><span><b>Inspect</b>Right. The evidence for what you selected, and the four decisions.</span></div>
        </div>
        <p class="tut-note"><span>The bar above the floor always says what to do next.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Inspect</b><span class="how">Click something on the floor (or <kbd>Tab</kbd> + <kbd>Enter</kbd>). Evidence appears: the data, the owner, why the team uses it, and any sanctioned option.</span></span></li>
          <li><span><b>Pick the deciding fact</b><span class="how">Click the one fact that matters most. Not scored: it shows your reasoning in the debrief.</span></span></li>
          <li><span><b>Decide</b><span class="how">${DECISIONS.map((d) => `<span class="tut-pill">${d.name}</span> (<kbd>${d.key}</kbd>) ${esc(d.rule)}`).join("<br />")}</span></span></li>
        </ol>
        <p class="tut-note"><span>A decision is final and explained straight away, tied to the evidence. Your first finding is guided.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Decisions <small>${Math.round(WEIGHTS.decisions * 100)}%</small></b>${POINTS.best} for the best call, ${POINTS.ok} for a partly right one, ${POINTS.poor} for a poor one.</div>
          <div><b>Risk control <small>${Math.round(WEIGHTS.safety * 100)}%</small></b>100 minus the final risk.</div>
          <div><b>Productivity <small>${Math.round(WEIGHTS.productivity * 100)}%</small></b>The final team productivity.</div>
        </div>
        <p>To pass: score ${THRESHOLDS.score} or more, risk ${THRESHOLDS.maxRisk} or less, productivity ${THRESHOLDS.minMorale} or more. Block everything and productivity collapses; approve everything and risk climbs past the limit.</p>
        <p class="tut-muted">No timer. Undecided items are left as they are when you finish.</p>
        ${retry ? `<p class="tut-note"><span>Starting again: same floor, fresh meters.</span></p>` : ""}
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
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
}

function start(retry = false): void {
  state = createGame(SCENARIO);
  selected = null;
  lastDelta = null;
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${SCENARIO.org} · How to play`,
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Walk the floor",
    onStart: () => document.querySelector<HTMLElement>(`g.item[data-id="${SCENARIO.guided}"]`)?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${SCENARIO.org} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
