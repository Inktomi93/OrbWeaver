// Resolution-based liveness — the substrate for orphans/testonly/clientgap/swallowed/apisurface.
// Split from ast.ts (P4 of #393); the section headers carry the keying law verbatim.
import type { ImportDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import type { ConsumptionArm, Liveness, LivenessOptions, NamespaceSite } from "../contract/types.ts";
import { recordDeclarationEdges } from "./edges.ts";
import { declKey, exposedNames } from "./keys.ts";
import { resolveDynamicImportTarget, resolveModule } from "./resolve.ts";
import { isTestPath } from "./root.ts";

/** Records that `key` was marked alive by `arm`. Kept BESIDE the liveness buckets — recording an arm never
 *  changes who is alive, only what we can say about WHY. */
type ArmRecorder = (key: string, arm: ConsumptionArm) => void;

/** The client package's src prefix — the seam that buckets prod consumption into client vs server. */
export const CLIENT_SRC_PREFIX = "/packages/client/";

/** Decl-key every export of `target` (its own decls AND re-exported ones — getExportedDeclarations
 *  resolves through `export *` and through renaming `export { X as Y } from` hops), added to `bucket`.
 *  Used for namespace imports and dynamic imports, both of which keep a module's WHOLE export surface
 *  alive (err toward alive, never false-dead). The barrel's export NAME is irrelevant here — only the
 *  declarations it resolves to are recorded, which is what makes an alias hop invisible to the key. */
function markModuleAlive(target: SourceFile, bucket: Set<string>, record: ArmRecorder, arm: ConsumptionArm): void {
  for (const decls of target.getExportedDeclarations().values()) {
    for (const d of decls) {
      const key = declKey(d);
      bucket.add(key);
      record(key, arm);
    }
  }
}

/** Resolve one named-import specifier to its ORIGIN decls and mark them alive.
 *  `getExportedDeclarations().get(<the name the CONSUMER wrote>)` follows the re-export chain — including
 *  renames — to the real declarations; those declaration nodes ARE the key the candidate side uses, so the
 *  consumer's spelling never enters the identity. */
function markNamedAlive(target: SourceFile, name: string, bucket: Set<string>, record: ArmRecorder): void {
  const decls = target.getExportedDeclarations().get(name);
  if (decls === undefined) {
    return;
  }
  for (const d of decls) {
    const key = declKey(d);
    bucket.add(key);
    record(key, "named");
  }
}

/** Consumption from ONE static import declaration: named specifiers + `import * as` namespaces resolve
 *  to origins. `export { X } from "…"` is a re-export PASS-THROUGH (not consumption — the MemoryLogEntry
 *  miss class: a file re-exporting its own symbol must not mark it "used" and hide deadness elsewhere),
 *  so this only walks IMPORT declarations. */
function markImportConsumption(imp: ImportDeclaration, sink: ConsumptionSink): void {
  const target = imp.getModuleSpecifierSourceFile();
  if (target === undefined) {
    return;
  }
  const ns = imp.getNamespaceImport();
  if (ns !== undefined) {
    const exposed = exposedNames(target);
    for (const key of exposed.keys()) {
      sink.bucket.add(key);
      sink.record(key, "namespace");
    }
    sink.namespaceSites.push({ file: imp.getSourceFile(), alias: ns.getText(), binding: ns, exposed });
    return;
  }
  for (const spec of imp.getNamedImports()) {
    markNamedAlive(target, spec.getName(), sink.bucket, sink.record);
  }
  if (imp.getDefaultImport() !== undefined) {
    markNamedAlive(target, "default", sink.bucket, sink.record);
  }
}

/** Where one importing file's consumption lands: its liveness bucket, the arm recorder, and the shared
 *  namespace-site log. One object so a new arm cannot be added without a place to record it. */
interface ConsumptionSink {
  readonly bucket: Set<string>;
  readonly record: ArmRecorder;
  readonly namespaceSites: NamespaceSite[];
}

/** Same-file references: an export used within its own module (a component using its own `*Props`, a
 *  worker's exported-for-test helper called by the file's live loop) is NOT an orphan. Identifier symbols
 *  must resolve to the declaration; same-spelled shadows and re-export pass-throughs do not count.
 *  Both spellings are scanned because a file may rename its own export
 *  (`const Inner = …; export { Inner as Outer }`): the export-map name is `Outer` while every in-file
 *  use says `Inner`. */
export function isReferencedInOwnFile(sf: SourceFile, name: string, decl: Node): boolean {
  const targetKeys = new Set((decl.getSymbol()?.getDeclarations() ?? [decl]).map(declKey));
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    if (id.getFirstAncestorByKind(SyntaxKind.ExportDeclaration) !== undefined || id.getParent() === decl) {
      continue;
    }
    const parent = id.getParent();
    // In `{ transform }`, the identifier's ordinary symbol is the object PROPERTY. The checker exposes
    // the VALUE binding separately; that binding is the same declaration a direct `transform(x)` resolves.
    const symbol = Node.isShorthandPropertyAssignment(parent) && parent.getNameNode() === id ? parent.getValueSymbol() : id.getSymbol();
    const declarations = (symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? [];
    if ((id.getText() === name || declarations.length > 0) && declarations.some((candidate) => targetKeys.has(declKey(candidate)))) {
      return true;
    }
  }
  return false;
}

/** Dynamic `import()` keeps the whole target module alive (the two rot verbs were blind to it while the
 *  `importers` verb saw it — the DevTools/installLongTaskTracer false-orphan class). Walks the file's
 *  `import(…)` calls and marks each resolved target's exports alive in `bucket`. */
function markDynamicImports(sf: SourceFile, project: SourceCorpus, bucket: Set<string>, record: ArmRecorder): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    if (call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg === undefined || !Node.isStringLiteral(arg)) {
      continue;
    }
    const target = resolveModule(project, sf.getDirectoryPath(), arg.getLiteralText());
    if (target !== undefined) {
      markModuleAlive(target, bucket, record, "dynamic");
      continue;
    }
    // `resolveModule` above only follows RELATIVE specifiers, so a package-aliased lazy import
    // (`import("@orb/ui/code-editor")`) falls through here — see `markLazyImportMembers` for the
    // narrow, member-precise recovery (`pnpm ast rot ui` false-positive on `CodeEditor`, 2026-08-14).
    markLazyImportMembers(call, sf, bucket, record);
  }
}

