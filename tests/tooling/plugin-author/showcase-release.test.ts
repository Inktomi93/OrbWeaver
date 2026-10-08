import { createHash } from "node:crypto";
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";
import type { PluginAuthorProject } from "@orb/plugin-toolchain";
import { compilePluginDirectory } from "@orb/plugin-toolchain";
import { SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { execGit } from "@orb/tooling/_shared/git";
import { compileShowcasePlugins, renderShowcaseReleaseReceipt, showcaseReleaseReceipt, staleShowcaseArtifacts } from "@orb/tooling/plugin-author-showcase";
import { resolveCiQualification, showcaseVersionViolations } from "@orb/tooling/verify";
import { zipSync } from "fflate";
import { vi } from "vitest";
import { VERIFY_BASE_ENV, VERIFY_HEAD_ENV } from "../../../tooling/src/verify/contract/selection.ts";
import {
  baseReceipt,
  candidateShowcaseCompilerInputs,
  candidateShowcaseInputDrift,
  candidateShowcaseManifest,
  removedShowcaseSlugs,
  runShowcaseRelease,
  showcaseReceiptMatchesCandidate,
  showcaseReceiptTracked,
  trackedBaseReceipt,
} from "../../../tooling/src/verify/ops/showcase-release.ts";
import { expect, test } from "../../support/tool-fixtures.ts";
import { scaledBudget } from "../_load-budget.ts";

function plantCompilerProject(root: string, main: string): PluginAuthorProject {
  const pluginDirectory = join(root, "packages", "showcase-plugins", "bundles", "oracle-deck");
  const sdkDirectory = join(root, "packages", "plugin-sdk");
  mkdirSync(pluginDirectory, { recursive: true });
  mkdirSync(sdkDirectory, { recursive: true });
  writeFileSync(join(pluginDirectory, "main.ts"), main);
  writeFileSync(join(pluginDirectory, "manifest.json"), '{"version":"1.0.0"}\n');
  writeFileSync(join(sdkDirectory, "main.d.ts"), "");
  execGit(root, ["init", "-q", "-b", "main"]);
  return { pluginDirectory, sdkDirectory };
}

test("release refuses a worktree-only reference even when candidate manifest and emitted receipt match", { timeout: scaledBudget(90_000) }, async ({
  scratch,
}) => {
  const root = join(scratch, "referenced-candidate-release");
  const project = plantCompilerProject(root, '/// <reference path="./extra.d.ts" />\nconst value: Extra = 1;\n');
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    if (slug !== "oracle-deck") {
      const directory = join(root, "packages", "showcase-plugins", "bundles", slug);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "main.ts"), "const value = 1;\n");
      writeFileSync(join(directory, "manifest.json"), '{"version":"1.0.0"}\n');
    }
  }
  execGit(root, ["add", "--all"]);
  writeFileSync(join(project.pluginDirectory, "extra.d.ts"), "type Extra = number;\n");
  const compiled = await compileShowcasePlugins(root);
  expect(compiled.diagnostics).toEqual([]);
  expect(compiled.bundles.map(({ slug }) => slug)).toEqual(SHOWCASE_PLUGIN_SLUGS);
  const receipt = renderShowcaseReleaseReceipt(showcaseReleaseReceipt(compiled.bundles));
  const receiptPath = "packages/showcase-plugins/release-entries.json";
  writeFileSync(join(root, receiptPath), receipt);
  execGit(root, ["add", "--", receiptPath]);
  execGit(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "candidate baseline"]);
  expect(showcaseReceiptMatchesCandidate(root, receipt)).toBe(true);
  const stderr = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
  const stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true);
  try {
    expect(await runShowcaseRelease(root)).toBe(EXIT.violations);
    expect(stderr.mock.calls.map(([message]) => String(message)).join("")).toContain("packages/showcase-plugins/bundles/oracle-deck/extra.d.ts");
    execGit(root, ["add", "--", "packages/showcase-plugins/bundles/oracle-deck/extra.d.ts"]);
    expect(await runShowcaseRelease(root), "the same build passes when its complete input is staged").toBe(EXIT.clean);
  } finally {
    stderr.mockRestore();
    stdout.mockRestore();
  }
});

