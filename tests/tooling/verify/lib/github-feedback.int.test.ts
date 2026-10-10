import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { pathToFileURL } from "node:url";
import { execFixtureGit } from "@orb/tooling/_shared/git-fixture";
import { HOST_POOL_ROOT_ENV } from "@orb/tooling/_shared/host-slots";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import type { VerifyReport } from "../../../../tooling/src/verify/contract/stage.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

for (const timeout of [true, false]) {
  test(`native quality feedback retains ${timeout ? "dry-run timeout outside the excerpt tail" : "import failure without a false timeout"}`, {
    timeout: scaledBudget(60_000),
  }, async ({ repoRoot, scratch, fakeBin }) => {
    execFixtureGit(scratch, ["init", "-q"]);
    execFixtureGit(scratch, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "--allow-empty", "-qm", "fixture"]);
    await fakeBin(
      "pnpm",
      `if (process.argv.includes("test:mutation:gate")) {
      console.log(${JSON.stringify(timeout ? "Initial test run timed out!" : "ConfigError: cannot import adapter")});
      for (let index = 0; index < 20; index += 1) console.log("at native stack " + index);
      process.exitCode = 1;
    } else { console.log("other native stage completed"); }`,
    );
    const runner = join(scratch, "feedback-runner.ts");
    writeFileSync(
      runner,
      `import { parse } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/lib/run-argv.ts")).href)};
import { runVerify } from ${JSON.stringify(pathToFileURL(join(repoRoot, "tooling/src/verify/ops/run.ts")).href)};
const parsed = parse(["--full", "--partition=quality"]);
if ("error" in parsed) throw new Error(parsed.error);
process.exitCode = await runVerify(${JSON.stringify(scratch)}, parsed);`,
    );
    const summaryPath = join(scratch, "summary.md");
    const result = await spawnNiced(process.execPath, [runner], {
      cwd: repoRoot,
      timeoutMs: scaledBudget(30_000),
      env: { ["GITHUB_ACTIONS"]: "true", ["GITHUB_STEP_SUMMARY"]: summaryPath, [HOST_POOL_ROOT_ENV]: join(scratch, "slots") },
    });
    expect(result.code, result.stdout + result.stderr).toBe(2);
    const native = JSON.parse(readFileSync(join(scratch, "reports/verify.json"), "utf8")) as VerifyReport;
    const mutation = native.stages.find((stage) => stage.name === "quality:mutation-gate");
    expect(mutation?.childExit).toBe(1);
    expect(native.noVerdict).toContain("quality:mutation-gate");
    expect(mutation?.failureExcerpt).not.toContain("Initial test run timed out");
    const line = result.stdout.split("\n").find((row) => row.startsWith("::error title=quality%3Amutation-gate::"));
    expect(line).toContain("TOOL-ERROR (child exit 1)");
    expect(line?.includes("dry run timed out")).toBe(timeout);
    expect(line).toContain(mutation?.failureExcerpt?.split("\n")[0]);
    expect(result.stdout).toContain("::group::quality:mutation-gate (running)");
    expect(result.stdout).toContain(`quality:mutation-gate (TOOL-ERROR / no verdict, ${mutation?.durationMs}ms)\n::endgroup::`);
    expect(result.stdout.match(/::group::/gu)).toHaveLength(native.stages.length);
    expect(result.stdout.match(/::endgroup::/gu)).toHaveLength(native.stages.length);
    const summary = readFileSync(summaryPath, "utf8");
    expect(summary).toContain(`| quality:mutation-gate | TOOL-ERROR / no verdict | ${mutation?.durationMs}ms |`);
    expect(summary).toContain(mutation?.failureExcerpt);
  });
}
