import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { parseBundle } from "@orb/server/domain/plugin";
import { budget } from "@orb/tooling/_shared/load-budget";
import { spawnNiced } from "@orb/tooling/_shared/proc";
import { expect, test } from "../support/tool-fixtures.ts";

test("the public SDK and toolchain tarballs compile in a clean project with no workspace paths", { timeout: budget(90_000) }, async ({ repoRoot, scratch }) => {
  const release = await spawnNiced(process.execPath, [join(repoRoot, "scripts", "release-plugin-authoring.ts"), scratch], { cwd: repoRoot });
  expect(release.code, release.stderr).toBe(0);

  const { version } = JSON.parse(await readFile(join(repoRoot, "packages", "plugin-sdk", "package.json"), "utf8")) as { version: string };
  const sdkTarball = join(scratch, `orb-plugin-sdk-${version}.tgz`);
  const toolchainTarball = join(scratch, `orb-plugin-toolchain-${version}.tgz`);
  await writeFile(join(scratch, "package.json"), JSON.stringify({ name: "plugin-clean-room", private: true, type: "module" }));
  const installed = await spawnNiced("npm", ["install", "--ignore-scripts", "--no-audit", "--no-fund", "--no-package-lock", sdkTarball, toolchainTarball], {
    cwd: scratch,
  });
  expect(installed.code, installed.stderr).toBe(0);

  const installedManifest = JSON.parse(await readFile(join(scratch, "node_modules", "@orb", "plugin-sdk", "package.json"), "utf8")) as {
    dependencies?: Readonly<Record<string, string>>;
  };
  expect(installedManifest.dependencies).toBeUndefined();
  const installedToolchainManifest = JSON.parse(await readFile(join(scratch, "node_modules", "@orb", "plugin-toolchain", "package.json"), "utf8")) as {
    dependencies?: Readonly<Record<string, string>>;
  };
  expect(installedToolchainManifest.dependencies?.["typescript"]).toMatch(/^\^?6\./);
  expect(installedToolchainManifest).not.toHaveProperty("peerDependencies");
  expect(JSON.stringify(installedToolchainManifest)).not.toMatch(/workspace:|catalog:/);

  const sourceDirectory = join(scratch, "src");
  await mkdir(sourceDirectory);
  await writeFile(join(sourceDirectory, "main.ts"), "const host = orb.host(1);\nhost.log.info(String(host.version));\n");
  await writeFile(
    join(scratch, "manifest.json"),
    JSON.stringify({
      id: "clean-room",
      name: "Clean room",
      version: "1.0.0",
      hostVersion: 1,
      entry: "main.js",
      description: "Clean-room packed plugin",
      capabilities: [],
    }),
  );
  await writeFile(
    join(scratch, "tsconfig.json"),
    JSON.stringify({
      compilerOptions: {
        lib: ["ES2023"],
        module: "ESNext",
        moduleDetection: "force",
        noEmit: true,
        strict: true,
        target: "ES2023",
        types: ["@orb/plugin-sdk/main"],
      },
      files: ["src/main.ts"],
    }),
  );
  const checked = await spawnNiced(process.execPath, [join(scratch, "node_modules", "typescript", "bin", "tsc"), "-p", "tsconfig.json"], {
    cwd: scratch,
  });
  expect(checked.code, checked.stderr).toBe(0);

  const built = await spawnNiced(join(scratch, "node_modules", ".bin", "orb-plugin"), ["build", ".", "--source-dir", "src", "--out-dir", "."], {
    cwd: scratch,
  });
  expect(built.code, built.stderr).toBe(0);
  expect(await readFile(join(scratch, "main.js"), "utf8")).toBe('"use strict";\nconst host = orb.host(1);\nhost.log.info(String(host.version));\n');

  await writeFile(join(scratch, "main.js"), "stale\n");
  const stale = await spawnNiced(join(scratch, "node_modules", ".bin", "orb-plugin"), ["check", ".", "--source-dir", "src", "--out-dir", "."], {
    cwd: scratch,
  });
  expect(stale.code).toBe(1);
  expect(stale.stderr).toContain("stale plugin artifacts");

  const rebuilt = await spawnNiced(join(scratch, "node_modules", ".bin", "orb-plugin"), ["build", ".", "--source-dir", "src", "--out-dir", "."], {
    cwd: scratch,
  });
  expect(rebuilt.code, rebuilt.stderr).toBe(0);
  await writeFile(join(sourceDirectory, "ui.ts"), "orb.ui(1).render('home', { kind: 'text', value: 'ready' });\n");
  const withUi = await spawnNiced(join(scratch, "node_modules", ".bin", "orb-plugin"), ["build", ".", "--source-dir", "src", "--out-dir", "."], {
    cwd: scratch,
  });
  expect(withUi.code, withUi.stderr).toBe(0);
  await rm(join(sourceDirectory, "ui.ts"));
  const obsoleteUi = await spawnNiced(join(scratch, "node_modules", ".bin", "orb-plugin"), ["check", ".", "--source-dir", "src", "--out-dir", "."], {
    cwd: scratch,
  });
  expect(obsoleteUi.code).toBe(1);
  expect(obsoleteUi.stderr).toContain("ui.js");

  const bundleDirectory = join(scratch, "release");
  await mkdir(bundleDirectory);
  const bundlePath = join(bundleDirectory, "clean-room.zip");
  const packed = await spawnNiced(join(scratch, "node_modules", ".bin", "orb-plugin"), ["pack", ".", "--source-dir", "src", "--out", bundlePath], {
    cwd: scratch,
  });
  expect(packed.code, packed.stderr).toBe(0);
  expect(parseBundle(new Uint8Array(await readFile(bundlePath))).manifest.id).toBe("clean-room");
});
