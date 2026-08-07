// Gate: freeze-provenance-write-pairing — a `message_variants` write that touches the D129-F provenance triple
// must write ALL of it. An UPDATE that replaces `content` and leaves `rawContent`/`macroFreezes` attached claims
// a provenance for bytes that no longer exist (the 2026-08-07 editMessage finding); half a pair is unreplayable.
// ARMS: CONTENT-WITHOUT-PROVENANCE · HALF-PAIR · UNREADABLE-OBJECT (fail-closed) · UNRESOLVED-TABLE tripwire ·
// BLINDNESS (schema gone/renamed · 0 sites). Reaches `.set`/`.values`/`onConflictDoUpdate({set})` through table
// identity by BINDING (import aliases, cross-module re-export renames, const aliases) and builder factories.
// LIMIT (owes a mustPass row): `tests/**` is outside scanRoot — scanning it would red this gate's own proofs.
import type { ObjectLiteralExpression, SourceFile } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { readStringValue, unwrapExpression } from "../ast-read.ts";
import type { GateDescriptor, GateRunCtx } from "../contract.ts";
import { fileLoaded } from "../pass.ts";

/** The drizzle table symbol every write goes through. Keyed BY NAME, so §4.6's blindness tripwire below is
 *  mandatory: a rename must RED, never turn this gate into a no-op that reports ✓ forever. */
const TABLE = "messageVariants";
const CONTENT = "content";
const RAW = "rawContent";
const FREEZES = "macroFreezes";
/** The three columns that describe ONE body. Written together or not at all. */
const TRIPLE: readonly string[] = [CONTENT, RAW, FREEZES];
/** The column-name derivation's home — read on the real tree so a renamed/dropped column reds (§3, §4.6). */
const SCHEMA_HOME = "packages/db/src/schema/chat.ts";
/** Real-tree anchor for the blindness arms: present on every real run, never planted by an example except the
 *  ones that PROVE blindness. `ctx.scope.kind === "project"` is TRUE in conformance mini-projects too (§4.5). */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
const GATE_SELF = "scripts/check/gates/freeze-provenance-write-pairing.ts";
/** Resolution depth cap. canon-write's deepest real chain is `.values(variantColumns(…))` → the returned
 *  object literal → `...freezeProvenanceColumns(…)` → its returned object literal = 4. */
const MAX_DEPTH = 6;

const MESSAGE =
  "a `message_variants` write that touches the D129-F freeze-provenance triple (`content`/`rawContent`/" +
  "`macroFreezes`) must write ALL of it. An UPDATE — including an upsert's `onConflictDoUpdate({ set })`, " +
  "which lands on an already-existing row — that replaces `content` while leaving the pair attached serves a " +
  "host a record describing bytes that are gone (the editMessage finding, 2026-08-07: an edit that typed the " +
  "raw text back in left `raw_content` non-null AND equal to `content`, the one shape the storage rule " +
  "forbids). The pair is written together or not at all, on INSERT and UPDATE alike; half of it is provenance " +
  "nothing can replay. A write object this gate cannot READ, and a builder whose TABLE argument it cannot " +
  "read, are both REFUSED rather than assumed — build them in the same module. The rule + why the reverse " +
  "reading is not claimed: packages/server/src/domain/chat/persistence/canon-write.ts.";

const FIX =
  "spread `CLEARED_FREEZE_PROVENANCE` into the `.set()` (a non-freeze content write drops the replaced body's " +
  "provenance) or `freezeProvenanceColumns(content, raw, freezes)` (the freeze itself) — both in " +
  "packages/server/src/domain/chat/persistence/canon-write.ts. An INSERT may omit BOTH columns (DB NULL is " +
  "honest absence) and a clear-only UPDATE writing BOTH to null is fine; neither may carry one without the " +
  "other. If the finding names an unreadable table/object, name the table INLINE at the builder and build the " +
  "payload in the same module — this gate refuses what it cannot prove.";

/** No local allowlist ON PURPOSE: the only sanctioned key would be a repo-relative PATH, and that exempts the
 *  whole one-home writer file — coarser than the defect. The escape hatch is the shared node-anchored
 *  `@orb-gate-ignore freeze-provenance-write-pairing(<method>): <reason>` marker, whose bare/stale/over-
 *  exempting arms `gate-ignore-inventory` already owns (§4.3/§4.4). Findings ride the NODE overload so that
 *  marker is honoured (§1 — the Finding overload would silently defeat it), and each names its POSITION (§4.3a):
 *  ONE chained statement can carry `.values(…)` AND `.onConflictDoUpdate(…)` on a single line, so a bare marker
 *  there would absolve both halves of an upsert. The method name IS the position. */
type WriteKind = "update" | "insert";

/** The three call shapes that write columns, and which rule judges each. `onConflictDoUpdate`'s `set` lands on
 *  an ALREADY-EXISTING row, so it is an UPDATE — the repo's house upsert idiom (20+ live call sites across 10
 *  files) and the shape most likely to be how the next `message_variants` writer spells itself.
 *  A Record, not a switch: §7 — a switch over this union forces a suppression on the unreachable default. */
const KIND_BY_METHOD: Record<string, WriteKind | undefined> = { set: "update", values: "insert", onConflictDoUpdate: "update" };

