// The Node suite's coverage scope admits every production source file, so no file with code drops out of the universe.
import { execFileSync } from "node:child_process";
import { matchesGlob } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { diskHead, isProductionSource, PRODUCTION_COVERAGE_SCOPE } from "../../../tooling/src/unwired/coverage-merge.ts";

test("every production source file, index.ts included, is inside the scope handed to vitest", ({ repoRoot }) => {
  const tracked = execFileSync("git", ["ls-files", "--", "packages/*/src/**"], { cwd: repoRoot, encoding: "utf8" }).split("\n").filter(Boolean);
  const production = tracked.filter((rel) => isProductionSource(rel, diskHead(repoRoot)));
  expect(production.filter((rel) => rel.endsWith("/index.ts")).length).toBeGreaterThan(0);
  const admitted = (rel: string): boolean =>
    matchesGlob(rel, PRODUCTION_COVERAGE_SCOPE.include) && !PRODUCTION_COVERAGE_SCOPE.exclude.some((glob) => matchesGlob(rel, glob));
  expect(production.filter((rel) => !admitted(rel))).toEqual([]);
});
