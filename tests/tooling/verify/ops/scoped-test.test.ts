// Scoped node runs select the projects Vitest attributes to the caller's test files.
// Typecheck projects use `ignoreSourceErrors` so they judge `.test-d.ts` assertions only.
// The native typecheck stage owns source diagnostics across every discovered compiler program.
import { hasCallerProjectFilter, nodeConfigModeArgs } from "../../../../tooling/src/verify/ops/scoped-test.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const RUNTIME_ONLY = "--runtime-only";

test("a runtime-only selection spawns with --runtime-only and no project filter", () => {
  expect(nodeConfigModeArgs(["tooling"], "run", false)).toEqual([RUNTIME_ONLY]);
  expect(nodeConfigModeArgs(["unit", "integration"], "run", false)).toEqual([RUNTIME_ONLY]);
});

test("an EMPTY attribution is a runtime-only run — a bare --grep claims no type file", () => {
  expect(nodeConfigModeArgs([], "run", false)).toEqual([RUNTIME_ONLY]);
});

test("a pure .test-d.ts selection names the types project the runner attributed", () => {
  expect(nodeConfigModeArgs(["types-node"], "run", false)).toEqual(["--project=types-node"]);
  expect(nodeConfigModeArgs(["types-browser", "types-node"], "run", false)).toEqual(["--project=types-browser", "--project=types-node"]);
});

// THE ARM THE FIRST DRAFT GOT WRONG. It returned `[]` here, so the root config rode and BOTH typecheck
// projects joined a run that claimed one of them. The union drops nothing the caller claimed and excludes
// the one they did not — `types-browser` is absent from every row below.
test("a MIXED selection narrows to the UNION of the attributed projects, never to nothing", () => {
  expect(nodeConfigModeArgs(["tooling", "types-node"], "run", false)).toEqual(["--project=tooling", "--project=types-node"]);
  expect(nodeConfigModeArgs(["types-browser", "unit"], "run", false)).toEqual(["--project=types-browser", "--project=unit"]);
  expect(nodeConfigModeArgs(["contract", "integration", "types-node", "unit"], "run", false), "the doc-catalog shape").toEqual([
    "--project=contract",
    "--project=integration",
    "--project=types-node",
    "--project=unit",
  ]);
});

test("a MIXED selection never emits the runtime-only flag, and never names an unclaimed typecheck project", () => {
  for (const projects of [
    ["tooling", "types-node"],
    ["types-browser", "unit"],
    ["contract", "types-node"],
  ]) {
    const args = nodeConfigModeArgs(projects, "run", false);
    expect(args, `${projects.join(",")} must not carry the flag`).not.toContain(RUNTIME_ONLY);
    expect(args, "every attributed project survives").toHaveLength(projects.length);
    const unclaimed = projects.includes("types-node") ? "types-browser" : "types-node";
    expect(args, `${unclaimed} was never claimed`).not.toContain(`--project=${unclaimed}`);
  }
});

// The two flags are mutually exclusive by construction: the runtime config OMITS the typecheck projects
// before any `--project` filter applies, so `--runtime-only --project=types-node` selects nothing at all.
test("the runtime-only flag and a types project are never emitted together", () => {
  for (const projects of [["types-node"], ["types-browser"], ["types-browser", "types-node"], ["tooling", "types-node"]]) {
    expect(nodeConfigModeArgs(projects, "run", false)).not.toContain(RUNTIME_ONLY);
  }
});

// THE REGRESSION THE FIRST DRAFT SHIPPED. `preflight` returns an empty attribution without collecting when
// there are no path operands, so `--runtime-only` was injected beside the caller's own filter and vitest
// refused: `Startup Error: No projects matched the filter "types-node"`. An invocation that worked before
// the door existed.
test("a caller's OWN --project filter is authoritative — the door adds nothing", () => {
  expect(nodeConfigModeArgs([], "run", true)).toEqual([]);
  expect(nodeConfigModeArgs(["tooling"], "run", true)).toEqual([]);
  expect(nodeConfigModeArgs(["types-node"], "run", true)).toEqual([]);
  expect(nodeConfigModeArgs([], "related", true), "even related yields to an explicit filter").toEqual([]);
});

test("both --project spellings are recognised — a door reading only the =-joined form still contradicts the other", () => {
  expect(hasCallerProjectFilter(["--project=types-node"])).toBe(true);
  expect(hasCallerProjectFilter(["--project", "types-node"])).toBe(true);
  expect(hasCallerProjectFilter(["-t", "x", "--project=unit", "--reporter=json"])).toBe(true);
  expect(hasCallerProjectFilter(["-t", "x"]), "the negative control").toBe(false);
  expect(hasCallerProjectFilter(["--projects-are-not-a-flag"]), "a prefix that is not the flag").toBe(false);
});

// `--related` operands are SOURCE files; the type-assertion lane's own door is `pnpm test:types`
// (the `types-*` projects). Left un-flagged, every related run carries the typecheck projects' programs.
test("--related is runtime-only whatever the attribution says", () => {
  expect(nodeConfigModeArgs([], "related", false)).toEqual([RUNTIME_ONLY]);
  expect(nodeConfigModeArgs(["types-node"], "related", false)).toEqual([RUNTIME_ONLY]);
  expect(nodeConfigModeArgs(["tooling", "types-node"], "related", false)).toEqual([RUNTIME_ONLY]);
});
