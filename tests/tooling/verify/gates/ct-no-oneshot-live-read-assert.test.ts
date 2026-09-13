import { Project } from "ts-morph";
import { gate } from "../../../../tooling/src/verify/gates/ct-no-oneshot-live-read-assert.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

test("a non-retrying expect() reading mutable async state in a CT is flagged, and a settled read is not", () => {
  expect(verifyPolicyProofs([gate])).toEqual([]);
});

const ROOT = "/ct-no-oneshot-family";

function passOf(files: Readonly<Record<string, string>>): ReturnType<typeof runPolicyPass> {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, source] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, source);
  }
  return runPolicyPass({ knownPolicies: [gate], policies: [gate], root: ROOT, project, reviewedGrants: [], failOnWarnings: false });
}

// ---------------------------------------------------------------------------------------------------
// REPORT IDENTITY, POSITIVE ARM. The gate's report supplies its own policy id and an "expect" position
// token — this proves what the mustFlag row can only assert indirectly: a marker naming THIS gate's own
// id at the exact reported position is bound by the central engine and suppresses the finding. (The
// wrong-policy / stale / malformed report-identity cases are the CENTRAL engine's own proof —
// `ordinary-waiver.test.ts` — proved once there; a per-gate negative arm here with only `[gate]` in
// `knownPolicies` made the named sibling `unknown-policy`, which is unreachable in production where the
// whole family is known, and was therefore vacuous — owner ruling 2026-09-11, #1935.)
// ---------------------------------------------------------------------------------------------------
test("an @orb-waive naming this gate's OWN id at the exact position suppresses the finding", () => {
  const waived = passOf({
    "tests/client/data/x.ct.tsx":
      'import { expect, test } from "@playwright/experimental-ct-react";\ntest("x", () => {\n  // @orb-waive ct-no-oneshot-live-read-assert(expect): settled — count polled to 2 above.\n  expect(trpc.count("tag.createTag")).toBe(2);\n});\n',
  });

  expect(waived.authority.effectiveFindings).toEqual([]);
  expect(waived.authority.waivedFindings).toHaveLength(1);
  expect(waived.authority.authorityAlarms).toEqual([]);
});

test("snapshot declaration identity survives imported aliases and mutable locals without following a same-named shadow", () => {
  const result = passOf({
    "tests/ui/snapshot.ts": "export const snapshot = document.activeElement;",
    "tests/ui/snapshot.ct.tsx":
      'import { snapshot as imported } from "./snapshot.ts"; expect(imported).toBe(null); let live = document.activeElement; expect(live).toBe(null); function other() { const live = null; expect(live).toBe(null); }',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(2);
});

test("an imported mutable snapshot retains its authored live-read taint", () => {
  const result = passOf({
    "tests/ui/mutable.ts": "export let snapshot = document.activeElement;",
    "tests/ui/mutable.ct.tsx": 'import { snapshot } from "./mutable.ts"; expect(snapshot).toBe(null);',
  });
  expect(result.toolErrors).toEqual([]);
  expect(result.authority.effectiveFindings).toHaveLength(1);
});
