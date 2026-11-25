// The `pnpm unwired` verb parser through the real CLI. The scans build the graph, which reads its roots from the tree's
// knip config, so each runs over an empty planted graph tree in a second and still writes its report where its verb
// writes it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import type { TestOptions } from "vitest";
import { z } from "zod";
import { graphTree } from "./_planted.ts";

const MEMBER_REPORT = "reports/unwired/unwired.json";
// Each case spawns the CLI, which loads the tool's module graph: 1 to 3.5 s on a quiet box and past 5 s under load.
const SPAWNS_CLI: TestOptions = { tags: ["slow"] };

test.for([
  { spelling: "the bare verb", argv: [] },
  { spelling: "scan", argv: ["scan"] },
])("unwired $spelling runs the member scan and writes its report", SPAWNS_CLI, async ({ argv }, { runCli, plantedTree }) => {
  const root = await plantedTree(graphTree({}));
  const run = await runCli("unwired", [...argv, `--root=${root}`]);
  await expect(run).toExitWith(0);
  expect(existsSync(join(root, MEMBER_REPORT))).toBe(true);
});

// `.gitignore` covers only the checkout's own `reports/`, so a scan rooted in a package must not leave a stray there.
test("a scan rooted inside a checkout files its report under the checkout's reports", SPAWNS_CLI, async ({ runCli, plantedTree }) => {
  const tree = Object.entries(graphTree({})).map(([file, text]) => [`packages/inference/${file}`, text] as const);
  const checkout = await plantedTree({ ".git/HEAD": "ref: refs/heads/main\n", "packages/inference/package.json": "{}", ...Object.fromEntries(tree) });
  const pkg = join(checkout, "packages/inference");
  const run = await runCli("unwired", ["scan", `--root=${pkg}`]);
  await expect(run).toExitWith(0);
  expect(existsSync(join(checkout, MEMBER_REPORT))).toBe(true);
  expect(existsSync(join(pkg, "reports"))).toBe(false);
});

// Each list a scan's report writes reaches the summary line as its name and count, so no bucket, judged or stale
// entries included, hides from a rerun's one line.
function expectEveryBucket(run: { readonly stderr: string }, out: string): void {
  const report = z.record(z.string(), z.unknown()).parse(JSON.parse(readFileSync(out, "utf8")));
  const buckets = Object.entries(report).flatMap(([name, value]) => (Array.isArray(value) && name !== "limits" ? [`${name}=${String(value.length)}`] : []));
  expect(buckets.map((bucket) => bucket.slice(0, bucket.indexOf("=")))).toEqual(expect.arrayContaining(["unwired", "judged", "staleJudged", "deliberate"]));
  const summary = run.stderr.split("\n").find((line) => line.startsWith("scanned=")) ?? "";
  expect(buckets.filter((bucket) => !summary.split(" ").includes(bucket))).toEqual([]);
}

test.for(["scan", "fields", "params", "shapes", "procedures", "columns"])(
  "unwired %s prints every bucket its report writes",
  SPAWNS_CLI,
  async (verb, { runCli, scratch, plantedTree }) => {
    const out = join(scratch, "report.json");
    const root = await plantedTree(graphTree({}));
    const run = await runCli("unwired", [verb, `--root=${root}`, `--out=${out}`]);
    await expect(run).toExitWith(0);
    expectEveryBucket(run, out);
  },
);

// The unions scan runs a graph session, which needs a tree the graph can build: a solution config and a knip config.
test("unwired unions prints every bucket its report writes", { timeout: 120_000 }, async ({ runCli, plantedTree, scratch }) => {
  const root = await plantedTree(
    graphTree({ "packages/a/src/mode.ts": 'export const MODES = ["on", "off"] as const;\nexport const on: (typeof MODES)[number] = "on";' }),
  );
  const out = join(scratch, "report.json");
  const run = await runCli("unwired", ["unions", `--root=${root}`, `--out=${out}`]);
  await expect(run).toExitWith(0);
  expectEveryBucket(run, out);
});

// codes runs on the reference graph, whose session reads the tree's knip config, so it runs over a planted graph tree.
test("unwired codes prints every bucket its report writes", { timeout: 120_000 }, async ({ runCli, plantedTree, scratch }) => {
  const root = await plantedTree(graphTree({}));
  const out = join(scratch, "report.json");
  const run = await runCli("unwired", ["codes", `--root=${root}`, `--out=${out}`]);
  await expect(run).toExitWith(0);
  expectEveryBucket(run, out);
});