test("compiler parity follows transitive declarations and type imports beyond bundle filenames", { timeout: scaledBudget(60_000) }, async ({ scratch }) => {
  const root = join(scratch, "transitive-compiler-inputs");
  const project = plantCompilerProject(root, '/// <reference path="./extra.d.ts" />\nconst value: Extra = 1;\n');
  const importedPath = "types/value.d.ts";
  mkdirSync(join(root, "types"));
  writeFileSync(join(project.pluginDirectory, "extra.d.ts"), 'type Extra = import("../../../../types/value").Value;\n');
  writeFileSync(join(root, importedPath), "export type Value = number;\n");
  writeFileSync(join(root, ".gitignore"), "ignored.d.ts\n");
  execGit(root, ["add", "--all"]);
  const clean = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: clean.observer })).diagnostics).toEqual([]);
  expect(clean.drift()).toEqual([]);

  writeFileSync(join(root, importedPath), '/// <reference path="./ignored.d.ts" />\nexport type Value = number;\n');
  writeFileSync(join(root, "types", "ignored.d.ts"), "type Ignored = number;\n");
  const modified = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: modified.observer })).diagnostics).toEqual([]);
  expect(modified.drift()).toEqual(["types/ignored.d.ts", importedPath]);
  execGit(root, ["add", "--force", "--", importedPath, "types/ignored.d.ts"]);
  const staged = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: staged.observer })).diagnostics).toEqual([]);
  expect(staged.drift()).toEqual([]);

  execGit(root, ["rm", "--cached", "--force", "--", importedPath]);
  const deleted = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: deleted.observer })).diagnostics).toEqual([]);
  expect(deleted.drift()).toEqual([importedPath]);
});

test("candidate-only module targets and missing directories cannot hide behind worktree resolution", { timeout: scaledBudget(60_000) }, async ({ scratch }) => {
  const root = join(scratch, "missing-resolution-probes");
  const project = plantCompilerProject(root, 'const value: import("./value").Value = 1;\n');
  const shadowPath = "packages/showcase-plugins/bundles/oracle-deck/value.ts";
  writeFileSync(join(project.pluginDirectory, "value.d.ts"), "export type Value = number;\n");
  writeFileSync(join(root, shadowPath), "export type Value = string;\n");
  execGit(root, ["add", "--all"]);
  rmSync(join(root, shadowPath));
  const missingFile = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: missingFile.observer })).diagnostics).toEqual([]);
  expect(missingFile.drift()).toEqual([shadowPath]);
  execGit(root, ["add", "--", shadowPath]);
  const clean = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: clean.observer })).diagnostics).toEqual([]);
  expect(clean.drift()).toEqual([]);

  writeFileSync(join(project.pluginDirectory, "main.ts"), '/// <reference types="value" />\nconst value: Value = 1;\n');
  const fallback = join(root, "node_modules", "@types", "value");
  const nearer = join(project.pluginDirectory, "node_modules", "@types", "value");
  mkdirSync(fallback, { recursive: true });
  mkdirSync(nearer, { recursive: true });
  writeFileSync(join(fallback, "index.d.ts"), "type Value = number;\n");
  writeFileSync(join(nearer, "index.d.ts"), "type Value = string;\n");
  execGit(root, ["add", "--all"]);
  rmSync(join(project.pluginDirectory, "node_modules"), { recursive: true });
  const missingDirectory = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: missingDirectory.observer })).diagnostics).toEqual([]);
  expect(missingDirectory.drift().some((path) => path.startsWith("packages/showcase-plugins/bundles/oracle-deck/node_modules"))).toBe(true);
});

