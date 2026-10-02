import { readFileSync } from "node:fs";
import { chmod, copyFile, mkdir, rename, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { budget } from "@orb/tooling/_shared/load-budget";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { parse } from "yaml";
import { z } from "zod";
import { expect, test } from "../support/tool-fixtures.ts";

// Unneeded third-party downloads stay denied; the required media CLI is a bounded, checked exception.

const workspaceSchema = z.object({ allowBuilds: z.record(z.string(), z.boolean()) });

function allowBuilds(repoRoot: string): Readonly<Record<string, boolean>> {
  return workspaceSchema.parse(parse(readFileSync(join(repoRoot, "pnpm-workspace.yaml"), "utf8"))).allowBuilds;
}

test("install denies unneeded downloads while approving the required checked media CLI", ({ repoRoot }) => {
  const builds = allowBuilds(repoRoot);
  expect(builds["node-av"]).toBe(true);
  // onnxruntime-node's postinstall fetches the CUDA providers from api.nuget.org; the CPU binding ships in its tarball.
  expect(builds["onnxruntime-node"]).toBe(false);
  // cloudflared's postinstall fetches an unpinned binary; the relay controller downloads the pinned one.
  expect(builds["cloudflared"]).toBe(false);
});

test("the installed public CLI and its deployment copy execute, but missing or non-executable copies refuse without PATH fallback", async ({
  repoRoot,
  scratch,
  fakeBin,
}) => {
  const server = join(repoRoot, "packages/server");
  const resolver = createRequire(join(server, "package.json"));
  const entry = resolver.resolve("node-av/ffmpeg");
  const sourcePackage = resolve(dirname(entry), "../..");
  const copiedServer = join(scratch, "packages/server");
  const copiedPackage = join(scratch, "node_modules/node-av");
  const files = ["package.json", "src/entry/check-media.ts", "src/infra/media/runtime/index.ts"];
  for (const file of files) {
    const target = join(copiedServer, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(server, file), target);
  }
  for (const file of ["package.json", "dist/ffmpeg/index.js", "dist/ffmpeg/utils.js", "dist/ffmpeg/version.js", "dist/utils/electron.js"]) {
    const target = join(copiedPackage, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(sourcePackage, file), target);
  }
  const binaryName = process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg";
  const copiedBinary = join(copiedPackage, "binary", binaryName);
  await mkdir(dirname(copiedBinary), { recursive: true });
  await copyFile(join(sourcePackage, "binary", binaryName), copiedBinary);
  await fakeBin("ffmpeg", 'console.log("ffmpeg version fake-PATH");');
  const check = (): ReturnType<typeof runNicedSync> =>
    runNicedSync(process.execPath, [join(copiedServer, "src/entry/check-media.ts")], { cwd: scratch, timeout: budget(20_000), maxBuffer: 128 * 1024 });
  const healthy = check();
  expect(healthy.status).toBe(0);
  expect(healthy.stdout).toContain("media runtime: ffmpeg version 8.1");
  await rename(copiedBinary, `${copiedBinary}.held`);
  const missing = check();
  expect(missing.status).toBe(1);
  expect(missing.stderr).toContain("required packaged FFmpeg is not runnable");
  expect(missing.stdout).not.toContain("fake-PATH");
  await writeFile(copiedBinary, "not an executable", { mode: 0o600 });
  await chmod(copiedBinary, 0o600);
  const unusable = check();
  expect(unusable.status).toBe(1);
  expect(unusable.stderr).toContain("required packaged FFmpeg is not runnable");
  expect(unusable.stdout).not.toContain("fake-PATH");
});
