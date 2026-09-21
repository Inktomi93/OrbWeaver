// DECLARATION-GRANULAR consumption edges — the chains substrate (parallel + opt-in).
import type { BindingElement, ImportDeclaration, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import type { SourceCorpus } from "../../_shared/ts-workspace.ts";
import { declKey, exposedNames } from "./keys.ts";
import { resolveModule } from "./resolve.ts";
import { KEY_SEP } from "./root.ts";

// ── DECLARATION-GRANULAR consumption edges (the substrate `chains` needs, and nothing else reads) ──────
// Everything above attributes consumption at FILE granularity: `markImportConsumption` records that SOME
// import in file F reached origin key K, and `Liveness.arms` records WHICH ARM did it — never which
// DECLARATION inside F holds the consuming reference. That is exactly enough for orphans/testonly/clientgap/
// swallowed, all of which ask "does anything reach K?", and exactly NOT enough for the alias-rabbit-hole
// class: `export const Y = X` inside an otherwise-live file keeps X alive forever, even when nothing
// consumes Y. A FILE-level fixpoint cannot see it — it degenerates into iterated `prodonly` and reports the
// head of the chain only. The edge therefore has to name the DECLARATION a consuming reference sits inside.
//
// THE EDGE IS PARALLEL AND OPT-IN; both halves are load-bearing.
//   • PARALLEL — a new map on `Liveness`, never a change to usedProd/usedClientProd/usedServerProd/usedTest/
//     starTargets/arms/namespaceSites. The push-tier `deps:orphan-ratchet` judges the SAME candidate set the
//     `orphans` verb prints, so perturbing those sets is a GATE regression, not a lens change. Both arms are
//     pinned identical in the self-test, and the whole-workspace digests were diffed before/after (0 bytes).
//   • OPT-IN — it costs one identifier walk per source file, which the ratchet must not pay for a map it
//     never reads. `buildLiveness(project)` is unchanged in output AND in cost.
//
// HOW A REFERENCE IS ATTRIBUTED — syntactically, by ANCESTRY. Not the language service: `findReferences` per
// import specifier is the `refs` verb's cost times every import in the workspace, which would price the
// substrate out of existence. One identifier pass per file builds `local name → the keys of the TOP-LEVEL
// declarations whose subtree spells it`, and then:
//   1. an occurrence directly under a module-scope statement (`createRoot(el).render(<App/>)`, a bare call,
//      a top-level `if`) attributes to the file's MODULE-SCOPE key — a side-effect position no declaration
//      owns, and an unconditional ALIVE root for the fixpoint (nothing can make a side effect dead);
//   2. import/export SPECIFIER positions are SKIPPED outright. A specifier is where a name TRAVELS, never
//      where it is used — the rule `typeonly-alive`'s NEUTRAL_REF_KINDS already states. Counting
//      `import { X } from …` as a module-scope use would make every import an alive root and the whole
//      fixpoint a no-op (measured: it reports zero chains);
//   3. each import's local binding resolves to ORIGIN keys through `getExportedDeclarations()` — the same
//      hop the liveness uses, so a renaming barrel cannot fork the identity — and every consumer key of that
//      local name becomes an edge into each origin key. A namespace or dynamic import spreads the whole
//      target surface across the consumers of its alias / of the `import()` call (err alive, exactly as
//      `markModuleAlive` does);
//   4. SAME-FILE consumption rides the same map: a top-level declaration's own name looked up in it, minus
//      its own key (a self-reference is not life). This is `isReferencedInOwnFile` at declaration
//      granularity — the arm that turns an intra-file hop (`const Y = X; export const Z = Y`) into a visible
//      chain instead of a wall. NON-exported top-level declarations are nodes too: a chain that launders
//      itself through a file-local helper is the same defect.
//
// KNOWN OVER-ATTRIBUTION, stated so a reader can price a verdict: the in-file pass is NAME-based, so a local
// binding that SHADOWS an imported name, and a property-access tail (`obj.foo`) that happens to match one,
// both donate their enclosing declaration as a consumer. That direction is deliberate. An extra edge can only
// make a declaration look MORE alive, and a lens that nominates code for deletion must never err the other way.
/** The `<file>\0module` sentinel for a consuming reference at MODULE SCOPE — a side-effect position no
 *  declaration owns. Cannot collide with a `declKey`, whose second half is always a decimal offset. */
const MODULE_SCOPE_MARK = "module";

function moduleScopeKey(sf: SourceFile): string {
  return `${sf.getFilePath()}${KEY_SEP}${MODULE_SCOPE_MARK}`;
}

/** True for the module-scope sentinel — the fixpoint's unconditional alive root. */
export function isModuleScopeKey(key: string): boolean {
  return key.endsWith(`${KEY_SEP}${MODULE_SCOPE_MARK}`);
}

/** The FILE half of any key this substrate mints (a `declKey` or the module-scope sentinel). */
export function fileOfKey(key: string): string {
  const cut = key.lastIndexOf(KEY_SEP);
  return cut < 0 ? key : key.slice(0, cut);
}

/** Top-level statements whose identifiers are pure BINDING HOPS, never uses (see attribution rule 2).
 *
 *  `export default` splits: `export default someLocal` IS a hop (the local and the default export are the
 *  same declaration — `getExportedDeclarations()` resolves "default" straight to it, so counting the
 *  re-export as a use would make every default-exported symbol self-alive). `export default <expression>`
 *  is NOT: `export default { value: helper() }` genuinely CONSUMES `helper`, and skipping it left that
 *  reference attributed to nobody — the under-attribution direction, the one a lens nominating code for
 *  deletion must never take. A non-identifier default lands at module scope (an alive root), erring alive. */
function isBindingHopStatement(stmt: Node): boolean {
  if (Node.isExportAssignment(stmt)) {
    return Node.isIdentifier(stmt.getExpression());
  }
  return Node.isImportDeclaration(stmt) || Node.isExportDeclaration(stmt);
}

/** The identifier `BindingElement`s of a DESTRUCTURING declaration (`export const { a, b: c } = …`); empty
 *  for a plain `const x = …`.
 *
 *  THE IDENTITY RULE THIS ENFORCES (caught by the lens's own first audit, 2026-08-03): the whole substrate
 *  keys on the node `getExportedDeclarations()` hands back, and for a destructured export that node is the
 *  BindingElement — NOT the VariableDeclaration, whose `getName()` is the pattern text `"{ useAppForm }"`.
 *  Keying the node side on the VariableDeclaration while the consumer side keyed on the BindingElement forked
 *  the identity exactly the way a bare NAME does, and reported the entire `useAppForm` form kit — 32
 *  declarations, every bound field component in the client — as one chain-dead subtree. */
function boundElementsOf(decl: Node): BindingElement[] {
  if (!Node.isVariableDeclaration(decl) || Node.isIdentifier(decl.getNameNode())) {
    return [];
  }
  return decl.getDescendantsOfKind(SyntaxKind.BindingElement).filter((element) => Node.isIdentifier(element.getNameNode()));
}

/** The keys of the top-level DECLARATION(s) a statement declares, or empty when it declares nothing (an
 *  expression statement, an `if`, a `for` — a module-scope side-effect position). For a `VariableStatement`
 *  the declarator is chosen BY POSITION, so `const a = 1, b = usesX()` attributes to `b`; a DESTRUCTURING
 *  declarator yields EVERY bound element, because its initializer's consumption is kept alive by any one of
 *  the names it binds (`const { useAppForm } = createFormHook({ … })` — the registered field components are
 *  alive iff `useAppForm` is). */
function topLevelDeclarationKeys(stmt: Node, at: Node): string[] {
  if (Node.isVariableStatement(stmt)) {
    const pos = at.getStart();
    const decls = stmt.getDeclarations();
    const hit = decls.find((d) => d.getStart() <= pos && pos < d.getEnd()) ?? decls[0];
    if (hit === undefined) {
      return [];
    }
    const bound = boundElementsOf(hit);
    return bound.length > 0 ? bound.map((element) => declKey(element)) : [declKey(hit)];
  }
  const declares =
    Node.isFunctionDeclaration(stmt) ||
    Node.isClassDeclaration(stmt) ||
    Node.isEnumDeclaration(stmt) ||
    Node.isInterfaceDeclaration(stmt) ||
    Node.isTypeAliasDeclaration(stmt);
  return declares && stmt.getName() !== undefined ? [declKey(stmt)] : [];
}

/** The consumer keys a reference at `node` belongs to: the top-level declaration(s) whose subtree holds it,
 *  or the file's module-scope sentinel. EMPTY for a binding-hop position (skip it entirely). */
function consumerKeysOf(node: Node, sf: SourceFile): string[] {
  let statement: Node = node;
  let parent = statement.getParent();
  while (parent !== undefined && !Node.isSourceFile(parent)) {
    statement = parent;
    parent = statement.getParent();
  }
  if (parent === undefined || isBindingHopStatement(statement)) {
    return [];
  }
  const keys = topLevelDeclarationKeys(statement, node);
  return keys.length > 0 ? keys : [moduleScopeKey(sf)];
}

/** `local name → the consumer keys that spell it`, for ONE file. The single identifier pass both edge arms
 *  read; building it once is what keeps the whole substrate to one walk per file. */
function consumerSitesOf(sf: SourceFile): Map<string, Set<string>> {
  const sites = new Map<string, Set<string>>();
  for (const id of sf.getDescendantsOfKind(SyntaxKind.Identifier)) {
    const text = id.getText();
    const set = sites.get(text) ?? new Set<string>();
    for (const key of consumerKeysOf(id, sf)) {
      set.add(key);
    }
    if (set.size > 0) {
      sites.set(text, set);
    }
  }
  return sites;
}

/** Record `originKey ← consumerKey`. A self-edge (a declaration spelling its own name) is dropped: a
 *  declaration cannot keep itself alive, which is the property that makes the fixpoint terminate on a
 *  self-recursive function instead of calling it live. */
function addConsumerEdge(consumers: Map<string, Set<string>>, originKey: string, consumerKey: string): void {
  if (originKey === consumerKey) {
    return;
  }
  const set = consumers.get(originKey) ?? new Set<string>();
  set.add(consumerKey);
  consumers.set(originKey, set);
}

/** Link every consumer of a local binding to the ORIGIN declarations the exported name resolves to. */
function linkLocalBinding(target: SourceFile, exportName: string, consumerKeys: ReadonlySet<string> | undefined, consumers: Map<string, Set<string>>): void {
  if (consumerKeys === undefined || consumerKeys.size === 0) {
    return;
  }
  for (const decl of target.getExportedDeclarations().get(exportName) ?? []) {
    const originKey = declKey(decl);
    for (const consumerKey of consumerKeys) {
      addConsumerEdge(consumers, originKey, consumerKey);
    }
  }
}

/** ONE static import's declaration-granular edges. A namespace import spreads the target's WHOLE export
 *  surface across the consumers of its alias — the err-alive arm, unchanged in spirit from markModuleAlive. */
function recordImportEdges(imp: ImportDeclaration, sites: ReadonlyMap<string, Set<string>>, consumers: Map<string, Set<string>>): void {
  const target = imp.getModuleSpecifierSourceFile();
  if (target === undefined) {
    return;
  }
  const ns = imp.getNamespaceImport();
  if (ns !== undefined) {
    const consumerKeys = sites.get(ns.getText());
    for (const originKey of exposedNames(target).keys()) {
      for (const consumerKey of consumerKeys ?? []) {
        addConsumerEdge(consumers, originKey, consumerKey);
      }
    }
    return;
  }
  for (const spec of imp.getNamedImports()) {
    linkLocalBinding(target, spec.getName(), sites.get(spec.getAliasNode()?.getText() ?? spec.getName()), consumers);
  }
  const byDefault = imp.getDefaultImport();
  if (byDefault !== undefined) {
    linkLocalBinding(target, "default", sites.get(byDefault.getText()), consumers);
  }
}

/** The workspace file a `import("…")` CALL resolves to, or undefined when the node is not a dynamic import
 *  of a string literal this resolver can follow. */
export function dynamicImportTargetOf(call: Node, sf: SourceFile, project: SourceCorpus): SourceFile | undefined {
  if (!Node.isCallExpression(call) || call.getExpression().getKind() !== SyntaxKind.ImportKeyword) {
    return;
  }
  const arg = call.getArguments()[0];
  if (arg === undefined || !Node.isStringLiteral(arg)) {
    return;
  }
  return resolveModule(project, sf.getDirectoryPath(), arg.getLiteralText());
}

/** A dynamic `import()` keeps its target's whole surface alive — attributed to the declaration holding the
 *  CALL, which is finer than the import-edge arm can be (that one only knows the file). */
function recordDynamicImportEdges(sf: SourceFile, project: SourceCorpus, consumers: Map<string, Set<string>>): void {
  for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
    const target = dynamicImportTargetOf(call, sf, project);
    if (target === undefined) {
      continue;
    }
    for (const consumerKey of consumerKeysOf(call, sf)) {
      markModuleEdges(target, consumerKey, consumers);
    }
  }
}