test("UI and frame compiler references remain candidate-bound", { timeout: scaledBudget(60_000) }, async ({ scratch }) => {
  const root = join(scratch, "realm-compiler-inputs");
  const project = plantCompilerProject(root, "const frame = `/* @orb-frame-script */`;\n");
  writeFileSync(join(project.sdkDirectory, "ui.d.ts"), "");
  writeFileSync(join(project.sdkDirectory, "frame.d.ts"), "");
  writeFileSync(join(project.pluginDirectory, "ui.ts"), '/// <reference path="./ui-extra.d.ts" />\nconst value: UiValue = 1;\n');
  writeFileSync(join(project.pluginDirectory, "frame.ts"), '/// <reference path="./frame-extra.d.ts" />\nconst value: FrameValue = 1;\n');
  execGit(root, ["add", "--all"]);
  writeFileSync(join(project.pluginDirectory, "ui-extra.d.ts"), "type UiValue = number;\n");
  writeFileSync(join(project.pluginDirectory, "frame-extra.d.ts"), "type FrameValue = number;\n");
  const untracked = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: untracked.observer })).diagnostics).toEqual([]);
  expect(untracked.drift()).toEqual([
    "packages/showcase-plugins/bundles/oracle-deck/frame-extra.d.ts",
    "packages/showcase-plugins/bundles/oracle-deck/ui-extra.d.ts",
  ]);
  execGit(root, ["add", "--all"]);
  const staged = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: staged.observer })).diagnostics).toEqual([]);
  expect(staged.drift()).toEqual([]);
});

test("type-package metadata and installed declarations need candidate evidence", { timeout: scaledBudget(60_000) }, async ({ scratch }) => {
  const root = join(scratch, "type-package-inputs");
  const project = plantCompilerProject(root, '/// <reference types="value" />\nconst value: Value = 1;\n');
  const directory = join(root, "node_modules", "@types", "value");
  const metadata = "node_modules/@types/value/package.json";
  const declaration = "node_modules/@types/value/other.d.ts";
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(root, metadata), '{"types":"ambient.d.ts"}\n');
  writeFileSync(join(directory, "ambient.d.ts"), "type Value = number;\n");
  writeFileSync(join(root, declaration), "type Value = number;\n");
  execGit(root, ["add", "--all"]);
  const clean = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: clean.observer })).diagnostics).toEqual([]);
  expect(clean.drift()).toEqual([]);
  writeFileSync(join(root, metadata), '{"types":"other.d.ts"}\n');
  const modified = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: modified.observer })).diagnostics).toEqual([]);
  expect(modified.drift()).toEqual([metadata]);
  execGit(root, ["add", "--", metadata]);
  execGit(root, ["rm", "--cached", "--force", "--", declaration]);
  const untracked = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: untracked.observer })).diagnostics).toEqual([]);
  expect(untracked.drift()).toEqual([declaration]);
});

test("compiler reads use the alternate candidate index and reject external declarations", { timeout: scaledBudget(60_000) }, async ({ scratch }) => {
  const root = join(scratch, "alternate-compiler-inputs");
  const project = plantCompilerProject(root, '/// <reference path="./extra.d.ts" />\nconst value: Extra = 1;\n');
  const relativeExtra = "packages/showcase-plugins/bundles/oracle-deck/extra.d.ts";
  writeFileSync(join(root, relativeExtra), "type Extra = number;\n");
  execGit(root, ["add", "--all"]);
  const candidateIndex = join(scratch, "compiler-inputs.index");
  copyFileSync(join(root, ".git", "index"), candidateIndex);
  writeFileSync(join(root, relativeExtra), "type Extra = 1 | 2;\n");
  execGit(root, ["add", "--", relativeExtra]);
  vi.stubEnv("GIT_INDEX_FILE", candidateIndex);
  try {
    const isolated = candidateShowcaseCompilerInputs(root);
    expect((await compilePluginDirectory({ ...project, compilerObserver: isolated.observer })).diagnostics).toEqual([]);
    expect(isolated.drift(), "a planted root ignores the caller's unrelated index").toEqual([]);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
    try {
      const alternate = candidateShowcaseCompilerInputs(root);
      expect((await compilePluginDirectory({ ...project, compilerObserver: alternate.observer })).diagnostics).toEqual([]);
      expect(alternate.drift()).toEqual([relativeExtra]);
    } finally {
      cwd.mockRestore();
    }
  } finally {
    vi.unstubAllEnvs();
  }
  writeFileSync(join(scratch, "outside.d.ts"), "type Extra = number;\n");
  writeFileSync(join(root, relativeExtra), '/// <reference path="../../../../../outside.d.ts" />\n');
  execGit(root, ["add", "--", relativeExtra]);
  const external = candidateShowcaseCompilerInputs(root);
  expect((await compilePluginDirectory({ ...project, compilerObserver: external.observer })).diagnostics).toEqual([]);
  expect(external.drift()).toEqual(["../outside.d.ts"]);
});

