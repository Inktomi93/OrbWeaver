// Which files the TypeScript 6 program loaded as libraries, and which package declares each, for every ESLint rule and
// port reader that asks. A library is the program's answer under isLibrarySource (brand-names.ts), never a path's text:
// a workspace package pnpm links through node_modules is the tree's own, and a dependency is a library wherever its files
// sit, a store-linked one outside every node_modules directory included. A library's package is the nearest manifest
// above its file that carries a name, the manifest module resolution read; the 7.1 side names it the same way
// (NativeWorld.packageOf in tooling/src/unwired/native.ts).
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";
import { isWithinRoot } from "@orb/kit/path-containment";
import type ts from "typescript";
import { z } from "zod";
import { workspacePackageRoots } from "../package-effects/index.ts";
import { isLibrarySource } from "./brand-names.ts";
import { posixPath } from "./syntax.ts";

/** The packages the rules judge a declaration's origin by. */
export const DRIZZLE_PACKAGE = "drizzle-orm";
export const REACT_TYPES_PACKAGE = "@types/react";
export const BASE_UI_PACKAGE = "@base-ui/react";
/** The scope DefinitelyTyped publishes every package's types under. */
export const TYPES_SCOPE = "@types/";

/** A library's file by the package that declares it: the manifest's name and the file's posix path inside the package. */
interface LibraryFile {
  readonly name: string;
  readonly path: string;
}

/** One program's answers about where its files come from. */
export interface LibrarySources {
  /** The file is a library's own under {@link isLibrarySource}. */
  readonly isLibrary: (file: ts.SourceFile) => boolean;
  /** The file is one the compiler supplies, `lib.dom.d.ts` and the rest of the standard library. */
  readonly isDefaultLibrary: (file: ts.SourceFile) => boolean;
  /** The file sits inside one of the workspace's own package directories. */
  readonly inWorkspacePackage: (file: ts.SourceFile) => boolean;
  /** The package that declares a library's file; undefined for the tree's own file or a package no manifest names. */
  readonly packageOf: (file: ts.SourceFile) => LibraryFile | undefined;
}

const PACKAGE_MANIFEST = "package.json";
const PackageManifest = z.looseObject({ name: z.string().optional() });

// The workspace's package directories under a run's root, read once per root.
const rootsByWorkspace = new Map<string, readonly string[]>();

function workspaceRoots(root: string): readonly string[] {
  const known = rootsByWorkspace.get(root);
  if (known !== undefined) {
    return known;
  }
  const roots = workspacePackageRoots(root);
  rootsByWorkspace.set(root, roots);
  return roots;
}

interface NamedManifest {
  readonly name: string;
  readonly directory: string;
}

const manifestsByDirectory = new Map<string, NamedManifest | null>();

// A nested scope manifest (zod's `v4/classic/package.json`, which only sets the module type) names nothing, so the walk
// goes up to the first manifest that names its package.
function namedManifest(directory: string): NamedManifest | null {
  const known = manifestsByDirectory.get(directory);
  if (known !== undefined) {
    return known;
  }
  const manifest = join(directory, PACKAGE_MANIFEST);
  const name = existsSync(manifest) ? PackageManifest.parse(JSON.parse(readFileSync(manifest, "utf8"))).name : undefined;
  const parent = dirname(directory);
  let found: NamedManifest | null = null;
  if (name !== undefined) {
    found = { name, directory };
  } else if (parent !== directory) {
    found = namedManifest(parent);
  }
  manifestsByDirectory.set(directory, found);
  return found;
}

/** The program's answers for a run rooted at `root`, the directory that holds the workspace manifest. */
export function librarySources(program: ts.Program, root: string): LibrarySources {
  const inWorkspacePackage = (file: ts.SourceFile): boolean =>
    workspaceRoots(root).some((dir) => isWithinRoot(dir, file.fileName.replaceAll("/", sep), { sep }));
  const isLibrary = (file: ts.SourceFile): boolean =>
    isLibrarySource({ external: program.isSourceFileFromExternalLibrary(file), workspacePackage: inWorkspacePackage(file) });
  const packageOf = (file: ts.SourceFile): LibraryFile | undefined => {
    const home = isLibrary(file) ? namedManifest(dirname(file.fileName)) : null;
    return home === null ? undefined : { name: home.name, path: posixPath(relative(home.directory, file.fileName)) };
  };
  return { isLibrary, isDefaultLibrary: (file) => program.isSourceFileDefaultLibrary(file), inWorkspacePackage, packageOf };
}
