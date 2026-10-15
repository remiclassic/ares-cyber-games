import type { Database } from "sql.js";
import type { CheckResult, CheckSpec, QueryResult, RunOutcome, Value } from "./types";

// Local, restricted query execution and result-set checking. The run/compare
// approach follows SQL Boss Battle Game (runSQL / sameResult): the learner's
// result is compared with the result of a reference query, never the SQL text.

export const MAX_ROWS = 500;

const WRITE_WORDS = /\b(insert|update|delete|drop|create|alter|attach|detach|pragma|vacuum|reindex|analyze|begin|commit|rollback|savepoint|release|recursive)\b|\breplace\s+into\b/i;

// Comments and string literals removed, so keywords inside values are not misread.
function skeleton(sql: string): string {
  return sql
    .replace(/--[^\n]*/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/'(?:[^']|'')*'/g, "''")
    .replace(/"(?:[^"]|"")*"/g, '""');
}

// Returns why the statement is refused, or null when it may run.
export function guard(sql: string): string | null {
  const bare = skeleton(sql).trim().replace(/;\s*$/, "");
  if (!bare) return "Write a query first.";
  if (bare.includes(";")) return "Run one statement at a time.";
  if (!/^(select|with)\b/i.test(bare)) return "This case is read-only: queries must start with SELECT (or WITH).";
  const word = bare.match(WRITE_WORDS);
  if (word) return `This case is read-only: ${word[0].toUpperCase()} is not available here.`;
  return null;
}

// Plain-language reading of the common SQLite messages.
export function explainSqlError(message: string): string {
  let m = message.match(/no such column: (.+)/i);
  if (m) return `There is no column called "${m[1]}". Check the schema for the exact name, and put text values in single quotes.`;
  m = message.match(/no such table: (.+)/i);
  if (m) return `There is no table called "${m[1]}". The tables are accounts, devices, logins and file_access.`;
  m = message.match(/no such function: (.+)/i);
  if (m) return `SQLite has no function called "${m[1]}".`;
  m = message.match(/ambiguous column name: (.+)/i);
  if (m) return `"${m[1]}" exists in more than one joined table. Prefix it with the table name, for example logins.${m[1]}.`;
  m = message.match(/near "(.+?)": syntax error/i);
  if (m) return `SQLite stopped reading at "${m[1]}". Look just before it for a missing comma, quote, keyword or bracket.`;
  if (/incomplete input/i.test(message)) return "The statement ends too early. Look for an unclosed bracket or quote, or a clause with nothing after it.";
  if (/misuse of aggregate|aggregate functions are not allowed/i.test(message)) return "An aggregate such as COUNT(*) is used where it is not allowed. Filter aggregates with HAVING, not WHERE.";
  return "SQLite could not run this statement.";
}

export function runQuery(db: Database, sql: string, maxRows = MAX_ROWS): RunOutcome {
  const refused = guard(sql);
  if (refused) return { ok: false, kind: "blocked", message: refused };
  try {
    const statement = db.prepare(sql.trim().replace(/;\s*$/, ""));
    try {
      const rows: Value[][] = [];
      let truncated = false;
      while (statement.step()) {
        if (rows.length >= maxRows) {
          truncated = true;
          break;
        }
        rows.push(statement.get().map((v) => (v instanceof Uint8Array ? "[blob]" : v)));
      }
      return { ok: true, result: { columns: statement.getColumnNames(), rows, truncated } };
    } finally {
      statement.free();
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    return { ok: false, kind: "syntax", message: explainSqlError(detail), detail };
  }
}

const norm = (v: Value): string => (v === null ? "∅" : typeof v === "number" ? (Math.round(v * 10000) / 10000).toString() : String(v));
const sorted = (values: string[]): string[] => [...values].sort();
const same = (a: string[], b: string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);
const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

// Compares the learner's result with the reference result. Extra columns are
// fine; only the columns the question needs are checked.
export function checkResult(actual: QueryResult, expected: QueryResult, spec: CheckSpec): CheckResult {
  const names = actual.columns.map((c) => c.toLowerCase());
  const column = (result: QueryResult, index: number): string[] => result.rows.map((row) => norm(row[index]));
  const expectedIndex = (name: string): number => expected.columns.findIndex((c) => c.toLowerCase() === name.toLowerCase());

  const missing = spec.columns.filter((c) => !c.flexible && !names.includes(c.name.toLowerCase()));
  if (missing.length) {
    return { match: false, reason: "missing-column", message: `The result needs ${missing.length === 1 ? "the column" : "the columns"} ${missing.map((c) => c.name).join(", ")}. Add ${missing.length === 1 ? "it" : "them"} to SELECT.` };
  }
  if (actual.truncated || actual.rows.length > expected.rows.length) {
    return { match: false, reason: "too-many", message: `The query ran and returned ${actual.truncated ? "more than " : ""}${plural(actual.rows.length, "row")}; the question is answered by ${expected.rows.length}. A condition is missing or too broad.` };
  }
  if (actual.rows.length < expected.rows.length) {
    return { match: false, reason: "too-few", message: `The query ran and returned ${plural(actual.rows.length, "row")}; the question is answered by ${expected.rows.length}. A condition is too narrow, or the wrong rows are being combined.` };
  }

  // Map each needed column to a column of the learner's result.
  const used = new Set<number>();
  const mapping: number[] = [];
  for (const c of spec.columns) {
    const want = sorted(column(expected, expectedIndex(c.name)));
    const candidates = names.map((_, i) => i).filter((i) => !used.has(i) && (c.flexible || names[i] === c.name.toLowerCase()));
    // Prefer the same name, then any column holding the same values.
    candidates.sort((a, b) => Number(names[b] === c.name.toLowerCase()) - Number(names[a] === c.name.toLowerCase()));
    const found = candidates.find((i) => same(sorted(column(actual, i)), want));
    if (found === undefined) {
      const message = c.flexible
        ? `The right number of rows, but no column holds the expected ${c.name} values. Check what is being counted and how rows are grouped.`
        : `The right number of rows, but the ${c.name} values are not the ones the question asks for. Check each condition against the question.`;
      return { match: false, reason: "wrong-rows", message };
    }
    used.add(found);
    mapping.push(found);
  }

  const project = (result: QueryResult, indexes: number[]): string[] => result.rows.map((row) => indexes.map((i) => norm(row[i])).join("\u0001"));
  const expectedIndexes = spec.columns.map((c) => expectedIndex(c.name));
  if (!same(sorted(project(actual, mapping)), sorted(project(expected, expectedIndexes)))) {
    return { match: false, reason: "wrong-rows", message: "The right number of rows, but the values do not line up row by row with the answer. Check the conditions and the grouping." };
  }

  if (spec.orderBy) {
    const at = spec.columns.findIndex((c) => c.name === spec.orderBy!.column);
    if (!same(column(actual, mapping[at]), column(expected, expectedIndexes[at]))) {
      return { match: false, reason: "wrong-order", message: `These are the right rows in the wrong order. This question needs ${spec.orderBy.column} ${spec.orderBy.dir === "asc" ? "ascending (smallest or oldest first)" : "descending (largest or newest first)"}: check ORDER BY.` };
    }
  }
  return { match: true };
}
