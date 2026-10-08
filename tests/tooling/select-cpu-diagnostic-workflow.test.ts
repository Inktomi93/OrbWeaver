import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
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
      "timeout-minutes": z.number(),
      steps: z.array(stepSchema),
    }),
  ),
});
type Workflow = z.infer<typeof workflowSchema>;
const ENTRY_JOBS = ["changes", "ci-ok", "qualification", "select-cpu-diagnostic"] as const;
const NORMAL_JOBS = ["changes", "semantic-corpus", "static", "media", "node", "ct", "e2e-smoke", "ci-ok", "qualification"] as const;
const WITHHELD_GUARD = "!inputs.select_cpu_diagnostic && ";

function readWorkflow(repoRoot: string): Workflow {
  return workflowSchema.parse(parse(readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8")));
}

// These guards use only Boolean/string comparisons shared by Actions and JS; execute the actual source,
// not a second spelling of their policy. Status functions are explicit fixture inputs.
function guard(expression: string, context: object): boolean {
  return Boolean(runInNewContext(expression.replace(/^\$\{\{\s*|\s*\}\}$/gu, ""), context));
}

function entries(workflow: Workflow, event: string, tier: string | undefined, diagnostic: boolean | undefined): readonly string[] {
  return ENTRY_JOBS.filter((name) => {
    const job = workflow.jobs[name];
    return (
      job !== undefined &&
      guard(job.if ?? "true", {
        github: { ["event_name"]: event },
        inputs: { tier, ["select_cpu_diagnostic"]: diagnostic },
        always: () => true,
      })
    );
  });
}

const MODES = [
  { event: "push", tier: undefined, diagnostic: undefined, enabled: ["changes", "ci-ok"] },
  { event: "pull_request", tier: undefined, diagnostic: undefined, enabled: ["changes", "ci-ok"] },
  { event: "schedule", tier: undefined, diagnostic: undefined, enabled: ["qualification"] },
  { event: "workflow_dispatch", tier: "push", diagnostic: undefined, enabled: ["changes", "ci-ok"] },
  { event: "workflow_dispatch", tier: "push", diagnostic: false, enabled: ["changes", "ci-ok"] },
  { event: "workflow_dispatch", tier: "product", diagnostic: false, enabled: ["qualification"] },
  { event: "workflow_dispatch", tier: "full", diagnostic: false, enabled: ["qualification"] },
  ...["push", "product", "full"].map((tier) => ({ event: "workflow_dispatch", tier, diagnostic: true, enabled: ["select-cpu-diagnostic"] })),
] as const;

test("existing CI dispatch isolates diagnostic authority across every normal trigger and manual tier", ({ repoRoot }) => {
  const workflow = readWorkflow(repoRoot);
  for (const mode of MODES) {
    expect(entries(workflow, mode.event, mode.tier, mode.diagnostic), JSON.stringify(mode)).toEqual(mode.enabled);
  }
  expect(workflow.on.workflow_dispatch.inputs["select_cpu_diagnostic"]).toEqual({
    description: "Capture Select CPU diagnostics only; this run does not qualify the commit.",
    type: "boolean",
    default: false,
  });
  expect(Object.keys(workflow.jobs).toSorted()).toEqual([...NORMAL_JOBS, "select-cpu-diagnostic"].toSorted());
  expect(workflow.jobs["static"]?.needs).toEqual(["changes", "semantic-corpus"]);
  expect(workflow.jobs["static"]?.if).toBeUndefined();
  expect(workflow.jobs["semantic-corpus"]?.needs).toBe("changes");
  expect(workflow.jobs["semantic-corpus"]?.if).toBeUndefined();
  for (const name of ["media", "ct", "e2e-smoke"]) {
    expect(workflow.jobs[name]?.needs).toBe("changes");
    expect(workflow.jobs[name]?.if).toBe("needs.changes.outputs.code == 'true'");
  }
  expect(workflow.jobs["node"]?.needs).toEqual(["changes", "media"]);
  expect(workflow.jobs["node"]?.if).toBe("needs.changes.outputs.code == 'true'");
  expect(workflow.jobs["ci-ok"]?.needs).toEqual(["changes", "semantic-corpus", "static", "media", "node", "ct", "e2e-smoke"]);
  expect(workflow.concurrency.group).toContain("inputs.select_cpu_diagnostic && 'select-cpu-diagnostic'");
  expect(workflow["run-name"]).toContain("Select CPU diagnostic only");
});

for (const name of ["changes", "ci-ok", "qualification"] as const) {
  test(`removing the actual ${name} diagnostic guard exposes forbidden qualification work`, ({ repoRoot }) => {
    const workflow = readWorkflow(repoRoot);
    const job = workflow.jobs[name];
    if (job?.if === undefined) {
      throw new Error(`missing CI guard for ${name}`);
    }
    expect(job.if).toContain(WITHHELD_GUARD);
    const mutant = { ...workflow, jobs: { ...workflow.jobs, [name]: { ...job, if: job.if.replace(WITHHELD_GUARD, "") } } };
    const tier = name === "qualification" ? "full" : "push";
    expect(entries(workflow, "workflow_dispatch", tier, true)).toEqual(["select-cpu-diagnostic"]);
    expect(entries(mutant, "workflow_dispatch", tier, true)).toContain(name);
  });
}

test("manual Select diagnostics stay outside qualification and preserve native evidence before the profiled run", ({ repoRoot }) => {
  const workflow = readWorkflow(repoRoot);
  const capture = workflow.jobs["select-cpu-diagnostic"];
  if (capture === undefined) {
    throw new Error("missing CI Select CPU diagnostic job");
  }
  expect(capture.if).toBe("github.event_name == 'workflow_dispatch' && inputs.select_cpu_diagnostic");
  expect(capture["timeout-minutes"]).toBe(15);
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
  const gate = "${{ !cancelled() && steps.setup.outcome == 'success' && steps.showcase.outcome == 'success' }}";
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
      cancelled: () => canceled,
      steps: { setup: { outcome: setupOutcome }, showcase: { outcome: showcaseOutcome }, ["native-control"]: { outcome: nativeOutcome } },
    };
    expect(guard(native?.if ?? "false", context)).toBe(permitted);
    expect(guard(diagnostic?.if ?? "false", context)).toBe(permitted);
  }
  expect(native?.env).toBeUndefined();
  expect(diagnostic?.env).toEqual({ ["ORB_SELECT_CPU_DIAGNOSTIC"]: "1" });
  expect(native?.run).toBe(
    "pnpm test:ct tests/client/lib/motion-stats.ct.tsx --grep='a real sealed Select classifies its confirmed first and repeat entrance lifetimes only$' --retries=0",
  );
  expect(diagnostic?.run).toBe("pnpm test:ct tests/client/lib/motion-stats.ct.tsx --grep='Select CPU diagnostic only' --retries=0");
  const uploads = steps.filter((step) => step.uses?.startsWith("actions/upload-artifact@") === true);
  expect(uploads.map((step) => step.with?.["name"])).toEqual(["select-native-control", "select-cpu-diagnostic-only"]);
  expect(uploads.map((step) => step.if)).toEqual(["always()", "always()"]);
  expect(uploads.map((step) => step.with?.["retention-days"])).toEqual([7, 7]);
  expect(uploads.map((step) => step.with?.["path"])).toEqual(["reports/", "reports/"]);
  expect(steps.indexOf(uploads[0] ?? {})).toBeGreaterThan(steps.indexOf(native ?? {}));
  expect(steps.indexOf(uploads[0] ?? {})).toBeLessThan(steps.indexOf(diagnostic ?? {}));
  expect(steps.indexOf(uploads[1] ?? {})).toBeGreaterThan(steps.indexOf(diagnostic ?? {}));
  expect(
    steps.filter((step) => step.uses !== undefined).every((step) => step.uses === "$/.github/actions/setup" || /@[a-f0-9]{40}$/u.test(step.uses ?? "")),
  ).toBe(true);
});
