import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, isModalOpen, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, isTutorialOpen, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { ORG, PURCHASES, TODAY } from "./data";
import {
  CONDITIONS,
  MAX_FLAGS,
  OUTCOME_POINTS,
  PURCHASE_MAX,
  SECTIONS,
  THRESHOLDS,
  VERDICT_POINTS,
  allRejected,
  ask,
  canJudge,
  createGame,
  currentPurchase,
  currentRound,
  isAsked,
  learning,
  next,
  optionFor,
  questionsLeft,
  roundResult,
  score,
  setPreferred,
  setVerdict,
  sign,
  signBlockers,
  supplierById,
  toggleFlag,
  verdictName,
  visibleEvidence,
  type ConditionId,
  type GameState,
  type Grade,
  type RoundResult,
  type Supplier,
  type Verdict,
} from "./engine";

// Same lightweight host contract as the other practices.
const ACTIVITY_ID = "ares-vendor-vetting/three-purchases/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const LOGO = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
const GRADE_LABEL: Record<Grade, string> = { best: "Best call", ok: "Partly right", poor: "Poor call" };
const OUTCOME_LABEL: Record<Grade | "unmet", string> = { best: "A good year", ok: "A workable year, with a gap", poor: "A bad year", unmet: "The need went unmet" };
const TONE: Record<Grade | "unmet", string> = { best: "good", ok: "ok", poor: "bad", unmet: "bad" };
const PHASE_NAME = { full: "Guided", light: "Practice", none: "No hints" } as const;
const money = (value: number) => `$${value.toLocaleString("en-US")}`;

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

let state: GameState = createGame(PURCHASES);
let selected = PURCHASES[0].suppliers[0].id;
let picker: string | null = null; // supplier whose condition list is open
let started = performance.now();
$("#logo").innerHTML = LOGO;

const purchase = () => currentPurchase(state);
const round = () => currentRound(state);
const sel = (): Supplier => supplierById(purchase(), selected);

function shortVerdict(verdict: Verdict | undefined): string {
  if (!verdict) return "no verdict";
  if (verdict.kind === "approve") return "Approve";
  if (verdict.kind === "reject") return "Reject";
  return `Conditions: ${CONDITIONS.find((entry) => entry.id === verdict.condition)!.name.toLowerCase()}`;
}

function verdictClass(verdict: Verdict | undefined): string {
  return verdict ? `v-${verdict.kind}` : "todo";
}

