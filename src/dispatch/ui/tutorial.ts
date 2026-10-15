import type { NextStep, TutorialPage } from "../../ui/tutorial";
import { COURSE_MISSION } from "../data/scenarios";
import { COST, nextEventTime } from "../sim/engine";
import { guidanceOf, scenarioOf } from "../sim/scoring";
import type { CaseState, ShiftDef, ShiftState } from "../sim/types";
import type { Settings } from "./App";

// First-time walkthrough and live "Next" bar for Cyber Dispatch.

function clockLabel(def: ShiftDef, minute: number): string {
  const total = def.startMinutes + Math.round(minute);
  const hour = Math.floor(total / 60);
  return `${((hour + 11) % 12) + 1}:${String(total % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

const INFO = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 8h2v8h-2zm0-4h2v2h-2z"/></svg>`;

export function tutorialPages(def: ShiftDef, replay: boolean): TutorialPage[] {
  const reports = def.arrivals.length;
  const analysts = def.analysts.map((a) => a.name).join(" and ");
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">You are on the security dispatch desk for one ${def.length}-minute shift. ${reports} colleagues will report something odd, one after another.</p>
        <p class="tut-lead">One of them has nothing to worry about. The others need help, and not the same amount. You have two analysts, ${analysts}, and they are not always free.</p>
        <ol class="tut-moves">
          <li><span><b>Find out what is going on</b> by asking the right questions.</span></li>
          <li><span><b>Keep the person safe</b> with an approved next step, in time.</span></li>
          <li><span><b>Hand each report to the right owner</b>: an analyst, or a close with guidance when no analyst is needed.</span></li>
        </ol>
        <p class="tut-muted">${COURSE_MISSION}</p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico box">1</span><span><b>Incoming reports</b>Left. One line per colleague. "New" until you open it, then your priority or who has it.</span></div>
          <div><span class="tut-ico box">2</span><span><b>Analysts</b>Top centre. Available, or "Investigating until" a time.</span></div>
          <div><span class="tut-ico box">3</span><span><b>Conversation</b>Centre. What you said, what they said, and what happened. Your questions and next steps are below it.</span></div>
          <div><span class="tut-ico box">4</span><span><b>Handoff</b>Right. Evidence recorded, Priority, the points to mark, and the handoff buttons.</span></div>
        </div>
        <p class="tut-muted">The top bar shows the shift clock, Cases closed and Analysts available. The <strong>Company network</strong> map lights up the reporter's department. A ✓ checklist on each report tracks Ask, Prioritise, Guide and Hand off.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Open a report</b><span class="how">Click it under <span class="tut-pill">Incoming reports</span>, or press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>.</span></span></li>
          <li><span><b>Ask</b> · ${COST.ask} min each<span class="how">Under <span class="tut-pill">Ask a question</span>, click a question. A useful answer is added to Evidence recorded. Others only use time, and asking twice annoys people.</span></span></li>
          <li><span><b>Prioritise</b> · free<span class="how">In the Handoff panel, click <span class="tut-pill">Low</span> <span class="tut-pill">Medium</span> or <span class="tut-pill">High</span>. You can change it as you learn more.</span></span></li>
          <li><span><b>Guide</b> · ${COST.guidance} min<span class="how">Press <span class="tut-pill">Give a next step</span> and click one. Some reports need this straight away, before you finish asking.</span></span></li>
          <li><span><b>Hand off</b> · ${COST.handoff} min<span class="how">Mark each point <span class="tut-pill">Confirmed</span> or <span class="tut-pill">Unresolved</span>, then press <span class="tut-pill">Assign analyst (Name)</span> or <span class="tut-pill">Close with guidance only</span>.</span></span></li>
        </ol>
        <p class="tut-note">${INFO}<span>If both analysts are busy, <span class="tut-pill">Wait</span> moves the clock to the next event. <span class="tut-pill">Recall analyst and reopen</span> or <span class="tut-pill">Reopen report</span> (${COST.reopen} min) lets you change a handoff. <span class="tut-pill">End shift</span> (top right) stops early; open reports then score nothing.</span></p>`,
    },
    {
      title: "How time works",
      body: `
        <p>The clock moves only when you act: a question ${COST.ask} min, a next step ${COST.guidance} min, a handoff ${COST.handoff} min. Setting a priority and marking points are free. Reports arrive during the shift, and a person left too long without a safe step may act on their own.</p>
        <p>A made-up example (not one of the shift's reports):</p>
        <div class="tut-ex">
          <div class="row"><span class="tag">Sam, Sales</span><span class="then">"A pop-up says I must install a video codec to join my call."</span></div>
          <div class="row"><span class="tag">Ask</span><span class="then">"Have you installed anything yet?"</span><span class="arrow">→</span><span class="tag ok">Evidence: nothing installed</span></div>
          <div class="row"><span class="tag">Guide</span><span class="then">"Close the pop-up. Don't install it."</span><span class="arrow">→</span><span class="then">Sam is safe while you keep asking.</span></div>
          <div class="row"><span class="tag">Ask</span><span class="then">"What kind of laptop is it?"</span><span class="arrow">→</span><span class="tag hot">No new information</span><span class="then">2 minutes gone.</span></div>
          <div class="row"><span class="tag">Hand off</span><span class="then">"Nothing installed": Confirmed. "Where the pop-up came from": Unresolved, nobody has checked it.</span></div>
        </div>
        <p class="tut-muted">Confirmed means a recorded answer settles the point. Unresolved means it is still an open question for whoever picks the case up.</p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Evidence <small>25</small></b>Key facts recorded. Each question that added nothing costs 3 (up to 9).</div>
          <div><b>Priority <small>25</small></b>The right level, set when a recorded fact supports it. Right but unsupported: 15. One level off: 8.</div>
          <div><b>Guidance <small>25</small></b>Your last step is safe and approved. Less if an unhelpful step came first or harm was done.</div>
          <div><b>Handoff <small>25</small></b>The right owner (10) and each point marked to match your evidence (15).</div>
        </div>
        <p>Each report scores out of 100, and the shift score is the average of the ${reports}. Response time is shown in the debrief but is not part of the score. Closing everything, or escalating everything, does not score well.</p>
        ${replay ? `<p class="tut-note">${INFO}<span>${def.label}: new order, new details. Do not assume the same report is the false alarm.</span></p>` : ""}
        <div class="tut-settings">
          <label class="tut-check"><input type="checkbox" id="opt-sound" /> Sound</label>
          <label class="tut-check"><input type="checkbox" id="opt-motion" /> Motion</label>
          <label class="tut-check"><input type="checkbox" id="opt-large" /> Larger text</label>
          <label class="tut-check"><input type="checkbox" id="opt-hints" /> Hints</label>
        </div>`,
    },
  ];
}

const SETTING_IDS: Record<keyof Settings, string> = { sound: "opt-sound", motion: "opt-motion", largeText: "opt-large", hints: "opt-hints" };

export function bindSettings(root: HTMLElement, settings: Settings, set: (key: keyof Settings, value: boolean) => void): void {
  for (const key of Object.keys(SETTING_IDS) as (keyof Settings)[]) {
    const input = root.querySelector<HTMLInputElement>(`#${SETTING_IDS[key]}`);
    if (!input) continue;
    input.checked = settings[key];
    input.addEventListener("change", () => set(key, input.checked));
  }
}

type NextInput = Readonly<{ def: ShiftDef; state: ShiftState; current: CaseState | null; seen: readonly string[]; mode: "ask" | "guide" }>;

const caseSel = (c: CaseState) => `[data-case="${c.id}"]`;

// Method only: what to press now, never which priority, step or owner is right.
export function nextStep({ def, state, current, seen, mode }: NextInput): NextStep {
  if (state.phase === "ended") {
    return { label: "Done", tone: "ready", text: "Shift over. Press <strong>Review the outcome</strong> to see what your choices did.", targets: [".cd-end .cd-btn"] };
  }
  const key = (c: CaseState) => state.cases.indexOf(c) + 1;
  const who = (c: CaseState) => scenarioOf(def, c.id).reporter.first;
  const open = state.cases.filter((c) => c.status === "open");
  const waiting = open.filter((c) => !seen.includes(c.id) && c.id !== current?.id);
  const waitingHint = waiting.length ? `New report from ${who(waiting[0])} waiting on the left (press ${key(waiting[0])}).` : undefined;
  const openOther = (c: CaseState, before = "") => ({
    text: `${before}Open ${who(c)}'s report: click it under <strong>Incoming reports</strong>, or press <kbd>${key(c)}</kbd>.`,
    targets: [caseSel(c)],
  });

  if (!current) {
    const next = waiting[0] ?? open[0];
    return next ? { ...openOther(next), hint: "You do not know yet how urgent it is." } : { text: "Nothing is open right now. Watch Incoming reports for the next one." };
  }

  const sc = scenarioOf(def, current.id);
  const name = sc.reporter.first;

  if (current.status !== "open") {
    const analyst = state.analysts.find((a) => a.id === current.handoff?.analystId);
    const status =
      current.status === "assigned" ? `${analyst?.name ?? "The analyst"} has this case until ${clockLabel(def, current.handoff?.endsAt ?? 0)}. ` : current.handoff?.route === "guidance" ? "You closed this report with guidance. " : "This case is finished. ";
    const next = waiting[0] ?? open.find((c) => c.id !== current.id);
    const reopen = current.status === "assigned" ? "Recall analyst and reopen" : "Reopen report";
    const hint = current.status === "resolved" && current.handoff?.route !== "guidance" ? undefined : `To change this handoff, press ${reopen} (${COST.reopen} min).`;
    return next ? { ...openOther(next, status), hint } : { text: `${status}Nothing else is open.`, hint };
  }

  const pick = (want: "ask" | "guide") => (mode === want ? [".cd-choices"] : [`[data-mode="${want}"]`]);
  const pressMode = (want: "ask" | "guide") => (mode === want ? "" : ` press <strong>${want === "ask" ? "Ask a question" : "Give a next step"}</strong>, then`);
  const last = current.guidanceLog[current.guidanceLog.length - 1];
  const lastQuality = last ? guidanceOf(sc, last.id).quality : null;

  // Mistakes the game has already shown on screen: point back at them.
  if (lastQuality && lastQuality !== "correct") {
    return {
      tone: "warn",
      label: "Check",
      text: `Your last next step did not help ${name} (see the conversation). ${mode === "guide" ? "Choose a different one." : "Press <strong>Give a next step</strong> and choose a different one."}`,
      hint: "You can still correct it before you hand off.",
      targets: pick("guide"),
    };
  }
  if (current.harmedAt !== null && !last) {
    return {
      tone: "warn",
      label: "Check",
      text: `Things got worse for ${name} (see the conversation). Give a safe next step now:${pressMode("guide")} choose one.`,
      hint: "This case can still be recovered.",
      targets: pick("guide"),
    };
  }
  if (current.facts.length === 0) {
    if (current.priority !== null) {
      return {
        tone: "warn",
        label: "Check",
        text: `You set a priority with no evidence recorded. Ask ${name} a question first; you can change the priority afterwards.`,
        targets: pick("ask"),
      };
    }
    if (current.asked.length === 0 && current.guidanceLog.length === 0) {
      return {
        text: `Ask ${name} a question: ${mode === "ask" ? "click one" : "press <strong>Ask a question</strong>, then click one"} (${COST.ask} min each).`,
        hint: `If ${name} might do something risky while you ask, press Give a next step first.`,
        targets: pick("ask"),
      };
    }
    return {
      text: `No evidence recorded yet. Ask ${name} another question:${pressMode("ask")} pick one that tells you what is really going on.`,
      hint: "Useful answers appear under Evidence recorded on the right.",
      targets: pick("ask"),
    };
  }
  if (current.priority === null) {
    return {
      text: "Set a priority in the Handoff panel: <strong>Low</strong>, <strong>Medium</strong> or <strong>High</strong>.",
      hint: `Choose what your evidence (${current.facts.length} fact${current.facts.length === 1 ? "" : "s"}) supports. Ask more first if it does not yet show how serious this is.`,
      targets: [".cd-prio-seg"],
    };
  }
  if (current.guidanceLog.length === 0) {
    return {
      text: `Give ${name} a next step:${pressMode("guide")} click one (${COST.guidance} min).`,
      hint: waitingHint ?? "Pick the approved step that keeps them safe.",
      targets: pick("guide"),
    };
  }
  const unmarked = sc.claims.filter((claim) => current.claims[claim.id] === undefined).length;
  if (unmarked > 0) {
    return {
      text: `Under <strong>Do you hold evidence on each point?</strong>, mark each point <strong>Confirmed</strong> or <strong>Unresolved</strong>. ${unmarked} left.`,
      hint: "Confirmed only when a recorded answer settles it. Otherwise Unresolved.",
      targets: [".cd-claims"],
    };
  }
  const allBusy = state.analysts.every((a) => a.busyUntil > state.clock);
  if (allBusy) {
    return {
      label: "Ready",
      tone: "ready",
      text: `Hand off: both analysts are busy. Press <strong>Close with guidance only</strong> if this case needs no analyst, or <strong>Wait</strong> (until ${clockLabel(def, nextEventTime(def, state))}) for one to come free.`,
      hint: waitingHint,
      targets: [".cd-actions"],
    };
  }
  return {
    label: "Ready",
    tone: "ready",
    text: "Hand off: press <strong>Assign analyst</strong> if this case needs an analyst, or <strong>Close with guidance only</strong> if it does not.",
    hint: waitingHint ?? "You can change the priority or the marks before you hand off.",
    targets: [".cd-actions"],
  };
}
