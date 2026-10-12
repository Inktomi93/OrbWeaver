import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { Project } from "ts-morph";
import { REVIEW_FOCUS, resolveReviewFocus } from "../../../../tooling/src/review-mirror/index.ts";

test("every review-focus row resolves against the real checkout", ({ repoRoot }) => {
  const project = new Project({ skipAddingFilesFromTsConfig: true });
  project.addSourceFilesAtPaths(REVIEW_FOCUS.map((focus) => join(repoRoot, focus.path)));

  const resolved = resolveReviewFocus(project, repoRoot);

  expect(resolved).toHaveLength(REVIEW_FOCUS.length);
  expect(resolved.every((focus) => focus.line > 0)).toBe(true);
  expect(resolved.find((focus) => focus.id === "E6-stats-rebuild-delta")).toMatchObject({
    path: "packages/server/src/domain/stats/persistence/rebuild-from-canon.ts",
    symbol: "reconcileStats",
  });
  expect(resolved.find((focus) => focus.id === "E5-refinery-name-uniqueness")).toMatchObject({
    path: "packages/server/src/domain/refinery/persistence/queries.ts",
    symbol: "insertOwnedSchemaIfNameFree",
  });
});
