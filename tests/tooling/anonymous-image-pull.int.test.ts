import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

for (const scenario of ["tool-pull", "tool-version", "copy-launch", "private-image"] as const) {
  test(`anonymous image proof distinguishes ${scenario} without claiming verified image bytes`, async ({ repoRoot, scratch, fakeBin }) => {
    await fakeBin(
      "docker",
      `import { appendFileSync, writeFileSync } from "node:fs";
      const args = process.argv.slice(2);
      appendFileSync("calls.jsonl", JSON.stringify(args) + "\\n");
      if (args[0] === "pull") { if (process.env.SCENARIO === "tool-pull") process.exit(125); }
      else if (args.includes("--version")) { if (process.env.SCENARIO === "tool-version") process.exit(127); console.log("skopeo version fixture"); }
      else if (args.includes("copy")) { writeFileSync("image-attempt", "yes"); console.error("registry authentication required"); process.exit(process.env.SCENARIO === "copy-launch" ? 125 : 1); }
      else process.exit(72);`,
    );
    const summary = join(scratch, "summary.md");
    const result = await spawnNiced("bash", [join(repoRoot, "scripts/ci/anonymous-image-pull.sh")], {
      cwd: scratch,
      env: {
        ["SCENARIO"]: scenario,
        ["RUNNER_TEMP"]: scratch,
        ["GITHUB_STEP_SUMMARY"]: summary,
        ["IMAGE"]: "private.invalid/app",
        ["DIGEST"]: `sha256:${"a".repeat(64)}`,
        ["SOURCE_SHA"]: "b".repeat(40),
        ["IMAGE_CHANNEL"]: "main",
      },
    });
    const isCopyFailure = scenario === "private-image";
    expect(result.code, result.stdout + result.stderr).toBe(isCopyFailure ? 1 : 2);
    expect(result.stdout).toContain(isCopyFailure ? "::error title=Anonymous image copy::" : "::error title=Anonymous proof tool::");
    expect(result.stdout).not.toContain("Make the GHCR package public");
    expect(existsSync(join(scratch, "image-attempt"))).toBe(scenario === "copy-launch" || isCopyFailure);
    expect(existsSync(summary)).toBe(false);
    const calls = readFileSync(join(scratch, "calls.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => z.array(z.string()).parse(JSON.parse(line)));
    expect(calls[0]?.[0]).toBe("pull");
    rmSync(join(scratch, "image-attempt"), { force: true });
  });
}
