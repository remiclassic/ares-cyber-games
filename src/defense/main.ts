import "../ui/practice.css";
import "./style.css";
import { setSoundEnabled } from "../ui/audio";
import { $, loadSettings, saveSettings, showModal } from "../ui/dom";
import { SCENARIO } from "./data/scenario";
import { ACTIVITY_ID, createDefenseHost } from "./host";
import { renderDebrief } from "./ui/debrief";
import { DefenseGame } from "./ui/game";
import { ICONS, LOGO } from "./ui/icons";

const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

const host = createDefenseHost();
const params = new URLSearchParams(location.search);
const seed = params.get("seed") ?? Math.random().toString(36).slice(2, 8);
let attempt = 0;
const started = performance.now();

$("#logo").innerHTML = LOGO;
$("#tip-icon").innerHTML = ICONS.layers;

function show(screen: "game" | "debrief"): void {
  $("#game").hidden = screen !== "game";
  $("#debrief").hidden = screen !== "debrief";
  window.scrollTo(0, 0);
}

const game = new DefenseGame(SCENARIO, host, () => settings.reducedMotion, (state) => {
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
    learningEvidence: state.records.filter((record) => record.check).map((record) => ({ waveId: record.waveId, question: record.check!.question, correct: !!record.answer?.correct })),
    waves: state.records,
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
    kicker: `${SCENARIO.org} · Security planning`,
    title: SCENARIO.title,
    wide: true,
    body: `
      <p>Three crews are working through the logistics sector this week. You have a limited budget, and the business has a limited appetite for disruption. Protect the <strong>${SCENARIO.crownJewels.toLowerCase()}</strong>.</p>
      <ol class="brief-steps">
        <li>${ICONS.intel}<span><strong>Read the intel.</strong> Each campaign has to pass five stages, from initial access to impact. The board shows what each actor will try at each stage, in order of preference.</span></li>
        <li>${ICONS.layers}<span><strong>Deploy controls.</strong> Each one blocks, detects or helps you recover from specific techniques. It costs credits and may add friction for the business. Controls stay in service for the rest of the week.</span></li>
        <li>${ICONS.play}<span><strong>Run the wave.</strong> Watch each campaign move through the stages. Then answer one question about what would happen if a control failed.</span></li>
      </ol>
      <p class="note">${ICONS.block}<span>Scored on outcome (damage, footholds included), depth (would each stop survive one control failing?) and friction. There is no timer.</span></p>
      ${retry ? `<p class="note">${ICONS.retry}<span>Retry: the actors change some of their preferences. A plan that only matched last run's exact paths may not hold.</span></p>` : ""}
      <label class="check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>
      <label class="check"><input type="checkbox" id="opt-motion" ${settings.reducedMotion ? "checked" : ""} /> Reduce motion (show wave results at once)</label>
      <label class="check"><input type="checkbox" id="opt-large" ${settings.largeText ? "checked" : ""} /> Larger text</label>`,
    actions: [{ label: retry ? "Plan again" : "Start planning", primary: true, onClick: () => $("#intel").querySelector<HTMLElement>("h2")?.focus() }],
    onMount: (root) => {
      const bind = (id: string, key: "sound" | "reducedMotion" | "largeText") =>
        root.querySelector<HTMLInputElement>(id)!.addEventListener("change", (event) => {
          settings[key] = (event.target as HTMLInputElement).checked;
          saveSettings(settings);
          setSoundEnabled(settings.sound);
        });
      bind("#opt-sound", "sound");
      bind("#opt-motion", "reducedMotion");
      bind("#opt-large", "largeText");
    },
  });
}

briefing();