/** Every export of `target` gains `consumerKey` as a consumer — the whole-surface arm shared by the
 *  namespace-import and dynamic-import edges (err alive, exactly as `markModuleAlive` does). */
function markModuleEdges(target: SourceFile, consumerKey: string, consumers: Map<string, Set<string>>): void {
  for (const decls of target.getExportedDeclarations().values()) {
    for (const decl of decls) {
      addConsumerEdge(consumers, declKey(decl), consumerKey);
    }
  }
}

/** Every TOP-LEVEL declaration of a file, exported or not. A non-exported helper is a real hop in a chain —
 *  a rabbit hole that launders itself through a file-local alias is the same defect as one that exports it. */
/** ONE `const`/`let` statement's declarations: a plain declarator yields itself, a destructuring one yields
 *  every bound element (the identity `getExportedDeclarations()` hands back — see {@link boundElementsOf}). */
function* variableStatementDeclarations(stmt: Node): Generator<{ name: string; decl: Node }> {
  if (!Node.isVariableStatement(stmt)) {
    return;
  }
  for (const decl of stmt.getDeclarations()) {
    const bound = boundElementsOf(decl);
    if (bound.length === 0) {
      yield { name: decl.getName(), decl };
      continue;
    }
    for (const element of bound) {
      yield { name: element.getNameNode().getText(), decl: element };
    }
  }
}