test("entry receipt hashes admitted bytes, not zip metadata", () => {
  const main = new TextEncoder().encode("export const answer = 42;\n");
  const manifest = new TextEncoder().encode('{"version":"1.2.3"}\n');
  const first = zipSync({ "manifest.json": [manifest, { mtime: 331_257_600_000 }], "main.js": [main, { mtime: 331_257_600_000 }] });
  const second = zipSync({ "manifest.json": [manifest, { mtime: 347_155_200_000 }], "main.js": [main, { mtime: 347_155_200_000 }] });
  const expected = {
    format: 1,
    bundles: {
      "oracle-deck": {
        "main.js": createHash("sha256").update(main).digest("hex"),
        "manifest.json": createHash("sha256").update(manifest).digest("hex"),
      },
    },
  };
  expect(showcaseReleaseReceipt([{ slug: "oracle-deck", bytes: first }])).toEqual(expected);
  expect(showcaseReleaseReceipt([{ slug: "oracle-deck", bytes: second }])).toEqual(expected);
});

test("an absent or mismatched release receipt is stale, while an unreadable receipt is a tool failure", async ({ scratch }) => {
  const root = join(scratch, "stale-receipt");
  const receiptPath = join(root, "packages", "showcase-plugins", "release-entries.json");
  const compiled = { bundles: [], diagnostics: [], artifacts: [], obsoleteOutputPaths: [] };
  expect(await staleShowcaseArtifacts(root, join(root, "output"), compiled)).toEqual([receiptPath]);
  mkdirSync(join(root, "packages", "showcase-plugins"), { recursive: true });
  writeFileSync(receiptPath, "stale\n");
  expect(await staleShowcaseArtifacts(root, join(root, "output"), compiled)).toEqual([receiptPath]);
  writeFileSync(receiptPath, '{\n  "format": 1,\n  "bundles": {}\n}\n');
  expect(await staleShowcaseArtifacts(root, join(root, "output"), compiled)).toEqual([]);
  rmSync(receiptPath);
  mkdirSync(receiptPath);
  await expect(staleShowcaseArtifacts(root, join(root, "output"), compiled)).rejects.toThrow();
});

test("equal emitted entries allow a source-only edit without a bump; changed entries require one", () => {
  const manifest = new TextEncoder().encode('{"version":"1.2.3"}\n');
  const emitted = (main: string): Readonly<Record<string, string>> => {
    const bytes = zipSync({ "manifest.json": manifest, "main.js": new TextEncoder().encode(main) });
    const entries = showcaseReleaseReceipt([{ slug: "oracle-deck", bytes }]).bundles["oracle-deck"];
    if (entries === undefined) {
      throw new Error("the fixture bundle has no admitted entries");
    }
    return entries;
  };
  const unchanged = emitted("export const answer = 42;\n");
  const changed = emitted("export const answer = 43;\n");
  expect(
    showcaseVersionViolations([
      { slug: "same-output", before: "1.2.3", after: "1.2.3", beforeEntries: unchanged, afterEntries: unchanged },
      { slug: "changed-output", before: "1.2.3", after: "1.2.3", beforeEntries: unchanged, afterEntries: changed },
      { slug: "regressed", before: "2.0.0", after: "1.9.9", beforeEntries: unchanged, afterEntries: changed },
      { slug: "bumped", before: "1.2.3", after: "1.2.4", beforeEntries: unchanged, afterEntries: changed },
      { slug: "new", before: null, after: "1.0.0", beforeEntries: null, afterEntries: changed },
    ]),
  ).toEqual([
    "changed-output: admitted bundle entries changed but manifest version did not increase (1.2.3 -> 1.2.3)",
    "regressed: admitted bundle entries changed but manifest version did not increase (2.0.0 -> 1.9.9)",
  ]);
});