/** How many `messageVariants` write calls the scan saw — the §4.6 blindness counter. A tree with ZERO is a
 *  renamed table / moved writers, not a clean tree. */
let writeSites = 0;

/** Extra alias names the corpus itself proves denote the table (`export { messageVariants as X }`), derived once
 *  per run in `begin`. The BELT to the import-chain resolver's braces: the chain is exact but needs the
 *  re-exporting module to load, and this net needs only that the module be in the scanned corpus. Two
 *  independent methods, the house standard for a claim that something is NOT there. */
const derivedAliases = new Set<string>();
/** Names of functions the corpus proves RETURN a builder for this table (`function b(db){return db.update(mv)}`),
 *  same derivation, same reason: it closes the factory shape even where a module specifier will not resolve. */
const derivedBuilders = new Set<string>();
/** Fixpoint passes for chained aliases (`const A = messageVariants; const B = A;`). Loops exit early on a pass
 *  that adds nothing; the cap only bounds a pathological chain, which degrades to an UNRESOLVED red, not a pass. */
const RESOLUTION_PASSES = 4;

/** The single same-file declaration named `name`, or undefined when there is none — or MORE THAN ONE, which is
 *  a shadowed name this reader must not guess at (fail closed, the caller marks the object unreadable). */
function localValue(sf: SourceFile, name: string): Node | undefined {
  const vars = sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration).filter((d) => d.getName() === name);
  const fns = sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration).filter((f) => f.getName() === name);
  if (vars.length + fns.length !== 1) {
    return;
  }
  return vars[0]?.getInitializer() ?? fns[0];
}

/** The ImportSpecifier binding `name` in this file, when there is exactly one. */
function importBinding(sf: SourceFile, name: string): { readonly imported: string; readonly from: SourceFile | undefined } | undefined {
  const hits = sf
    .getDescendantsOfKind(SyntaxKind.ImportSpecifier)
    .filter((spec) => (spec.getAliasNode()?.getText() ?? spec.getName()) === name)
    .map((spec) => ({ imported: spec.getName(), from: spec.getImportDeclaration().getModuleSpecifierSourceFile() }));
  return hits.length === 1 ? hits[0] : undefined;
}

/** What a module actually EXPORTS under `name`, followed to the declaration that owns it: through
 *  `export { X as name } from "…"` re-export renames and through `export * from "…"` barrels. Returns the
 *  DECLARED name at the end of the chain — `@orb/db`'s `messageVariants` resolves to `messageVariants` no matter
 *  how many barrels it crossed, and a rename to `variants` still ends at `messageVariants`. */
function exportedOrigin(sf: SourceFile, name: string, depth: number): string | undefined {
  if (depth > MAX_DEPTH) {
    return;
  }
  for (const decl of sf.getExportDeclarations()) {
    const named = decl.getNamedExports();
    const target = decl.getModuleSpecifierSourceFile();
    const spec = named.find((s) => (s.getAliasNode()?.getText() ?? s.getName()) === name);
    if (spec !== undefined) {
      const inner = spec.getName();
      return target === undefined ? inner : (exportedOrigin(target, inner, depth + 1) ?? inner);
    }
    const star = named.length === 0 && target !== undefined ? exportedOrigin(target, name, depth + 1) : undefined;
    if (star !== undefined) {
      return star;
    }
  }
  return sf.getVariableDeclaration(name) === undefined && sf.getFunction(name) === undefined ? undefined : name;
}

/** THE TABLE-IDENTITY QUESTION, answered by BINDING rather than by spelling: what declaration does this
 *  identifier ultimately name? A local `const T = messageVariants` hops to its initializer; an import hops
 *  through the module's export chain (`import { variants }` → `export { messageVariants as variants }` →
 *  `messageVariants`); an import whose module will not load falls back to the name it IMPORTED, which is what
 *  makes `import { messageVariants as mv }` resolve even in a conformance mini-project with no `@orb/db` on
 *  disk. Undefined = the chain could not be followed at all — the caller fails closed. */
function identifierOrigin(name: string, sf: SourceFile, depth: number): string | undefined {
  if (depth > MAX_DEPTH) {
    return;
  }
  const imported = importBinding(sf, name);
  if (imported !== undefined) {
    const viaModule = imported.from === undefined ? undefined : exportedOrigin(imported.from, imported.imported, depth + 1);
    return viaModule ?? imported.imported;
  }
  const value = localValue(sf, name);
  const inner = value === undefined ? undefined : unwrapExpression(value);
  if (inner !== undefined && Node.isIdentifier(inner)) {
    return identifierOrigin(inner.getText(), sf, depth + 1);
  }
  return value === undefined ? undefined : name;
}

/** Does this identifier denote the guarded table? Belt (binding chain) AND braces (the corpus-derived alias
 *  net) — either says yes and it is our table. */
function isTableIdentifier(name: string, sf: SourceFile): boolean {
  return name === TABLE || derivedAliases.has(name) || identifierOrigin(name, sf, 0) === TABLE;
}

function isFunctionish(node: Node): boolean {
  return Node.isFunctionDeclaration(node) || Node.isArrowFunction(node) || Node.isFunctionExpression(node) || Node.isMethodDeclaration(node);
}

/** Every expression this function RETURNS (its own returns only — a nested closure's are not this one's). A
 *  concise arrow's body is its single return. */
