import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import process from "node:process";
import type { PluginAuthorCompilerObserver } from "@orb/plugin-toolchain";
import { SHOWCASE_PLUGIN_SLUGS } from "@orb/showcase-plugins";
import { refuseDirectInvocation } from "@orb/tooling/_shared/entrypoint";
import { EXIT } from "@orb/tooling/_shared/exit-contract";
import { execGitBytes, GIT_READ_PREFIX, runGit } from "@orb/tooling/_shared/git";
import ts from "typescript";
import { z } from "zod";
import type { ShowcaseReleaseReceipt } from "../../plugin-author-showcase/index.ts";
import { compileShowcasePlugins, renderShowcaseReleaseReceipt, SHOWCASE_RELEASE_RECEIPT, showcaseReleaseReceipt } from "../../plugin-author-showcase/index.ts";
import { resolveMeasurementBoundary, resolveMergeBase } from "../lib/repo-paths.ts";
import { candidateIndexGitEnvironment } from "./resource-index.ts";

const SOURCE_ROOT = "packages/showcase-plugins/bundles";
const GIT_BLOB_MAX_BYTES = 67_108_864;
const VERSION_RE = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u;
// The author compiler passes options directly to TypeScript; SDK tsconfigs and bundle prose are not read.
const RELEASE_COMPILER_INPUTS = [
  "package.json",
  "pnpm-lock.yaml",
  "pnpm-workspace.yaml",
  "packages/plugin-sdk/package.json",
  "packages/plugin-sdk/main.d.ts",
  "packages/plugin-sdk/ui.d.ts",
  "packages/plugin-sdk/frame.d.ts",
  "packages/plugin-sdk/shared.d.ts",
  "packages/plugin-toolchain/package.json",
  "packages/plugin-toolchain/src/index.ts",
  "packages/plugin-toolchain/src/support.ts",
  "packages/plugin-toolchain/src/support-model.ts",
  "packages/plugin-toolchain/src/support.generated.ts",
  "packages/showcase-plugins/package.json",
  "packages/showcase-plugins/src/index.ts",
  "tooling/package.json",
  "tooling/src/plugin-author-showcase/index.ts",
] as const;
const RELEASE_COMPILER_INPUT_SET: ReadonlySet<string> = new Set(RELEASE_COMPILER_INPUTS);
const BUNDLE_INPUT_RE = /^packages\/showcase-plugins\/bundles\/[^/]+\/(?:manifest\.json|(?:main|ui|frame)\.(?:ts|js)|ui\/assets\/.+)$/u;
const RECEIPT_SCHEMA = z.object({
  format: z.literal(1),
  bundles: z.record(
    z.string(),
    z.record(z.string(), z.string().regex(/^[0-9a-f]{64}$/u)).refine((entries) => entries["main.js"] !== undefined && entries["manifest.json"] !== undefined),
  ),
});

refuseDirectInvocation(import.meta.url, "pnpm check (or pnpm verify [--push|--full])");

export interface ShowcaseVersionInput {
  readonly slug: string;
  readonly before: string | null;
  readonly after: string;
  readonly beforeEntries: Readonly<Record<string, string>> | null;
  readonly afterEntries: Readonly<Record<string, string>>;
}

function versionParts(version: string): readonly [number, number, number] | null {
  const matched = VERSION_RE.exec(version);
  return matched === null ? null : [Number(matched[1]), Number(matched[2]), Number(matched[3])];
}

export function showcaseVersionViolations(inputs: readonly ShowcaseVersionInput[]): readonly string[] {
  const violations: string[] = [];
  for (const input of inputs) {
    if ((input.before === null) !== (input.beforeEntries === null)) {
      violations.push(`${input.slug}: base manifest and admitted entry evidence disagree`);
      continue;
    }
    if (input.before === null || input.beforeEntries === null || sameEntries(input.beforeEntries, input.afterEntries)) {
      continue;
    }
    const before = versionParts(input.before);
    const after = versionParts(input.after);
    if (before === null || after === null) {
      violations.push(`${input.slug}: cannot compare manifest versions ${input.before} -> ${input.after}`);
      continue;
    }
    const newer =
      after[0] > before[0] || (after[0] === before[0] && after[1] > before[1]) || (after[0] === before[0] && after[1] === before[1] && after[2] > before[2]);
    if (!newer) {
      violations.push(`${input.slug}: admitted bundle entries changed but manifest version did not increase (${input.before} -> ${input.after})`);
    }
  }
  return violations;
}

function sameEntries(before: Readonly<Record<string, string>>, after: Readonly<Record<string, string>>): boolean {
  const paths = Object.keys(before).toSorted();
  return paths.length === Object.keys(after).length && paths.every((path) => before[path] === after[path]);
}

