import "./style.css";
import { play, setSoundEnabled } from "../ui/audio";
import { BACKDROP_SVG, CRAB_SVG, STAR_SVG, stickerSvg } from "./art";
import { COUNTERS, LEVELS, STICKERS, sticker } from "./data";
import { defencesFor, nextSpawn, recordMatch, recordMixup, rescue, revealUnknown, seeded, stars, startLevel, startingPile, tryMatch, type Progress } from "./engine";
import { bodyAt, step, type Body, type World } from "./physics";

// ---------- host contract (same shape as the other practices) ----------
const ACTIVITY_ID = "ares-secure-stack/islands/v0.1";
const embedded = window.parent !== window;
const post = (type: string, payload: unknown) => {
  if (embedded) window.parent.postMessage({ type: `ares:practice:${type}`, activityId: ACTIVITY_ID, payload }, "*");
};

const $ = (selector: string) => document.querySelector<HTMLElement>(selector)!;
const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const params = new URLSearchParams(location.search);
const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
setSoundEnabled(params.get("sound") !== "off");

// ---------- art ----------
const toUrl = (svg: string) => URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
const IMAGES = new Map<string, HTMLImageElement>();
const IMAGE_URLS = new Map<string, string>();
for (const def of STICKERS) {
  for (const stage of ["plain", "frozen"] as const) {
    const url = toUrl(stickerSvg(def, stage));
    const img = new Image();
    img.src = url;
    IMAGES.set(`${def.id}:${stage}`, img);
    IMAGE_URLS.set(`${def.id}:${stage}`, url);
  }
}
const STAR_URL = toUrl(STAR_SVG);
$("#backdrop").innerHTML = BACKDROP_SVG;
$("#crab").innerHTML = CRAB_SVG;

// ---------- state ----------
type Piece = { id: string; frozen: boolean; pop: number; wobble: number; hint: number; age: number };
type Particle = { x: number; y: number; vx: number; vy: number; life: number; color: string };

const canvas = $("#pile") as HTMLCanvasElement;
const ctx = canvas.getContext("2d")!;
let world: World = { width: 400, height: 600, bodies: [] };
const pieces = new Map<number, Piece>();
let particles: Particle[] = [];
let progress: Progress = startLevel(0);
let levelIndex = 0;
let rng = seeded(1);
let keySeq = 1;
let clock = 0;
let tideTimer = 0;
let dropQueue: string[] = [];
let dropTimer = 0;
let breach = 0;
let rescueTimer = 1;
let running = false;
let held: Body | null = null;
let heldFrom = { x: 0, y: 0, t: 0 };
let pointer = { x: 0, y: 0 };
let focusKey: number | null = null; // keyboard cursor
let liftedKey: number | null = null; // keyboard pick
let radius = 34;
let ropeY = 70;

