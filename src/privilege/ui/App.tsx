import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { MISSION_CONNECTION, MODEL_RULES, PUZZLES } from "../data/puzzles";
import { ACTIVITY_ID, createPuzzleHost, type PuzzleHost, type PuzzleOutcome } from "../host";
import { ACTION_LABEL, applyChanges, changeCount, describePath, edgeLabel, evaluateCheck, setChange, verify, viewEdges } from "../sim/access";
import { POINTS, maxScore, scorePuzzle } from "../sim/scoring";
import type { AccessResult, Action, Change, Changes, Check, Puzzle, VerifyReport, ViewEdge } from "../sim/types";
import { Graph, type Lit, type Selection } from "./Graph";
import { Icon } from "./icons";

const STEP_MS = 420;
const ACTION_VERB: Record<Action, string> = { read: "read", write: "change" };
const KIND_LABEL = { user: "User", group: "Group", resource: "Resource" } as const;
const EDGE_TITLE = { member: "Membership", grant: "Grant", contains: "Folder contents", info: "Other relationship" } as const;

function reducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function App() {
  const host = useMemo(createPuzzleHost, []);
  const [screen, setScreen] = useState<"intro" | "play" | "debrief">("intro");
  const [index, setIndex] = useState(0);
  const [run, setRun] = useState(0);
  const [outcomes, setOutcomes] = useState<PuzzleOutcome[]>([]);
  const startedAt = useRef(0);

  const start = () => {
    startedAt.current = Date.now();
    setOutcomes([]);
    setIndex(0);
    setRun((r) => r + 1);
    setScreen("play");
    host.started();
    if (run > 0) host.record({ verb: "retried", object: ACTIVITY_ID });
  };

  const finishPuzzle = (outcome: PuzzleOutcome) => {
    const all = [...outcomes, outcome];
    setOutcomes(all);
    if (index + 1 < PUZZLES.length) {
      setIndex(index + 1);
      return;
    }
    host.complete({
      activityId: ACTIVITY_ID,
      completed: true,
      completedAt: new Date().toISOString(),
      durationSeconds: Math.round((Date.now() - startedAt.current) / 1000),
      total: all.reduce((sum, o) => sum + o.score.total, 0),
      puzzles: all,
    });
    setScreen("debrief");
  };

  return (
    <div className="ppp">
      <header className="masthead">
        <p className="eyebrow">
          Project Ares <span>/</span> Training minigame
        </p>
        <h1>
          Privilege Path <em>Puzzle</em>
        </h1>
      </header>
      {screen === "intro" ? <Intro onStart={start} /> : null}
      {screen === "play" ? (
        <PuzzleScreen
          key={`${run}-${index}`}
          puzzle={PUZZLES[index]}
          index={index}
          banked={outcomes.reduce((sum, o) => sum + o.score.total, 0)}
          host={host}
          onDone={finishPuzzle}
        />
      ) : null}
      {screen === "debrief" ? <Debrief outcomes={outcomes} onRetry={start} /> : null}
      <p className="tagline">
        Trace access <span>•</span> Test assumptions <span>•</span> Understand permissions
      </p>
    </div>
  );
}

function Rules() {
  return (
    <ol className="rules">
      {MODEL_RULES.map((rule) => (
        <li key={rule}>{rule}</li>
      ))}
    </ol>
  );
}

function Intro({ onStart }: { onStart: () => void }) {
  return (
    <main className="card intro">
      <h2>Someone has access they should not have. Find out why, and fix it.</h2>
      <p>
        Each map shows users, groups, resources and the relationships between them. Work out who can do what, make the smallest change that removes the
        unintended access, and prove that required work still gets done.
      </p>
      <div className="intro-cols">
        <section>
          <h3>How access is decided</h3>
          <Rules />
        </section>
        <section>
          <h3>How to play</h3>
          <ul className="steps">
            <li>
              <b>Inspect</b> a node or a relationship label to see its details.
            </li>
            <li>
              <b>Predict</b> an access check, then <b>test</b> it to watch the route light up.
            </li>
            <li>
              <b>Change</b> a membership or a grant. Each puzzle has a small change budget.
            </li>
            <li>
              <b>Verify</b> the fix against every check, then explain what happened.
            </li>
          </ul>
        </section>
      </div>
      <button type="button" className="btn primary big" onClick={onStart} autoFocus>
        <Icon name="play" size={18} /> Start: {PUZZLES.length} puzzles, about 5 minutes
      </button>
    </main>
  );
}

