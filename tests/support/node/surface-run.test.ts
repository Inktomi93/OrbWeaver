import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { configureFixtureGitIdentity, execFixtureGit } from "@orb/tooling/floor/git/git-fixture";
import { expect, test } from "./fixtures.ts";
import {
  readSurfaceCaseAdmission,
  readSurfaceOutputRoot,
  readSurfaceRunConfig,
  SURFACE_CLIENT_BUILD_MODE,
  surfaceArtifactModes,
  surfaceCaseDelayMs,
  surfaceClientBuildEnvironment,
  surfaceClientBuildKey,
  surfaceNativeTimeout,
  writeSurfaceCaseAdmission,
} from "./surface-run.ts";

for (const flag of ["CI", "GITHUB_ACTIONS"] as const) {
  test(`direct native configuration refuses ${flag} before reading paths or private config`, async () => {
    const environment = { [flag]: "1", ["ORB_SURFACE_OUTPUT_ROOT"]: "/not-an-admitted-run", ["ORB_SURFACE_RUN_CONFIG"]: "/private-owner-config" };
    await expect(readSurfaceOutputRoot(environment)).rejects.toThrow("local-only");
    await expect(readSurfaceRunConfig(environment)).rejects.toThrow("local-only");
  });
}

for (const option of ["trace", "screenshot", "video"] as const) {
  test(`resolved native ${option} recording cannot masquerade as measurement`, () => {
    expect(() => surfaceArtifactModes({ pass: "measurement", trace: "off", screenshot: "off", video: "off", [option]: "on" })).toThrow(
      "Measurement refuses resolved native",
    );
  });
}

test("measurement accepts native object-shaped off options and evidence retains enabled recording", () => {
  expect(surfaceArtifactModes({ pass: "measurement", trace: { mode: "off", snapshots: true }, screenshot: { mode: "off" }, video: { mode: "off" } })).toEqual({
    pass: "measurement",
    trace: "off",
    screenshot: "off",
    video: "off",
  });
  expect(surfaceArtifactModes({ pass: "evidence", trace: "on", screenshot: "only-on-failure", video: "on" })).toEqual({
    pass: "evidence",
    trace: "on",
    screenshot: "only-on-failure",
    video: "on",
  });
});

test("explicit native execution deadlines govern the outer owner without replacing the selected budget", () => {
  expect(surfaceNativeTimeout(["--global-timeout=3600000"], 100)).toBe(3_600_000);
  expect(surfaceNativeTimeout(["--global-timeout", "3600000"], 100)).toBe(3_600_000);
  expect(surfaceNativeTimeout(["--project=desktop"], 100)).toBe(100);
  for (const args of [["--global-timeout=0"], ["--global-timeout"], ["--global-timeout=10", "--global-timeout=20"]]) {
    expect(() => surfaceNativeTimeout(args, 100)).toThrow("one positive integer native --global-timeout");
  }
});

test("independent native cases wait only for the preceding completion window", () => {
  expect(surfaceCaseDelayMs(null, 245, 100)).toBe(0);
  expect(surfaceCaseDelayMs(210, 245, 100)).toBe(55);
  expect(surfaceCaseDelayMs(299, 299, 100)).toBe(1);
  expect(surfaceCaseDelayMs(299, 300, 100)).toBe(0);
  expect(surfaceCaseDelayMs(210, 450, 100)).toBe(0);
  expect(surfaceCaseDelayMs(20, 25, 30)).toBe(5);
});

test("persisted reporter admissions distinguish the next case from the preceding completion", ({ importStagingDir }) => {
  expect(readSurfaceCaseAdmission(importStagingDir)).toBeNull();
  writeSurfaceCaseAdmission(importStagingDir, "failed-case", null);
  expect(readSurfaceCaseAdmission(importStagingDir)).toEqual({ testId: "failed-case", completedAt: null });
  writeSurfaceCaseAdmission(importStagingDir, "failed-case", 210);
  expect(readSurfaceCaseAdmission(importStagingDir)?.testId).not.toBe("next-case");
  writeSurfaceCaseAdmission(importStagingDir, "next-case", 210);
  const admission = readSurfaceCaseAdmission(importStagingDir);
  expect(admission).toEqual({ testId: "next-case", completedAt: 210 });
  expect(surfaceCaseDelayMs(admission?.completedAt ?? null, 245, 100)).toBe(55);
});

test("a client build is current exactly while its build inputs are unchanged", ({ importStagingDir: root }) => {
  execFixtureGit(root, ["init", "--quiet"]);
  configureFixtureGitIdentity(root);
  mkdirSync(join(root, "packages", "client"), { recursive: true });
  mkdirSync(join(root, "tests", "e2e"), { recursive: true });
  writeFileSync(join(root, "packages", "client", "app.ts"), "export const label = 1;\n");
  writeFileSync(join(root, "tests", "e2e", "walk.spec.ts"), "export {};\n");
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["commit", "--quiet", "-m", "fixture"]);
  const built = surfaceClientBuildKey(root);
  writeFileSync(join(root, "tests", "e2e", "walk.spec.ts"), "export const driver = 2;\n");
  expect(surfaceClientBuildKey(root), "a journey edit reuses the build").toBe(built);
  writeFileSync(join(root, "packages", "client", "app.ts"), "export const label = 2;\n");
  const edited = surfaceClientBuildKey(root);
  expect(edited, "an unstaged source edit makes the build stale").not.toBe(built);
  execFixtureGit(root, ["add", "-A"]);
  expect(surfaceClientBuildKey(root), "staging the same bytes keeps the same build current").toBe(edited);
  writeFileSync(join(root, "packages", "client", "new.ts"), "export {};\n");
  const added = surfaceClientBuildKey(root);
  expect(added, "an untracked source file makes the build stale").not.toBe(edited);
  rmSync(join(root, "packages", "client", "app.ts"));
  expect(surfaceClientBuildKey(root), "a deleted source file makes the build stale").not.toBe(added);
});

test("a client build cannot be reused across a different Vite environment", ({ importStagingDir: root }) => {
  execFixtureGit(root, ["init", "--quiet"]);
  configureFixtureGitIdentity(root);
  mkdirSync(join(root, "packages", "client"), { recursive: true });
  writeFileSync(join(root, ".gitignore"), ".env*\n");
  writeFileSync(join(root, "packages", "client", "app.ts"), "export const label = 1;\n");
  execFixtureGit(root, ["add", "-A"]);
  execFixtureGit(root, ["commit", "--quiet", "-m", "fixture"]);
  const ambient = { ["PATH"]: "/usr/bin" };
  const built = surfaceClientBuildKey(root, ambient);
  writeFileSync(join(root, "packages", "client", ".env.local"), "VITE_AGENT_BRIDGE=on\n");
  const ignoredFile = surfaceClientBuildKey(root, ambient);
  expect(ignoredFile, "a git-ignored Vite env file makes the build stale").not.toBe(built);
  expect(surfaceClientBuildKey(root, { ...ambient, ["VITE_AGENT_BRIDGE"]: "on" }), "a client-exposed variable makes the build stale").not.toBe(ignoredFile);
  const development = { ...ambient, ["NODE_ENV"]: "development" };
  expect(surfaceClientBuildKey(root, development), "the ambient NODE_ENV never reaches the build").toBe(ignoredFile);
  expect(surfaceClientBuildEnvironment({}, development)["NODE_ENV"]).toBe(SURFACE_CLIENT_BUILD_MODE);
});
