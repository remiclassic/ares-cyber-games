export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function $(selector: string): HTMLElement {
  const element = document.querySelector<HTMLElement>(selector);
  if (!element) throw new Error(`Missing element ${selector}`);
  return element;
}

export function announce(message: string): void {
  const live = $("#live");
  live.textContent = "";
  window.setTimeout(() => (live.textContent = message), 30);
}

export function pct(value: number): string {
  return `${Math.round(value * 100)}%`;
}

// ---------- settings ----------
export type Settings = { sound: boolean; reducedMotion: boolean; largeText: boolean; fast: boolean };

const SETTINGS_KEY = "ares-nd:settings";

export function loadSettings(): Settings {
  const prefersReduced = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  const defaults: Settings = { sound: true, reducedMotion: prefersReduced, largeText: false, fast: false };
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
  } catch {
    return defaults;
  }
}

export function saveSettings(settings: Settings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Non-essential.
  }
  document.documentElement.classList.toggle("large-text", settings.largeText);
  document.documentElement.classList.toggle("reduce-motion", settings.reducedMotion);
}

// ---------- modal ----------
export type ModalAction = Readonly<{
  label: string;
  primary?: boolean;
  onClick: () => void;
  keepOpen?: boolean;
}>;

type ModalOptions = Readonly<{
  title: string;
  kicker?: string;
  body: string;
  actions: readonly ModalAction[];
  dismissible?: boolean;
  wide?: boolean;
  onMount?: (root: HTMLElement) => void;
  onClose?: () => void;
}>;

let openModal: { close: () => void; dismissible: boolean } | null = null;

export function isModalOpen(): boolean {
  return openModal !== null;
}

export function closeModal(): void {
  openModal?.close();
}

export function showModal(options: ModalOptions): HTMLElement {
  closeModal();
  const root = $("#modal-root");
  const previousFocus = document.activeElement as HTMLElement | null;
  const backdrop = document.createElement("div");
  backdrop.className = "modal-backdrop";
  const titleId = `modal-title-${Math.random().toString(36).slice(2, 8)}`;
  backdrop.innerHTML = `
    <div class="modal ${options.wide ? "wide" : ""}" role="dialog" aria-modal="true" aria-labelledby="${titleId}">
      ${options.kicker ? `<div class="kicker">${esc(options.kicker)}</div>` : ""}
      <h2 id="${titleId}" tabindex="-1">${esc(options.title)}</h2>
      <div class="modal-body">${options.body}</div>
      <div class="actions"></div>
    </div>`;
  const actions = backdrop.querySelector(".actions")!;
  const close = () => {
    backdrop.remove();
    document.removeEventListener("keydown", onKey, true);
    openModal = null;
    options.onClose?.();
    if (previousFocus && document.contains(previousFocus)) previousFocus.focus();
  };
  options.actions.forEach((action) => {
    const button = document.createElement("button");
    button.className = `btn ${action.primary ? "primary" : ""}`;
    button.textContent = action.label;
    button.addEventListener("click", () => {
      if (!action.keepOpen) close();
      action.onClick();
    });
    actions.appendChild(button);
  });
  const onKey = (event: KeyboardEvent) => {
    if (event.key === "Escape" && options.dismissible) {
      event.preventDefault();
      event.stopPropagation();
      close();
      return;
    }
    if (event.key === "Tab") {
      const focusable = [...backdrop.querySelectorAll<HTMLElement>("button:not(:disabled), select, input, [href], [tabindex='0']")];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    event.stopPropagation();
  };
  document.addEventListener("keydown", onKey, true);
  root.appendChild(backdrop);
  openModal = { close, dismissible: !!options.dismissible };
  options.onMount?.(backdrop);
  const primary = backdrop.querySelector<HTMLElement>(".actions .btn.primary") ?? backdrop.querySelector<HTMLElement>("h2");
  primary?.focus();
  return backdrop;
}