type TestState = Readonly<{ checkId: string; result: AccessResult; sequence: readonly string[]; shown: number; done: boolean }>;
type Stage = "play" | "report" | "explain" | "summary";

type PuzzleProps = Readonly<{ puzzle: Puzzle; index: number; banked: number; host: PuzzleHost; onDone: (outcome: PuzzleOutcome) => void }>;

function PuzzleScreen({ puzzle, index, banked, host, onDone }: PuzzleProps) {
  const [changes, setChanges] = useState<Changes>({});
  const [selection, setSelection] = useState<Selection>(null);
  const [activeId, setActiveId] = useState(puzzle.checks[0].id);
  const [test, setTest] = useState<TestState | null>(null);
  const [tested, setTested] = useState<Record<string, boolean>>({});
  const [predictions, setPredictions] = useState<Record<string, { predicted: boolean; correct: boolean }>>({});
  const [failedVerifies, setFailedVerifies] = useState(0);
  const [stage, setStage] = useState<Stage>("play");
  const [report, setReport] = useState<VerifyReport | null>(null);
  const [picks, setPicks] = useState<string[]>([]);
  const [showRules, setShowRules] = useState(false);

  const view = useMemo(() => viewEdges(puzzle.edges, changes), [puzzle, changes]);
  const current = useMemo(() => applyChanges(puzzle.edges, changes), [puzzle, changes]);
  const used = changeCount(changes);
  const active = puzzle.checks.find((c) => c.id === activeId)!;
  const name = useCallback((id: string) => puzzle.nodes.find((n) => n.id === id)?.label ?? id, [puzzle]);
  const correctPredictions = Object.values(predictions).filter((p) => p.correct).length;

  useEffect(() => {
    if (!test || test.done) return;
    const timer = setTimeout(
      () => setTest((t) => (t ? (t.shown >= t.sequence.length ? { ...t, done: true } : { ...t, shown: t.shown + 1 }) : t)),
      STEP_MS,
    );
    return () => clearTimeout(timer);
  }, [test]);

  useEffect(() => {
    if (test?.done) setTested((prev) => ({ ...prev, [test.checkId]: test.result.allowed }));
  }, [test]);

  const lit = useMemo<Record<string, Lit>>(() => {
    if (!test) return {};
    const kind: Lit = test.result.allowed ? "allow" : "explored";
    const ids = test.done && test.result.allowed ? test.result.paths.flat() : test.sequence.slice(0, test.shown);
    return Object.fromEntries(ids.map((id) => [id, kind]));
  }, [test]);

  const select = useCallback(
    (next: Selection) => {
      setSelection(next);
      if (next) host.record({ verb: "inspected", object: `${puzzle.id}/${next.id}` });
    },
    [host, puzzle],
  );

  const runTest = (check: Check, prediction: boolean | null) => {
    const result = evaluateCheck(current, check);
    const sequence = result.allowed ? result.paths[0] : result.explored;
    const instant = reducedMotion();
    setActiveId(check.id);
    setTest({ checkId: check.id, result, sequence, shown: instant ? sequence.length : 0, done: instant });
    if (prediction !== null && !predictions[check.id]) {
      setPredictions((prev) => ({ ...prev, [check.id]: { predicted: prediction, correct: prediction === result.allowed } }));
    }
    host.record({ verb: "tested", object: `${puzzle.id}/${check.id}`, result: { allowed: result.allowed, prediction } });
  };

  const mutate = (edgeId: string, change: Change | null) => {
    setChanges(setChange(puzzle.edges, changes, edgeId, change));
    setTest(null);
    setTested({});
    host.record({ verb: "changed", object: `${puzzle.id}/${edgeId}`, result: { change } });
  };

  const runVerify = () => {
    const next = verify(puzzle, changes);
    setTest(null);
    setReport(next);
    setStage("report");
    if (!next.solved) setFailedVerifies((n) => n + 1);
    host.record({ verb: "verified", object: puzzle.id, result: { solved: next.solved, changesUsed: next.changesUsed } });
  };

  const pick = (optionId: string) => {
    if (picks.includes(optionId)) return;
    const option = puzzle.explain.options.find((o) => o.id === optionId)!;
    setPicks([...picks, optionId]);
    host.record({ verb: "answered", object: `${puzzle.id}/explain`, result: { answer: optionId, correct: option.correct } });
  };

  const firstPick = puzzle.explain.options.find((o) => o.id === picks[0]);
  const score = scorePuzzle({ changesUsed: used, par: puzzle.par, correctPredictions, explainedFirstTry: firstPick?.correct === true, failedVerifies });

  const finish = () =>
    onDone({
      puzzleId: puzzle.id,
      score,
      changesUsed: used,
      failedVerifies,
      predictions: Object.fromEntries(Object.entries(predictions).map(([id, p]) => [id, p.correct])),
      explanation: { answer: picks[0] ?? "", correct: firstPick?.correct === true },
    });

  const checkText = (check: Check) => `${name(check.user)} · ${ACTION_LABEL[check.action]} · ${name(check.resource)}`;

  return (
    <main className="board">
      <section className="hud">
        <div className="hud-scenario">
          <span className="hud-icon">
            <Icon name="doc" size={26} />
          </span>
          <div>
            <h2>
              Scenario {index + 1} / {PUZZLES.length}: {puzzle.title}
            </h2>
            <p>{puzzle.brief}</p>
          </div>
        </div>
        <div className="hud-objective">
          <span className="hud-icon">
            <Icon name="target" size={22} />
          </span>
          <div>
            <span className="label">Objective</span>
            <p>{puzzle.objective}</p>
          </div>
        </div>
        <div className="hud-stats">
          <div className="stat">
            <span className="label">Changes</span>
            <span className="stat-value" aria-label={`${used} of ${puzzle.budget} changes used`}>
              {used}
              <span className="dots" aria-hidden="true">
                {Array.from({ length: puzzle.budget }, (_, i) => (
                  <i key={i} className={i < used ? "on" : ""} />
                ))}
              </span>
            </span>
          </div>
          <div className="stat">
            <span className="label">Score</span>
            <span className="stat-value gold">
              <Icon name="star" size={18} /> {banked + correctPredictions * POINTS.prediction}
            </span>
          </div>
        </div>
      </section>

      <section className="stage">
        <div className="map" aria-label="Access map">
          <Graph
            puzzle={puzzle}
            edges={view}
            selection={selection}
            lit={lit}
            subject={test ? active.user : null}
            target={test ? active.resource : null}
            onSelect={select}
          />
          <ul className="legend" aria-label="Legend">
            <li className="lg-member">Member of</li>
            <li className="lg-grant">Grant</li>
            <li className="lg-contains">Contains</li>
            <li className="lg-info">Not a permission</li>
          </ul>
        </div>

        <aside className="side">
          <div className="panel">
            <h3>
              <Icon name="lock" size={18} /> Permission Inspector
              <button type="button" className="link" onClick={() => setShowRules(true)}>
                Access rules
              </button>
            </h3>
            <Inspector puzzle={puzzle} view={view} changes={changes} selection={selection} used={used} name={name} onMutate={mutate} />
          </div>
          <div className="panel">
            <h3>
              <Icon name="search" size={18} /> Access test
            </h3>
            <TestCard puzzle={puzzle} check={active} test={test} prediction={predictions[active.id]} edges={view} name={name} onRun={runTest} />
          </div>
        </aside>
      </section>

      <section className="dock">
        <div className="checks">
          <h3>
            Access checks <span>Select one, predict the result, then test it.</span>
          </h3>
          <div className="check-list">
            {puzzle.checks.map((check) => {
              const result = tested[check.id];
              const met = result === undefined ? null : result === (check.expect === "allow");
              return (
                <button
                  type="button"
                  key={check.id}
                  className={`check ${check.id === activeId ? "active" : ""}`}
                  aria-pressed={check.id === activeId}
                  onClick={() => {
                    setActiveId(check.id);
                    if (test && test.checkId !== check.id) setTest(null);
                  }}
                >
                  <span className="check-title">{checkText(check)}</span>
                  <span className={`check-need need-${check.expect}`}>Must be {check.expect === "allow" ? "allowed" : "denied"}</span>
                  <span className={`check-state ${met === null ? "" : met ? "met" : "unmet"}`}>
                    {met === null ? "Not tested" : `${result ? "Allowed" : "Denied"} ${met ? "✓" : "✕"}`}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className="dock-actions">
          <button type="button" className="btn blue" onClick={() => runTest(active, null)} disabled={test !== null && !test.done}>
            <Icon name="search" size={22} />
            <span>
              <b>Test access</b>
              <small>Trace the selected check</small>
            </span>
          </button>
          <button type="button" className="btn green" onClick={runVerify}>
            <Icon name="play" size={22} />
            <span>
              <b>Verify fix</b>
              <small>Run every check</small>
            </span>
          </button>
        </div>
      </section>

      {showRules ? (
        <Modal title="How access is decided" onClose={() => setShowRules(false)}>
          <Rules />
          <button type="button" className="btn primary" onClick={() => setShowRules(false)} autoFocus>
            Back to the map
          </button>
        </Modal>
      ) : null}

      {stage === "report" && report ? (
        <Modal title={report.solved ? "Fix verified" : "Not there yet"} tone={report.solved ? "good" : "bad"}>
          <Report puzzle={puzzle} report={report} name={name} view={view} />
          {report.solved ? (
            <button type="button" className="btn primary" onClick={() => setStage("explain")} autoFocus>
              Explain what happened
            </button>
          ) : (
            <button type="button" className="btn primary" onClick={() => setStage("play")} autoFocus>
              Back to the map
            </button>
          )}
        </Modal>
      ) : null}

      {stage === "explain" ? (
        <Modal title={puzzle.explain.question}>
          <div className="options">
            {puzzle.explain.options.map((option) => {
              const picked = picks.includes(option.id);
              return (
                <div key={option.id}>
                  <button
                    type="button"
                    className={`option ${picked ? (option.correct ? "right" : "wrong") : ""}`}
                    onClick={() => pick(option.id)}
                    disabled={picked || picks.some((id) => puzzle.explain.options.find((o) => o.id === id)?.correct)}
                  >
                    {option.text}
                  </button>
                  {picked ? <p className={`feedback ${option.correct ? "right" : "wrong"}`}>{option.feedback}</p> : null}
                </div>
              );
            })}
          </div>
          {picks.some((id) => puzzle.explain.options.find((o) => o.id === id)?.correct) ? (
            <button type="button" className="btn primary" onClick={() => setStage("summary")} autoFocus>
              See results
            </button>
          ) : null}
        </Modal>
      ) : null}

      {stage === "summary" ? (
        <Modal title={`${puzzle.title}: solved`} tone="good">
          <table className="score-table">
            <tbody>
              <tr>
                <th>Unintended access removed, required access kept</th>
                <td>+{score.solve}</td>
              </tr>
              <tr>
                <th>{used <= puzzle.par ? `Minimal fix (${used} ${used === 1 ? "change" : "changes"})` : `Fix used ${used} changes, ${puzzle.par} was enough`}</th>
                <td>+{score.precision}</td>
              </tr>
              <tr>
                <th>
                  Correct predictions ({correctPredictions} of {puzzle.checks.length})
                </th>
                <td>+{score.predictions}</td>
              </tr>
              <tr>
                <th>{score.explanation > 0 ? "Explained it first time" : "Explanation needed more than one try"}</th>
                <td>+{score.explanation}</td>
              </tr>
              {score.penalty > 0 ? (
                <tr>
                  <th>Failed verifications ({failedVerifies})</th>
                  <td>−{score.penalty}</td>
                </tr>
              ) : null}
              <tr className="total">
                <th>Puzzle score</th>
                <td>
                  {score.total} / {maxScore(puzzle.checks.length)}
                </td>
              </tr>
            </tbody>
          </table>
          <p className="takeaway">{puzzle.takeaway}</p>
          <button type="button" className="btn primary" onClick={finish} autoFocus>
            {index + 1 < PUZZLES.length ? "Next puzzle" : "Finish"}
          </button>
        </Modal>
      ) : null}
    </main>
  );
}

type InspectorProps = Readonly<{
  puzzle: Puzzle;
  view: readonly ViewEdge[];
  changes: Changes;
  selection: Selection;
  used: number;
  name: (id: string) => string;
  onMutate: (edgeId: string, change: Change | null) => void;
}>;

function Inspector({ puzzle, view, changes, selection, used, name, onMutate }: InspectorProps) {
  const changedEdges = view.filter((e) => e.changed);
  const changeList =
    changedEdges.length > 0 ? (
      <div className="change-list">
        <span className="label">
          Your changes ({used} / {puzzle.budget})
        </span>
        {changedEdges.map((edge) => {
          const original = puzzle.edges.find((e) => e.id === edge.id)!;
          return (
            <div key={edge.id} className="change-row">
              <span>
                {edge.removed
                  ? `Removed: ${name(original.from)} → ${edgeLabel(original)} → ${name(original.to)}`
                  : `Now: ${name(edge.from)} → ${edgeLabel(edge)} → ${name(edge.to)} (was ${name(original.from)} → ${edgeLabel(original)})`}
              </span>
              <button type="button" className="link" onClick={() => onMutate(edge.id, null)}>
                Undo
              </button>
            </div>
          );
        })}
      </div>
    ) : null;

  if (!selection) {
    return (
      <>
        <p className="muted">Select a node or a relationship label on the map to inspect it.</p>
        {changeList}
      </>
    );
  }

  if (selection.type === "node") {
    const node = puzzle.nodes.find((n) => n.id === selection.id)!;
    return (
      <>
        <Row icon={node.icon} label={KIND_LABEL[node.kind]} title={node.label} sub={node.sub} />
        <ul className="facts">
          {node.facts.map((fact) => (
            <li key={fact}>{fact}</li>
          ))}
        </ul>
        {changeList}
      </>
    );
  }

  const edge = view.find((e) => e.id === selection.id)!;
  const original = puzzle.edges.find((e) => e.id === edge.id)!;
  const from = puzzle.nodes.find((n) => n.id === edge.from)!;
  const to = puzzle.nodes.find((n) => n.id === edge.to)!;
  const locked = used >= puzzle.budget && !changes[edge.id];
  const groups = puzzle.nodes.filter((n) => n.kind === "group");
  const meaning: Record<ViewEdge["kind"], string> = {
    member: `${from.label} is treated as a member of ${to.label} and holds everything granted to it.`,
    grant: `Members of ${from.label} may ${(edge.actions ?? []).map((a) => ACTION_VERB[a]).join(" and ")} ${to.label} and anything inside it.`,
    contains: `${to.label} is stored inside ${from.label}, so grants on ${from.label} also apply to ${to.label}.`,
    info: "This is not a membership and not a grant. It gives no access to anything.",
  };

  return (
    <>
      <Row icon={from.icon} label="From" title={from.label} sub={from.sub} />
      <Row icon={to.icon} label="To" title={to.label} sub={to.sub} />
      <Row icon="key" label={EDGE_TITLE[edge.kind]} title={edge.removed ? `${edgeLabel(original)} (removed)` : edgeLabel(edge)} sub={meaning[edge.kind]} />
      {edge.note ? <p className="note">{edge.note}</p> : null}

      {edge.kind === "grant" ? (
        <div className="editor">
          <span className="label">Narrow this grant</span>
          <label>
            Granted to
            <select value={edge.from} disabled={locked || edge.removed} onChange={(e) => onMutate(edge.id, { actions: edge.actions, from: e.target.value })}>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.label}
                </option>
              ))}
            </select>
          </label>
          <div className="action-boxes">
            {(original.actions ?? []).map((action) => (
              <label key={action}>
                <input
                  type="checkbox"
                  checked={!edge.removed && (edge.actions ?? []).includes(action)}
                  disabled={locked}
                  onChange={(e) => {
                    const kept = edge.removed ? [] : (edge.actions ?? []);
                    const actions = e.target.checked ? [...kept, action] : kept.filter((a) => a !== action);
                    onMutate(edge.id, { actions, from: edge.from });
                  }}
                />
                {ACTION_LABEL[action]}
              </label>
            ))}
          </div>
          <EditButtons edge={edge} locked={locked} what="grant" onMutate={onMutate} />
        </div>
      ) : null}

      {edge.kind === "member" ? (
        <div className="editor">
          <span className="label">Change this membership</span>
          <EditButtons edge={edge} locked={locked} what="membership" onMutate={onMutate} />
        </div>
      ) : null}

      {edge.kind === "contains" ? <p className="muted">Where a file is stored is fixed in this puzzle.</p> : null}
      {locked ? <p className="warn">Change budget used. Undo a change before making another.</p> : null}
      {changeList}
    </>
  );
}

