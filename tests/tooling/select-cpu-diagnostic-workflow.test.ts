import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { isDeepStrictEqual } from "node:util";
import { runInNewContext } from "node:vm";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { parse } from "yaml";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

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
  on: z.object({ ["workflow_dispatch"]: z.object({ inputs: z.record(z.string(), z.json()) }) }),
  permissions: z.object({ contents: z.literal("read") }).strict(),
  env: z.record(z.string(), z.string()),
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
      steps: z.array(stepSchema),
    }),
  ),
});
type Workflow = z.infer<typeof workflowSchema>;
const ENTRY_JOBS = ["changes", "ci-ok", "qualification", "weekly-head", "weekly-ok", "select-cpu-diagnostic", "e2e-startup-diagnostic"] as const;
const NORMAL_JOBS = ["changes", "static", "media", "node", "ct", "e2e-smoke", "ci-ok", "qualification", "weekly-head", "weekly-tooling", "weekly-ok"] as const;
const WITHHELD_GUARD = "!inputs.select_cpu_diagnostic && ";

function readWorkflow(repoRoot: string): Workflow {
  return workflowSchema.parse(parse(readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8")));
}

// These guards use only Boolean/string comparisons shared by Actions and JS; execute the actual source,
// not a second spelling of their policy. Status functions are explicit fixture inputs.
function guard(expression: string, context: object): boolean {
  return Boolean(runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/gu, ""), context));
}

function entries(workflow: Workflow, event: string, mode: { tier: string | undefined; diagnostic: boolean | undefined; schedule?: string }): readonly string[] {
  const { tier, diagnostic, schedule = "" } = mode;
  return ENTRY_JOBS.filter((name) => {
    const job = workflow.jobs[name];
    return (
      job !== undefined &&
      guard(job.if ?? "true", {
        github: { ["event_name"]: event, event: { schedule } },
        inputs: { tier, ["select_cpu_diagnostic"]: diagnostic },
        always: () => true,
      })
    );
  });
}

const MODES = [
  { event: "push", tier: undefined, diagnostic: undefined, enabled: ["changes", "ci-ok"] },
  { event: "pull_request", tier: undefined, diagnostic: undefined, enabled: ["changes", "ci-ok"] },
  { event: "schedule", tier: undefined, diagnostic: undefined, schedule: "37 9 * * *", enabled: ["qualification"] },
  { event: "schedule", tier: undefined, diagnostic: undefined, schedule: "37 9 * * 0", enabled: ["weekly-head", "weekly-ok"] },
  { event: "workflow_dispatch", tier: "push", diagnostic: undefined, enabled: ["changes", "ci-ok"] },
  { event: "workflow_dispatch", tier: "push", diagnostic: false, enabled: ["changes", "ci-ok"] },
  { event: "workflow_dispatch", tier: "product", diagnostic: false, enabled: ["qualification"] },
  { event: "workflow_dispatch", tier: "full", diagnostic: false, enabled: ["qualification"] },
  { event: "workflow_dispatch", tier: "weekly", diagnostic: false, enabled: ["weekly-head", "weekly-ok"] },
  { event: "workflow_dispatch", tier: "e2e-diagnostic", diagnostic: false, enabled: ["e2e-startup-diagnostic"] },
  { event: "workflow_dispatch", tier: "e2e-diagnostic", diagnostic: undefined, enabled: ["e2e-startup-diagnostic"] },
  ...["push", "product", "full", "weekly", "e2e-diagnostic"].map((tier) => ({
    event: "workflow_dispatch",
    tier,
    diagnostic: true,
    enabled: ["select-cpu-diagnostic"],
  })),
] as const;

