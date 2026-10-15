import initSqlJs, { type Database } from "sql.js";
import { beforeAll, describe, expect, it } from "vitest";
import { CASES } from "../src/queryhunt/data/case";
import { DATASETS, seedSql } from "../src/queryhunt/data/dataset";
import { addTile, buildSql } from "../src/queryhunt/sim/blocks";
import { completedSteps, conclude, createGame, explainFinding, pinEvidence, POINTS, scoreOf, submitQuery, useHint } from "../src/queryhunt/sim/game";
import { checkResult, guard, runQuery } from "../src/queryhunt/sim/sql";
import type { CaseDef, Game, QueryChallenge, QueryResult, Tile, VariantId } from "../src/queryhunt/sim/types";

const dbs = {} as Record<VariantId, Database>;
const VARIANTS: VariantId[] = ["a", "b"];

beforeAll(async () => {
  const SQL = await initSqlJs();
  for (const v of VARIANTS) {
    dbs[v] = new SQL.Database();
    dbs[v].run(seedSql(DATASETS[v]));
  }
});

const rows = (v: VariantId, sql: string): QueryResult => {
  const out = runQuery(dbs[v], sql);
  if (!out.ok) throw new Error(out.message);
  return out.result;
};
const queries = (def: CaseDef): QueryChallenge[] => def.challenges.filter((c): c is QueryChallenge => c.kind === "query");
const relevant = (c: QueryChallenge): string[] => c.candidates.filter((x) => x.verdict === "relevant").map((x) => x.id);
const rightOption = (c: QueryChallenge): string => c.explain.options.find((o) => o.correct)!.id;

// The guided-block solution for each query challenge.
const GUIDED: Record<string, string[]> = {
  c1: ["src-logins", "f-failed", "f-window", "s-oldest"],
  c2: ["src-logins", "f-failed", "f-window", "g-account", "s-count"],
  c3: ["src-logins", "f-account", "f-window", "s-oldest"],
  c4: ["src-files", "j-devices", "f-device", "s-oldest-f"],
};
const guidedSql = (c: QueryChallenge, ids: string[] = GUIDED[c.id]): string => {
  let tray: Tile[] = [];
  // Added in reverse to show that click order does not matter.
  for (const id of [...ids].reverse()) tray = addTile(tray, c.tiles.find((t) => t.id === id)!);
  return buildSql(tray)!;
};

function playThrough(v: VariantId, sqlFor: (c: QueryChallenge) => string): Game {
  const def = CASES[v];
  let game = createGame(def);
  for (const c of queries(def)) {
    const run = submitQuery(def, game, dbs[v], sqlFor(c), "sql");
    expect(run.feedback.kind, `${v}/${c.id}`).toBe("match");
    game = pinEvidence(def, run.game, relevant(c)).game;
    game = explainFinding(def, game, rightOption(c)).game;
  }
  return game;
}

describe("Query Hunt: restricted local execution", () => {
  it("refuses anything that is not a single read-only statement", () => {
    for (const sql of ["DROP TABLE logins", "DELETE FROM logins", "PRAGMA table_info(logins)", "SELECT 1; SELECT 2", "WITH x AS (SELECT 1) INSERT INTO logins SELECT * FROM x", "ATTACH 'x' AS y", ""]) {
      expect(guard(sql), sql).not.toBeNull();
      expect(runQuery(dbs.a, sql)).toMatchObject({ ok: false, kind: "blocked" });
    }
    expect(rows("a", "SELECT COUNT(*) FROM logins").rows[0][0]).toBe(DATASETS.a.tables[2].rows.length);
  });

  it("allows read-only queries, including keywords inside text values and comments", () => {
    expect(guard("SELECT * FROM logins WHERE location = 'drop; delete' -- update later")).toBeNull();
    expect(guard("WITH f AS (SELECT * FROM logins) SELECT COUNT(*) FROM f;")).toBeNull();
    expect(guard("SELECT REPLACE(username, '.', ' ') FROM accounts")).toBeNull();
  });

  it("reports SQL errors separately, in plain language", () => {
    const typo = runQuery(dbs.a, "SELECT * FORM logins");
    expect(typo).toMatchObject({ ok: false, kind: "syntax" });
    expect(!typo.ok && typo.message).toContain('"FORM"');
    const column = runQuery(dbs.a, "SELECT user FROM logins");
    expect(!column.ok && column.message).toContain('no column called "user"');
    const table = runQuery(dbs.a, "SELECT * FROM signins");
    expect(!table.ok && table.message).toContain("accounts, devices, logins and file_access");
  });

  it("caps the number of rows returned", () => {
    const out = runQuery(dbs.a, "SELECT * FROM logins a, logins b", 50);
    expect(out.ok && out.result.rows.length).toBe(50);
    expect(out.ok && out.result.truncated).toBe(true);
  });
});

