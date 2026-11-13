import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import process from "node:process";
import { compareSemver } from "@orb/kit/semver";
import type { PluginAuthorArtifact, PluginAuthorCompilerObserver, PluginAuthorDiagnostic, PluginAuthorResult } from "@orb/plugin-toolchain";
import { packPluginDirectory } from "@orb/plugin-toolchain";
import { SHOWCASE_PLUGIN_SLUGS, showcaseBundleEntries } from "@orb/showcase-plugins";

export interface ShowcaseArtifact {
  readonly slug: (typeof SHOWCASE_PLUGIN_SLUGS)[number];
  readonly bytes: Uint8Array;
}

export interface ShowcaseAuthorResult extends PluginAuthorResult {
  readonly bundles: readonly ShowcaseArtifact[];
}

export const SHOWCASE_RELEASE_RECEIPT = "packages/showcase-plugins/release-entries.json";

export interface ShowcaseReleaseReceipt {
  readonly format: 1;
  readonly bundles: Readonly<Record<string, Readonly<Record<string, string>>>>;
}

/** Hash each admitted bundle entry, not zip metadata or author source paths. */
export function showcaseReleaseReceipt(bundles: readonly ShowcaseArtifact[]): ShowcaseReleaseReceipt {
  const entries = bundles
    .toSorted((left, right) => left.slug.localeCompare(right.slug))
    .map(
      ({ slug, bytes }) =>
        [
          slug,
          Object.fromEntries(
            Object.entries(showcaseBundleEntries(bytes))
              .toSorted(([left], [right]) => left.localeCompare(right))
              .map(([path, content]) => [path, createHash("sha256").update(content).digest("hex")]),
          ),
        ] as const,
    );
  return { format: 1, bundles: Object.fromEntries(entries) };
}

export function renderShowcaseReleaseReceipt(receipt: ShowcaseReleaseReceipt): string {
  return `${JSON.stringify(receipt, null, 2)}\n`;
}

export function showcaseBundleDirectory(repoRoot: string): string {
  return join(repoRoot, "packages", "showcase-plugins", "dist", "bundles");
}

export async function compileShowcasePlugins(repoRoot: string, compilerObserver?: PluginAuthorCompilerObserver): Promise<ShowcaseAuthorResult> {
  const sourceRoot = join(repoRoot, "packages", "showcase-plugins", "bundles");
  // Resolve the SDK through its package exports, as the orb-plugin CLI does in a template checkout.
  const sdkDirectory = dirname(createRequire(join(repoRoot, "packages", "showcase-plugins", "package.json")).resolve("@orb/plugin-sdk/package.json"));
  const outputRoot = join(repoRoot, "packages", "showcase-plugins", "dist", "author-js");
  const artifacts: PluginAuthorArtifact[] = [];
  const diagnostics: PluginAuthorDiagnostic[] = [];
  const obsoleteOutputPaths: string[] = [];
  const bundles: ShowcaseArtifact[] = [];
  for (const slug of SHOWCASE_PLUGIN_SLUGS) {
    const result = await packPluginDirectory({
      pluginDirectory: join(sourceRoot, slug),
      sdkDirectory,
      outputDirectory: join(outputRoot, slug),
      ...(compilerObserver === undefined ? {} : { compilerObserver }),
    });
    artifacts.push(...result.artifacts);
    diagnostics.push(...result.diagnostics);
    obsoleteOutputPaths.push(...result.obsoleteOutputPaths);
    if (result.bundle !== null) {
      bundles.push({ slug, bytes: result.bundle });
    }
  }
  return { artifacts, diagnostics, obsoleteOutputPaths, bundles };
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

export async function writeShowcaseArtifacts(repoRoot: string, outputDirectory = showcaseBundleDirectory(repoRoot)): Promise<ShowcaseAuthorResult> {
  const result = await compileShowcasePlugins(repoRoot);
  if (result.diagnostics.length > 0) {
    return result;
  }
  await mkdir(outputDirectory, { recursive: true });
  for (const bundle of result.bundles) {
    await writeAtomically(join(outputDirectory, `${bundle.slug}.zip`), bundle.bytes);
  }
  const admitted = new Set(result.bundles.map(({ slug }) => `${slug}.zip`));
  for (const entry of await readdir(outputDirectory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".zip") && !admitted.has(entry.name)) {
      await rm(join(outputDirectory, entry.name));
    }
  }
  if (outputDirectory === showcaseBundleDirectory(repoRoot)) {
    await writeAtomically(
      join(repoRoot, SHOWCASE_RELEASE_RECEIPT),
      new TextEncoder().encode(renderShowcaseReleaseReceipt(showcaseReleaseReceipt(result.bundles))),
    );
  }
  return result;
}

