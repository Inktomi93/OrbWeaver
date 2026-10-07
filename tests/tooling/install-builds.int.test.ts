import { existsSync, readFileSync } from "node:fs";
import { chmod, copyFile, mkdir, readFile, rename, stat, symlink, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { budget } from "@orb/tooling/_shared/load-budget";
import { runNicedSync } from "@orb/tooling/_shared/proc";
import { strToU8, zipSync } from "fflate";
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

const PLATFORM_ASSETS = [
  ["darwin", "x64", "", "macos-x64-jellyfin"],
  ["darwin", "arm64", "", "macos-arm64-jellyfin"],
  ["linux", "x64", "", "linux-x64-jellyfin"],
  ["linux", "arm64", "", "linux-arm64-jellyfin"],
  ["win32", "x64", "", "win-x64"],
  ["win32", "arm64", "", "win-arm64"],
  ["win32", "x64", "mingw", "win-x64-jellyfin"],
  ["win32", "arm64", "mingw", "win-arm64-jellyfin"],
] as const;
const ARCHIVE_CONTENT = "packaged FFmpeg fixture";

async function stageInstaller(repoRoot: string, scratch: string): Promise<string> {
  const resolver = createRequire(join(repoRoot, "packages/server/package.json"));
  const sourcePackage = resolve(dirname(resolver.resolve("node-av/ffmpeg")), "../..");
  const copiedPackage = join(scratch, "node_modules/node-av");
  for (const file of [
    "package.json",
    "dist/ffmpeg/install.js",
    "dist/ffmpeg/index.js",
    "dist/ffmpeg/utils.js",
    "dist/ffmpeg/version.js",
    "dist/utils/electron.js",
  ]) {
    const target = join(copiedPackage, file);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(sourcePackage, file), target);
  }
  const packageResolver = createRequire(join(sourcePackage, "package.json"));
  await mkdir(join(copiedPackage, "node_modules"), { recursive: true });
  await symlink(dirname(packageResolver.resolve("unzipper/package.json")), join(copiedPackage, "node_modules/unzipper"), "junction");
  return copiedPackage;
}

async function stageDownload(scratch: string, url: string, status = 200, corrupt = false): Promise<string> {
  await writeFile(join(scratch, "download.zip"), corrupt ? strToU8("not a ZIP") : zipSync({ ffmpeg: strToU8(ARCHIVE_CONTENT) }));
  const preload = join(scratch, "fetch.mjs");
  // Only the external fetch is replaced: the installed selection, download, extraction and chmod run unchanged.
  await writeFile(
    preload,
    `import { appendFileSync, readFileSync } from "node:fs";
globalThis.fetch = async (url, init) => {
  appendFileSync(${JSON.stringify(join(scratch, "requests.jsonl"))}, JSON.stringify({ url, init }) + "\\n");
  if (url !== ${JSON.stringify(url)}) return new Response(null, { status: 403 });
  return new Response(${status === 200 ? `readFileSync(${JSON.stringify(join(scratch, "download.zip"))})` : "null"}, { status: ${status} });
};
`,
  );
  return preload;
}

for (const [platform, arch, libc, asset] of PLATFORM_ASSETS) {
  test(`the installed installer downloads and extracts ${asset} without release metadata or credentials`, async ({ repoRoot, scratch }) => {
    const copiedPackage = await stageInstaller(repoRoot, scratch);
    const downloadUrl = `https://github.com/seydx/node-av/releases/download/v6.1.1/ffmpeg-v8.1-${asset}.zip`;
    const preload = await stageDownload(scratch, downloadUrl);
    const installed = runNicedSync(process.execPath, ["--import", preload, join(copiedPackage, "dist/ffmpeg/install.js")], {
      cwd: scratch,
      env: Object.fromEntries([
        ["CI", "true"],
        ["npm_config_os", platform],
        ["npm_config_cpu", arch],
        ["npm_config_libc", libc],
      ]),
      timeout: budget(20_000),
      maxBuffer: 128 * 1024,
    });
    expect(installed.status).toBe(0);
    expect(installed.stdout).toContain("Done!");
    expect(await readFile(join(scratch, "requests.jsonl"), "utf8")).toBe(`${JSON.stringify({ url: downloadUrl })}\n`);
    const executable = join(copiedPackage, "binary", platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
    expect(await readFile(executable, "utf8")).toBe(ARCHIVE_CONTENT);
    expect(existsSync(join(copiedPackage, "binary", `ffmpeg-v8.1-${asset}.zip`))).toBe(false);
    const mode = (await stat(executable)).mode % 0o1000;
    expect(process.platform === "win32" || platform === "win32" || mode === 0o755).toBe(true);
  });
}

for (const [status, corrupt] of [
  [403, false],
  [404, false],
  [200, true],
] as const) {
  test(`a failed asset download or extraction still refuses the required media check (${status}/${corrupt})`, async ({ repoRoot, scratch }) => {
    const copiedPackage = await stageInstaller(repoRoot, scratch);
    const downloadUrl = "https://github.com/seydx/node-av/releases/download/v6.1.1/ffmpeg-v8.1-linux-x64-jellyfin.zip";
    const preload = await stageDownload(scratch, downloadUrl, status, corrupt);
    const installed = runNicedSync(process.execPath, ["--import", preload, join(copiedPackage, "dist/ffmpeg/install.js")], {
      cwd: scratch,
      env: Object.fromEntries([
        ["CI", "true"],
        ["npm_config_os", "linux"],
        ["npm_config_cpu", "x64"],
      ]),
      timeout: budget(20_000),
      maxBuffer: 128 * 1024,
    });
    expect(installed.stderr).toContain(corrupt ? "Failed to extract ZIP" : `HTTP error! status: ${status}`);
    expect(await readFile(join(scratch, "requests.jsonl"), "utf8")).toBe(`${JSON.stringify({ url: downloadUrl })}\n`);
    for (const file of ["package.json", "src/entry/check-media.ts", "src/infra/media/runtime/index.ts"]) {
      const target = join(scratch, "packages/server", file);
      await mkdir(dirname(target), { recursive: true });
      await copyFile(join(repoRoot, "packages/server", file), target);
    }
    const checked = runNicedSync(process.execPath, [join(scratch, "packages/server/src/entry/check-media.ts")], {
      cwd: scratch,
      env: {},
      timeout: budget(20_000),
      maxBuffer: 128 * 1024,
    });
    expect(checked.status).toBe(1);
    expect(checked.stderr).toContain("required packaged FFmpeg is not runnable");
  });
}

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
