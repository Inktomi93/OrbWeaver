// Native ESLint guards for checks that can pass without the act they claim: a population that may be empty, a recorder's
// tail that may be the previous act's, an alert picked by position, a brand made by a cast and a root behind an alias.
// Each rule has planted failing controls and passing controls, judged with the repository config for the file.
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { resolvedConfig } from "./_eslint-config.ts";

const CONFIG_LOAD = { timeout: 120_000 };
const SYNTAX = "no-restricted-syntax";
const TAIL = "orb/no-tail-recorder-read";
const ALIAS = "orb/owned-root-alias";

const SUITE = "tests/server/domain/probe/probe.int.test.ts";
const TOOL_SUITE = "tests/tooling/snap/probe.test.ts";
const SPEC = "tests/client/features/probe/probe.ct.tsx";
const E2E_SPEC = "tests/e2e/probe.spec.ts";
const TOOL_SOURCE = "tooling/src/snap/lib/probe.ts";
const ADAPTER = "tooling/src/floor/host/platform.ts";
const MINT = "tooling/src/snap/ops/session.ts";

/** The rule as the repository configures it for `path`, run over `source`. */
async function findings(root: string, rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  const config = await resolvedConfig(new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: root }), filename);
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: path.endsWith(".tsx") } } },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found;
}

const count = async (root: string, rule: string, source: string, path: string): Promise<number> =>
  (await findings(root, rule, source, path)).filter(({ ruleId }) => ruleId === rule).length;

test.for([
  ["some held to false", "expect(rows.some((row) => row.ok)).toBe(false);", 1],
  ["some held to false with a message", 'expect(rows.some((row) => row.ok), "none").toBe(false);', 1],
  ["some on an optional receiver", "expect(rows?.some((row) => row.ok)).toBe(false);", 1],
  ["some held falsy", "expect(rows.some((row) => row.ok)).toBeFalsy();", 1],
  ["some held not true", "expect(rows.some((row) => row.ok)).not.toBe(true);", 1],
  ["some under expect.soft", "expect.soft(rows.some((row) => row.ok)).toEqual(false);", 1],
  ["every under expect.soft", "expect.soft(rows.every((row) => row.ok)).toBe(true);", 1],
  ["a chain on the right of a fallback", 'expect(fallback ?? row?.name).not.toBe("x");', 1],
  ["a proven population held to false", "expect(nonEmpty(rows).some((row) => row.ok)).toBe(false);", 0],
  ["some held to true needs a match", "expect(rows.some((row) => row.ok)).toBe(true);", 0],
  ["a proven every", "expect(nonEmpty(rows).every((row) => row.ok)).toBe(true);", 0],
  ["a narrowed value behind a fallback", 'expect(fallback ?? present(row).name).not.toBe("x");', 0],
] as const)("an empty population: %s", CONFIG_LOAD, async ([, source, expected], { repoRoot }) => {
  for (const path of [SUITE, TOOL_SUITE, SPEC]) {
    expect(await count(repoRoot, SYNTAX, source, path), path).toBe(expected);
  }
});

test.for([
  ["at(-1)", "h.requests.at(-1);", 1],
  ["a bracketed key", 'h["requests"].at(-1);', 1],
  ["at(length - 1)", "h.requests.at(h.requests.length - 1);", 1],
  ["an index of length - 1", "h.requests[h.requests.length - 1];", 1],
  ["findLast", "h.requests.findLast((request) => request.ok);", 1],
  ["a spread copy popped", "[...h.requests].pop();", 1],
  ["slice(-1)", "h.requests.slice(-1);", 1],
  ["a const alias", "const sent = h.requests;\nsent.at(-1);", 1],
  ["a destructured rename", "const { requests: sent } = h;\nsent.at(-1);", 1],
  ["a recorder under another name", "wire.funders.at(-1);", 1],
  ["a mock's calls", "run.mock.calls.at(-1);", 1],
  ["a recorder read through its accessor", "room.prompts().at(-1);", 1],
  ["a mapped and filtered history", "bodies.map((body) => body.text).filter(Boolean).at(-1);", 1],
  ["a fresh list the test records into", "const calls = [];\ncalls.at(-1);", 1],
  ["a recorder destructured from a harness factory", "const { root, requests } = await rootFor(body);\nrequests.at(-1);", 1],
  ["a recorder bound from an awaited call", "const requests = await recorder();\nrequests.at(-1);", 1],
  ["a recorder bound from a call", "const bodies = recordBodies(server);\nbodies[bodies.length - 1];", 1],
  ["a nested destructure", "const { wire: { requests } } = h;\nrequests.at(-1);", 1],
  ["a nested destructured rename", "const { wire: { requests: sent } } = h;\nsent.at(-1);", 1],
  ["a recorder parameter", "function last(requests) { return requests.at(-1); }", 1],
  ["a view over an act bracket", "const { bodies } = await wireOf(h, act);\nconst prompts = bodies.map(String).filter(Boolean);\nprompts.at(-1);", 0],
  ["a recorder bound by slice(0)", "const requests = h.requests.slice(0);\nrequests.at(-1);", 1],
  ["a recorder bound by a literal slice then a view", "const bodies = h.bodies.slice(1).filter(Boolean);\nbodies.at(-1);", 1],
  ["a recorder bound by slice(length - 1)", "const requests = h.requests.slice(h.requests.length - 1);\nrequests.at(-1);", 1],
  ["a destructure from a literal slice", "const { requests } = (await rootFor(b)).wire.slice(0);\nrequests.at(-1);", 1],
  ["a field of a slice result", "const requests = h.log.slice(0).requests;\nrequests.at(-1);", 1],
  ["a literal slice of a destructured recorder", "const { requests } = await rootFor(b);\nconst bodies = requests.slice(0);\nbodies.at(-1);", 1],
  ["a field of an act bracket's result", "const bodies = (await wireOf(h, act)).bodies;\nbodies.at(-1);", 0],
  ["an appended bracket", "const { entries: requests } = await appendedBy(h.requests, act);\nrequests.at(-1);", 0],
  ["a bracketed act", "h.requests.slice(mark).at(-1);", 0],
  ["an act bracket's own entries", "const { bodies } = await wireOf(h, act);\nbodies.map((body) => body.text).at(-1);", 0],
  ["a const holding a bracket", "const sent = h.requests.slice(mark);\nsent.at(-1);", 0],
  ["the first entry", "h.requests.at(0);", 0],
  ["a list that records nothing", "rows.at(-1);\nlines.pop();", 0],
] as const)("a recorder tail: %s", CONFIG_LOAD, async ([, source, expected], { repoRoot }) => {
  for (const path of [SUITE, TOOL_SUITE, SPEC]) {
    expect(await count(repoRoot, TAIL, source, path), path).toBe(expected);
  }
});

