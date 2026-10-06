// The stable release automation's couplings that no single file shows: release-please must write the tag the
// version reader looks for (or every stable build reads as `main`), and the release workflow must publish the
// image the default compose file pulls, built from the tag so its stamp derives the stable channel.

import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { releaseTagRef } from "@orb/kit/version-identity";
import type { SpawnNicedOptions } from "@orb/tooling/_shared/proc";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { parse } from "yaml";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

function read(repoRoot: string, rel: string): string {
  return readFileSync(join(repoRoot, rel), "utf8");
}

const releaseConfig = z.object({
  packages: z.object({
    ".": z.object({
      "include-v-in-tag": z.boolean().optional(),
      "include-component-in-tag": z.boolean().optional(),
      "initial-version": z.string(),
      "bump-minor-pre-major": z.boolean().optional(),
      "bump-patch-for-minor-pre-major": z.boolean().optional(),
    }),
  }),
});

const releaseWorkflow = z.object({
  on: z.object({ push: z.object({ branches: z.array(z.string()) }) }),
  jobs: z.object({
    image: z.object({
      if: z.string(),
      env: z.record(z.string(), z.string()),
      steps: z.array(z.object({ uses: z.string().optional(), with: z.record(z.string(), z.unknown()).optional() })),
    }),
  }),
});

test("release-please tags a release exactly as the version reader looks for it", ({ repoRoot }) => {
  const root = releaseConfig.parse(JSON.parse(read(repoRoot, "release-please-config.json"))).packages["."];
  // release-please's defaults: a `v` prefix unless turned off, a component prefix unless turned off.
  const prefix = root["include-v-in-tag"] === false ? "" : "v";
  expect(root["include-component-in-tag"]).toBe(false);
  expect(`refs/tags/${prefix}${root["initial-version"]}`).toBe(releaseTagRef(root["initial-version"]));
});

test("the first release is v0.1.0 and the version stays below 1.0: feat bumps the minor, fix the patch", ({ repoRoot }) => {
  const root = releaseConfig.parse(JSON.parse(read(repoRoot, "release-please-config.json"))).packages["."];
  expect(root["initial-version"]).toBe("0.1.0");
  // A breaking change bumps the minor instead of jumping to 1.0.0; a feature keeps its minor bump.
  expect(root["bump-minor-pre-major"]).toBe(true);
  expect(root["bump-patch-for-minor-pre-major"]).not.toBe(true);
});

test("the release workflow runs on the stable branch and publishes, from the tag, the image compose pulls", ({ repoRoot }) => {
  const workflow = releaseWorkflow.parse(parse(read(repoRoot, ".github/workflows/release.yml")));
  expect(workflow.on.push.branches).toEqual(["release"]);
  expect(workflow.jobs.image.if).toContain("release_created == 'true'");
  const checkout = workflow.jobs.image.steps.find((step) => step.uses?.startsWith("actions/checkout@") === true);
  expect(checkout?.with?.["ref"]).toBe("refs/tags/${{ needs.release-please.outputs.tag_name }}");

  const compose = z
    .object({ services: z.object({ orbweaver: z.object({ image: z.string(), build: z.unknown().optional() }) }) })
    .parse(parse(read(repoRoot, "docker-compose.yaml")));
  expect(compose.services.orbweaver.image).toBe(`\${ORB_IMAGE:-${workflow.jobs.image.env["IMAGE"] ?? "no IMAGE env"}:latest}`);
  // The base file never builds: a source build has its own overlay and its own local image name.
  expect(compose.services.orbweaver.build).toBeUndefined();
});

