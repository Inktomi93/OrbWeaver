// Approval grants execution, never qualification; candidate metadata is compared as data and never executed.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import { runTool } from "@orb/tooling/_shared/run-tool";
import { z } from "zod";

const REPOSITORY = "Inktomi93/OrbWeaver";
const BOT = { login: "github-actions[bot]", id: 41_898_282, type: "Bot" } as const;
const API_TIMEOUT_MS = 30_000;
const COMMIT = z.string().regex(/^[a-f0-9]{40}$/u);
const VERSION = z.string().regex(/^\d+\.\d+\.\d+$/u);
const COMPONENTS = { ".": ["package.json"], packages: ["packages/plugin-sdk/package.json", "packages/plugin-toolchain/package.json"] } as const;
const AUTHORING_VERSION_FILE = "packages/plugin-authoring-version.txt";
const WORKFLOWS = new Set([".github/workflows/ci.yml", ".github/workflows/codeql.yml"]);
const repo = z.object({ ["full_name"]: z.string() });
const actor = z.object({ login: z.string(), id: z.number().int(), type: z.string() });
const branch = z.object({ sha: COMMIT, ref: z.string(), repo });
const pull = z.object({
  number: z.number().int().positive(),
  state: z.string(),
  user: actor,
  head: branch,
  base: branch,
  ["changed_files"]: z.number().int().nonnegative(),
});
const run = z.object({
  id: z.number().int().positive(),
  event: z.string(),
  ["head_sha"]: COMMIT,
  path: z.string(),
  conclusion: z.string().nullable(),
  actor,
  ["head_repository"]: repo,
  ["pull_requests"]: z.array(z.object({ number: z.number().int().positive() })),
});
const files = z.array(z.object({ filename: z.string(), status: z.string() }));
const content = z.object({ encoding: z.literal("base64"), content: z.string() });
const manifest = z.object({ ".": VERSION, packages: VERSION }).strict();
const object = z.record(z.string(), z.json());

type ApprovalApi = (path: string, method?: string) => Promise<Response>;

function validatePackageVersion(oldPackage: z.infer<typeof object>, newPackage: z.infer<typeof object>, previous: string, next: string): void {
  const { version: oldVersion, ...oldContent } = oldPackage;
  const { version: newVersion, ...newContent } = newPackage;
  if (VERSION.parse(oldVersion) !== previous || VERSION.parse(newVersion) !== next) {
    throw new Error("Package versions do not match the release manifest");
  }
  if (!isDeepStrictEqual(oldContent, newContent)) {
    throw new Error("Release automation changed non-version package content");
  }
}

async function validateVersionDiff(changed: z.infer<typeof files>, pr: z.infer<typeof pull>, api: ApprovalApi): Promise<void> {
  if (changed.length !== pr.changed_files || changed.some((file) => file.status !== "modified")) {
    throw new Error("Approval diff is incomplete or changes file identity");
  }
  const readText = async (path: string, sha: string): Promise<string> => {
    const blob = content.parse(await (await api(`contents/${path}?ref=${sha}`)).json());
    return Buffer.from(blob.content, "base64").toString("utf8");
  };
  const readJson = async (path: string, sha: string): Promise<z.infer<typeof object>> => object.parse(JSON.parse(await readText(path, sha)));
  const [before, after] = await Promise.all([readJson(".release-please-manifest.json", pr.base.sha), readJson(".release-please-manifest.json", pr.head.sha)]);
  const previous = manifest.parse(before);
  const next = manifest.parse(after);
  const expected = new Set([".release-please-manifest.json"]);
  if (previous.packages !== next.packages) {
    expected.add(AUTHORING_VERSION_FILE);
    const [oldVersion, newVersion] = await Promise.all([readText(AUTHORING_VERSION_FILE, pr.base.sha), readText(AUTHORING_VERSION_FILE, pr.head.sha)]);
    if (oldVersion.trim() !== previous.packages || newVersion.trim() !== next.packages) {
      throw new Error("Authoring version file does not match its release manifest");
    }
  }
  const components = (Object.keys(COMPONENTS) as (keyof typeof COMPONENTS)[]).filter((component) => previous[component] !== next[component]);
  for (const component of components) {
    for (const path of COMPONENTS[component]) {
      expected.add(path);
      const [oldPackage, newPackage] = await Promise.all([readJson(path, pr.base.sha), readJson(path, pr.head.sha)]);
      validatePackageVersion(oldPackage, newPackage, previous[component], next[component]);
    }
  }
  if (expected.size === 1 || expected.size !== changed.length || changed.some((file) => !expected.has(file.filename))) {
    throw new Error("Release approval requires the complete closed version-only diff");
  }
}

