// One reader for "does this reference enter through a symbol declared in THIS project home", plus the
// home's own liveness receipt.
//
// `sealed-origin.ts` answers the same question for an implementation DIRECTORY that is routinely outside the
// consuming policy's population, so it matches on an absolute-path infix and has no liveness of its own. The
// sanctioned-home family needs the other half: their home is a single FILE inside the policy's own
// population, and the whole point of the migration is that a home which moves must go RED rather than
// silently stop matching (`docs/design/gate-runtime-standardization.md` §"Population vocabulary"). So the
// home is LOCATED in `ctx.files` and receipted — zero members refuses the run — and a reference is judged by
// the canonical declaring FILE plus the canonical export name, never by the consuming file's own exports
// (`export function estimateTokens` in the consumer is the self-exemption door that shape opens).
//
// A pure reader over delivered nodes: no walk, no Project, no filesystem, no cache.
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { classifyOriginRefusal } from "./origin-verdict.ts";
import { resolveModuleMemberOrigin } from "./reference-fact.ts";
import { declaredByAnyPackage, resolveTypeMemberOrigin } from "./type-member-origin.ts";

/** The home a policy seals: one repo-relative file and the exported names it owns. */
export interface ProjectHomeDeclaration {
  readonly path: string;
  readonly names: readonly string[];
}

/** A located home. `members`/`unresolved` feed the policy's receipt verbatim: an absent file resolves zero
 *  members, and a present file that no longer exports one of the names leaves it unresolved. Both refuse. */
export interface LocatedProjectHome {
  readonly sourceFile: SourceFile | undefined;
  readonly names: ReadonlySet<string>;
  readonly members: number;
  readonly unresolved: number;
}

/** Three answers, never two: the reference IS the home's symbol, is provably a different one, or could not
 *  be read at all — the third is a finding, never a silent pass (GATE-AUTHORING §5, #944). */
export type ProjectHomeVerdict = "home" | "other" | "unreadable";

/** A package-export verdict plus the CANONICAL export name it resolved to — an aliased import spells a
 *  different local name, and a grant operation must be keyed on the export, never on the local spelling. */
export interface PackageExportOrigin {
  readonly verdict: ProjectHomeVerdict;
  readonly exportedName: string | null;
}

function exportsName(sourceFile: SourceFile, name: string): boolean {
  return sourceFile.getExportSymbols().some((symbol) => symbol.getName() === name);
}

/** Locate one home in the effective population and measure it. The caller passes `ctx.files` and
 *  `ctx.relativePath`; `ctx.sourceFile(path)` THROWS outside the population and a catch around it mints an
 *  unproven caught-failure ledger row, so location goes through the file list by contract. */
export function locateProjectHome(
  files: readonly SourceFile[],
  relativePath: (sourceFile: SourceFile) => string,
  home: ProjectHomeDeclaration,
): LocatedProjectHome {
  const sourceFile = files.find((file) => relativePath(file) === home.path);
  const names = new Set(home.names);
  if (sourceFile === undefined) {
    return { sourceFile: undefined, names, members: 0, unresolved: 0 };
  }
  const missing = home.names.filter((name) => !exportsName(sourceFile, name));
  return { sourceFile, names, members: home.names.length - missing.length, unresolved: missing.length };
}

/** Judge one reference against a located home: the canonical declaration must live in the home FILE and
 *  carry one of the home's export names. An alias, a namespace member and a name-preserving re-export all
 *  resolve to the same canonical pair; a same-named export of another module does not. */
export function classifyProjectHomeOrigin(node: MorphNode, home: LocatedProjectHome): ProjectHomeVerdict {
  if (home.sourceFile === undefined) {
    return "unreadable";
  }
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, node);
  }
  const { canonical } = origin.value;
  if (canonical.kind !== "project") {
    return "other";
  }
  return canonical.sourceFile.compilerNode === home.sourceFile.compilerNode && home.names.has(canonical.exportedName) ? "home" : "other";
}

/** Judge one reference against a third-party package's own EXPORT: the canonical declaration must live
 *  inside one of the named packages' `node_modules` directories (a typed workspace resolves a package
 *  specifier to its shipped declarations), or — when the checker could not reach the package at all — the
 *  door the consumer authored must be that package. The second arm is what keeps a proof honest in a
 *  workspace where the vendor is not installed; the first is what a real run uses. */
export function readPackageExportOrigin(node: MorphNode, packageNames: readonly string[], names: ReadonlySet<string>): PackageExportOrigin {
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind === "unresolved") {
    return { verdict: classifyOriginRefusal(origin.reason, node), exportedName: null };
  }
  const { canonical, memberPath, exportedName } = origin.value;
  const named = memberPath.length === 0 ? exportedName : memberPath.at(-1);
  if (named === undefined || !names.has(named)) {
    return { verdict: "other", exportedName: null };
  }
  const inPackage =
    canonical.kind === "external-door" ? packageNames.includes(canonical.moduleSpecifier) : declaredByAnyPackage([canonical.declaration], packageNames);
  return { verdict: inPackage ? "home" : "other", exportedName: inPackage ? named : null };
}

/** Judge one MEMBER read against a third-party package home: the property symbol the checker resolved off
 *  the receiver's type must be declared inside one of the named packages' own `node_modules` directories.
 *  This is the vendor twin of {@link classifyProjectHomeOrigin} — the receiver of a client seam member is
 *  routinely minted by a call (`useQueryClient()`, a store hook), which the VALUE walk correctly refuses. */
export function classifyPackageMemberOrigin(node: MorphNode, packageNames: readonly string[]): ProjectHomeVerdict {
  const origin = resolveTypeMemberOrigin(node);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, node);
  }
  return declaredByAnyPackage(origin.value.declarations, packageNames) ? "home" : "other";
}

/** Judge one reference against a project DIRECTORY plus a closed export vocabulary — the shape a law uses
 *  when its subject is a family of symbols spread over sibling modules (the shared-selection pointers) and
 *  no single file is the home. The directory is an absolute-path infix for the same reason `sealed-origin`
 *  uses one; liveness is the caller's separate vocabulary receipt. */
export function classifyProjectDirectoryOrigin(node: MorphNode, directoryInfix: string, names: ReadonlySet<string>): ProjectHomeVerdict {
  const origin = resolveModuleMemberOrigin(node);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, node);
  }
  const { canonical } = origin.value;
  if (canonical.kind !== "project") {
    return "other";
  }
  const path = canonical.sourceFile.getFilePath().replaceAll("\\", "/");
  return path.includes(directoryInfix) && names.has(canonical.exportedName) ? "home" : "other";
}
