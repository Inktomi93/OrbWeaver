import { Project } from "ts-morph";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/stale-draft-commit.ts";
import { gate as health } from "../../../../tooling/src/verify/gates/stale-draft-decision-health.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { DRAFT_DECISION_HOME, DRAFT_TREE_ANCHOR } from "../../../../tooling/src/verify/lib/stale-draft-read.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const ROOT = "/stale-draft-family";
const CELL = "packages/client/src/features/example/components/cell.tsx";
type Files = Readonly<Record<string, string>>;
function projectFor(files: Files): Project {
  const project = new Project({ useInMemoryFileSystem: true });
  for (const [path, text] of Object.entries(files)) {
    project.createSourceFile(`${ROOT}/${path}`, text);
  }
  return project;
}
function after(files: Files, requestedPaths?: readonly string[]): ReturnType<typeof runPolicyPass> {
  return runPolicyPass({
    root: ROOT,
    project: projectFor(files),
    knownPolicies: [ordinary, health],
    policies: [ordinary, health],
    reviewedGrants: [],
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
}

test("draft occurrence and independent decision-home health proofs run through conformance", () => {
  expect(verifyPolicyProofs([ordinary, health])).toEqual([]);
});

test("ordinary occurrence remains selectable while whole-population health defers", () => {
  const source = "const [draft] = useState(source);\nif (draft !== source) save(draft);";
  const files = { [CELL]: source, [DRAFT_DECISION_HOME]: "export {};", [DRAFT_TREE_ANCHOR]: "export {};" };
  const selected = after(files, [CELL]);
  expect(selected.toolErrors).toEqual([]);
  expect(selected.policies.find((policy) => policy.id === health.id)?.owner).toMatchObject({
    status: "not-applicable",
    reason: "requested selection has an empty policy intersection",
  });
  expect(after(files, [CELL, DRAFT_TREE_ANCHOR]).policies.find((policy) => policy.id === health.id)?.owner).toMatchObject({
    status: "not-applicable",
    reason: "entire-population policy deferred for a proper subset selection",
  });
  expect(selected.authority.effectiveFindings).toEqual([expect.objectContaining({ policyId: ordinary.id, file: CELL, token: "draft" })]);
  const licensed = after({ ...files, [CELL]: source.replace("\nif", "\n// @orb-waive stale-draft-commit(draft): measured concurrent writer policy.\nif") }, [
    CELL,
  ]);
  expect(licensed.authority.effectiveFindings).toEqual([]);
  expect(licensed.authority.waivedFindings).toHaveLength(1);
});
