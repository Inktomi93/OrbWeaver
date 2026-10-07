import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";
import YAML from "yaml";
import { expect, test } from "../../../support/tool-fixtures.ts";

interface WorkflowStep {
  readonly id?: string;
  readonly run?: string;
  readonly if?: string;
  readonly uses?: string;
  readonly with?: { readonly path?: string; readonly key?: string };
}
interface QualificationJob {
  readonly env: Readonly<Record<string, string>>;
  readonly steps: readonly WorkflowStep[];
}
interface Workflow {
  readonly env: Readonly<Record<string, string>>;
  readonly jobs: {
    readonly qualification: QualificationJob;
    readonly changes: {
      readonly permissions: Readonly<Record<string, string>>;
      readonly steps: readonly (WorkflowStep & { readonly env?: Readonly<Record<string, string>> })[];
    };
    readonly static: { readonly env: Readonly<Record<string, string>>; readonly steps: readonly (WorkflowStep & { readonly name?: string })[] };
  };
}

function workflow(repoRoot: string): Workflow {
  return YAML.parse(readFileSync(join(repoRoot, ".github/workflows/ci.yml"), "utf8")) as Workflow;
}

function step(job: QualificationJob, id: string): WorkflowStep {
  const found = job.steps.find((candidate) => candidate.id === id);
  if (found === undefined) {
    throw new Error(`missing qualification step ${id}`);
  }
  return found;
}

test("nightly full uses a distinct exact-SHA cache, and red/no-verdict native verification cannot create its success marker", async ({
  repoRoot,
  scratch,
  fakeBin,
}) => {
  const job = workflow(repoRoot).jobs.qualification;
  expect(job.env["VERIFY_TIER"]).toBe("${{ github.event_name == 'schedule' && 'full' || inputs.tier }}");
  const seen = step(job, "seen");
  const verify = step(job, "verify");
  const mark = step(job, "mark");
  const save = job.steps.find((candidate) => candidate.uses?.startsWith("actions/cache/save@") === true);
  expect(mark.if).toBe("success() && steps.verify.outcome == 'success'");
  expect(save?.if).toBe("success() && steps.mark.outcome == 'success'");
  const sha = "a".repeat(40);
  const keyFor = (tier: string): string => (seen.with?.key ?? "").replaceAll("${{ env.VERIFY_TIER }}", tier).replaceAll("${{ steps.sha.outputs.sha }}", sha);
  const cached = new Set([keyFor("product")]);
  expect(cached.has(keyFor("full")), "an old product success must not skip exhaustive proof").toBe(false);
  cached.add(keyFor("full"));
  expect(cached.has(keyFor("full"))).toBe(true);
  expect(keyFor("full")).not.toBe(keyFor("full").replace(sha, "b".repeat(40)));
  expect(save?.with).toEqual(seen.with === undefined ? undefined : { path: seen.with.path, key: seen.with.key });
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';fs.writeFileSync('called.json',JSON.stringify(process.argv.slice(2)));process.exitCode=Number(process.env.FIXTURE_VERIFY_EXIT);",
  );
  writeFileSync(join(scratch, ".product-verified"), sha);
  for (const code of [1, 2, 3, 0]) {
    const result = spawnSync("bash", ["-e", "-c", `${verify.run ?? ""}\n${mark.run ?? ""}`], {
      cwd: scratch,
      env: inheritedProcessEnv({ ["VERIFY_TIER"]: "full", ["VERIFIED_SHA"]: sha, ["FIXTURE_VERIFY_EXIT"]: String(code) }),
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(code);
    expect(JSON.parse(readFileSync(join(scratch, "called.json"), "utf8"))).toEqual(["verify", "--full"]);
    expect(existsSync(join(scratch, ".full-verified"))).toBe(code === 0);
  }
  expect(readFileSync(join(scratch, ".full-verified"), "utf8").trim()).toBe(sha);
});

test("CI event qualification passes the actual target/before and tested SHA, not a remote-main or single-parent shortcut", ({ repoRoot }) => {
  const ci = workflow(repoRoot);
  const environment = ci.jobs.static.env;
  expect(environment["ORB_VERIFY_BASE"]).toBe("${{ needs.changes.outputs.base }}");
  expect(environment["ORB_VERIFY_HEAD"]).toBe("${{ needs.changes.outputs.head }}");
  expect(environment["ORB_VERIFY_TOOL_MODE"]).toBe("${{ needs.changes.outputs.tool_mode }}");
  const producer = ci.jobs.changes.steps.find((candidate) => candidate.id === "diff");
  expect(producer?.run).toBe('node scripts/ci-qualification.ts baseline "$GITHUB_SHA" "$BEFORE"');
  expect(producer?.env?.["BEFORE"]).toBe(
    "${{ github.event_name == 'pull_request' && github.event.pull_request.base.sha || github.event_name == 'push' && github.event.before || inputs.base }}",
  );
  expect(ci.jobs.changes.permissions).toEqual({ contents: "read", actions: "read" });
  expect(ci.jobs.static.steps.find((candidate) => candidate.run === "pnpm check")?.name).toBe("${{ env.ORB_CI_QUALIFICATION_GENERATION }}");
  expect(ci.env["ORB_CI_QUALIFICATION_GENERATION"]).toBe("Orbweaver qualification ancestor-v1");
  expect(ci.env["ORB_CI_PUBLICATION_BOOTSTRAP_SHA"]).toBe("ac6cfc19ea9db59644426b37f6b8c842c33473ad");
  expect(ci.env["ORB_CI_REPOSITORY"]).toBe("Inktomi93/OrbWeaver");
});

test("uncached nightly and manual qualification provision media executables before full or product verification", async ({ repoRoot, scratch, fakeBin }) => {
  const job = workflow(repoRoot).jobs.qualification;
  const media = step(job, "media");
  const verify = step(job, "verify");
  expect(media.if).toBe(verify.if);
  expect(job.steps.indexOf(media)).toBeLessThan(job.steps.indexOf(verify));
  await fakeBin(
    "sudo",
    "import fs from 'node:fs';const args=process.argv.slice(2);fs.appendFileSync('apt.jsonl',JSON.stringify(args)+'\\n');if(args.includes('install')&&args.includes('ffmpeg'))fs.writeFileSync('media-ready','yes');",
  );
  await fakeBin(
    "pnpm",
    "import fs from 'node:fs';if(!fs.existsSync('media-ready'))throw new Error('media prerequisite absent');fs.writeFileSync('called.json',JSON.stringify(process.argv.slice(2)));",
  );
  for (const tier of ["full", "product"]) {
    const result = spawnSync("bash", ["-e", "-c", `${media.run ?? ""}\n${verify.run ?? ""}`], {
      cwd: scratch,
      env: inheritedProcessEnv({ ["VERIFY_TIER"]: tier }),
      encoding: "utf8",
    });
    expect(result.status, result.stdout + result.stderr).toBe(0);
    expect(JSON.parse(readFileSync(join(scratch, "called.json"), "utf8"))).toEqual(["verify", `--${tier}`]);
  }
  expect(
    readFileSync(join(scratch, "apt.jsonl"), "utf8")
      .trim()
      .split(/\r?\n/u)
      .map((row) => JSON.parse(row)),
  ).toEqual([
    ["apt-get", "update", "-qq"],
    ["-A", "apt-get", "install", "-y", "-qq", "--no-install-recommends", "ffmpeg"],
    ["apt-get", "update", "-qq"],
    ["-A", "apt-get", "install", "-y", "-qq", "--no-install-recommends", "ffmpeg"],
  ]);
});
