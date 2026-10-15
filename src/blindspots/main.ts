import "../ui/practice.css";
import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { $, announce, esc, loadSettings, saveSettings, showModal } from "../ui/dom";
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

render();
showModal({
  kicker: "Remix · Threat modelling",
  title: "Blind Spots",
  body: `<p>Meridian Freight can afford <strong>${BUDGET} points</strong> of detection. Place sensors on the system map, then a red team runs <strong>three attack paths</strong> through it.</p>
    <p>Each path scores on <strong>how early</strong> you first saw it, plus a bonus if <strong>two or more</strong> sensors saw it. After the run you'll see the best plan possible on this budget.</p>`,
  actions: [{ label: "Open the map", primary: true, onClick: () => document.querySelector<HTMLElement>("[data-sensor]")?.focus() }],
});
