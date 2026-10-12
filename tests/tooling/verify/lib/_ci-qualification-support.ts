export const REPOSITORY = "Inktomi93/OrbWeaver";
export const GENERATION = "Orbweaver qualification product-v4";
export const SHA = "a".repeat(40);
export const REQUIRED_JOB_NAMES = ["static", "ci-ok", "changes"] as const;
export const RUNTIME_JOB_NAMES = [
  "node (1/1)",
  "node legacy (1/3)",
  "node legacy (2/3)",
  "node legacy (3/3)",
  "ct (1/1)",
  "ct legacy (1/5)",
  "ct legacy (2/5)",
  "ct legacy (3/5)",
  "ct legacy (4/5)",
  "ct legacy (5/5)",
  "e2e-smoke",
] as const;
export const RUNTIME_JOB_GROUPS = [
  { name: "node (1/1)", jobs: ["node (1/1)"] },
  { name: "node legacy (${{ matrix.shard }}/3)", jobs: ["node legacy (1/3)", "node legacy (2/3)", "node legacy (3/3)"] },
  { name: "ct (1/1)", jobs: ["ct (1/1)"] },
  { name: "ct legacy (${{ matrix.shard }}/5)", jobs: ["ct legacy (1/5)", "ct legacy (2/5)", "ct legacy (3/5)", "ct legacy (4/5)", "ct legacy (5/5)"] },
  { name: "e2e-smoke", jobs: ["e2e-smoke"] },
] as const;
export const GROUPED_CONFIG = {
  repository: REPOSITORY,
  generation: GENERATION,
  publication: SHA,
  requiredJobs: REQUIRED_JOB_NAMES,
  runtimeJobs: RUNTIME_JOB_NAMES,
  runtimeJobGroups: RUNTIME_JOB_GROUPS,
  hasCurrentGeneration: (): boolean => true,
};
export const API_ROOT = `repos/${REPOSITORY}/actions`;

const RUN_SAMPLE = {
  id: 1,
  ["workflow_id"]: 7,
  ["run_attempt"]: 2,
  ["head_sha"]: SHA,
  ["head_branch"]: "main",
  event: "push",
  status: "completed",
  conclusion: "success",
  repository: { ["full_name"]: REPOSITORY },
};

export function goodRun(sha = SHA, id = 1): typeof RUN_SAMPLE {
  return { ...RUN_SAMPLE, id, ["head_sha"]: sha };
}

export const JOB_SAMPLE = {
  id: 1,
  ["run_attempt"]: 2,
  ["run_id"]: 1,
  ["head_sha"]: SHA,
  name: "static",
  status: "completed",
  conclusion: "success",
  steps: [{ name: GENERATION, status: "completed", conclusion: "success" }],
};

export function goodJob(sha = SHA, id = 1): typeof JOB_SAMPLE {
  return { ...JOB_SAMPLE, id, ["head_sha"]: sha };
}

export function goodProductJobs(sha = SHA, inherited = false): readonly (typeof JOB_SAMPLE)[] {
  const runtime = inherited ? RUNTIME_JOB_GROUPS.map(({ name }) => name) : RUNTIME_JOB_NAMES;
  return ["ci-ok", "changes", ...runtime].map((name, index) => ({
    ...goodJob(sha, index + 2),
    name,
    conclusion: inherited && runtime.some((runtimeName) => runtimeName === name) ? "skipped" : "success",
    steps: name === "ci-ok" ? [{ name: `${GENERATION} (${inherited ? "inherited" : "runtime"})`, status: "completed", conclusion: "success" }] : [],
  }));
}

export function metadata(sha = SHA): object {
  const run = goodRun(sha);
  return {
    [`${API_ROOT}/workflows/ci.yml`]: { id: 7, path: ".github/workflows/ci.yml" },
    [`${API_ROOT}/workflows/7/runs?head_sha=${sha}&event=push&branch=main&per_page=100&page=1`]: { ["total_count"]: 1, ["workflow_runs"]: [run] },
    [`${API_ROOT}/runs/1/attempts/2/jobs?per_page=100&page=1`]: {
      ["total_count"]: 1 + goodProductJobs(sha).length,
      jobs: [goodJob(sha), ...goodProductJobs(sha)],
    },
    [`${API_ROOT}/runs/1`]: run,
  };
}

export const API_FIXTURE = [
  "import fs from 'node:fs';const [command,endpoint]=process.argv.slice(2);",
  "fs.appendFileSync('ci-requests.jsonl',JSON.stringify([command,endpoint])+'\\n');",
  "const responses=JSON.parse(fs.readFileSync('ci-api.json','utf8'));",
  "if(command==='api'&&endpoint.includes('/workflows/7/runs?event=push&branch=main&')&&!(endpoint in responses)){",
  "const rows=Object.entries(responses).filter(([key])=>key.includes('/workflows/7/runs?head_sha=')&&key.endsWith('&page=1')).flatMap(([,value])=>value.workflow_runs);",
  "const page=Number(new URL('https://fixture.invalid/'+endpoint).searchParams.get('page'));responses[endpoint]={total_count:rows.length,workflow_runs:rows.slice((page-1)*100,page*100)};}",
  "if(endpoint.includes('/jobs?')&&!(endpoint in responses))responses[endpoint]={total_count:0,jobs:[]};",
  "if(command!=='api'||!(endpoint in responses))process.exit(74);",
  "process.stdout.write(JSON.stringify(responses[endpoint]));",
].join("\n");
