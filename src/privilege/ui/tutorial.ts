import type { NextStep, TutorialPage } from "../../ui/tutorial";
import { MODEL_RULES, PUZZLES } from "../data/puzzles";
import { POINTS } from "../sim/scoring";
import type { Check, Puzzle, VerifyReport, ViewEdge } from "../sim/types";
import type { Selection } from "./Graph";
import type { Stage, TestState } from "./App";

// First-time walkthrough and live "Next" bar for Privilege Path Puzzle.

const svg = (body: string) => `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;
const ICON = {
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7z"/>'),
  group: svg('<circle cx="12" cy="8" r="3.2"/><circle cx="5" cy="10" r="2.4"/><circle cx="19" cy="10" r="2.4"/><path d="M6.5 20c0-3.3 2.4-5.5 5.5-5.5s5.5 2.2 5.5 5.5z"/>'),
  folder: svg('<path d="M2 6.5C2 5.1 3.1 4 4.5 4h4.7l2.3 2.5h8C20.9 6.5 22 7.6 22 9v8.5c0 1.4-1.1 2.5-2.5 2.5h-15A2.5 2.5 0 012 17.5z"/>'),
  info: svg('<path d="M12 2a10 10 0 100 20 10 10 0 000-20zm-1 8h2v8h-2zm0-4h2v2h-2z"/>'),
};

export function tutorialPages(retry: boolean): TutorialPage[] {
  const budgets = PUZZLES.map((p) => p.budget).join(", ");
  const maxPerCheck = POINTS.prediction;
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">In each of ${PUZZLES.length} puzzles, someone can open or change something they should not. Your job is to find out <strong>why</strong>, and fix it.</p>
        <ol class="tut-moves">
          <li><span><b>Trace the access.</b><span class="how">Work out which memberships and grants let the person in.</span></span></li>
          <li><span><b>Make the smallest change that removes it.</b><span class="how">Each puzzle gives you a small change budget (${budgets} changes).</span></span></li>
          <li><span><b>Keep the work going.</b><span class="how">People who need access must still have it after your fix.</span></span></li>
        </ol>
        <p class="tut-note">${ICON.info}<span>Signing in only proves who someone is. It never grants anything. Access comes only from grants.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico disc">${ICON.user}</span><span><b>Users</b>People and service accounts, on the left of the map.</span></div>
          <div><span class="tut-ico disc">${ICON.group}</span><span><b>Groups</b>A user holds everything granted to every group they are in.</span></div>
          <div><span class="tut-ico disc">${ICON.folder}</span><span><b>Resources</b>Folders, files and systems. A red ring marks the sensitive one.</span></div>
          <div><span class="tut-ico box" style="color:#38d6ff">→</span><span><b>Member of</b> (cyan line) A user or group is a member of a group. Groups can be nested.</span></div>
          <div><span class="tut-ico box" style="color:#5dffb0">→</span><span><b>Read · Write</b> (green line) A grant: that group may do these actions on the resource.</span></div>
          <div><span class="tut-ico box" style="color:#8fa3c8">→</span><span><b>Contains</b> A folder holds the item. Grants on the folder also cover it.</span></div>
          <div><span class="tut-ico box">✕</span><span><b>Not a permission</b> Lines like "Reports to". They grant nothing.</span></div>
        </div>
        <p class="tut-muted">Around the map: the scenario and <strong>Objective</strong> at the top, <strong>Permission Inspector</strong> and <strong>Access test</strong> on the right, and the <strong>Access checks</strong> you must satisfy at the bottom. Each check says "Must be allowed" or "Must be denied".</p>`,
    },
    {
      title: "How access is decided",
      body: `
        <ol class="tut-moves">${MODEL_RULES.map((rule) => `<li><span>${rule}</span></li>`).join("")}</ol>
        <p>A made-up example (not one of the puzzles):</p>
        <div class="tut-ex">
          <div class="row"><span class="tag">Riley</span><span class="arrow">→ Member of →</span><span class="tag">Interns</span><span class="arrow">→ Member of →</span><span class="tag">Marketing</span><span class="arrow">→ Read →</span><span class="tag">Brand Assets</span><span class="arrow">→ Contains →</span><span class="tag">logo.svg</span></div>
          <div class="row"><span class="then">Can Riley read logo.svg?</span><span class="tag ok">Allowed</span><span class="then">through the nested group and the folder.</span></div>
          <div class="row"><span class="then">Can Riley change logo.svg?</span><span class="tag hot">Denied</span><span class="then">the only grant covers Read, not Write.</span></div>
          <div class="row"><span class="then">Riley "Reports to" a designer with Write access?</span><span class="then">Changes nothing: that line is not a permission.</span></div>
        </div>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Pick a check</b><span class="how">Click one of the <span class="tut-pill">Access checks</span> at the bottom. The <span class="tut-pill">Access test</span> panel on the right asks the same question.</span></span></li>
          <li><span><b>Predict, then watch</b><span class="how">Press <span class="tut-pill">Allowed</span> or <span class="tut-pill">Denied</span> under "Predict first". That runs the test: green lines show a route that grants the action, amber lines show memberships followed that led to no grant. <span class="tut-pill">Test access</span> traces again without a prediction.</span></span></li>
          <li><span><b>Inspect</b><span class="how">Click a person, group or resource, or a line's label (<span class="tut-pill">Member of</span>, <span class="tut-pill">Read · Write</span>), to see it in <span class="tut-pill">Permission Inspector</span>. <span class="tut-pill">Access rules</span> there repeats the rules. Drag the background to pan; <kbd>+</kbd> <kbd>−</kbd> at the bottom left zoom.</span></span></li>
          <li><span><b>Change</b><span class="how">With a label selected: <span class="tut-pill">Remove membership</span>, or narrow a grant (change <span class="tut-pill">Granted to</span>, untick Read or Write, or <span class="tut-pill">Remove grant</span>). Each edited line is one change. <span class="tut-pill">Undo</span> under "Your changes" gives it back.</span></span></li>
          <li><span><b>Re-test, then verify</b><span class="how">Test every check again, then press <span class="tut-pill">Verify fix</span>. If every check passes, press <span class="tut-pill">Explain what happened</span> and pick the reason.</span></span></li>
        </ol>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Solved <small>+${POINTS.solve}</small></b>Every check meets its requirement after your changes.</div>
          <div><b>Minimal fix <small>+${POINTS.minimal}</small></b>No more changes than the puzzle needs. Otherwise +${POINTS.withinBudget} for staying within budget.</div>
          <div><b>Predictions <small>+${maxPerCheck} each</small></b>Your first prediction on each check, if right.</div>
          <div><b>Explanation <small>+${POINTS.explanation}</small></b>The right reason on your first pick.</div>
          <div><b>Failed verify <small>−${POINTS.failedVerify}</small></b>Each time Verify fix finds a failing check. Never takes you below the solve award.</div>
        </div>
        <p class="tut-muted">There is no clock. Re-test before you verify: it is free, a failed Verify fix is not.</p>
        ${retry ? `<p class="tut-note">${ICON.info}<span>Same ${PUZZLES.length} puzzles, fresh score. Your earlier predictions do not carry over.</span></p>` : ""}`,
    },
  ];
}

