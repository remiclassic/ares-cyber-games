import "./style.css";
import { setSoundEnabled } from "../ui/audio";
import { $, esc, loadSettings, saveSettings, showModal } from "../ui/dom";
import { BUSY_MORNING } from "./data/scenario";
import { ACTIVITY_ID, createTriageHost } from "./host";
import { renderDebrief } from "./ui/debrief";
import { TriageGame, clockText } from "./ui/game";
import { ICONS, LOGO } from "./ui/icons";

const scenario = BUSY_MORNING;
const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);

const host = createTriageHost();
let stopReplay: (() => void) | null = null;
let timed = true;
let runs = 0;

$("#logo").innerHTML = LOGO;
$("#tip-icon").innerHTML = ICONS.play;
$("#steps").innerHTML = `
  <span>${ICONS.review}Review evidence</span><i></i>
  <span>${ICONS.rank}Rank urgency</span><i></i>
  <span>${ICONS.explain}Explain your choices</span>`;

function show(screen: "game" | "debrief"): void {
  $("#game").hidden = screen !== "game";
  $("#debrief").hidden = screen !== "debrief";
  window.scrollTo(0, 0);
}

const game = new TriageGame(scenario, host, (state, wasTimed) => {
  show("debrief");
  const { summary, stop } = renderDebrief(state, wasTimed, { retry: () => briefing() });
  stopReplay = stop;
  host.complete({
    activityId: ACTIVITY_ID,
    completed: true,
    completedAt: new Date().toISOString(),
    durationSeconds: summary.seconds,
    timed: wasTimed,
    score: summary,
    rounds: state.rounds,
  });
  $("#debrief-title").focus();
});

function briefing(): void {
  stopReplay?.();
  stopReplay = null;
  if (runs > 0) host.record({ verb: "retried", object: scenario.id });
  runs += 1;
  show("game");
  game.start(timed);
  const budget = scenario.seconds.reduce((sum, seconds) => sum + seconds, 0);
  showModal({
    kicker: `Shift briefing · ${scenario.clock[0]}`,
    title: scenario.title,
    body: `
      <p>Six alerts are waiting and only <strong>${scenario.immediateCapacity} analysts</strong> can respond right now. A loud alert may be routine. A quiet one may sit on a critical system.</p>
      <ol class="brief-steps">
        <li>${ICONS.review}<span><strong>Review the evidence.</strong> Select an alert to see its timeline, the asset it affects, and how much confidence the evidence gives.</span></li>
        <li>${ICONS.rank}<span><strong>Rank urgency.</strong> Drag it to Immediate, Investigate, or Monitor, or press <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd>. Link alerts that are the same incident so they share one analyst.</span></li>
        <li>${ICONS.explain}<span><strong>Explain your choice.</strong> Pick the justification that best supports it, then submit.</span></li>
      </ol>
      <p>Two updates will arrive during the shift. When the evidence changes, revise.</p>
      <p class="note">${ICONS.clock}<span>Your score is decision quality. Speed is shown separately and never rewards a rushed guess.</span></p>
      <label class="check"><input type="checkbox" id="opt-timed" ${timed ? "checked" : ""} /> Timed shift (${esc(clockText(budget))} across three rounds)</label>
      <label class="check"><input type="checkbox" id="opt-sound" ${settings.sound ? "checked" : ""} /> Sound</label>`,
    actions: [{ label: "Start shift", primary: true, onClick: () => undefined }],
    onMount: (root) => {
      root.querySelector<HTMLInputElement>("#opt-timed")!.addEventListener("change", (event) => {
        timed = (event.target as HTMLInputElement).checked;
        game.setTimed(timed);
      });
      root.querySelector<HTMLInputElement>("#opt-sound")!.addEventListener("change", (event) => {
        settings.sound = (event.target as HTMLInputElement).checked;
        saveSettings(settings);
        setSoundEnabled(settings.sound);
      });
    },
  });
}

briefing();