// ── THE LAZY-IMPORT BLIND SPOT (owner-reproduced 2026-08-14) ────────────────────────────────────────────
// `resolveModule` above is a hand-rolled resolver that only follows relative specifiers — deliberately
// (its own doc comment: "the dev-only dynamic imports that mattered for the false-orphan class are all
// relative"). A package-aliased lazy import never reaches `markModuleAlive` at all, so its member never
// enters `usedProd`: `pnpm ast rot ui` flagged `CodeEditor` (packages/ui/src/code-editor/code-editor.tsx)
// test-only with 0 production refs while `pnpm ast dead CodeEditor` (language-service `findReferences`,
// which resolves through the real TS module graph) found 2 real production consumers — both of the shape
// `const CodeEditor = lazy(() => import("@orb/ui/code-editor").then((m) => ({ default: m.CodeEditor })))`.
//
// Rather than widen `resolveModule` to alias-follow generally (a much bigger blast radius — it would
// change the whole-module "dynamic" arm's liveness verdict for every aliased dynamic import in the
// workspace, not just this member-access shape), this credits ONLY the specific MEMBER a `.then()`/
// `await` read names, resolved through the TYPE CHECKER — the SAME resolution a static import gets
// (tsconfig `paths`/`@orb/*` subpath exports included), never a second hand-rolled resolver. A dynamic
// import's own expression type is always `Promise<typeof import("…")>`; unwrapping to the module type and
// reading its symbol's SourceFile declaration is exactly what `imp.getModuleSpecifierSourceFile()` gives a
// static import for free.
//
// CONSERVATIVE BY CONSTRUCTION: exactly three shapes are recognized (the ones this repo's lazy-loaded
// barrel exports are actually written in) — `import(spec).then((m) => … m.X …)`,
// `(await import(spec)).X`, and `const m = await import(spec); … m.X …`. An import outside these shapes,
// or one the checker can't resolve (a computed specifier, a bare specifier the compiler itself can't
// find), credits nothing — fail toward the OLD whole-module-only behavior, never invent liveness.
/** Property-read names on `bindingName` within `scope` — all THREE property-read shapes
 *  (`x.prop`/`x?.prop`/`x["prop"]`; a dot-only sweep is a known false clean in this repo, see the
 *  `regkeys` fix beside this one). */