test("existing CI dispatch isolates diagnostic authority across every normal trigger and manual tier", ({ repoRoot }) => {
  const workflow = readWorkflow(repoRoot);
  for (const mode of MODES) {
    expect(entries(workflow, mode.event, mode), JSON.stringify(mode)).toEqual(mode.enabled);
  }
  expect(workflow.on.workflow_dispatch.inputs["select_cpu_diagnostic"]).toEqual({
    description: "Capture Select CPU diagnostics only; this run does not qualify the commit.",
    type: "boolean",
    default: false,
  });
  expect(Object.keys(workflow.jobs).toSorted()).toEqual([...NORMAL_JOBS, "select-cpu-diagnostic", "e2e-startup-diagnostic"].toSorted());
  expect(workflow.jobs["static"]?.needs).toEqual(["changes"]);
  expect(workflow.jobs["static"]?.if).toBeUndefined();
  for (const name of ["media", "ct", "e2e-smoke"]) {
    expect(workflow.jobs[name]?.needs).toBe("changes");
    expect(workflow.jobs[name]?.if).toBe("needs.changes.outputs.code == 'true'");
  }
  expect(workflow.jobs["node"]?.needs).toEqual(["changes", "media"]);
  expect(workflow.jobs["node"]?.if).toBe("needs.changes.outputs.code == 'true'");
  expect(workflow.jobs["ci-ok"]?.needs).toEqual(["changes", "static", "media", "node", "ct", "e2e-smoke"]);
  expect(workflow.concurrency.group).toContain("inputs.select_cpu_diagnostic && 'select-cpu-diagnostic'");
  expect(workflow["run-name"]).toContain("Select CPU diagnostic only");
});

for (const [name, tier] of [
  ["changes", "push"],
  ["ci-ok", "push"],
  ["qualification", "full"],
  ["weekly-head", "weekly"],
  ["weekly-ok", "weekly"],
] as const) {
  test(`removing the actual ${name} diagnostic guard exposes forbidden qualification work`, ({ repoRoot }) => {
    const workflow = readWorkflow(repoRoot);
    const job = workflow.jobs[name];
    if (job?.if === undefined) {
      throw new Error(`missing CI guard for ${name}`);
    }
    expect(job.if).toContain(WITHHELD_GUARD);
    const mutant = { ...workflow, jobs: { ...workflow.jobs, [name]: { ...job, if: job.if.replace(WITHHELD_GUARD, "") } } };
    expect(entries(workflow, "workflow_dispatch", { tier, diagnostic: true })).toEqual(["select-cpu-diagnostic"]);
    expect(entries(mutant, "workflow_dispatch", { tier, diagnostic: true })).toContain(name);
  });
}

test("manual Select diagnostics stay outside qualification and preserve native evidence before the profiled run", ({ repoRoot }) => {
  const workflow = readWorkflow(repoRoot);
  const capture = workflow.jobs["select-cpu-diagnostic"];
  if (capture === undefined) {
    throw new Error("missing CI Select CPU diagnostic job");
  }
  expect(capture.if).toBe("github.event_name == 'workflow_dispatch' && inputs.select_cpu_diagnostic");
  expect(capture["timeout-minutes"]).toBe(
    "${{ (inputs.select_cpu_diagnostic_context == 'ct-shard-4' || inputs.select_cpu_diagnostic_context == 'ct-shard-4-native') && 120 || 15 }}",
  );
  expect(capture.steps.some((step) => step.name === workflow.env["ORB_CI_QUALIFICATION_GENERATION"])).toBe(false);
  expect(existsSync(join(repoRoot, ".github/workflows/select-cpu-diagnostic.yml"))).toBe(false);
  const steps = capture.steps;
  const native = steps.find((step) => step.id === "native-control");
  const diagnostic = steps.find((step) => step.id === "cpu-diagnostic");
  const setup = steps.find((step) => step.id === "setup");
  const checkout = steps.find((step) => step.uses?.startsWith("actions/checkout@") === true);
  expect(checkout?.with).toEqual({ "persist-credentials": false });
  expect(setup?.uses).toBe("$/.github/actions/setup");
  expect(setup?.with).toEqual({ browsers: "true" });
  const gate =
    "${{ !cancelled() && steps.setup.outcome == 'success' && steps.showcase.outcome == 'success' && inputs.select_cpu_diagnostic_context != 'ct-shard-4' && inputs.select_cpu_diagnostic_context != 'ct-shard-4-native' }}";
  expect(native?.if).toBe(gate);
  expect(diagnostic?.if).toBe(gate);
  for (const [setupOutcome, showcaseOutcome, nativeOutcome, canceled, permitted] of [
    ["success", "success", "success", false, true],
    ["success", "success", "failure", false, true],
    ["failure", "skipped", "skipped", false, false],
    ["success", "failure", "skipped", false, false],
    ["success", "success", "success", true, false],
  ] as const) {
    const context = {
      inputs: { ["select_cpu_diagnostic_context"]: "isolated" },
      cancelled: () => canceled,
      steps: { setup: { outcome: setupOutcome }, showcase: { outcome: showcaseOutcome }, ["native-control"]: { outcome: nativeOutcome } },
    };
    expect(guard(native?.if ?? "false", context)).toBe(permitted);
    expect(guard(diagnostic?.if ?? "false", context)).toBe(permitted);
  }
  expect(native?.env).toBeUndefined();
  expect(diagnostic?.env).toEqual({
    ["ORB_SELECT_CPU_DIAGNOSTIC"]: "1",
    ["ORB_SELECT_CPU_PROFILING"]: "${{ inputs.select_cpu_profiling == 'off' && '0' || '1' }}",
  });
  expect(native?.run).toBe(
    "pnpm test:ct tests/client/lib/motion-stats.ct.tsx --grep='a real sealed Select classifies its confirmed first and repeat entrance lifetimes only$' --retries=0",
  );
  expect(diagnostic?.run).toBe("pnpm test:ct tests/client/lib/motion-stats.ct.tsx --grep='Select CPU diagnostic only' --retries=0");
  const uploads = steps.filter((step) => step.uses?.startsWith("actions/upload-artifact@") === true);
  expect(uploads.map((step) => step.with?.["name"])).toEqual(["select-native-control", "select-cpu-diagnostic-only"]);
  expect(uploads.map((step) => step.if)).toEqual([
    "always() && inputs.select_cpu_diagnostic_context != 'ct-shard-4' && inputs.select_cpu_diagnostic_context != 'ct-shard-4-native'",
    "always()",
  ]);
  expect(uploads.map((step) => step.with?.["retention-days"])).toEqual([7, 7]);
  expect(uploads.map((step) => step.with?.["path"])).toEqual(["reports/", "reports/"]);
  expect(steps.indexOf(uploads[0] ?? {})).toBeGreaterThan(steps.indexOf(native ?? {}));
  expect(steps.indexOf(uploads[0] ?? {})).toBeLessThan(steps.indexOf(diagnostic ?? {}));
  expect(steps.indexOf(uploads[1] ?? {})).toBeGreaterThan(steps.indexOf(diagnostic ?? {}));
  expect(
    steps.filter((step) => step.uses !== undefined).every((step) => step.uses === "$/.github/actions/setup" || /@[a-f0-9]{40}$/u.test(step.uses ?? "")),
  ).toBe(true);
});

