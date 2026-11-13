import { spawnSync } from "node:child_process";
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { runInNewContext } from "node:vm";
import { nonEmpty } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/tooling";
import { parse } from "yaml";
import { z } from "zod";

// Raw text, not parsed yaml: the parser drops the version comment this policy requires.
function unreviewablePins(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => /^\s*(?:-\s+)?uses:\s*\S+@/u.test(line))
    .filter((line) => !/^\s*(?:-\s+)?uses:\s*[^@\s]+@[0-9a-f]{40}\s+#\s*v\d+(?:\.\d+)*\s*$/u.test(line))
    .map((line) => line.trim());
}

test("every external action pin is a full commit SHA with a version comment", ({ repoRoot }) => {
  const sha = "3d3c42e5aac5ba805825da76410c181273ba90b1";
  expect(unreviewablePins(`      - uses: actions/checkout@${sha}`)).toHaveLength(1);
  expect(unreviewablePins("      - uses: actions/checkout@v7")).toHaveLength(1);
  expect(unreviewablePins("      - uses: actions/checkout@v7 # v7.0.1")).toHaveLength(1);
  expect(unreviewablePins(`      - uses: actions/checkout@${sha} # v7.0.1`)).toEqual([]);
  expect(unreviewablePins("      - uses: ./.github/actions/setup")).toEqual([]);
  const files = [...readdirSync(join(repoRoot, ".github/workflows")).map((name) => join(".github/workflows", name)), ".github/actions/setup/action.yml"];
  for (const file of files) {
    expect(unreviewablePins(readFileSync(join(repoRoot, file), "utf8")), file).toEqual([]);
  }
});

test("Scorecard runs only on the repository default branch, including manual dispatch", ({ repoRoot }) => {
  const { jobs } = z
    .object({ jobs: z.object({ analysis: z.object({ if: z.string(), ["runs-on"]: z.string() }) }) })
    .parse(parse(readFileSync(join(repoRoot, ".github/workflows/scorecard.yml"), "utf8")));
  expect(jobs.analysis["runs-on"]).toBe("ubuntu-24.04");
  for (const defaultBranch of ["release", "main"]) {
    for (const ref of ["refs/heads/release", "refs/heads/main", "refs/tags/v0.2.0", "refs/pull/31/merge"]) {
      expect(
        runInNewContext(jobs.analysis.if, {
          github: { ref, event: { repository: { ["default_branch"]: defaultBranch } } },
          format: (template: string, value: string) => template.replace("{0}", value),
        }),
      ).toBe(ref === `refs/heads/${defaultBranch}`);
    }
  }
});

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
    expect(event["paths-ignore"]).toEqual(["docs/**", "**/*.md"]);
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
    .object({ on: z.strictObject({ ["workflow_dispatch"]: z.null() }) })
    .parse(parse(readFileSync(join(repoRoot, ".github/workflows/development-image.yml"), "utf8")));
  expect(workflow.on.workflow_dispatch).toBeNull();
});

const dependabotSchema = z.object({
  updates: z.array(
    z.object({
      ["package-ecosystem"]: z.string(),
      directory: z.string().optional(),
      ["target-branch"]: z.string().optional(),
      ["open-pull-requests-limit"]: z.number().optional(),
      groups: z.record(z.string(), z.json()).optional(),
      ignore: z.array(z.json()).optional(),
    }),
  ),
});

function dependabotConfig(repoRoot: string): z.infer<typeof dependabotSchema> {
  return dependabotSchema.parse(parse(readFileSync(join(repoRoot, ".github/dependabot.yml"), "utf8"), { maxAliasCount: 0 }));
}

test("security dependency updates configure the default branch without changing main version updates", ({ repoRoot }) => {
  const config = dependabotConfig(repoRoot);
  const npm = config.updates.filter((entry) => entry["package-ecosystem"] === "npm" && entry.directory === "/");
  const main = npm.find((entry) => entry["target-branch"] === "main");
  const security = npm.find((entry) => entry["target-branch"] === undefined);
  expect(npm).toHaveLength(2);
  expect(security?.["open-pull-requests-limit"]).toBe(0);
  expect(security?.groups).toEqual({ "npm-security": { "applies-to": "security-updates", patterns: ["*"] } });
  expect(security?.ignore).toEqual(main?.ignore);
  expect(main?.groups?.["npm-security"]).toBeUndefined();
});

test("every tracked npm lockfile outside the pnpm workspace has its own version-update entry, which leaves pnpm to packageManager", ({ repoRoot }) => {
  const listed = spawnSync("git", ["ls-files", "-z", "*package-lock.json"], { cwd: repoRoot, encoding: "utf8" });
  expect(listed.status, listed.stderr).toBe(0);
  const directories = listed.stdout
    .split("\0")
    .filter((path) => path !== "")
    .map((path) => `/${dirname(path)}`);
  expect(directories).toContain("/.devcontainer/tools");
  const npm = dependabotConfig(repoRoot).updates.filter((entry) => entry["package-ecosystem"] === "npm");
  for (const directory of directories) {
    const entry = npm.find((candidate) => candidate.directory === directory);
    expect(entry?.["target-branch"], directory).toBe("main");
    expect(entry?.ignore, directory).toContainEqual({ ["dependency-name"]: "pnpm" });
  }
});

test("privileged run approval never checks out candidate code or restores candidate caches", ({ repoRoot }) => {
  const workflow = z
    .object({
      permissions: z.strictObject({}),
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
  expect(nonEmpty(job.steps).some((step) => step.uses?.includes("cache") === true)).toBe(false);
  expect(job.steps.map((step) => step.run ?? "").join("\n")).not.toMatch(/pull_request.head|checkout.*head|release edit|merge/u);
});

test("CodeQL scheduled runs cannot be cancelled by incoming push or dispatch runs on the same ref", ({ repoRoot }) => {
  const { concurrency } = z
    .object({ concurrency: z.object({ group: z.string(), ["cancel-in-progress"]: z.string() }) })
    .parse(parse(readFileSync(join(repoRoot, ".github/workflows/codeql.yml"), "utf8")));
  const group = (event: string, refName: string, number = 0, sha = "a".repeat(40)): string =>
    concurrency.group.replace(/\$\{\{\s*(.*?)\s*\}\}/gu, (_match, expression: string) =>
      String(runInNewContext(expression, { github: { ["event_name"]: event, ref: refName, sha, event: { ["pull_request"]: { number } } } })),
    );
  const ref = "refs/heads/release";
  const scheduled = group("schedule", ref);
  expect(scheduled).not.toBe(group("push", ref));
  expect(scheduled).not.toBe(group("workflow_dispatch", ref));
  expect(group("push", ref)).toBe(group("push", ref, 0, "b".repeat(40)));
  expect(group("push", ref)).toBe(group("workflow_dispatch", ref));
  expect(group("pull_request", "refs/pull/31/merge", 31)).toBe(group("pull_request", "refs/pull/31/merge", 31, "b".repeat(40)));
  expect(group("pull_request", "refs/pull/31/merge", 31)).not.toBe(group("pull_request", "refs/pull/32/merge", 32));
  for (const event of ["schedule", "push", "workflow_dispatch", "pull_request"]) {
    expect(runInNewContext(concurrency["cancel-in-progress"].replace(/^\$\{\{\s*|(?<!\s)\s*\}\}$/gu, ""), { github: { ["event_name"]: event } })).toBe(
      event !== "schedule",
    );
  }
});