test("development publication selects an exact source commit and cannot overwrite stable image tags", ({ repoRoot }) => {
  const workflow = z
    .object({
      on: z.object({ push: z.object({ branches: z.array(z.string()) }) }).loose(),
      permissions: z.object({}).strict(),
      jobs: z.object({
        image: z.object({
          permissions: z.object({ contents: z.literal("read"), packages: z.literal("write") }).strict(),
          env: z.record(z.string(), z.string()),
          steps: z.array(
            z.object({
              name: z.string().optional(),
              uses: z.string().optional(),
              run: z.string().optional(),
              with: z.record(z.string(), z.unknown()).optional(),
            }),
          ),
        }),
      }),
    })
    .parse(parse(read(repoRoot, ".github/workflows/development-image.yml")));
  const image = workflow.jobs.image;
  expect(image.env["IMAGE"]).toBe("ghcr.io/inktomi93/orbweaver");
  const checkout = image.steps.find((step) => step.uses?.startsWith("actions/checkout@") === true);
  expect(workflow.on.push.branches).toEqual(["codex/launch-packages"]);
  expect(workflow.on).toHaveProperty("workflow_dispatch", null);
  expect(checkout?.with?.["ref"]).toBe("${{ github.sha }}");
  expect(checkout?.with?.["persist-credentials"]).toBe(false);
  expect(checkout?.with?.["fetch-tags"]).toBe(false);
  const build = image.steps.find((step) => step.uses?.startsWith("docker/build-push-action@") === true);
  expect(build?.with?.["tags"]).toBe("${{ env.IMAGE }}:sha-${{ github.sha }}\n");
  expect(build?.with?.["push"]).not.toBe(true);
  const stamp = image.steps.find((step) => step.name === "Prove development identity");
  expect(stamp?.run).toContain('.commit == $sha and .channel == "main"');
  const boot = image.steps.find((step) => step.name === "Prove fresh runtime boot");
  expect(boot?.run).toContain("http://127.0.0.1:18788/healthz");
  expect(boot?.run).toContain('.version.commit == $sha and .version.channel == "main"');
  const publish = image.steps.findIndex((step) => step.name === "Push development tags");
  expect(publish).toBeGreaterThan(image.steps.findIndex((step) => step.name === "Prove development identity"));
  expect(publish).toBeGreaterThan(image.steps.findIndex((step) => step.name === "Prove fresh runtime boot"));
  expect(image.steps[publish]?.run).toContain('"$IMAGE:development"');
  expect(image.steps[publish]?.run).not.toMatch(/:latest|:stable/u);
  const anonymous = image.steps.find((step) => step.name === "Prove anonymous digest pull");
  expect(anonymous?.run).toContain("--src-no-creds --preserve-digests");
  expect(anonymous?.run).toContain("oci:/proof/image:published");
});

function developmentStep(repoRoot: string, name: string): string {
  const workflow = z
    .object({ jobs: z.object({ image: z.object({ steps: z.array(z.object({ name: z.string().optional(), run: z.string().optional() })) }) }) })
    .parse(parse(read(repoRoot, ".github/workflows/development-image.yml")));
  const script = workflow.jobs.image.steps.find((step) => step.name === name)?.run;
  if (script === undefined) {
    throw new Error(`Missing workflow step: ${name}`);
  }
  return script;
}

function publicationEnv(scratch: string): NonNullable<SpawnNicedOptions["env"]> {
  return Object.fromEntries([
    ["RUNNER_TEMP", scratch],
    ["IMAGE", "proof-image"],
    ["SOURCE_SHA", "a".repeat(40)],
    ["GITHUB_STEP_SUMMARY", join(scratch, "summary.md")],
  ]);
}

test("the boot proof works when host health omits operator identity", async ({ repoRoot, scratch, fakeBin }) => {
  const sha = "a".repeat(40);
  await fakeBin("curl", 'console.log(JSON.stringify({ status: "ok", harness: false }));');
  await fakeBin(
    "docker",
    `
    const args = process.argv.slice(2);
    if (args[0] === "run") console.log("proof-container");
    else if (args[0] === "inspect") console.log("true");
    else if (args[0] === "exec" && args[2] === "node" && args[4].includes("http://127.0.0.1:8788/healthz"))
      console.log(JSON.stringify({ status: "ok", version: { commit: ${JSON.stringify(sha)}, channel: "main" } }));
    else if (!["logs", "rm"].includes(args[0])) process.exit(1);
  `,
  );
  const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", developmentStep(repoRoot, "Prove fresh runtime boot")], {
    env: publicationEnv(scratch),
  });
  expect(result.code, result.stderr).toBe(0);
});

