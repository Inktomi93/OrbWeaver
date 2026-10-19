import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { gate as ordinary } from "../../../../tooling/src/verify/gates/stale-draft-commit.ts";
import { runPolicyPass } from "../../../../tooling/src/verify/lib/policy-pass.ts";
import { DRAFT_DECISION_HOME } from "../../../../tooling/src/verify/lib/stale-draft-read.ts";
import { verifyPolicyProofs } from "../../../../tooling/src/verify/ops/policy-conformance.ts";

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
    knownPolicies: [ordinary],
    policies: [ordinary],
    reviewedGrants: [],
    failOnWarnings: false,
    ...(requestedPaths === undefined ? {} : { requestedPaths }),
  });
}

test("draft occurrence proofs run through conformance", () => {
  expect(verifyPolicyProofs([ordinary])).toEqual([]);
});

test("ordinary occurrence is selectable and waivable", () => {
  const source = "const [draft] = useState(source);\nif (draft !== source) save(draft);";
  const files = { [CELL]: source };
  const selected = after(files, [CELL]);
  expect(selected.toolErrors).toEqual([]);
  expect(selected.authority.effectiveFindings).toEqual([expect.objectContaining({ policyId: ordinary.id, file: CELL, token: "draft" })]);
  const licensed = after({ [CELL]: source.replace("\nif", "\n// @orb-waive stale-draft-commit(draft): measured concurrent writer policy.\nif") }, [CELL]);
  expect(licensed.authority.effectiveFindings).toEqual([]);
  expect(licensed.authority.waivedFindings).toHaveLength(1);
});

test("the decision home the draft finding names still resolves to a module exporting resolveCommit", async ({ repoRoot }) => {
  const home = join(repoRoot, DRAFT_DECISION_HOME);
  expect(existsSync(home), `${DRAFT_DECISION_HOME} is the path the draft finding sends readers to`).toBe(true);
  const exported: unknown = await import(pathToFileURL(home).href);
  expect(exported).toHaveProperty("resolveCommit", expect.any(Function));
});