type NextInput = Readonly<{
  puzzle: Puzzle;
  view: readonly ViewEdge[];
  stage: Stage;
  report: VerifyReport | null;
  picks: readonly string[];
  test: TestState | null;
  active: Check;
  tested: Readonly<Record<string, boolean>>;
  predictions: Readonly<Record<string, unknown>>;
  selection: Selection;
  used: number;
  isLast: boolean;
  checkText: (check: Check) => string;
}>;

const need = (check: Check) => (check.expect === "allow" ? "allowed" : "denied");
const checkSel = (check: Check) => `[data-check="${check.id}"]`;

// Method only: says what to press and what to look at, never which relationship to change.
export function nextStep(input: NextInput): NextStep {
  const { puzzle, stage, report, picks, test, active, tested, predictions, selection, used, checkText } = input;
  const label = (check: Check) => `<strong>${checkText(check)}</strong>`;

  if (stage === "summary") {
    return { label: "Done", tone: "ready", text: `Puzzle solved. Read the takeaway, then press <strong>${input.isLast ? "Finish" : "Next puzzle"}</strong>.`, targets: [".modal .btn.primary"] };
  }
  if (stage === "explain") {
    const right = picks.some((id) => puzzle.explain.options.find((o) => o.id === id)?.correct);
    if (right) return { label: "Done", tone: "ready", text: "That is the reason. Press <strong>See results</strong>.", targets: [".modal .btn.primary"] };
    return picks.length === 0
      ? { text: "Pick the option that explains the unintended access.", hint: `Only your first pick earns the +${POINTS.explanation}. Think back to the route the test lit up.`, targets: [".modal .options"] }
      : { tone: "warn", label: "Check", text: "Not that one. Read the feedback under it, then pick again.", targets: [".modal .options"] };
  }
  if (stage === "report" && report) {
    if (report.solved) return { label: "Done", tone: "ready", text: "Fix verified: every check passes. Press <strong>Explain what happened</strong>.", targets: [".modal .btn.primary"] };
    const failing = report.results.filter((r) => !r.pass).length;
    return {
      tone: "warn",
      label: "Check",
      text: `${failing} check${failing === 1 ? "" : "s"} still fail${failing === 1 ? "s" : ""} (marked ✕ in the table). Press <strong>Back to the map</strong> and adjust your changes.`,
      hint: `Each failed Verify fix costs ${POINTS.failedVerify} points. Testing a check first is free.`,
      targets: [".modal .btn.primary"],
    };
  }

  if (test && !test.done) {
    return {
      label: "Running",
      text: `Tracing ${label(active)} on the map…`,
      hint: "Green lines are a route that grants the action. Amber lines are memberships followed that led to no grant.",
    };
  }

  const checks = puzzle.checks;
  const untested = checks.filter((c) => tested[c.id] === undefined);
  const unmet = checks.filter((c) => tested[c.id] !== undefined && tested[c.id] !== (c.expect === "allow"));
  const unpredicted = checks.filter((c) => !predictions[c.id]);
  const runOrPredict = (check: Check) =>
    predictions[check.id] ? "press <strong>Test access</strong>" : "press <strong>Allowed</strong> or <strong>Denied</strong> under Access test to predict and test it";
  const runTargets = (check: Check) => (predictions[check.id] ? [".dock-actions .btn.blue"] : [".predict"]);

  if (used === 0) {
    if (!predictions[active.id] && tested[active.id] === undefined) {
      return {
        text: `Predict ${label(active)}: press <strong>Allowed</strong> or <strong>Denied</strong> in the Access test panel. Your answer runs the test.`,
        hint: `Work it out on the map first: follow the Member of lines from the user, then look for a grant that covers the action. +${POINTS.prediction} if right.`,
        targets: [".predict"],
      };
    }
    if (unpredicted.length > 0) {
      const next = unpredicted[0];
      return { text: `Select the next check at the bottom, ${label(next)}, then predict it.`, hint: `${unpredicted.length} check${unpredicted.length === 1 ? "" : "s"} not predicted yet.`, targets: [checkSel(next)] };
    }
    const edge = selection?.type === "edge" ? input.view.find((e) => e.id === selection.id) : undefined;
    if (edge && (edge.kind === "member" || edge.kind === "grant")) {
      return {
        text:
          edge.kind === "member"
            ? "If this membership causes the unintended access, press <strong>Remove membership</strong> in Permission Inspector."
            : "If this grant causes the unintended access, narrow it in Permission Inspector: change <strong>Granted to</strong>, untick <strong>Read</strong> or <strong>Write</strong>, or press <strong>Remove grant</strong>.",
        hint: `Pick the change that still leaves every "Must be allowed" check working. Budget: ${puzzle.budget} change${puzzle.budget === 1 ? "" : "s"}.`,
        targets: [".editor"],
      };
    }
    if (edge) {
      return {
        text: edge.kind === "contains" ? "Where a file is stored is fixed here. Click a <strong>Member of</strong> or grant label instead." : "This line is not a permission and grants nothing. Click a <strong>Member of</strong> or grant label instead.",
      };
    }
    if (selection?.type === "node") {
      return { text: "People, groups and resources cannot be edited. Click a <strong>Member of</strong> or grant label on the map to inspect a relationship." };
    }
    return {
      text: "Find the cause: pick a check that does not meet its requirement, look at the route its test lit up, then click the labels on that route to inspect them.",
      hint: "An allowed result in Access test lists its route. Run a check again with Test access to light it up.",
    };
  }

  if (unmet.length > 0) {
    const bad = unmet[0];
    const allowedNow = tested[bad.id];
    return {
      tone: "warn",
      label: "Check",
      text: `${label(bad)} is ${allowedNow ? "still allowed" : "now denied"}, but it must be ${need(bad)}.`,
      hint:
        (allowedNow
          ? `Something still grants it. Select it and press Test access to see the route, then change that route, or press Undo under "Your changes".`
          : `Your change removed access that is needed. Press Undo under "Your changes", or try a narrower change.`) +
        (used >= puzzle.budget ? " Your change budget is used up: undo a change before making another." : ""),
      targets: [checkSel(bad), ...(!allowedNow || used >= puzzle.budget ? [".change-list"] : [])],
    };
  }
  if (untested.length > 0) {
    const next = untested.includes(active) ? active : untested[0];
    const selected = next.id === active.id;
    return {
      text: selected ? `Re-test after your change: for ${label(next)}, ${runOrPredict(next)}.` : `Re-test after your change: select ${label(next)} at the bottom, then test it.`,
      hint: `${untested.length} of ${checks.length} checks not tested since your last change. A failed Verify fix costs ${POINTS.failedVerify} points; testing is free.`,
      targets: selected ? runTargets(next) : [checkSel(next)],
    };
  }
  return { label: "Ready", tone: "ready", text: "Every check meets its requirement after your changes. Press <strong>Verify fix</strong>.", targets: [".dock-actions .btn.green"] };
}
