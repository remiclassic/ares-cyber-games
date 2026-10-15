import type { EvidenceIcon, StationId } from "../sim/types";
import { SEGMENTS, STATIONS, WORLD, pointAt, type Point } from "./route";

// Canvas 2D scene: backdrop, stations, route, chips and ship. Everything is drawn procedurally.
// The scene only shows what the UI hands it; it holds no rules.

export type StationMode = "ok" | "alert" | "waste" | "review" | "resolved" | "degraded";

export type StationView = {
  id: StationId;
  name: string;
  sub: string;
  mode: StationMode;
  sign?: string;
  // One pod per running instance; `busy` of them carry load.
  pods?: { count: number; busy: number };
  satellite?: { label: string; count: number; hot: boolean; known: boolean };
  keys?: { held: number; flagged: number; settled: boolean };
  // Link to the archive: true while the stated task runs.
  beam?: boolean;
};

export type SceneView = {
  stations: StationView[];
  segment: number;
  completed: number;
  target: number | null;
  ship: { x: number; y: number; angle: number; thrust: number };
  chips: { x: number; y: number; icon: EvidenceIcon; collected: boolean }[];
  reducedMotion: boolean;
};

const TAU = Math.PI * 2;
const C = { cyan: "56,214,245", green: "61,220,132", red: "255,93,108", amber: "246,185,59", violet: "167,139,250", white: "232,240,251" };
const MODE: Record<StationMode, { rgb: string; badge: string }> = {
  ok: { rgb: C.green, badge: "✓" },
  resolved: { rgb: C.green, badge: "✓" },
  alert: { rgb: C.red, badge: "!" },
  degraded: { rgb: C.red, badge: "!" },
  waste: { rgb: C.amber, badge: "$" },
  review: { rgb: C.violet, badge: "?" },
};
const rgba = (rgb: string, alpha: number) => `rgba(${rgb},${alpha})`;

type Particle = { x: number; y: number; vx: number; vy: number; life: number; max: number; rgb: string; size: number };
type FloatText = { x: number; y: number; text: string; rgb: string; life: number };
type Ring = { x: number; y: number; rgb: string; life: number };

function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

