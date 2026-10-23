import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { parse } from "yaml";
import { z } from "zod";

const step = z.object({
  name: z.string().optional(),
  id: z.string().optional(),
  run: z.string().optional(),
  uses: z.string().optional(),
  with: z.record(z.string(), z.json()).optional(),
});
function jobs(root: string, file: string): Partial<Record<string, { steps: z.infer<typeof step>[] }>> {
  return z
    .object({ jobs: z.record(z.string(), z.object({ steps: z.array(step) })) })
    .parse(parse(readFileSync(join(root, `.github/workflows/${file}.yml`), "utf8"))).jobs;
}

test("the CI verdict job fails unless every needed job succeeded", async ({ repoRoot, scratch }) => {
  const verdict = jobs(repoRoot, "ci")["ci-ok"];
  const script = z.string().parse(verdict?.steps[0]?.run);
  for (const [results, code] of [
    [["success", "success", "success", "success"], 0],
    [["success", "failure", "success", "success"], 1],
    [["success", "success", "skipped", "success"], 1],
    [["success", "success", "success", "cancelled"], 1],
  ] as const) {
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", script], {
      cwd: scratch,
      env: { ["RESULTS"]: JSON.stringify(results) },
    });
    expect(result.code, result.stderr).toBe(code);
  }
});

test("a failed anonymous development proof never promotes the mutable tag; success promotes after proof", async ({ repoRoot, scratch, fakeBin }) => {
  const steps = jobs(repoRoot, "development-image")["image"]?.steps ?? [];
  const firstPush = steps.findIndex((row) => row.run?.includes("docker push") === true);
  expect(firstPush).toBeGreaterThan(-1);
  const critical = steps.findIndex((row) => row.id === "critical");
  expect(critical).toBeGreaterThan(-1);
  expect(critical).toBeLessThan(firstPush);
  expect(steps[critical]?.with).toMatchObject({ severity: "CRITICAL", ["ignore-unfixed"]: true, ["exit-code"]: "1" });
  expect(steps.filter((row) => row.uses?.startsWith("actions/attest@") === true)).toHaveLength(2);
  mkdirSync(join(scratch, "scripts/ci"), { recursive: true });
  writeFileSync(join(scratch, "scripts/ci/anonymous-image-pull.sh"), 'echo proof >> "$RUNNER_TEMP/calls"; exit "$PROOF_EXIT"\n');
  await fakeBin(
    "docker",
    `import { appendFileSync } from "node:fs";
    const args = process.argv.slice(2);
    if (args[0] === "inspect") console.log("image@sha256:" + "a".repeat(64));
    else appendFileSync(process.env.RUNNER_TEMP + "/calls", args.join(" ") + "\\n");`,
  );
  const script = steps
    .slice(firstPush)
    .map((row) => row.run ?? "")
    .join("\n");
  for (const code of [7, 0]) {
    writeFileSync(join(scratch, "calls"), "");
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", script], {
      cwd: scratch,
      env: {
        ["IMAGE"]: "proof-image",
        ["SOURCE_SHA"]: "b".repeat(40),
        ["DIGEST"]: `sha256:${"a".repeat(64)}`,
        ["PROOF_EXIT"]: String(code),
        ["RUNNER_TEMP"]: scratch,
        ["GITHUB_OUTPUT"]: join(scratch, "output"),
      },
    });
    expect(result.code, result.stderr).toBe(code);
    const calls = readFileSync(join(scratch, "calls"), "utf8");
    expect(calls).toContain("push proof-image:sha-");
    expect(calls.includes("push proof-image:development")).toBe(code === 0);
    const lines = calls.trim().split("\n");
    const proof = lines.indexOf("proof");
    expect(proof).toBeGreaterThan(-1);
    expect(lines.indexOf("push proof-image:development") > proof).toBe(code === 0);
  }
});