function manifestVersion(text: string, path: string): string {
  const value = JSON.parse(text) as { readonly version?: string };
  if (typeof value.version !== "string") {
    throw new Error(`${path}: manifest has no string version`);
  }
  return value.version;
}

function basePaths(root: string, base: string, path: string): readonly string[] {
  return execGitBytes(root, [...GIT_READ_PREFIX, "ls-tree", "-r", "-z", "--name-only", base, "--", path], { maxBuffer: GIT_BLOB_MAX_BYTES })
    .toString("utf8")
    .split("\0")
    .filter((entry) => entry !== "");
}

function candidateInputPaths(root: string, mode: "--cached" | "--others"): readonly string[] {
  const result = runGit(root, [...GIT_READ_PREFIX, "ls-files", mode, "-z", "--", SOURCE_ROOT, ...RELEASE_COMPILER_INPUTS], {
    extra: candidateIndexGitEnvironment(root),
    maxBuffer: GIT_BLOB_MAX_BYTES,
  });
  if (result.status !== 0 || (result.stdout !== "" && !result.stdout.endsWith("\0"))) {
    throw new Error(`showcase-release: cannot list ${mode} compiler inputs from candidate index: ${result.stderr.trim()}`);
  }
  return result.stdout === ""
    ? []
    : result.stdout
        .slice(0, -1)
        .split("\0")
        .filter((path) => RELEASE_COMPILER_INPUT_SET.has(path) || BUNDLE_INPUT_RE.test(path));
}

/** Check compiler implementation and admitted bundle inputs; compiler-host reads close the transitive source set. */
export function candidateShowcaseInputDrift(root: string): readonly string[] {
  const drift = [...candidateInputPaths(root, "--others")];
  const extra = candidateIndexGitEnvironment(root);
  for (const path of candidateInputPaths(root, "--cached")) {
    const worktreePath = join(root, path);
    if (!existsSync(worktreePath)) {
      drift.push(path);
      continue;
    }
    const indexed = execGitBytes(root, [...GIT_READ_PREFIX, "show", `:${path}`], { extra, maxBuffer: GIT_BLOB_MAX_BYTES });
    if (!indexed.equals(readFileSync(worktreePath))) {
      drift.push(path);
    }
  }
  return drift.toSorted();
}

/** Collect compiler-host evidence before Git validation so TypeScript cannot swallow a failed Git read. */
export function candidateShowcaseCompilerInputs(root: string): {
  readonly observer: PluginAuthorCompilerObserver;
  readonly drift: () => readonly string[];
} {
  const reads = new Map<string, string | undefined>();
  const files = new Map<string, boolean>();
  const missingDirectories = new Set<string>();
  const observer: PluginAuthorCompilerObserver = {
    readFile(path, text): void {
      reads.set(resolve(path), text);
    },
    fileExists(path, exists): void {
      files.set(resolve(path), exists);
    },
    directoryExists(path, exists): void {
      if (!exists) {
        missingDirectories.add(resolve(path));
      }
    },
  };
  return { observer, drift: () => candidateCompilerDrift(root, reads, files, missingDirectories) };
}

function candidateCompilerPaths(root: string): ReadonlySet<string> {
  const extra = candidateIndexGitEnvironment(root);
  const listed = execGitBytes(root, [...GIT_READ_PREFIX, "ls-files", "-z"], { extra, maxBuffer: GIT_BLOB_MAX_BYTES }).toString("utf8");
  if (listed !== "" && !listed.endsWith("\0")) {
    throw new Error("showcase-release: candidate compiler input listing is not NUL-terminated");
  }
  return new Set(listed === "" ? [] : listed.slice(0, -1).split("\0"));
}

function isCompilerEnvironmentInput(path: string): boolean {
  // Installed TypeScript is pinned by the candidate manifest and lockfile, not authored Git input.
  const libraryDirectory = dirname(resolve(ts.getDefaultLibFilePath({})));
  const name = basename(path);
  const libraryPrefix = "lib.";
  const declarationSuffix = ".d.ts";
  const library = name.slice(libraryPrefix.length, -declarationSuffix.length);
  const standardLibrary = name === "lib.d.ts" || ts.parseCommandLine(["--lib", library]).options.lib?.includes(name) === true;
  return (dirname(path) === libraryDirectory && standardLibrary) || path === join(dirname(libraryDirectory), "package.json");
}

function candidateCompilerPath(root: string, path: string): string {
  return relative(resolve(root), resolve(path)).split(sep).join("/");
}

