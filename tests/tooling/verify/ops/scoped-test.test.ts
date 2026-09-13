// THE #2232 PIN — the scoped node door's CONFIG MODE, all four arms, both directions.
//
// `pnpm test:scoped` passed no config-mode flag to `scripts/vitest-supervised.mjs`, so it took the ROOT
// vitest config and carried BOTH `types-*` typecheck projects whether the caller had claimed a type test or
// not. The cost is not the ts7 pass — a typecheck project with ZERO matched files is instantiated and never
// runs the checker — it is that an unclaimed project's WHOLE PROGRAM joins the run's verdict, so a parse
// error in a file the caller never named exits the run 1 with every named test green.
//
// THE DRIVEN RECEIPT, and it is the DIRECTORY case because that is the arm every lane's floor goes through.
// `tests/tooling/doc-catalog` is MIXED — nine runtime files beside `contract/types.test-d.ts` — so the
// runner attributes it to `tooling` + `types-node` and it claims NOTHING in the browser world. With a
// planted parse error at `tests/support/browser/<scratch>.ts` (inside `tsconfig.tests-dom.json`'s program
// and EXCLUDED from `tsconfig.json`'s, so the two programs are discriminating):
//
//   pre-rework  `pnpm test:scoped tests/tooling/doc-catalog`  → EXIT 1, all 70 tests green, the sole
//               failure `tests/support/browser/<scratch>.ts:2:1` — a red verdict from a program the
//               caller's files are not even in.
//   post-rework same command                                  → EXIT 0. The run shards `tooling` +
//               `types-node`; `types-browser` is never selected and the plant cannot reach the verdict.
//   plant removed                                             → EXIT 0 either way (the negative control).
//
// THE FIRST DRAFT OF THIS FIX WAS REFUTED (cb-v-verify-lib-4) and the two failures are pinned below. It
// emitted NOTHING for a MIXED selection, which left both typecheck projects riding on every directory
// operand — the founding case untouched — and it injected `--runtime-only` on the operand-less arm, which
// killed `test:scoped --project=types-node -t x` with `No projects matched the filter "types-node"`.
//
// WHAT THIS DOOR DOES NOT FIX, pinned as prose because it is a real remaining limit: a typecheck project the
// caller DID claim brings its whole program, so a parse error in `tsconfig.json` still reds a directory
// operand holding a `.test-d.ts`. That is vitest's `ignoreSourceErrors` default, one lever over.
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