function returnedExpressions(fn: Node): readonly Node[] {
  if (Node.isArrowFunction(fn) && !Node.isBlock(fn.getBody())) {
    return [fn.getBody()];
  }
  if (!isFunctionish(fn)) {
    return [];
  }
  const out: Node[] = [];
  for (const ret of fn.getDescendantsOfKind(SyntaxKind.ReturnStatement)) {
    const expr = ret.getExpression();
    if (expr !== undefined && ret.getFirstAncestor(isFunctionish) === fn) {
      out.push(expr);
    }
  }
  return out;
}

/** The accumulated verdict for one write object: which column names it sets, and whether every part of it was
 *  READABLE. `readable: false` is fail-closed — an object whose keys cannot be derived is refused. */
type Acc = { readonly names: Set<string>; readable: boolean };

/** The authored key of one property — through a string-literal name (`"content": x`). */
function propertyKey(prop: Node): string | undefined {
  if (Node.isShorthandPropertyAssignment(prop)) {
    return prop.getName();
  }
  if (!Node.isPropertyAssignment(prop)) {
    return;
  }
  const nameNode = prop.getNameNode();
  if (Node.isComputedPropertyName(nameNode)) {
    return; // a computed column name is unreadable, not absent
  }
  return readStringValue(nameNode) ?? nameNode.getText();
}

/** One resolution step's context: the module we may resolve names in, how deep we already are, and the names
 *  already being resolved (the cycle guard). Carried as ONE param so the folders stay inside the 4-arg cap. */
type Res = { readonly sf: SourceFile; readonly depth: number; readonly seen: ReadonlySet<string> };

/** The next step down, optionally entering `name` (which then cannot be re-entered). */
function deeper(res: Res, name?: string): Res {
  return { sf: res.sf, depth: res.depth + 1, seen: name === undefined ? res.seen : new Set([...res.seen, name]) };
}

function objectInto(acc: Acc, obj: ObjectLiteralExpression, res: Res): void {
  for (const prop of obj.getProperties()) {
    if (Node.isSpreadAssignment(prop)) {
      mergeInto(acc, prop.getExpression(), deeper(res));
      continue;
    }
    const key = propertyKey(prop);
    if (key === undefined) {
      acc.readable = false;
      continue;
    }
    acc.names.add(key);
  }
}

/** `...NAME` / a bare identifier value — resolved one hop through its same-module declaration. */
function identifierInto(acc: Acc, ident: Node, res: Res): void {
  const name = ident.getText();
  const value = res.seen.has(name) ? undefined : localValue(res.sf, name);
  if (value === undefined) {
    acc.readable = false;
    return;
  }
  mergeInto(acc, value, deeper(res, name));
}

/** `...f(…)` / `.values(f(…))` — the union of every object literal `f` returns (a conditional writer "may
 *  write" each key, which is the conservative read for a pairing rule). */
function callInto(acc: Acc, call: Node, res: Res): void {
  const callee = Node.isCallExpression(call) ? unwrapExpression(call.getExpression()) : call;
  const name = Node.isIdentifier(callee) ? callee.getText() : undefined;
  const fn = name === undefined || res.seen.has(name) ? undefined : localValue(res.sf, name);
  const returns = fn === undefined ? [] : returnedExpressions(fn);
  if (returns.length === 0 || name === undefined) {
    acc.readable = false;
    return;
  }
  const next = deeper(res, name);
  for (const ret of returns) {
    mergeInto(acc, ret, next);
  }
}

/** Fold one expression's column keys into `acc`, seeing THROUGH `as`/`satisfies`/parens (§5's literal-shape
 *  blindness class), object/array/ternary composition, and one-module identifier + call resolution. */
function mergeInto(acc: Acc, node: Node, res: Res): void {
  if (res.depth > MAX_DEPTH) {
    acc.readable = false;
    return;
  }
  const n = unwrapExpression(node);
  if (Node.isObjectLiteralExpression(n)) {
    objectInto(acc, n, res);
    return;
  }
  if (Node.isArrayLiteralExpression(n)) {
    for (const el of n.getElements()) {
      mergeInto(acc, el, deeper(res));
    }
    return;
  }
  if (Node.isConditionalExpression(n)) {
    mergeInto(acc, n.getWhenTrue(), deeper(res));
    mergeInto(acc, n.getWhenFalse(), deeper(res));
    return;
  }
  if (Node.isIdentifier(n)) {
    identifierInto(acc, n, res);
    return;
  }
  if (Node.isCallExpression(n)) {
    callInto(acc, n, res);
    return;
  }
  acc.readable = false;
}

/** The single object literal an expression denotes, resolved the same one-module way `mergeInto` resolves keys
 *  — needed to reach INTO `onConflictDoUpdate({ target, set })` for the `set` payload. A call with more than
 *  one distinct return is deliberately unresolved: guessing which one the caller meant is the clever-and-wrong
 *  arm. */
