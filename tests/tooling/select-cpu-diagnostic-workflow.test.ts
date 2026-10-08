import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

const workflowSchema = z.object({
  on: z.object({ ["workflow_dispatch"]: z.null() }).strict(),
  permissions: z.object({ contents: z.literal("read") }).strict(),
  env: z.object({ ["CI"]: z.literal("true") }).strict(),
  jobs: z
    .object({
      capture: z
        .object({
          "runs-on": z.literal("ubuntu-latest"),
          "timeout-minutes": z.literal(15),
          steps: z.array(
            z.object({
              id: z.string().optional(),
              run: z.string().optional(),
              if: z.string().optional(),
              uses: z.string().optional(),
              env: z.record(z.string(), z.string()).optional(),
              with: z.record(z.string(), z.json()).optional(),
            }),
          ),
        })
        .strict(),
    })
    .strict(),
});

test("manual Select diagnostics stay outside qualification and preserve native evidence before the profiled run", ({ repoRoot }) => {
  const workflow = workflowSchema.parse(parse(readFileSync(join(repoRoot, ".github/workflows/select-cpu-diagnostic.yml"), "utf8")));
  const steps = workflow.jobs.capture.steps;
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
