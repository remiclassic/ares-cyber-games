import "../ui/practice.css";
import "./style.css";
import { setSoundEnabled } from "../ui/audio";
import { $, esc, loadSettings, saveSettings, showModal } from "../ui/dom";
import { SCENARIO } from "./data/scenario";
import { ACTIVITY_ID, createBlastHost } from "./host";
import { renderDebrief } from "./ui/debrief";
import { BlastGame } from "./ui/game";
import { ICONS, LOGO } from "./ui/icons";

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

const host = createBlastHost();
const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? Math.random().toString(36).slice(2, 8);
let attempt = 0;
const started = performance.now();

$("#logo").innerHTML = LOGO;
$("#tip-icon").innerHTML = ICONS.logic;

function show(screen: "game" | "debrief"): void {
  $("#game").hidden = screen !== "game";
  $("#debrief").hidden = screen !== "debrief";
  window.scrollTo(0, 0);
}

const game = new BlastGame(SCENARIO, host, (state) => {
  show("debrief");
  const summary = renderDebrief(state, { retry: () => briefing(true) });
  host.complete({
    activityId: ACTIVITY_ID,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: Math.round((performance.now() - started) / 1000),
    seed: state.seed,
    attempt: state.attempt,
    score: summary,
    learningEvidence: state.records.filter((record) => record.check).map((record) => ({ caseId: record.caseId, question: record.check!.question, correct: !!record.answer?.correct })),
    cases: state.records,
  });
  $("#debrief-title").focus();
});

function briefing(retry = false): void {
  if (retry) {
    attempt += 1;
    host.record({ verb: "retried", object: SCENARIO.id, result: { attempt } });
  }
  show("game");
  game.start(seed, attempt);
  showModal({
    kicker: `${SCENARIO.org} · Incident briefing`,
    title: SCENARIO.title,
    wide: true,
    body: `
      <p>Overnight, the <strong>svc-backup</strong> service account was used from an unknown address. Threat intel now links <strong>cdn-update.example</strong> to the same actor. Any host that ${esc(SCENARIO.indicator)} is under the attacker's control.</p>
      <p>Your job is to <strong>scope before you contain</strong>: find which hosts are compromised, isolate those, and keep the clean ones running.</p>
      <ol class="brief-steps">
        <li>${ICONS.dns}<span><strong>Read the sensors.</strong> DNS forwarders, proxy pools and network sensors count how many hosts behind them show the indicator, but not which ones. ${SCENARIO.costs.readSensor} case minutes each.</span></li>
        <li>${ICONS.search}<span><strong>Triage where it counts.</strong> A host triage confirms one host but takes ${SCENARIO.costs.triage} minutes. You cannot triage everything.</span></li>
        <li>${ICONS.isolate}<span><strong>Decide every host.</strong> Isolate, Keep online, or Watch, then close the case.</span></li>
      </ol>
      <p class="note">${ICONS.shield}<span>The score is decision quality: containment, continuity and whether your evidence supports each call. A right guess earns less than a right deduction. Time is shown but never scored.</span></p>
      ${retry ? `<p class="note">${ICONS.retry}<span>Retry: same networks, different truth. The counts will not match last time.</span></p>` : ""}
      <label class="check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
      <label class="check"><input type="checkbox" id="opt-large" ${settings.largeText ? "checked" : ""} /> Larger text</label>`,
    actions: [{ label: retry ? "Start again" : "Start case 1", primary: true, onClick: () => $("#casefile").querySelector<HTMLElement>("h2")?.focus() }],
    onMount: (root) => {
      root.querySelector<HTMLInputElement>("#opt-sound")!.addEventListener("change", (event) => {
        settings.sound = (event.target as HTMLInputElement).checked;
        saveSettings(settings);
        setSoundEnabled(settings.sound);
      });
      root.querySelector<HTMLInputElement>("#opt-large")!.addEventListener("change", (event) => {
        settings.largeText = (event.target as HTMLInputElement).checked;
        saveSettings(settings);
      });
    },
  });
}

briefing();
