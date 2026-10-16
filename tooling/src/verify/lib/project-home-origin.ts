// One reader for "does this reference enter through a symbol declared in THIS project home", plus the
// home's own liveness receipt.
//
// `sealed-origin.ts` answers the same question for an implementation DIRECTORY that is routinely outside the
// consuming policy's population, so it matches on an absolute-path infix and has no liveness of its own. The
// sanctioned-home family needs the other half: their home is a single FILE inside the policy's own
// population, and the whole point of the migration is that a home which moves must go RED rather than
// silently stop matching (`docs/law/gate-runtime-standardization.md` §"Resource vocabulary"). So the
// home is LOCATED in `ctx.files` and receipted — zero members refuses the run — and a reference is judged by
// the canonical declaring FILE plus the canonical export name, never by the consuming file's own exports
// (`export function estimateTokens` in the consumer is the self-exemption door that shape opens).
//
// A pure reader over delivered nodes: no walk, no Project, no filesystem, no cache.

import {
  readMemberReference,
  readMemberReferenceWithName,
  referenceResolutionServices,
  resolveGlobalMemberOrigin,
  resolveModuleMemberOrigin,
} from "@orb/tooling/floor/code-facts/reference-fact";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { MAX_RECEIVER_HOPS, uncastReceiver } from "../../floor/code-facts/type-member-origin-core.ts";
import type {
  GlobalOriginServices,
  MemberOriginServices,
  ModuleOriginServices,
  OriginReferenceServices,
  ProjectHomeVerdict,
} from "../contract/origin-verdict.ts";
import type { GatePolicyContext } from "../contract/policy.ts";
import { classifyOriginRefusal } from "./origin-verdict.ts";
import { declaredByAnyPackage, resolveTypeMemberOrigin, resolveTypePropertyOrigin } from "./type-member-origin.ts";

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
  hasExport: (sourceFile: SourceFile, name: string) => boolean = exportsName,
): LocatedProjectHome {
  const sourceFile = files.find((file) => relativePath(file) === home.path);
  const names = new Set(home.names);
  if (sourceFile === undefined) {
    return { sourceFile: undefined, names, members: 0, unresolved: 0 };
  }
  const missing = home.names.filter((name) => !hasExport(sourceFile, name));
  return { sourceFile, names, members: home.names.length - missing.length, unresolved: missing.length };
}

/** Judge one reference against a located home: the canonical declaration must live in the home FILE and
 *  carry one of the home's export names. An alias, a namespace member and a name-preserving re-export all
 *  resolve to the same canonical pair; a same-named export of another module does not. */
export function classifyProjectHomeOrigin(node: MorphNode, home: LocatedProjectHome, services?: ModuleOriginServices): ProjectHomeVerdict {
  if (home.sourceFile === undefined) {
    return "unreadable";
  }
  const origin = services === undefined ? resolveModuleMemberOrigin(node) : services.moduleOrigin(node);
  if (origin.kind === "unresolved") {
    return classifyOriginRefusal(origin.reason, node, services?.declarations);
  }
  const { canonical } = origin.value;
  if (canonical.kind !== "project") {
    return "other";
  }
  return canonical.sourceFile.compilerNode === home.sourceFile.compilerNode && home.names.has(canonical.exportedName) ? "home" : "other";
}

/** Register exact home names, including type-only exports, before the shared native generation seals. */
export function prepareProjectHome(ctx: GatePolicyContext, home: ProjectHomeDeclaration): void {
  const source = ctx.files.find((file) => ctx.relativePath(file) === home.path);
  if (source === undefined) {
    return;
  }
  if (ctx.nativeTypes === undefined) {
    throw new Error("native project home evidence is unavailable");
  }
  for (const name of home.names) {
    ctx.nativeTypes.request({ kind: "export-declarations", nodes: [source], name });
  }
}

/** Absent exports remain receipt data; absent source/name evidence refuses the native read. */
export function nativeProjectHome(ctx: GatePolicyContext, home: ProjectHomeDeclaration): LocatedProjectHome {
  return locateProjectHome(ctx.files, ctx.relativePath, home, (source, name) => {
    if (ctx.nativeTypes === undefined) {
      throw new Error("native project home evidence is unavailable");
    }
    const declarations = ctx.nativeTypes.exportDeclarations([source], name);
    if (!declarations.has(source)) {
      throw new Error("native project home export coverage is unavailable");
    }
    return declarations.get(source) !== null;
  });
}

/** Judge one reference against a third-party package's own EXPORT: the canonical declaration must live
 *  inside one of the named packages' `node_modules` directories (a typed workspace resolves a package
 *  specifier to its shipped declarations), or — when the checker could not reach the package at all — the
 *  door the consumer authored must be that package. The second arm is what keeps a proof honest in a
 *  workspace where the vendor is not installed; the first is what a real run uses. */