function propertyAccessNamesOn(scope: Node, binding: Node): Set<string> {
  const bindingKeys = new Set((binding.getSymbol()?.getDeclarations() ?? []).map(declKey));
  const isBinding = (node: Node): boolean => {
    const symbol = node.getSymbol();
    return ((symbol?.getAliasedSymbol() ?? symbol)?.getDeclarations() ?? []).some((declaration) => bindingKeys.has(declKey(declaration)));
  };
  const names = new Set<string>();
  for (const pa of scope.getDescendantsOfKind(SyntaxKind.PropertyAccessExpression)) {
    if (isBinding(pa.getExpression())) {
      names.add(pa.getName());
    }
  }
  for (const ea of scope.getDescendantsOfKind(SyntaxKind.ElementAccessExpression)) {
    if (!isBinding(ea.getExpression())) {
      continue;
    }
    const arg = ea.getArgumentExpression();
    if (arg !== undefined && Node.isStringLiteral(arg)) {
      names.add(arg.getLiteralText());
    }
  }
  return names;
}

/** The single property name a `PropertyAccessExpression`/`ElementAccessExpression` reads off `target`, or
 *  undefined when `access` isn't one of those two kinds reading `target` (including `access` itself being
 *  undefined — no parent at all). */
function propertyNameOfAccess(access: Node | undefined, target: Node): string | undefined {
  if (access === undefined) {
    return;
  }
  if (Node.isPropertyAccessExpression(access) && access.getExpression() === target) {
    return access.getName();
  }
  if (!Node.isElementAccessExpression(access) || access.getExpression() !== target) {
    return;
  }
  const arg = access.getArgumentExpression();
  return arg !== undefined && Node.isStringLiteral(arg) ? arg.getLiteralText() : undefined;
}

/** Shape 1: `import(spec).then((m) => … m.X …)` — `call` chained directly into a `.then(cb)`, `cb`'s
 *  first parameter walked for property reads. Empty when the shape doesn't match. */
function thenCallbackMembers(call: Node): Set<string> {
  const propAccess = call.getParent();
  if (!Node.isPropertyAccessExpression(propAccess) || propAccess.getExpression() !== call || propAccess.getName() !== "then") {
    return new Set();
  }
  const thenCall = propAccess.getParent();
  if (!Node.isCallExpression(thenCall)) {
    return new Set();
  }
  const cb = thenCall.getArguments()[0];
  if (cb === undefined || !(Node.isArrowFunction(cb) || Node.isFunctionExpression(cb))) {
    return new Set();
  }
  const paramName = cb.getParameters()[0]?.getNameNode();
  return paramName !== undefined && Node.isIdentifier(paramName) ? propertyAccessNamesOn(cb, paramName) : new Set();
}

/** Shape 2: `(await import(spec)).X` — `call`'s `await` is parenthesized and immediately property-
 *  accessed. Empty when the shape doesn't match. */
function awaitedMemberAccess(call: Node): Set<string> {
  const awaitExpr = call.getParent();
  if (!Node.isAwaitExpression(awaitExpr)) {
    return new Set();
  }
  const paren = awaitExpr.getParent();
  if (!Node.isParenthesizedExpression(paren)) {
    return new Set();
  }
  const name = propertyNameOfAccess(paren.getParent(), paren);
  return name === undefined ? new Set() : new Set([name]);
}

/** Shape 3: `const m = await import(spec); … m.X …` — `call`'s `await` initializes a variable; the bound
 *  identifier's property reads are collected over the WHOLE declaring file (a same-file over-attribution
 *  in the erring-alive direction only — see the KNOWN OVER-ATTRIBUTION note on the `chains` edge map
 *  above; a lens that nominates code for deletion must never err the other way). Empty when the shape
 *  doesn't match. */
function awaitedBindingMembers(call: Node, sf: SourceFile): Set<string> {
  const awaitExpr = call.getParent();
  if (!Node.isAwaitExpression(awaitExpr)) {
    return new Set();
  }
  const decl = awaitExpr.getParent();
  if (!Node.isVariableDeclaration(decl)) {
    return new Set();
  }
  const nameNode = decl.getNameNode();
  return Node.isIdentifier(nameNode) ? propertyAccessNamesOn(sf, nameNode) : new Set();
}

/** The member name(s) one of the three recognized lazy-import shapes reads off `call`'s resolved module,
 *  or empty when `call` matches none of them. */
