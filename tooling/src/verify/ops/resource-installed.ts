// Installed-package acquisition: node's resolver, then three receipted modes.
//
// THIS PROVIDER DELIBERATELY DOES NOT USE `ResourceReader`. The reader is the AUTHORED transaction and
// refuses every symlink traversal by construction ("authored resource traverses a symbolic link"), while
// under pnpm every installed package IS reached through a symlink into the content-addressed store. Routing
// an installed read through the authored reader would make the door refuse on a healthy tree — the exact
// false negative the contract exists to prevent, wearing a receipt.
//
// THE PATHS ARE ABSOLUTE AND SAY SO. A pnpm store path is legitimately outside the checkout, and pretending
// otherwise — mapping it to a repo-relative spelling that resolves nowhere — is how a resolved store path
// becomes a lie. `directory` is repo-relative only when the package genuinely sits inside the repository.
// This is also why the fact publishes NO resource `paths`: an absolute store path is not a member of any
// policy's authored population, and putting one there would fail the population fence for a correct read.
import { readdirSync, readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad } from "../contract/resource.ts";
import type { InstalledPackageFacts, InstalledPackageId, InstalledPackageRequest } from "../contract/resource-installed.ts";
import { INSTALLED_PACKAGE_DEFINITIONS } from "../contract/resource-installed.ts";
import { assertRepoPathIdentity } from "../lib/policy-validation.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

const DECLARATION_SUFFIX = ".d.ts";
/** Package plumbing that publishes no declarations worth parsing. Mirrors the authored reader's own fence. */
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", ".cache"]);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function refused(reason: string): ResourceLoad<never> {
  return { status: "unresolved", paths: [], members: 0, reason };
}

/** Resolve one id's `package.json` through node's own algorithm, following a `via` chain when the package is
 *  reachable only from a sibling's installed location. */
function manifestPath(root: string, id: InstalledPackageId, seen: ReadonlySet<InstalledPackageId>): string {
  const definition = INSTALLED_PACKAGE_DEFINITIONS[id];
  if (definition.via !== undefined && seen.has(definition.via)) {
    throw new Error(`installed package ${id} has a cyclic resolution base`);
  }
  const base = definition.via === undefined ? resolve(root, definition.from) : manifestPath(root, definition.via, new Set([...seen, id]));
  return createRequire(base).resolve(`${definition.specifier}/package.json`);
}

/** Walk up from a resolved entry file to the directory that owns it. Used only when a package's `exports`
 *  map refuses `./package.json` — see `installedPackageDirectory`. */
function owningPackageDirectory(entry: string): string {
  let directory = dirname(realpathSync(entry));
  for (;;) {
    if (statSync(join(directory, "package.json"), { throwIfNoEntry: false })?.isFile() === true) {
      return directory;
    }
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error(`no package manifest owns the resolved entry: ${entry}`);
    }
    directory = parent;
  }
}

/** The resolved package DIRECTORY, for a composite door whose subject spans several installed files (the
 *  vendor CSS surface). Exported so resolution has ONE home: a second `createRequire` base would be a second
 *  answer to "where is this package", which is exactly what the `via` chain exists to prevent. Throws with
 *  node's own message when the package is not installed; the caller owns the status.
 *
 *  A PACKAGE MAY REFUSE TO EXPORT ITS OWN MANIFEST, and that is what `directoryAnchor` is for — the
 *  contract records the measurement. */
export function installedPackageDirectory(root: string, id: InstalledPackageId): string {
  const definition = INSTALLED_PACKAGE_DEFINITIONS[id];
  if (definition.directoryAnchor !== undefined) {
    return owningPackageDirectory(createRequire(resolve(root, definition.from)).resolve(`${definition.specifier}/${definition.directoryAnchor}`));
  }
  return realpathSync(dirname(manifestPath(root, id, new Set<InstalledPackageId>())));
}

function repoDirectory(root: string, directory: string): string | null {
  const rel = relative(realpathSync(root), realpathSync(directory));
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    return null;
  }
  return rel.split(sep).join("/");
}

