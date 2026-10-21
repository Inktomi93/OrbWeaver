import { spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { runInNewContext } from "node:vm";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { parse } from "yaml";
import { z } from "zod";

const stepSchema = z.object({
  id: z.string().optional(),
  name: z.string().optional(),
  run: z.string().optional(),
  if: z.string().optional(),
  uses: z.string().optional(),
  env: z.record(z.string(), z.string()).optional(),
  "timeout-minutes": z.number().optional(),
  with: z.record(z.string(), z.json()).optional(),
});
const workflowSchema = z.object({
  on: z.object({ ["workflow_dispatch"]: z.object({}) }),
  permissions: z.strictObject({ contents: z.literal("read") }),
  env: z.record(z.string(), z.string()).optional(),
  concurrency: z.object({ group: z.string() }),
  ["run-name"]: z.string(),
  jobs: z.record(
    z.string(),
    z.object({
      if: z.string().optional(),
      needs: z.union([z.string(), z.array(z.string())]).optional(),
      "runs-on": z.string(),
      "timeout-minutes": z.union([z.number(), z.string()]),
      env: z.record(z.string(), z.string()).optional(),
      strategy: z.object({ matrix: z.object({ include: z.array(z.object({ project: z.string(), spec: z.string() })) }) }).optional(),
      steps: z.array(stepSchema),
    }),
  ),
});
type Workflow = z.infer<typeof workflowSchema>;
function readWorkflow(repoRoot: string): Workflow {
  return workflowSchema.parse(parse(readFileSync(join(repoRoot, ".github/workflows/diagnostics.yml"), "utf8")));
}

// These guards use only Boolean/string comparisons shared by Actions and JS; execute the actual source,
// not a second spelling of their policy. Status functions are explicit fixture inputs.
function guard(expression: string, context: object): boolean {
  return Boolean(runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/gu, ""), context));
}