function resolveObjectLiteral(node: Node, res: Res): ObjectLiteralExpression | undefined {
  if (res.depth > MAX_DEPTH) {
    return;
  }
  const n = unwrapExpression(node);
  if (Node.isObjectLiteralExpression(n)) {
    return n;
  }
  if (Node.isIdentifier(n)) {
    const name = n.getText();
    const value = res.seen.has(name) ? undefined : localValue(res.sf, name);
    return value === undefined ? undefined : resolveObjectLiteral(value, deeper(res, name));
  }
  if (!Node.isCallExpression(n)) {
    return;
  }
  const callee = unwrapExpression(n.getExpression());
  const name = Node.isIdentifier(callee) ? callee.getText() : undefined;
  const fn = name === undefined || res.seen.has(name) ? undefined : localValue(res.sf, name);
  const returns = fn === undefined ? [] : returnedExpressions(fn);
  const only = returns.length === 1 ? returns[0] : undefined;
  return only === undefined ? undefined : resolveObjectLiteral(only, deeper(res, name));
}

/** THE UPSERT ARM's payload: `onConflictDoUpdate({ target, set })` writes columns on an ALREADY-EXISTING row,
 *  so its `set` object is judged by the UPDATE rule. Undefined = the config could not be read (a spread config,
 *  a foreign builder) and the caller fails closed — never a silent skip, which is exactly what let this whole
 *  shape through the first pass. */
function conflictSetNode(arg: Node, res: Res): Node | undefined {
  const prop = resolveObjectLiteral(arg, res)?.getProperty("set");
  return prop !== undefined && Node.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
}

/** A write chain's verdict. `ours` = it targets the guarded table. `unresolved` = an `update(…)`/`insert(…)`
 *  builder WAS found but its table argument could not be resolved to any declaration (a namespace read, a
 *  computed lookup) — ARM 5 turns that into a RED rather than a silent pass. `undefined` (no verdict at all)
 *  = no drizzle write builder in the chain: a `map.set(…)`, a foreign fluent API, not our business. */
type ChainVerdict = "ours" | "other" | "unresolved";

/** What table a drizzle write chain targets, resolved through builder hoists, factory calls (same-module AND
 *  imported) and the table identifier's own binding chain. */
function tableRef(receiver: Node, sf: SourceFile, depth: number): ChainVerdict | undefined {
  if (depth > MAX_DEPTH) {
    return;
  }
  const n = unwrapExpression(receiver);
  if (Node.isIdentifier(n)) {
    const value = localValue(sf, n.getText()); // `const q = db.update(mv); q.set(…)`
    return value === undefined ? undefined : tableRef(value, sf, depth + 1);
  }
  if (!Node.isCallExpression(n)) {
    return;
  }
  const callee = unwrapExpression(n.getExpression());
  if (Node.isIdentifier(callee)) {
    return builderFactoryRef(callee.getText(), n.getArguments(), sf, depth);
  }
  if (!Node.isPropertyAccessExpression(callee)) {
    return;
  }
  const verb = callee.getName();
  if (verb !== "update" && verb !== "insert") {
    return tableRef(callee.getExpression(), sf, depth + 1); // `.values(…)` under `.onConflictDoUpdate(…)`, `.where(…)`, …
  }
  const arg0 = n.getArguments()[0];
  const named = arg0 === undefined ? undefined : unwrapExpression(arg0);
  if (named === undefined || !Node.isIdentifier(named)) {
    return "unresolved";
  }
  return isTableIdentifier(named.getText(), sf) ? "ours" : "other";
}

/** `makeUpdate(db).set(…)` — a function that RETURNS a builder, resolved for the same reason the `const q =
 *  db.update(…)` hoist is: an indirection is not an escape hatch. Three ways in, cheapest first: the
 *  corpus-derived builder-name net, the same-module declaration, and an IMPORTED declaration followed through
 *  its module. The call's own arguments are scanned too, so `run(db.update(mv))` is seen. */
function builderFactoryRef(name: string, args: readonly Node[], sf: SourceFile, depth: number): ChainVerdict | undefined {
  if (derivedBuilders.has(name)) {
    return "ours";
  }
  const imported = importBinding(sf, name);
  const foreign = imported?.from;
  const declaring = foreign ?? sf;
  const declared = foreign === undefined || imported === undefined ? localValue(sf, name) : localValue(foreign, imported.imported);
  const returns = declared === undefined ? [] : returnedExpressions(declared);
  return firstVerdict(returns, declaring, depth) ?? firstVerdict(args, sf, depth);
}

/** The first expression in `nodes` that resolves to a write chain at all. ONE return path: tsc's
 *  `noImplicitReturns` wants every path to return, biome calls a trailing bare `return;` useless — an
 *  accumulator satisfies both without suppressing either (the pass.ts idiom). */
function firstVerdict(nodes: readonly Node[], sf: SourceFile, depth: number): ChainVerdict | undefined {
  let hit: ChainVerdict | undefined;
  for (const candidate of nodes) {
    if (hit === undefined) {
      hit = tableRef(candidate, sf, depth + 1);
    }
  }
  return hit;
}

/** Does this file mention any name that could denote the table? The cheap text pre-filter in front of every
 *  corpus derivation below — and ARM 5's relevance test. */
function mentionsTable(sf: SourceFile): boolean {
  const text = sf.getFullText();
  return text.includes(TABLE) || [...derivedAliases].some((a) => text.includes(a));
}

/** CORPUS DERIVATION 1 — every name the loaded tree proves is this table: a re-export rename
 *  (`export { messageVariants as variants }`), an import alias, a module-level `const T = <one of those>`.
 *  Run to a fixpoint in `begin`, so a rename anywhere in the corpus is known before the first verdict. */