test("manual diagnostic context freezes the ordinary cohort and verifies native recollection before full execution", ({ repoRoot }) => {
  const workflow = readWorkflow(repoRoot);
  expect(workflow.on.workflow_dispatch.inputs["select_cpu_diagnostic_context"]).toEqual({
    description: "Choose isolated Select captures or the complete original CT shard 4 context; diagnostics never qualify the commit.",
    type: "choice",
    options: ["isolated", "ct-shard-4", "ct-shard-4-native"],
    default: "isolated",
  });
  const capture = workflow.jobs["select-cpu-diagnostic"];
  if (capture === undefined) {
    throw new Error("missing diagnostic job");
  }
  for (const context of [undefined, "isolated", "ct-shard-4", "ct-shard-4-native"] as const) {
    const inputs = { ["select_cpu_diagnostic"]: true, ["select_cpu_diagnostic_context"]: context };
    const deadline =
      typeof capture["timeout-minutes"] === "number"
        ? capture["timeout-minutes"]
        : runInNewContext(capture["timeout-minutes"].replace(/^\$\{\{\s*|\s*\}\}$/gu, ""), { inputs });
    expect(deadline).toBe(context === "ct-shard-4" || context === "ct-shard-4-native" ? workflow.jobs["ct"]?.["timeout-minutes"] : 15);
    const env = { inputs, cancelled: () => false, steps: { setup: { outcome: "success" }, showcase: { outcome: "success" } } };
    expect(guard(capture.steps.find((step) => step.id === "native-control")?.if ?? "false", env)).toBe(
      context !== "ct-shard-4" && context !== "ct-shard-4-native",
    );
    expect(guard(capture.steps.find((step) => step.id === "cpu-diagnostic")?.if ?? "false", env)).toBe(
      context !== "ct-shard-4" && context !== "ct-shard-4-native",
    );
    expect(guard(capture.steps.find((step) => step.id === "full-cpu-diagnostic")?.if ?? "false", env)).toBe(context === "ct-shard-4");
    expect(guard(capture.steps.find((step) => step.id === "native-context-diagnostic")?.if ?? "false", env)).toBe(context === "ct-shard-4-native");
  }
  const full = capture.steps.find((step) => step.id === "full-cpu-diagnostic");
  expect(full?.env).toEqual({ ["ORB_SELECT_CPU_DIAGNOSTIC"]: "1", ["ORB_SELECT_CPU_PROFILING"]: "${{ inputs.select_cpu_profiling == 'off' && '0' || '1' }}" });
  const run = full?.run ?? "";
  expect(run).toContain("ORB_SELECT_CPU_DIAGNOSTIC=0 pnpm test:ct --list --shard=4/4 --retries=0");
  expect(run).toContain("pnpm test:ct --list --shard=4/4 --retries=0");
  expect(run).toContain("scripts/select-cpu-diagnostic-context.ts create");
  expect(run).toContain("pnpm test:ct --list --test-list=");
  expect(run).toContain("scripts/select-cpu-diagnostic-context.ts verify");
  expect(run).toContain("pnpm test:ct --test-list=");
  expect(run).not.toContain("--grep");
  expect(run.indexOf("context.ts verify")).toBeLessThan(run.lastIndexOf("pnpm test:ct --test-list="));
});

