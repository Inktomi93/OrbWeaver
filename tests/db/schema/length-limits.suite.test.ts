// @subject packages/db/src/schema/index.ts
// @subject packages/contracts/src/plugin/ui-host.ts
// A column whose CHECK bounds a length is written through a contracts schema at least as strict, so an over-long value
// is the wire's coded refusal and never the table's raw CHECK error. The census reads every length CHECK from the real
// drizzle schema; the writers of each are named here, because a production export only a test reads fails `pnpm knip:prod`.
import { automationRuleEditableSchema, globalVariableKeySchema } from "@orb/contracts/automation";
import { pluginKvKeySchema, pluginKvValueSchema, pluginUiHostArgsSchemas } from "@orb/contracts/plugin";
// biome-ignore lint/performance/noNamespaceImport: the census denominator is every schema export, including tables a named import would omit.
import * as schema from "@orb/db/schema";
import { expect, test } from "@orb/testkit/node";
import { is, sql } from "drizzle-orm";
import { check, getTableConfig, SQLiteSyncDialect, SQLiteTable, sqliteTable, text } from "drizzle-orm/sqlite-core";
import { z } from "zod";

const LENGTH_UNITS = ["chars", "bytes"] as const;
type LengthUnit = (typeof LENGTH_UNITS)[number];

interface LengthBound {
  readonly unit: LengthUnit;
  readonly max: number;
}

/** Whether a wire schema admits this string where the column's value rides. */
type Admits = (value: string) => boolean;

