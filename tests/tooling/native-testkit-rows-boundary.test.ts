// The rows door and the tier behind it are a native module boundary: outside testkit only persistence suites and
// tests/db import them, and inside testkit only the closed importer list does.
import { dirname, relative } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { cruiseRules, fires, unresolvable } from "./_native-cruise.ts";

const ROWS_DOOR = "tests/support/node/factories/rows.ts";
const ROWS_MODULE = "tests/support/node/factories/rows/probe.ts";
const PERSISTENCE_ONLY = "testkit-rows-persistence-only";
const CLOSED_IMPORTERS = "testkit-rows-closed-importers";

// A sibling path needs its `./`, or the resolver reads it as a package name.
function relativeSpecifier(from: string, to: string): string {
  const path = relative(dirname(from), to);
  return path.startsWith(".") ? path : `./${path}`;
}

test.for([
  { name: "a verb suite importing the rows door", entry: "tests/server/domain/probe/verbs/probe.int.test.ts", target: ROWS_DOOR, rule: PERSISTENCE_ONLY },
  {
    name: "a verb suite importing a rows-tier module",
    entry: "tests/server/domain/probe/verbs/probe.int.test.ts",
    target: ROWS_MODULE,
    rule: PERSISTENCE_ONLY,
  },
  { name: "a script importing the rows door", entry: "scripts/probe.ts", target: ROWS_DOOR, rule: PERSISTENCE_ONLY },
  { name: "a door seed module importing the rows door", entry: "tests/support/node/factories/probe.ts", target: ROWS_DOOR, rule: CLOSED_IMPORTERS },
  { name: "the corpus door seeds importing a rows-tier module", entry: "tests/support/node/corpus-actors.ts", target: ROWS_MODULE, rule: CLOSED_IMPORTERS },
  { name: "the harness importing the rows door", entry: "tests/support/node/server.ts", target: ROWS_DOOR, rule: CLOSED_IMPORTERS },
  { name: "a persistence suite importing the rows door", entry: "tests/server/domain/probe/persistence/probe.int.test.ts", target: ROWS_DOOR, rule: null },
  { name: "a schema suite importing the rows door", entry: "tests/db/schema/probe.int.test.ts", target: ROWS_DOOR, rule: null },
  { name: "a testkit self-test importing a rows-tier module", entry: "tests/support/node/factories/probe.int.test.ts", target: ROWS_MODULE, rule: null },
  { name: "a corpus publication producer importing a rows-tier module", entry: "tests/support/node/corpus-search.ts", target: ROWS_MODULE, rule: null },
  { name: "the rows tier importing its own door", entry: "tests/support/node/factories/rows/other.ts", target: ROWS_DOOR, rule: null },
] as const)("the native rows boundary judges $name", async (row, { plantedTree }) => {
  const root = await plantedTree({
    [ROWS_DOOR]: "export const captureProbeRows = (): readonly string[] => [];",
    [ROWS_MODULE]: "export const seedProbeRows = (): readonly string[] => [];",
    [row.entry]: `export { ${row.target === ROWS_DOOR ? "captureProbeRows" : "seedProbeRows"} as read } from ${JSON.stringify(relativeSpecifier(row.entry, row.target))};`,
  });
  const violations = await cruiseRules(root, [row.entry], [PERSISTENCE_ONLY, CLOSED_IMPORTERS]);
  expect(unresolvable(violations)).toEqual([]);
  for (const rule of [PERSISTENCE_ONLY, CLOSED_IMPORTERS]) {
    expect(fires(violations, rule, [row.entry])).toBe(rule === row.rule);
  }
});
