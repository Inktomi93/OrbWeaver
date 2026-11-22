// The `pnpm unwired` verb parser through the real CLI. An empty root holds no world, so the member scan runs in
// milliseconds and still writes its report where the bare verb writes it.
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { z } from "zod";
import { EXIT } from "../../../tooling/src/floor/cli/exit-contract.ts";
import { graphTree } from "./_planted.ts";

const MEMBER_REPORT = "reports/unwired/unwired.json";

test.for([
  { spelling: "the bare verb", argv: [] },
  { spelling: "scan", argv: ["scan"] },
])("unwired $spelling runs the member scan and writes its report", async ({ argv }, { runCli, scratch }) => {
  const run = await runCli("unwired", [...argv, `--root=${scratch}`]);
  await expect(run).toExitWith(0);
  expect(existsSync(join(scratch, MEMBER_REPORT))).toBe(true);
});

// The unions, codes, procedures and columns scans have no engine two, so a cross-check request is refused before any
// world loads; the params scan, which has one, is the control that takes the flag.
test.for([
  { verb: "unions", exit: EXIT.misuse },
  { verb: "codes", exit: EXIT.misuse },
  { verb: "procedures", exit: EXIT.misuse },
  { verb: "columns", exit: EXIT.misuse },
  { verb: "params", exit: EXIT.clean },
])("unwired $verb --cross-check exits $exit", async ({ verb, exit }, { runCli, scratch }) => {
  const run = await runCli("unwired", [verb, "--cross-check", `--root=${scratch}`]);
  await expect(run).toExitWith(exit);
});

// `.gitignore` covers only the checkout's own `reports/`, so a scan rooted in a package must not leave a stray there.
test("a scan rooted inside a checkout files its report under the checkout's reports", async ({ runCli, plantedTree }) => {
  const checkout = await plantedTree({ ".git/HEAD": "ref: refs/heads/main\n", "packages/inference/package.json": "{}" });
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
  async (verb, { runCli, scratch }) => {
    const out = join(scratch, "report.json");
    const run = await runCli("unwired", [verb, `--root=${scratch}`, `--out=${out}`]);
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
