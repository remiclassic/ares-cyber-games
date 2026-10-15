import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { play, setSoundEnabled } from "../../ui/audio";
import { renderNextStep, showTutorial } from "../../ui/tutorial";
import { COURSE_MISSION, SHIFTS, SME_NOTICE, shiftById } from "../data/scenarios";
import { ACTIVITY_ID, createDispatchHost } from "../host";
import { COST, availableQuestions, canReopen, createShift, handoffBlocker, nextEventTime, step } from "../sim/engine";
import { BADGES, PRIORITY_LABEL, debriefMoments, earnedBadges, outcomeText, scenarioOf, scoreShift } from "../sim/scoring";
import type { Action, CaseState, DeptId, FeedItem, Priority, Scenario, ShiftDef, ShiftState } from "../sim/types";
import { CompanyMap, type DeptStatus, Mascot, Portrait } from "./art";
import { bindSettings, nextStep, tutorialPages } from "./tutorial";

type Screen = "game" | "debrief";
export type Settings = { sound: boolean; motion: boolean; largeText: boolean; hints: boolean };
type GameAction = Action | { type: "RESET"; shiftId: string };

const PRIORITIES: Priority[] = ["low", "medium", "high"];

function reducer(state: ShiftState, action: GameAction): ShiftState {
  if (action.type === "RESET") return createShift(shiftById(action.shiftId));
  return step(shiftById(state.shiftId), state, action);
}