function EditButtons({ edge, locked, what, onMutate }: { edge: ViewEdge; locked: boolean; what: string; onMutate: InspectorProps["onMutate"] }) {
  return (
    <div className="edit-buttons">
      {edge.removed ? null : (
        <button type="button" className="btn small danger" disabled={locked} onClick={() => onMutate(edge.id, { removed: true })}>
          Remove {what}
        </button>
      )}
      {edge.changed ? (
        <button type="button" className="btn small" onClick={() => onMutate(edge.id, null)}>
          {edge.removed ? `Restore ${what}` : "Undo change"}
        </button>
      ) : null}
    </div>
  );
}

function Row({ icon, label, title, sub }: { icon: string; label: string; title: string; sub: string }) {
  return (
    <div className="row">
      <span className="row-icon">
        <Icon name={icon} size={22} />
      </span>
      <div>
        <span className="label">{label}</span>
        <b>{title}</b>
        <span className="row-sub">{sub}</span>
      </div>
    </div>
  );
}

type TestCardProps = Readonly<{
  puzzle: Puzzle;
  check: Check;
  test: TestState | null;
  prediction: { predicted: boolean; correct: boolean } | undefined;
  edges: readonly ViewEdge[];
  name: (id: string) => string;
  onRun: (check: Check, prediction: boolean | null) => void;
}>;