const BOUND_PATTERNS = {
  chars: /^length\((?<column>\w+)\) <= (?<max>\d+)$/,
  bytes: /^length\(cast\((?<column>\w+) as blob\)\) <= (?<max>\d+)$/,
} as const satisfies Readonly<Record<LengthUnit, RegExp>>;
// `json_array_length(` carries no word boundary before `length`, so only the scalar function matches.
const LENGTH_CALL = /\blength\(/;
const SHORT_PROBE = "k";
// One UTF-8 byte and one code point per unit, so one probe overruns a bound in either unit.
const PROBE_UNIT = "a";

function boundOf(checkSql: string): LengthBound | null {
  for (const unit of LENGTH_UNITS) {
    const max = BOUND_PATTERNS[unit].exec(checkSql)?.groups?.["max"];
    if (max !== undefined) {
      return { unit, max: Number(max) };
    }
  }
  return null;
}

interface LengthCensus {
  /** Every CHECK that is one upper length bound on one column, by check name. */
  readonly bounds: ReadonlyMap<string, LengthBound>;
  /** A CHECK that calls `length()` in a form the census cannot read as one upper bound. */
  readonly unread: readonly string[];
}

function lengthChecks(exports: Readonly<Record<string, unknown>>): LengthCensus {
  const dialect = new SQLiteSyncDialect();
  const bounds = new Map<string, LengthBound>();
  const unread: string[] = [];
  for (const table of new Set(Object.values(exports).filter((value): value is SQLiteTable => is(value, SQLiteTable)))) {
    for (const tableCheck of getTableConfig(table).checks) {
      const checkSql = dialect.sqlToQuery(tableCheck.value).sql;
      const bound = boundOf(checkSql);
      if (bound !== null) {
        bounds.set(tableCheck.name, bound);
      } else if (LENGTH_CALL.exec(checkSql) !== null) {
        unread.push(tableCheck.name);
      }
    }
  }
  return { bounds, unread };
}

interface LengthFindings {
  /** A length CHECK with neither named writers nor a reviewed reason. */
  readonly undeclared: readonly string[];
  /** A writer that admits a value one unit past the column's bound. */
  readonly looser: readonly string[];
  /** A writer that refuses a short value, so its refusal of the long one proves nothing. */
  readonly inert: readonly string[];
  /** A named writer list or reviewed reason whose CHECK is gone or is no longer what it was reviewed as. */
  readonly stale: readonly string[];
}

type Writers = ReadonlyMap<string, readonly Admits[]>;
type Reviewed = ReadonlyMap<string, string>;

function judge(census: LengthCensus, writers: Writers, reviewed: Reviewed): LengthFindings {
  const undeclared: string[] = [];
  const looser: string[] = [];
  const inert: string[] = [];
  for (const [name, bound] of census.bounds) {
    const admitting = writers.get(name) ?? [];
    if (admitting.length === 0 && !reviewed.has(name)) {
      undeclared.push(name);
    }
    admitting.forEach((admits, index) => {
      if (!admits(SHORT_PROBE)) {
        inert.push(`${name}[${index}]`);
      }
      if (admits(PROBE_UNIT.repeat(bound.max + 1))) {
        looser.push(`${name}[${index}]`);
      }
    });
  }
  undeclared.push(...census.unread.filter((name) => !reviewed.has(name)));
  const stale = [
    ...[...writers.keys()].filter((name) => !census.bounds.has(name)),
    ...[...reviewed.keys()].filter((name) => !(census.bounds.has(name) || census.unread.includes(name)) || writers.has(name)),
  ];
  return { undeclared, looser, inert, stale };
}

function admittedBy(wire: z.ZodType, place: (value: string) => unknown = (value) => value): Admits {
  return (value) => wire.safeParse(place(value)).success;
}

/** The contracts schemas that write each length-checked column, by the CHECK's name. */
const WIRE_WRITERS: Writers = new Map([
  ["automation_rules_name_check", [admittedBy(automationRuleEditableSchema.shape.name)]],
  ["global_variables_key_check", [admittedBy(globalVariableKeySchema), admittedBy(pluginUiHostArgsSchemas["variables.set"], (value) => [value, SHORT_PROBE])]],
  ["global_variables_value_check", [admittedBy(pluginUiHostArgsSchemas["variables.set"], (value) => [SHORT_PROBE, value])]],
  [
    "plugin_kv_key_check",
    [
      admittedBy(pluginKvKeySchema),
      admittedBy(pluginUiHostArgsSchemas["storage.set"], (value) => [value, SHORT_PROBE]),
      admittedBy(pluginUiHostArgsSchemas["storage.compareAndSet"], (value) => [value, null, SHORT_PROBE]),
    ],
  ],
  [
    "plugin_kv_value_check",
    [
      admittedBy(pluginKvValueSchema),
      admittedBy(pluginUiHostArgsSchemas["storage.set"], (value) => [SHORT_PROBE, value]),
      admittedBy(pluginUiHostArgsSchemas["storage.compareAndSet"], (value) => [SHORT_PROBE, null, value]),
      admittedBy(pluginUiHostArgsSchemas["storage.compareAndSet"], (value) => [SHORT_PROBE, value, SHORT_PROBE]),
    ],
  ],
]);

/** Length CHECKs no contracts schema writes, or that are not an upper bound, each with its reason. */
const REVIEWED_CHECKS: Reviewed = new Map([
  ["automation_rule_state_guidance_check", "no wire schema writes it: the rule-state persistence write slices guidance to ANALYSIS_GUIDANCE_MAX"],
  ["plugins_source_commit_check", "an exact commit-hash length inside a per-origin shape rule, not an upper bound"],
]);

test("every length CHECK in the real schema is written through a contracts schema at least as strict", () => {
  const census = lengthChecks(schema);
  expect(census.bounds.size).toBeGreaterThan(0);
  expect(judge(census, WIRE_WRITERS, REVIEWED_CHECKS)).toEqual({ undeclared: [], looser: [], inert: [], stale: [] });
});

test("a looser writer, an inert writer, an unnamed bound, an unread length form and a stale row are each reported", () => {
  const rows = sqliteTable(
    "rows",
    { id: text("id").primaryKey(), name: text("name"), body: text("body"), tag: text("tag"), hash: text("hash"), list: text("list") },
    () => [
      check("rows_name_check", sql.raw("length(name) <= 4")),
      check("rows_body_check", sql.raw("length(cast(body as blob)) <= 4")),
      check("rows_tag_check", sql.raw("length(tag) <= 4")),
      check("rows_hash_check", sql.raw("hash is null or length(hash) = 40")),
      check("rows_list_check", sql.raw("json_array_length(list) = 0")),
    ],
  );
  const census = lengthChecks({ rows });
  expect([...census.bounds]).toEqual([
    ["rows_name_check", { unit: "chars", max: 4 }],
    ["rows_body_check", { unit: "bytes", max: 4 }],
    ["rows_tag_check", { unit: "chars", max: 4 }],
  ]);
  expect(census.unread).toEqual(["rows_hash_check"]);

  const strict = admittedBy(z.string().max(4));
  const loose = admittedBy(z.string().max(5));
  const misplaced = admittedBy(z.tuple([z.string().max(4)]));
  expect(
    judge(
      census,
      new Map([
        ["rows_name_check", [strict, loose]],
        ["rows_body_check", [misplaced]],
      ]),
      new Map(),
    ),
  ).toEqual({
    undeclared: ["rows_tag_check", "rows_hash_check"],
    looser: ["rows_name_check[1]"],
    inert: ["rows_body_check[0]"],
    stale: [],
  });
  expect(
    judge(
      census,
      new Map([
        ["rows_name_check", [strict]],
        ["rows_body_check", [strict]],
        ["rows_gone_check", [strict]],
      ]),
      new Map([
        ["rows_tag_check", "reviewed"],
        ["rows_hash_check", "reviewed"],
        ["rows_body_check", "now written"],
        ["rows_dropped_check", "check removed"],
      ]),
    ),
  ).toEqual({ undeclared: [], looser: [], inert: [], stale: ["rows_gone_check", "rows_body_check", "rows_dropped_check"] });
});