function candidateCompilerReadMatches(root: string, path: string, text: string | undefined, indexed: ReadonlySet<string>): boolean {
  const name = candidateCompilerPath(root, path);
  if ((text !== undefined) !== indexed.has(name)) {
    return false;
  }
  if (text === undefined) {
    return true;
  }
  const bytes = execGitBytes(root, [...GIT_READ_PREFIX, "show", `:${name}`], {
    extra: candidateIndexGitEnvironment(root),
    maxBuffer: GIT_BLOB_MAX_BYTES,
  });
  return bytes.equals(readFileSync(path)) && ts.sys.readFile(path) === text;
}

function candidateCompilerDrift(
  root: string,
  reads: ReadonlyMap<string, string | undefined>,
  files: ReadonlyMap<string, boolean>,
  missingDirectories: ReadonlySet<string>,
): readonly string[] {
  const indexed = candidateCompilerPaths(root);
  const drift = new Set<string>();
  for (const [path, exists] of files) {
    const name = candidateCompilerPath(root, path);
    if (!isCompilerEnvironmentInput(path) && exists !== indexed.has(name)) {
      drift.add(name);
    }
  }
  for (const path of missingDirectories) {
    // A missing worktree directory can hide a candidate-only resolution target.
    const name = candidateCompilerPath(root, path);
    if ([...indexed].some((entry) => entry.startsWith(`${name}/`))) {
      drift.add(name);
    }
  }
  for (const [path, text] of reads) {
    if (!(isCompilerEnvironmentInput(path) || candidateCompilerReadMatches(root, path, text, indexed))) {
      drift.add(candidateCompilerPath(root, path));
    }
  }
  return [...drift].toSorted();
}

/** Read the candidate manifest once for both the version decision and raw-byte receipt proof. */
export function candidateShowcaseManifest(root: string, slug: string): { readonly version: string; readonly hash: string } {
  const path = `${SOURCE_ROOT}/${slug}/manifest.json`;
  const bytes = execGitBytes(root, [...GIT_READ_PREFIX, "show", `:${path}`], {
    extra: candidateIndexGitEnvironment(root),
    maxBuffer: GIT_BLOB_MAX_BYTES,
  });
  return { version: manifestVersion(bytes.toString("utf8"), path), hash: createHash("sha256").update(bytes).digest("hex") };
}

/** The generated receipt must be in the candidate index, not merely present in the working tree. */
export function showcaseReceiptTracked(root: string): boolean {
  return (
    runGit(root, [...GIT_READ_PREFIX, "ls-files", "--error-unmatch", "--", SHOWCASE_RELEASE_RECEIPT], {
      extra: candidateIndexGitEnvironment(root),
    }).status === 0
  );
}

/** The index and working tree must agree with the freshly compiled bytes at this gate. */
export function showcaseReceiptMatchesCandidate(root: string, generated: string): boolean {
  if (!showcaseReceiptTracked(root)) {
    return false;
  }
  const indexed = execGitBytes(root, [...GIT_READ_PREFIX, "show", `:${SHOWCASE_RELEASE_RECEIPT}`], {
    extra: candidateIndexGitEnvironment(root),
    maxBuffer: GIT_BLOB_MAX_BYTES,
  });
  return indexed.equals(Buffer.from(generated, "utf8"));
}

/** Refuse an existing showcase disappearing from the candidate catalog without a release contract. */
export function removedShowcaseSlugs(baseSlugs: readonly string[], currentSlugs: readonly string[]): readonly string[] {
  const current = new Set(currentSlugs);
  return baseSlugs.filter((slug) => !current.has(slug)).toSorted();
}

/** Reconstruct admitted entries directly from a pre-receipt Git tree without a platform archive tool. */
export function trackedBaseReceipt(root: string, base: string): ShowcaseReleaseReceipt {
  const paths = basePaths(root, base, SOURCE_ROOT);
  const bundles: Record<string, Record<string, string>> = {};
  const slugs = new Set(
    paths
      .filter((path) => path.startsWith(`${SOURCE_ROOT}/`))
      .map((path) => path.slice(SOURCE_ROOT.length + 1).split("/")[0])
      .filter((slug) => slug !== undefined),
  );
  for (const slug of [...slugs].toSorted()) {
    const prefix = `${SOURCE_ROOT}/${slug}/`;
    const names = paths.filter((path) => path.startsWith(prefix)).map((path) => path.slice(prefix.length));
    if (names.length === 0) {
      continue;
    }
    if (names.includes("main.ts") || !["manifest.json", "main.js"].every((name) => names.includes(name))) {
      throw new Error(`${slug}: base has no release receipt and no tracked JavaScript entry baseline`);
    }
    const admitted = names.filter((name) => name === "manifest.json" || name === "main.js" || name === "ui.js" || /^ui\/assets\/[^/]+$/u.test(name));
    bundles[slug] = Object.fromEntries(
      admitted.toSorted().map((name) => {
        const bytes = execGitBytes(root, [...GIT_READ_PREFIX, "cat-file", "blob", `${base}:${prefix}${name}`], { maxBuffer: GIT_BLOB_MAX_BYTES });
        return [name, createHash("sha256").update(bytes).digest("hex")];
      }),
    );
  }
  return { format: 1, bundles };
}

