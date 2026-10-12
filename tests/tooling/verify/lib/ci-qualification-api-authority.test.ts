import { spawnSync } from "node:child_process";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { BOX_LOAD_ENV } from "@orb/tooling/floor/host/load-budget";
import { inheritedProcessEnv } from "@orb/tooling/floor/process/process-env";
import { hasQualifiedMainPush } from "@orb/tooling/verify";
import { scaledBudget } from "../../_load-budget.ts";
import type { JOB_SAMPLE } from "./_ci-qualification-support.ts";
import {
  API_FIXTURE,
  API_ROOT,
  GENERATION,
  GROUPED_CONFIG,
  goodJob,
  goodProductJobs,
  goodRun,
  metadata,
  REPOSITORY,
  REQUIRED_JOB_NAMES,
  RUNTIME_JOB_GROUPS,
  RUNTIME_JOB_NAMES,
  SHA,
} from "./_ci-qualification-support.ts";

test("failed independent tooling recertification cannot veto completed current product qualification", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  const run = { ...goodRun(), conclusion: "failure" };
  const jobs = [goodJob(), ...goodProductJobs(), { ...goodJob(SHA, 20), name: "weekly-tooling", conclusion: "failure", steps: [] }];
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({
      ...metadata(),
      [`${API_ROOT}/workflows/7/runs?head_sha=${SHA}&event=push&branch=main&per_page=100&page=1`]: { ["total_count"]: 1, ["workflow_runs"]: [run] },
      [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs },
      [`${API_ROOT}/runs/1`]: run,
    }),
  );
  expect(
    hasQualifiedMainPush(scratch, SHA, {
      repository: REPOSITORY,
      generation: GENERATION,
      publication: SHA,
      requiredJobs: REQUIRED_JOB_NAMES,
      runtimeJobs: RUNTIME_JOB_NAMES,
      hasCurrentGeneration: () => true,
    }),
  ).toBe(true);
});

test("tight fractional metadata deadlines reach the native process, and sub-millisecond deadlines refuse without spawning", {
  timeout: scaledBudget(20_000),
}, async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(metadata()));
  const config = {
    repository: REPOSITORY,
    generation: GENERATION,
    publication: SHA,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: () => true,
  };
  const windowMs = scaledBudget(5000);
  // @orb-waive test-determinism(performance.now): the subject is native conversion of a fractional remaining monotonic deadline, below the request cap; no clock injection exists, and completion headroom follows shared load scaling.
  expect(hasQualifiedMainPush(scratch, SHA, config, performance.now() + windowMs + 0.75)).toBe(true);
  const requests = readFileSync(join(scratch, "ci-requests.jsonl"), "utf8");
  expect(requests).toContain("/workflows/ci.yml");
  // @orb-waive test-determinism(performance.now): the subject is refusing a real remaining deadline below one millisecond without spawning; elapsed time can only strengthen refusal, and no clock injection exists.
  expect(() => hasQualifiedMainPush(scratch, SHA, config, performance.now() + 0.5)).toThrow("exceeded its supported bound");
  expect(readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")).toBe(requests);
  // @orb-waive test-determinism(performance.now): the subject is refusing an already exhausted real monotonic deadline without spawning; elapsed time can only strengthen refusal, and no clock injection exists.
  expect(() => hasQualifiedMainPush(scratch, SHA, config, performance.now() - 1)).toThrow("exceeded its supported bound");
  expect(readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")).toBe(requests);
});

test("native metadata timeout keeps its quiet ceiling and receives shared load headroom", { timeout: scaledBudget(60_000) }, async ({
  scratch,
  repoRoot,
  fakeBin,
}) => {
  const delayed = API_FIXTURE.replace(
    "process.stdout.write(JSON.stringify(responses[endpoint]));",
    "if(endpoint.endsWith('/workflows/ci.yml')&&!fs.existsSync('ci-delayed')){fs.writeFileSync('ci-delayed','yes');await new Promise(resolve=>setTimeout(resolve,11200));}process.stdout.write(JSON.stringify(responses[endpoint]));",
  );
  await fakeBin("gh", delayed);
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(metadata()));
  const probe = join(scratch, "qualification-probe.mjs");
  writeFileSync(
    probe,
    [
      `import { hasQualifiedMainPush } from ${JSON.stringify(join(repoRoot, "tooling/src/verify/lib/ci-qualification.ts"))};`,
      `try { if(!hasQualifiedMainPush(process.cwd(), ${JSON.stringify(SHA)}, ${JSON.stringify({ repository: REPOSITORY, generation: GENERATION, publication: SHA, requiredJobs: REQUIRED_JOB_NAMES, runtimeJobs: RUNTIME_JOB_NAMES })})) throw new Error('qualification refused'); process.stdout.write('qualified'); } catch(error) { process.stderr.write(error.message); process.exitCode=2; }`,
    ].join("\n"),
  );
  const quiet = spawnSync(process.execPath, [probe], { cwd: scratch, encoding: "utf8", env: inheritedProcessEnv({ [BOX_LOAD_ENV]: "0.2/1" }) });
  expect(quiet.status, quiet.stdout + quiet.stderr).toBe(2);
  expect(quiet.stderr).toContain("metadata unavailable");
  rmSync(join(scratch, "ci-delayed"));
  const loaded = spawnSync(process.execPath, [probe], { cwd: scratch, encoding: "utf8", env: inheritedProcessEnv({ [BOX_LOAD_ENV]: "2/1" }) });
  expect(loaded.status, loaded.stdout + loaded.stderr).toBe(0);
  expect(loaded.stdout).toBe("qualified");
});