export function readPackageExportOrigin(
  node: MorphNode,
  packageNames: readonly string[],
  names: ReadonlySet<string>,
  services?: ModuleOriginServices,
): PackageExportOrigin {
  const origin = services === undefined ? resolveModuleMemberOrigin(node) : services.moduleOrigin(node);
  if (origin.kind === "unresolved") {
    return { verdict: classifyOriginRefusal(origin.reason, node, services?.declarations), exportedName: null };
  }
  const { canonical, memberPath } = origin.value;
  const named = memberPath.length === 0 ? canonical.exportedName : memberPath.at(-1);
  if (named === undefined || !names.has(named)) {
    return { verdict: "other", exportedName: null };
  }
  const inPackage =
    canonical.kind === "external-door" ? packageNames.includes(canonical.moduleSpecifier) : declaredByAnyPackage([canonical.declaration], packageNames);
  return { verdict: inPackage ? "home" : "other", exportedName: inPackage ? named : null };
}

/** Does the member, looked up on the receiver's UNCAST type, belong to one of the named packages? A receiver
 *  whose uncast type does not declare the member at all carries no evidence either way and answers false —
 *  the caller's direct verdict then stands. */
function uncastMemberDeclaredByPackage(node: MorphNode, packageNames: readonly string[], services?: MemberOriginServices): boolean {
  const read = services === undefined ? readMemberReference(node) : readMemberReferenceWithName(node, services.readComputedName);
  if (read.kind === "unresolved") {
    return false;
  }
  return uncastPropertyDeclaredByPackage(read.value.receiver, read.value.name, packageNames, services);
}

/** The uncast package-member check for a property captured without a member node, such as destructuring. */
export function uncastPropertyDeclaredByPackage(receiver: MorphNode, name: string, packageNames: readonly string[], services?: MemberOriginServices): boolean {
  // Through the shared reader (#2097): "no property symbol" and "a symbol with no declaration" are the same
  // NO-EVIDENCE answer for this predicate, which is what the doc above states, so an unresolved fact
  // collapses to the empty set exactly as the open-coded `?? []` did.
  const uncast = uncastReceiver(receiver, services?.declarations);
  const origin = services === undefined ? resolveTypePropertyOrigin(uncast, name) : services.propertyOrigin(uncast, name);
  return declaredByAnyPackage(origin.kind === "resolved" ? origin.value : [], packageNames);
}

/** Judge one MEMBER read against a third-party package home: the property symbol the checker resolved off
 *  the receiver's type must be declared inside one of the named packages' own `node_modules` directories.
 *  This is the vendor twin of {@link classifyProjectHomeOrigin} — the receiver of a client seam member is
 *  routinely minted by a call (`useQueryClient()`, a store hook), which the VALUE walk correctly refuses.
 *
 *  The CAST AXIS runs second and only widens the verdict: a cast that hides the property's declaration
 *  cannot hide what the receiver IS ({@link uncastReceiver}). */
export function classifyPackageMemberOrigin(node: MorphNode, packageNames: readonly string[], services?: MemberOriginServices): ProjectHomeVerdict {
  const direct = (): import("../../floor/code-facts/reference-fact-contract.ts").ReferenceFact<readonly MorphNode[]> => {
    const origin = resolveTypeMemberOrigin(node);
    return origin.kind === "resolved" ? { ...origin, value: origin.value.declarations } : origin;
  };
  const origin = services === undefined ? direct() : services.memberOrigin(node);
  if (origin.kind === "resolved" && declaredByAnyPackage(origin.value, packageNames)) {
    return "home";
  }
  if (uncastMemberDeclaredByPackage(node, packageNames, services)) {
    return "home";
  }
  return origin.kind === "unresolved" ? classifyOriginRefusal(origin.reason, node, services?.declarations) : "other";
}

/** One member chain, ROOT-FIRST, with every cast stripped at every step:
 *  `(globalThis as { Intl: … }).Intl.DateTimeFormat` reads as root `globalThis` plus `["Intl","DateTimeFormat"]`. */
function readMemberChain(node: MorphNode, services?: OriginReferenceServices): { readonly root: MorphNode; readonly names: readonly string[] } | null {
  const names: string[] = [];
  let current = referenceResolutionServices.unwrapExpression(node);
  for (let hop = 0; hop < MAX_RECEIVER_HOPS; hop += 1) {
    const read = services === undefined ? readMemberReference(current) : readMemberReferenceWithName(current, services.readComputedName);
    if (read.kind === "unresolved") {
      break;
    }
    names.unshift(read.value.name);
    current = referenceResolutionServices.unwrapExpression(read.value.receiver);
  }
  return names.length === 0 ? null : { root: uncastReceiver(current, services?.declarations), names };
}

/** Is this member read exactly `<ambient global>.<path>` — the CAST AXIS for an api hung off `globalThis`?
 *
 *  The property-symbol reader is cast-poisoned one level down (`(globalThis as { Intl: … }).Intl` declares
 *  its `Intl` in the cast's type literal), so the chain's ROOT is what proves the identity: whatever the
 *  members are annotated as, the object they are read off is the ambient global. */
export function readsAmbientGlobalPath(node: MorphNode, globals: ReadonlySet<string>, path: readonly string[], services?: GlobalOriginServices): boolean {
  const chain = readMemberChain(node, services);
  if (chain === null || chain.names.length !== path.length || chain.names.some((name, index) => name !== path[index])) {
    return false;
  }
  const origin = services === undefined ? resolveGlobalMemberOrigin(chain.root) : services.globalOrigin(chain.root);
  return origin.kind === "resolved" && origin.value.memberPath.length === 0 && globals.has(origin.value.globalName);
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