test("pre-receipt Git baseline reads exact binary assets and names containing spaces and Unicode", ({ scratch }) => {
  const root = join(scratch, "release-base");
  const bundle = join(root, "packages", "showcase-plugins", "bundles", "oracle-deck");
  const assets = join(bundle, "ui", "assets");
  mkdirSync(assets, { recursive: true });
  const main = new TextEncoder().encode("export const answer = 42;\n");
  const manifest = new TextEncoder().encode('{"version":"1.2.3"}\n');
  const binary = Uint8Array.from([0, 255, 195, 40, 0, 254]);
  const assetName = "card back 🃏.png";
  writeFileSync(join(bundle, "main.js"), main);
  writeFileSync(join(bundle, "manifest.json"), manifest);
  writeFileSync(join(assets, assetName), binary);
  const retired = join(root, "packages", "showcase-plugins", "bundles", "retired-showcase");
  mkdirSync(retired, { recursive: true });
  writeFileSync(join(retired, "main.js"), main);
  writeFileSync(join(retired, "manifest.json"), manifest);
  execGit(root, ["init", "-q", "-b", "main"]);
  execGit(root, ["-c", "core.autocrlf=false", "add", "--all"]);
  execGit(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "baseline"]);
  const base = execGit(root, ["rev-parse", "HEAD"]).trim();
  expect(trackedBaseReceipt(root, base).bundles).toEqual({
    "oracle-deck": {
      "main.js": createHash("sha256").update(main).digest("hex"),
      "manifest.json": createHash("sha256").update(manifest).digest("hex"),
      [`ui/assets/${assetName}`]: createHash("sha256").update(binary).digest("hex"),
    },
    "retired-showcase": {
      "main.js": createHash("sha256").update(main).digest("hex"),
      "manifest.json": createHash("sha256").update(manifest).digest("hex"),
    },
  });
  expect(removedShowcaseSlugs(Object.keys(baseReceipt(root, base).bundles), ["oracle-deck"])).toEqual(["retired-showcase"]);
});

test("a new slug has no base pair; an existing manifest without entry evidence refuses", () => {
  const entries = { "main.js": "a", "manifest.json": "b" };
  expect(
    showcaseVersionViolations([
      { slug: "new", before: null, beforeEntries: null, after: "1.0.0", afterEntries: entries },
      { slug: "missing-entries", before: "1.0.0", beforeEntries: null, after: "1.0.0", afterEntries: entries },
      { slug: "missing-manifest", before: null, beforeEntries: entries, after: "1.0.0", afterEntries: entries },
    ]),
  ).toEqual(["missing-entries: base manifest and admitted entry evidence disagree", "missing-manifest: base manifest and admitted entry evidence disagree"]);
});

test("release receipt must be in the candidate index", ({ scratch }) => {
  const root = join(scratch, "receipt-index");
  mkdirSync(join(root, "packages", "showcase-plugins"), { recursive: true });
  execGit(root, ["init", "-q", "-b", "main"]);
  const receiptPath = join(root, "packages", "showcase-plugins", "release-entries.json");
  const oldReceipt = '{"format":1,"bundles":{}}\n';
  const newReceipt = '{"format":1,"bundles":{"oracle-deck":{}}}\n';
  writeFileSync(receiptPath, oldReceipt);
  expect(showcaseReceiptTracked(root), "an untracked generated file is not a candidate release receipt").toBe(false);
  expect(showcaseReceiptMatchesCandidate(root, oldReceipt)).toBe(false);
  execGit(root, ["add", "--", "packages/showcase-plugins/release-entries.json"]);
  expect(showcaseReceiptTracked(root), "staging the exact receipt makes it candidate-index evidence").toBe(true);
  expect(showcaseReceiptMatchesCandidate(root, oldReceipt)).toBe(true);
  writeFileSync(receiptPath, newReceipt);
  expect(showcaseReceiptMatchesCandidate(root, newReceipt), "an old staged receipt cannot authorize worktree-only generated bytes").toBe(false);
  execGit(root, ["add", "--", "packages/showcase-plugins/release-entries.json"]);
  expect(showcaseReceiptMatchesCandidate(root, newReceipt)).toBe(true);
});

