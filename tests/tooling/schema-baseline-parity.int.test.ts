// Pins that the committed migrations/0000_baseline.sql equals what the LIVE schema (schema/*.ts — the
// source of truth Drizzle reads at runtime) would generate. freshDb PUSHES schema-derived DDL, so the
// per-table .int tests never touch the committed baseline; a schema change without regenerating the
// baseline is silent today (client.int.test.ts only checks the baseline APPLIES + 5 sentinel tables).
// This makes that drift red, in CI, at change time. (neo's tests/arch/schema-migrations-equivalence
// twin; closes the Phase-3 db audit's "baseline↔schema parity is unenforced" finding.)
//
// Equivalence = the drizzle-generated statement set vs the committed file's statement set, each
// whitespace-normalized + trailing-semicolon-stripped, ORDER-INSENSITIVE (FK-dependency order is proven
// applicable by client.int.test.ts's "baseline applies" test; here we assert structural parity, so a
// pure reorder isn't flagged as drift). Same generator (drizzle-kit/api) freshDb uses, so an in-sync
// baseline is byte-equivalent post-normalization; only a real schema/baseline divergence trips it.
import { readFileSync } from "node:fs";
import { join } from "node:path";
// biome-ignore lint/performance/noNamespaceImport: drizzle-kit's snapshot API takes the whole schema module as a Record — namespace import is the canonical way to pass every table.
import * as schema from "@orb/db/schema";
import { generateSQLiteDrizzleJson, generateSQLiteMigration } from "drizzle-kit/api";
import { expect, test } from "vitest";

const ROOT = join(import.meta.dirname, "..", "..");
const BASELINE = join(ROOT, "packages", "db", "src", "migrations", "0000_baseline.sql");
const BREAKPOINT = "--> statement-breakpoint";
const WS_RE = /\s+/g;
const TRAILING_SEMI_RE = /;\s*$/;

function normalize(statement: string): string {
  return statement.replace(WS_RE, " ").replace(TRAILING_SEMI_RE, "").trim();
}

function clean(statements: readonly string[]): string[] {
  return statements.map(normalize).filter((s) => s.length > 0);
}

async function schemaStatements(): Promise<string[]> {
  const empty = await generateSQLiteDrizzleJson({});
  const current = await generateSQLiteDrizzleJson(schema as Record<string, unknown>);
  return clean(await generateSQLiteMigration(empty, current));
}

function baselineStatements(): string[] {
  return clean(readFileSync(BASELINE, "utf8").split(BREAKPOINT));
}

test("committed 0000_baseline.sql matches the live schema (no drift)", async () => {
  const expected = await schemaStatements();
  const actual = baselineStatements();
  // Count first — a missing/extra CREATE is the loudest, clearest drift.
  expect(actual.length).toBe(expected.length);
  // Set-equal (sorted) — a per-statement diff pinpoints the drifted table without flagging a pure reorder.
  expect([...actual].sort()).toEqual([...expected].sort());
});