describe.each(VARIANTS)("Query Hunt: dataset %s", (v) => {
  const def = CASES[v];
  const f = DATASETS[v].facts;
  const [from, to] = DATASETS[v].window;
  const win = `ts >= '${from}' AND ts < '${to}'`;
  const one = (sql: string): unknown => rows(v, sql).rows[0]?.[0];

  it("contains the relevant activity and the benign distractors the content describes", () => {
    expect(one(`SELECT COUNT(*) FROM logins WHERE result='failure' AND ${win}`)).toBe(f.failuresInWindow);
    expect(one(`SELECT COUNT(DISTINCT account_id) FROM logins WHERE result='failure' AND ${win}`)).toBe(f.accountsWithFailures);
    expect(one(`SELECT COUNT(*) FROM logins WHERE result='failure' AND ${win} AND account_id='${f.subject.id}' AND source_ip='${f.attackerIp}'`)).toBe(f.burstFailures);
    expect(one(`SELECT MAX(ts) FROM logins WHERE result='failure' AND account_id='${f.subject.id}' AND ${win}`)).toBe(f.burstLast);
    // Exactly one success follows the burst, from the same address and an unregistered device.
    expect(rows(v, `SELECT l.ts, d.registered FROM logins l JOIN devices d ON d.device_id=l.device_id WHERE l.result='success' AND l.source_ip='${f.attackerIp}'`).rows).toEqual([[f.successAt, 0]]);
    expect(f.successAt > f.burstLast).toBe(true);
    expect(one(`SELECT COUNT(*) FROM file_access WHERE device_id='${f.rogueDevice}' AND sensitivity='restricted' AND ts > '${f.successAt}'`)).toBe(f.fileEvents);
    expect(one(`SELECT COUNT(*) FROM file_access WHERE device_id='${f.rogueDevice}' AND action='download'`)).toBe(f.downloads);
    // Distractors: the service account never gets in; other failures are followed by success on a registered device.
    expect(one(`SELECT COUNT(*) FROM logins WHERE account_id='${f.serviceId}' AND result='success'`)).toBe(0);
    expect(one(`SELECT COUNT(*) FROM logins WHERE account_id='${f.serviceId}' AND result='failure' AND ${win}`)).toBe(f.serviceFailures);
    expect(one(`SELECT COUNT(*) FROM logins WHERE account_id='${f.forgetful.id}' AND result='failure' AND NOT (${win})`)).toBe(f.forgetfulFailures);
    expect(one(`SELECT COUNT(*) FROM logins WHERE result='failure' AND NOT (${win})`)).toBeGreaterThan(0);
    expect(one(`SELECT COUNT(*) FROM logins l JOIN devices d ON d.device_id=l.device_id WHERE d.registered=1 AND l.result='success' AND l.location NOT LIKE '${DATASETS[v].tables[0].rows[0][3]}%'`)).toBe(1);
    expect(one(`SELECT COUNT(*) FROM file_access WHERE sensitivity='restricted' AND device_id<>'${f.rogueDevice}'`)).toBeGreaterThan(0);
  });

  it("has timestamps unique enough for the ordering rules to be well defined", () => {
    expect(one(`SELECT COUNT(*) - COUNT(DISTINCT ts || account_id) FROM logins`)).toBe(0);
  });

  it("accepts the reference query and the guided-block query for every challenge", () => {
    playThrough(v, (c) => c.expectedSql);
    const game = playThrough(v, (c) => guidedSql(c));
    expect(game.phase).toBe("conclude");
    expect(game.evidence).toEqual(["E1", "E2", "E3", "E4", "E5"]);
  });

  it("accepts equivalent queries written differently", () => {
    const alt: Record<string, string> = {
      c1: `select ts, location, event_id from logins where not result = 'success' and ts between '${from}' and '${to}' and ts <> '${to}' order by 1 asc;`,
      c2: `WITH failed AS (SELECT * FROM logins WHERE result = 'failure' AND ${win})
           SELECT COUNT(event_id) AS n, account_id FROM failed GROUP BY account_id ORDER BY n DESC, account_id`,
      c3: `SELECT l.* FROM logins l JOIN accounts a ON a.account_id = l.account_id
           WHERE a.username IN ('${f.subject.username}'${f.serviceFailures > f.burstFailures ? `, '${f.serviceName}'` : ""}) AND l.ts >= '${from}' AND l.ts < '${to}' ORDER BY l.ts`,
      c4: `SELECT f.event_id, f.ts, f.file_path, (SELECT registered FROM devices d WHERE d.device_id = f.device_id) AS registered
           FROM file_access f WHERE f.device_id = '${f.rogueDevice}' ORDER BY f.ts ASC`,
    };
    playThrough(v, (c) => alt[c.id]);
  });

  it("explains results that ran but do not answer the question", () => {
    const c = queries(def);
    const game = createGame(def);
    const mismatch = (sql: string): string => {
      const { feedback } = submitQuery(def, game, dbs[v], sql, "sql");
      if (feedback.kind !== "mismatch") throw new Error(`expected mismatch, got ${feedback.kind}`);
      return feedback.message;
    };
    expect(mismatch("SELECT * FROM logins WHERE result = 'failure' ORDER BY ts")).toContain("too broad");
    expect(mismatch(`SELECT * FROM logins WHERE result = 'failure' AND ${win} AND account_id = '${f.subject.id}' ORDER BY ts`)).toContain("too narrow");
    expect(mismatch(`SELECT account_id FROM logins WHERE result = 'failure' AND ${win}`)).toContain("event_id, ts");
    expect(mismatch(guidedSql(c[0], ["src-logins", "f-failed", "f-window", "s-newest"]))).toContain("wrong order");
    expect(mismatch(guidedSql(c[0], ["src-logins", "f-failed", "f-window"]).replace("result = 'failure'", "result = 'success'") + " LIMIT " + f.failuresInWindow)).toMatch(/too|not the ones/);
    // A SQL error is a different kind of feedback and unlocks nothing.
    const error = submitQuery(def, game, dbs[v], "SELECT * FROM logins WHERE", "sql");
    expect(error.feedback.kind).toBe("sql-error");
    expect(error.game.phase).toBe("query");
    expect(error.game.steps[0]).toMatchObject({ runs: 1, sqlErrors: 1, mismatches: 0 });
  });

  it("checks grouped results by value, whatever the count column is called", () => {
    const c2 = queries(def)[1];
    const expected = rows(v, c2.expectedSql);
    expect(checkResult(rows(v, `SELECT account_id, COUNT(*) total FROM logins WHERE result='failure' AND ${win} GROUP BY 1 ORDER BY 2 DESC`), expected, c2.check).match).toBe(true);
    // Counting every login, not only failures, is a different answer.
    expect(checkResult(rows(v, `SELECT account_id, COUNT(*) total FROM logins WHERE ${win} GROUP BY 1 ORDER BY 2 DESC`), expected, c2.check).match).toBe(false);
    expect(checkResult(rows(v, `SELECT account_id, COUNT(*) total FROM logins WHERE result='failure' AND ${win} GROUP BY 1 ORDER BY 2`), expected, c2.check)).toMatchObject({ reason: "wrong-order" });
  });

  it("never grants evidence for running a query", () => {
    const [c1] = queries(def);
    const run = submitQuery(def, createGame(def), dbs[v], c1.expectedSql, "guided");
    expect(run.game.phase).toBe("pin");
    expect(run.game.evidence).toEqual([]);
    expect(completedSteps(run.game)).toBe(0);
    expect(() => explainFinding(def, run.game, rightOption(c1))).toThrow();
    // Pinning without a validated result is impossible too.
    expect(() => pinEvidence(def, createGame(def), relevant(c1))).toThrow();
  });

  it("rejects irrelevant or overstated evidence with specific feedback, and reduces the evidence points", () => {
    const [c1] = queries(def);
    const ready = submitQuery(def, createGame(def), dbs[v], c1.expectedSql, "sql").game;
    for (const wrong of c1.candidates.filter((x) => x.verdict === "wrong")) {
      const { game, feedback } = pinEvidence(def, ready, ["E1", wrong.id]);
      expect(feedback.accepted).toBe(false);
      expect(feedback.notes).toEqual([{ id: wrong.id, title: wrong.title, tone: "wrong", text: wrong.feedback }]);
      expect(wrong.feedback.length).toBeGreaterThan(40);
      expect(game.phase).toBe("pin");
      const retry = pinEvidence(def, game, ["E1"]);
      expect(retry.game.steps[0].points.evidence).toBe(POINTS.evidence[1]);
    }
    expect(pinEvidence(def, ready, []).feedback.accepted).toBe(false);
    expect(pinEvidence(def, ready, ["E1"]).game.steps[0].points.evidence).toBe(POINTS.evidence[0]);
  });

  it("requires every relevant card and accepts optional context", () => {
    let game = createGame(def);
    const all = queries(def);
    for (const c of all.slice(0, 3)) {
      game = submitQuery(def, game, dbs[v], c.expectedSql, "sql").game;
      game = pinEvidence(def, game, [...relevant(c), ...c.candidates.filter((x) => x.verdict === "optional").map((x) => x.id)]).game;
      game = explainFinding(def, game, rightOption(c)).game;
    }
    game = submitQuery(def, game, dbs[v], all[3].expectedSql, "sql").game;
    const partial = pinEvidence(def, game, ["E5"]);
    expect(partial.feedback).toMatchObject({ accepted: false, missing: 1 });
    expect(pinEvidence(def, partial.game, ["E4", "E5"]).game.evidence).toEqual(["E1", "E2", "E3", "E4", "E5"]);
    // Optional context is never stored as evidence.
    const second = queries(def)[1];
    const withContext = pinEvidence(def, submitQuery(def, explainFinding(def, pinEvidence(def, submitQuery(def, createGame(def), dbs[v], all[0].expectedSql, "sql").game, ["E1"]).game, "ok").game, dbs[v], second.expectedSql, "sql").game, ["O2-service"]);
    expect(withContext.feedback).toMatchObject({ accepted: false, missing: 1 });
    expect(withContext.feedback.notes[0].tone).toBe("optional");
  });

  it("gives each wrong interpretation its own feedback and only then unlocks the next challenge", () => {
    for (const [i, c] of queries(def).entries()) {
      let game = createGame(def);
      for (const prior of queries(def).slice(0, i)) {
        game = explainFinding(def, pinEvidence(def, submitQuery(def, game, dbs[v], prior.expectedSql, "sql").game, relevant(prior)).game, rightOption(prior)).game;
      }
      game = pinEvidence(def, submitQuery(def, game, dbs[v], c.expectedSql, "sql").game, relevant(c)).game;
      const wrong = c.explain.options.filter((o) => !o.correct);
      expect(new Set(wrong.map((o) => o.feedback)).size).toBe(wrong.length);
      for (const o of wrong) {
        const out = explainFinding(def, game, o.id);
        expect(out.feedback).toEqual({ correct: false, message: o.feedback });
        expect(out.game.step).toBe(i);
        game = out.game;
      }
      const done = explainFinding(def, game, rightOption(c));
      expect(done.game.step).toBe(i + 1);
      expect(done.game.steps[i].points.interpretation).toBe(POINTS.interpretation[2]);
    }
  });

  it("does not let repeated failed logins establish compromise", () => {
    const def5 = def.challenges[4];
    if (def5.kind !== "conclusion") throw new Error("challenge 5 must be the conclusion");
    const ready = playThrough(v, (c) => c.expectedSql);
    const fb = def5.evidenceFeedback;

    // The right conclusion, guessed without (enough) evidence, earns nothing.
    expect(conclude(def, ready, "likely", []).feedback).toEqual({ correct: false, conclusion: null, evidence: fb.none });
    expect(conclude(def, ready, "likely", ["E1", "E2"]).feedback.evidence).toBe(fb.attemptsOnly);
    expect(fb.attemptsOnly).toContain("alone do not establish compromise");
    expect(conclude(def, ready, "likely", ["E2", "E4", "E5"]).feedback.evidence).toBe(fb.missingSuccess);
    expect(conclude(def, ready, "likely", ["E2", "E3"]).feedback.evidence).toBe(fb.missingActivity);
    expect(conclude(def, ready, "likely", ["E2"]).game.conclusion.points).toBe(0);

    // Every wrong conclusion has its own feedback, even with full evidence.
    const wrong = def5.options.filter((o) => !o.correct);
    expect(new Set(wrong.map((o) => o.feedback)).size).toBe(3);
    let game = ready;
    for (const o of wrong) {
      const out = conclude(def, game, o.id, ["E3", "E4", "E5"]);
      expect(out.feedback).toEqual({ correct: false, conclusion: o.feedback, evidence: null });
      expect(out.game.phase).toBe("conclude");
      game = out.game;
    }
    const late = conclude(def, game, "likely", ["E1", "E3", "E4", "E5"]);
    expect(late.game.phase).toBe("done");
    expect(late.game.conclusion.points).toBe(POINTS.conclusion[2]);
  });

  it("scores a clean run at the maximum and keeps hints separate", () => {
    let game = playThrough(v, (c) => c.expectedSql);
    game = conclude(def, game, "likely", ["E3", "E4", "E5"]).game;
    expect(completedSteps(game)).toBe(5);
    expect(scoreOf(def, game)).toMatchObject({ query: 400, evidence: 250, interpretation: 200, conclusion: 150, total: 1000, max: 1000, hints: 0 });

    // Hints are counted, cost nothing, run out, and never block completion.
    let hinted = createGame(def);
    const first = def.challenges[0];
    for (const text of first.hints) {
      const out = useHint(def, hinted);
      expect(out.hint).toBe(text);
      hinted = out.game;
    }
    expect(useHint(def, hinted).hint).toBeNull();
    for (const c of queries(def)) {
      hinted = explainFinding(def, pinEvidence(def, submitQuery(def, hinted, dbs[v], c.expectedSql, "sql").game, relevant(c)).game, rightOption(c)).game;
    }
    hinted = conclude(def, hinted, "likely", ["E3", "E4", "E5"]).game;
    expect(scoreOf(def, hinted)).toMatchObject({ total: 1000, hints: first.hints.length });
  });
});