await runTool(async () => {
  const env = z
    .object({ GH_TOKEN: z.string().min(1), GITHUB_EVENT_PATH: z.string().min(1), GITHUB_REPOSITORY: z.literal(REPOSITORY) })
    .parse(inheritedProcessEnv());
  const event = z
    .object({ repository: repo, ["workflow_run"]: z.object({ id: z.number().int().positive() }) })
    .parse(JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8")));
  if (event.repository.full_name !== REPOSITORY) {
    throw new Error("Approval event belongs to another repository");
  }
  const api = async (path: string, method = "GET"): Promise<Response> => {
    const response = await fetch(`https://api.github.com/repos/${REPOSITORY}/${path}`, {
      method,
      redirect: "error",
      signal: AbortSignal.timeout(API_TIMEOUT_MS),
      headers: { Authorization: `Bearer ${env.GH_TOKEN}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!response.ok) {
      throw new Error(`GitHub approval API ${method} returned HTTP ${String(response.status)}`);
    }
    return response;
  };
  const sameBot = (value: z.infer<typeof actor>): boolean => isDeepStrictEqual(value, BOT);
  const candidate = run.parse(await (await api(`actions/runs/${String(event.workflow_run.id)}`)).json());
  if (
    candidate.id !== event.workflow_run.id ||
    candidate.event !== "pull_request" ||
    candidate.conclusion !== "action_required" ||
    candidate.head_repository.full_name !== REPOSITORY ||
    !WORKFLOWS.has(candidate.path) ||
    !sameBot(candidate.actor) ||
    candidate.pull_requests.length !== 1
  ) {
    console.log("Refused approval: not a matching blocked same-repository release automation run.");
    return 0;
  }
  const number = candidate.pull_requests[0]?.number;
  if (number === undefined) {
    throw new Error("Blocked run has no pull request");
  }
  const prPath = `pulls/${String(number)}`;
  const pr = pull.parse(await (await api(prPath)).json());
  if (
    pr.number !== number ||
    pr.state !== "open" ||
    !sameBot(pr.user) ||
    pr.head.sha !== candidate.head_sha ||
    pr.head.repo.full_name !== REPOSITORY ||
    pr.base.repo.full_name !== REPOSITORY ||
    pr.base.ref !== "release" ||
    !pr.head.ref.startsWith("release-please--branches--release")
  ) {
    console.log("Refused approval: pull request identity or source boundary is not trusted.");
    return 0;
  }
  const changed = files.parse(await (await api(`${prPath}/files?per_page=100`)).json());
  await validateVersionDiff(changed, pr, api);
  const current = pull.parse(await (await api(prPath)).json());
  if (!isDeepStrictEqual(current, pr)) {
    throw new Error("Pull request changed during approval validation");
  }
  const currentRun = run.parse(await (await api(`actions/runs/${String(candidate.id)}`)).json());
  if (currentRun.conclusion !== "action_required") {
    console.log("Matching run was already unblocked; no approval sent.");
    return 0;
  }
  if (!isDeepStrictEqual(currentRun, candidate)) {
    throw new Error("Workflow run changed during approval validation");
  }
  await api(`actions/runs/${String(candidate.id)}/approve`, "POST");
  console.log(`Approved execution of release metadata run ${String(candidate.id)} at ${candidate.head_sha}; CI still determines qualification.`);
  return 0;
});
