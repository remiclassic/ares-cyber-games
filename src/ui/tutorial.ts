import "./ftue.css";

// First-time walkthrough ("FTUE"), shared by every game: a short paged "How to play" shown before
// play and reopenable from a header button, plus a live "Next" bar that says what to do now and
// rings what to click. Self-contained (own modal, own `ftue-` / `tut-` styles) so it works on any
// page shell. While it is open it swallows key events, so game hotkeys never fire behind it.

export type TutorialPage = Readonly<{ title: string; body: string }>;

export type TutorialOptions = Readonly<{
  kicker: string;
  pages: readonly TutorialPage[];
  startLabel: string;
  onStart: () => void;
  startAt?: number;
  // True when reopened mid-game: Esc and "Close" dismiss it and nothing restarts.
  midGame?: boolean;
  // Runs when the last page mounts (settings checkboxes live there).
  onLastPage?: (root: HTMLElement) => void;
}>;

let current: { close: () => void } | null = null;

export function isTutorialOpen(): boolean {
  return current !== null;
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch]!);
}

export function showTutorial(options: TutorialOptions): void {
  const { pages } = options;
  current?.close();
  const previousFocus = document.activeElement as HTMLElement | null;
  const backdrop = document.createElement("div");
  backdrop.className = "ftue-backdrop";
  document.body.appendChild(backdrop);
  let index = Math.min(options.startAt ?? 0, pages.length - 1);

  const close = (): void => {
    backdrop.remove();
    window.removeEventListener("keydown", onKey, true);
    window.removeEventListener("keyup", swallow, true);
    window.removeEventListener("keypress", swallow, true);
    current = null;
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
  };
  const start = (): void => {
    close();
    options.onStart();
  };
  const swallow = (event: Event): void => {
    if (!backdrop.contains(event.target as Node)) event.stopPropagation();
  };
  const onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape" && options.midGame) {
      event.preventDefault();
      close();
    } else if (event.key === "Tab") {
      const focusable = [...backdrop.querySelectorAll<HTMLElement>("button:not(:disabled), input, [href]")];
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!backdrop.contains(document.activeElement)) {
        event.preventDefault();
        first?.focus();
      } else if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    } else if (!backdrop.contains(event.target as Node)) {
      // Keys aimed at the game behind the dialog: keep them from the game.
      event.preventDefault();
    }
    event.stopPropagation();
  };

  const render = (): void => {
    const page = pages[index];
    const last = index === pages.length - 1;
    const dots = pages
      .map((entry, i) => `<button type="button" class="tut-dot ${i === index ? "on" : i < index ? "seen" : ""}" data-page="${i}" aria-label="Step ${i + 1}: ${escapeHtml(entry.title)}" ${i === index ? 'aria-current="step"' : ""}></button>`)
      .join("");
    const buttons = [
      !last ? `<button type="button" class="ftue-btn" data-do="skip">${options.midGame ? "Close" : "Skip to the game"}</button>` : "",
      index > 0 ? `<button type="button" class="ftue-btn" data-do="back">← Back</button>` : "",
      last ? `<button type="button" class="ftue-btn primary" data-do="start">${escapeHtml(options.startLabel)}</button>` : `<button type="button" class="ftue-btn primary" data-do="next">Next →</button>`,
    ].join("");
    backdrop.innerHTML = `
      <div class="ftue-modal" role="dialog" aria-modal="true" aria-labelledby="ftue-title">
        <div class="ftue-kicker">${escapeHtml(options.kicker)} · Step ${index + 1} of ${pages.length}</div>
        <h2 id="ftue-title" tabindex="-1">${escapeHtml(page.title)}</h2>
        <div class="ftue-body"><div class="tut-dots" role="group" aria-label="Tutorial steps">${dots}</div>${page.body}</div>
        <div class="ftue-actions">${buttons}</div>
      </div>`;
    backdrop.querySelectorAll<HTMLElement>(".tut-dot").forEach((dot) =>
      dot.addEventListener("click", () => {
        index = Number(dot.dataset.page);
        render();
      }),
    );
    backdrop.querySelector(".ftue-actions")!.addEventListener("click", (event) => {
      const action = (event.target as HTMLElement).closest<HTMLElement>("[data-do]")?.dataset.do;
      if (action === "next") index += 1;
      else if (action === "back") index -= 1;
      else if (action === "skip") return options.midGame ? close() : start();
      else if (action === "start") return start();
      else return;
      render();
    });
    if (last) options.onLastPage?.(backdrop);
    backdrop.querySelector<HTMLElement>(".ftue-btn.primary")?.focus();
  };

  window.addEventListener("keydown", onKey, true);
  window.addEventListener("keyup", swallow, true);
  window.addEventListener("keypress", swallow, true);
  current = { close };
  render();
}

// A "How to play" button. By default it goes under the game title (`.top .title`); pass a
// container selector for other page shells. With no container found it floats top-right.
export function addHelpButton(onClick: () => void, container = ".top .title"): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "help-btn";
  button.innerHTML = `<span aria-hidden="true">?</span>How to play`;
  button.addEventListener("click", onClick);
  const host = document.querySelector(container);
  if (host) host.appendChild(button);
  else {
    button.classList.add("floating");
    document.body.appendChild(button);
  }
  return button;
}

export type NextStep = Readonly<{
  label?: string; // "Next" by default; e.g. "Ready", "Check", "Done", "Running"
  tone?: "" | "ready" | "warn";
  text: string; // HTML: one plain instruction
  hint?: string; // HTML: optional second line
  targets?: readonly string[]; // selectors to ring with the pulsing nudge
}>;

// Renders the live "Next" bar into `bar` and moves the pulsing ring to the step's targets. Only
// rewrites the bar when the instruction changes, so its live region does not chatter.
export function renderNextStep(bar: HTMLElement, step: NextStep): void {
  const html = `<b>${step.label ?? "Next"}</b><span>${step.text}${step.hint ? `<span class="sub-hint">${step.hint}</span>` : ""}</span>`;
  if (bar.dataset.html !== html) {
    bar.className = `next-bar ${step.tone ?? ""}`;
    bar.innerHTML = html;
    bar.dataset.html = html;
  }
  if (!bar.hasAttribute("aria-live")) bar.setAttribute("aria-live", "polite");
  document.querySelectorAll(".nudge").forEach((element) => element.classList.remove("nudge"));
  for (const selector of step.targets ?? []) document.querySelector(selector)?.classList.add("nudge");
}