function deriveAliases(files: readonly SourceFile[]): void {
  derivedAliases.clear();
  for (let pass = 0; pass < RESOLUTION_PASSES; pass += 1) {
    const before = derivedAliases.size;
    for (const sf of files.filter((f) => mentionsTable(f))) {
      aliasSpecifiersInto(sf);
      aliasConstsInto(sf);
    }
    if (derivedAliases.size === before) {
      return;
    }
  }
}

/** `import { messageVariants as mv }` / `export { messageVariants as variants }` — one pass over one file. */
function aliasSpecifiersInto(sf: SourceFile): void {
  const specs = [...sf.getDescendantsOfKind(SyntaxKind.ImportSpecifier), ...sf.getDescendantsOfKind(SyntaxKind.ExportSpecifier)];
  for (const spec of specs) {
    const alias = spec.getAliasNode()?.getText();
    if (alias !== undefined && isKnownAlias(spec.getName())) {
      derivedAliases.add(alias);
    }
  }
}

/** `const T = messageVariants` — one pass over one file. */
function aliasConstsInto(sf: SourceFile): void {
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    const from = init === undefined ? undefined : unwrapExpression(init);
    if (from !== undefined && Node.isIdentifier(from) && isKnownAlias(from.getText())) {
      derivedAliases.add(decl.getName());
    }
  }
}

function isKnownAlias(name: string): boolean {
  return name === TABLE || derivedAliases.has(name);
}

/** Every named function/arrow in one file, with the name a caller would spell. */
function namedFunctions(sf: SourceFile): readonly { readonly name: string; readonly fn: Node }[] {
  const out: { name: string; fn: Node }[] = [];
  for (const fn of sf.getDescendantsOfKind(SyntaxKind.FunctionDeclaration)) {
    const name = fn.getName();
    if (name !== undefined) {
      out.push({ name, fn });
    }
  }
  for (const decl of sf.getDescendantsOfKind(SyntaxKind.VariableDeclaration)) {
    const init = decl.getInitializer();
    const value = init === undefined ? undefined : unwrapExpression(init);
    if (value !== undefined && (Node.isArrowFunction(value) || Node.isFunctionExpression(value))) {
      out.push({ name: decl.getName(), fn: value });
    }
  }
  return out;
}

/** CORPUS DERIVATION 2 — every function name the tree proves returns a builder for this table. Closes the
 *  factory shape independently of whether the CALLER's import can be followed. */
function deriveBuilders(files: readonly SourceFile[]): void {
  derivedBuilders.clear();
  for (let pass = 0; pass < RESOLUTION_PASSES; pass += 1) {
    const before = derivedBuilders.size;
    for (const sf of files.filter((f) => mentionsTable(f) || namedFunctionsHitBuilders(f))) {
      for (const { name, fn } of namedFunctions(sf)) {
        if (!derivedBuilders.has(name) && returnedExpressions(fn).some((r) => tableRef(r, sf, 0) === "ours")) {
          derivedBuilders.add(name);
        }
      }
    }
    if (derivedBuilders.size === before) {
      return;
    }
  }
}

/** Pass-2 filter for {@link deriveBuilders}: a factory that merely WRAPS another factory names it in its text. */
function namedFunctionsHitBuilders(sf: SourceFile): boolean {
  const text = sf.getFullText();
  return [...derivedBuilders].some((b) => text.includes(b));
}

/** ARM 1 — an UPDATE that replaces `content` without deciding the provenance pair: the row keeps a record
 *  describing bytes that are gone. A both-columns write with NO content is legal (see {@link violatesPair}). */
function violatesUpdate(names: ReadonlySet<string>): boolean {
  return names.has(CONTENT) && !names.has(RAW);
}

/** ARM 2 — the pair is written together or not at all, on INSERT and UPDATE alike. Omitting BOTH is honest
 *  absence (the columns default NULL); carrying one is a record nothing can replay, and on an UPDATE it also
 *  leaves the other half describing the wrong body. */
function violatesPair(names: ReadonlySet<string>): boolean {
  return names.has(RAW) !== names.has(FREEZES);
}

/** ARM 3 rides here: an object the reader could not fully derive is a violation, not a pass. */
function violates(kind: WriteKind, acc: Acc): boolean {
  if (!acc.readable) {
    return true;
  }
  return violatesPair(acc.names) || (kind === "update" && violatesUpdate(acc.names));
}

/** The column names actually declared on the table today — the live source of truth the arms key off. */
function declaredColumns(schema: SourceFile): ReadonlySet<string> | undefined {
  const decl = schema.getVariableDeclaration(TABLE);
  if (decl === undefined) {
    return;
  }
  return new Set(decl.getDescendantsOfKind(SyntaxKind.PropertyAssignment).map((p) => p.getName()));
}

function reportBlind(ctx: GateRunCtx, detail: string): void {
  ctx.report({ file: GATE_SELF, line: 1, column: 0, message: `BLIND: ${detail} — retarget scripts/check/gates/freeze-provenance-write-pairing.ts` });
}

/** ARM 4 — the §4.6 tripwire, in the two ways this gate can go silently green: its DERIVATION died (the schema
 *  home moved, or a guarded column was renamed away) or its SUBJECTS did (not one write site in the tree). */
