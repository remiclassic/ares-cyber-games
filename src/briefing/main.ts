import "./style.css";
import { $ } from "../ui/dom";
import { SLIDES } from "./slides";

// Briefing deck: a fixed 1920×1080 stage scaled to fit. `?render=N` shows slide N alone at full
// size with an empty video box, for tools/make_briefing_video.py to screenshot.

const params = new URLSearchParams(location.search);
const render = params.get("render");
const stage = $("#stage");
let index = 0;

function slideHtml(i: number, still: boolean): string {
  const s = SLIDES[i];
  const media = s.video
    ? `<div class="vbox" id="vbox">${still ? "" : `<video src="${s.video.loop}" muted loop autoplay playsinline aria-hidden="true"></video>`}</div>`
    : "";
  return `<article class="slide ${s.kind}${s.video ? " has-video" : ""}">
    <div class="body">${s.html}</div>${media}
    <footer class="foot"><span>Ares Cyber Games · Briefing</span><span>${i + 1} / ${SLIDES.length}</span></footer>
  </article>`;
}

function fit(): void {
  const box = $("#viewport");
  stage.style.transform = `scale(${box.clientWidth / 1920})`;
}

function show(i: number): void {
  index = Math.max(0, Math.min(SLIDES.length - 1, i));
  stage.innerHTML = slideHtml(index, false);
  $("#count").textContent = `${index + 1} / ${SLIDES.length}`;
  $("#notes").textContent = SLIDES[index].say;
  ($("#prev") as HTMLButtonElement).disabled = index === 0;
  ($("#next") as HTMLButtonElement).disabled = index === SLIDES.length - 1;
  history.replaceState(null, "", `#${index + 1}`);
}

if (render) {
  document.body.className = "render";
  document.body.innerHTML = `<div class="stage">${slideHtml(Number(render) - 1, true)}</div>`;
} else {
  $("#prev").addEventListener("click", () => show(index - 1));
  $("#next").addEventListener("click", () => show(index + 1));
  $("#full").addEventListener("click", () => void $("#viewport").requestFullscreen?.());
  $("#viewport").addEventListener("click", (e) => {
    if ((e.target as HTMLElement).closest("a")) return;
    show(index + 1);
  });
  document.addEventListener("keydown", (e) => {
    if ((e.target as HTMLElement).closest("video, input")) return;
    if (e.key === "ArrowRight" || e.key === " " || e.key === "PageDown") { e.preventDefault(); show(index + 1); }
    else if (e.key === "ArrowLeft" || e.key === "PageUp") { e.preventDefault(); show(index - 1); }
    else if (e.key === "Home") show(0);
    else if (e.key === "End") show(SLIDES.length - 1);
    else if (e.key.toLowerCase() === "f") void $("#viewport").requestFullscreen?.();
  });
  new ResizeObserver(fit).observe($("#viewport"));
  document.addEventListener("fullscreenchange", fit);
  show(Number(location.hash.slice(1)) - 1 || 0);
  fit();
}