export class Scene {
  private readonly ctx: CanvasRenderingContext2D;
  private backdrop: HTMLCanvasElement | null = null;
  private width = 0;
  private height = 0;
  private scale = 1;
  private ox = 0;
  private oy = 0;
  private stars: { x: number; y: number; r: number; phase: number }[] = [];
  private particles: Particle[] = [];
  private texts: FloatText[] = [];
  private rings: Ring[] = [];
  private reduced = false;

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext("2d")!;
  }

  // `free` is the part of the canvas not covered by panels, in CSS pixels.
  layout(width: number, height: number, free: { x: number; y: number; w: number; h: number }): void {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (width !== this.width || height !== this.height) {
      this.canvas.width = Math.round(width * dpr);
      this.canvas.height = Math.round(height * dpr);
      this.width = width;
      this.height = height;
      this.paintBackdrop(dpr);
    }
    this.scale = Math.max(0.2, Math.min(free.w / WORLD.w, free.h / WORLD.h));
    this.ox = free.x + (free.w - WORLD.w * this.scale) / 2;
    this.oy = free.y + (free.h - WORLD.h * this.scale) / 2;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  burst(point: Point, rgb: string, count = 14): void {
    if (this.reduced) return;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * TAU;
      const speed = 20 + Math.random() * 70;
      this.particles.push({ x: point.x, y: point.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: 0.7, max: 0.7, rgb, size: 1.5 + Math.random() * 2 });
    }
  }

  floatText(point: Point, text: string, rgb: string = C.cyan): void {
    this.texts.push({ x: point.x, y: point.y, text, rgb, life: 1.6 });
  }

  pulse(station: StationId, good: boolean): void {
    const point = STATIONS[station];
    this.rings.push({ x: point.x, y: point.y, rgb: good ? C.green : C.red, life: 1 });
    this.burst(point, good ? C.green : C.red, 26);
  }

  draw(view: SceneView, time: number, dt: number): void {
    const ctx = this.ctx;
    this.reduced = view.reducedMotion;
    ctx.clearRect(0, 0, this.width, this.height);
    if (this.backdrop) ctx.drawImage(this.backdrop, 0, 0, this.width, this.height);
    for (const star of this.stars) {
      const alpha = view.reducedMotion ? 0.7 : 0.45 + 0.4 * Math.sin(time * 1.3 + star.phase);
      ctx.fillStyle = rgba(C.white, alpha);
      ctx.fillRect(star.x, star.y, star.r, star.r);
    }

    ctx.save();
    ctx.translate(this.ox, this.oy);
    ctx.scale(this.scale, this.scale);
    this.route(view, time);
    for (const station of view.stations) this.station(station, time);
    for (const chip of view.chips) if (!chip.collected) this.chip(chip, time);
    this.effects(dt);
    this.ship(view.ship, time);
    ctx.restore();
  }

  // ---------- backdrop ----------
  private paintBackdrop(dpr: number): void {
    const W = this.width;
    const H = this.height;
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const random = seeded(7);

    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#040816");
    sky.addColorStop(1, "#0a1d42");
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H);

    for (const [x, y, r, rgb] of [[0.72, 0.18, 0.5, "60,90,220"], [0.45, 0.5, 0.45, "40,120,200"], [0.95, 0.75, 0.4, "110,70,200"]] as [number, number, number, string][]) {
      const glow = ctx.createRadialGradient(W * x, H * y, 0, W * x, H * y, W * r);
      glow.addColorStop(0, rgba(rgb, 0.2));
      glow.addColorStop(1, rgba(rgb, 0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, W, H);
    }

    this.stars = Array.from({ length: 170 }, () => ({ x: random() * W, y: random() * H * 0.8, r: 0.6 + random() * 1.6, phase: random() * TAU }));

    // The planet's limb, lit from the left.
    const R = Math.max(W, H) * 0.95;
    const cx = W * 0.3;
    const cy = H * 0.66 + R;
    ctx.save();
    ctx.shadowColor = "rgba(90,190,255,0.9)";
    ctx.shadowBlur = 46;
    const ground = ctx.createRadialGradient(cx - R * 0.45, cy - R * 0.85, R * 0.05, cx, cy, R);
    ground.addColorStop(0, "#2a6db5");
    ground.addColorStop(0.35, "#0f2f63");
    ground.addColorStop(1, "#050d20");
    ctx.fillStyle = ground;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, TAU);
    ctx.clip();
    for (let i = 0; i < 26; i += 1) {
      const theta = (random() - 0.5) * 1.3;
      const radius = R * (0.86 + random() * 0.13);
      ctx.fillStyle = rgba("255,255,255", 0.03 + random() * 0.05);
      ctx.beginPath();
      ctx.ellipse(cx + Math.sin(theta) * radius, cy - Math.cos(theta) * radius, 60 + random() * 160, 8 + random() * 16, theta, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < 420; i += 1) {
      const cluster = Math.floor(random() * 9) / 9 - 0.5 + (random() - 0.5) * 0.09;
      const radius = R * (0.8 + random() * 0.185);
      const x = cx + Math.sin(cluster * 1.2 + 0.25) * radius;
      const y = cy - Math.cos(cluster * 1.2 + 0.25) * radius;
      ctx.fillStyle = rgba("255,196,110", 0.25 + random() * 0.55);
      ctx.fillRect(x, y, 1 + random() * 1.4, 1 + random() * 1.4);
    }
    ctx.restore();

    const sun = ctx.createRadialGradient(0, H * 0.42, 0, 0, H * 0.42, W * 0.42);
    sun.addColorStop(0, "rgba(255,214,160,0.5)");
    sun.addColorStop(0.25, "rgba(255,170,110,0.16)");
    sun.addColorStop(1, "rgba(255,170,110,0)");
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, W, H);
    this.backdrop = canvas;
  }

  // ---------- route ----------
  private route(view: SceneView, time: number): void {
    const ctx = this.ctx;
    SEGMENTS.forEach((segment, index) => {
      const done = index < view.completed || (index === view.segment && view.target === index);
      const active = index === view.segment && !done;
      ctx.save();
      ctx.lineWidth = active ? 3 : 2.2;
      ctx.setLineDash([12, 10]);
      ctx.lineDashOffset = active && !view.reducedMotion ? -time * 34 : 0;
      ctx.strokeStyle = done ? rgba(C.green, 0.6) : active ? rgba(C.cyan, 0.95) : rgba("120,170,230", 0.3);
      if (active) {
        ctx.shadowColor = rgba(C.cyan, 0.9);
        ctx.shadowBlur = 10;
      }
      ctx.beginPath();
      ctx.moveTo(segment.from.x, segment.from.y);
      ctx.quadraticCurveTo(segment.ctrl.x, segment.ctrl.y, segment.to.x, segment.to.y);
      ctx.stroke();
      ctx.restore();
    });

    SEGMENTS.forEach((segment, index) => {
      const point = segment.to;
      const done = index < view.completed;
      const open = view.target === index;
      const next = index === view.segment && !open && !done;
      const rgb = done ? C.green : open ? C.amber : next ? C.cyan : "120,170,230";
      const beat = (open || next) && !view.reducedMotion ? 0.5 + 0.5 * Math.sin(time * 3) : 0.5;
      ctx.save();
      ctx.translate(point.x, point.y);
      ctx.shadowColor = rgba(rgb, 0.9);
      ctx.shadowBlur = open || next ? 16 : 6;
      ctx.strokeStyle = rgba(rgb, done || open || next ? 0.95 : 0.45);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(0, 0, 17 + beat * 3, 0, TAU);
      ctx.stroke();
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.arc(0, 0, 10, 0, TAU);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.fillStyle = rgba(rgb, 1);
      ctx.font = "800 13px 'Exo 2', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(done ? "✓" : String(index + 1), 0, 1);
      if (next || open) this.tag(0, 38, "CHECKPOINT", rgb);
      ctx.restore();
    });
  }

  private tag(x: number, y: number, text: string, rgb: string): void {
    const ctx = this.ctx;
    ctx.font = "700 11px 'Exo 2', sans-serif";
    const width = ctx.measureText(text).width + 18;
    ctx.fillStyle = "rgba(6,16,34,0.85)";
    ctx.strokeStyle = rgba(rgb, 0.8);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - width / 2, y - 10, width, 20, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(rgb, 1);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, x, y + 1);
  }

  // ---------- stations ----------
  private station(view: StationView, time: number): void {
    const ctx = this.ctx;
    const origin = STATIONS[view.id];
    const mode = MODE[view.mode];
    const urgent = view.mode === "alert" || view.mode === "degraded";
    const beat = this.reduced ? 0.5 : 0.5 + 0.5 * Math.sin(time * (urgent ? 6 : 2) + origin.x);
    const bob = this.reduced ? 0 : Math.sin(time * 0.8 + origin.x) * 3;

    ctx.save();
    ctx.translate(origin.x, origin.y + bob);

    const halo = ctx.createRadialGradient(0, 0, 10, 0, 0, 150);
    halo.addColorStop(0, rgba(mode.rgb, urgent ? 0.2 + beat * 0.14 : 0.16));
    halo.addColorStop(1, rgba(mode.rgb, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, 150, 0, TAU);
    ctx.fill();

    if (view.satellite) this.satellite(view.satellite, time);
    if (view.beam !== undefined) this.archive(view.beam, time);

    // Lower hull and keel.
    ctx.fillStyle = "#132544";
    ctx.beginPath();
    ctx.moveTo(-8, 40);
    ctx.lineTo(0, 76);
    ctx.lineTo(8, 40);
    ctx.fill();
    ctx.fillStyle = rgba(C.cyan, 0.5 + beat * 0.4);
    ctx.fillRect(-1.5, 70, 3, 8);
    for (let i = 2; i >= 0; i -= 1) {
      ctx.fillStyle = ["#16294a", "#101f3a", "#0b162b"][i];
      ctx.strokeStyle = "rgba(120,170,230,0.3)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(0, 14 + i * 11, 64 - i * 18, 14 - i * 3, 0, 0, TAU);
      ctx.fill();
      ctx.stroke();
    }

    // Main ring.
    const hull = ctx.createLinearGradient(0, -30, 0, 32);
    hull.addColorStop(0, "#4a6590");
    hull.addColorStop(0.5, "#22365a");
    hull.addColorStop(1, "#0d1a31");
    ctx.fillStyle = hull;
    ctx.strokeStyle = "rgba(150,205,255,0.65)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.ellipse(0, 0, 96, 30, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.shadowColor = rgba(mode.rgb, 0.9);
    ctx.shadowBlur = 10;
    ctx.strokeStyle = rgba(mode.rgb, 0.65 + beat * 0.35);
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 4, 96, 30, 0, 0.12, Math.PI - 0.12);
    ctx.stroke();
    ctx.restore();
    ctx.fillStyle = "rgba(170,235,255,0.85)";
    for (let degrees = 18; degrees <= 162; degrees += 12) {
      const angle = (degrees * Math.PI) / 180;
      ctx.fillRect(Math.cos(angle) * 88 - 2, Math.sin(angle) * 24 - 2, 4, 2);
    }

    // Deck, towers and dome.
    ctx.fillStyle = "#1c2e4f";
    ctx.strokeStyle = "rgba(150,205,255,0.4)";
    ctx.beginPath();
    ctx.ellipse(0, -7, 80, 23, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = "rgba(90,210,150,0.35)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -8, 66, 17, 0, 0, TAU);
    ctx.stroke();
    for (const [x, height] of [[-60, 24], [-46, 40], [-33, 18], [34, 20], [47, 34], [61, 22]]) {
      const tower = ctx.createLinearGradient(x - 3, 0, x + 3, 0);
      tower.addColorStop(0, "#6c86b0");
      tower.addColorStop(1, "#20304e");
      ctx.fillStyle = tower;
      ctx.fillRect(x - 3, -10 - height, 6, height);
      ctx.fillStyle = rgba(C.cyan, 0.6 + beat * 0.4);
      ctx.fillRect(x - 1, -13 - height, 2, 3);
    }
    const glass = ctx.createRadialGradient(-9, -32, 3, 0, -14, 34);
    glass.addColorStop(0, "rgba(215,245,255,0.95)");
    glass.addColorStop(0.5, "rgba(95,165,225,0.7)");
    glass.addColorStop(1, "rgba(30,80,150,0.6)");
    ctx.fillStyle = glass;
    ctx.strokeStyle = "rgba(200,240,255,0.8)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(0, -10, 30, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Holographic cloud panel.
    ctx.fillStyle = "rgba(6,16,34,0.92)";
    ctx.strokeStyle = rgba(mode.rgb, 0.9);
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.roundRect(-21, -9, 42, 26, 5);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(-6, 7, 5, Math.PI * 0.5, Math.PI * 1.5);
    ctx.arc(0, 2, 6.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.arc(7, 7, 5, Math.PI * 1.5, Math.PI * 0.5);
    ctx.closePath();
    ctx.stroke();

    if (view.pods) this.pods(view.pods, view.mode, beat);
    if (view.keys) this.keys(view.keys, time);

    if (urgent && !this.reduced) {
      ctx.strokeStyle = rgba(C.red, 0.7 * (1 - beat));
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, 100 + beat * 22, 32 + beat * 8, 0, 0, TAU);
      ctx.stroke();
      if (Math.random() < 0.12) this.particles.push({ x: origin.x + (Math.random() - 0.5) * 150, y: origin.y - 10, vx: (Math.random() - 0.5) * 30, vy: -20 - Math.random() * 40, life: 0.8, max: 0.8, rgb: C.red, size: 2 });
    }
    if (view.mode === "waste" && !this.reduced && Math.random() < 0.06) {
      this.particles.push({ x: origin.x + (Math.random() - 0.5) * 170, y: origin.y + 36, vx: (Math.random() - 0.5) * 10, vy: 22 + Math.random() * 20, life: 1.4, max: 1.4, rgb: C.amber, size: 2.6 });
    }

    if (view.sign) {
      ctx.font = "800 12px 'Exo 2', sans-serif";
      const width = ctx.measureText(view.sign).width + 20;
      ctx.fillStyle = "rgba(20,6,12,0.9)";
      ctx.strokeStyle = rgba(mode.rgb, 0.6 + beat * 0.4);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.roundRect(-width / 2, 56, width, 22, 4);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = rgba(mode.rgb, 0.75 + beat * 0.25);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(view.sign, 0, 68);
    }

    this.label(view, mode);
    ctx.restore();
  }

  private pods(pods: { count: number; busy: number }, mode: StationMode, beat: number): void {
    const ctx = this.ctx;
    const hot = mode === "alert" || mode === "degraded";
    for (let i = 0; i < pods.count; i += 1) {
      const angle = Math.PI / 2 + (i - (pods.count - 1) / 2) * 0.33;
      const x = Math.cos(angle) * 112;
      const y = Math.sin(angle) * 38 + 5;
      const busy = i < Math.ceil(pods.busy - 1e-9);
      const rgb = hot ? C.red : busy ? C.cyan : C.amber;
      ctx.strokeStyle = "rgba(150,205,255,0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(Math.cos(angle) * 96, Math.sin(angle) * 30);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.fillStyle = busy ? rgba(rgb, hot ? 0.55 + beat * 0.45 : 0.9) : "rgba(10,22,44,0.9)";
      ctx.strokeStyle = hot ? "rgba(255,220,224,0.95)" : rgba(rgb, busy ? 1 : 0.7);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.roundRect(x - 9.5, y - 6.5, 19, 13, 3);
      ctx.fill();
      ctx.stroke();
    }
  }

  private satellite(satellite: { label: string; count: number; hot: boolean; known: boolean }, time: number): void {
    const ctx = this.ctx;
    const x = 138;
    const y = -50;
    const rgb = !satellite.known ? "150,170,200" : satellite.hot ? C.red : C.cyan;
    ctx.save();
    ctx.globalAlpha = satellite.known ? 1 : 0.55;
    ctx.strokeStyle = rgba(rgb, 0.7);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.lineDashOffset = this.reduced ? 0 : -time * 16;
    ctx.beginPath();
    ctx.moveTo(84, -12);
    ctx.lineTo(x - 26, y + 6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#1a2c4d";
    ctx.beginPath();
    ctx.ellipse(x, y, 32, 10, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "rgba(95,165,225,0.6)";
    ctx.beginPath();
    ctx.arc(x, y - 3, 11, Math.PI, 0);
    ctx.fill();
    if (satellite.known) {
      for (let i = 0; i < satellite.count; i += 1) {
        ctx.fillStyle = rgba(rgb, 0.95);
        ctx.beginPath();
        ctx.roundRect(x + (i - (satellite.count - 1) / 2) * 11 - 4, y + 13, 8, 6, 2);
        ctx.fill();
      }
    } else {
      ctx.fillStyle = rgba(C.white, 0.9);
      ctx.font = "800 13px 'Exo 2', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("?", x, y + 24);
    }
    ctx.fillStyle = rgba(rgb, 1);
    ctx.font = "700 10px 'Exo 2', sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(satellite.label, x, y - 22);
    ctx.restore();
  }

  private archive(ok: boolean, time: number): void {
    const ctx = this.ctx;
    const x = 78;
    const y = -98;
    const rgb = ok ? C.green : C.red;
    ctx.save();
    ctx.strokeStyle = rgba(rgb, 0.85);
    ctx.lineWidth = 2;
    ctx.setLineDash(ok ? [6, 6] : [3, 9]);
    ctx.lineDashOffset = ok && !this.reduced ? -time * 24 : 0;
    ctx.beginPath();
    ctx.moveTo(14, -38);
    ctx.lineTo(x - 8, y + 14);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(10,22,44,0.95)";
    ctx.beginPath();
    ctx.roundRect(x - 22, y - 12, 44, 24, 5);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(rgb, 1);
    ctx.font = "700 9px 'Exo 2', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("ARCHIVE", x, y + 1);
    if (!ok) {
      ctx.font = "800 14px 'Exo 2', sans-serif";
      ctx.fillText("✕", (14 + x - 8) / 2 + 10, (-38 + y + 14) / 2);
    }
    ctx.restore();
  }

  private keys(keys: { held: number; flagged: number; settled: boolean }, time: number): void {
    const ctx = this.ctx;
    for (let i = 0; i < keys.held; i += 1) {
      const angle = (i / Math.max(1, keys.held)) * TAU + (this.reduced ? 0.4 : time * 0.35);
      const x = Math.cos(angle) * 122;
      const y = Math.sin(angle) * 44 + 4;
      const rgb = !keys.settled ? C.violet : i < keys.flagged ? C.red : C.green;
      ctx.fillStyle = "rgba(10,22,44,0.95)";
      ctx.strokeStyle = rgba(rgb, 1);
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(x, y, 9, 0, TAU);
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(x - 2.5, y, 2.6, 0, TAU);
      ctx.moveTo(x, y);
      ctx.lineTo(x + 5.5, y);
      ctx.moveTo(x + 4, y);
      ctx.lineTo(x + 4, y + 2.6);
      ctx.stroke();
    }
  }

  private label(view: StationView, mode: { rgb: string; badge: string }): void {
    const ctx = this.ctx;
    ctx.font = "800 13px 'Exo 2', sans-serif";
    const nameWidth = ctx.measureText(view.name).width;
    ctx.font = "500 10.5px Inter, sans-serif";
    const width = Math.max(nameWidth, ctx.measureText(view.sub).width) + 54;
    const x = view.id === "ap-southeast" ? -width / 2 - 50 : -width / 2;
    const y = -112;
    ctx.fillStyle = "rgba(6,16,34,0.88)";
    ctx.strokeStyle = rgba(mode.rgb, 0.75);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.roundRect(x, y, width, 38, 7);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(mode.rgb, 1);
    ctx.fillRect(x + 6, y + 7, 3, 24);
    ctx.textAlign = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillStyle = rgba(C.white, 1);
    ctx.font = "800 13px 'Exo 2', sans-serif";
    ctx.fillText(view.name, x + 15, y + 16);
    ctx.fillStyle = "rgba(190,208,232,0.95)";
    ctx.font = "500 10.5px Inter, sans-serif";
    ctx.fillText(view.sub, x + 15, y + 30);
    ctx.fillStyle = rgba(mode.rgb, 1);
    ctx.beginPath();
    ctx.arc(x + width - 18, y + 19, 11, 0, TAU);
    ctx.fill();
    ctx.fillStyle = "#06101f";
    ctx.font = "800 14px 'Exo 2', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(mode.badge, x + width - 18, y + 20);
  }

  // ---------- chips, ship, effects ----------
  private chip(chip: { x: number; y: number; icon: EvidenceIcon }, time: number): void {
    const ctx = this.ctx;
    const bob = this.reduced ? 0 : Math.sin(time * 2.4 + chip.x) * 2.5;
    ctx.save();
    ctx.translate(chip.x, chip.y + bob);
    ctx.shadowColor = rgba(C.cyan, 0.95);
    ctx.shadowBlur = 14;
    ctx.fillStyle = "rgba(10,36,70,0.92)";
    ctx.strokeStyle = rgba(C.cyan, 1);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i += 1) {
      const angle = (i / 6) * TAU + Math.PI / 6;
      ctx.lineTo(Math.cos(angle) * 14, Math.sin(angle) * 14);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = rgba(C.white, 0.95);
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    if (chip.icon === "keys" || chip.icon === "link") {
      ctx.arc(-3, 0, 3.4, 0, TAU);
      ctx.moveTo(0.5, 0);
      ctx.lineTo(7, 0);
      ctx.moveTo(5, 0);
      ctx.lineTo(5, 3.5);
    } else if (chip.icon === "ticket" || chip.icon === "log" || chip.icon === "errors") {
      ctx.rect(-5, -6.5, 10, 13);
      ctx.moveTo(-2.5, -2.5);
      ctx.lineTo(2.5, -2.5);
      ctx.moveTo(-2.5, 1);
      ctx.lineTo(2.5, 1);
    } else {
      ctx.moveTo(-5, 6);
      ctx.lineTo(-5, 1);
      ctx.moveTo(0, 6);
      ctx.lineTo(0, -6);
      ctx.moveTo(5, 6);
      ctx.lineTo(5, -2);
    }
    ctx.stroke();
    ctx.restore();
  }

  private ship(ship: { x: number; y: number; angle: number; thrust: number }, time: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    ctx.scale(1.15, 1.15);
    if (ship.thrust > 0) {
      const flicker = this.reduced ? 0 : Math.sin(time * 40) * 3;
      const length = 12 + ship.thrust * 16 + flicker;
      const flame = ctx.createLinearGradient(-18, 0, -18 - length, 0);
      flame.addColorStop(0, "rgba(190,245,255,0.95)");
      flame.addColorStop(1, "rgba(56,160,245,0)");
      ctx.fillStyle = flame;
      ctx.beginPath();
      ctx.moveTo(-17, -5);
      ctx.lineTo(-18 - length, 0);
      ctx.lineTo(-17, 5);
      ctx.fill();
      if (!this.reduced && Math.random() < 0.5) {
        const back = { x: ship.x - Math.cos(ship.angle) * 22, y: ship.y - Math.sin(ship.angle) * 22 };
        this.particles.push({ x: back.x, y: back.y, vx: -Math.cos(ship.angle) * 30, vy: -Math.sin(ship.angle) * 30, life: 0.5, max: 0.5, rgb: C.cyan, size: 2 });
      }
    }
    ctx.shadowColor = rgba(C.cyan, 0.8);
    ctx.shadowBlur = 12;
    ctx.fillStyle = "#2f7df6";
    for (const side of [-1, 1]) {
      ctx.beginPath();
      ctx.moveTo(0, side * 7);
      ctx.lineTo(-13, side * 20);
      ctx.lineTo(-19, side * 18);
      ctx.lineTo(-13, side * 7);
      ctx.fill();
    }
    const body = ctx.createLinearGradient(0, -9, 0, 9);
    body.addColorStop(0, "#ffffff");
    body.addColorStop(1, "#9db4d6");
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(24, 0);
    ctx.lineTo(7, -7.5);
    ctx.lineTo(-13, -9);
    ctx.lineTo(-19, -5);
    ctx.lineTo(-19, 5);
    ctx.lineTo(-13, 9);
    ctx.lineTo(7, 7.5);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = "#0b2a4a";
    ctx.strokeStyle = rgba(C.cyan, 1);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(7, 0, 6.5, 3.6, 0, 0, TAU);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = rgba(C.cyan, 1);
    ctx.fillRect(-12, -8, 9, 2);
    ctx.fillRect(-12, 6, 9, 2);
    ctx.restore();
  }

  private effects(dt: number): void {
    const ctx = this.ctx;
    this.particles = this.particles.filter((particle) => (particle.life -= dt) > 0);
    for (const particle of this.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      ctx.fillStyle = rgba(particle.rgb, particle.life / particle.max);
      ctx.fillRect(particle.x, particle.y, particle.size, particle.size);
    }
    this.rings = this.rings.filter((ring) => (ring.life -= dt) > 0);
    for (const ring of this.rings) {
      const grow = this.reduced ? 0.5 : 1 - ring.life;
      ctx.strokeStyle = rgba(ring.rgb, ring.life);
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(ring.x, ring.y, 100 + grow * 70, 32 + grow * 24, 0, 0, TAU);
      ctx.stroke();
    }
    this.texts = this.texts.filter((text) => (text.life -= dt) > 0);
    ctx.font = "700 12px 'Exo 2', sans-serif";
    ctx.textAlign = "center";
    for (const text of this.texts) {
      const rise = this.reduced ? 24 : (1.6 - text.life) * 22 + 20;
      ctx.fillStyle = rgba(text.rgb, Math.min(1, text.life * 1.5));
      ctx.fillText(text.text, text.x, text.y - rise);
    }
  }
}

// World point of a checkpoint, for effects raised by the UI.
export function checkpointPoint(index: number): Point {
  return pointAt(SEGMENTS[index], 1);
}
