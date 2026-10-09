import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { parse } from "yaml";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

test("CodeQL skips only Dependabot PRs and keeps weekly and dispatch security coverage", ({ repoRoot }) => {
  const workflow = z
    .object({
      on: z.object({
        push: z.object({ "paths-ignore": z.array(z.string()) }),
        ["pull_request"]: z.object({ "paths-ignore": z.array(z.string()) }),
        schedule: z.array(z.object({ cron: z.string() })),
        ["workflow_dispatch"]: z.null(),
      }),
      jobs: z.object({ analyze: z.object({ if: z.string() }) }),
    })
    .parse(parse(readFileSync(join(repoRoot, ".github/workflows/codeql.yml"), "utf8")));
  for (const event of ["push", "pull_request", "schedule", "workflow_dispatch"]) {
    for (const actor of ["dependabot[bot]", "Inktomi93", "external-contributor"]) {
      expect(runInNewContext(workflow.jobs.analyze.if, { github: { ["event_name"]: event, actor } })).toBe(
        event !== "pull_request" || actor !== "dependabot[bot]",
      );
    }
  }
  for (const event of [workflow.on.push, workflow.on.pull_request]) {
    expect(event["paths-ignore"]).toEqual(["docs/**", "**/*.md", ".github/**"]);
  }
  expect(workflow.on.schedule).toHaveLength(1);
});

test("optional baseline without native SARIF is retired rather than represented as Security-tab evidence", ({ repoRoot }) => {
  const workflow = z
    .object({ jobs: z.record(z.string(), z.json()) })
    .parse(parse(readFileSync(join(repoRoot, ".github/workflows/security-scans.yml"), "utf8")));
  expect(workflow.jobs["app"]).toBeUndefined();
  expect(Object.keys(workflow.jobs).toSorted()).toEqual(["image", "workflows"]);
});

test("development publication has no dead branch trigger", ({ repoRoot }) => {
  const workflow = z
    .object({ on: z.object({ ["workflow_dispatch"]: z.null() }).strict() })
    .parse(parse(readFileSync(join(repoRoot, ".github/workflows/development-image.yml"), "utf8")));
  expect(workflow.on.workflow_dispatch).toBeNull();
});

test("security dependency updates configure the default branch without changing main version updates", ({ repoRoot }) => {
  const config = z
    .object({
      updates: z.array(
        z.object({
          ["package-ecosystem"]: z.string(),
          ["target-branch"]: z.string().optional(),
          ["open-pull-requests-limit"]: z.number().optional(),
          groups: z.record(z.string(), z.json()).optional(),
          ignore: z.array(z.json()).optional(),
        }),
      ),
    })
    .parse(parse(readFileSync(join(repoRoot, ".github/dependabot.yml"), "utf8")));
  const npm = config.updates.filter((entry) => entry["package-ecosystem"] === "npm");
  const main = npm.find((entry) => entry["target-branch"] === "main");
  const security = npm.find((entry) => entry["target-branch"] === undefined);
  expect(npm).toHaveLength(2);
  expect(security?.["open-pull-requests-limit"]).toBe(0);
  expect(security?.groups).toEqual({ "npm-security": { "applies-to": "security-updates", patterns: ["*"] } });
  expect(security?.ignore).toEqual(main?.ignore);
  expect(main?.groups?.["npm-security"]).toBeUndefined();
});

test("privileged run approval never checks out candidate code or restores candidate caches", ({ repoRoot }) => {
  const workflow = z
    .object({
      permissions: z.object({}).strict(),
      jobs: z.object({
        approve: z.object({
          permissions: z.record(z.string(), z.string()),
          steps: z.array(z.object({ uses: z.string().optional(), with: z.record(z.string(), z.json()).optional(), run: z.string().optional() })),
        }),
      }),
    })
    .parse(parse(readFileSync(join(repoRoot, ".github/workflows/release-run-approval.yml"), "utf8")));
  const job = workflow.jobs.approve;
  expect(job.permissions).toEqual({ contents: "read", "pull-requests": "read", actions: "write" });
  expect(job.steps[0]?.with).toEqual({ ref: "main", "persist-credentials": false });
  expect(job.steps.some((step) => step.uses?.includes("cache") === true)).toBe(false);
  expect(job.steps.map((step) => step.run ?? "").join("\n")).not.toMatch(/pull_request.head|checkout.*head|release edit|merge/u);
});