function readManifest(manifest: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error(`installed package manifest is not an object: ${manifest}`);
  }
  return parsed as Record<string, unknown>;
}

function metadataFacts(root: string, id: InstalledPackageId, manifest: string): InstalledPackageFacts {
  const parsed = readManifest(manifest);
  const name = parsed["name"];
  const version = parsed["version"];
  if (typeof name !== "string" || name === "" || typeof version !== "string" || version === "") {
    throw new Error(`installed package ${id} has no name/version pair in its manifest`);
  }
  const exports = parsed["exports"];
  const exportKeys = typeof exports === "object" && exports !== null && !Array.isArray(exports) ? Object.keys(exports).toSorted() : [];
  return { id, mode: "metadata", name, version, directory: repoDirectory(root, dirname(manifest)), exportKeys };
}

/** A named file is JOINED to the package directory, never resolved: an `exports` map is a contract with a
 *  package's IMPORTERS, and this door observes rather than imports. Measured 2026-09-11:
 *  `playwright-core/browsers.json` is ERR_PACKAGE_PATH_NOT_EXPORTED through node's resolver. */
function textFacts(id: InstalledPackageId, manifest: string, file: string): InstalledPackageFacts {
  assertRepoPathIdentity(file, `installed package ${id} file`);
  const directory = realpathSync(dirname(manifest));
  const target = realpathSync(join(directory, file));
  const rel = relative(directory, target);
  if (rel === "" || rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel)) {
    throw new Error(`installed package ${id} file escapes its package directory: ${file}`);
  }
  if (!statSync(target).isFile()) {
    throw new Error(`installed package ${id} file is not a regular file: ${file}`);
  }
  return { id, mode: "text", file, text: readFileSync(target, "utf8") };
}

function collectDeclarations(directory: string, into: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        collectDeclarations(child, into);
      }
    } else if (entry.isFile() && entry.name.endsWith(DECLARATION_SUFFIX)) {
      into.push(child);
    }
  }
}

function astFacts(id: InstalledPackageId, manifest: string): Extract<InstalledPackageFacts, { mode: "ast" }> {
  const declarationPaths: string[] = [];
  collectDeclarations(realpathSync(dirname(manifest)), declarationPaths);
  if (declarationPaths.length === 0) {
    throw new Error(`installed package ${id} publishes no declaration files`);
  }
  return { id, mode: "ast", declarationPaths: declarationPaths.toSorted((left, right) => left.localeCompare(right)) };
}

export function loadInstalledPackage(root: string, request: InstalledPackageRequest): ResourceLoad<InstalledPackageFacts> {
  if (!Object.hasOwn(INSTALLED_PACKAGE_DEFINITIONS, request.id)) {
    return refused(`unknown installed package id: ${String(request.id)}`);
  }
  let manifest: string;
  try {
    manifest = manifestPath(root, request.id, new Set<InstalledPackageId>());
  } catch (error) {
    // An uninstalled package is MISSING, not unresolved: "run pnpm install" and "the reader is broken" are
    // two different instructions, and a lane in a worktree that skipped bootstrap hits the first every time.
    return { status: "missing", paths: [], members: 0, reason: `installed package ${request.id} is not resolvable: ${message(error)}` };
  }
  // @orb-waive caught-failure-ownership(error): installed-resource resolution: error surfaces as a structured tool-error; the broken resource is excluded from the installed set
  try {
    if (request.mode === "metadata") {
      return { status: "ready", value: metadataFacts(root, request.id, manifest), paths: [], members: 1 };
    }
    if (request.mode === "text") {
      return { status: "ready", value: textFacts(request.id, manifest, request.file), paths: [], members: 1 };
    }
    const value = astFacts(request.id, manifest);
    return { status: "ready", value, paths: [], members: value.declarationPaths.length };
  } catch (error) {
    return refused(`installed package ${request.id} (${request.mode}) could not be read: ${message(error)}`);
  }
}
