// Image-scan failures and setup cache boundaries are exercised through the shipped shell commands.
import { readFileSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { z } from "zod";
import { read, setupSteps, workflowJobs } from "./_workflow-support.ts";

test("published-image scans cannot turn registry failure into a successful skip", async ({ repoRoot, fakeBin }) => {
  const image = workflowJobs(repoRoot, "security-scans")["image"];
  expect(image?.if).toBe("github.event_name == 'schedule' || github.event_name == 'workflow_dispatch'");
  const steps = image?.steps ?? [];
  // The obsolete prelaunch probe swallowed every manifest error, including authentication/network errors.
  await fakeBin("docker", "process.exit(1);");
  const probe = steps.find((step) => step.id === "exists");
  const result = probe?.run === undefined ? undefined : await spawnNiced("bash", ["-euo", "pipefail", "-c", probe.run], { env: { ["IMAGE"]: "proof-image" } });
  expect(result?.code, "registry failure must not be reported as a successful skipped scan").not.toBe(0);
  expect(probe).toBeUndefined();
  const scan = steps.find((step) => step.uses?.startsWith("aquasecurity/trivy-action@") === true);
  const upload = steps.find((step) => step.uses?.startsWith("github/codeql-action/upload-sarif@") === true);
  expect(scan).toBeDefined();
  expect(scan?.if).toBeUndefined();
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  expect(scan?.with).toMatchObject({ "image-ref": "${{ env.IMAGE }}", severity: "HIGH,CRITICAL", "ignore-unfixed": true, output: "trivy.sarif" });
  expect(upload).toBeDefined();
  expect(upload?.if).toBeUndefined();
  expect(upload?.with?.["sarif_file"]).toBe("trivy.sarif");
});

test("setup provisions pinned Chromium and preserves cache-hit dependencies and failed-install refusal", async ({ repoRoot, scratch, fakeBin }) => {
  const composite = setupSteps(repoRoot);
  const version = composite.find((step) => step.id === "playwright");
  expect(version?.run).toContain("pnpm exec playwright --version");
  const cold = composite.find((step) => step.run === "pnpm exec playwright install --with-deps chromium");
  const warm = composite.find((step) => step.run === "pnpm exec playwright install-deps chromium");
  expect(cold?.if).toBe("inputs.browsers == 'true' && steps.browser-cache.outputs.cache-hit != 'true'");
  expect(warm?.if).toBe("inputs.browsers == 'true' && steps.browser-cache.outputs.cache-hit == 'true'");
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('browser-call.json',JSON.stringify(process.argv.slice(2)));process.exitCode=Number(process.env.PROVISION_EXIT);",
  );
  for (const [cacheHit, exit] of [
    [false, 0],
    [true, 0],
    [false, 71],
    [true, 71],
  ] as const) {
    const selected = cacheHit ? warm : cold;
    const ready = join(scratch, "proof-ready");
    await writeFile(ready, "");
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", `${selected?.run ?? ""}\nprintf ready > proof-ready`], {
      cwd: scratch,
      env: { ["PROVISION_EXIT"]: String(exit) },
    });
    expect(result.code, result.stderr).toBe(exit);
    expect(JSON.parse(read(scratch, "browser-call.json"))).toEqual(
      cacheHit ? ["exec", "playwright", "install-deps", "chromium"] : ["exec", "playwright", "install", "--with-deps", "chromium"],
    );
    expect(readFileSync(ready, "utf8")).toBe(exit === 0 ? "ready" : "");
  }
});

test("setup has one cache owner and only saves successful misses from trusted triggers", ({ repoRoot }) => {
  const steps = setupSteps(repoRoot);
  const pnpm = steps.find((step) => step.uses?.startsWith("pnpm/action-setup@") === true);
  expect(pnpm?.with?.["cache"]).toBe(false);
  expect(steps.filter((step) => step.uses?.startsWith("actions/cache@") === true)).toEqual([]);
  const restores = steps.filter((step) => step.uses?.startsWith("actions/cache/restore@") === true);
  const saves = steps.filter((step) => step.uses?.startsWith("actions/cache/save@") === true);
  expect(restores.map((step) => step.id)).toEqual(["pnpm-cache", "browser-cache"]);
  expect(saves).toHaveLength(restores.length);
  const installIndex = steps.findIndex((step) => step.name === "pnpm install");
  expect(installIndex).toBeGreaterThan(steps.findIndex((step) => step.id === "pnpm-cache"));
  for (const [index, restore] of restores.entries()) {
    const save = saves[index];
    if (save === undefined) {
      throw new Error("Missing setup cache save");
    }
    expect(save.with?.["path"]).toBe(restore.with?.["path"]);
    expect(save.with?.["key"]).toBe(`\${{ steps.${restore.id}.outputs.cache-primary-key }}`);
    const browserOnly = restore.id === "browser-cache" ? "inputs.browsers == 'true' && " : "";
    expect(save.if).toBe(`${browserOnly}steps.pnpm.outputs.save == 'true' && steps.${restore.id}.outputs.cache-hit != 'true'`);
    expect(steps.indexOf(save)).toBeGreaterThan(installIndex);
  }
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  expect(restores[0]?.with?.["path"]).toBe("${{ steps.pnpm.outputs.paths }}");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  expect(restores[0]?.with?.["key"]).toBe("pnpm-${{ runner.os }}-${{ runner.arch }}-${{ steps.pnpm.outputs.version }}-${{ hashFiles('pnpm-lock.yaml') }}");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  expect(restores[0]?.with?.["restore-keys"]).toBe("pnpm-${{ runner.os }}-${{ runner.arch }}-${{ steps.pnpm.outputs.version }}-\n");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  expect(restores[1]?.with?.["key"]).toBe("playwright-${{ runner.os }}-${{ runner.arch }}-${{ steps.playwright.outputs.version }}");
  expect(restores[1]?.with?.["restore-keys"]).toBeUndefined();
});

test("setup derives cache paths from pnpm and denies cache writes to every untrusted event", async ({ repoRoot, scratch, fakeBin }) => {
  const script = z.string().parse(setupSteps(repoRoot).find((step) => step.id === "pnpm")?.run);
  await fakeBin(
    "pnpm",
    `
    const args = process.argv.slice(2);
    if (args[0] === "--version") console.log("12.6.0");
    else if (args.join(" ") === "store path --silent") console.log("/resolved pnpm/store/v11");
    else if (args.join(" ") === "cache path --silent") console.log("/resolved pnpm/cache");
    else process.exit(1);
  `,
  );
  const output = join(scratch, "cache-output");
  for (const event of ["push", "workflow_dispatch", "schedule", "pull_request", "pull_request_target", "workflow_run", "issue_comment"]) {
    await writeFile(output, "");
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", script], {
      env: Object.fromEntries([
        ["GITHUB_EVENT_NAME", event],
        ["GITHUB_OUTPUT", output],
      ]),
    });
    expect(result.code, result.stderr).toBe(0);
    const values = readFileSync(output, "utf8");
    expect(values).toContain("version=12.6.0\n");
    expect(values).toContain("paths<<EOF\n/resolved pnpm/store/v11\n/resolved pnpm/cache\nEOF\n");
    expect(values).toContain(`save=${["push", "workflow_dispatch", "schedule"].includes(event)}\n`);
  }
});