/** A missing base receipt selects tracked-entry reconstruction; every Git read fault throws. */
export function baseReceipt(root: string, base: string): ShowcaseReleaseReceipt {
  if (!basePaths(root, base, SHOWCASE_RELEASE_RECEIPT).includes(SHOWCASE_RELEASE_RECEIPT)) {
    return trackedBaseReceipt(root, base);
  }
  const bytes = execGitBytes(root, [...GIT_READ_PREFIX, "cat-file", "blob", `${base}:${SHOWCASE_RELEASE_RECEIPT}`], { maxBuffer: GIT_BLOB_MAX_BYTES });
  const parsed = RECEIPT_SCHEMA.safeParse(JSON.parse(bytes.toString("utf8")));
  if (!parsed.success) {
    throw new Error("base showcase release receipt is incomplete");
  }
  return parsed.data;
}

function showcaseComparisonBase(root: string): string | undefined {
  const boundary = resolveMeasurementBoundary(root);
  if (boundary !== null) {
    return boundary.base;
  }
  return resolveMergeBase(root)?.commit;
}

export async function runShowcaseRelease(root: string): Promise<number> {
  const base = showcaseComparisonBase(root);
  if (base === undefined) {
    process.stderr.write("showcase-release: could not resolve the branch diff; refusing a false-clean version verdict\n");
    return EXIT.toolError;
  }
  const staticDrift = candidateShowcaseInputDrift(root);
  const inputs = candidateShowcaseCompilerInputs(root);
  const compiled = await compileShowcasePlugins(root, inputs.observer);
  const drift = new Set([...staticDrift, ...inputs.drift()]);
  if (drift.size > 0) {
    process.stderr.write(
      `showcase-release: candidate compiler inputs differ from the checked worktree or are outside the candidate: ${[...drift].toSorted().join(", ")}\n`,
    );
    return EXIT.violations;
  }
  if (compiled.diagnostics.length > 0) {
    process.stderr.write(`showcase-release: author build has ${compiled.diagnostics.length} diagnostic(s); cannot compare admitted entries\n`);
    return EXIT.violations;
  }
  const current = showcaseReleaseReceipt(compiled.bundles);
  const receiptPath = join(root, SHOWCASE_RELEASE_RECEIPT);
  const generated = renderShowcaseReleaseReceipt(current);
  const currentReceipt = showcaseReceiptMatchesCandidate(root, generated) && existsSync(receiptPath) && readFileSync(receiptPath, "utf8") === generated;
  if (!currentReceipt) {
    process.stderr.write("showcase-release: committed entry receipt is stale against current admitted bundle bytes\n");
    return EXIT.violations;
  }
  const historical = baseReceipt(root, base);
  const removed = removedShowcaseSlugs(Object.keys(historical.bundles), SHOWCASE_PLUGIN_SLUGS);
  if (removed.length > 0) {
    process.stderr.write(`showcase-release: base showcase slug(s) removed without a release contract: ${removed.join(", ")}\n`);
    return EXIT.violations;
  }
  const historicalPaths = new Set(basePaths(root, base, SOURCE_ROOT));
  const versions: ShowcaseVersionInput[] = [];
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const manifestPath = `${SOURCE_ROOT}/${slug}/manifest.json`;
    const candidate = candidateShowcaseManifest(root, slug);
    const before = historicalPaths.has(manifestPath)
      ? manifestVersion(
          execGitBytes(root, [...GIT_READ_PREFIX, "cat-file", "blob", `${base}:${manifestPath}`], { maxBuffer: GIT_BLOB_MAX_BYTES }).toString("utf8"),
          manifestPath,
        )
      : null;
    const afterEntries = current.bundles[slug];
    if (afterEntries === undefined) {
      throw new Error(`showcase-release: compiler produced no admitted entries for ${slug}`);
    }
    if (afterEntries["manifest.json"] !== candidate.hash) {
      process.stderr.write(`showcase-release: ${slug} candidate manifest bytes do not match the admitted entry receipt\n`);
      return EXIT.violations;
    }
    versions.push({
      slug,
      before,
      after: candidate.version,
      beforeEntries: historical.bundles[slug] ?? null,
      afterEntries,
    });
  }
  const violations = showcaseVersionViolations(versions);
  if (violations.length > 0) {
    process.stderr.write(`${violations.map((violation) => `showcase-release: ${violation}`).join("\n")}\n`);
    return EXIT.violations;
  }
  process.stdout.write(`showcase-release: compared admitted entries for ${versions.length} showcase bundles\n`);
  return EXIT.clean;
}