/** The non-`const` top-level declaration kinds, each its own statement and its own name. */
function namedStatementDeclaration(stmt: Node): { name: string; decl: Node } | undefined {
  const named =
    Node.isFunctionDeclaration(stmt) ||
    Node.isClassDeclaration(stmt) ||
    Node.isEnumDeclaration(stmt) ||
    Node.isInterfaceDeclaration(stmt) ||
    Node.isTypeAliasDeclaration(stmt);
  const name = named ? stmt.getName() : undefined;
  return name === undefined ? undefined : { name, decl: stmt };
}

export function* topLevelDeclarations(sf: SourceFile): Generator<{ name: string; decl: Node }> {
  for (const stmt of sf.getStatements()) {
    yield* variableStatementDeclarations(stmt);
    const named = namedStatementDeclaration(stmt);
    if (named !== undefined) {
      yield named;
    }
  }
}

/** Every declaration-granular edge ONE file contributes: its import bindings resolved to origins, its
 *  dynamic-import targets, and its own top-level declarations' same-file uses. */
export function recordDeclarationEdges(sf: SourceFile, project: SourceCorpus, consumers: Map<string, Set<string>>): void {
  const sites = consumerSitesOf(sf);
  for (const imp of sf.getImportDeclarations()) {
    recordImportEdges(imp, sites, consumers);
  }
  recordDynamicImportEdges(sf, project, consumers);
  for (const { name, decl } of topLevelDeclarations(sf)) {
    const originKey = declKey(decl);
    for (const consumerKey of sites.get(name) ?? []) {
      addConsumerEdge(consumers, originKey, consumerKey);
    }
  }
}
