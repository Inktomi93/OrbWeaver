// Inside a package's src, a relative import climbs at most one directory (Core-0 §1); a deeper target is named through
// the package's subpath imports. A target outside the importer's src is outside the rule.
import { expect, test } from "@orb/testkit/tooling";
import { cruiseRules, fires, unresolvable } from "./_native-cruise.ts";

const RULE = "package-parent-climb";
const SRC = "packages/inference/src";
const PACKAGE = JSON.stringify({ name: "@orb/inference", imports: { "#*": "./src/*/index.ts", "#src/*": "./src/*" } });

const CASES = [
  {
    name: "a value import two directories up",
    entry: `${SRC}/backends/openai/probe.ts`,
    source: 'export { value } from "../../contract/http.ts";',
    blocked: true,
  },
  {
    name: "a type-only import two directories up",
    entry: `${SRC}/backends/openai/probe.ts`,
    source: 'import type { Value } from "../../contract/http.ts";\nexport type Probe = Value;',
    blocked: true,
  },
  {
    name: "a dynamic import two directories up",
    entry: `${SRC}/backends/openai/probe.ts`,
    source: 'export const load = () => import("../../contract/http.ts");',
    blocked: true,
  },
  { name: "a climb to the src root from two deep", entry: `${SRC}/backends/openai/probe.ts`, source: 'export { value } from "../../deps.ts";', blocked: true },
  { name: "one directory up", entry: `${SRC}/backends/openai/probe.ts`, source: 'export { value } from "../shared/wire.ts";', blocked: false },
  { name: "a sibling file", entry: `${SRC}/backends/openai/probe.ts`, source: 'export { value } from "./chat.ts";', blocked: false },
  {
    name: "the #src spelling of the same target",
    entry: `${SRC}/backends/openai/probe.ts`,
    source: 'export { value } from "#src/contract/http.ts";',
    blocked: false,
  },
  { name: "one directory up to the src root", entry: `${SRC}/contract/probe.ts`, source: 'export { value } from "../deps.ts";', blocked: false },
  { name: "a package-root file outside src", entry: `${SRC}/contract/probe.ts`, source: 'export { value } from "../../browser-targets.ts";', blocked: false },
] as const;

test.for(CASES)("the parent-climb limit judges $name (blocked=$blocked)", async (row, { plantedTree }) => {
  const root = await plantedTree({
    "packages/inference/package.json": PACKAGE,
    "packages/inference/browser-targets.ts": "export const value = 1;",
    [`${SRC}/deps.ts`]: "export const value = 1;",
    [`${SRC}/contract/http.ts`]: "export const value = 1;\nexport type Value = number;",
    [`${SRC}/backends/shared/wire.ts`]: "export const value = 1;",
    [`${SRC}/backends/openai/chat.ts`]: "export const value = 1;",
    [row.entry]: row.source,
  });
  const violations = await cruiseRules(root, [row.entry], [RULE]);
  expect(unresolvable(violations)).toEqual([]);
  expect(fires(violations, RULE, [row.entry])).toBe(row.blocked);
});