// Re-rendering replaces the buttons, so put focus back on the same control afterwards.
function keepFocus(run: () => void): void {
  const active = document.activeElement as HTMLElement | null;
  const key = active?.dataset?.act ? `[data-act="${active.dataset.act}"]${active.dataset.id ? `[data-id="${active.dataset.id}"]` : ""}${active.dataset.value ? `[data-value="${active.dataset.value}"]` : ""}` : null;
  const zone = active?.closest<HTMLElement>("#brief, #file, #decide")?.id;
  run();
  if (key) (document.querySelector<HTMLElement>(`${zone ? `#${zone} ` : ""}${key}`) ?? document.querySelector<HTMLElement>(key))?.focus();
}

function render(): void {
  if (state.phase === "done") return renderDebrief();
  const done = state.rounds.filter((entry, index) => entry.signed && (index < state.index || state.phase === "year"));
  const points = done.length ? state.purchases.slice(0, done.length).reduce((sum, entry, index) => sum + roundResult(entry, state.rounds[index]).total, 0) : 0;
  $("#status").innerHTML = `
    <div class="count first"><strong>${state.index + 1}/${state.purchases.length}</strong><span>Purchase</span></div>
    <div class="count"><strong>${state.phase === "review" ? questionsLeft(state) : 0}</strong><span>Questions left</span></div>
    <div class="count"><strong>${points}<small>/${done.length * PURCHASE_MAX}</small></strong><span>Points</span></div>`;
  $("#cols").classList.toggle("year", state.phase === "year");
  $("#decide").hidden = state.phase === "year";
  renderBrief();
  if (state.phase === "year") renderYear();
  else {
    renderFile();
    renderDecide();
  }
  renderNext();
}

function renderBrief(): void {
  const p = purchase();
  const r = round();
  const review = state.phase === "review";
  const blockers = review ? signBlockers(state) : [];
  const left = questionsLeft(state);
  $("#brief").innerHTML = `
    <div class="col-head"><h2 tabindex="-1">Purchase ${state.index + 1} of ${state.purchases.length}</h2><span class="phase-pill">${PHASE_NAME[p.hints]}</span></div>
    <div class="d-scroll">
      <p class="kicker">${esc(ORG)} · ${esc(TODAY)}</p>
      <h3 class="d-title">${esc(p.title)}</h3>
      <p class="brief">${esc(p.need)}</p>
      <dl class="stakes">
        <div><dt>Data the supplier gets</dt><dd>${esc(p.data)}</dd></div>
        <div><dt>Access the supplier gets</dt><dd>${esc(p.access)}</dd></div>
        ${p.hints === "full" || !review ? `<div class="tier tier-${p.tier}"><dt>What is at stake</dt><dd>${esc(p.tierWhy)}</dd></div>` : ""}
      </dl>
      ${review && p.hints === "light" && p.hint ? `<div class="coach"><strong>One hint.</strong> ${esc(p.hint)}</div>` : ""}
      <h4 class="sub-head">The three bids</h4>
      <ol class="bids">
        ${p.suppliers
          .map((supplier) => {
            const verdict = r.verdicts[supplier.id];
            return `<li><button class="link-row ${selected === supplier.id && review ? "on" : ""}" data-act="select" data-id="${supplier.id}" ${review ? "" : "disabled"}>
              <span><b>${r.preferred === supplier.id ? `<i class="star" aria-label="Preferred">★</i> ` : ""}${esc(supplier.name)}</b><small>${money(supplier.price)} a year${supplier.badge ? ` · badge: ${esc(supplier.badge)}` : ""}</small></span>
              <em class="${verdictClass(verdict)}">${esc(shortVerdict(verdict))}</em></button></li>`;
          })
          .join("")}
      </ol>
      ${
        review
          ? `<p class="questions" aria-label="${left} of ${p.questions} follow-up questions left">Follow-up questions ${Array.from({ length: p.questions }, (_, i) => `<i class="${i < left ? "on" : ""}"></i>`).join("")} <b>${left} left</b></p>
             ${allRejected(state) ? `<p class="warn-text small">All three are rejected. You can sign off, but the business need then goes unmet.</p>` : ""}
             <button class="btn primary" data-act="sign" ${blockers.length ? "disabled" : ""}>Sign off and run the year</button>
             ${blockers.length ? `<p class="muted small">${esc(blockers[0])}</p>` : ""}`
          : ""
      }
    </div>`;
}

function coach(supplier: Supplier): string {
  const p = purchase();
  if (p.hints !== "full" || !supplier.coach) return "";
  const flags = round().flags[supplier.id]?.length ?? 0;
  const verdict = round().verdicts[supplier.id];
  let text = supplier.coach;
  if (verdict) text = `Verdict recorded; you can still change it before sign-off. Check the other bids, then name the one you would sign.`;
  else if (flags) text = `Now the verdict. Is the gap you found one that a single condition closes, or one that nothing on paper can fix? Match the weight of the condition to what is at stake.`;
  return `<div class="coach"><strong>Guided purchase.</strong> ${esc(text)}</div>`;
}

function renderFile(): void {
  const p = purchase();
  const r = round();
  const supplier = sel();
  $("#file-head").innerHTML = `<h2>Supplier file</h2><div class="tabs" role="group" aria-label="Bids">${p.suppliers
    .map((entry, index) => `<button class="tab ${entry.id === selected ? "on" : ""}" data-act="select" data-id="${entry.id}" aria-pressed="${entry.id === selected}"><kbd>${index + 1}</kbd>${esc(entry.name)}</button>`)
    .join("")}</div>`;
  const flags = r.flags[supplier.id] ?? [];
  const full = flags.length >= MAX_FLAGS;
  const row = (id: string, text: string) => {
    const on = flags.includes(id);
    return `<button class="fact ${on ? "on" : ""}" data-act="flag" data-id="${esc(id)}" aria-pressed="${on}" ${!on && full ? `aria-disabled="true"` : ""}><i class="flag" aria-hidden="true">${on ? "⚑" : "⚐"}</i><span>${esc(text)}</span></button>`;
  };
  const left = questionsLeft(state);
  $("#file-view").innerHTML = `
    <header class="sup-head">
      <div><h3 class="d-title">${esc(supplier.name)}</h3><p class="muted small">${esc(supplier.domain)} · ${money(supplier.price)} a year</p></div>
      ${supplier.badge ? `<span class="badge-chip" title="A badge shown on the bid">✔ ${esc(supplier.badge)}</span>` : `<span class="badge-chip none">No badge on the bid</span>`}
    </header>
    ${coach(supplier)}
    <p class="muted small">Flag the evidence that matters to your verdict: ${flags.length} of ${MAX_FLAGS} flags used on this bid.</p>
    <div class="facts">
      ${SECTIONS.map((section) => {
        const facts = supplier.facts.filter((fact) => fact.section === section.id);
        return `<section class="fact-group" aria-label="${section.name}"><h4 class="sub-head">${section.name}</h4>${facts.map((fact) => row(fact.id, fact.text)).join("")}</section>`;
      }).join("")}
    </div>
    <section class="followups" aria-label="Follow-up questions">
      <h4 class="sub-head">Follow-up questions · ${left} left for this purchase</h4>
      ${supplier.followUps
        .map((entry) =>
          isAsked(r, supplier.id, entry.id)
            ? `<div class="asked"><p class="q">You asked: ${esc(entry.question)}</p>${row(`fu:${entry.id}`, entry.answer)}</div>`
            : `<button class="ask" data-act="ask" data-id="${entry.id}" ${left ? "" : "disabled"}><b>Ask</b><span>${esc(entry.question)}</span></button>`,
        )
        .join("")}
    </section>`;
}

function renderDecide(): void {
  const supplier = sel();
  const r = round();
  const verdict = r.verdicts[supplier.id];
  const ready = canJudge(state, supplier.id);
  const open = picker === supplier.id || verdict?.kind === "conditions";
  const button = (kind: Verdict["kind"], key: string, name: string, note: string) =>
    `<button class="dec-btn sit-${kind} ${verdict?.kind === kind ? "on" : ""}" data-act="verdict" data-value="${kind}" ${ready ? "" : "disabled"} aria-pressed="${verdict?.kind === kind}" ${kind === "conditions" ? `aria-expanded="${open}"` : ""}><kbd>${key}</kbd><span><b>${name}</b><small>${note}</small></span></button>`;
  const canPrefer = !!verdict && verdict.kind !== "reject";
  $("#decide").innerHTML = `
    <div class="col-head"><h2>Verdict</h2><span>${esc(supplier.name)}</span></div>
    <div class="d-scroll">
      ${ready ? "" : `<p class="muted small">Flag at least one piece of evidence in the file first. Your flags are your reasons.</p>`}
      <div class="decisions" role="group" aria-label="Verdict for ${esc(supplier.name)}">
        ${button("approve", "A", "Approve", "Acceptable as it stands.")}
        ${button("conditions", "C", "Approve with a condition", "Acceptable if one thing is fixed first. Pick it below.")}
        ${
          open
            ? `<div class="conditions" role="group" aria-label="Condition">${CONDITIONS.map(
                (entry) => `<button class="cond ${verdict?.kind === "conditions" && verdict.condition === entry.id ? "on" : ""}" data-act="condition" data-value="${entry.id}" ${ready ? "" : "disabled"} aria-pressed="${verdict?.kind === "conditions" && verdict.condition === entry.id}"><span><b>${entry.name}</b><small>${entry.detail}</small></span><em class="w-${entry.weight}">${entry.weight === "heavy" ? "heavyweight" : "light"}</em></button>`,
              ).join("")}</div>`
            : ""
        }
        ${button("reject", "R", "Reject", "Not acceptable for this purchase.")}
      </div>
      <h4 class="sub-head">Preferred supplier</h4>
      <button class="btn prefer ${r.preferred === supplier.id ? "on" : ""}" data-act="prefer" data-id="${supplier.id}" ${canPrefer ? "" : "disabled"} aria-pressed="${r.preferred === supplier.id}"><kbd>P</kbd> ${r.preferred === supplier.id ? "★ This is the one you would sign" : "Sign this one"}</button>
      <p class="muted small">Give all three a verdict, then name one to sign. Verdicts can be changed until you sign off; after that the year plays out.</p>
    </div>`;
}

function renderYear(): void {
  const result = roundResult(purchase(), round());
  const last = state.index + 1 === state.purchases.length;
  $("#file-head").innerHTML = `<h2>The year plays out</h2><span>${result.preferred ? `Signed: ${esc(result.preferred.name)}` : "Nobody signed"}</span>`;
  $("#file-view").innerHTML = `
    <div class="outcome ${TONE[result.outcome]}" role="status">
      <strong>${OUTCOME_LABEL[result.outcome]} · ${result.total} of ${PURCHASE_MAX} points</strong>
      <span>${result.preferred ? `${esc(result.preferred.name)}, ${esc(verdictName(round().verdicts[result.preferred.id]).toLowerCase())}.` : "You rejected all three bids."} Verdicts ${result.verdictPoints}/${3 * VERDICT_POINTS.best} · Year ${result.outcomePoints}/${OUTCOME_POINTS.best}</span>
    </div>
    <ol class="events">${result.events.map(([when, text], index) => `<li style="--i:${index}"><b>${esc(when)}</b><span>${esc(text)}</span></li>`).join("")}</ol>
    <h4 class="sub-head">Your verdicts, and the evidence behind them</h4>
    ${verdictCards(result)}
    <div class="debrief-actions"><button class="btn primary" data-act="next">${last ? "See the debrief" : "Next purchase"}</button></div>`;
}

function verdictCards(result: RoundResult): string {
  const r = state.rounds[state.purchases.indexOf(result.purchase)];
  return `<div class="cards">${result.suppliers
    .map((entry) => {
      const { supplier } = entry;
      const flags = r.flags[supplier.id] ?? [];
      const keys = visibleEvidence(r, supplier).filter((fact) => fact.key);
      const best = optionFor(supplier, entry.best);
      return `<article class="card ${entry.grade}">
        <header><h4>${entry.preferred ? "★ " : ""}${esc(supplier.name)}</h4><span class="grade ${entry.grade}">${GRADE_LABEL[entry.grade]} · ${entry.points}/${VERDICT_POINTS.best}</span></header>
        <p><b>You:</b> ${esc(entry.verdict ? verdictName(entry.verdict) : "no verdict")}. ${esc(entry.text)}</p>
        ${entry.grade === "best" ? "" : `<p><b>Best:</b> ${esc(verdictName(entry.best))}. ${esc(best.text)}</p>`}
        <ul class="keys">${keys.map((fact) => `<li class="${flags.includes(fact.id) ? "hit" : ""}">${flags.includes(fact.id) ? "⚑ you flagged" : "⚐ deciding"}: ${esc(fact.text)}</li>`).join("")}</ul>
      </article>`;
    })
    .join("")}</div>`;
}

function renderNext(): void {
  const bar = $("#next-step");
  const p = purchase();
  const r = round();
  let step: NextStep;
  if (state.phase === "year") {
    step = { label: "Read", tone: "ready", text: `This is what the year brought. Read why each verdict was right or wrong, then continue.`, targets: ['[data-act="next"]'] };
  } else {
    const supplier = sel();
    const flags = r.flags[supplier.id]?.length ?? 0;
    const waiting = p.suppliers.filter((entry) => !r.verdicts[entry.id]);
    const left = questionsLeft(state);
    const askHint = left ? `You have ${left} follow-up question${left === 1 ? "" : "s"} left for this purchase. Spend them where the file is vague.` : "No follow-up questions left for this purchase.";
    if (!flags && !r.verdicts[supplier.id]) {
      step = { text: `Read <strong>${esc(supplier.name)}</strong>'s file and flag up to ${MAX_FLAGS} pieces of evidence that matter.`, hint: askHint, targets: ["#file-view .facts"] };
    } else if (!r.verdicts[supplier.id]) {
      step = { text: `Give <strong>${esc(supplier.name)}</strong> a verdict: Approve, Approve with a condition, or Reject (<kbd>A</kbd> <kbd>C</kbd> <kbd>R</kbd>).`, hint: p.hints === "none" ? undefined : "Match the weight of any condition to the data and access involved.", targets: ["#decide .decisions"] };
    } else if (waiting.length) {
      step = { text: `Open the next bid: <strong>${esc(waiting[0].name)}</strong> (<kbd>${p.suppliers.indexOf(waiting[0]) + 1}</kbd>).`, hint: askHint, targets: [`#file-head [data-act="select"][data-id="${waiting[0].id}"]`] };
    } else if (allRejected(state)) {
      step = { label: "Check", tone: "warn", text: `You have rejected all three. Sign off if you mean it, but nobody will meet the business need.`, targets: ['[data-act="sign"]'] };
    } else if (!r.preferred) {
      const options = p.suppliers.filter((entry) => r.verdicts[entry.id].kind !== "reject");
      step = { text: `Name the supplier you would sign: open ${options.length === 1 ? `<strong>${esc(options[0].name)}</strong>` : "one you approved"} and press <strong>Sign this one</strong> (<kbd>P</kbd>).`, targets: ['#decide [data-act="prefer"]'] };
    } else {
      step = { label: "Ready", tone: "ready", text: `All three have a verdict and <strong>${esc(supplierById(p, r.preferred).name)}</strong> is preferred. Press <strong>Sign off and run the year</strong>, or change a verdict first.`, targets: ['[data-act="sign"]'] };
    }
  }
  renderNextStep(bar, step);
}

// ---- actions ----
function select(id: string): void {
  if (state.phase !== "review") return;
  selected = id;
  picker = null;
  play("click");
  keepFocus(render);
  announce(`${sel().name} file.`);
}

function onFlag(id: string): void {
  const supplier = sel();
  const had = round().flags[supplier.id]?.includes(id);
  if (!toggleFlag(state, supplier.id, id)) {
    announce(`Only ${MAX_FLAGS} flags per bid. Remove one first.`);
    return;
  }
  play("click");
  keepFocus(render);
  announce(had ? "Flag removed." : "Flagged.");
}

function onAsk(id: string): void {
  const supplier = sel();
  const answer = ask(state, supplier.id, id);
  if (!answer) return;
  play("deliver");
  post("statement", { at: new Date().toISOString(), verb: "asked", object: `${supplier.id}/${id}` });
  render();
  document.querySelector<HTMLElement>(`#file-view [data-act="flag"][data-id="fu:${id}"]`)?.focus();
  announce(`${supplier.name} answers: ${answer.answer}`);
}

function onVerdict(kind: Verdict["kind"]): void {
  const supplier = sel();
  if (!canJudge(state, supplier.id)) return;
  if (kind === "conditions") {
    picker = supplier.id;
    keepFocus(render);
    if (round().verdicts[supplier.id]?.kind !== "conditions") {
      document.querySelector<HTMLElement>("#decide .cond")?.focus();
      announce("Pick one condition.");
    }
    return;
  }
  picker = null;
  setVerdict(state, supplier.id, { kind });
  play("click");
  keepFocus(render);
  announce(`${supplier.name}: ${kind}.`);
}

function onCondition(condition: ConditionId): void {
  const supplier = sel();
  if (!setVerdict(state, supplier.id, { kind: "conditions", condition })) return;
  play("click");
  keepFocus(render);
  announce(`${supplier.name}: ${verdictName({ kind: "conditions", condition })}.`);
}

function onPrefer(): void {
  if (!setPreferred(state, selected)) return;
  play("click");
  keepFocus(render);
  announce(`${sel().name} is your preferred supplier.`);
}

function onSign(): void {
  const p = purchase();
  const result = sign(state);
  if (!result) return;
  picker = null;
  play(result.outcome === "best" ? "success" : result.outcome === "ok" ? "deliver" : "setback");
  post("statement", {
    at: new Date().toISOString(),
    verb: "signed",
    object: p.id,
    result: { preferred: result.preferred?.id ?? null, outcome: result.outcome, points: result.total, verdicts: round().verdicts, flags: round().flags, asked: round().asked },
  });
  render();
  $("#file-view").scrollTop = 0;
  $("#file-view").querySelector<HTMLElement>(".outcome")?.setAttribute("tabindex", "-1");
  $("#file-view").querySelector<HTMLElement>(".outcome")?.focus();
  announce(`${OUTCOME_LABEL[result.outcome]}. ${result.total} of ${PURCHASE_MAX} points. ${result.events.map(([when, text]) => `${when}: ${text}`).join(" ")}`);
}

function onNext(): void {
  next(state);
  if (state.phase === "review") selected = purchase().suppliers[0].id;
  play("click");
  render();
  window.scrollTo({ top: 0 });
  if (state.phase === "review") {
    $("#file-view").scrollTop = 0;
    $("#brief h2").focus();
    announce(`Purchase ${state.index + 1}: ${purchase().title}.`);
  }
}

document.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-act]");
  if (!button || (button as HTMLButtonElement).disabled) return;
  const { act, value, id } = button.dataset;
  if (act === "select") select(id!);
  else if (act === "flag") onFlag(id!);
  else if (act === "ask") onAsk(id!);
  else if (act === "verdict") onVerdict(value as Verdict["kind"]);
  else if (act === "condition") onCondition(value as ConditionId);
  else if (act === "prefer") onPrefer();
  else if (act === "sign") onSign();
  else if (act === "next") onNext();
  else if (act === "retry") start(true);
});

