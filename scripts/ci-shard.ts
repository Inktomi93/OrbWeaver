// Native collection owns the denominator; durations affect placement, never membership or qualification.
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import process from "node:process";
import { openRunSlot, publishRunSlot, runFile } from "@orb/tooling/_shared/artifacts";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { testProcessEnv } from "@orb/tooling/_shared/process-env";
import { runTool, UsageError } from "@orb/tooling/_shared/run-tool";
import { toRepoRelative } from "@orb/tooling/_shared/scoped-run-paths";
import type { NativeDurationShardCollection, NativeNodeShard, ScopedTestRunner } from "@orb/tooling/verify";
import { balanceNativeFiles, collectCtCases, collectNode, ownScheme, readNativeCtCases, requireNativeSelection } from "@orb/tooling/verify";
import { z } from "zod";

const BASELINE = z.object({
  node: z.array(z.object({ file: z.string(), durationMs: z.number().nonnegative() })),
  ct: z.array(z.object({ file: z.string(), durationMs: z.number().nonnegative() })),
});

function runE2eShard(root: string, shard: NativeNodeShard, list: boolean, reportFile: string): number {
  const listing = runNicedSync(
    process.execPath,
    [join(root, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.config.ts", "--list", "--reporter=json"],
    {
      cwd: root,
      env: testProcessEnv({ E2E_LIVE: "0", E2E_ALLOW_DEV_TARGET: "0" }),
      maxBuffer: 67_108_864,
    },
  );
  const parsed = readNativeCtCases(listing);
  if (listing.status !== 0 || "error" in parsed) {
    throw new Error("error" in parsed ? parsed.error : listing.stderr);
  }
  const projects = [...new Set(parsed.cases.map((row) => row.project))].sort();
  if (projects.length !== shard.count || shard.index < 1 || shard.index > shard.count || parsed.cases.length === 0) {
    throw new Error("E2E mode partitions do not reconcile with native collection");
  }
  const project = projects[shard.index - 1];
  if (project === undefined) {
    throw new Error("missing E2E mode");
  }
  const selectedListing = runNicedSync(
    process.execPath,
    [join(root, "node_modules/@playwright/test/cli.js"), "test", "--config=playwright.config.ts", `--project=${project}`, "--list", "--reporter=json"],
    { cwd: root, env: testProcessEnv({ E2E_LIVE: "0", E2E_ALLOW_DEV_TARGET: "0" }), maxBuffer: 67_108_864 },
  );
  const selectedCases = readNativeCtCases(selectedListing);
  if (selectedListing.status !== 0 || "error" in selectedCases) {
    throw new Error("E2E isolated mode collection failed");
  }
  requireNativeSelection(
    parsed.cases.filter((row) => row.project === project).map((row) => row.id),
    selectedCases.cases.map((row) => row.id),
  );
  writeFileSync(
    reportFile,
    `${JSON.stringify({ runner: "e2e", shard, projects, selected: project, cases: parsed.cases, selectedCases: parsed.cases.filter((row) => row.project === project) }, null, 2)}\n`,
  );
  return list
    ? 0
    : (runNicedSync("pnpm", ["e2e", `--project=${project}`], {
        cwd: root,
        env: testProcessEnv({ E2E_LIVE: "0", E2E_ALLOW_DEV_TARGET: "0" }),
        stdio: "inherit",
      }).status ?? 2);
}

await runTool(() => {
  const [runner, operand, option] = process.argv.slice(2);
  const match = /^(\d+)\/(\d+)$/u.exec(operand ?? "");
  if (runner === undefined || !["node", "ct", "e2e"].includes(runner) || match === null || (option !== undefined && option !== "--list")) {
    throw new UsageError("ci-shard requires node|ct|e2e <index>/<count> [--list]");
  }
  const root = process.cwd();
  const shard = { index: Number(match[1]), count: Number(match[2]) };
  const slot = openRunSlot(root, "ci-shard");
  const reportFile = runFile(slot, "ci-shard.json");
  process.stdout.write(`[ci-shard] report ${reportFile}\n`);
  if (slot.racing.length > 0) {
    process.stderr.write(`[ci-shard] CONCURRENT run(s): ${slot.racing.join(", ")} — each keeps its own slot\n`);
  }
  const code =
    runner === "e2e"
      ? runE2eShard(root, shard, option === "--list", reportFile)
      : runWeightedShard(root, runner, shard, { list: option === "--list", reportFile });
  publishRunSlot(root, slot, [{ alias: "ci-shard.json", target: "ci-shard.json" }]);
  return ownScheme(code);
});

function runWeightedShard(
  root: string,
  runner: string,
  shard: NativeNodeShard,
  { list, reportFile }: { readonly list: boolean; readonly reportFile: string },
): number {
  const baseline = BASELINE.parse(JSON.parse(readFileSync(join(root, "tooling/ci-duration-weights.json"), "utf8")));
  const args = runner === "node" ? ["--config=vitest.runtime.config.ts", "--exclude=tests/tooling/**"] : ["--config=playwright-ct.product.config.ts"];
  const nativeRunner = runner === "node" ? "node" : "ct";
  const whole = collectBalancedPopulation(nativeRunner, root, args);
  const selection = balanceNativeFiles(whole.files, baseline[runner === "node" ? "node" : "ct"], shard);
  const filters = runner === "node" ? [...selection.selected] : selection.selected.map((file) => `${RegExp.escape(file)}$`);
  const selected = collectBalancedPopulation(nativeRunner, root, [...args, ...filters]);
  requireNativeSelection(selection.selected, selected.files);
  if (whole.cases !== null && selected.cases !== null) {
    requireNativeSelection(
      whole.cases.filter((row) => selection.selected.includes(row.file)).map((row) => row.id),
      selected.cases.map((row) => row.id),
    );
  }
  writeFileSync(
    reportFile,
    `${JSON.stringify({ runner, ...selection, caseFiles: whole.cases, caseIds: whole.cases?.map((row) => row.id) ?? null, selectedCaseIds: selected.cases?.map((row) => row.id) ?? null }, null, 2)}\n`,
  );
  const argv = runner === "node" ? ["test:node", ...filters] : ["test:ct", ...filters, ...args, "--retries=2"];
  return list ? 0 : (runNicedSync("pnpm", argv, { cwd: root, env: testProcessEnv(), stdio: "inherit" }).status ?? 2);
}

function collectBalancedPopulation(runner: ScopedTestRunner, root: string, args: readonly string[]): NativeDurationShardCollection {
  if (runner === "node") {
    const collection = collectNode(root, args);
    if ("error" in collection) {
      throw new Error(collection.error);
    }
    return { files: collection.files, cases: null };
  }
  const collection = collectCtCases(root, args);
  if ("error" in collection) {
    throw new Error(collection.error);
  }
  const files = [...new Set(collection.cases.map((row) => toRepoRelative(root, resolve(collection.rootDir, row.file))))];
  return { files, cases: collection.cases.map((row) => ({ id: row.id, file: toRepoRelative(root, resolve(collection.rootDir, row.file)) })) };
}
