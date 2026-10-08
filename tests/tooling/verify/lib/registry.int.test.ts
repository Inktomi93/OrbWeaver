// Native collection proves automatic runtime selection excludes tooling, while focused tests remain reachable.
import process from "node:process";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { SEMANTIC_CORPUS_RESOURCE } from "@orb/tooling/_shared/test-kinds";
import { stagesForTier } from "../../../../tooling/src/verify/lib/registry.ts";
import { resolveSelection } from "../../../../tooling/src/verify/lib/selection.ts";
import { collectNodeShards } from "../../../../tooling/src/verify/ops/scoped-test.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

function listFiles(root: string, args: readonly string[]): readonly string[] {
  const result = runNicedSync(process.execPath, [`${root}/node_modules/vitest/vitest.mjs`, "list", "--filesOnly", ...args], {
    cwd: root,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`native collection failed: ${result.stderr}`);
  }
  return result.stdout
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/^\[[^\]]+\]\s*/u, "")
        .replace(`${root}/`, ""),
    )
    .filter((line) => line.endsWith(".test.ts"));
}

test("automatic shared-source selection has no tooling execution population, but named focused proofs remain available", { timeout: scaledBudget(120_000) }, ({
  repoRoot,
}) => {
  const node = stagesForTier("changed").find(({ name }) => name === "tests:node");
  const argv = node?.scopedArgv?.(resolveSelection({ kind: "file", paths: ["tooling/src/verify/lib/registry.ts", "tests/support/fixtures.ts"] }));
  if (argv === undefined || typeof argv === "string") {
    throw new Error("missing automatic related invocation");
  }
  const config = ["--config=vitest.runtime.config.ts", ...argv.filter((arg) => arg.startsWith("--exclude="))];
  const product = listFiles(repoRoot, config);
  expect(product.length).toBeGreaterThan(0);
  expect(product.filter((path) => path.startsWith("tests/tooling/"))).toEqual([]);
  const wholeProduct = listFiles(repoRoot, ["--config=vitest.product.config.ts"]);
  expect(wholeProduct.length).toBeGreaterThan(0);
  expect(wholeProduct.filter((path) => path.startsWith("tests/tooling/"))).toEqual([]);
  const focused = listFiles(repoRoot, ["--config=vitest.runtime.config.ts", "tests/tooling/verify/lib/registry"]);
  expect(focused.length).toBeGreaterThan(0);
  expect(focused.every((path) => path.startsWith("tests/tooling/"))).toBe(true);
});

test("weekly native partitions exactly cover the current tooling population once without executing proofs", { timeout: scaledBudget(90_000) }, async ({
  repoRoot,
}) => {
  const all = listFiles(repoRoot, ["--config=vitest.runtime.config.ts", "tests/tooling"]);
  const ordinary = listFiles(repoRoot, ["--config=vitest.runtime.config.ts", `--project=!${SEMANTIC_CORPUS_RESOURCE}`, "tests/tooling"]);
  const corpus = await collectNodeShards(repoRoot, SEMANTIC_CORPUS_RESOURCE, 2);
  const partitioned = [...ordinary, ...corpus.shards.flat()];
  expect(all.length).toBeGreaterThan(corpus.files.length);
  expect(ordinary).toContain("tests/tooling/tool-guard.int.test.ts");
  expect(corpus.shards.every((shard) => shard.length > 0)).toBe(true);
  expect(new Set(partitioned).size).toBe(partitioned.length);
  expect(partitioned.toSorted()).toEqual(all.toSorted());
});
