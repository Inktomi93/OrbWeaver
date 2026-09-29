// Repository convenience wrapper for a first-party showcase. The public `orb-plugin pack` command in
// @orb/plugin-toolchain owns compilation and deterministic zip construction; this wrapper adds the real
// application install-funnel acceptance and the `<id>-<version>.zip` release filename.

import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import type { PluginManifest } from "@orb/contracts/plugin";
import { formatPluginAuthorDiagnostics, packPluginDirectory } from "@orb/plugin-toolchain";
import { ManifestInvalidError, parseBundle } from "@orb/server/domain/plugin";

const USAGE = "usage: pnpm plugin:pack <slug> [outDir]\n  <slug> is a directory under packages/showcase-plugins/bundles/";
const EXIT_VIOLATION = 1;
const EXIT_MISUSE = 3;
const REPO_ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function die(message: string, code: number): never {
  process.stderr.write(`${message}\n`);
  process.exit(code);
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

const [slug, outDir] = process.argv.slice(2);
if (slug === undefined || slug.length === 0) {
  die(USAGE, EXIT_MISUSE);
}

let authored: Awaited<ReturnType<typeof packPluginDirectory>>;
try {
  authored = await packPluginDirectory({
    pluginDirectory: join(REPO_ROOT, "packages", "showcase-plugins", "bundles", slug),
    sdkDirectory: join(REPO_ROOT, "packages", "plugin-sdk"),
    outputDirectory: join(REPO_ROOT, "packages", "showcase-plugins", "dist", "author-js", slug),
  });
} catch (error) {
  if (error instanceof Error && "code" in error && error.code === "ENOENT") {
    die(`plugin:pack: no source directory for "${slug}" (expected manifest.json + main.ts)\n${USAGE}`, EXIT_VIOLATION);
  }
  throw error;
}
if (authored.diagnostics.length > 0) {
  die(`plugin:pack: ${slug} has invalid authored source\n${formatPluginAuthorDiagnostics(REPO_ROOT, authored.diagnostics)}`, EXIT_VIOLATION);
}
if (authored.bundle === null) {
  die(`plugin:pack: ${slug} produced no bundle`, EXIT_VIOLATION);
}

let manifest: PluginManifest;
try {
  manifest = parseBundle(authored.bundle).manifest;
} catch (error) {
  if (error instanceof ManifestInvalidError) {
    die(`plugin:pack: ${slug} does not pack to an installable bundle\n${error.message}`, EXIT_VIOLATION);
  }
  throw error;
}

const outPath = join(resolve(outDir ?? "."), `${manifest.id}-${manifest.version}.zip`);
await writeAtomically(outPath, authored.bundle);
process.stdout.write(`packed ${outPath} (${authored.bundle.byteLength} bytes, capabilities: ${manifest.capabilities.join(", ") || "none"})\n`);