test("release receipt reads the hook's alternate candidate index while planted roots stay isolated", ({ scratch }) => {
  const root = join(scratch, "alternate-receipt-index");
  mkdirSync(join(root, "packages", "showcase-plugins"), { recursive: true });
  execGit(root, ["init", "-q", "-b", "main"]);
  const relativeReceipt = "packages/showcase-plugins/release-entries.json";
  const receiptPath = join(root, relativeReceipt);
  const oldReceipt = '{"format":1,"bundles":{}}\n';
  const newReceipt = '{"format":1,"bundles":{"oracle-deck":{}}}\n';
  writeFileSync(receiptPath, oldReceipt);
  execGit(root, ["add", "--", relativeReceipt]);
  const candidateIndex = join(scratch, "partial-commit.index");
  copyFileSync(join(root, ".git", "index"), candidateIndex);
  writeFileSync(receiptPath, newReceipt);
  execGit(root, ["add", "--", relativeReceipt]);
  expect(showcaseReceiptMatchesCandidate(root, newReceipt), "the ordinary index contains the newly generated bytes").toBe(true);

  vi.stubEnv("GIT_INDEX_FILE", candidateIndex);
  try {
    expect(showcaseReceiptMatchesCandidate(root, newReceipt), "a planted repo ignores the caller's unrelated hook index").toBe(true);
    const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
    try {
      expect(showcaseReceiptTracked(root)).toBe(true);
      expect(showcaseReceiptMatchesCandidate(root, newReceipt), "the alternate index still holds the stale receipt").toBe(false);
      execGit(root, ["rm", "--cached", "--force", "--", relativeReceipt], { extra: { ["GIT_INDEX_FILE"]: candidateIndex } });
      expect(showcaseReceiptTracked(root), "a pathspec commit omitting the receipt must refuse").toBe(false);
      expect(showcaseReceiptMatchesCandidate(root, newReceipt)).toBe(false);
    } finally {
      cwd.mockRestore();
    }
  } finally {
    vi.unstubAllEnvs();
  }
  expect(showcaseReceiptMatchesCandidate(root, newReceipt), "the ordinary index remains intact").toBe(true);
});

test("candidate input parity covers tracked, deleted, and untracked compiler inputs but ignores prose", ({ scratch }) => {
  const root = join(scratch, "input-parity");
  const bundle = join(root, "packages", "showcase-plugins", "bundles", "oracle-deck");
  mkdirSync(bundle, { recursive: true });
  const main = "packages/showcase-plugins/bundles/oracle-deck/main.ts";
  const ui = "packages/showcase-plugins/bundles/oracle-deck/ui.ts";
  writeFileSync(join(bundle, "main.ts"), "const value = 1;\n");
  writeFileSync(join(bundle, "manifest.json"), '{"version":"1.0.0"}\n');
  writeFileSync(join(bundle, "README.md"), "original prose\n");
  writeFileSync(join(root, ".gitignore"), "ui.ts\n");
  execGit(root, ["init", "-q", "-b", "main"]);
  execGit(root, ["add", "--all"]);
  expect(candidateShowcaseInputDrift(root)).toEqual([]);
  writeFileSync(join(bundle, "README.md"), "edited prose\n");
  expect(candidateShowcaseInputDrift(root), "prose does not affect emitted entries").toEqual([]);
  writeFileSync(join(bundle, "main.ts"), "const value = 2;\n");
  expect(candidateShowcaseInputDrift(root)).toEqual([main]);
  execGit(root, ["add", "--", main]);
  expect(candidateShowcaseInputDrift(root), "staged source matching the worktree is admissible").toEqual([]);
  const assets = join(bundle, "ui", "assets");
  const asset = "packages/showcase-plugins/bundles/oracle-deck/ui/assets/card back 🃏.png";
  mkdirSync(assets, { recursive: true });
  writeFileSync(join(assets, "card back 🃏.png"), Uint8Array.from([0, 255, 1]));
  execGit(root, ["add", "--", asset]);
  expect(candidateShowcaseInputDrift(root)).toEqual([]);
  writeFileSync(join(assets, "card back 🃏.png"), Uint8Array.from([0, 254, 1]));
  expect(candidateShowcaseInputDrift(root), "asset parity compares raw bytes").toEqual([asset]);
  execGit(root, ["add", "--", asset]);
  writeFileSync(join(bundle, "ui.ts"), "orb.ui(1);\n");
  expect(candidateShowcaseInputDrift(root), "an ignored authored UI source is still a worktree-only input").toEqual([ui]);
  rmSync(join(bundle, "ui.ts"));
  rmSync(join(bundle, "main.ts"));
  expect(candidateShowcaseInputDrift(root)).toEqual([main]);
});