describe("Query Hunt: transfer variant", () => {
  it("changes every identifying value between datasets", () => {
    const a = DATASETS.a.facts;
    const b = DATASETS.b.facts;
    for (const key of ["attackerIp", "rogueDevice", "successAt", "burstFailures", "sensitiveFolder", "serviceId"] as const) expect(a[key]).not.toBe(b[key]);
    expect(a.subject.id).not.toBe(b.subject.id);
  });

  it("makes the highest count the wrong account to follow in dataset B", () => {
    const b = DATASETS.b.facts;
    const top = runQuery(dbs.b, queries(CASES.b)[1].expectedSql);
    expect(top.ok && top.result.rows[0]).toEqual([b.serviceId, b.serviceFailures]);
    expect(top.ok && top.result.rows[1]).toEqual([b.subject.id, b.burstFailures]);
    // Dataset A's answer does not solve dataset B.
    const game = createGame(CASES.b);
    expect(submitQuery(CASES.b, game, dbs.b, queries(CASES.a)[0].expectedSql, "sql").feedback.kind).toBe("mismatch");
  });

  it("guided tiles cannot produce a statement the guard refuses", () => {
    for (const v of VARIANTS) for (const c of queries(CASES[v])) for (const t of c.tiles) expect(guard(buildSql(addTile([c.tiles[0]], t))!)).toBeNull();
  });
});
