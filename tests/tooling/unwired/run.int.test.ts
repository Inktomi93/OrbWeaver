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

// The codes, procedures and columns scans have no engine two and params runs on the graph alone, so a cross-check
// request is refused before any world loads; the unions scan, which has one, is the control that takes the flag.
test.for([
  { verb: "params", exit: EXIT.misuse },
  { verb: "codes", exit: EXIT.misuse },
  { verb: "procedures", exit: EXIT.misuse },
  { verb: "columns", exit: EXIT.misuse },
  { verb: "unions", exit: EXIT.clean },
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

// params builds the reference graph, which needs a tree with a knip config; the engine scans run on an empty root.
const GRAPH_TREE = graphTree({ "packages/a/src/a.ts": 'export const greet = (name?: string): string => name ?? "";\ngreet();' });

// Each list a scan's report writes reaches the summary line as its name and count, so no bucket, judged or stale
// entries included, hides from a rerun's one line.
test.for(["scan", "fields", "params", "unions", "shapes", "codes", "procedures", "columns"])(
  "unwired %s prints every bucket its report writes",
  { timeout: 60_000 },
  async (verb, { runCli, plantedTree, scratch }) => {
    const out = join(scratch, "report.json");
    const root = verb === "params" ? await plantedTree(GRAPH_TREE) : scratch;
    const run = await runCli("unwired", [verb, `--root=${root}`, `--out=${out}`]);
    await expect(run).toExitWith(0);
    const report = z.record(z.string(), z.unknown()).parse(JSON.parse(readFileSync(out, "utf8")));
    const buckets = Object.entries(report).flatMap(([name, value]) => (Array.isArray(value) && name !== "limits" ? [`${name}=${String(value.length)}`] : []));
    expect(buckets.map((bucket) => bucket.slice(0, bucket.indexOf("=")))).toEqual(expect.arrayContaining(["unwired", "judged", "staleJudged", "deliberate"]));
    const summary = run.stderr.split("\n").find((line) => line.startsWith("scanned=")) ?? "";
    expect(buckets.filter((bucket) => !summary.split(" ").includes(bucket))).toEqual([]);
  },
);