test("a partial candidate cannot borrow an unstaged manifest bump for staged output", ({ scratch }) => {
  const root = join(scratch, "partial-version");
  const bundle = join(root, "packages", "showcase-plugins", "bundles", "oracle-deck");
  mkdirSync(bundle, { recursive: true });
  const mainPath = "packages/showcase-plugins/bundles/oracle-deck/main.ts";
  const manifestPath = "packages/showcase-plugins/bundles/oracle-deck/manifest.json";
  const receiptPath = "packages/showcase-plugins/release-entries.json";
  const oldManifest = '{"version":"1.0.0"}\n';
  const newManifest = '{"version":"1.0.1"}\n';
  writeFileSync(join(root, mainPath), "const value = 1;\n");
  writeFileSync(join(root, manifestPath), oldManifest);
  execGit(root, ["init", "-q", "-b", "main"]);
  execGit(root, ["add", "--", mainPath, manifestPath]);
  const candidateIndex = join(scratch, "partial-version.index");
  copyFileSync(join(root, ".git", "index"), candidateIndex);

  writeFileSync(join(root, mainPath), "const value = 2;\n");
  writeFileSync(join(root, manifestPath), newManifest);
  const newManifestHash = createHash("sha256").update(newManifest).digest("hex");
  const newReceipt = `${JSON.stringify({ format: 1, bundles: { "oracle-deck": { "manifest.json": newManifestHash, "main.js": "a".repeat(64) } } })}\n`;
  writeFileSync(join(root, receiptPath), newReceipt);
  execGit(root, ["add", "--", mainPath, receiptPath], { extra: { ["GIT_INDEX_FILE"]: candidateIndex } });

  vi.stubEnv("GIT_INDEX_FILE", candidateIndex);
  const cwd = vi.spyOn(process, "cwd").mockReturnValue(root);
  try {
    expect(showcaseReceiptMatchesCandidate(root, newReceipt), "the staged receipt alone appears current").toBe(true);
    expect(candidateShowcaseInputDrift(root)).toEqual([manifestPath]);
    expect(candidateShowcaseManifest(root, "oracle-deck")).toEqual({
      version: "1.0.0",
      hash: createHash("sha256").update(oldManifest).digest("hex"),
    });
    expect(candidateShowcaseManifest(root, "oracle-deck").hash).not.toBe(newManifestHash);
  } finally {
    cwd.mockRestore();
    vi.unstubAllEnvs();
  }
});

test("missing base receipt is reconstructed, but a Git read failure cannot masquerade as absence", ({ scratch }) => {
  const root = join(scratch, "receipt-base-read");
  const bundle = join(root, "packages", "showcase-plugins", "bundles", "oracle-deck");
  mkdirSync(bundle, { recursive: true });
  writeFileSync(join(bundle, "manifest.json"), '{"version":"1.0.0"}\n');
  writeFileSync(join(bundle, "main.js"), "export {};\n");
  execGit(root, ["init", "-q", "-b", "main"]);
  execGit(root, ["add", "--all"]);
  execGit(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "baseline"]);
  const base = execGit(root, ["rev-parse", "HEAD"]).trim();
  const reconstructed = baseReceipt(root, base);
  expect(reconstructed.bundles["oracle-deck"]).toBeDefined();
  expect(() => baseReceipt(root, "not-a-commit"), "a failed Git read is not an absent receipt").toThrow();

  const receiptPath = join(root, "packages", "showcase-plugins", "release-entries.json");
  writeFileSync(receiptPath, `${JSON.stringify(reconstructed)}\n`);
  execGit(root, ["add", "--", "packages/showcase-plugins/release-entries.json"]);
  execGit(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "valid receipt"]);
  expect(baseReceipt(root, execGit(root, ["rev-parse", "HEAD"]).trim())).toEqual(reconstructed);

  writeFileSync(receiptPath, '{"format":1,"bundles":{"oracle-deck":{"main.js":42}}}\n');
  execGit(root, ["add", "--", "packages/showcase-plugins/release-entries.json"]);
  execGit(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "invalid receipt"]);
  expect(() => baseReceipt(root, execGit(root, ["rev-parse", "HEAD"]).trim())).toThrow("base showcase release receipt is incomplete");
});