async function releaseReceiptStale(path: string, bundles: readonly ShowcaseArtifact[]): Promise<boolean> {
  try {
    return (await readFile(path, "utf8")) !== renderShowcaseReleaseReceipt(showcaseReleaseReceipt(bundles));
  } catch (error) {
    if (error instanceof Error && "code" in error && error.code === "ENOENT") {
      return true;
    }
    throw error;
  }
}

export async function staleShowcaseArtifacts(
  repoRoot: string,
  outputDirectory = showcaseBundleDirectory(repoRoot),
  compiled?: ShowcaseAuthorResult,
): Promise<readonly string[]> {
  const result = compiled ?? (await compileShowcasePlugins(repoRoot));
  if (result.diagnostics.length > 0) {
    return [];
  }
  const stale: string[] = [];
  for (const bundle of result.bundles) {
    const path = join(outputDirectory, `${bundle.slug}.zip`);
    try {
      const current = await readFile(path);
      if (!current.equals(bundle.bytes)) {
        stale.push(path);
      }
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") {
        stale.push(path);
        continue;
      }
      throw error;
    }
  }
  const receiptPath = join(repoRoot, SHOWCASE_RELEASE_RECEIPT);
  if (await releaseReceiptStale(receiptPath, result.bundles)) {
    stale.push(receiptPath);
  }
  return stale;
}

/** What one tree ships: the receipt of its bundles' bytes and each bundle's manifest version. */
export interface ShowcaseRelease {
  readonly receipt: ShowcaseReleaseReceipt;
  readonly versions: Readonly<Record<string, string>>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> => typeof value === "object" && value !== null && !Array.isArray(value);

function manifestVersion(slug: string, text: string): string {
  const manifest: unknown = JSON.parse(text);
  const version = isRecord(manifest) ? manifest["version"] : undefined;
  if (typeof version !== "string") {
    throw new Error(`the ${slug} showcase manifest carries no version`);
  }
  return version;
}

function parsedReceipt(text: string): ShowcaseReleaseReceipt {
  const receipt: unknown = JSON.parse(text);
  const bundles = isRecord(receipt) ? receipt["bundles"] : undefined;
  if (!isRecord(bundles)) {
    throw new Error(`${SHOWCASE_RELEASE_RECEIPT} carries no bundles`);
  }
  const entries = Object.entries(bundles).map(([slug, files]) => {
    if (!isRecord(files)) {
      throw new Error(`${SHOWCASE_RELEASE_RECEIPT} lists no files for ${slug}`);
    }
    return [slug, Object.fromEntries(Object.entries(files).map(([path, hash]) => [path, String(hash)]))] as const;
  });
  return { format: 1, bundles: Object.fromEntries(entries) };
}

/** Read one tree's release through `read`, which answers a repo-relative path: the working tree or a git ref. */
export async function loadShowcaseRelease(read: (path: string) => Promise<string>): Promise<ShowcaseRelease> {
  const receipt = parsedReceipt(await read(SHOWCASE_RELEASE_RECEIPT));
  const versions: Record<string, string> = {};
  for (const slug of Object.keys(receipt.bundles)) {
    versions[slug] = manifestVersion(slug, await read(`packages/showcase-plugins/bundles/${slug}/manifest.json`));
  }
  return { receipt, versions };
}

/**
 * The bundles whose bytes differ from the base release while their version is not newer. A seeded install upgrades
 * only to a newer version, so such a bundle never reaches an install that holds the base. A bundle the base does
 * not ship has no install to reach.
 */
export function unbumpedShowcaseBundles(base: ShowcaseRelease, current: ShowcaseRelease): readonly string[] {
  return Object.entries(current.receipt.bundles)
    .filter(([slug, files]) => {
      const shipped = base.receipt.bundles[slug];
      const [was, now] = [base.versions[slug], current.versions[slug]];
      if (shipped === undefined || was === undefined || now === undefined) {
        return false;
      }
      const paths = new Set([...Object.keys(shipped), ...Object.keys(files)]);
      const changed = [...paths].some((path) => shipped[path] !== files[path]);
      return changed && compareSemver(now, was) <= 0;
    })
    .map(([slug]) => slug)
    .toSorted((left, right) => left.localeCompare(right));
}