test("the anonymous proof requires independently downloaded bytes, not builder cache", async ({ repoRoot, scratch, fakeBin }) => {
  const summary = join(scratch, "summary.md");
  const fixture = join(scratch, "download");
  await mkdir(fixture);
  const generated = await spawnNiced("python3", [
    "-c",
    `
import hashlib, io, json, pathlib, tarfile, sys
root = pathlib.Path(sys.argv[1]); blobs = root / "blobs" / "sha256"; blobs.mkdir(parents=True)
def blob(data):
 value = hashlib.sha256(data).hexdigest(); (blobs / value).write_bytes(data)
 return {"digest": "sha256:" + value, "size": len(data)}
sha = "a" * 40
payload = json.dumps({"commit": sha, "channel": "main"}).encode()
buffer = io.BytesIO()
with tarfile.open(fileobj=buffer, mode="w") as archive:
 member = tarfile.TarInfo("app/version.json"); member.size = len(payload); archive.addfile(member, io.BytesIO(payload))
layer = blob(buffer.getvalue())
config = blob(json.dumps({"config": {"Labels": {"org.opencontainers.image.revision": sha}}}).encode())
manifest = blob(json.dumps({"config": config, "layers": [layer]}).encode())
(root / "index.json").write_text(json.dumps({"manifests": [manifest]}))
print(manifest["digest"])
`,
    fixture,
  ]);
  expect(generated.code, generated.stderr).toBe(0);
  const digest = generated.stdout.trim();
  await fakeBin(
    "docker",
    `
    import { cpSync, readFileSync, writeFileSync } from "node:fs";
    import { join } from "node:path";
    const args = process.argv.slice(2);
    if (args[0] === "inspect") console.log("proof-image@" + ${JSON.stringify(digest)});
    else if (args[0] === "pull") console.log("cached image already present");
    else if (args[0] === "run" && args.includes("--entrypoint"))
      console.log(JSON.stringify({ commit: process.env.SOURCE_SHA, channel: "main" }));
    else if (args[0] === "run" && args.includes("copy")) {
      if (!args.includes("--src-no-creds") || !args.includes("--preserve-digests") || args.some((arg) => arg.includes("docker.sock"))) process.exit(1);
      const mount = args[args.indexOf("-v") + 1].split(":")[0];
      cpSync(${JSON.stringify(fixture)}, join(mount, "image"), { recursive: true });
      if (process.env.PUBLISH_PROOF_CORRUPT === "yes") {
        const root = join(mount, "image");
        const index = JSON.parse(readFileSync(join(root, "index.json"), "utf8"));
        const path = (digest) => join(root, "blobs", "sha256", digest.split(":")[1]);
        const manifest = JSON.parse(readFileSync(path(index.manifests[0].digest), "utf8"));
        writeFileSync(path(manifest.layers[0].digest), "corrupt anonymous layer");
      }
    } else process.exit(1);
  `,
  );
  await writeFile(summary, "");
  const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", developmentStep(repoRoot, "Prove anonymous digest pull")], {
    env: publicationEnv(scratch),
  });
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain('"downloadedLayers": 1');
  await writeFile(summary, "");
  const corrupt = await spawnNiced("bash", ["-euo", "pipefail", "-c", developmentStep(repoRoot, "Prove anonymous digest pull")], {
    env: { ...publicationEnv(scratch), ...Object.fromEntries([["PUBLISH_PROOF_CORRUPT", "yes"]]) },
  });
  expect(corrupt.code).not.toBe(0);
  expect(readFileSync(summary, "utf8")).toBe("");
});