test("qualified CI boundary retains failed predecessor showcase version debt after application-only B", { timeout: scaledBudget(90_000) }, async ({
  scratch,
  fakeBin,
}) => {
  await fakeBin("gh", "process.exitCode = 74;");
  const root = join(scratch, "event-showcase");
  const project = plantCompilerProject(root, "const value = 1;\n");
  mkdirSync(join(root, ".github/workflows"), { recursive: true });
  writeFileSync(join(root, ".github/workflows/ci.yml"), "env: { ORB_CI_QUALIFICATION_GENERATION: current }\n");
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    if (slug !== "oracle-deck") {
      const directory = join(root, "packages/showcase-plugins/bundles", slug);
      mkdirSync(directory, { recursive: true });
      writeFileSync(join(directory, "main.ts"), "const value = 1;\n");
      writeFileSync(join(directory, "manifest.json"), '{"version":"1.0.0"}\n');
    }
  }
  const receiptPath = join(root, "packages/showcase-plugins/release-entries.json");
  const save = async (): Promise<string> => {
    const compiled = await compileShowcasePlugins(root);
    expect(compiled.diagnostics).toEqual([]);
    writeFileSync(receiptPath, renderShowcaseReleaseReceipt(showcaseReleaseReceipt(compiled.bundles)));
    execGit(root, ["add", "--all"]);
    execGit(root, ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "commit", "-qm", "entries"]);
    return execGit(root, ["rev-parse", "HEAD"]).trim();
  };
  const base = await save();
  writeFileSync(join(project.pluginDirectory, "main.ts"), "const value = 2;\n");
  const failed = await save();
  writeFileSync(join(root, "application.ts"), "export const application = true;\n");
  const head = await save();
  execGit(root, ["update-ref", "refs/remotes/origin/main", head]);
  expect(await runShowcaseRelease(root), "ordinary publication comparison remains unchanged").toBe(EXIT.clean);
  vi.stubEnv(VERIFY_BASE_ENV, base);
  vi.stubEnv(VERIFY_HEAD_ENV, head);
  try {
    expect(await runShowcaseRelease(root), "CI cannot borrow HEAD as its own version baseline").toBe(EXIT.violations);
    vi.stubEnv(VERIFY_BASE_ENV, failed);
    expect(await runShowcaseRelease(root), "the event base hides the failed predecessor's version debt").toBe(EXIT.clean);
    vi.stubEnv(VERIFY_BASE_ENV, base);
    writeFileSync(join(project.pluginDirectory, "manifest.json"), '{"version":"1.0.1"}\n');
    const repaired = await save();
    vi.stubEnv(VERIFY_HEAD_ENV, repaired);
    expect(await runShowcaseRelease(root), "a newer manifest repays the cumulative installable-byte debt").toBe(EXIT.clean);
    writeFileSync(join(project.pluginDirectory, "manifest.json"), '{"version":"1.0.2"}\n');
    const qualifiedNewer = await save();
    writeFileSync(join(project.pluginDirectory, "main.ts"), "const value = 3;\n");
    writeFileSync(join(project.pluginDirectory, "manifest.json"), '{"version":"1.0.1"}\n');
    const rollback = await save();
    vi.stubEnv(VERIFY_HEAD_ENV, rollback);
    expect(await runShowcaseRelease(root), "publication-only comparison would permit this rollback").toBe(EXIT.clean);
    vi.stubEnv(VERIFY_BASE_ENV, qualifiedNewer);
    expect(await runShowcaseRelease(root), "the newer qualified version must retain its authority").toBe(EXIT.violations);
    expect(
      () =>
        resolveCiQualification(root, rollback, qualifiedNewer, {
          repository: "Inktomi93/orbweaver",
          generation: "Orbweaver qualification product-v2",
          requiredJobs: ["changes", "static", "ci-ok"],
          runtimeJobs: ["e2e-smoke"],
          publication: base,
          hasCurrentGeneration: () => true,
        }),
      "metadata outage must not replace newer qualified version authority with older publication",
    ).toThrow("qualified ancestry is ambiguous");
  } finally {
    vi.unstubAllEnvs();
  }
});
