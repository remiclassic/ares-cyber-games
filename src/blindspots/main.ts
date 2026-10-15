import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings } from "../ui/dom";
import { addHelpButton, renderNextStep, showTutorial, type NextStep, type TutorialPage } from "../ui/tutorial";
import { BUDGET, NODES, PATHS, SENSORS } from "./data";
import { bestPlan, cost, evaluate, seenBy } from "./engine";

const ACTIVITY_ID = "ares-blind-spots/v0.1";
const post = (type: string, payload: unknown) => {
  if (window.parent !== window) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};
const settings = loadSettings();
saveSettings(settings);
setSoundEnabled(settings.sound);
$("#logo").innerHTML = `<svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><path d="M24 5 6 43h8l10-22 10 22h8L24 5Z" stroke="#38d6f5" stroke-width="2.6" stroke-linejoin="round"/><path d="m17 34 7-4 7 4" stroke="#38d6f5" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;

const EDGES: [string, string][] = [["internet", "mail"], ["internet", "vpn"], ["internet", "web"], ["mail", "ws"], ["ws", "proxy"], ["vpn", "dc"], ["proxy", "internet"], ["ws", "dc"], ["dc", "fs"], ["dc", "db"], ["web", "db"], ["db", "cloud"], ["fs", "proxy"], ["db", "proxy"]];
const PATH_COLORS = ["#ff8a65", "#c98bff", "#ffd166"];
let chosen: string[] = [];
let revealed = -1; // steps revealed across all paths during the run
let running = false;
const node = (id: string) => NODES.find((n) => n.id === id)!;
const totalSteps = PATHS.reduce((s, p) => s + p.steps.length, 0);

function renderCatalog(): void {
  const spent = cost(chosen);
  $("#status").innerHTML = `
    <div class="count"><strong>${spent}/${BUDGET}</strong><span>Budget</span></div>
    <div class="count"><strong>${chosen.length}</strong><span>Sensors</span></div>`;
  $("#catalog").innerHTML = `
    <div class="col-head"><h2>Sensors</h2><span class="phase-pill">${BUDGET - spent} left</span></div>
    <div class="d-scroll">
      <div class="budget"><i style="width:${(100 * spent) / BUDGET}%"></i></div>
      <ul class="sensors">${SENSORS.map((s) => {
        const on = chosen.includes(s.id);
        const afford = on || spent + s.cost <= BUDGET;
        return `<li><button class="sensor ${on ? "on" : ""}" data-sensor="${s.id}" aria-pressed="${on}" ${running || revealed >= 0 || !afford ? "disabled" : ""}>
          <span class="cost">${s.cost}</span><b>${esc(s.name)}</b><small>on ${esc(node(s.node).label)} · ${esc(s.detail)}</small></button></li>`;
      }).join("")}</ul>
      ${revealed < 0 ? `<button class="btn primary run" data-run ${chosen.length ? "" : "disabled"}>Run the red team</button>` : ""}
    </div>`;
  renderNext();
}

// The "Next" bar above the map: the one thing to do now, in the words on the buttons. It explains
// the scoring rule and reads back the budget; it never says which sensors to pick.
const EXITS = ["proxy", "cloud"];

function renderNext(): void {
  const bar = $("#next-step");
  const spent = cost(chosen);
  const left = BUDGET - spent;
  const affordable = SENSORS.filter((s) => !chosen.includes(s.id) && s.cost <= left);
  let step: NextStep;
  if (running) {
    step = {
      label: "Running",
      tone: "",
      text: `The red team is playing out ${PATHS.length} attack paths. <strong>Green dots</strong> with an eye were seen by one of your sensors; <strong>red numbered dots</strong> were missed.`,
    };
  } else if (revealed >= 0) {
    step = {
      label: "Done",
      tone: "ready",
      text: `Detection score <strong>${evaluate(chosen).total}/100</strong>. Compare each path card with the best plan shown below, then press <strong>Try another plan</strong> to change your sensors.`,
      hint: "Your sensors stay selected, so you can swap one or two and run again.",
      targets: ["[data-retry]"],
    };
  } else if (!chosen.length) {
    step = {
      text: `<strong>Click a sensor</strong> in the left list to place it. The yellow circle is its cost; you have <strong>${BUDGET} points</strong>.`,
      hint: "You will not see the attack paths until the run. Read what each sensor detects and ask where an attacker would have to pass.",
      targets: [".sensors"],
    };
  } else if (chosen.every((id) => EXITS.includes(SENSORS.find((s) => s.id === id)!.node))) {
    step = {
      label: "Check",
      tone: "warn",
      text: `Every sensor you picked watches the <strong>exits</strong>: they only see an attack on its way out, after the damage is done.`,
      hint: `Earlier sightings score more. You can still run with this plan${affordable.length ? `, or spend your other ${left} points first` : ""}.`,
      targets: affordable.length ? [".sensors"] : ["[data-run]"],
    };
  } else if (affordable.length) {
    step = {
      text: `<strong>${left} of ${BUDGET} points left</strong>, enough for another sensor. Click one to add it, or press <strong>Run the red team</strong> now.`,
      hint: "Each path scores up to 70 for being seen early and 30 more if it is seen at two or more steps. Click a chosen sensor again to remove it.",
      targets: [".sensors"],
    };
  } else {
    step = {
      label: "Ready",
      tone: "ready",
      text: `Budget spent: <strong>${spent} of ${BUDGET}</strong>, and nothing else fits. Press <strong>Run the red team</strong>.`,
      hint: "To change your plan first, click a chosen sensor to remove it.",
      targets: ["[data-run]"],
    };
  }
  renderNextStep(bar, step);
}

function renderMap(): void {
  const result = evaluate(chosen);
  let shown = revealed;
  const pathLines = PATHS.map((path, p) => {
    const stepsShown = Math.max(0, Math.min(path.steps.length, shown));
    shown -= path.steps.length;
    if (!stepsShown) return "";
    const pts = path.steps.slice(0, stepsShown).map((s, i) => {
      const n = node(s.node);
      return { x: n.x + (p - 1) * 1.6, y: n.y + (p - 1) * 2.4 + (i % 2 ? 1 : -1) * 0.6, seen: seenBy(s.id, chosen).length > 0 };
    });
    const origin = node("internet");
    const d = `M${origin.x} ${origin.y} ` + pts.map((pt) => `L${pt.x} ${pt.y}`).join(" ");
    return `<path d="${d}" class="atk" style="stroke:${PATH_COLORS[p]}"/>${pts.map((pt, i) => `<g class="dot ${pt.seen ? "seen" : "blind"}"><circle cx="${pt.x}" cy="${pt.y}" r="1.9"/><text x="${pt.x}" y="${pt.y + 0.8}">${pt.seen ? "👁" : i + 1}</text></g>`).join("")}`;
  }).join("");
  $("#mapwrap").innerHTML = `
    <svg class="map" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      ${EDGES.map(([a, b]) => `<line x1="${node(a).x}" y1="${node(a).y}" x2="${node(b).x}" y2="${node(b).y}"/>`).join("")}
      ${pathLines}
    </svg>
    ${NODES.map((n) => {
      const here = SENSORS.filter((s) => s.node === n.id && chosen.includes(s.id));
      return `<div class="node ${n.id === "internet" ? "inet" : ""}" style="left:${n.x}%;top:${n.y}%"><b>${esc(n.label)}</b>${here.map((s) => `<span class="eye" title="${esc(s.name)}">👁 ${esc(s.name)}</span>`).join("")}</div>`;
    }).join("")}`;
  $("#results").innerHTML =
    revealed < 0
      ? `<p class="muted">Pick sensors within the budget, then run the red team. Three attack paths will play out; you'll see which steps your sensors caught.</p>`
      : `<ul class="paths">${PATHS.map((path, p) => {
          const r = result.paths[p];
          return `<li style="--c:${PATH_COLORS[p]}"><b>${esc(path.name)}</b>
            <ol>${path.steps.map((s) => `<li class="${seenBy(s.id, chosen).length ? "seen" : "blind"}">${esc(s.label)}</li>`).join("")}</ol>
            <span>${r.first === null ? "Never detected." : `First seen at step ${r.first + 1} of ${path.steps.length}.`} ${r.detections >= 2 ? "Seen more than once." : r.detections === 1 ? "Only one sensor saw it." : ""} <em>${r.total}/100</em></span></li>`;
        }).join("")}</ul>`;
}

