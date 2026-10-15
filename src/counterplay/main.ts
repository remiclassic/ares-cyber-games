import "../ui/practice.css";
import "./style.css";
import { setSoundEnabled } from "../ui/audio";
import { $, loadSettings, saveSettings, showModal } from "../ui/dom";
import { SCENARIO } from "./data/scenario";
import { ACTIVITY_ID, createCounterplayHost } from "./host";
import { techniqueOf } from "./sim/engine";
import { renderDebrief } from "./ui/debrief";
import { CounterplayGame } from "./ui/game";
import { ICONS, LOGO } from "./ui/icons";

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

const host = createCounterplayHost();
const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? Math.random().toString(36).slice(2, 8);
let attempt = 0;
const started = performance.now();

$("#logo").innerHTML = LOGO;
$("#tip-icon").innerHTML = ICONS.cards;

function show(screen: "game" | "debrief"): void {
  $("#game").hidden = screen !== "game";
  $("#debrief").hidden = screen !== "debrief";
  window.scrollTo(0, 0);
}

const game = new CounterplayGame(SCENARIO, host, (state) => {
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
    learningEvidence: state.records.flatMap((record) => {
      const incident = SCENARIO.incidents.find((entry) => entry.id === record.incidentId)!;
      return record.hands.map((hand) => ({ incidentId: record.incidentId, technique: hand.technique, named: hand.identified ?? "", correct: hand.identified === techniqueOf(incident, hand.technique).name }));
    }),
    incidents: state.records,
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
    kicker: `${SCENARIO.org} · On call`,
    title: SCENARIO.title,
    wide: true,
    body: `
      <p>You are the responder on call this week. Three incidents, each played as a duel: the actor plays technique cards face down, and all you see is the <strong>telemetry</strong> each one leaves behind.</p>
      <ol class="brief-steps">
        <li>${ICONS.terminal}<span><strong>Read the telemetry.</strong> A real-looking log line from the mail gateway, identity provider, EDR, file server or cloud audit trail.</span></li>
        <li>${ICONS.eye}<span><strong>Name the technique.</strong> Three options, two of them look-alikes: benign activity or a neighbouring technique.</span></li>
        <li>${ICONS.cards}<span><strong>Play a response card</strong> from the incident toolkit. A <em>counter</em> scores for you, a <em>miss</em> scores for the actor, a <em>partial</em> scores for nobody. Each card works once per incident. First to ${SCENARIO.target} wins.</span></li>
      </ol>
      <p class="note">${ICONS.shield}<span>Scored on naming the technique, choosing the best card you still had, and the outcome. There is no timer.</span></p>
      ${retry ? `<p class="note">${ICONS.retry}<span>Retry: same incidents, different hosts, users, addresses and option order.</span></p>` : ""}
      <label class="check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
      <label class="check"><input type="checkbox" id="opt-large" ${settings.largeText ? "checked" : ""} /> Larger text</label>`,
    actions: [{ label: retry ? "Deal again" : "Take the first incident", primary: true, onClick: () => document.querySelector<HTMLElement>("#telemetry")?.focus() }],
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
