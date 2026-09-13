// THE #2232 PIN — the scoped node door's CONFIG MODE, both directions.
//
// `pnpm test:scoped` passed NO config-mode flag to `scripts/vitest-supervised.mjs`, so it took the ROOT
// vitest config, which carries the two `types-*` typecheck projects. Two costs, one of them a lie: every
// scoped run paid a cold ts7 pass over the whole `tsconfig.json` program, and a PARSE ERROR anywhere in
// that program exited the run 1 with every test the caller named GREEN — a red verdict about a file
// nobody mentioned, wearing the caller's exit code. `test:node` and `test:tooling` already passed
// `--runtime-only`; this door was the one that did not.
//
// RED-FIRST, measured before the fix on this tree:
//   1. `pnpm test:scoped tests/tooling/smoke.test.ts` printed `Type Errors  no errors` — the typecheck
//      projects ran on a run that claimed one runtime file.
//   2. With a PLANTED parse error at an untracked scratch path inside `tsconfig.json`'s program, the same
//      invocation exited 1 with `Test Files 1 passed (1)`. After the fix, exit 0 with the plant still
//      in place; with the plant removed, exit 0 either way (the negative control).
// Both receipts are in the lane report; this file pins the DECISION the runner makes, driven through the
// exported door rather than through a whole vitest spawn, because the decision is the thing that broke.
import { nodeConfigModeArgs } from "../../../../tooling/src/verify/ops/scoped-test.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a runtime-only selection spawns with --runtime-only and no project filter", () => {
  expect(nodeConfigModeArgs(["tooling"], "run")).toEqual(["--runtime-only"]);
  expect(nodeConfigModeArgs(["unit", "integration"], "run")).toEqual(["--runtime-only"]);
});

test("an EMPTY selection is a runtime-only run — a bare --grep claims no type file", () => {
  expect(nodeConfigModeArgs([], "run")).toEqual(["--runtime-only"]);
});

test("a .test-d.ts selection does NOT go runtime-only and names the types project the runner attributed", () => {
  expect(nodeConfigModeArgs(["types-node"], "run")).toEqual(["--project=types-node"]);
  expect(nodeConfigModeArgs(["types-browser", "types-node"], "run")).toEqual(["--project=types-browser", "--project=types-node"]);
});

// The two flags are mutually exclusive by construction: the runtime config OMITS the typecheck projects
// before any `--project` filter applies, so `--runtime-only --project=types-node` selects nothing at all.
test("the runtime-only flag and a types project are never emitted together", () => {
  for (const projects of [["types-node"], ["types-browser"], ["types-browser", "types-node"]]) {
    const args = nodeConfigModeArgs(projects, "run");
    expect(args, `${projects.join(",")} must not carry the flag`).not.toContain("--runtime-only");
    expect(args.length).toBe(projects.length);
  }
});

test("a MIXED selection narrows nothing — the caller named both halves and both must run", () => {
  expect(nodeConfigModeArgs(["tooling", "types-node"], "run")).toEqual([]);
  expect(nodeConfigModeArgs(["types-browser", "unit"], "run")).toEqual([]);
});

// `--related` operands are SOURCE files; the type-assertion lane's own door is `pnpm test:types`
// (the `types-*` projects). Left un-flagged, every related run pays the same cold ts7 pass.
test("--related is runtime-only whatever the attribution says", () => {
  expect(nodeConfigModeArgs([], "related")).toEqual(["--runtime-only"]);
  expect(nodeConfigModeArgs(["types-node"], "related")).toEqual(["--runtime-only"]);
});
