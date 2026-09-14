// One reader for "does this reference enter through a symbol declared in THIS project home", plus the
// home's own liveness receipt.
//
// `sealed-origin.ts` answers the same question for an implementation DIRECTORY that is routinely outside the
// consuming policy's population, so it matches on an absolute-path infix and has no liveness of its own. The
// sanctioned-home family needs the other half: their home is a single FILE inside the policy's own
// population, and the whole point of the migration is that a home which moves must go RED rather than
// silently stop matching (`docs/design/gate-runtime-standardization.md` §"Resource vocabulary"). So the
// home is LOCATED in `ctx.files` and receipted — zero members refuses the run — and a reference is judged by
// the canonical declaring FILE plus the canonical export name, never by the consuming file's own exports
// (`export function estimateTokens` in the consumer is the self-exemption door that shape opens).
//
// A pure reader over delivered nodes: no walk, no Project, no filesystem, no cache.

import { readMemberReference, referenceResolutionServices, resolveGlobalMemberOrigin, resolveModuleMemberOrigin } from "@orb/tooling/_shared/reference-fact";
import type { Node as MorphNode, SourceFile } from "ts-morph";
import { Node, VariableDeclarationKind } from "ts-morph";
import type { ProjectHomeVerdict } from "../contract/origin-verdict.ts";
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

/** How far a receiver's identity is chased through immutable const hops before the reader gives up. A cast
 *  is normally zero or one hop from its value; the cap only stops a pathological chain. */
const MAX_RECEIVER_HOPS = 4;

/** The initializer of an identifier's `const` declaration, or null. Deliberately NOT `resolveStableExpression`:
 *  that reader resolves to a stable TERMINAL and refuses a call (`create(…)`, `useQueryClient()`), which is
 *  precisely the receiver whose type this axis needs. `const` only — a reassignable binding proves nothing
 *  about the value at the call site. */
function constInitializerOf(identifier: MorphNode): MorphNode | null {
  let initializer: MorphNode | null = null;
  for (const declaration of identifier.getSymbol()?.getDeclarations() ?? []) {
    const value = Node.isVariableDeclaration(declaration) ? declaration.getInitializer() : undefined;
    const isConst = Node.isVariableDeclaration(declaration) && declaration.getVariableStatement()?.getDeclarationKind() === VariableDeclarationKind.Const;
    if (initializer === null && isConst && value !== undefined) {
      initializer = value;
    }
  }
  return initializer;
}

/** THE CAST AXIS. What a receiver REALLY is, with every `as`/`satisfies`/parenthesis stripped and immutable
 *  const hops followed.
 *
 *  WHY THIS EXISTS: a member read is normally judged by the DECLARATION of the property symbol the checker
 *  resolved off the receiver's type — and a cast REPLACES that declaration with one in the cast's own type
 *  literal, which the shared refusal classifier then correctly calls "a proven different identity". So
 *  `(useQueryClient() as { setQueryData(k: unknown, v: unknown): void }).setQueryData(…)` passed every
 *  policy in this family while the uncast twin reported: a one-line dodge for the whole class. The receiver's
 *  own identity cannot be cast away, so the fix belongs here rather than in each policy. */
function uncastReceiver(node: MorphNode): MorphNode {
  let current = referenceResolutionServices.unwrapExpression(node);
  for (let hop = 0; hop < MAX_RECEIVER_HOPS && Node.isIdentifier(current); hop += 1) {
    const initializer = constInitializerOf(current);
    if (initializer === null) {
      break;
    }
    current = referenceResolutionServices.unwrapExpression(initializer);
  }
  return current;
}

/** Does the member, looked up on the receiver's UNCAST type, belong to one of the named packages? A receiver
 *  whose uncast type does not declare the member at all carries no evidence either way and answers false —
 *  the caller's direct verdict then stands. */
function uncastMemberDeclaredByPackage(node: MorphNode, packageNames: readonly string[]): boolean {
  const read = readMemberReference(node);
  if (read.kind === "unresolved") {
    return false;
  }
  const receiver = uncastReceiver(read.value.receiver);
  // Through the shared reader (#2097): "no property symbol" and "a symbol with no declaration" are the same
  // NO-EVIDENCE answer for this predicate, which is what the doc above states, so an unresolved fact
  // collapses to the empty set exactly as the open-coded `?? []` did.
  const origin = resolveTypePropertyOrigin(receiver, read.value.name);
  return declaredByAnyPackage(origin.kind === "resolved" ? origin.value : [], packageNames);
}

/** Judge one MEMBER read against a third-party package home: the property symbol the checker resolved off
 *  the receiver's type must be declared inside one of the named packages' own `node_modules` directories.
 *  This is the vendor twin of {@link classifyProjectHomeOrigin} — the receiver of a client seam member is
 *  routinely minted by a call (`useQueryClient()`, a store hook), which the VALUE walk correctly refuses.
 *
 *  The CAST AXIS runs second and only widens the verdict: a cast that hides the property's declaration
 *  cannot hide what the receiver IS ({@link uncastReceiver}). */
export function classifyPackageMemberOrigin(node: MorphNode, packageNames: readonly string[]): ProjectHomeVerdict {
  const origin = resolveTypeMemberOrigin(node);
  if (origin.kind === "resolved" && declaredByAnyPackage(origin.value.declarations, packageNames)) {
    return "home";
  }
  if (uncastMemberDeclaredByPackage(node, packageNames)) {
    return "home";
  }
  return origin.kind === "unresolved" ? classifyOriginRefusal(origin.reason, node) : "other";
}

/** One member chain, ROOT-FIRST, with every cast stripped at every step:
 *  `(globalThis as { Intl: … }).Intl.DateTimeFormat` reads as root `globalThis` plus `["Intl","DateTimeFormat"]`. */
function readMemberChain(node: MorphNode): { readonly root: MorphNode; readonly names: readonly string[] } | null {
  const names: string[] = [];
  let current = referenceResolutionServices.unwrapExpression(node);
  for (let hop = 0; hop < MAX_RECEIVER_HOPS; hop += 1) {
    const read = readMemberReference(current);
    if (read.kind === "unresolved") {
      break;
    }
    names.unshift(read.value.name);
    current = referenceResolutionServices.unwrapExpression(read.value.receiver);
  }
  return names.length === 0 ? null : { root: uncastReceiver(current), names };
}

/** Is this member read exactly `<ambient global>.<path>` — the CAST AXIS for an api hung off `globalThis`?
 *
 *  The property-symbol reader is cast-poisoned one level down (`(globalThis as { Intl: … }).Intl` declares
 *  its `Intl` in the cast's type literal), so the chain's ROOT is what proves the identity: whatever the
 *  members are annotated as, the object they are read off is the ambient global. */
export function readsAmbientGlobalPath(node: MorphNode, globals: ReadonlySet<string>, path: readonly string[]): boolean {
  const chain = readMemberChain(node);
  if (chain === null || chain.names.length !== path.length || chain.names.some((name, index) => name !== path[index])) {
    return false;
  }
  const origin = resolveGlobalMemberOrigin(chain.root);
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
