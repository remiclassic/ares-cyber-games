import { $, esc, showModal } from "./dom";

// First-time walkthrough: a short paged "How to play" shown before play, and reopenable at any
// time from the header button. Each page is one idea, with a picture where a picture helps.

export type TutorialPage = Readonly<{ title: string; body: string }>;

type TutorialOptions = Readonly<{
  kicker: string;
  pages: readonly TutorialPage[];
  startLabel: string;
  onStart: () => void;
  startAt?: number;
  // True when reopened mid-game: Esc closes it and nothing restarts.
  midGame?: boolean;
  // Runs when the last page mounts (settings checkboxes live there).
  onLastPage?: (root: HTMLElement) => void;
}>;

export function showTutorial(options: TutorialOptions): void {
  const { pages } = options;
  const open = (index: number): void => {
    const last = index === pages.length - 1;
    const page = pages[index];
    const dots = pages
      .map((entry, i) => `<button type="button" class="tut-dot ${i === index ? "on" : i < index ? "seen" : ""}" data-page="${i}" aria-label="Step ${i + 1}: ${esc(entry.title)}" ${i === index ? 'aria-current="step"' : ""}></button>`)
      .join("");
    showModal({
      kicker: `${options.kicker} · Step ${index + 1} of ${pages.length}`,
      title: page.title,
      wide: true,
      dismissible: !!options.midGame,
      body: `<div class="tut-dots" role="group" aria-label="Tutorial steps">${dots}</div>${page.body}`,
      actions: [
        ...(!last ? [{ label: options.midGame ? "Close" : "Skip to the game", onClick: () => (options.midGame ? undefined : options.onStart()) }] : []),
        ...(index > 0 ? [{ label: "← Back", keepOpen: true, onClick: () => open(index - 1) }] : []),
        last ? { label: options.startLabel, primary: true, onClick: options.onStart } : { label: "Next →", primary: true, keepOpen: true, onClick: () => open(index + 1) },
      ],
      onMount: (root) => {
        root.querySelector(".modal")?.classList.add("tut");
        root.querySelectorAll<HTMLElement>(".tut-dot").forEach((dot) => dot.addEventListener("click", () => open(Number(dot.dataset.page))));
        if (last) options.onLastPage?.(root);
      },
    });
  };
  open(Math.min(options.startAt ?? 0, pages.length - 1));
}

// A "How to play" button in the game header, below the title.
export function addHelpButton(onClick: () => void): void {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "help-btn";
  button.innerHTML = `<span aria-hidden="true">?</span>How to play`;
  button.addEventListener("click", onClick);
  $(".top .title").appendChild(button);
}