document.addEventListener("keydown", (event) => {
  if (isModalOpen() || isTutorialOpen() || $("#game").hidden || event.ctrlKey || event.metaKey || event.altKey || state.phase !== "review") return;
  const key = event.key.toLowerCase();
  const index = Number(key) - 1;
  if (index >= 0 && index < purchase().suppliers.length) {
    event.preventDefault();
    select(purchase().suppliers[index].id);
    document.querySelector<HTMLElement>(`#file-head [data-act="select"][data-id="${selected}"]`)?.focus();
  } else if (key === "a" || key === "r" || key === "c") {
    event.preventDefault();
    onVerdict(key === "a" ? "approve" : key === "r" ? "reject" : "conditions");
  } else if (key === "p") {
    event.preventDefault();
    onPrefer();
  }
});

// ---- debrief ----
function tile(label: string, value: number, max: number, note: string, good = max * 0.85, ok = max * 0.5): string {
  const tone = value >= good ? "good" : value >= ok ? "ok" : "bad";
  return `<div class="score-tile ${tone}"><span>${esc(label)}</span><strong>${value}<small>/${max}</small></strong><p>${esc(note)}</p></div>`;
}

function renderDebrief(): void {
  const result = score(state);
  const learn = learning(state);
  const all = PURCHASES.flatMap((entry) => entry.suppliers);
  const names = (ids: readonly string[]) => ids.map((id) => esc(all.find((entry) => entry.id === id)?.name ?? PURCHASES.find((entry) => entry.id === id)?.title ?? id)).join(", ");
  post("completed", {
    activityId: ACTIVITY_ID,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: Math.round((performance.now() - started) / 1000),
    score: { total: result.total, verdicts: result.verdicts, outcomes: result.outcomes, needsMet: result.needsMet, passed: result.passed },
    learning: learn,
    rounds: state.rounds,
  });
  try {
    localStorage.setItem("ares-vendor:lastResult", JSON.stringify({ total: result.total, passed: result.passed }));
  } catch {
    // Optional.
  }
  const habits: string[] = [];
  if (learn.needsUnmet.length) habits.push(`<strong>Rejected everyone:</strong> ${names(learn.needsUnmet)}. Vetting exists to find a supplier the business can safely use. With nobody signed, the need is met some other way, usually with no vetting at all.`);
  if (learn.badgeTrusted.length) habits.push(`<strong>Trusted the badge:</strong> ${names(learn.badgeTrusted)}. A certificate is only assurance for the product in its scope, while it is current. Read the scope line and the date, and ask what the purchase needs in the first place.`);
  if (learn.unverifiableTrusted.length) habits.push(`<strong>Accepted a story nobody could check:</strong> ${names(learn.unverifiableTrusted)}. 'No incidents' and a page of 'Yes' answers with nothing attached are claims, not evidence.`);
  if (learn.handledBreachRejected.length) habits.push(`<strong>Rejected for an old breach:</strong> ${names(learn.handledBreachRejected)}. A breach that was disclosed quickly and fixed, with the fix independently tested, tells you more than a spotless record you cannot verify.`);
  if (learn.cheapestPickedPoorly.length) habits.push(`<strong>Cheapest bid, costly year:</strong> ${names(learn.cheapestPickedPoorly)}. Price is a fair tie-breaker between acceptable suppliers, never the test of acceptability.`);
  if (learn.gapsLeftOpen.length) habits.push(`<strong>Left a known gap open:</strong> ${names(learn.gapsLeftOpen)}. The right supplier still had one thing to fix, and one light condition would have closed it.`);
  if (learn.heavyOnLowRisk.length) habits.push(`<strong>Heavyweight condition on a low-risk purchase:</strong> ${names(learn.heavyOnLowRisk)}. Public content and no internal access do not justify an audit; the supplier walks and the business learns to go around you.`);
  if (!habits.length) habits.push("Proportionate throughout: you asked for assurance in line with the data and access involved, and signed suppliers whose claims could be checked.");
  $("#game").hidden = true;
  $("#debrief").hidden = false;
  $("#debrief").innerHTML = `
    <div class="debrief">
      <header class="debrief-head">
        <p class="kicker">Debrief · ${esc(ORG)} · three purchases</p>
        <h2 id="debrief-title" tabindex="-1">Score ${result.total}<small>/100</small> · <span class="${result.passed ? "pass" : "fail"}">${result.passed ? "Passed" : "Not yet"}</span></h2>
        <p class="muted">Pass: score ${THRESHOLDS.score} or more, and every business need met. Each purchase is worth ${PURCHASE_MAX}: ${VERDICT_POINTS.best} per verdict and ${OUTCOME_POINTS.best} for the year.</p>
        ${result.reasons.length ? `<ul class="reasons">${result.reasons.map((reason) => `<li>${esc(reason)}</li>`).join("")}</ul>` : ""}
      </header>
      <div class="score-grid wide">
        ${tile("Verdicts", result.verdicts, 3 * VERDICT_POINTS.best, "Average per purchase, three verdicts")}
        ${tile("The year", result.outcomes, OUTCOME_POINTS.best, "Average outcome with your preferred supplier")}
        ${tile("Needs met", result.needsMet, state.purchases.length, "Purchases where someone was signed", state.purchases.length, state.purchases.length)}
        ${tile("Total", result.total, 100, `Pass mark ${THRESHOLDS.score}`, 85, THRESHOLDS.score)}
      </div>
      ${result.rounds
        .map(
          (entry, index) => `<section class="panel">
            <h3>${index + 1}. ${esc(entry.purchase.title)} <small class="muted">${entry.total}/${PURCHASE_MAX}</small></h3>
            <p class="muted small">${esc(entry.purchase.tierWhy)}</p>
            <div class="outcome ${TONE[entry.outcome]}"><strong>${OUTCOME_LABEL[entry.outcome]}${entry.preferred ? ` · signed ${esc(entry.preferred.name)}` : " · nobody signed"}</strong><span>${esc(entry.events[entry.events.length - 1][1])}</span></div>
            ${verdictCards(entry)}
          </section>`,
        )
        .join("")}
      <section class="panel">
        <h3>Your habits</h3>
        <ul class="habits">${habits.map((habit) => `<li>${habit}</li>`).join("")}</ul>
      </section>
      <section class="panel">
        <h3>Learning evidence <small class="muted">(not part of the score)</small></h3>
        <ul class="objectives">
          <li><strong>Reasoning from evidence:</strong> ${learn.flagsOnKey} of your ${learn.flags} flags were on evidence that decides the verdict; you flagged deciding evidence for ${learn.suppliersWithKeyFlag} of ${learn.suppliers} suppliers.</li>
          <li><strong>Asking before deciding:</strong> used ${learn.followUpsUsed} of ${learn.followUpsAvailable} follow-up questions; ${learn.followUpsKey} surfaced a deciding clarification.</li>
          <li><strong>Reading assurance critically:</strong> ${learn.badgeTrusted.length} badge${learn.badgeTrusted.length === 1 ? "" : "s"} taken on trust · ${learn.unverifiableTrusted.length} unverifiable stor${learn.unverifiableTrusted.length === 1 ? "y" : "ies"} accepted · ${learn.handledBreachRejected.length} well-handled breach${learn.handledBreachRejected.length === 1 ? "" : "es"} held against a supplier.</li>
          <li><strong>Proportionality:</strong> ${learn.heavyOnLowRisk.length} heavyweight condition${learn.heavyOnLowRisk.length === 1 ? "" : "s"} on the low-risk purchase · ${learn.gapsLeftOpen.length} known gap${learn.gapsLeftOpen.length === 1 ? "" : "s"} left open on a high-risk one.</li>
          <li><strong>Without hints:</strong> the final purchase ended as "${learn.noHintOutcome ? OUTCOME_LABEL[learn.noHintOutcome].toLowerCase() : "not played"}".</li>
        </ul>
      </section>
      <div class="debrief-actions"><button class="btn primary" data-act="retry">Start again</button></div>
      <p class="fineprint">Prototype · Fictional company and suppliers · Content to be reviewed with SMEs (docs/design/VENDOR_VETTING.md)</p>
    </div>`;
  window.scrollTo({ top: 0 });
  $("#debrief-title").focus();
}