function TestCard({ puzzle, check, test, prediction, edges, name, onRun }: TestCardProps) {
  const mine = test?.checkId === check.id ? test : null;
  const running = mine !== null && !mine.done;
  const result = mine?.done ? mine.result : null;
  const groups = result ? result.principals.filter((id) => id !== check.user).map(name) : [];
  const meets = result ? result.allowed === (check.expect === "allow") : null;

  return (
    <>
      <p className="question">
        Can <b>{name(check.user)}</b> {ACTION_VERB[check.action]} <b>{name(check.resource)}</b>?
      </p>
      <p className="muted">
        Required: <b>{check.expect === "allow" ? "allowed" : "denied"}</b>. {check.reason}
      </p>

      {prediction ? (
        <p className={`predicted ${running ? "" : prediction.correct ? "right" : "wrong"}`}>
          You predicted {prediction.predicted ? "allowed" : "denied"}
          {running ? "…" : prediction.correct ? ` ✓ +${POINTS.prediction}` : " ✕"}
        </p>
      ) : running ? null : (
        <div className="predict">
          <span className="label">Predict first (+{POINTS.prediction} if right)</span>
          <div>
            <button type="button" className="btn small" onClick={() => onRun(check, true)}>
              Allowed
            </button>
            <button type="button" className="btn small" onClick={() => onRun(check, false)}>
              Denied
            </button>
          </div>
        </div>
      )}

      <div aria-live="polite">
        {running ? <p className="tracing">Tracing memberships and grants…</p> : null}
        {result ? (
          <div className={`result ${result.allowed ? "allowed" : "denied"}`}>
            <b>{result.allowed ? "Access allowed" : "Access denied"}</b>
            {result.allowed ? (
              <ol>
                {result.paths.map((path) => (
                  <li key={path.join()}>{describePath(puzzle.nodes, edges, path)}</li>
                ))}
              </ol>
            ) : (
              <p>
                {groups.length > 0 ? `${name(check.user)} acts as: ${groups.join(", ")}. ` : `${name(check.user)} belongs to no groups. `}
                No grant reached this way covers {ACTION_LABEL[check.action]} on {name(check.resource)}.
              </p>
            )}
            <p className={meets ? "meets" : "fails"}>
              {meets ? "This meets the requirement." : `This does not meet the requirement: it must be ${check.expect === "allow" ? "allowed" : "denied"}.`}
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}

function Report({ puzzle, report, name, view }: { puzzle: Puzzle; report: VerifyReport; name: (id: string) => string; view: readonly ViewEdge[] }) {
  const word = (allowed: boolean) => (allowed ? "Allowed" : "Denied");
  return (
    <>
      <p className="muted">
        {report.changesUsed} of {puzzle.budget} {puzzle.budget === 1 ? "change" : "changes"} used. Before is the map as you found it. After includes your
        changes.
      </p>
      <table className="report">
        <thead>
          <tr>
            <th>Check</th>
            <th>Required</th>
            <th>Before</th>
            <th>After</th>
          </tr>
        </thead>
        <tbody>
          {report.results.map(({ check, before, after, pass }) => (
            <tr key={check.id} className={pass ? "pass" : "fail"}>
              <td>
                <b>
                  {name(check.user)} · {ACTION_LABEL[check.action]} · {name(check.resource)}
                </b>
                {pass ? null : (
                  <span className="why">
                    {check.expect === "deny"
                      ? `Still allowed through: ${after.paths.map((p) => describePath(puzzle.nodes, view, p)).join("; ")}.`
                      : `Required access was lost. ${check.reason}`}
                  </span>
                )}
              </td>
              <td>{word(check.expect === "allow")}</td>
              <td className={before.allowed === (check.expect === "allow") ? "ok" : "bad"}>{word(before.allowed)}</td>
              <td className={pass ? "ok" : "bad"}>
                {word(after.allowed)} {pass ? "✓" : "✕"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function Modal({ title, tone, onClose, children }: { title: string; tone?: "good" | "bad"; onClose?: () => void; children: ReactNode }) {
  useEffect(() => {
    if (!onClose) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="overlay">
      <div className={`modal ${tone ?? ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}

function Debrief({ outcomes, onRetry }: { outcomes: readonly PuzzleOutcome[]; onRetry: () => void }) {
  const total = outcomes.reduce((sum, o) => sum + o.score.total, 0);
  const max = PUZZLES.reduce((sum, p) => sum + maxScore(p.checks.length), 0);
  const explained = outcomes.filter((o) => o.explanation.correct).length;
  return (
    <main className="card debrief">
      <h2>Debrief</h2>
      <p className="big-score">
        <Icon name="star" size={28} /> {total} <small>/ {max}</small>
      </p>
      <table className="report">
        <thead>
          <tr>
            <th>Puzzle</th>
            <th>Changes</th>
            <th>Explained first time</th>
            <th>Score</th>
          </tr>
        </thead>
        <tbody>
          {outcomes.map((outcome) => {
            const puzzle = PUZZLES.find((p) => p.id === outcome.puzzleId)!;
            return (
              <tr key={outcome.puzzleId}>
                <td>
                  <b>{puzzle.title}</b>
                  <span className="why plain">{puzzle.takeaway}</span>
                </td>
                <td>
                  {outcome.changesUsed} (minimum {puzzle.par})
                </td>
                <td className={outcome.explanation.correct ? "ok" : "bad"}>{outcome.explanation.correct ? "Yes" : "No"}</td>
                <td>{outcome.score.total}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="muted">
        Learning evidence: {explained} of {outcomes.length} explanations correct first time. Predictions and explanations are reported to the course alongside the score.
      </p>
      <h3>Mission connection</h3>
      <p>{MISSION_CONNECTION}</p>
      <button type="button" className="btn primary big" onClick={onRetry}>
        Play again
      </button>
    </main>
  );
}