test("E2E startup dispatch is bounded, immutable and retains failed global setup evidence without qualification", ({ repoRoot }) => {
  const workflow = readWorkflow(repoRoot);
  const job = workflow.jobs["e2e-startup-diagnostic"];
  if (job === undefined) {
    throw new Error("missing E2E startup diagnostic job");
  }
  expect(job.needs).toBeUndefined();
  expect(job["runs-on"]).toBe("ubuntu-24.04");
  expect(job["timeout-minutes"]).toBe(30);
  expect(job.strategy?.matrix.include).toEqual([
    { project: "single-user", spec: "app-readiness.spec.ts" },
    { project: "local", spec: "auth-smoke.local.spec.ts" },
    { project: "forward-header", spec: "auth-smoke.forward.spec.ts" },
  ]);
  expect(job.env).toEqual({ ["E2E_LIVE"]: "0", ["E2E_ALLOW_DEV_TARGET"]: "0" });
  const [checkout, setup, media, showcase, startup, upload] = job.steps;
  expect(job.steps).toHaveLength(6);
  expect(checkout?.uses).toMatch(/^actions\/checkout@[a-f0-9]{40}$/u);
  expect(checkout?.with).toEqual({ ref: "${{ github.sha }}", "persist-credentials": false });
  expect(setup?.uses).toBe("./.github/actions/setup");
  expect(setup?.with).toEqual({ browsers: "true" });
  expect(media?.run).toBe("bash scripts/ci/install-media.sh");
  expect(media?.["timeout-minutes"]).toBe(15);
  expect(media?.if).toBeUndefined();
  expect(showcase?.id).toBe("showcase");
  expect(showcase?.run).toBe("pnpm --filter @orb/showcase-plugins build");
  expect(showcase?.if).toBeUndefined();
  expect(startup?.run).toBe('pnpm e2e "$E2E_SPEC" --project="$E2E_PROJECT" --retries=0');
  expect(startup?.if).toBeUndefined();
  expect(upload?.if).toBe("${{ !cancelled() }}");
  for (const failure of [false, true]) {
    for (const canceled of [false, true]) {
      expect(guard(upload?.if ?? "false", { cancelled: () => canceled, failure: () => failure })).toBe(!canceled);
    }
  }
  expect(upload?.uses).toBe("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
  expect(upload?.with).toEqual({ name: "reports-e2e-startup-diagnostic-${{ matrix.project }}", path: "reports/\ntest-results/\n", "retention-days": 7 });
  expect(job.steps.some((step) => step.name?.includes("ORB_CI_QUALIFICATION_GENERATION") === true)).toBe(false);
  expect(job.steps.some((step) => step.uses?.startsWith("actions/cache/") === true)).toBe(false);
  expect(job.steps.map((step) => step.run ?? "").join("\n")).not.toMatch(/verified|weekly-proof|pnpm verify|test:ct|ORB_SELECT/u);
});

test("native startup command preserves isolated mode argv, model-free isolation and failure exits", async ({ repoRoot, scratch, fakeBin }) => {
  const job = readWorkflow(repoRoot).jobs["e2e-startup-diagnostic"];
  const command = job?.steps.find((step) => step.id === "startup")?.run;
  expect(command).toBe('pnpm e2e "$E2E_SPEC" --project="$E2E_PROJECT" --retries=0');
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('startup.json',JSON.stringify({argv:process.argv.slice(2),live:process.env.E2E_LIVE,dev:process.env.E2E_ALLOW_DEV_TARGET}));process.exitCode=Number(process.env.FIXTURE_EXIT);",
  );
  for (const code of [0, 1, 2, 3]) {
    const result = spawnSync("bash", ["-e", "-c", command ?? ""], {
      cwd: scratch,
      env: inheritedProcessEnv({ ...job?.env, ["E2E_SPEC"]: "app-readiness.spec.ts", ["E2E_PROJECT"]: "single-user", ["FIXTURE_EXIT"]: String(code) }),
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(code);
    expect(JSON.parse(readFileSync(join(scratch, "startup.json"), "utf8"))).toEqual({
      argv: ["e2e", "app-readiness.spec.ts", "--project=single-user", "--retries=0"],
      live: "0",
      dev: "0",
    });
  }
});

test("startup argv and no-fee controls reject full-suite, missing-mode and live/dev-target substitutions", async ({ repoRoot, scratch, fakeBin }) => {
  const job = readWorkflow(repoRoot).jobs["e2e-startup-diagnostic"];
  const command = job?.steps.find((step) => step.id === "startup")?.run;
  if (command === undefined || job?.env === undefined) {
    throw new Error("missing startup command or isolation environment");
  }
  const expected = { argv: ["e2e", "app-readiness.spec.ts", "--project=single-user", "--retries=0"], live: "0", dev: "0" };
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('startup.json',JSON.stringify({argv:process.argv.slice(2),live:process.env.E2E_LIVE,dev:process.env.E2E_ALLOW_DEV_TARGET}));",
  );
  for (const [run, env] of [
    [command, job.env],
    [command.replace('"$E2E_SPEC" ', ""), job.env],
    [command.replace(' --project="$E2E_PROJECT"', ""), job.env],
    [command.replace("--retries=0", "--retries=2"), job.env],
    [command, { ...job.env, ["E2E_LIVE"]: "1" }],
    [command, { ...job.env, ["E2E_ALLOW_DEV_TARGET"]: "1" }],
  ] as const) {
    const result = spawnSync("bash", ["-e", "-c", run], {
      cwd: scratch,
      env: inheritedProcessEnv({ ...env, ["E2E_SPEC"]: "app-readiness.spec.ts", ["E2E_PROJECT"]: "single-user" }),
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    const observation = JSON.parse(readFileSync(join(scratch, "startup.json"), "utf8"));
    expect(isDeepStrictEqual(observation, expected)).toBe(run === command && env === job.env);
  }
});

test("startup requires the native showcase build and preserves a failed prerequisite instead of running E2E", async ({ repoRoot, scratch, fakeBin }) => {
  const job = readWorkflow(repoRoot).jobs["e2e-startup-diagnostic"];
  const showcase = job?.steps.find((step) => step.id === "showcase")?.run;
  const startup = job?.steps.find((step) => step.id === "startup")?.run;
  expect(showcase).toBe("pnpm --filter @orb/showcase-plugins build");
  if (showcase === undefined || startup === undefined) {
    throw new Error("missing startup prerequisite or command");
  }
  await fakeBin(
    "pnpm",
    [
      "import fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync('calls.jsonl',JSON.stringify(args)+'\\n');",
      "if(args[0]==='--filter'){if(process.env.FIXTURE_BUILD_FAIL==='1')process.exit(71);fs.writeFileSync('showcase-ready','yes');}",
      "else if(!fs.existsSync('showcase-ready'))process.exit(47);",
    ].join("\n"),
  );
  for (const [run, fail, status, calls] of [
    [startup, "0", 47, [["e2e", "app-readiness.spec.ts", "--project=single-user", "--retries=0"]]],
    [`${showcase}\n${startup}`, "1", 71, [["--filter", "@orb/showcase-plugins", "build"]]],
    [
      `${showcase}\n${startup}`,
      "0",
      0,
      [
        ["--filter", "@orb/showcase-plugins", "build"],
        ["e2e", "app-readiness.spec.ts", "--project=single-user", "--retries=0"],
      ],
    ],
  ] as const) {
    const result = spawnSync("bash", ["-e", "-c", run], {
      cwd: scratch,
      env: inheritedProcessEnv({ ["E2E_SPEC"]: "app-readiness.spec.ts", ["E2E_PROJECT"]: "single-user", ["FIXTURE_BUILD_FAIL"]: fail }),
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(status);
    expect(
      readFileSync(join(scratch, "calls.jsonl"), "utf8")
        .trim()
        .split("\n")
        .map((row) => JSON.parse(row)),
    ).toEqual(calls);
    writeFileSync(join(scratch, "calls.jsonl"), "");
  }
});