// ---- how to play ----
function tutorialPages(retry: boolean): TutorialPage[] {
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You review suppliers for <strong>${esc(ORG)}</strong>. The business wants to buy three services. For each one, three suppliers have bid.</p>
        <p class="tut-lead">Read each supplier's file, decide who is acceptable, and name the one to sign. Then a year plays out and you see what your choice led to.</p>
        <p class="tut-note"><span>The skill: ask for assurance <strong>in proportion to the data and access</strong> the supplier would get. Rejecting everyone loses, because the business need goes unmet. So does picking on price, or on a badge.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">▤</span><span><b>Purchase brief</b>Left. What the business needs, and the data and access the supplier would get. The three bids and your verdicts.</span></div>
          <div><span class="tut-ico box">☰</span><span><b>Supplier file</b>Middle. Questionnaire answers, audit report, breach history, subcontractors and contract terms.</span></div>
          <div><span class="tut-ico box">?</span><span><b>Follow-up questions</b>Bottom of the file. A few per purchase, shared across all three bids.</span></div>
          <div><span class="tut-ico box">✓</span><span><b>Verdict</b>Right. Approve, approve with one condition, or reject. Then the supplier to sign.</span></div>
        </div>
        <p class="tut-note"><span>The bar above the file always says what to do next.</span></p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Read and flag</b><span class="how">Switch bids with the tabs (or <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>). Click a line to flag it as evidence that matters, up to ${MAX_FLAGS} per bid. For an audit report, check <em>what it covers</em> and <em>when it was done</em>.</span></span></li>
          <li><span><b>Ask</b><span class="how">Spend a follow-up question where the file is vague. The answer joins the file.</span></span></li>
          <li><span><b>Give a verdict</b><span class="how"><span class="tut-pill">Approve</span> (<kbd>A</kbd>) · <span class="tut-pill">Approve with a condition</span> (<kbd>C</kbd>, then pick one) · <span class="tut-pill">Reject</span> (<kbd>R</kbd>). Light conditions for small gaps; heavyweight ones only where the stakes justify them.</span></span></li>
          <li><span><b>Name the one to sign</b><span class="how">Open a bid you approved and press <span class="tut-pill">Sign this one</span> (<kbd>P</kbd>). Then <span class="tut-pill">Sign off and run the year</span>.</span></span></li>
        </ol>
        <p class="tut-note"><span>The first purchase is guided. The last one has no hints.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Verdicts <small>${3 * VERDICT_POINTS.best}</small></b>${VERDICT_POINTS.best} for the best verdict on a supplier, ${VERDICT_POINTS.ok} for a partly right one, ${VERDICT_POINTS.poor} for a poor one.</div>
          <div><b>The year <small>${OUTCOME_POINTS.best}</small></b>${OUTCOME_POINTS.best} for a good year with the supplier you signed, ${OUTCOME_POINTS.ok} for a workable one, 0 for a bad one or if nobody was signed.</div>
        </div>
        <p>Each purchase is worth ${PURCHASE_MAX}; your score is the average. To pass: ${THRESHOLDS.score} or more, with every business need met.</p>
        <p class="tut-muted">No timer. Flags and follow-up questions are not scored: they are reported separately as evidence of your reasoning.</p>
        ${retry ? `<p class="tut-note"><span>Starting again: the same three purchases, a clean sheet.</span></p>` : ""}
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
  state = createGame(PURCHASES);
  selected = PURCHASES[0].suppliers[0].id;
  picker = null;
  started = performance.now();
  $("#game").hidden = false;
  $("#debrief").hidden = true;
  post("started", {});
  render();
  const pages = tutorialPages(retry);
  showTutorial({
    kicker: `${ORG} · How to play`,
    pages,
    startAt: retry ? pages.length - 1 : 0,
    startLabel: retry ? "Start again" : "Open the first bid",
    onStart: () => document.querySelector<HTMLElement>(`#file-head [data-act="select"][data-id="${selected}"]`)?.focus(),
    onLastPage: bindSettings,
  });
}

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: `${ORG} · How to play`, pages: tutorialPages(false), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

start();
