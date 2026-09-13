// Arm B's ENGINE-DIR clause (owner ask 2026-09-06, #1315 follow-through): a tool dir with index.ts and no
// cli.ts is not a missing argv door when a snap arm ENTERS it through that index.ts — it is an engine, and
// the stub cli.ts the template used to force (ui-audit, motion-audit, cpu-profile) can be deleted. Derived
// from snap's own import specifiers, never from a row: a dir nothing under snap imports is still RED.
import { gate } from "../../../../tooling/src/verify/gates/tooling-slot-template.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { ctxFor, withTree } from "../../_support.ts";

const CLASSIFIED_HOMES = {
  "tooling/src/stack/index.ts": "export {};\n",
  "tooling/src/stack/stack.sh": "#!/bin/sh\n",
  "tooling/src/verify/index.ts": "export {};\n",
  "tooling/src/verify/cli.ts": "export {};\n",
  "tooling/src/verify/gates/example.ts": "export {};\n",
};
const ENGINE = {
  ...CLASSIFIED_HOMES,
  "tooling/src/enginetool/index.ts": "export const engine = 1;\n",
  "tooling/src/enginetool/lib/walk.ts": "export const walk = 1;\n",
  "tooling/src/snap/cli.ts": "export {};\n",
  "tooling/src/snap/index.ts": "export {};\n",
};
const SNAP_ARM_ENTERS = {
  "tooling/src/snap/ops/arms/design.ts": 'import { engine } from "../../../enginetool/index.ts";\nexport const d = engine;\n',
};
const SNAP_ARM_IGNORES = {
  "tooling/src/snap/ops/arms/design.ts": "export const d = 1;\n",
};

function findings(files: Record<string, string>): ReturnType<typeof runPolicyPass>["authority"]["effectiveFindings"] {
  let out: ReturnType<typeof runPolicyPass>["authority"]["effectiveFindings"] = [];
  withTree(files, (root) => {
    const { project } = ctxFor(files, root);
    const result = runPolicyPass({
      knownPolicies: [gate],
      policies: [gate],
      root,
      project,
      resourceOptions: { overlay: files },
      reviewedGrants: [],
      failOnWarnings: false,
    });
    expect(result.toolErrors).toEqual([]);
    expect(result.factErrors).toEqual([]);
    out = result.authority.effectiveFindings;
  });
  return out;
}

test("an index.ts-only tool dir that a snap arm imports through its index is an ENGINE — no argv door owed", () => {
  const found = findings({ ...ENGINE, ...SNAP_ARM_ENTERS });
  expect(found.filter((f) => (f.message ?? "").includes("no cli.ts"))).toEqual([]);
});

test("POSITIVE CONTROL — the same dir with no snap importer still owes its cli.ts", () => {
  const found = findings({ ...ENGINE, ...SNAP_ARM_IGNORES });
  expect(found.filter((f) => (f.message ?? "").includes("no cli.ts")).map((f) => f.file)).toEqual(["tooling/src/enginetool"]);
});

test("an engine dir still needs its index.ts — the clause never widens arm B's other half", () => {
  const files = { ...ENGINE, ...SNAP_ARM_ENTERS };
  const { "tooling/src/enginetool/index.ts": _dropped, ...withoutIndex } = files;
  const found = findings({ ...withoutIndex, "tooling/src/enginetool/lib/walk.ts": "export const walk = 1;\n" });
  expect(found.filter((f) => (f.message ?? "").includes("no index.ts")).map((f) => f.file)).toEqual(["tooling/src/enginetool"]);
});

test("the corpus classification permits only verify/gates, never another sixth slot", () => {
  const found = findings({ ...CLASSIFIED_HOMES, "tooling/src/verify/anything/x.ts": "export {};\n" });
  expect(found.filter((f) => f.message.includes("is not a slot")).map((f) => f.file)).toEqual(["tooling/src/verify/anything"]);
});

test("classification liveness needs no unrelated exit-contract sentinel", () => {
  const { "tooling/src/stack/index.ts": _index, "tooling/src/stack/stack.sh": _shell, ...withoutStack } = CLASSIFIED_HOMES;
  expect(findings(withoutStack).some((f) => f.message.includes('stale BASH_FRONTED_TOOLS row "stack"'))).toBe(true);
  const { "tooling/src/verify/gates/example.ts": _gate, ...withoutCorpus } = CLASSIFIED_HOMES;
  const found = findings({ ...withoutCorpus, "tooling/src/verify/anything/x.ts": "export {};\n" });
  expect(found.some((f) => f.message.includes('stale CORPUS_SLOTS row "verify"'))).toBe(true);
  expect(
    findings({ ...CLASSIFIED_HOMES, "tooling/src/stack/cli.ts": "export {};\n" }).some((f) => f.message.includes('BASH_FRONTED_TOOLS row "stack" is stale')),
  ).toBe(true);
});