test("native trace context executes only the closed original cohort without the preceding diagnostic pair", ({ repoRoot }) => {
  const capture = readWorkflow(repoRoot).jobs["select-cpu-diagnostic"];
  const step = capture?.steps.find((row) => row.id === "native-context-diagnostic");
  expect(step?.env).toEqual({ ["ORB_SELECT_CPU_DIAGNOSTIC"]: "0", ["ORB_SELECT_CPU_PROFILING"]: "0", ["ORB_SELECT_NATIVE_TRACE"]: "1" });
  const run = step?.run ?? "";
  expect(run).toContain("ORB_SELECT_NATIVE_TRACE=0 pnpm test:ct --list --shard=4/4 --retries=0");
  expect(run).toContain("scripts/select-cpu-diagnostic-context.ts create-native");
  expect(run).toContain("pnpm test:ct --list --test-list=");
  expect(run).toContain("scripts/select-cpu-diagnostic-context.ts verify-native");
  expect(run).toContain("pnpm test:ct --test-list=");
  expect(run).not.toContain("--grep");
  expect(run).not.toContain("opt-in");
  expect(run.indexOf("context.ts verify-native")).toBeLessThan(run.lastIndexOf("pnpm test:ct --test-list="));
});

test("CPU profiling defaults on but a trace-only diagnostic disables it in both native execution contexts", ({ repoRoot }) => {
  const workflow = readWorkflow(repoRoot);
  expect(workflow.on.workflow_dispatch.inputs["select_cpu_profiling"]).toEqual({
    description: "Keep CPU profiling on, or capture trace-only evidence to measure profiler amplification; neither mode qualifies the commit.",
    type: "choice",
    options: ["on", "off"],
    default: "on",
  });
  const capture = workflow.jobs["select-cpu-diagnostic"];
  if (capture === undefined) {
    throw new Error("missing diagnostic job");
  }
  for (const id of ["cpu-diagnostic", "full-cpu-diagnostic"]) {
    const step = capture.steps.find((row) => row.id === id);
    expect(step?.env?.["ORB_SELECT_CPU_DIAGNOSTIC"]).toBe("1");
    const expression = step?.env?.["ORB_SELECT_CPU_PROFILING"];
    expect(expression).toBe("${{ inputs.select_cpu_profiling == 'off' && '0' || '1' }}");
    for (const selected of [undefined, "on", "off"]) {
      const value = runInNewContext((expression ?? "").replace(/^\$\{\{\s*|\s*\}\}$/gu, ""), {
        inputs: { ["select_cpu_profiling"]: selected },
      });
      expect(value).toBe(selected === "off" ? "0" : "1");
    }
  }
  expect(capture.steps.find((step) => step.id === "native-control")?.env).toBeUndefined();
});