function clockLabel(def: ShiftDef, minute: number): string {
  const total = def.startMinutes + Math.round(minute);
  const hour = Math.floor(total / 60);
  return `${((hour + 11) % 12) + 1}:${String(total % 60).padStart(2, "0")} ${hour >= 12 ? "PM" : "AM"}`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

// The walkthrough opens once per page load, even under StrictMode's double effects.
let tutorialShown = false;

export function App() {
  const [screen, setScreen] = useState<Screen>("game");
  const [state, dispatch] = useReducer(reducer, SHIFTS[0].id, (id) => createShift(shiftById(id)));
  const [settings, setSettings] = useState<Settings>(() => ({
    sound: true,
    motion: !window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    largeText: false,
    hints: true,
  }));
  const host = useMemo(createDispatchHost, []);
  const def = shiftById(state.shiftId);

  useEffect(() => setSoundEnabled(settings.sound), [settings.sound]);

  // Side effects follow the recorded log, never the other way round.
  const reported = useRef({ log: 0, feed: 0, done: false, live: false });
  useEffect(() => {
    if (!reported.current.live) return;
    for (const entry of state.log.slice(reported.current.log)) {
      host.record({ verb: entry.kind, object: entry.caseId ?? state.shiftId, detail: entry.detail, shiftMinute: entry.at });
    }
    reported.current.log = state.log.length;
    const fresh = state.feed.slice(reported.current.feed);
    reported.current.feed = state.feed.length;
    const last = fresh[fresh.length - 1];
    if (last) play(last.tone === "bad" ? "alarm" : last.tone === "badge" ? "success" : last.tone === "good" ? "deliver" : "click");
    if (state.phase === "ended" && !reported.current.done) {
      reported.current.done = true;
      host.complete({
        activityId: ACTIVITY_ID,
        completed: true,
        completedAt: new Date().toISOString(),
        shiftId: state.shiftId,
        score: scoreShift(def, state),
        badges: earnedBadges(def, state),
        log: state.log,
      });
    }
  }, [state, screen, host, def]);

  const start = (shiftId: string) => {
    reported.current = { log: 0, feed: 0, done: false, live: true };
    dispatch({ type: "RESET", shiftId });
    host.started(shiftId);
    setScreen("game");
  };

  // "How to play" replaces the old one-screen intro. Settings live on its last page; a replay
  // opens there. The shift clock only moves when the player acts, so nothing needs pausing.
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const openTutorial = (mode: "first" | "replay" | "help", shift: ShiftDef) => {
    const pages = tutorialPages(shift, mode === "replay");
    showTutorial({
      kicker: "Cyber Dispatch · How to play",
      pages,
      startAt: mode === "replay" ? pages.length - 1 : 0,
      midGame: mode === "help",
      startLabel: mode === "help" ? "Back to the game" : `Start ${shift.label.toLowerCase()}`,
      onStart: () => {
        if (mode !== "help") document.querySelector<HTMLElement>(".cd-report")?.focus();
      },
      onLastPage: (root) => bindSettings(root, settingsRef.current, (key, value) => setSettings((prev) => ({ ...prev, [key]: value }))),
    });
  };
  const begin = (shiftId: string, mode: "first" | "replay") => {
    start(shiftId);
    openTutorial(mode, shiftById(shiftId));
  };

  useEffect(() => {
    if (tutorialShown) return;
    tutorialShown = true;
    begin(SHIFTS[0].id, "first");
  }, []);

  return (
    <div className="cd" data-motion={settings.motion ? "full" : "reduce"} data-text={settings.largeText ? "large" : "normal"}>
      <a className="cd-skip" href="#cd-main">Skip to content</a>
      {screen === "game" && (
        <Game def={def} state={state} dispatch={dispatch} settings={settings} setSettings={setSettings} onDebrief={() => setScreen("debrief")} onHelp={() => openTutorial("help", def)} />
      )}
      {screen === "debrief" && <Debrief def={def} state={state} onRetry={() => begin(def.id, "replay")} onVariant={() => begin(SHIFTS.find((s) => s.id !== def.id)?.id ?? def.id, "replay")} />}
      <p className="cd-sme">Gameplay prototype <span aria-hidden="true">•</span> {SME_NOTICE}</p>
    </div>
  );
}

// ---------- shared bits ----------

function Logo() {
  return (
    <div className="cd-logo">
      <b>ARES</b>
      <span>Cyber Dispatch</span>
    </div>
  );
}

function SettingsBar({ settings, setSettings }: { settings: Settings; setSettings: (next: Settings) => void }) {
  const toggle = (key: keyof Settings, label: string) => (
    <button type="button" className="cd-toggle" aria-pressed={settings[key]} onClick={() => setSettings({ ...settings, [key]: !settings[key] })}>
      {label}
    </button>
  );
  return (
    <div className="cd-settings" role="group" aria-label="Settings">
      {toggle("sound", "Sound")}
      {toggle("motion", "Motion")}
      {toggle("largeText", "Larger text")}
      {toggle("hints", "Hints")}
    </div>
  );
}

// ---------- game ----------

type GameProps = {
  def: ShiftDef;
  state: ShiftState;
  dispatch: (action: GameAction) => void;
  settings: Settings;
  setSettings: (next: Settings) => void;
  onDebrief: () => void;
  onHelp: () => void;
};

function statusChip(def: ShiftDef, state: ShiftState, c: CaseState): { text: string; tone: string } {
  if (c.status === "resolved") return { text: "Closed", tone: "done" };
  if (c.status === "assigned") {
    const analyst = state.analysts.find((a) => a.id === c.handoff?.analystId);
    return { text: `With ${analyst?.name ?? "analyst"}`, tone: "busy" };
  }
  // The learner's own judgement, never the authored answer.
  if (c.priority) return { text: `You: ${PRIORITY_LABEL[c.priority]}`, tone: c.priority };
  return { text: `${def.day} ${clockLabel(def, c.arrivesAt)}`, tone: "plain" };
}

function Game({ def, state, dispatch, settings, setSettings, onDebrief, onHelp }: GameProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const [mode, setMode] = useState<"ask" | "guide">("ask");
  const [seen, setSeen] = useState<string[]>([]);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const panelRef = useRef<HTMLHeadingElement>(null);
  const arrived = state.cases.filter((c) => c.status !== "pending");
  const current = arrived.find((c) => c.id === selected) ?? null;
  const ended = state.phase === "ended";

  const open = (caseId: string) => {
    setSelected(caseId);
    setSeen((list) => (list.includes(caseId) ? list : [...list, caseId]));
    requestAnimationFrame(() => panelRef.current?.focus());
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      const index = ["1", "2", "3"].indexOf(event.key);
      if (index >= 0 && arrived[index]) open(arrived[index].id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const deptStatus = useMemo(() => {
    const map: Record<DeptId, DeptStatus> = { finance: "calm", hr: "calm", marketing: "calm", product: "calm", it: "calm" };
    for (const c of arrived) {
      const sc = scenarioOf(def, c.id);
      map[sc.reporter.dept] = c.harmedAt !== null ? "harm" : c.status === "resolved" ? "resolved" : "report";
      if (c.harmCause === "deadline") for (const dept of sc.harm?.depts ?? []) map[dept] = "harm";
    }
    return map;
  }, [arrived, def]);

  const latest = state.feed[state.feed.length - 1];
  const resolved = state.cases.filter((c) => c.status === "resolved").length;
  const free = state.analysts.filter((a) => a.busyUntil <= state.clock).length;
  const hint = settings.hints ? coachHint(def, state, current, seen) : null;

  // The live "Next" bar: the one thing to do now, read from what is on screen.
  const barRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (barRef.current) renderNextStep(barRef.current, nextStep({ def, state, current, seen, mode }));
  });
  useEffect(() => () => document.querySelectorAll(".nudge").forEach((el) => el.classList.remove("nudge")), []);

  return (
    <>
      <header className="cd-hud">
        <Logo />
        <div className="cd-tile">
          <span className="cd-label">{def.label}</span>
          <b>{def.day} {clockLabel(def, state.clock)}</b>
          <div className="cd-bar" role="progressbar" aria-label="Shift time used" aria-valuemin={0} aria-valuemax={def.length} aria-valuenow={state.clock}>
            <i style={{ width: `${(state.clock / def.length) * 100}%` }} />
          </div>
        </div>
        <div className="cd-tile">
          <span className="cd-label">Cases closed</span>
          <b>{resolved} / {state.cases.length}</b>
        </div>
        <div className="cd-tile">
          <span className="cd-label">Analysts available</span>
          <b>{free} / {state.analysts.length}</b>
        </div>
        <Toast item={latest} />
        <div className="cd-hud-end">
          <SettingsBar settings={settings} setSettings={setSettings} />
          <div className="cd-hud-row">
            <button type="button" className="help-btn" onClick={onHelp}>
              <span aria-hidden="true">?</span>How to play
            </button>
            {confirmEnd ? (
              <span className="cd-confirm">
                End now? Open reports score nothing.
                <button type="button" className="cd-btn small danger" onClick={() => dispatch({ type: "END_SHIFT" })}>End shift</button>
                <button type="button" className="cd-btn small" onClick={() => setConfirmEnd(false)}>Keep going</button>
              </span>
            ) : (
              <button type="button" className="cd-btn small" onClick={() => setConfirmEnd(true)} disabled={ended}>End shift</button>
            )}
          </div>
        </div>
      </header>

      <div ref={barRef} className="next-bar" aria-live="polite" />

      <main id="cd-main" className="cd-main">
        <section className="cd-panel cd-reports" aria-labelledby="cd-reports-title">
          <h2 id="cd-reports-title">Incoming reports ({arrived.length})</h2>
          <ul>
            {state.cases.map((c, i) => {
              const sc = scenarioOf(def, c.id);
              if (c.status === "pending") {
                return (
                  <li key={c.id} className="cd-report empty">
                    <span>Line {i + 1} is quiet</span>
                  </li>
                );
              }
              const chip = statusChip(def, state, c);
              const isNew = !seen.includes(c.id);
              return (
                <li key={c.id}>
                  <button type="button" data-case={c.id} className={`cd-report${selected === c.id ? " selected" : ""}${isNew ? " new" : ""}`} aria-current={selected === c.id} onClick={() => open(c.id)}>
                    <Portrait who={sc.reporter.id} mood={c.mood} className="cd-face" />
                    <span className="cd-report-body">
                      <span className="cd-report-title">
                        <i className="cd-alert" aria-hidden="true">!</i>
                        {sc.title}
                      </span>
                      <span className="cd-report-who">{sc.reporter.name}</span>
                      <span className="cd-report-meta">
                        <span>{sc.reporter.deptLabel}</span>
                        <span className={`cd-chip ${chip.tone}`}>{isNew ? "New" : chip.text}</span>
                      </span>
                      {c.status === "assigned" && c.handoff && <CaseProgress from={c.handoff.at} to={c.handoff.endsAt} now={state.clock} />}
                    </span>
                    <kbd aria-hidden="true">{i + 1}</kbd>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="cd-notepad" aria-hidden="true">
            <b>Small questions prevent big incidents</b>
            <span>Ask · Prioritise · Guide · Hand off</span>
          </div>
        </section>

        <div className="cd-centre">
          <section className="cd-analysts" aria-label="Analysts">
            {state.analysts.map((a) => {
              const busy = a.busyUntil > state.clock;
              const task = a.task && a.task !== "earlier" ? scenarioOf(def, a.task).title : a.task ? "Earlier ticket" : null;
              return (
                <div key={a.id} className={`cd-analyst${busy ? " busy" : ""}`}>
                  <div className="cd-desk" aria-hidden="true">
                    <Portrait who={a.id} mood={busy ? "neutral" : "relieved"} className="cd-face" />
                    <span className="cd-monitor" />
                  </div>
                  <div className="cd-analyst-info">
                    <b>{a.name}</b>
                    <span className={busy ? "cd-busy" : "cd-free"}>{busy ? `Investigating until ${clockLabel(def, a.busyUntil)}` : "Available"}</span>
                    {busy && task && <span key={a.task} className="cd-ticket">{task}</span>}
                    <CaseProgress from={a.busyFrom} to={a.busyUntil} now={busy ? state.clock : a.busyUntil} idle={!busy} />
                  </div>
                </div>
              );
            })}
          </section>

          <section className="cd-panel cd-case" aria-labelledby="cd-case-title">
            {current ? (
              <CasePanel def={def} state={state} c={current} dispatch={dispatch} headingRef={panelRef} mode={mode} setMode={setMode} />
            ) : (
              <div className="cd-empty">
                <h2 id="cd-case-title" ref={panelRef} tabIndex={-1}>No report open</h2>
                <p>Choose a report from the list on the left.</p>
              </div>
            )}
          </section>

          {hint && (
            <aside className="cd-coach" aria-label="Hint">
              <Mascot className="cd-mascot" />
              <p>{hint}</p>
            </aside>
          )}
        </div>

        <div className="cd-right">
          <section className="cd-panel cd-network" aria-labelledby="cd-network-title">
            <h2 id="cd-network-title">Company network</h2>
            <CompanyMap status={deptStatus} focus={current ? scenarioOf(def, current.id).reporter.dept : null} />
          </section>
          <section className="cd-panel cd-handoff" aria-labelledby="cd-handoff-title">
            <h2 id="cd-handoff-title">Handoff</h2>
            {current ? <HandoffPanel def={def} state={state} c={current} dispatch={dispatch} /> : <p className="cd-muted">Evidence, priority and handoff for the open report appear here.</p>}
          </section>
        </div>
      </main>

      <div className="cd-sr" aria-live="polite">{latest ? `${latest.title}. ${latest.detail}` : ""}</div>

      {ended && (
        <div className="cd-overlay" role="dialog" aria-modal="true" aria-labelledby="cd-end-title">
          <div className="cd-panel cd-end">
            <h2 id="cd-end-title">Shift over at {clockLabel(def, state.clock)}</h2>
            <p>{resolved} of {state.cases.length} cases closed. Closing is not the score: the debrief looks at what your choices did.</p>
            <button type="button" className="cd-btn primary big" onClick={onDebrief} autoFocus>Review the outcome</button>
          </div>
        </div>
      )}
    </>
  );
}

function CaseProgress({ from, to, now, idle }: { from: number; to: number; now: number; idle?: boolean }) {
  const ratio = idle || to <= from ? 0 : Math.min(1, Math.max(0, (now - from) / (to - from)));
  return (
    <span className="cd-bar" aria-hidden="true">
      <i style={{ width: `${ratio * 100}%` }} />
    </span>
  );
}

function Toast({ item }: { item: FeedItem | undefined }) {
  if (!item) return <div className="cd-toast info" />;
  return (
    <div key={item.id} className={`cd-toast ${item.tone}`}>
      <b>{item.title}</b>
      <span>{item.detail}</span>
    </div>
  );
}

function coachHint(def: ShiftDef, state: ShiftState, current: CaseState | null, seen: string[]): string | null {
  const waiting = state.cases.find((c) => c.status === "open" && !seen.includes(c.id));
  if (!current) return waiting ? `${scenarioOf(def, waiting.id).reporter.first} has sent a report. Open it from the list on the left.` : null;
  const sc = scenarioOf(def, current.id);
  const who = sc.reporter.first;
  if (waiting && waiting.id !== current.id) return `A new report from ${scenarioOf(def, waiting.id).reporter.first} is waiting. You do not know yet how urgent it is.`;
  if (current.status === "assigned") return "The analyst is working. You can recall them if another report needs them more.";
  if (current.status !== "open") return null;
  // Step-by-step guidance for the first report only.
  if (state.cases.some((c) => c.handoff !== null || c.reopens > 0)) return null;
  if (current.asked.length === 0 && current.guidanceLog.length === 0) return `Ask ${who} a question. Each one takes ${COST.ask} minutes, so start with what you most need to know.`;
  if (current.guidanceLog.length === 0 && current.facts.length < 2) return `Evidence is recorded in the Handoff panel. If ${who} needs a safe next step right now, give it and keep asking afterwards.`;
  if (current.priority === null) return "Set a priority your evidence supports. You can revise it when you learn more.";
  if (current.guidanceLog.length === 0) return `Switch to "Give a next step" and tell ${who} what to do.`;
  if (sc.claims.some((claim) => current.claims[claim.id] === undefined)) return "For each point, mark Confirmed if your evidence settles it and Unresolved if it is still an open question.";
  return "Hand off: assign an analyst if the case needs one, or close with guidance if it does not.";
}

type CasePanelProps = {
  def: ShiftDef;
  state: ShiftState;
  c: CaseState;
  dispatch: (a: GameAction) => void;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  mode: "ask" | "guide";
  setMode: (mode: "ask" | "guide") => void;
};

function CasePanel({ def, state, c, dispatch, headingRef, mode, setMode }: CasePanelProps) {
  const sc = scenarioOf(def, c.id);
  const logRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight });
  }, [c.transcript.length, c.id]);

  const steps: [string, boolean][] = [
    ["Ask", c.facts.length > 0],
    ["Prioritise", c.priority !== null],
    ["Guide", c.guidanceLog.length > 0],
    ["Hand off", c.handoff !== null],
  ];

  return (
    <>
      <header className="cd-case-head">
        <Portrait who={sc.reporter.id} mood={c.mood} className="cd-face big" />
        <div>
          <h2 id="cd-case-title" ref={headingRef} tabIndex={-1}>{sc.title}</h2>
          <p>{sc.reporter.name} <span aria-hidden="true">·</span> {sc.reporter.deptLabel} <span aria-hidden="true">·</span> reported {clockLabel(def, c.arrivesAt)}</p>
        </div>
        <ol className="cd-checklist" aria-label="Progress on this report">
          {steps.map(([label, done]) => (
            <li key={label} className={done ? "done" : ""}>
              <span aria-hidden="true">{done ? "✓" : "○"}</span> {label}
              <span className="cd-sr">{done ? " done" : " not done"}</span>
            </li>
          ))}
        </ol>
      </header>

      <div className="cd-log" ref={logRef} role="log" aria-label={`Conversation with ${sc.reporter.first}`} tabIndex={0}>
        {c.transcript.map((line, i) => (
          <p key={i} className={`cd-line ${line.speaker}`}>
            <span className="cd-sr">{line.speaker === "you" ? "You: " : line.speaker === "them" ? `${sc.reporter.first}: ` : "What happened: "}</span>
            {line.text}
          </p>
        ))}
      </div>

      {c.status === "open" ? (
        <>
          <div className="cd-modes" role="group" aria-label="What to do next">
            <button type="button" data-mode="ask" aria-pressed={mode === "ask"} onClick={() => setMode("ask")}>Ask a question <small>{COST.ask} min each</small></button>
            <button type="button" data-mode="guide" aria-pressed={mode === "guide"} onClick={() => setMode("guide")}>Give a next step <small>{COST.guidance} min</small></button>
          </div>
          <ul className="cd-choices">
            {mode === "ask"
              ? availableQuestions(sc, c).map((q) => {
                  const asked = c.asked.includes(q.id);
                  return (
                    <li key={q.id}>
                      <button type="button" className={`cd-choice${asked ? " asked" : ""}`} onClick={() => dispatch({ type: "ASK", caseId: c.id, questionId: q.id })}>
                        <span className="cd-choice-icon" aria-hidden="true">{asked ? "✓" : "?"}</span>
                        {q.label}
                        {asked && <small>asked</small>}
                      </button>
                    </li>
                  );
                })
              : sc.guidance.map((g) => {
                  const given = c.guidanceLog.some((x) => x.id === g.id);
                  return (
                    <li key={g.id}>
                      <button type="button" className={`cd-choice guide${given ? " asked" : ""}`} onClick={() => dispatch({ type: "GIVE_GUIDANCE", caseId: c.id, guidanceId: g.id })}>
                        <span className="cd-choice-icon" aria-hidden="true">➜</span>
                        {g.label}
                        {given && <small>said</small>}
                      </button>
                    </li>
                  );
                })}
          </ul>
        </>
      ) : (
        <div className="cd-closed">
          <p>
            {c.status === "assigned"
              ? `${state.analysts.find((a) => a.id === c.handoff?.analystId)?.name} is working this case until ${clockLabel(def, c.handoff?.endsAt ?? 0)}.`
              : c.handoff?.route === "guidance"
                ? "You closed this report with guidance only."
                : "The analyst has finished this case."}
          </p>
          {canReopen(c) && state.phase === "playing" && (
            <button type="button" className="cd-btn" onClick={() => dispatch({ type: "REOPEN", caseId: c.id })}>
              {c.status === "assigned" ? "Recall analyst and reopen" : "Reopen report"} <small>{COST.reopen} min</small>
            </button>
          )}
        </div>
      )}
    </>
  );
}

function HandoffPanel({ def, state, c, dispatch }: { def: ShiftDef; state: ShiftState; c: CaseState; dispatch: (a: GameAction) => void }) {
  const sc: Scenario = scenarioOf(def, c.id);
  const locked = c.status !== "open";
  const blockAnalyst = handoffBlocker(c, "analyst");
  const blockClose = handoffBlocker(c, "guidance");
  const allBusy = state.analysts.every((a) => a.busyUntil > state.clock);

  return (
    <>
      <div className="cd-handoff-head">
        <Portrait who={sc.reporter.id} mood={c.mood} className="cd-face" />
        <div>
          <b>{sc.title}</b>
          <span>{sc.reporter.name} · {sc.reporter.deptLabel}</span>
          <span className="cd-tags">
            {c.priority && <span className={`cd-chip ${c.priority}`}>{PRIORITY_LABEL[c.priority]}</span>}
            <span className="cd-chip plain">{sc.tag}</span>
          </span>
        </div>
      </div>

      <h3>Evidence recorded ({c.facts.length})</h3>
      {c.facts.length === 0 ? (
        <p className="cd-muted">Nothing yet. Useful answers are recorded here.</p>
      ) : (
        <ul className="cd-evidence">
          {c.facts.map((id) => (
            <li key={id}>{sc.facts.find((f) => f.id === id)?.text}</li>
          ))}
        </ul>
      )}

      <h3 id="cd-prio-label">Priority</h3>
      <div className="cd-seg cd-prio-seg" role="radiogroup" aria-labelledby="cd-prio-label">
        {PRIORITIES.map((p) => (
          <button key={p} type="button" role="radio" aria-checked={c.priority === p} className={`cd-prio ${p}`} disabled={locked} onClick={() => dispatch({ type: "SET_PRIORITY", caseId: c.id, priority: p })}>
            {PRIORITY_LABEL[p]}
          </button>
        ))}
      </div>

      <h3>Do you hold evidence on each point?</h3>
      <ul className="cd-claims">
        {sc.claims.map((claim) => (
          <li key={claim.id}>
            <span id={`cd-claim-${claim.id}`}>{claim.text}</span>
            <span className="cd-seg small" role="radiogroup" aria-labelledby={`cd-claim-${claim.id}`}>
              {(["confirmed", "unresolved"] as const).map((mark) => (
                <button key={mark} type="button" role="radio" aria-checked={c.claims[claim.id] === mark} disabled={locked} onClick={() => dispatch({ type: "MARK_CLAIM", caseId: c.id, claimId: claim.id, mark })}>
                  {mark === "confirmed" ? "Confirmed" : "Unresolved"}
                </button>
              ))}
            </span>
          </li>
        ))}
      </ul>

      {!locked && (
        <div className="cd-actions">
          {state.analysts.map((a) => {
            const busy = a.busyUntil > state.clock;
            return (
              <button key={a.id} type="button" className="cd-btn assign" disabled={busy || blockAnalyst !== null} onClick={() => dispatch({ type: "HANDOFF", caseId: c.id, route: "analyst", analystId: a.id })}>
                Assign analyst ({a.name})
                <small>{busy ? `busy until ${clockLabel(def, a.busyUntil)}` : `about ${sc.analystMinutes} min`}</small>
              </button>
            );
          })}
          <button type="button" className="cd-btn" disabled={blockClose !== null} onClick={() => dispatch({ type: "HANDOFF", caseId: c.id, route: "guidance" })}>
            Close with guidance only
            <small>no analyst</small>
          </button>
          {allBusy && (
            <button type="button" className="cd-btn" onClick={() => dispatch({ type: "WAIT" })}>
              Wait
              <small>until {clockLabel(def, nextEventTime(def, state))}</small>
            </button>
          )}
          {(blockAnalyst ?? blockClose) && <p className="cd-muted" role="note">{blockAnalyst ?? blockClose}</p>}
        </div>
      )}
    </>
  );
}

// ---------- debrief ----------

function Debrief({ def, state, onRetry, onVariant }: { def: ShiftDef; state: ShiftState; onRetry: () => void; onVariant: () => void }) {
  const score = scoreShift(def, state);
  const moments = debriefMoments(def, state);
  const badges = earnedBadges(def, state);
  const parts: [string, number, string][] = [
    ["Evidence quality", score.evidence, "Key facts recorded, less time spent on questions that added nothing."],
    ["Justified priority", score.priority, "The right level, set when your evidence supported it."],
    ["Guidance", score.guidance, "A safe, approved next step, given before harm was done."],
    ["Handoff", score.handoff, "The right owner, with confirmed facts kept apart from open questions."],
  ];
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);

  return (
    <main id="cd-main" className="cd-debrief">
      <Logo />
      <h1 ref={headingRef} tabIndex={-1}>{def.label} debrief</h1>

      <section className="cd-panel cd-score" aria-labelledby="cd-score-title">
        <div className="cd-total">
          <h2 id="cd-score-title">Decision quality</h2>
          <b>{score.total}<small> / 100</small></b>
        </div>
        <ul className="cd-parts">
          {parts.map(([label, value, note]) => (
            <li key={label}>
              <span>{label}</span>
              <span className="cd-bar" aria-hidden="true"><i style={{ width: `${(value / 25) * 100}%` }} /></span>
              <b>{value} / 25</b>
              <small>{note}</small>
            </li>
          ))}
        </ul>
        <div className="cd-time">
          <h3>Response time <small>(not part of the score)</small></h3>
          <p>
            Shift time used: <b>{state.clock} of {def.length} min</b>
            <br />
            Average report-to-handoff: <b>{score.averageMinutesToHandoff === null ? "no handoffs" : `${score.averageMinutesToHandoff} min`}</b>
          </p>
        </div>
      </section>

      {badges.length > 0 && (
        <section aria-labelledby="cd-badges-title">
          <h2 id="cd-badges-title">Badges</h2>
          <ul className="cd-badges">
            {badges.map((id) => (
              <li key={id}>
                <span aria-hidden="true">★</span>
                <b>{BADGES[id].label}</b>
                <small>{BADGES[id].detail}</small>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section aria-labelledby="cd-moments-title">
        <h2 id="cd-moments-title">Three choices that mattered</h2>
        <ol className="cd-moments">
          {moments.map((m) => {
            const sc = scenarioOf(def, m.caseId);
            const c = state.cases.find((x) => x.id === m.caseId);
            const caseScore = score.cases.find((x) => x.caseId === m.caseId)?.score;
            return (
              <li key={m.caseId} className={`cd-panel cd-moment ${m.tone}`}>
                <header>
                  <Portrait who={sc.reporter.id} mood={m.tone === "good" ? "relieved" : m.tone === "bad" ? "alarmed" : "worried"} className="cd-face" />
                  <div>
                    <h3>{sc.title}</h3>
                    <p>{sc.reporter.name} · what it really was: {sc.truth.summary} Priority: {PRIORITY_LABEL[sc.truth.priority]}.</p>
                  </div>
                  {caseScore && <b className="cd-case-score">{caseScore.total}<small> / 100</small></b>}
                </header>
                <dl>
                  <dt>Your action</dt>
                  <dd>{m.action}</dd>
                  <dt>Consequence</dt>
                  <dd>{m.consequence}</dd>
                  <dt>Why</dt>
                  <dd>{m.explanation}</dd>
                  <dt>Course mission</dt>
                  <dd>{m.mission}</dd>
                </dl>
                {c && caseScore && (
                  <p className="cd-case-line">
                    {outcomeText(def, sc, c) !== m.consequence && <>Outcome: {outcomeText(def, sc, c)} <span aria-hidden="true">·</span> </>}Safe step after{" "}
                    {caseScore.minutesToSafeStep === null ? "never" : plural(caseScore.minutesToSafeStep, "minute")} <span aria-hidden="true">·</span> Handoff after{" "}
                    {caseScore.minutesToHandoff === null ? "never" : plural(caseScore.minutesToHandoff, "minute")}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
      </section>

      <p className="cd-mission">{COURSE_MISSION}</p>
      <div className="cd-debrief-actions">
        <button type="button" className="cd-btn primary big" onClick={onVariant}>
          Play the variant shift
          <small>new order, new details, a different report is the false alarm</small>
        </button>
        <button type="button" className="cd-btn big" onClick={onRetry}>
          Retry this shift
        </button>
      </div>
    </main>
  );
}