test.for([
  ["first()", 'page.getByRole("alert").first();', 1],
  ["nth(0)", 'page.getByRole("alert").nth(0);', 1],
  ["last()", 'page.getByRole("alert", { name: "Saved" }).last();', 1],
  ["a role selector", "page.locator('[role=\"alert\"]').first();", 1],
  ["a bare role selector", 'page.locator("[role=alert]").nth(1);', 1],
  ["another role", 'page.getByRole("status").first();', 0],
  ["a scoped alert read whole", 'list.getByRole("alert");\nlist.locator(\'[role="alert"]:not([data-before-retry])\');', 0],
] as const)("a first-alert read: %s", CONFIG_LOAD, async ([, source, expected], { repoRoot }) => {
  for (const path of [SPEC, E2E_SPEC]) {
    expect(await count(repoRoot, SYNTAX, source, path), path).toBe(expected);
  }
});

test.for([
  ["a cast of a literal", "export const a = {} as AppliedLoadEmulation;", 1],
  ["a cast through unknown", "export const b = value as unknown as AppliedLoadEmulation;", 1],
  ["an angle-bracket assertion", "export const c = <AppliedLoadEmulation>value;", 1],
  ["a qualified name", "export const e = value as loadEmulation.AppliedLoadEmulation;", 1],
  ["an import type", 'export const f = value as import("../contract/load-emulation.ts").AppliedLoadEmulation;', 1],
  ["a local alias of the brand", "type Mint = AppliedLoadEmulation;\nexport const g = {} as Mint;", 1],
  ["an import renamed to hide the brand", 'import type { AppliedLoadEmulation as Mint } from "../contract/load-emulation.ts";', 1],
  ["an import under its own name", 'import type { AppliedLoadEmulation } from "../contract/load-emulation.ts";', 0],
  ["another type", "export const d = value as DriveBudgets;", 0],
  ["another type behind a qualified name", "export const h = value as loadEmulation.DriveBudgets;", 0],
] as const)("a forged load emulation: %s", CONFIG_LOAD, async ([, source, expected], { repoRoot }) => {
  for (const path of [TOOL_SOURCE, TOOL_SUITE, ADAPTER]) {
    expect(await count(repoRoot, SYNTAX, source, path), path).toBe(expected);
  }
});

test("the load emulation brand keeps its one construction door", CONFIG_LOAD, async ({ repoRoot }) => {
  expect(await count(repoRoot, SYNTAX, "export const a = {} as AppliedLoadEmulation;", MINT)).toBe(0);
  // The door keeps the portable process rules the rest of tooling carries.
  expect(await count(repoRoot, SYNTAX, 'spawn("rm", ["target"]);', MINT)).toBe(1);
});

const LOCAL_ROOT = "function localRoot() {\n  return createServerHarness({});\n}\n";

test.for([
  ["an unowned call to a local root", `${LOCAL_ROOT}const root = await localRoot();`, 1],
  ["an arrow alias", "const harness = () => createServerHarness();\nconst root = await harness();", 1],
  ["an alias of an alias", `${LOCAL_ROOT}function outer() {\n  return localRoot();\n}\nconst root = await outer();`, 1],
  ["an awaited return", "async function room() {\n  return await textRoom();\n}\nconst root = await room();", 1],
  ["a root handed to an assertion", `${LOCAL_ROOT}expect(await localRoot()).toBeDefined();`, 1],
  ["a using declaration", `${LOCAL_ROOT}await using root = await localRoot();`, 0],
  ["a stack's use", `${LOCAL_ROOT}const root = stack.use(await localRoot());`, 0],
  ["a refusal", `${LOCAL_ROOT}await expect(localRoot()).rejects.toThrow(RootError);`, 0],
  ["a setup hook", `${LOCAL_ROOT}let root;\nbeforeAll(async () => {\n  root = await localRoot();\n});`, 0],
  ["a helper that returns no root", "function make() {\n  return { count: 1 };\n}\nconst made = make();", 0],
] as const)("an aliased root: %s", CONFIG_LOAD, async ([, source, expected], { repoRoot }) => {
  expect(await count(repoRoot, ALIAS, source, SUITE)).toBe(expected);
});