test("the shared qualifier rejects false authority and partial reruns, and paginates the exact run attempt", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  const config = {
    repository: REPOSITORY,
    generation: GENERATION,
    publication: SHA,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: () => true,
  };
  const check = (responses: object): boolean => {
    writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(responses));
    return hasQualifiedMainPush(scratch, SHA, config);
  };
  expect(check(metadata())).toBe(true);
  const runUrl = `${API_ROOT}/workflows/7/runs?head_sha=${SHA}&event=push&branch=main&per_page=100&page=1`;
  const jobsUrl = `${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`;
  for (const patch of [
    { status: "in_progress", conclusion: null },
    { ["head_sha"]: "b".repeat(40) },
    { event: "pull_request" },
    { event: "schedule" },
    { event: "workflow_dispatch" },
    { ["head_branch"]: "release" },
    { ["workflow_id"]: 8 },
    { repository: { ["full_name"]: "another/repository" } },
  ]) {
    expect(check({ ...metadata(), [runUrl]: { ["total_count"]: 1, ["workflow_runs"]: [{ ...goodRun(), ...patch }] } }), JSON.stringify(patch)).toBe(false);
  }
  for (const patch of [
    { steps: [{ name: "Orbweaver qualification old", status: "completed", conclusion: "success" }] },
    { steps: [{ name: GENERATION, status: "completed", conclusion: "skipped" }] },
    { steps: [] },
    { conclusion: "failure" },
    { conclusion: "cancelled" },
    { status: "completed", conclusion: "skipped" },
    { ["run_id"]: 2 },
    { ["head_sha"]: "b".repeat(40) },
  ]) {
    expect(check({ ...metadata(), [jobsUrl]: { ["total_count"]: 12, jobs: [{ ...goodJob(), ...patch }, ...goodProductJobs()] } }), JSON.stringify(patch)).toBe(
      false,
    );
  }
  expect(check({ ...metadata(), [runUrl]: { ["total_count"]: 2, ["workflow_runs"]: [goodRun(), { ...goodRun(SHA, 2), conclusion: "failure" }] } })).toBe(false);
  expect(check({ ...metadata(), [`${API_ROOT}/runs/1`]: { ...goodRun(), ["run_attempt"]: 3 } })).toBe(false);
  expect(check({ ...metadata(), [jobsUrl]: { ["total_count"]: 0, jobs: [] } })).toBe(false);
  expect(() => check({ ...metadata(), [jobsUrl]: { ["total_count"]: 1, jobs: [] } })).toThrow("incomplete");
  expect(() => check({ ...metadata(), [runUrl]: { ["total_count"]: 1, ["workflow_runs"]: [{ ...goodRun(), ["run_attempt"]: undefined }] } })).toThrow();
  expect(() => check({})).toThrow("metadata unavailable");
  const others = Array.from({ length: 100 }, (_, index) => ({ ...goodJob(SHA, index + 13), name: `other-${index}`, steps: [] }));
  expect(
    check({
      ...metadata(),
      [jobsUrl]: { ["total_count"]: 112, jobs: others },
      [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=2`]: { ["total_count"]: 112, jobs: [goodJob(), ...goodProductJobs()] },
    }),
  ).toBe(true);
  expect(readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")).toContain("/runs/1/attempts/2/jobs?per_page=100&page=2");
  expect(readFileSync(join(scratch, "ci-requests.jsonl"), "utf8")).not.toContain("/attempts/1/");
});

test("native inherited matrices qualify only with their complete canonical runtime partition", async ({ scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  const jobs = [goodJob(), ...goodProductJobs(SHA, true), { ...goodJob(SHA, 99), name: "Weekly tooling proof", conclusion: "failure", steps: [] }];
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({ ...metadata(), [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs } }),
  );
  expect(hasQualifiedMainPush(scratch, SHA, GROUPED_CONFIG)).toBe(true);
  const { runtimeJobGroups: _groups, ...unconfigured } = GROUPED_CONFIG;
  expect(hasQualifiedMainPush(scratch, SHA, unconfigured)).toBe(false);
});

test.for([
  "missing-mode",
  "stale-mode",
  "mixed-mode",
  "stale-static",
  "skipped-static",
  "partial-rerun",
  "changed-sha",
  "changed-run",
] as const)("native inherited authority still refuses %s provenance", async (scenario, { scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  const jobs = [goodJob(), ...goodProductJobs(SHA, true)].map((job) => {
    if (job.name === "ci-ok") {
      const modes = {
        "missing-mode": [],
        "stale-mode": [{ name: "Orbweaver qualification previous (inherited)", status: "completed", conclusion: "success" }],
        "mixed-mode": [...job.steps, { name: `${GENERATION} (runtime)`, status: "completed", conclusion: "success" }],
      };
      if (scenario === "missing-mode" || scenario === "stale-mode" || scenario === "mixed-mode") {
        return { ...job, steps: modes[scenario] };
      }
    }
    if (job.name === "static" && scenario === "stale-static") {
      return { ...job, steps: [{ name: "Orbweaver qualification previous", status: "completed", conclusion: "success" }] };
    }
    return job.name === "static" && scenario === "skipped-static" ? { ...job, conclusion: "skipped" } : job;
  });
  const current = {
    ...goodRun(),
    ...(scenario === "partial-rerun" ? { ["run_attempt"]: 3 } : {}),
    ...(scenario === "changed-sha" ? { ["head_sha"]: "b".repeat(40) } : {}),
    ...(scenario === "changed-run" ? { id: 2 } : {}),
  };
  writeFileSync(
    join(scratch, "ci-api.json"),
    JSON.stringify({
      ...metadata(),
      [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs },
      [`${API_ROOT}/runs/1`]: current,
    }),
  );
  expect(hasQualifiedMainPush(scratch, SHA, GROUPED_CONFIG)).toBe(false);
});

for (const group of RUNTIME_JOB_GROUPS.filter(({ jobs }) => jobs.length > 1)) {
  test.for([
    "missing",
    "duplicate",
    "mixed",
    "wrong-label",
    "wrong-count",
    "queued",
    "running",
    "success",
    "failure",
    "cancelled",
    "wrong-sha",
    "wrong-run",
    "wrong-attempt",
  ] as const)(`native inherited ${group.name} refuses %s records`, async (scenario, { scratch, fakeBin }) => {
    await fakeBin("gh", API_FIXTURE);
    const complete = [goodJob(), ...goodProductJobs(SHA, true)];
    const patches = {
      "wrong-label": { name: `${group.name} unexpected` },
      "wrong-count": { name: group.name.replace(/\/\d/u, "/99") },
      queued: { status: "queued" },
      running: { status: "in_progress" },
      success: { conclusion: "success" },
      failure: { conclusion: "failure" },
      cancelled: { conclusion: "cancelled" },
      "wrong-sha": { ["head_sha"]: "b".repeat(40) },
      "wrong-run": { ["run_id"]: 2 },
      "wrong-attempt": { ["run_attempt"]: 1 },
    } satisfies Record<Exclude<typeof scenario, "missing" | "duplicate" | "mixed">, Partial<typeof JOB_SAMPLE>>;
    let jobs = complete;
    if (scenario === "missing") {
      jobs = complete.filter(({ name }) => name !== group.name);
    } else if (scenario === "duplicate") {
      jobs = [...complete, { ...goodJob(SHA, 99), name: group.name, conclusion: "skipped", steps: [] }];
    } else if (scenario === "mixed") {
      jobs = [...complete, ...group.jobs.map((name, index) => ({ ...goodJob(SHA, index + 99), name, conclusion: "skipped", steps: [] }))];
    } else {
      jobs = complete.map((job) => (job.name === group.name ? { ...job, ...patches[scenario] } : job));
    }
    writeFileSync(
      join(scratch, "ci-api.json"),
      JSON.stringify({ ...metadata(), [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs } }),
    );
    expect(hasQualifiedMainPush(scratch, SHA, GROUPED_CONFIG)).toBe(false);
  });

  test(`runtime qualification rejects the extra collapsed ${group.name} even with every successful shard`, async ({ scratch, fakeBin }) => {
    await fakeBin("gh", API_FIXTURE);
    const jobs = [goodJob(), ...goodProductJobs(), { ...goodJob(SHA, 99), name: group.name, conclusion: "skipped", steps: [] }];
    writeFileSync(
      join(scratch, "ci-api.json"),
      JSON.stringify({ ...metadata(), [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: { ["total_count"]: jobs.length, jobs } }),
    );
    expect(hasQualifiedMainPush(scratch, SHA, GROUPED_CONFIG)).toBe(false);
  });
}

test.for([
  "missing-member",
  "duplicate-member",
  "foreign-member",
  "empty-group",
  "duplicate-name",
  "renamed-singleton",
] as const)("runtime qualification refuses an invalid configured partition: %s", async (scenario, { scratch, fakeBin }) => {
  await fakeBin("gh", API_FIXTURE);
  writeFileSync(join(scratch, "ci-api.json"), JSON.stringify(metadata()));
  const groups = RUNTIME_JOB_GROUPS.map((group) => ({ name: group.name, jobs: [...group.jobs] }));
  const runtimeJobGroups = groups.map((group) => {
    if (scenario === "renamed-singleton") {
      return group.jobs.length === 1 ? { ...group, name: "unconfigured-singleton" } : group;
    }
    if (!group.name.startsWith("node")) {
      return group;
    }
    const patches = {
      "missing-member": { jobs: group.jobs.slice(0, 2) },
      "duplicate-member": { jobs: ["node (1/3)", "node (1/3)", "node (3/3)"] },
      "foreign-member": { jobs: ["node (1/3)", "node (2/3)", "unconfigured"] },
      "empty-group": { jobs: [] },
      "duplicate-name": { name: "e2e-smoke" },
    };
    return { ...group, ...patches[scenario] };
  });
  expect(hasQualifiedMainPush(scratch, SHA, { ...GROUPED_CONFIG, runtimeJobGroups })).toBe(false);
});

test("product authority requires every current-attempt job and distinguishes legitimate inherited skips", { timeout: scaledBudget(30_000) }, async ({
  scratch,
  fakeBin,
}) => {
  await fakeBin("gh", API_FIXTURE);
  const config = {
    repository: REPOSITORY,
    generation: GENERATION,
    publication: SHA,
    requiredJobs: REQUIRED_JOB_NAMES,
    runtimeJobs: RUNTIME_JOB_NAMES,
    hasCurrentGeneration: () => true,
  };
  const jobsUrl = `${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`;
  const complete = [goodJob(), ...goodProductJobs()];
  const check = (jobs: readonly object[]): boolean => {
    writeFileSync(join(scratch, "ci-api.json"), JSON.stringify({ ...metadata(), [jobsUrl]: { ["total_count"]: jobs.length, jobs } }));
    return hasQualifiedMainPush(scratch, SHA, config);
  };
  expect(check(complete)).toBe(true);
  for (const subject of [...REQUIRED_JOB_NAMES, ...RUNTIME_JOB_NAMES]) {
    expect(check(complete.filter((job) => job.name !== subject)), subject).toBe(false);
    for (const patch of [
      { status: "queued", conclusion: null },
      { conclusion: "skipped" },
      { conclusion: "failure" },
      { conclusion: "cancelled" },
      { ["head_sha"]: "b".repeat(40) },
      { ["run_id"]: 2 },
      { ["run_attempt"]: 1 },
    ]) {
      expect(check(complete.map((job) => (job.name === subject ? { ...job, ...patch } : job))), subject + JSON.stringify(patch)).toBe(false);
    }
  }
  for (const subject of ["static", "ci-ok"]) {
    for (const steps of [[], [{ name: "Orbweaver qualification previous", status: "completed", conclusion: "success" }]]) {
      expect(check(complete.map((job) => (job.name === subject ? { ...job, steps } : job)))).toBe(false);
    }
  }
  expect(check([...complete, { ...goodJob(), id: 99 }])).toBe(false);
  const inherited = complete.map((job) => {
    if (job.name === "ci-ok") {
      return { ...job, steps: [{ name: `${GENERATION} (inherited)`, status: "completed", conclusion: "success" }] };
    }
    return RUNTIME_JOB_NAMES.some((name) => name === job.name) ? { ...job, conclusion: "skipped" } : job;
  });
  expect(check(inherited)).toBe(true);
  expect(check(inherited.map((job) => (job.name === "e2e-smoke" ? { ...job, conclusion: "failure" } : job)))).toBe(false);
});
