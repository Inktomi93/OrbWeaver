// The stable and development image workflows publish only what their pre-publication proofs admit, and the stable one publishes the image the default compose file pulls.
import { readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import type { SpawnNicedOptions } from "@orb/tooling/floor/process/proc";
import { spawnNiced } from "@orb/tooling/floor/process/proc";
import { parse } from "yaml";
import { z } from "zod";
import { read, workflowJobs } from "./_workflow-support.ts";

const releaseWorkflow = z.object({
  on: z.object({ push: z.object({ branches: z.array(z.string()) }) }),
  jobs: z.object({
    image: z.object({
      if: z.string(),
      env: z.record(z.string(), z.string()),
      steps: z.array(z.object({ name: z.string().optional(), uses: z.string().optional(), with: z.record(z.string(), z.json()).optional() })),
    }),
  }),
});

test("stable GitHub publication waits for a scanned, attested and anonymously pulled image", ({ repoRoot }) => {
  const config = z
    .object({ packages: z.object({ ".": z.object({ draft: z.boolean(), "force-tag-creation": z.boolean() }) }) })
    .parse(JSON.parse(read(repoRoot, "release-please-config.json"))).packages["."];
  expect(config).toEqual({ draft: true, "force-tag-creation": true });
  const jobs = workflowJobs(repoRoot, "release");
  expect(jobs["notes"]?.needs).toEqual(["release-please", "image"]);
  const publish = jobs["notes"]?.steps.find((step) => step.run?.includes("gh release edit") === true);
  expect(publish?.run).toContain("--draft=false --latest");
  expect(publish?.run).toContain("<!-- orbweaver-publication -->");
  const image = jobs["image"]?.steps ?? [];
  const anonymous = image.find((step) => step.name === "Prove the image pulls without credentials");
  expect(anonymous?.run).toContain("bash scripts/ci/anonymous-image-pull.sh");
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  expect(anonymous?.env?.["DIGEST"]).toBe("${{ steps.digest.outputs.digest }}");
  const latest = image.findIndex((step) => step.name === "Advertise the verified image as latest");
  expect(latest).toBeGreaterThan(image.indexOf(anonymous ?? {}));
  expect(image[latest]?.run).toContain('docker push "$IMAGE:latest"');
});

test("stable publication retries replace managed notes and retain publication failures", async ({ repoRoot, scratch, fakeBin }) => {
  const script = z.string().parse(workflowJobs(repoRoot, "release")["notes"]?.steps.find((step) => step.run?.includes("gh release edit") === true)?.run);
  await writeFile(join(scratch, "release-notes.md"), "Changes\n");
  await fakeBin("pnpm", "process.exit(0);");
  await fakeBin(
    "gh",
    `
    import fs from 'node:fs';
    const args = process.argv.slice(2);
    if (args[1] === 'view') process.stdout.write(fs.readFileSync('release-notes.md', 'utf8'));
    else if (args[1] === 'edit') {
      if (!args.includes('--draft=false') || !args.includes('--latest')) process.exit(72);
      fs.copyFileSync(args[args.indexOf('--notes-file') + 1], 'release-notes.md');
      process.exitCode = Number(process.env.PUBLICATION_EXIT);
    } else process.exit(73);
  `,
  );
  for (const status of [71, 0, 0]) {
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", script], {
      cwd: scratch,
      env: {
        ["TAG"]: "v0.1.3",
        ["VERSION"]: "0.1.3",
        ["DIGEST"]: `sha256:${"a".repeat(64)}`,
        ["GITHUB_REPOSITORY"]: "proof/repo",
        ["PUBLICATION_EXIT"]: String(status),
      },
    });
    expect(result.code, result.stderr).toBe(status);
    const notes = read(scratch, "release-notes.md");
    expect(notes.startsWith("Changes\n")).toBe(true);
    expect(notes.match(/## Upgrade/gu)).toHaveLength(1);
    expect(notes.match(/<!-- orbweaver-publication -->/gu)).toHaveLength(1);
  }
});

test("failed release-note reads cannot publish replacement-only notes under the implicit runner shell", async ({ repoRoot, scratch, fakeBin }) => {
  const script = z.string().parse(workflowJobs(repoRoot, "release")["notes"]?.steps.find((step) => step.run?.includes("gh release edit") === true)?.run);
  await fakeBin("pnpm", "process.exit(0);");
  await fakeBin(
    "gh",
    "import fs from 'node:fs';const args=process.argv.slice(2);if(args[1]==='view')process.exit(71);if(args[1]==='edit')fs.writeFileSync('published','yes');",
  );
  const result = await spawnNiced("bash", ["-e", "-c", script], {
    cwd: scratch,
    env: { ["TAG"]: "v0.1.3", ["VERSION"]: "0.1.3", ["DIGEST"]: `sha256:${"a".repeat(64)}`, ["GITHUB_REPOSITORY"]: "proof/repo" },
  });
  expect(result.code, result.stderr).toBe(71);
  expect(readFileSync(join(scratch, "raw-notes.md"), "utf8")).toBe("");
  expect(() => readFileSync(join(scratch, "published"), "utf8")).toThrow();
});

test("the release workflow runs on the stable branch and publishes, from the tag, the image compose pulls", ({ repoRoot }) => {
  const workflow = releaseWorkflow.parse(parse(read(repoRoot, ".github/workflows/release.yml")));
  expect(workflow.on.push.branches).toEqual(["release"]);
  expect(workflow.jobs.image.if).toContain("release_created == 'true'");
  const checkout = workflow.jobs.image.steps.find((step) => step.uses?.startsWith("actions/checkout@") === true);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
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
      on: z.strictObject({ ["workflow_dispatch"]: z.null() }),
      permissions: z.strictObject({}),
      jobs: z.object({
        image: z.object({
          permissions: z.strictObject({
            contents: z.literal("read"),
            packages: z.literal("write"),
            ["id-token"]: z.literal("write"),
            attestations: z.literal("write"),
          }),
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
  expect(workflow.on.workflow_dispatch).toBeNull();
  expect(workflow.on).toHaveProperty("workflow_dispatch", null);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  expect(checkout?.with?.["ref"]).toBe("${{ github.sha }}");
  expect(checkout?.with?.["persist-credentials"]).toBe(false);
  expect(checkout?.with?.["fetch-tags"]).toBe(false);
  const build = image.steps.find((step) => step.uses?.startsWith("docker/build-push-action@") === true);
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  expect(build?.with?.["tags"]).toBe("${{ env.IMAGE }}:sha-${{ github.sha }}\n");
  expect(build?.with?.["push"]).not.toBe(true);
  const stamp = image.steps.find((step) => step.name === "Prove development identity");
  expect(stamp?.run).toContain('.commit == $sha and .channel == "main"');
  const boot = image.steps.find((step) => step.name === "Prove fresh runtime boot");
  expect(boot?.run).toContain("http://127.0.0.1:18788/healthz");
  expect(boot?.run).toContain('.version.commit == $sha and .version.channel == "main"');
  const publish = image.steps.findIndex((step) => step.name === "Advertise the proven development image");
  expect(publish).toBeGreaterThan(image.steps.findIndex((step) => step.name === "Prove development identity"));
  expect(publish).toBeGreaterThan(image.steps.findIndex((step) => step.name === "Prove fresh runtime boot"));
  expect(image.steps[publish]?.run).toContain('"$IMAGE:development"');
  expect(image.steps[publish]?.run).not.toMatch(/:latest|:stable/u);
  expect(read(repoRoot, "scripts/ci/anonymous-image-pull.sh")).toContain("--src-no-creds --preserve-digests");
  expect(read(repoRoot, "scripts/ci/anonymous-image-pull.sh")).toContain("oci:/proof/image:published");
});

for (const [workflowName, cacheTag, publishName, proofName] of [
  ["release", "buildcache-release", "Push the versioned image", "Prove the image is this stable release"],
  ["development-image", "buildcache-development", "Push the immutable development image", "Prove fresh runtime boot"],
] as const) {
  test(`${workflowName} exports intermediate build cache without publishing an unverified runtime image`, ({ repoRoot }) => {
    const workflow = z
      .object({
        on: z.strictObject({ push: z.object({ branches: z.array(z.string()) }).optional(), ["workflow_dispatch"]: z.null().optional() }),
        jobs: z.object({
          image: z.object({
            permissions: z.object({ packages: z.literal("write") }),
            env: z.record(z.string(), z.string()),
            steps: z.array(
              z.object({
                name: z.string().optional(),
                uses: z.string().optional(),
                run: z.string().optional(),
                with: z.record(z.string(), z.json()).optional(),
              }),
            ),
          }),
        }),
      })
      .parse(parse(read(repoRoot, `.github/workflows/${workflowName}.yml`)));
    const { env, steps } = workflow.jobs.image;
    const buildIndex = steps.findIndex((step) => step.uses?.startsWith("docker/build-push-action@") === true);
    const loginIndex = steps.findIndex((step) => step.uses?.startsWith("docker/login-action@") === true);
    expect(buildIndex).toBeGreaterThan(-1);
    expect(loginIndex).toBeGreaterThan(-1);
    expect(loginIndex).toBeLessThan(buildIndex);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
    expect(steps[loginIndex]?.with).toEqual({ registry: "ghcr.io", username: "${{ github.actor }}", password: "${{ secrets.GITHUB_TOKEN }}" });
    const build = steps[buildIndex]?.with;
    const exportIndex = steps.findIndex((step) => step.with?.["outputs"] === "type=cacheonly");
    const cacheExport = steps[exportIndex]?.with;
    // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
    expect(build?.["cache-from"]).toBe("type=registry,ref=${{ env.BUILD_CACHE }}");
    expect(build?.["cache-to"]).toBeUndefined();
    // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
    expect(cacheExport?.["cache-to"]).toBe("type=registry,ref=${{ env.BUILD_CACHE }},mode=max,ignore-error=true");
    expect(env["BUILD_CACHE"]).toBe(`${env["IMAGE"]}:${cacheTag}`);
    expect(build?.["tags"]).not.toContain(env["BUILD_CACHE"]);
    expect(build?.["load"]).toBe(true);
    // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
    expect(build?.["builder"]).toBe("${{ steps.builder.outputs.name }}");
    expect(build?.["push"]).not.toBe(true);
    expect(cacheExport?.["load"]).not.toBe(true);
    expect(cacheExport?.["push"]).not.toBe(true);
    expect(steps[exportIndex]?.uses).toBe(steps[buildIndex]?.uses);
    for (const key of ["context", "target", "platforms", "build-args", "builder"]) {
      expect(cacheExport?.[key], key).toBe(build?.[key]);
    }
    const publishIndex = steps.findIndex((step) => step.name === publishName);
    const proofIndex = steps.findIndex((step) => step.name === proofName);
    expect(proofIndex).toBeGreaterThan(buildIndex);
    expect(exportIndex).toBeGreaterThan(proofIndex);
    expect(publishIndex).toBeGreaterThan(exportIndex);
    expect(publishIndex).toBeGreaterThan(proofIndex);
    expect(
      steps
        .slice(0, publishIndex)
        .map((step) => step.run ?? "")
        .join("\n"),
    ).not.toMatch(/\bdocker push\b/u);
  });
}

test("registry cache authentication does not move runtime publication ahead of the critical vulnerability gate", ({ repoRoot }) => {
  const { steps } = releaseWorkflow.parse(parse(read(repoRoot, ".github/workflows/release.yml"))).jobs.image;
  const buildIndex = steps.findIndex((step) => step.uses?.startsWith("docker/build-push-action@") === true);
  const scanIndex = steps.findIndex((step) => step.name === "Refuse critical fixable vulnerabilities");
  const publishIndex = steps.findIndex((step) => step.name === "Push the versioned image");
  const exportIndex = steps.findIndex((step) => step.with?.["outputs"] === "type=cacheonly");
  expect(scanIndex).toBeGreaterThan(buildIndex);
  expect(exportIndex).toBeGreaterThan(scanIndex);
  expect(publishIndex).toBeGreaterThan(exportIndex);
  expect(steps[scanIndex]?.with).toMatchObject({ severity: "CRITICAL", "ignore-unfixed": true, "exit-code": "1" });
});

test("stable publication rejects a wrong source stamp or OCI revision before scanning and publishing", async ({ repoRoot, fakeBin }) => {
  const image = workflowJobs(repoRoot, "release")["image"];
  const script = z.string().parse(image?.steps.find((step) => step.name === "Prove the image is this stable release")?.run);
  await fakeBin(
    "docker",
    `
    const args = process.argv.slice(2);
    if (args[0] === "run") console.log(JSON.stringify({ version: "0.1.3", channel: "stable", commit: process.env.STAMP_SHA }));
    else if (args[0] === "image" && args[1] === "inspect") console.log(process.env.LABEL_SHA);
    else process.exit(1);
  `,
  );
  const sha = "a".repeat(40);
  for (const [stamp, label, accepted] of [
    [sha, sha, true],
    ["b".repeat(40), sha, false],
    [sha, "b".repeat(40), false],
  ] as const) {
    const result = await spawnNiced("bash", ["-euo", "pipefail", "-c", script], {
      env: { ["IMAGE"]: "proof-image", ["VERSION"]: "0.1.3", ["SOURCE_SHA"]: sha, ["STAMP_SHA"]: stamp, ["LABEL_SHA"]: label },
    });
    expect(result.code === 0, `${stamp}/${label}: ${result.stderr}`).toBe(accepted);
  }
  // biome-ignore lint/suspicious/noTemplateCurlyInString: The fixture asserts literal template-source bytes, not interpolation in this test.
  expect(image?.env?.["SOURCE_SHA"]).toBe("${{ needs.release-please.outputs.sha }}");
  const steps = image?.steps ?? [];
  const proof = steps.findIndex((step) => step.name === "Prove the image is this stable release");
  for (const boundary of ["Refuse critical fixable vulnerabilities", "Export the verified build cache", "Push the versioned image"]) {
    expect(
      steps.findIndex((step) => step.name === boundary),
      boundary,
    ).toBeGreaterThan(proof);
  }
});

function developmentStep(repoRoot: string, name: string): string {
  const workflow = z
    .object({ jobs: z.object({ image: z.object({ steps: z.array(z.object({ name: z.string().optional(), run: z.string().optional() })) }) }) })
    .parse(parse(read(repoRoot, ".github/workflows/development-image.yml")));
  const script = workflow.jobs.image.steps.find((step) => step.name === name)?.run;
  if (script === undefined) {
    throw new Error(`Missing workflow step: ${name}`);
  }
  return name === "Prove anonymous digest pull"
    ? script.replace("bash scripts/ci/anonymous-image-pull.sh", `bash ${JSON.stringify(join(repoRoot, "scripts/ci/anonymous-image-pull.sh"))}`)
    : script;
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
    else if (args[0] === "run" && args.includes("--version")) console.log("skopeo version fixture");
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
    env: { ...publicationEnv(scratch), ["DIGEST"]: digest },
  });
  expect(result.code, result.stderr).toBe(0);
  expect(result.stdout).toContain('"downloadedLayers": 1');
  await writeFile(summary, "");
  const corrupt = await spawnNiced("bash", ["-euo", "pipefail", "-c", developmentStep(repoRoot, "Prove anonymous digest pull")], {
    env: { ...publicationEnv(scratch), ["DIGEST"]: digest, ...Object.fromEntries([["PUBLISH_PROOF_CORRUPT", "yes"]]) },
  });
  expect(corrupt.code).not.toBe(0);
  expect(readFileSync(summary, "utf8")).toBe("");
});