function lazyImportMemberNames(call: Node, sf: SourceFile): Set<string> {
  const then = thenCallbackMembers(call);
  if (then.size > 0) {
    return then;
  }
  const awaitedAccess = awaitedMemberAccess(call);
  if (awaitedAccess.size > 0) {
    return awaitedAccess;
  }
  return awaitedBindingMembers(call, sf);
}

/** The member-precise recovery for a dynamic import `resolveModule` couldn't follow (a package-aliased
 *  specifier). Credits nothing unless BOTH a recognized member-access shape AND a checker-resolved target
 *  are found — the conservative fail-toward-old-behavior the section header commits to. */
function markLazyImportMembers(call: Node, sf: SourceFile, bucket: Set<string>, record: ArmRecorder): void {
  const members = lazyImportMemberNames(call, sf);
  if (members.size === 0) {
    return;
  }
  const target = resolveDynamicImportTarget(call);
  if (target === undefined) {
    return;
  }
  for (const name of members) {
    markNamedAlive(target, name, bucket, record);
  }
}

/** Record `export * from "./x"` targets: a member of x may be reached via a namespace consumer of the
 *  re-exporting barrel that we can't name, so it stays a suppress-and-count candidate. Named re-exports
 *  (`export { X } from`) are pass-throughs — deliberately no consumption. */
function collectStarTargets(sf: SourceFile, starTargets: Set<string>): void {
  for (const exp of sf.getExportDeclarations()) {
    if (exp.isNamespaceExport()) {
      const t = exp.getModuleSpecifierSourceFile();
      if (t !== undefined) {
        starTargets.add(t.getFilePath());
      }
    }
  }
}

/** Pick the consumption bucket for an importing file: test path → usedTest; client-package src →
 *  usedClientProd; everything else → usedServerProd. Flat (no nested ternary) for the linter. */
function prodBucketFor(fp: string, buckets: { usedTest: Set<string>; usedClientProd: Set<string>; usedServerProd: Set<string> }): Set<string> {
  if (isTestPath(fp)) {
    return buckets.usedTest;
  }
  return fp.includes(CLIENT_SRC_PREFIX) ? buckets.usedClientProd : buckets.usedServerProd;
}

/** The default: liveness sets ONLY, byte- and cost-identical to the pass that predates the edge map. */
const NO_EDGES: LivenessOptions = { edges: false };

/** ONE resolution pass over the workspace: builds the prod/test origin-key sets and the star-target set.
 *  Runs in the same ~10s envelope as the old name pass — getModuleSpecifierSourceFile is memoized by
 *  ts-morph after the first resolve. With `{ edges: true }` it ALSO builds the declaration-granular
 *  consumption map, at the cost of one identifier walk per file; the liveness sets are identical either
 *  way (pinned in tests/tooling/ast-lens.test.ts, both arms). */
export function buildLiveness(project: SourceCorpus, options: LivenessOptions = NO_EDGES): Liveness {
  const usedClientProd = new Set<string>();
  const usedServerProd = new Set<string>();
  const usedTest = new Set<string>();
  const starTargets = new Set<string>();
  const arms = new Map<string, Set<ConsumptionArm>>();
  const namespaceSites: NamespaceSite[] = [];
  const consumers = new Map<string, Set<string>>();
  const record: ArmRecorder = (key, arm) => {
    const set = arms.get(key) ?? new Set<ConsumptionArm>();
    set.add(arm);
    arms.set(key, set);
  };
  for (const sf of project.getSourceFiles()) {
    const fp = sf.getFilePath();
    // Prod consumption is bucketed by the IMPORTING file's package (client vs everything-else); a test
    // path always wins into usedTest. clientgap reads the split; orphans/testonly/prodonly read the union.
    const bucket = prodBucketFor(fp, { usedTest, usedClientProd, usedServerProd });
    for (const imp of sf.getImportDeclarations()) {
      markImportConsumption(imp, { bucket, record, namespaceSites });
    }
    collectStarTargets(sf, starTargets);
    markDynamicImports(sf, project, bucket, record);
    if (options.edges) {
      recordDeclarationEdges(sf, project, consumers);
    }
  }
  const usedProd = new Set<string>([...usedClientProd, ...usedServerProd]);
  return { usedProd, usedClientProd, usedServerProd, usedTest, starTargets, arms, namespaceSites, consumers };
}