function render(): void {
  renderCatalog();
  renderMap();
}

function run(): void {
  running = true;
  revealed = 0;
  render();
  const tick = () => {
    revealed += 1;
    play("click");
    renderMap();
    if (revealed < totalSteps) window.setTimeout(tick, 420);
    else {
      running = false;
      finishRun();
    }
  };
  window.setTimeout(tick, 400);
}

function finishRun(): void {
  const result = evaluate(chosen);
  const best = bestPlan();
  play(result.total >= best.total - 5 ? "success" : "setback");
  announce(`Red team finished. Score ${result.total}.`);
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), score: result.total, best: best.total, sensors: chosen });
  $("#results").insertAdjacentHTML(
    "beforeend",
    `<div class="verdict"><h3>Detection score ${result.total}<small>/100</small></h3>
      <p>The best plan possible on this budget scores <b>${best.total}</b>: ${best.sensors.map((id) => esc(SENSORS.find((s) => s.id === id)!.name)).join(", ")}.</p>
      <p class="muted small">Seeing an attack early leaves time to respond; seeing it twice means one missed alert doesn't blind you. Watching only the exits catches thieves on the way out, after the damage is done.</p>
      <button class="btn primary" data-retry>Try another plan</button></div>`,
  );
  renderCatalog();
}

document.addEventListener("click", (event) => {
  const t = event.target as HTMLElement;
  const sensor = t.closest<HTMLElement>("[data-sensor]");
  if (sensor) {
    const id = sensor.dataset.sensor!;
    chosen = chosen.includes(id) ? chosen.filter((x) => x !== id) : [...chosen, id];
    play("click");
    render();
    document.querySelector<HTMLElement>(`[data-sensor="${id}"]`)?.focus();
    return;
  }
  if (t.closest("[data-run]")) return run();
  if (t.closest("[data-retry]")) {
    revealed = -1;
    render();
  }
});