for (const name of ["changes", "ci-ok"] as const) {
  test(`removing the actual ${name} E2E guard exposes forbidden qualification work`, ({ repoRoot }) => {
    const workflow = readWorkflow(repoRoot);
    const job = workflow.jobs[name];
    if (job?.if === undefined) {
      throw new Error(`missing CI guard for ${name}`);
    }
    const withheld = " && inputs.tier != 'e2e-diagnostic'";
    expect(job.if).toContain(withheld);
    const mutant = { ...workflow, jobs: { ...workflow.jobs, [name]: { ...job, if: job.if.replace(withheld, "") } } };
    const mode = { tier: "e2e-diagnostic", diagnostic: false };
    expect(entries(workflow, "workflow_dispatch", mode)).toEqual(["e2e-startup-diagnostic"]);
    expect(entries(mutant, "workflow_dispatch", mode)).toContain(name);
  });
}

test("E2E startup dispatch is bounded, immutable and retains failed global setup evidence without qualification", ({ repoRoot }) => {
  const workflow = readWorkflow(repoRoot);
  expect(workflow.on.workflow_dispatch.inputs["tier"]).toEqual({
    description: "Choose product qualification, independent weekly proof, or non-qualifying E2E startup diagnostics.",
    type: "choice",
    options: ["push", "product", "full", "weekly", "e2e-diagnostic"],
    default: "push",
  });
  const job = workflow.jobs["e2e-startup-diagnostic"];
  if (job === undefined) {
    throw new Error("missing E2E startup diagnostic job");
  }
  expect(job.if).toBe("github.event_name == 'workflow_dispatch' && !inputs.select_cpu_diagnostic && inputs.tier == 'e2e-diagnostic'");
  expect(job.needs).toBeUndefined();
  expect(job["runs-on"]).toBe("ubuntu-latest");
  expect(job["timeout-minutes"]).toBe(30);
  expect(job.env).toEqual({ ["E2E_LIVE"]: "0", ["E2E_ALLOW_DEV_TARGET"]: "0" });
  const [checkout, setup, media, showcase, startup, upload] = job.steps;
  expect(job.steps).toHaveLength(6);
  expect(checkout?.uses).toBe(workflow.jobs["qualification"]?.steps[0]?.uses);
  expect(checkout?.with).toEqual({ ref: "${{ github.sha }}", "persist-credentials": false });
  expect(setup?.uses).toBe("$/.github/actions/setup");
  expect(setup?.with).toEqual({ browsers: "true" });
  expect(media?.run).toBe(workflow.jobs["qualification"]?.steps.find((step) => step.id === "media")?.run);
  expect(media?.["timeout-minutes"]).toBe(15);
  expect(media?.if).toBeUndefined();
  expect(showcase?.id).toBe("showcase");
  expect(showcase?.run).toBe(workflow.jobs["qualification"]?.steps.find((step) => step.id === "showcase")?.run);
  expect(showcase?.if).toBeUndefined();
  expect(startup?.run).toBe("pnpm e2e app-readiness.spec.ts --retries=0");
  expect(startup?.if).toBeUndefined();
  expect(upload?.if).toBe("always()");
  for (const failure of [false, true]) {
    expect(guard(upload?.if ?? "false", { always: () => true, failure: () => failure })).toBe(true);
    expect(guard((upload?.if ?? "").replace("always()", "failure()"), { failure: () => failure })).toBe(failure);
  }
  expect(upload?.uses).toBe("actions/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a");
  expect(upload?.with).toEqual({ name: "reports-e2e-startup-diagnostic", path: "reports/\ntest-results/\n", "retention-days": 7 });
  const title = workflow["run-name"].replace(/^\$\{\{\s*|\s*\}\}$/gu, "");
  for (const select of [false, true]) {
    const value = runInNewContext(title, {
      github: { ["event_name"]: "workflow_dispatch", ["ref_name"]: "candidate", event: {} },
      inputs: { tier: "e2e-diagnostic", ["select_cpu_diagnostic"]: select },
      format: (template: string, ...values: readonly string[]) => template.replace(/\{(\d+)\}/gu, (_, index: string) => values[Number(index)] ?? ""),
    });
    expect(value).toBe(select ? "Select CPU diagnostic only on candidate" : "E2E startup diagnostic only (not qualification) on candidate");
  }
  expect(job.steps.some((step) => step.name?.includes("ORB_CI_QUALIFICATION_GENERATION") === true)).toBe(false);
  expect(job.steps.some((step) => step.uses?.startsWith("actions/cache/") === true)).toBe(false);
  expect(job.steps.map((step) => step.run ?? "").join("\n")).not.toMatch(/verified|weekly-proof|pnpm verify|test:ct|ORB_SELECT/u);
});

