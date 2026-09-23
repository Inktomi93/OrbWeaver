// Vendor CSS surface acquisition: both halves through node's resolver (the authored reader refuses a
// symlink, and every pnpm install is one — there is no committed side left to read; see the header of
// `../contract/resource-vendor.ts`).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ResourceLoad } from "../contract/resource.ts";
import type { InstalledPackageId } from "../contract/resource-installed.ts";
import type { VendorCssSurface, VendorInstalledFile } from "../contract/resource-vendor.ts";
import { installedPackageDirectory, loadInstalledPackage } from "./resource-installed.ts";

refuseDirectInvocation(import.meta.url, "pnpm check:structure");

const DECLARATION_SUFFIX = "CssVars.d.ts";
const BUNDLE_DIRECTORY = "dist";
const BUNDLE_SUFFIX = ".js";
const SKIPPED_DIRECTORIES = new Set(["node_modules", ".git", ".cache"]);

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function collect(directory: string, matches: (name: string) => boolean, into: string[]): void {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const child = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) {
        collect(child, matches, into);
      }
    } else if (entry.isFile() && matches(entry.name)) {
      into.push(child);
    }
  }
}

function installedFiles(directory: string, matches: (name: string) => boolean): readonly VendorInstalledFile[] {
  const paths: string[] = [];
  collect(directory, matches, paths);
  return paths.toSorted((left, right) => left.localeCompare(right)).map((path) => Object.freeze({ path, text: readFileSync(path, "utf8") }));
}

function installedSide(root: string, id: InstalledPackageId, matches: (name: string) => boolean): ResourceLoad<readonly VendorInstalledFile[]> {
  let directory: string;
  try {
    directory = installedPackageDirectory(root, id);
  } catch (error) {
    return { status: "missing", paths: [], members: 0, reason: `installed package ${id} is not resolvable: ${message(error)}` };
  }
  try {
    const searched = id === "streamdown" ? join(directory, BUNDLE_DIRECTORY) : directory;
    if (!statSync(searched).isDirectory()) {
      return { status: "unresolved", paths: [], members: 0, reason: `installed package ${id} has no ${BUNDLE_DIRECTORY} directory` };
    }
    const files = installedFiles(searched, matches);
    return files.length === 0
      ? { status: "empty", paths: [], members: 0, reason: `installed package ${id} published no vendor file the surface could read` }
      : { status: "ready", value: files, paths: [], members: files.length };
  } catch (error) {
    return { status: "unresolved", paths: [], members: 0, reason: `installed package ${id} vendor files could not be read: ${message(error)}` };
  }
}

export function loadVendorCssSurface(root: string): ResourceLoad<VendorCssSurface> {
  const metadata = loadInstalledPackage(root, { id: "base-ui", mode: "metadata" });
  if (metadata.status !== "ready") {
    return { status: metadata.status, paths: [], members: 0, reason: metadata.reason };
  }
  if (metadata.value.mode !== "metadata") {
    return { status: "unresolved", paths: [], members: 0, reason: "the installed Base UI door answered a mode it was not asked for" };
  }
  const declarations = installedSide(root, "base-ui", (name) => name.endsWith(DECLARATION_SUFFIX));
  if (declarations.status !== "ready") {
    return { status: declarations.status, paths: [], members: 0, reason: declarations.reason };
  }
  const selectors = installedSide(root, "streamdown", (name) => name.endsWith(BUNDLE_SUFFIX));
  if (selectors.status !== "ready") {
    return { status: selectors.status, paths: [], members: 0, reason: selectors.reason };
  }
  const value: VendorCssSurface = {
    packageVersion: metadata.value.version,
    declarationFiles: declarations.value,
    selectorSources: selectors.value,
  };
  // `members` is every file the door READ across both sides — never the properties it happened to find
  // inside them, which is the consuming policy's census. `paths` stays empty: neither side publishes a
  // repo-relative path (`vendor-css-surface` is an UNPOPULATED resource kind).
  return {
    status: "ready",
    value,
    paths: [],
    members: declarations.value.length + selectors.value.length,
  };
}