// The first-time walkthrough: the job, the screen, the moves, a made-up example of the scoring
// rule, and how it is scored. Reopenable from the header.
const KICKER = "Blind Spots · How to play";

function tutorialPages(): TutorialPage[] {
  const costs = [...new Set(SENSORS.map((s) => s.cost))].sort((a, b) => a - b);
  const early = (first: number, steps: number) => Math.round(70 - (60 * first) / (steps - 1));
  return [
    {
      title: "Your mission",
      body: `
        <p class="tut-lead">Meridian Freight can afford <strong>${BUDGET} points</strong> of detection. You choose which sensors to buy and where they watch.</p>
        <p class="tut-lead">Then a red team (friendly attackers) runs <strong>${PATHS.length} attack paths</strong> through the network. You find out which of their steps your sensors saw, and how early.</p>
        <p class="tut-note"><span>You cannot afford to watch everything. The skill is spending a small budget where it catches attacks <strong>early</strong>, and catching each attack <strong>more than once</strong>, so one missed alert does not blind you.</span></p>`,
    },
    {
      title: "What is on the screen",
      body: `
        <div class="tut-legend">
          <div><span class="tut-ico disc" style="background:#f6b93b;color:#2a1a00">${costs[0]}</span><span><b>Sensors (left)</b>The yellow circle is the cost (${costs.join(" or ")} points). Under the name: where it sits and what it detects.</span></div>
          <div><span class="tut-ico box">▬</span><span><b>Budget bar</b>Points spent so far. Sensors you can no longer afford are greyed out.</span></div>
          <div><span class="tut-ico box">⌂</span><span><b>System map</b>Each box is part of the network. Attacks start at <b style="display:inline">Internet</b> (red border). A placed sensor shows as a green 👁 tag on its box.</span></div>
          <div><span class="tut-ico disc">1</span><span><b>After the run</b>Dashed coloured lines are the attack paths. A green 👁 dot was seen; a red numbered dot was missed.</span></div>
        </div>
        <p class="tut-muted">The attack paths stay hidden until you run the red team.</p>`,
    },
    {
      title: "Your moves",
      body: `
        <ol class="tut-moves">
          <li><span><b>Choose sensors</b><span class="how">Click a sensor to add it; click it again to remove it. Stay within ${BUDGET} points.</span></span></li>
          <li><span><b>Run</b><span class="how">Press <span class="tut-pill">Run the red team</span>. The paths play out step by step on the map.</span></span></li>
          <li><span><b>Read the result</b><span class="how">Under the map, one card per path: each step in green (seen) or red (missed), the path's score, and the best plan possible on this budget.</span></span></li>
          <li><span><b>Try again if you like</b><span class="how">Press <span class="tut-pill">Try another plan</span>. Your sensors stay selected so you can adjust them and run again.</span></span></li>
        </ol>`,
    },
    {
      title: "How a path is scored",
      body: `
        <p>A made-up path with 5 steps, not one of the real ones:</p>
        <div class="tut-ex">
          <div class="row"><span class="tag ok">First seen at step 1</span><span class="arrow">→</span><span><b>${early(0, 5)}</b> for early</span></div>
          <div class="row"><span class="tag">First seen at step 3</span><span class="arrow">→</span><span><b>${early(2, 5)}</b></span></div>
          <div class="row"><span class="tag">First seen at the last step</span><span class="arrow">→</span><span><b>${early(4, 5)}</b></span></div>
          <div class="row"><span class="tag hot">Never seen</span><span class="arrow">→</span><span><b>0</b></span></div>
          <div class="row"><span class="then">Plus</span><span class="tag sensor">+30 if seen at two or more steps</span></div>
        </div>
        <p class="tut-note"><span>One sensor can see steps on more than one path. A higher cost does not mean a better sensor: think about where each attack has to pass, and how early.</span></p>`,
    },
    {
      title: "How you are scored",
      body: `
        <div class="tut-score">
          <div><b>Early <small>70</small></b>Per path: 70 if seen at its first step, falling to 10 at its last step; 0 if never seen.</div>
          <div><b>Seen twice <small>30</small></b>Per path: if your sensors saw it at two or more steps.</div>
          <div><b>Final <small>100</small></b>The average of the ${PATHS.length} paths.</div>
        </div>
        <p>After the run you also see the best score possible on this budget, and which sensors get it.</p>
        <p class="tut-muted">How fast you play is never scored.</p>
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

addHelpButton(() => {
  if ($("#game").hidden) return;
  showTutorial({ kicker: KICKER, pages: tutorialPages(), startLabel: "Back to the game", midGame: true, onStart: () => {}, onLastPage: bindSettings });
});

render();
showTutorial({
  kicker: KICKER,
  pages: tutorialPages(),
  startLabel: "Open the map",
  onStart: () => document.querySelector<HTMLElement>("[data-sensor]")?.focus(),
  onLastPage: bindSettings,
});