test("native startup command preserves all-mode argv, model-free isolation and failure exits", async ({ repoRoot, scratch, fakeBin }) => {
  const job = readWorkflow(repoRoot).jobs["e2e-startup-diagnostic"];
  const command = job?.steps.find((step) => step.id === "startup")?.run;
  expect(command).toBe("pnpm e2e app-readiness.spec.ts --retries=0");
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('startup.json',JSON.stringify({argv:process.argv.slice(2),live:process.env.E2E_LIVE,dev:process.env.E2E_ALLOW_DEV_TARGET}));process.exitCode=Number(process.env.FIXTURE_EXIT);",
  );
  for (const code of [0, 1, 2, 3]) {
    const result = spawnSync("bash", ["-e", "-c", command ?? ""], {
      cwd: scratch,
      env: inheritedProcessEnv({ ...job?.env, ["FIXTURE_EXIT"]: String(code) }),
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(code);
    expect(JSON.parse(readFileSync(join(scratch, "startup.json"), "utf8"))).toEqual({
      argv: ["e2e", "app-readiness.spec.ts", "--retries=0"],
      live: "0",
      dev: "0",
    });
  }
});

for (const [withheld, mode, event] of [
  ["!inputs.select_cpu_diagnostic && ", { tier: "e2e-diagnostic", diagnostic: true }, "workflow_dispatch"],
  ["github.event_name == 'workflow_dispatch' && ", { tier: "e2e-diagnostic", diagnostic: false }, "push"],
  [" && inputs.tier == 'e2e-diagnostic'", { tier: "full", diagnostic: false }, "workflow_dispatch"],
] as const) {
  test(`removing startup admission ${withheld} exposes an unintended diagnostic run`, ({ repoRoot }) => {
    const workflow = readWorkflow(repoRoot);
    const job = workflow.jobs["e2e-startup-diagnostic"];
    if (job?.if === undefined) {
      throw new Error("missing startup admission guard");
    }
    expect(job.if).toContain(withheld);
    const mutant = { ...workflow, jobs: { ...workflow.jobs, ["e2e-startup-diagnostic"]: { ...job, if: job.if.replace(withheld, "") } } };
    expect(entries(workflow, event, mode)).not.toContain("e2e-startup-diagnostic");
    expect(entries(mutant, event, mode)).toContain("e2e-startup-diagnostic");
  });
}

test("startup argv and no-fee controls reject full-suite, single-mode and live/dev-target substitutions", async ({ repoRoot, scratch, fakeBin }) => {
  const job = readWorkflow(repoRoot).jobs["e2e-startup-diagnostic"];
  const command = job?.steps.find((step) => step.id === "startup")?.run;
  if (command === undefined || job?.env === undefined) {
    throw new Error("missing startup command or isolation environment");
  }
  const expected = { argv: ["e2e", "app-readiness.spec.ts", "--retries=0"], live: "0", dev: "0" };
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('startup.json',JSON.stringify({argv:process.argv.slice(2),live:process.env.E2E_LIVE,dev:process.env.E2E_ALLOW_DEV_TARGET}));",
  );
  for (const [run, env] of [
    [command, job.env],
    [command.replace("app-readiness.spec.ts ", ""), job.env],
    [`${command} --project=single-user`, job.env],
    [command.replace("--retries=0", "--retries=2"), job.env],
    [command, { ...job.env, ["E2E_LIVE"]: "1" }],
    [command, { ...job.env, ["E2E_ALLOW_DEV_TARGET"]: "1" }],
  ] as const) {
    const result = spawnSync("bash", ["-e", "-c", run], { cwd: scratch, env: inheritedProcessEnv(env), encoding: "utf8" });
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
    [startup, "0", 47, [["e2e", "app-readiness.spec.ts", "--retries=0"]]],
    [`${showcase}\n${startup}`, "1", 71, [["--filter", "@orb/showcase-plugins", "build"]]],
    [
      `${showcase}\n${startup}`,
      "0",
      0,
      [
        ["--filter", "@orb/showcase-plugins", "build"],
        ["e2e", "app-readiness.spec.ts", "--retries=0"],
      ],
    ],
  ] as const) {
    const result = spawnSync("bash", ["-e", "-c", run], { cwd: scratch, env: inheritedProcessEnv({ ["FIXTURE_BUILD_FAIL"]: fail }), encoding: "utf8" });
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