const saved = (() => {
  try {
    return JSON.parse(localStorage.getItem("secure-stack:stars") ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
})();

function resize(): void {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(rect.width * dpr);
  canvas.height = Math.round(rect.height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const oldWidth = world.width;
  world.width = rect.width;
  world.height = rect.height;
  radius = Math.max(24, Math.min(40, rect.width * 0.083));
  ropeY = Math.max(56, rect.height * 0.12);
  for (const body of world.bodies) {
    body.r = radius;
    body.x = (body.x / oldWidth) * rect.width;
  }
}
window.addEventListener("resize", resize);

// ---------- level flow ----------
function startGame(index: number): void {
  levelIndex = index;
  progress = startLevel(index);
  rng = seeded(Date.now() % 100000);
  world.bodies = [];
  pieces.clear();
  particles = [];
  clock = 0;
  tideTimer = 0;
  breach = 0;
  held = null;
  focusKey = null;
  liftedKey = null;
  dropQueue = startingPile(progress.level, rng);
  dropTimer = 0;
  $("#map").hidden = true;
  $("#result").hidden = true;
  resize();
  renderHud();
  say(progress.level.tip, "info", 6);
  running = true;
  post("started", { level: progress.level.id });
}

function spawn(id: string, frozen = false): void {
  const key = keySeq++;
  const margin = radius + 4;
  world.bodies.push({ key, x: margin + rng() * (world.width - margin * 2), y: -radius * 1.5, vx: (rng() - 0.5) * 60, vy: 0, r: radius, angle: (rng() - 0.5) * 0.6, spin: (rng() - 0.5) * 2, held: false, restFor: 0 });
  pieces.set(key, { id, frozen, pop: 0, wobble: 0, hint: 0, age: 0 });
}

function idsInPile(): string[] {
  return world.bodies.map((body) => pieces.get(body.key)!.id);
}

function removeBody(body: Body): void {
  world.bodies = world.bodies.filter((entry) => entry !== body);
  pieces.delete(body.key);
}

// ---------- matching ----------
function attempt(a: Body, b: Body): void {
  const pa = pieces.get(a.key)!;
  const pb = pieces.get(b.key)!;
  if (pb.frozen && pb.id === "unknown") {
    fail(a, b, "Nobody knows what this alert is yet. Secure a threat right next to it to investigate it.");
    return;
  }
  const result = tryMatch(pa.id, pb.id);
  if (!result.ok) {
    fail(a, b, result.reason);
    return;
  }
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const { points, streak } = recordMatch(progress, result.threat, result.defence, clock);
  discover(result.threat, result.defence);
  burst(mx, my, 26);
  removeBody(a);
  removeBody(b);
  flyStar(mx, my, result.threat);
  floatText(mx, my, `+${points}`);
  play(streak > 1 ? "success" : "deliver");
  if (streak >= 2) callout(streak >= 4 ? "Super streak!" : "Streak!");
  // Investigate unknown alerts next to the match.
  for (const body of world.bodies) {
    const piece = pieces.get(body.key)!;
    if (piece.frozen && Math.hypot(body.x - mx, body.y - my) < radius * 3.4) {
      piece.frozen = false;
      piece.id = revealUnknown(progress.level, rng);
      piece.pop = 1;
      burst(body.x, body.y, 12, "#bfe9ff");
      dropQueue.push(defencesFor(progress.level, piece.id)[0]);
      say(`Investigated: that alert was ${sticker(piece.id).name.toLowerCase()}. ${result.reason}`, "good", 5);
      renderHud();
      return checkEnd();
    }
  }
  say(`<b>${esc(sticker(result.defence).name)} + ${esc(sticker(result.threat).name)}.</b> ${esc(result.reason)}`, "good", 4.5, true);
  renderHud();
  checkEnd();
}

function fail(a: Body, b: Body, reason: string): void {
  const pa = pieces.get(a.key)!;
  const pb = pieces.get(b.key)!;
  recordMixup(progress, pa.id, pb.id, reason);
  pa.wobble = 1;
  pb.wobble = 1;
  a.vy = -260;
  a.vx = (a.x < b.x ? -1 : 1) * 160;
  play("setback");
  say(esc(reason), "bad", 6);
  renderHud();
}

function checkEnd(): void {
  if (progress.phase !== "won") return;
  running = false;
  play("success");
  const earned = stars(progress);
  saved[progress.level.id] = Math.max(saved[progress.level.id] ?? 0, earned);
  try {
    localStorage.setItem("secure-stack:stars", JSON.stringify(saved));
  } catch {
    // Optional.
  }
  post("completed", { activityId: ACTIVITY_ID, completed: true, completedAt: new Date().toISOString(), level: progress.level.id, stars: earned, score: progress.score, matches: progress.matches, mixups: progress.mixups });
  window.setTimeout(showResult, reduceMotion ? 200 : 900);
}

function lose(): void {
  running = false;
  progress.phase = "lost";
  play("fail");
  post("statement", { at: new Date().toISOString(), verb: "failed", object: `level-${progress.level.id}`, result: { score: progress.score } });
  showResult();
}

// ---------- loop ----------
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  // On phones the guide is a drawer over the game, so the game waits while it is open.
  const guideCovers = $("#field-guide").classList.contains("open") && window.matchMedia("(max-width: 900px)").matches;
  if (running && !guideCovers) update(dt);
  draw();
  requestAnimationFrame(frame);
}

function update(dt: number): void {
  clock += dt;
  if (dropQueue.length) {
    dropTimer -= dt;
    if (dropTimer <= 0) {
      const id = dropQueue.shift()!;
      spawn(id, id === "unknown");
      dropTimer = 0.09;
    }
  } else if ((rescueTimer -= dt) <= 0) {
    // Never leave the player stuck: drop in a missing defence or goal threat.
    rescueTimer = 1;
    const needed = rescue(progress.level, idsInPile(), progress.goals, rng);
    if (needed.length) dropQueue.push(...needed);
  }
  if (!dropQueue.length && progress.level.tideSeconds > 0) {
    tideTimer += dt;
    if (tideTimer >= progress.level.tideSeconds) {
      tideTimer = 0;
      spawn(nextSpawn(progress.level, idsInPile(), rng));
      play("click");
    }
  }
  if (held) {
    held.vx = (pointer.x - held.x) / Math.max(dt, 0.001);
    held.vy = (pointer.y - held.y) / Math.max(dt, 0.001);
    held.x += (pointer.x - held.x) * Math.min(1, dt * 22);
    held.y += (pointer.y - held.y) * Math.min(1, dt * 22);
  }
  step(world, dt);
  for (const piece of pieces.values()) {
    piece.pop = Math.max(0, piece.pop - dt * 2.5);
    piece.wobble = Math.max(0, piece.wobble - dt * 1.6);
    piece.hint = Math.max(0, piece.hint - dt);
    piece.age += dt;
  }
  particles = particles.filter((p) => (p.life -= dt) > 0);
  for (const p of particles) {
    p.vy += 600 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
  // Breach: something settled above the rope.
  // Fresh drops fall through from above, so only stickers that have been on the board a while
  // and are no longer falling count; the tide keeps the pile jiggling, so "perfectly still" is
  // too strict.
  const over = !dropQueue.length && world.bodies.some((body) => !body.held && pieces.get(body.key)!.age > 2 && Math.abs(body.vy) < 160 && body.y - body.r * 0.5 < ropeY);
  breach = over ? breach + dt : Math.max(0, breach - dt * 2);
  $("#frame").classList.toggle("danger", breach > 0.2);
  if (breach > 2.5) lose();
}

function draw(): void {
  const w = world.width;
  const h = world.height;
  ctx.clearRect(0, 0, w, h);
  // The rope: anything resting above it is a breach.
  const danger = breach > 0.2;
  ctx.save();
  ctx.strokeStyle = danger ? "#ff4d5e" : "rgba(120, 72, 30, 0.75)";
  ctx.lineWidth = 4;
  ctx.setLineDash([14, 9]);
  ctx.beginPath();
  ctx.moveTo(0, ropeY);
  for (let x = 0; x <= w; x += 20) ctx.lineTo(x, ropeY + Math.sin(x / 30 + clock * 2) * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let x = w * 0.15; x < w; x += w * 0.35) {
    ctx.fillStyle = danger ? "#ff4d5e" : "#ff8c42";
    ctx.beginPath();
    ctx.arc(x, ropeY + Math.sin(x / 30 + clock * 2) * 2, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.fillRect(x - 7, ropeY - 2, 14, 4);
  }
  ctx.restore();
  // Stickers, held one on top.
  const order = [...world.bodies].sort((a, b) => Number(a.held) - Number(b.held));
  for (const body of order) {
    const piece = pieces.get(body.key)!;
    const img = IMAGES.get(`${piece.id}:${piece.frozen ? "frozen" : "plain"}`)!;
    const wob = piece.wobble ? Math.sin(piece.wobble * 30) * 0.25 * piece.wobble : 0;
    const scale = (body.held ? 1.15 : 1) * (1 + piece.pop * 0.25);
    const size = body.r * 2.3 * scale;
    ctx.save();
    ctx.translate(body.x, body.y);
    ctx.rotate(body.held ? 0 : body.angle + wob);
    if (piece.hint > 0) {
      ctx.strokeStyle = `rgba(255, 230, 80, ${0.5 + 0.5 * Math.sin(clock * 10)})`;
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.arc(0, 0, body.r * 1.25, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (body.key === focusKey || body.key === liftedKey) {
      ctx.strokeStyle = body.key === liftedKey ? "#2f74e6" : "#fde047";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.arc(0, 0, body.r * 1.2, 0, Math.PI * 2);
      ctx.stroke();
    }
    if (img.complete) ctx.drawImage(img, -size / 2, -size / 2, size, size * (136 / 132));
    ctx.restore();
  }
  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life * 2);
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 4 + p.life * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function burst(x: number, y: number, count: number, color?: string): void {
  if (reduceMotion) return;
  const colors = ["#ffd166", "#ff8fa3", "#7cc4ff", "#8ae69a", "#ffffff"];
  for (let i = 0; i < count; i += 1) {
    const angle = (Math.PI * 2 * i) / count + rng();
    const speed = 160 + rng() * 260;
    particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed - 120, life: 0.5 + rng() * 0.4, color: color ?? colors[i % colors.length] });
  }
}

// ---------- DOM feedback ----------
let sayTimer = 0;
function say(html: string, tone: "info" | "good" | "bad", seconds: number, isHtml = false): void {
  const bubble = $("#bubble");
  bubble.className = `bubble ${tone}`;
  bubble.innerHTML = isHtml || tone !== "info" ? html : esc(html);
  bubble.hidden = false;
  $("#live").textContent = bubble.textContent ?? "";
  window.clearTimeout(sayTimer);
  sayTimer = window.setTimeout(() => (bubble.hidden = true), seconds * 1000);
}

function callout(text: string): void {
  const el = $("#callout");
  el.textContent = text;
  el.classList.remove("show");
  void el.offsetWidth;
  el.classList.add("show");
}

function floatText(x: number, y: number, text: string): void {
  const el = document.createElement("div");
  el.className = "float";
  el.textContent = text;
  const rect = canvas.getBoundingClientRect();
  const frame = $("#frame").getBoundingClientRect();
  el.style.left = `${rect.left - frame.left + x}px`;
  el.style.top = `${rect.top - frame.top + y}px`;
  $("#frame").appendChild(el);
  window.setTimeout(() => el.remove(), 900);
}

function flyStar(x: number, y: number, threat: string): void {
  const target = document.querySelector<HTMLElement>(`.goal[data-threat="${threat}"]`);
  if (!target || reduceMotion) return;
  const frame = $("#frame").getBoundingClientRect();
  const rect = canvas.getBoundingClientRect();
  const goal = target.getBoundingClientRect();
  const star = document.createElement("img");
  star.src = STAR_URL;
  star.className = "fly";
  star.alt = "";
  star.style.left = `${rect.left - frame.left + x - 20}px`;
  star.style.top = `${rect.top - frame.top + y - 20}px`;
  $("#frame").appendChild(star);
  requestAnimationFrame(() => {
    star.style.transform = `translate(${goal.left - frame.left + goal.width / 2 - 20 - (rect.left - frame.left + x - 20)}px, ${goal.top - frame.top + 10 - (rect.top - frame.top + y - 20)}px) scale(.6) rotate(200deg)`;
  });
  window.setTimeout(() => {
    star.remove();
    target.classList.remove("bump");
    void target.offsetWidth;
    target.classList.add("bump");
  }, 650);
}

// ---------- field guide ----------
// What every sticker is, and a match book that fills in (with the reason) as pairs are found.
const discovered = (() => {
  try {
    return new Set<string>(JSON.parse(localStorage.getItem("secure-stack:pairs") ?? "[]"));
  } catch {
    return new Set<string>();
  }
})();
let lastFound = "";

function discover(threat: string, defence: string): void {
  const key = `${threat}:${defence}`;
  lastFound = discovered.has(key) ? "" : key;
  discovered.add(key);
  try {
    localStorage.setItem("secure-stack:pairs", JSON.stringify([...discovered]));
  } catch {
    // Optional.
  }
}

function img(id: string, frozen = false): string {
  return `<img src="${IMAGE_URLS.get(`${id}:${frozen ? "frozen" : "plain"}`)}" alt="" />`;
}

function renderGuide(): void {
  const level = progress.level;
  const threats = [...level.threats];
  const pairs = threats.flatMap((threat) => level.defences.filter((defence) => COUNTERS[threat]?.[defence]).map((defence) => ({ threat, defence })));
  const found = pairs.filter((pair) => discovered.has(`${pair.threat}:${pair.defence}`)).length;
  const entry = (id: string, frozen = false) => {
    const def = sticker(id);
    return `<li class="fg-item" data-guide="${id}">${img(id, frozen)}<div><b>${esc(def.name)}</b><span>${esc(def.blurb)}</span></div></li>`;
  };
  $("#fg-body").innerHTML = `
    <section class="fg-how">
      <h3>How to play</h3>
      <div class="fg-key">
        <div>${img(threats[0])}<span><b class="thr">Blobs with eyes</b> are <b>threats</b>: things that can go wrong.</span></div>
        <div>${img(level.defences[0])}<span><b class="def">Badges</b> are <b>defences</b>: the controls that stop them.</span></div>
      </div>
      <ol>
        <li><b>Drag a defence onto the threat it stops.</b> Both pop, and a goal in the tray fills.</li>
        <li><b>Tap any sticker</b> to see what it is (it lights up here too).</li>
        <li><b>Keep the pile below the rope.</b> New threats keep washing in.</li>
      </ol>
      <p class="fg-why"><b>Why match them?</b> In real security, each threat has specific controls that stop it. Knowing which control answers which threat is the core skill. One defence can stop several threats (MFA helps against phishing, weak passwords and brute force), and one threat can have several defences.</p>
    </section>
    <section>
      <h3>Threats on ${esc(level.island)}</h3>
      <ul class="fg-list">${threats.map((id) => entry(id)).join("")}${level.unknowns ? entry("unknown", true) : ""}</ul>
    </section>
    <section>
      <h3>Defences on ${esc(level.island)}</h3>
      <ul class="fg-list">${level.defences.map((id) => entry(id)).join("")}</ul>
    </section>
    <section>
      <h3>Match book <small>${found} of ${pairs.length} found</small></h3>
      <ul class="fg-pairs">${pairs
        .map((pair) => {
          const key = `${pair.threat}:${pair.defence}`;
          const known = discovered.has(key);
          return known
            ? `<li class="known ${key === lastFound ? "new" : ""}" data-pair="${key}">${img(pair.defence)}<i>→</i>${img(pair.threat)}<div><b>${esc(sticker(pair.defence).name)} stops ${esc(sticker(pair.threat).name.toLowerCase())}</b><span>${esc(COUNTERS[pair.threat][pair.defence])}</span></div></li>`
            : `<li class="unknown-pair"><span class="slot">?</span><i>→</i>${img(pair.threat)}<div><b>Which defence stops ${esc(sticker(pair.threat).name.toLowerCase())}?</b><span>Make the match to fill in the reason.</span></div></li>`;
        })
        .join("")}</ul>
    </section>`;
  lastFound = "";
}

function highlightGuide(id: string): void {
  const item = document.querySelector<HTMLElement>(`[data-guide="${id}"]`);
  if (!item) return;
  document.querySelectorAll(".fg-item.lit").forEach((el) => el.classList.remove("lit"));
  item.classList.add("lit");
  item.scrollIntoView({ block: "nearest", behavior: reduceMotion ? "auto" : "smooth" });
}

function setGuide(open: boolean): void {
  $("#field-guide").classList.toggle("open", open);
  $("#guide-btn").setAttribute("aria-expanded", String(open));
  if (open) $("#guide-close").focus();
}
$("#guide-btn").addEventListener("click", () => setGuide(!$("#field-guide").classList.contains("open")));
$("#guide-close").addEventListener("click", () => {
  setGuide(false);
  $("#guide-btn").focus();
});

function renderHud(): void {
  renderGuide();
  const level = progress.level;
  $("#level-pill").innerHTML = `<b>Level ${level.id}</b><span>${esc(level.island)}</span>`;
  $("#score").textContent = progress.score.toLocaleString();
  $("#hint-count").textContent = String(progress.hints);
  ($("#hint") as HTMLButtonElement).disabled = progress.hints === 0;
  $("#goals").innerHTML = level.goals
    .map((goal) => {
      const have = progress.goals[goal.threat];
      const done = have >= goal.count;
      return `<div class="goal ${done ? "done" : ""}" data-threat="${goal.threat}" title="${esc(sticker(goal.threat).name)}">
        <img src="${IMAGE_URLS.get(`${goal.threat}:plain`)}" alt="" />
        <span class="g-name">${esc(sticker(goal.threat).name)}</span>
        <span class="g-count">${done ? "✓" : `${have}/${goal.count}`}</span>
      </div>`;
    })
    .join("");
}

// ---------- input ----------
function local(event: PointerEvent): { x: number; y: number } {
  const rect = canvas.getBoundingClientRect();
  return { x: event.clientX - rect.left, y: event.clientY - rect.top };
}

canvas.addEventListener("pointerdown", (event) => {
  if (!running) return;
  const point = local(event);
  const body = bodyAt(world, point.x, point.y);
  if (!body) return;
  const piece = pieces.get(body.key)!;
  if (piece.frozen) {
    piece.wobble = 0.6;
    say("Unidentified alert: secure a threat right next to it to investigate it.", "info", 4);
    return;
  }
  canvas.setPointerCapture(event.pointerId);
  held = body;
  body.held = true;
  pointer = point;
  heldFrom = { x: point.x, y: point.y, t: performance.now() };
  play("click");
});

canvas.addEventListener("pointermove", (event) => {
  if (!held) return;
  const point = local(event);
  pointer = { x: Math.max(radius, Math.min(world.width - radius, point.x)), y: Math.max(radius, Math.min(world.height - radius, point.y)) };
});

function release(event: PointerEvent): void {
  if (!held) return;
  const body = held;
  held = null;
  body.held = false;
  const point = local(event);
  const moved = Math.hypot(point.x - heldFrom.x, point.y - heldFrom.y);
  if (moved < 8 && performance.now() - heldFrom.t < 300) {
    const def = sticker(pieces.get(body.key)!.id);
    say(`<b>${esc(def.name)}</b> · ${def.kind === "threat" ? "threat" : "defence"}. ${esc(def.blurb)}`, "info", 4.5, true);
    highlightGuide(def.id);
    return;
  }
  const target = dropTarget(body, point);
  body.vx *= 0.15;
  body.vy *= 0.15;
  if (target) attempt(body, target);
}
canvas.addEventListener("pointerup", release);
canvas.addEventListener("pointercancel", release);

// Forgiving drops: among stickers close to where it was dropped, a valid match wins; otherwise
// the nearest one is the target (and gets the explanation).
function dropTarget(body: Body, point: { x: number; y: number }): Body | null {
  const id = pieces.get(body.key)!.id;
  const near = world.bodies
    .filter((other) => other !== body && Math.min(Math.hypot(other.x - point.x, other.y - point.y), Math.hypot(other.x - body.x, other.y - body.y)) < other.r * 1.35)
    .sort((a, b) => Math.hypot(a.x - point.x, a.y - point.y) - Math.hypot(b.x - point.x, b.y - point.y));
  const valid = near.find((other) => !pieces.get(other.key)!.frozen && tryMatch(id, pieces.get(other.key)!.id).ok);
  return valid ?? near[0] ?? bodyAt(world, body.x, body.y, body);
}

// Keyboard play: arrows move a cursor, Space picks a sticker, then picks its target.
canvas.addEventListener("keydown", (event) => {
  if (!running) return;
  const sorted = [...world.bodies].sort((a, b) => a.x - b.x || a.y - b.y);
  if (!sorted.length) return;
  let index = Math.max(0, sorted.findIndex((body) => body.key === focusKey));
  if (event.key === "ArrowRight" || event.key === "ArrowDown") index = (index + 1) % sorted.length;
  else if (event.key === "ArrowLeft" || event.key === "ArrowUp") index = (index - 1 + sorted.length) % sorted.length;
  else if (event.key === " " || event.key === "Enter") {
    event.preventDefault();
    const current = sorted[index];
    if (!current) return;
    const piece = pieces.get(current.key)!;
    if (liftedKey === null) {
      if (piece.frozen) return say("Unidentified alert: secure a threat next to it first.", "info", 3);
      liftedKey = current.key;
      say(`Picked ${sticker(piece.id).name}. Choose what to drop it on.`, "info", 4);
    } else if (liftedKey === current.key) {
      liftedKey = null;
    } else {
      const lifted = world.bodies.find((body) => body.key === liftedKey);
      liftedKey = null;
      if (lifted) attempt(lifted, current);
    }
    return;
  } else return;
  event.preventDefault();
  focusKey = sorted[index].key;
  const def = sticker(pieces.get(focusKey)!.id);
  $("#live").textContent = `${def.name}, ${def.kind}`;
});

$("#hint").addEventListener("click", () => {
  if (!running || progress.hints === 0) return;
  for (const a of world.bodies) {
    const pa = pieces.get(a.key)!;
    if (pa.frozen || sticker(pa.id).kind !== "threat") continue;
    const b = world.bodies.find((body) => !pieces.get(body.key)!.frozen && tryMatch(pa.id, pieces.get(body.key)!.id).ok);
    if (b) {
      progress.hints -= 1;
      pa.hint = 2.5;
      pieces.get(b.key)!.hint = 2.5;
      say(`Look for ${sticker(pa.id).name.toLowerCase()} and a defence that stops it.`, "info", 3);
      renderHud();
      return;
    }
  }
});
$("#to-map").addEventListener("click", showMap);

// ---------- overlays ----------
function showMap(): void {
  running = false;
  $("#result").hidden = true;
  $("#map").hidden = false;
  $("#islands").innerHTML = LEVELS.map((level, index) => {
    const earned = saved[level.id] ?? 0;
    return `<button class="island i${index}" data-level="${index}">
      <span class="i-num">${level.id}</span>
      <strong>${esc(level.island)}</strong>
      <small>${esc(level.title)}</small>
      <span class="i-stars">${"★".repeat(earned)}${"☆".repeat(3 - earned)}</span>
    </button>`;
  }).join("");
  document.querySelector<HTMLElement>(".island")?.focus();
}

$("#islands").addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest<HTMLElement>("[data-level]");
  if (button) startGame(Number(button.dataset.level));
});

function showResult(): void {
  const won = progress.phase === "won";
  const earned = won ? stars(progress) : 0;
  const learned = new Map<string, { threat: string; defence: string }>();
  for (const match of progress.matches) learned.set(`${match.threat}:${match.defence}`, match);
  const mixups = new Map<string, string>();
  for (const mixup of progress.mixups) mixups.set([mixup.a, mixup.b].sort().join(":"), mixup.reason);
  const box = $("#result");
  box.hidden = false;
  box.innerHTML = `
    <div class="card ${won ? "win" : "lose"}" role="dialog" aria-labelledby="result-title">
      <h2 id="result-title">${won ? "Island secured!" : "Breach!"}</h2>
      ${won ? `<div class="stars">${[0, 1, 2].map((i) => `<img src="${STAR_URL}" class="${i < earned ? "on" : ""}" alt="" />`).join("")}</div>` : `<p class="lose-line">The pile settled above the rope: too many threats left unanswered at once.</p>`}
      <p class="result-stats"><b>${progress.score.toLocaleString()}</b> points · best streak ${progress.bestStreak} · ${progress.mixups.length} mix-up${progress.mixups.length === 1 ? "" : "s"}</p>
      ${won ? `<p class="star-note">Stars are for understanding: 3 stars with one mix-up or fewer.</p>` : ""}
      <h3>Field notes</h3>
      <ul class="notes">${
        learned.size
          ? [...learned.values()]
              .map((match) => `<li class="good"><b>${esc(sticker(match.defence).name)} → ${esc(sticker(match.threat).name)}</b>${esc(tryMatch(match.threat, match.defence).reason)}</li>`)
              .join("")
          : `<li>No threats secured yet.</li>`
      }</ul>
      ${mixups.size ? `<h3>Mix-ups to remember</h3><ul class="notes">${[...mixups.values()].slice(0, 4).map((reason) => `<li class="bad">${esc(reason)}</li>`).join("")}</ul>` : ""}
      <div class="result-actions">
        ${won && levelIndex + 1 < LEVELS.length ? `<button class="big green" data-go="next">Next island</button>` : ""}
        <button class="big ${won ? "blue" : "green"}" data-go="replay">${won ? "Replay" : "Try again"}</button>
        <button class="big blue" data-go="map">Island map</button>
      </div>
    </div>`;
  box.querySelector<HTMLElement>("button")?.focus();
}

$("#result").addEventListener("click", (event) => {
  const go = (event.target as HTMLElement).closest<HTMLElement>("[data-go]")?.dataset.go;
  if (go === "next") startGame(levelIndex + 1);
  else if (go === "replay") startGame(levelIndex);
  else if (go === "map") showMap();
});

// ---------- boot ----------
// ?debug exposes sticker positions (page coordinates) for automated playtests and videos.
if (params.has("debug")) {
  (window as unknown as { __stack: unknown }).__stack = {
    stickers: () => {
      const rect = canvas.getBoundingClientRect();
      return world.bodies.map((body) => ({ id: pieces.get(body.key)!.id, frozen: pieces.get(body.key)!.frozen, x: rect.left + body.x, y: rect.top + body.y, resting: body.restFor > 0.3 }));
    },
    progress: () => ({ phase: progress.phase, goals: progress.goals, score: progress.score, mixups: progress.mixups.length }),
  };
}
resize();
renderGuide();
requestAnimationFrame(frame);
const startAt = params.get("level");
if (startAt) startGame(Math.max(0, Math.min(LEVELS.length - 1, Number(startAt) - 1)));
else showMap();
