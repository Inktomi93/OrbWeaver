// Build the two GitHub Release assets for the public author surface. The release tag is
// plugin-authoring-v0.1.0 and the resulting tarballs are attached unchanged; no npm registry is involved.

import { createHash } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, rename, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { pnpmInvocation } from "@orb/tooling/_shared/platform";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { inheritedProcessEnv } from "@orb/tooling/_shared/process-env";

const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const ASSETS = [
  { directory: "packages/plugin-sdk", filename: "orb-plugin-sdk-0.1.0.tgz" },
  { directory: "packages/plugin-toolchain", filename: "orb-plugin-toolchain-0.1.0.tgz" },
] as const;

interface PackageManifest {
  readonly name: string;
  readonly version: string;
  readonly description: string;
  readonly license: string;
  readonly engines: Readonly<Record<string, string>>;
  readonly dependencies: Readonly<Record<string, string>>;
  readonly sideEffects: boolean;
}

async function runPnpm(args: readonly string[], cwd: string): Promise<Awaited<ReturnType<typeof spawnNiced>>> {
  const invocation = pnpmInvocation({ ambient: inheritedProcessEnv(), platform: process.platform, nodePath: process.execPath, args });
  if (invocation.kind === "refused") {
    throw new Error(invocation.reason);
  }
  return await spawnNiced(invocation.command, invocation.args, { cwd });
}

async function pack(directory: string, outputDirectory: string): Promise<void> {
  const result = await runPnpm(["--config.verify-deps-before-run=false", "pack", "--pack-destination", outputDirectory], resolve(REPO_ROOT, directory));
  if (result.code !== 0) {
    throw new Error(`pnpm pack failed for ${directory}: ${result.stderr.trim()}`);
  }
}

async function stagedToolchain(root: string): Promise<string> {
  const source = join(REPO_ROOT, "packages", "plugin-toolchain");
  const built = await runPnpm(["--config.verify-deps-before-run=false", "build:package"], source);
  if (built.code !== 0) {
    throw new Error(`toolchain package build failed: ${built.stderr.trim()}`);
  }
  const stage = join(root, "plugin-toolchain");
  await mkdir(stage, { recursive: true });
  await cp(join(source, "dist"), join(stage, "dist"), { recursive: true });
  await cp(join(source, "README.md"), join(stage, "README.md"));
  await cp(join(REPO_ROOT, "LICENSE"), join(stage, "LICENSE"));
  const sourceManifest = JSON.parse(await readFile(join(source, "package.json"), "utf8")) as PackageManifest;
  await writeFile(
    join(stage, "package.json"),
    `${JSON.stringify(
      {
        name: sourceManifest.name,
        version: sourceManifest.version,
        private: true,
        description: sourceManifest.description,
        license: sourceManifest.license,
        type: "module",
        engines: sourceManifest.engines,
        files: ["dist"],
        bin: { "orb-plugin": "./dist/cli.js" },
        exports: { ".": "./dist/index.js" },
        dependencies: sourceManifest.dependencies,
        sideEffects: sourceManifest.sideEffects,
      },
      null,
      2,
    )}\n`,
  );
  return stage;
}

async function writeAtomically(path: string, bytes: Uint8Array): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.tmp-${process.pid}`;
  try {
    await writeFile(temporary, bytes);
    await rename(temporary, path);
  } finally {
    await rm(temporary, { force: true });
  }
}

const output = resolve(process.argv[2] ?? join(REPO_ROOT, "dist", "plugin-authoring"));
const first = await mkdtemp(join(tmpdir(), "orb-plugin-author-release-a-"));
const second = await mkdtemp(join(tmpdir(), "orb-plugin-author-release-b-"));
const staging = await mkdtemp(join(tmpdir(), "orb-plugin-author-release-stage-"));
try {
  const toolchain = await stagedToolchain(staging);
  for (const asset of ASSETS) {
    const directory = asset.directory === "packages/plugin-toolchain" ? toolchain : join(REPO_ROOT, asset.directory);
    await pack(directory, first);
    await pack(directory, second);
    const firstBytes = await readFile(join(first, asset.filename));
    const secondBytes = await readFile(join(second, asset.filename));
    if (!firstBytes.equals(secondBytes)) {
      throw new Error(`${asset.filename} is not deterministic across two clean packs`);
    }
    await writeAtomically(join(output, asset.filename), firstBytes);
    const digest = createHash("sha256").update(firstBytes).digest("hex");
    process.stdout.write(`${asset.filename} sha256=${digest}\n`);
  }
} finally {
  await Promise.all([rm(first, { recursive: true, force: true }), rm(second, { recursive: true, force: true }), rm(staging, { recursive: true, force: true })]);
}
