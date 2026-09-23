// The knip negative-pattern liveness stage in both directions: a literal negation naming an untracked path
// reds and names the pattern by workspace; one naming a tracked file passes; a wildcard negation over an
// absent directory is out of scope. The last case judges the real knip.ts against the real git index.
import knipConfig from "../../../../knip.ts";
import { judgeKnipNegatives, knipNegativeReport } from "../../../../tooling/src/verify/ops/knip-negative-liveness.ts";
import { loadTrackedFiles } from "../../../../tooling/src/verify/ops/resource-tracked.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const TRACKED = new Set(["packages/client/src/main.tsx", "scripts/run.ts", "knip.ts"]);

test("a literal negation naming an untracked path is dead, and the report names its workspace and pattern", () => {
  const outcome = judgeKnipNegatives({ workspaces: { "packages/client": { project: ["src/**/*.{ts,tsx}!", "!src/features/chat/lib/gone.ts!"] } } }, TRACKED);
  expect(outcome.literal).toBe(1);
  expect(outcome.dead).toEqual([
    { workspace: "packages/client", key: "project", pattern: "!src/features/chat/lib/gone.ts!", path: "packages/client/src/features/chat/lib/gone.ts" },
  ]);
  expect(knipNegativeReport(outcome)[1]).toContain('knip.ts workspace "packages/client" project: `!src/features/chat/lib/gone.ts!`');
});

test("a literal negation naming a tracked file passes, in a workspace and at the root", () => {
  const outcome = judgeKnipNegatives(
    { ignore: ["!knip.ts"], workspaces: { "packages/client": { entry: ["!./src/main.tsx"] }, ".": { ignore: "!scripts/run.ts" } } },
    TRACKED,
  );
  expect(outcome).toEqual({ literal: 3, wildcard: 0, dead: [] });
});

test("a wildcard negation over an absent directory is out of scope, never a dead finding", () => {
  const outcome = judgeKnipNegatives(
    { workspaces: { ".": { entry: ["scripts/**/*.ts", "!scripts/probes/st-goldens/sillytavern-runtime/**"], project: ["!scripts/{a,b}.ts"] } } },
    TRACKED,
  );
  expect(outcome).toEqual({ literal: 0, wildcard: 2, dead: [] });
});

test("the real knip.ts names only tracked files in its literal negations", ({ repoRoot }) => {
  const tracked = loadTrackedFiles(repoRoot);
  if (tracked.status !== "ready") {
    throw new Error(`git index unreadable: ${tracked.reason}`);
  }
  const outcome = judgeKnipNegatives(knipConfig, new Set(tracked.value.repoPaths));
  expect(outcome.dead).toEqual([]);
  expect(outcome.wildcard).toBeGreaterThan(0);
});