function judgeBlindness(ctx: GateRunCtx): void {
  const schema = ctx.project.getSourceFile(`${ctx.root}/${SCHEMA_HOME}`);
  if (schema === undefined) {
    reportBlind(ctx, `${SCHEMA_HOME} is gone/moved, so the guarded columns can no longer be derived`);
    return;
  }
  const columns = declaredColumns(schema);
  if (columns === undefined) {
    reportBlind(ctx, `\`${TABLE}\` is not declared in ${SCHEMA_HOME} — this gate keys on that name`);
    return;
  }
  const missing = TRIPLE.filter((c) => !columns.has(c));
  if (missing.length > 0) {
    reportBlind(ctx, `\`${TABLE}\` no longer declares ${missing.join(", ")} — the guarded shape changed under the gate`);
    return;
  }
  if (writeSites === 0) {
    reportBlind(ctx, `not one \`${TABLE}\` insert/update was found in packages/*/src — the writers moved or the table symbol was renamed`);
  }
}

export const gate: GateDescriptor = {
  name: "freeze-provenance-write-pairing",
  docRow: "Core-Enforcement-Active-Gates.md (Layer 3)",
  status: "active",
  // The blindness arms count write sites across the WHOLE tree and read the db schema — a scoped run over one
  // changed file would see zero sites and judge a fileset it never scanned.
  scopeSafety: "whole-project",
  message: MESSAGE,
  fix: FIX,
  // Package sources only. `tests/**` writes variant rows directly ON PURPOSE (seeding the very half-written row
  // a pin then asserts on); they are fixtures, not writers, and the invariant is a property of the writer set.
  scanRoot: (p) => p.includes("packages/") && p.includes("/src/"),
  kinds: [SyntaxKind.CallExpression],

  begin: (ctx) => {
    writeSites = 0;
    // The corpus derivations run BEFORE the first verdict: a rename or a builder factory anywhere in the
    // loaded tree has to be known by the time any write site is judged.
    deriveAliases(ctx.project.getSourceFiles());
    deriveBuilders(ctx.project.getSourceFiles());
  },

  visit: (node, sf, ctx) => {
    if (!Node.isCallExpression(node)) {
      return;
    }
    const callee = node.getExpression();
    if (!Node.isPropertyAccessExpression(callee)) {
      return;
    }
    const method = callee.getName();
    const kind = KIND_BY_METHOD[method];
    const arg = node.getArguments()[0];
    if (kind === undefined || arg === undefined) {
      return;
    }
    const verdict = tableRef(callee.getExpression(), sf, 0);
    if (verdict === undefined || verdict === "other") {
      return; // no drizzle write builder in this chain at all, or a different table's write
    }
    const report = (): void => ctx.report(callee.getNameNode(), { token: method, offset: 0 });
    if (verdict === "unresolved") {
      // ARM 5 — a write builder whose TABLE could not be resolved to any declaration, in a file that deals
      // with this table. Fail closed: silence here is exactly how an aliased/computed table walks past a
      // name-keyed gate. Elsewhere in the repo a dynamic table is somebody else's business.
      if (!mentionsTable(sf)) {
        return;
      }
      writeSites += 1;
      report();
      return;
    }
    // EVERY reached site counts: the failure the verifier named was a shape that produced neither a finding
    // NOR a writeSites increment, so the zero-site tripwire could not see it either.
    writeSites += 1;
    const res: Res = { sf, depth: 0, seen: new Set<string>() };
    const payload = method === "onConflictDoUpdate" ? conflictSetNode(arg, res) : arg;
    const acc: Acc = { names: new Set<string>(), readable: payload !== undefined };
    if (payload !== undefined) {
      mergeInto(acc, payload, res);
    }
    if (violates(kind, acc)) {
      report();
    }
  },

  finalize: (ctx) => {
    if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return; // not the real tree — a blindness claim here would judge a synthetic fileset (§4.5)
    }
    judgeBlindness(ctx);
  },

  mustFlag: [
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function editContent(db: D, id: string, content: string) {\n" +
        "  return db.update(messageVariants).set({ content }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1, line: 3 },
      why: "THE FOUNDING DEFECT, verbatim: `editMessageContentStatements` before 2026-08-07 — it replaced the body and left the freeze provenance attached, so a host read a record describing bytes that were gone",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function half(db: D, id: string, content: string, rawContent: string) {\n" +
        "  return db.update(messageVariants).set({ content, rawContent }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1 },
      why: "HALF the triple is still a lie: a raw stored without its freeze record cannot be replayed, and the shorthand spelling must bite exactly like the `key: value` one",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function seed(db: D, content: string, rawContent: string) {\n" +
        "  return db.insert(messageVariants).values({ id: 'v', content, rawContent });\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1 },
      why: "the INSERT-PAIR arm: a fresh row may omit BOTH provenance columns, but carrying `rawContent` with no `macroFreezes` writes a record nothing can replay",
    },
    {
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { messageVariants } from "@orb/db";\nimport { COLS } from "./cols.ts";\n' +
          "export function opaque(db: D, id: string) {\n" +
          "  return db.update(messageVariants).set({ ...COLS }).where(eq(messageVariants.id, id));\n" +
          "}\n",
        "packages/server/src/domain/chat/persistence/cols.ts": "export const COLS = { content: 'x' };\n",
      },
      expect: { count: 1 },
      why: "UNREADABLE-OBJECT, fail-closed: an object assembled in ANOTHER module could be writing `content` and this reader cannot tell — a best-effort gate would go silently green on exactly the shape that hides the defect",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function hoisted(db: D, id: string) {\n" +
        "  const q = db.update(messageVariants);\n" +
        "  return q.set({ content: 'x' }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1, line: 4 },
      why: "hoisting the builder into a local is not an escape — the receiver resolves one hop through its same-module binding",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function upsert(db: D, id: string, content: string) {\n" +
        "  return db.insert(messageVariants).values({ id }).onConflictDoUpdate({ target: messageVariants.id, set: { content } });\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1, messageIncludes: "onConflictDoUpdate" },
      why: "THE UPSERT HOLE (verifier, 2026-08-07): `onConflictDoUpdate({ set })` lands on an ALREADY-EXISTING row and reproduces the founding defect exactly, and the first pass saw NOTHING — not even a writeSites increment, so the zero-site tripwire could not catch it either. This is the repo's house idiom (20+ live call sites across 10 files), i.e. the likeliest spelling of the next writer. The bare `.values({ id })` beside it is legal (an insert may omit both columns), which is why exactly ONE finding is expected",
    },
    {
      files:
        'import { messageVariants as mv } from "@orb/db";\n' +
        "export function aliased(db: D, id: string, content: string) {\n" +
        "  return db.update(mv).set({ content }).where(eq(mv.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1 },
      why: "IMPORT-ALIAS at the table argument was a silent zero in the first pass while the same aliasing at the BUILDER was resolved — the inconsistency the verifier named. `import { messageVariants as mv }` is one hop and fully readable, so it is closed, not declared",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "const T = messageVariants;\n" +
        "export function viaConst(db: D, id: string, content: string) {\n" +
        "  return db.update(T).set({ content }).where(eq(T.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1 },
      why: "a same-module `const T = messageVariants` table alias, chased to a fixpoint — the twin of the builder hoist above",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "function builder(db: D) {\n  return db.update(messageVariants);\n}\n" +
        "export function viaFactory(db: D, id: string, content: string) {\n" +
        "  return builder(db).set({ content }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1 },
      why: "a same-module function RETURNING the builder — the third aliasing shape; one-module indirection is never an escape hatch here",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "const TABLES = { v: messageVariants };\n" +
        "export function computed(db: D, k: 'v', content: string) {\n" +
        "  return db.update(TABLES[k]).set({ content });\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      expect: { count: 1, messageIncludes: "cannot read" },
      why: "ARM 5, the UNRESOLVED-TABLE tripwire: a computed table argument reduces to no declaration at all, so instead of guessing (clever and wrong) the gate REDS it — but only in a file that mentions this table, so the rest of the repo's dynamic drizzle is untouched",
    },
    {
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { variants } from "./barrel.ts";\nexport function renamed(db: D, id: string, content: string) {\n  return db.update(variants).set({ content });\n}\n',
        "packages/server/src/domain/chat/persistence/barrel.ts": 'export { messageVariants as variants } from "@orb/db";\n',
      },
      expect: { count: 1 },
      why: "CROSS-MODULE RE-EXPORT RENAME, closed rather than declared: the importing file's specifier says `variants` and nothing local ties it to the table, so identity is decided by BINDING — the import is followed into barrel.ts, whose `export { messageVariants as variants }` ends the chain at the real declaration. Belt and braces: the corpus alias derivation reaches the same verdict even if the module specifier will not load",
    },
    {
      files: {
        "packages/server/src/domain/chat/persistence/x.ts":
          'import { updater } from "./b.ts";\nexport function foreign(db: D, content: string) {\n  return updater(db).set({ content });\n}\n',
        "packages/server/src/domain/chat/persistence/b.ts":
          'import { messageVariants } from "@orb/db";\nexport const updater = (db: D) => db.update(messageVariants);\n',
      },
      expect: { count: 1 },
      why: "CROSS-MODULE BUILDER FACTORY, closed rather than declared: `updater` is followed through its import into b.ts and its returned builder names the table. The corpus derivation independently learns the name, so the arm holds even where the specifier does not resolve — which is what keeps it distinguishable from a `map.set(…)` (the mustPass twin) instead of redding every `.set()` in the repo",
    },
    {
      files: { "packages/db/src/schema/index.ts": "export const anchor = 1;\n" },
      expect: { count: 1, messageIncludes: "is gone/moved" },
      why: "BLINDNESS mode B (§4.4a): the real-tree anchor is present but the schema home that DERIVES the guarded columns is gone — the gate must announce it, never go silently green",
    },
    {
      files: {
        "packages/db/src/schema/index.ts": "export const anchor = 1;\n",
        [SCHEMA_HOME]: "export const messageVariants = sqliteTable('message_variants', { content: text('content'), rawContent: text('raw_content') });\n",
      },
      expect: { count: 1, messageIncludes: "no longer declares macroFreezes" },
      why: "BLINDNESS by RENAME (§4.6): the columns are derived from the live table declaration, so dropping/renaming one reds instead of quietly narrowing what the gate guards",
    },
    {
      files: {
        "packages/db/src/schema/index.ts": "export const anchor = 1;\n",
        [SCHEMA_HOME]:
          "export const messageVariants = sqliteTable('message_variants', { content: text('content'), rawContent: text('raw_content'), macroFreezes: text('macro_freezes') });\n",
      },
      expect: { count: 1, messageIncludes: "not one" },
      why: "BLINDNESS by SUBJECT LOSS: schema intact, but not a single write site in the tree — the writers moved or the table symbol was renamed, and a zero-finding pass would otherwise read as health",
    },
  ],
  mustPass: [
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "const CLEARED_FREEZE_PROVENANCE = { rawContent: null, macroFreezes: null } as const;\n" +
        "export function editContent(db: D, id: string, content: string) {\n" +
        "  return db.update(messageVariants).set({ content, ...CLEARED_FREEZE_PROVENANCE }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "the FIXED shape (canon-write's `editMessageContentStatements` today): the clear rides a same-module const behind an `as const` — the reader must see through the wrapper (§5's literal-shape blindness class)",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "function economics(v: V) {\n  return { content: v.content, reasoning: v.reasoning };\n}\n" +
        "function provenance(c: string, r: string | null) {\n  return { rawContent: r === c ? null : r, macroFreezes: null };\n}\n" +
        "function columns(v: V) {\n  return { id: v.id, ...economics(v), ...provenance(v.content, v.raw) };\n}\n" +
        "export function insertVariant(db: D, v: V) {\n  return db.insert(messageVariants).values(columns(v));\n}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "canon-write's REAL insert shape: the keys arrive three hops deep through same-module functions (`variantColumns` → `variantEconomics` + `freezeProvenanceColumns`). A reader that stopped at the call would refuse the healthy production writer",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function editReasoning(db: D, id: string, reasoning: string | null) {\n" +
        "  return db.update(messageVariants).set({ reasoning }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "a write touching NONE of the triple is not this gate's business (`editReasoningStatements`) — the rule is about the body's provenance, not about every column",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function importVariant(db: D, v: V) {\n" +
        "  return db.insert(messageVariants).values({ id: v.id, content: v.content, model: v.model });\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "DECLARED LIMIT + sanctioned shape: an INSERT omitting BOTH provenance columns is honest absence (they default NULL) — `import-write.ts` does exactly this, and demanding the triple on a fresh row would be ceremony",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export async function seedBrokenRow(db: D, id: string) {\n" +
        "  await db.update(messageVariants).set({ content: 'mutated' }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "tests/server/domain/chat/verbs/x.int.test.ts",
      why: "DECLARED LIMIT: `tests/**` is out of scanRoot. A pin PROVING this defect must be able to seed the broken row by hand (fork.int.test.ts and chat.int.test.ts both do); scanning tests would red the gate's own proofs",
    },
    {
      files:
        'import { messages } from "@orb/db";\n' +
        "export function editSlot(db: D, id: string, content: string) {\n" +
        "  return db.update(messages).set({ content }).where(eq(messages.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "another table's `content` is not this invariant — the freeze provenance lives on `message_variants` alone, and the sibling `db.update(messages).set(...)` calls next door must never bite",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function scrubProvenance(db: D, id: string) {\n" +
        "  return db.update(messageVariants).set({ rawContent: null, macroFreezes: null }).where(eq(messageVariants.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "THE RULED JUDGEMENT (2026-08-07): a CLEAR-ONLY update — both provenance columns, no `content` — is LEGAL. Nulling both is the strictly-safe direction: it cannot produce the stale pair this gate exists to prevent, and it is the shape a future host-plane scrub or backfill would take (the fork strip already does it at insert time). Only the CONTENT arm needs the pair; the pair arm needs them together. The stricter 'all three or nothing' reading would have bitten a writer that cannot be wrong",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "const CLEARED = { rawContent: null, macroFreezes: null } as const;\n" +
        "export function upsertOk(db: D, id: string, content: string) {\n" +
        "  return db.insert(messageVariants).values({ id, content }).onConflictDoUpdate({ target: messageVariants.id, set: { content, ...CLEARED } });\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "the HEALTHY upsert: the conflict `set` decides the provenance, so the house idiom stays usable on this table — the new arm bans the defect, not the pattern. Proves the reader reaches THROUGH the config object into `set` and still resolves a spread from there",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function other(db: D, id: string) {\n" +
        "  return db.update(someOtherTable).set({ content: 'x' }).where(eq(someOtherTable.id, id));\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "the ARM 5 NEAR-MISS that keeps it honest: an UNDECLARED table identifier in a file that DOES import ours resolves to no declaration, but it is a plain identifier that is provably not this table — `unresolved` is reserved for a table EXPRESSION the reader cannot reduce to a name at all, not for every name it has not met",
    },
    {
      files:
        'import { messageVariants } from "@orb/db";\n' +
        "export function counter(m: Map<string, number>, content: string) {\n" +
        "  return m.set(content, 1);\n" +
        "}\n",
      at: "packages/server/src/domain/chat/persistence/x.ts",
      why: "`map.set(…)` in a file that imports the table: there is no drizzle write builder in the chain at all, so the gate must stay silent — the boundary that stops ARM 5's fail-closed posture from redding every `.set()` in the repo",
    },
  ],
};
