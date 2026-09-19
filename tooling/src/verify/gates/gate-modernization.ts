// Policy: gate-modernization — the META-gate. The gate corpus is the enforcement layer; nothing else
// enforces ITS shape, so a gate could register nothing, carry a one-sided exemption table, cite a
// section that does not exist, or claim syntax while reading types, forever and silently. Four
// mechanical axes, all keyed on the corpus itself: A DESCRIPTOR (a gate file must register under one of
// the two contracts) · B EXEMPTIONS (an exemption vocabulary promises a STALE arm) · C CITATION (a docRow
// `§` anchor must resolve in the doc it names) · E ANALYSIS (a final syntax policy must not reach compiler
// semantics). The law these arms mechanize is tooling/src/verify/gates/GATE-AUTHORING.md.
//
// ARM D (a gate reading a committed ratchet ledger must DECLARE what it admitted) RETIRED 2026-09-14 (#2359):
// its last subject, `ratchet-row-integrity`, retired at 6bab419ad, leaving zero ledger readers in the
// corpus — and `lib/gate-contract.ts`'s `baseline-ledger` finding (§8-controlled here, `gate:contract`
// on the real corpus) refuses ANY gate module whose resolved string values end in `.baseline.json`, which
// is strictly stronger than ARM D's whole-literal ledger-path match: it also catches a concatenated or
// templated path ARM D's anchored-literal test could not see. The letter is skipped on purpose; the axis
// list stays A/B/E.
//
// ARM A's LEGACY-descriptor branch and ARM C (docRow citation) were RETIRED (#2367, 2026-09-18) — the
// legacy contract and its dispatcher were deleted at df2a54b09 (#2176 Phase F), and `lib/loader.ts` now
// REFUSES an unbranded `gate` at load, so no module carrying a legacy descriptor can reach this policy's
// population. Successor evidence: the loader's refusal plus `lib/policy-validation.ts` at load (arm A's
// half) and `dangling-refs` / `dangling-ref-citations` (arm C's citation half). The retirement changed
// the evidence plane from `resource` (documents) to `syntax` and re-moded every proof row.
import type { ImportDeclaration, Node, SourceFile } from "ts-morph";
import { Node as TsNode } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import type { GateModernizationModuleSyntax } from "../lib/gate-modernization-fact.ts";
import { GATE_MODERNIZATION_POPULATION, gateModernizationFact, readGateModernizationFacts } from "../lib/gate-modernization-fact.ts";
import { finalDescriptorOf, gateRegistrationOf } from "../lib/policy-descriptor-read.ts";
import { readMemberAccess } from "../lib/symbol-reference.ts";

const LAW = "tooling/src/verify/gates/GATE-AUTHORING.md";
/** A sibling gate module imports its family-mate as `./<name>.ts` — both modules are top-level in `gates/`. */

// ── ARM B vocabulary ─────────────────────────────────────────────────────────────────────────────────
// A const NAME carrying exemption vocabulary is a PROMISE: these rows are deliberate, permanent, and
// reasoned. Deliberately NARROW — `SKIP_DIRS`/`SCANNED`/`ROOTS` are scan-SCOPE decisions, not exemptions,
// and must not be dragged in. The name is the signal: if a collection is scope, name it scope.
const EXEMPTION_NAME_RE = /ALLOW|WHITELIST|EXEMPT|SANCTION|WAIV|GRANDFATHER|DEFERRED|DEBT|BASELINE|TOLERAT|PERMITTED/u;
// The STALE-arm signature: a diagnostic that tells a reader a row no longer matches anything. Read from
// STRING LITERALS only (a comment saying "stale" enforces nothing), which is why this is a necessary-
// condition test and its DECLARED LIMIT is recorded in a mustPass row.
const STALE_VOCAB_RE = /stale|ratchet down|no longer|delete (?:the |this |it)|unused (?:exemption|sanction|row)|dead (?:row|entry)|vanished/iu;

// THE ONE REASON. The three NODE-anchored arms name themselves through their token; their per-finding
// messages folded in here when they left the Finding overload (which bypasses `hasGateIgnore` —
// GATE-AUTHORING §1 — so every marker on them was inert). The file-level NO-DESCRIPTOR arm keeps its own
// message: it anchors on a file, not a node.
const MESSAGE =
  "a gate file breaks the gate-authoring law (tooling/src/verify/gates/GATE-AUTHORING.md): it registers no proven " +
  "descriptor under the final contract, carries an exemption vocabulary with no STALE arm, or declares a " +
  "syntax analysis while calling compiler-reaching members. The gate corpus is the enforcement layer — " +
  "nothing else enforces its shape. " +
  'An `analysis` token: the policy DECLARES `analysis: "syntax"` and its MODULE calls one of the closed ' +
  "set of compiler-reaching members (`getType`, `getContextualType`, `getSymbol`, the aliased/export symbol " +
  "hops, the type- and signature-level reads, `getTypeAtLocation`, `getTypeChecker`, or `ctx.checker()` " +
  "itself). `ctx.checker()` refuses a syntax owner at RUNTIME, but a ts-morph node reaches the compiler " +
  "WITHOUT the context and a runtime throw only fires if the branch executes, so the declaration is simply " +
  "untrue — the gate reads types on a tier priced for syntax, and the smallest-complete-contract rule has " +
  "no other enforcer on this axis. " +
  "Any other " +
  "token is an EXEMPTION TABLE by that name with no STALE arm: this gate module contains no diagnostic that " +
  "fires when a row stops matching a live violation, and a one-sided exemption rots into a lie — the " +
  "violation gets fixed, the row stays, and the next violation written at that site inherits an exemption " +
  "nobody granted it.";

const FIX =
  "A: export `gate = defineGate({…})` from tooling/src/verify/contract/policy.ts (its validator owns the proof floor). " +
  "B: give the exemption table a STALE arm in `finalize` — a row matching zero live sites must be RED, " +
  `guarded on a real-tree anchor, not on \`scope.kind\` alone (${LAW} §4); if the collection is a ` +
  "scan-SCOPE decision rather than an exemption, rename it out of the exemption vocabulary. " +
  'E: declare `analysis: "types"` if the policy genuinely needs compiler-resolved semantics, or delete the ' +
  "compiler-reaching calls ANYWHERE IN THE MODULE and judge the node's syntax — a type read through a ts-morph " +
  "node is still a type read, and the declared plane is what the runtime prices.";

// ── ARM A ────────────────────────────────────────────────────────────────────────────────────────────
const NO_DESCRIPTOR = (rel: string): string =>
  `${rel} lives in the gate corpus but exports no \`gate\` descriptor object and no canonical \`defineGate\` policy — ` +
  "the mixed loader records such a module as UNREGISTERED (tooling/src/verify/lib/loader.ts) and the front door " +
  "reconciles the roster, but the file itself enforces nothing and reports nothing, forever. Export a valid legacy " +
  `descriptor, a \`defineGate\` policy imported from tooling/src/verify/contract/policy.ts, or delete the file (${LAW} §1).`;

/** How a gate module registers: a canonical `defineGate(…)` CALL (registered; its shape is the final
 *  contract's own validation). */
interface Registration {
  readonly contract: "final";
  readonly obj: Node | undefined;
}

/** Preserve the legacy gate's semantic position token while using the final sink correctly. Most tokens
 *  occur inside the anchor and remain node-derived; a missing descriptor field has no authored token, so
 *  that narrow case uses the source file plus the descriptor's real coordinates. */
function reportToken(ctx: GatePolicyContext, node: Node, token: string): void {
  const offset = node.getText().indexOf(token);
  if (offset !== -1) {
    ctx.report.node(node, { token, offset });
    return;
  }
  const at = node.getSourceFile().getLineAndColumnAtPos(node.getStart());
  ctx.report.file(ctx.relativePath(node.getSourceFile()), { line: at.line, column: at.column, token });
}

/** The module's registration under the final contract, or undefined when it registers under neither.
 *  Identity, not spelling: a `defineGate` whose import origin is not `contract/policy.ts` is a lookalike
 *  and registers nothing. The legacy arm was retired at #2367. */
function registrationOf(sf: SourceFile): Registration | undefined {
  return gateRegistrationOf(sf) === "final" ? { contract: "final", obj: finalDescriptorOf(sf) } : undefined;
}

/** ARM A for one module. Reports UNREGISTERED or delegates to ARM E for a final policy. */
function armDescriptor(sf: SourceFile, rel: string, ctx: GatePolicyContext): void {
  const registration = registrationOf(sf);
  if (registration === undefined) {
    ctx.report.file(rel, { line: 1, column: 1, message: NO_DESCRIPTOR(rel) });
    return;
  }
  armSyntaxAnalysis(registration.obj, sf, ctx);
}

// ── ARM E ────────────────────────────────────────────────────────────────────────────────────────────
// `analysis: "syntax"` is a CLAIM that the policy reads no types, and the runtime enforces exactly ONE HALF
// of it: `ctx.checker()` throws for a syntax owner (tooling/src/verify/lib/policy-pass-context.ts:243-248).
// A ts-morph `node.getType()` / `node.getSymbol()` walks straight past that fence — the compiler is
// reachable from the very node the visitor was handed, without ever asking the context for it. So a policy
// can read types while declaring pure syntax and stay green: the declared evidence plane becomes a lie, the
// gate is mis-tiered against its real cost, and the smallest-complete-contract rule (§5b item 1) has no
// enforcer on this axis. Blast radius is currently ZERO — the one offender was corrected at f52492f44 — and
// this arm exists so that it STAYS zero rather than because anything is broken today (#1958).
// SCOPE: the FINAL contract only. A legacy descriptor has no `analysis` field, so it makes no such claim and
// there is nothing to contradict (mustPass row).
// IDENTITY, not text: the reads are matched as MEMBER POSITIONS — a property access, a static element
// access, or a destructuring binding element — so a `getType` in a comment, a message string or a proof
// fixture cannot trip it, which matters here because this module's own `mustFlag` row contains the literal
// string it hunts.
//
// THE SPELLING WIDENING (#2249, cb-v-wave-6). The arm shipped matching ONE spelling: a CallExpression whose
// callee is a PropertyAccessExpression. A verifier drove nine spellings through this descriptor's own `run`
// and measured FIVE escapes, none of them a declared limit — `ctx.node["getType"]()`, `ctx.node?.["getType"]()`,
// `const { getType } = ctx.node; getType()`, `ctx.node.getType.bind(ctx.node)`, and a read one import hop away
// in a `lib/` helper. The first pair is the #2202 shape one module over (an element access with a static
// string argument is the same member position as the dot). The fix drops the CALL requirement — a member
// POSITION naming a tuple member is the read, called or not, which is what makes `.bind` and a bare handoff
// nameable without resolving what the receiver is — and follows ONE import hop for a relatively-imported
// declaration this module actually references (§5b item 7's *"none smuggled into a `lib/` helper that only
// this module calls"* is exactly this route). The declared limits are the two `mustPass` rows below:
// namespace/default imports, and a second hop out of the hopped module.
/** THE CLOSED TUPLE of members that reach the compiler (#1958). `getType`/`getSymbol` were the founding
 *  two and the arm was shown to catch only those; a `getContextualType()` — or any of the ten below — walked
 *  straight past an arm written to police exactly this claim. Each member has its OWN mustFlag row: a tuple
 *  widened without a control per member is the shape where one member silently never matches.
 *
 *  AND EACH ROW REACHES ITS MEMBER ALONE. The first draft spelled six of them as chains
 *  (`ctx.node.getSymbol().getAliasedSymbol()`), and all six passed under the OLD two-member tuple — the
 *  `getSymbol()` in the chain was doing the work, so they were controls for nothing. The narrow-back control
 *  is what caught it: with the tuple reverted, twelve rows must red, and six did not.
 *
 *  `checker` is in the SAME tuple on purpose. `ctx.checker()` under a syntax owner throws at RUNTIME
 *  (`lib/policy-pass-context.ts`), which is a different tier and only fires if the branch executes; the
 *  DECLARATION is false either way, and this arm is the one that reads declarations. It is not a load-time
 *  validation refusal because `lib/policy-validation.ts` receives the descriptor OBJECT and has no source to
 *  read — seeing a call inside `create`'s body would mean stringifying a function, which no validation does. */
const TYPE_READ_METHODS: ReadonlySet<string> = new Set([
  "getType",
  "getContextualType",
  "getSymbol",
  "getSymbolOrThrow",
  "getAliasedSymbol",
  "getAliasedSymbolOrThrow",
  "getExportSymbol",
  "getDeclaredType",
  "getApparentType",
  "getReturnType",
  "getTypeAtLocation",
  "getTypeChecker",
  "checker",
]);
const SYNTAX_ANALYSIS = "syntax";
const ANALYSIS_PROP = "analysis";

/** The literal text of the descriptor's `analysis` value, or undefined when it is not a plain string. */
function analysisText(obj: Node): string | undefined {
  const prop = TsNode.isObjectLiteralExpression(obj) ? obj.getProperty(ANALYSIS_PROP) : undefined;
  const init = prop !== undefined && TsNode.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  if (init === undefined) {
    return;
  }
  const n = unwrap(init);
  return TsNode.isStringLiteral(n) || TsNode.isNoSubstitutionTemplateLiteral(n) ? n.getLiteralText() : undefined;
}

/** The MEMBER NAME this node names, whatever the spelling — the one place the arm decides what counts as a
 *  member position. Three spellings reach the same member and only the first was matched before #2249:
 *  `a.getType` (optional-chained or not), `a["getType"]` / `a?.["getType"]` (static string subscript only —
 *  a computed subscript names no member this arm can read), and `const { getType } = a` (the destructure,
 *  which is how a policy gets a short local name; the alias form keeps the PROPERTY name, not the local). */
function memberName(node: Node): string | undefined {
  if (TsNode.isPropertyAccessExpression(node)) {
    return node.getName();
  }
  if (TsNode.isBindingElement(node)) {
    return (node.getPropertyNameNode() ?? node.getNameNode()).getText();
  }
  const subscript = TsNode.isElementAccessExpression(node) ? node.getArgumentExpression() : undefined;
  const argument = subscript === undefined ? undefined : unwrap(subscript);
  return argument !== undefined && (TsNode.isStringLiteral(argument) || TsNode.isNoSubstitutionTemplateLiteral(argument))
    ? argument.getLiteralText()
    : undefined;
}

/** Does this subtree reach a type-reading ts-morph member? A local `getChildren` recursion on purpose: the
 *  descendant helpers are the banned direct-walk vocabulary (`lib/gate-contract.ts`), and this module must
 *  not add a call site to a list it exists to police.
 *
 *  THE CALL IS NOT THE READ, THE MEMBER POSITION IS (#2249). `ctx.node.getType.bind(ctx.node)` hands the
 *  compiler door to somebody else and never appears as a call with that callee; the same is true of any
 *  handoff. Matching the position rather than the invocation makes every handoff nameable without this arm
 *  having to resolve what the receiver is — which it must not do, since that is a type read of its own. */
function readsTypes(node: Node): boolean {
  const member = memberName(node);
  if (member !== undefined && TYPE_READ_METHODS.has(member)) {
    return true;
  }
  return node.getChildren().some(readsTypes);
}

/** Every identifier TEXT the module uses outside its own import declarations — the "does this module
 *  actually reference the thing it imported" test behind the hop below. An unused import reads nothing, and
 *  accusing a policy over a helper it never calls would be the arm inventing a violation. */
function referencedNames(node: Node, out: Set<string>): void {
  if (TsNode.isImportDeclaration(node)) {
    return;
  }
  if (TsNode.isIdentifier(node)) {
    out.add(node.getText());
  }
  for (const child of node.getChildren()) {
    referencedNames(child, out);
  }
}

/** A module-scope declaration of `name` in `sf`, by SYNTAX — no checker, no `getExportedDeclarations`
 *  (which resolves aliases through the compiler and would make this arm a type reader itself). */
function moduleScopeDeclaration(sf: SourceFile, name: string): Node | undefined {
  return sf.getFunction(name) ?? sf.getVariableDeclaration(name) ?? sf.getClass(name);
}

/** Does a declaration in the HOPPED module reach a type read — following bare-identifier calls to other
 *  module-scope declarations of that SAME file, so a two-line helper chain inside one `lib/` module cannot
 *  hide the read. The recursion never leaves the hopped file: a second import hop is the declared limit. */
function hoppedDeclarationReadsTypes(sf: SourceFile, name: string, seen: Set<string>): boolean {
  if (seen.has(name)) {
    return false;
  }
  seen.add(name);
  const declaration = moduleScopeDeclaration(sf, name);
  if (declaration === undefined) {
    return false;
  }
  if (readsTypes(declaration)) {
    return true;
  }
  const used = new Set<string>();
  referencedNames(declaration, used);
  return [...used].some((local) => local !== name && hoppedDeclarationReadsTypes(sf, local, seen));
}

/** Every member NAME read off the namespace binding `alias`, outside this module's own import declarations
 *  — the namespace spelling's answer to `referencedNames`. Member reads go through the shared
 *  `readMemberAccess`, so `ns.typeOf`, `ns["typeOf"]` and `ns[KEY]` with a same-file `const KEY` all name
 *  the same member. */
function namespaceMemberNames(node: Node, alias: string, out: Set<string>): void {
  if (TsNode.isImportDeclaration(node)) {
    return;
  }
  const read = readMemberAccess(node);
  if (read !== undefined && TsNode.isIdentifier(read.receiver) && read.receiver.getText() === alias) {
    out.add(read.name);
  }
  for (const child of node.getChildren()) {
    namespaceMemberNames(child, alias, out);
  }
}

/** ONE IMPORT HOP (#2249): every import from a RELATIVE specifier whose member this module actually
 *  references, resolved to the imported module's own declaration of that member — a NAMED import by its
 *  local name, a NAMESPACE import by the members read off its binding.
 *
 *  THE NAMESPACE HALF IS #2459, AND IT REVERSES A RECORDED LIMIT — deliberately, because the limit's own
 *  REASON stopped being true. The hop shipped reading `getNamedImports()` alone, and its `mustPass` row
 *  said *"a NAMESPACE import names no member at the import boundary, so the hop has nothing to resolve and
 *  does not guess"*. That is a statement about the IMPORT DECLARATION, and it is still correct there — but
 *  the member is named at the REFERENCE, and `ns.typeOf(ctx.node)` resolves with no guessing at all. The
 *  mechanism survives (follow only what the module actually references, one hop, never invent a member);
 *  its INPUT changed, from "what the import declaration names" to "what the module reads". The cost of
 *  leaving it was measured: `tests/tooling/gate-spelling-twins.int.test.ts` reported this policy NEWLY
 *  BLIND to the namespace twin of its own two import-hop mustFlag rows, which means a policy could evade
 *  the arm that polices honest `analysis` declarations by respelling one import. That ledger's own law is
 *  that growth is fixed at the reader and never recorded as a row. The old row is now a mustFlag row
 *  carrying the same bytes, so the reversal is committed rather than merely described.
 *
 *  THE OTHER DECLARED LIMITS ARE UNTOUCHED, each still with its own `mustPass` row: a DEFAULT import names
 *  the module's default export rather than a member and is not followed; a specifier this run's project did
 *  not load is skipped (the read is unobservable, not absolved); and the walk stops at the hopped module —
 *  a helper that itself imports the reader from a THIRD module is two hops and out of reach. */
function declarationHopReadsTypes(sf: SourceFile, declaration: ImportDeclaration, used: ReadonlySet<string>): boolean {
  if (!declaration.getModuleSpecifierValue().startsWith(".")) {
    return false;
  }
  const target = declaration.getModuleSpecifierSourceFile();
  if (target === undefined || target === sf) {
    return false;
  }
  const namespaceBinding = declaration.getNamespaceImport();
  if (namespaceBinding !== undefined) {
    const members = new Set<string>();
    namespaceMemberNames(sf, namespaceBinding.getText(), members);
    return [...members].some((member) => hoppedDeclarationReadsTypes(target, member, new Set()));
  }
  return declaration.getNamedImports().some((specifier) => {
    const local = (specifier.getAliasNode() ?? specifier.getNameNode()).getText();
    return used.has(local) && hoppedDeclarationReadsTypes(target, specifier.getName(), new Set());
  });
}

function importHopReadsTypes(sf: SourceFile): boolean {
  const used = new Set<string>();
  referencedNames(sf, used);
  return sf.getImportDeclarations().some((declaration) => declarationHopReadsTypes(sf, declaration, used));
}

/** ARM E for one FINAL module. One finding per module, anchored on the descriptor with the `analysis` token:
 *  the defect is the DECLARATION, not each read, and the repair is to change that one word (or drop the
 *  reads). Reporting per call site would also make several findings share one carrier and one token, which
 *  is the shape that has no working suppression door at all.
 *
 *  THE SUBTREE IS THE WHOLE MODULE, not the descriptor literal (#1958). The claim `analysis: "syntax"` is
 *  about what the POLICY reads, and a policy reads through its module-level helpers as readily as inline —
 *  scanning only the literal left the one-line extraction (`function isX(node) { return node.getType()… }`)
 *  as a free evasion of an arm whose entire subject is that claim. */
function armSyntaxAnalysis(obj: Node | undefined, sf: SourceFile, ctx: GatePolicyContext): void {
  if (obj === undefined || analysisText(obj) !== SYNTAX_ANALYSIS || !(readsTypes(sf) || importHopReadsTypes(sf))) {
    return;
  }
  reportToken(ctx, obj, ANALYSIS_PROP);
}

// ── ARM B ────────────────────────────────────────────────────────────────────────────────────────────
/** One exemption-shaped collection: a module const whose NAME promises exemption rows and whose
 *  initializer is a non-empty object / array / `new Set([…])` literal. An EMPTY table is deliberately not
 *  flagged — it has no row to rot, and it reds the moment a row lands. */
interface Collection {
  readonly name: string;
  /** The declaration itself — ARM B reports NODE-anchored off it (it used to carry only `line`, which is
   *  what forced the explicit-`Finding` overload and left every `@orb-gate-ignore` on this arm inert). */
  readonly node: Node;
  readonly count: number;
}

function unwrap(node: Node): Node {
  let n = node;
  while (TsNode.isAsExpression(n) || TsNode.isSatisfiesExpression(n) || TsNode.isParenthesizedExpression(n)) {
    n = n.getExpression();
  }
  return n;
}

/** Entry count of a literal collection, or undefined when the initializer is not one. */
function entryCount(init: Node | undefined): number | undefined {
  if (init === undefined) {
    return;
  }
  const n = unwrap(init);
  if (TsNode.isObjectLiteralExpression(n)) {
    return n.getProperties().length;
  }
  if (TsNode.isArrayLiteralExpression(n)) {
    return n.getElements().length;
  }
  if (!TsNode.isNewExpression(n)) {
    return;
  }
  const arg = n.getArguments()[0];
  return arg !== undefined && TsNode.isArrayLiteralExpression(arg) ? arg.getElements().length : 0;
}

export function exemptionCollections(sf: SourceFile): Collection[] {
  const out: Collection[] = [];
  for (const vd of sf.getVariableDeclarations()) {
    const name = vd.getName();
    if (!EXEMPTION_NAME_RE.test(name)) {
      continue;
    }
    const count = entryCount(vd.getInitializer());
    if (count !== undefined && count > 0) {
      out.push({ name, node: vd, count });
    }
  }
  return out;
}

/** THE #2093 SPLIT-FAMILY EXCUSE IS RETIRED — AS AN ASSERTION, NEVER AN ABSENCE (#2219, owner ruling).
 *
 *  The carve acquitted a gate-local exemption collection when a SIBLING gate imported it and carried the
 *  stale arm: a family that splits by authority kept the table in the ordinary half and the liveness arm in
 *  the `-health` half, and accusing the ordinary half named three live modules whose property was held one
 *  file over (`no-raw-spacing-in-features`, `no-raw-typography-in-features`, `serde-core-seal`).
 *
 *  #2096 THEN FORBADE THE VERY ARRANGEMENT THE CARVE EXCUSED: a gate never imports a gate, and a shared
 *  collection's ONE home is `lib/`. All three moved (`../lib/raw-spacing-tier.ts`,
 *  `../lib/raw-typography-tier.ts`, `../lib/serde-core-seal.ts`), so the excuse covered ZERO pairs and its
 *  own liveness arm said so. That is the arm WORKING — a closed class reaching zero — and it is why the
 *  answer is not deletion: the population is empty BECAUSE the shape was eliminated, and the right response
 *  to a successfully-eliminated shape is a tripwire that catches its return, not a removal that guarantees
 *  silence if it returns. Deleting the door would have left the forbidden arrangement with nothing watching.
 *
 *  SO THE POLARITY IS INVERTED RATHER THAN THE CODE REMOVED, per §4.1 (when a repair retires an exception,
 *  land it as an ASSERTION): the arrangement that used to be EXCUSED is now ACCUSED — it is a `mustFlag`
 *  row — and the sanctioned arrangement (both siblings importing the collection from `lib/`) is a
 *  `mustPass`. Arm B is otherwise untouched: a module with no stale arm is accused for every exemption
 *  collection it DECLARES, which is exactly the one-sided-table class it has always judged. NEVER baseline
 *  this: a zero-population door converted into a baseline is an honest dead-code signal turned into
 *  permanent silence. */

/** Does this gate module carry a stale-arm DIAGNOSTIC (a string a reader would be shown when a row stops
 *  matching)? Necessary condition, not sufficient — see the DECLARED LIMIT mustPass row. */
export function hasStaleArm(module: GateModernizationModuleSyntax): boolean {
  return staleArmStrings(module).length > 0;
}

/** Every stale-arm diagnostic string in the module, as authored text. */
function staleArmStrings(module: GateModernizationModuleSyntax): readonly string[] {
  return module.strings.flatMap((node) => (STALE_VOCAB_RE.test(node.getText()) ? [node.getText()] : []));
}

/** Arm B for one gate module: every one-sided exemption collection it carries. Unsuppressed by
 *  construction — the RETRO handoff baseline reached its terminal state `{}` (tooling/src/verify/gates/GATE-AUTHORING.md §4.8) and was
 *  deleted with its generator, so a NEW one-sided table is red on arrival with no ledger to add it to. */
function armExemptions(module: GateModernizationModuleSyntax, ctx: GatePolicyContext): void {
  if (hasStaleArm(module)) {
    return;
  }
  for (const c of exemptionCollections(module.sourceFile)) {
    reportToken(ctx, c.node, c.name);
  }
}

/** ARM E's fixture pair. The stub gives the origin reader a real `contract/policy.ts` to resolve against —
 *  this gate is fsBacked, so its examples are real temp roots, exactly as ARM A's canonical row already is. */
const POLICY_STUB = "export function defineGate(policy: unknown): unknown {\n  return policy;\n}\n";
const finalProbe = (body: string): string =>
  `import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", ${body}, mustFlag: [1], mustPass: [1] });\n`;

export const gate = defineGate({
  id: "gate-modernization",
  family: "gate-modernization",
  authority: "hard",
  severity: "error",
  population: GATE_MODERNIZATION_POPULATION,
  analysis: "syntax",
  execution: "entire-population",
  facts: [gateModernizationFact],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    evaluate: () => {
      const syntax = readGateModernizationFacts(ctx);
      for (const module of syntax.modules) {
        const rel = ctx.relativePath(module.sourceFile);
        armDescriptor(module.sourceFile, rel, ctx);
        armExemptions(module, ctx);
      }
    },
  }),

  mustFlag: [
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/__probe.ts": "export const notAGate = 1;\n",
      },
      expect: { count: 1, messageIncludes: "exports no `gate` descriptor" },
      why: "ARM A — a module in the gate corpus that registers under neither contract enforces nothing, forever; the mixed loader records it as unregistered, and this is the finding that names the file",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'function defineGate(policy: unknown): unknown {\n  return policy;\n}\nexport const gate = defineGate({ id: "__probe", message: "m", mustFlag: [1], mustPass: [1] });\n',
      },
      expect: { count: 1, messageIncludes: "exports no `gate` descriptor" },
      why: "ARM A — IDENTITY, not spelling: a same-named LOCAL `defineGate` has no import origin in contract/policy.ts, so the module registers nothing (the loader would refuse its unbranded result too) and the arm names it rather than trusting the callee's name",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node.getType()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: 'ARM E — a policy declaring `analysis: "syntax"` while calling `getType` reads types past the only fence the runtime has (`ctx.checker()` throws for a syntax owner; a ts-morph node does not ask it). ONE finding, on the DECLARATION: the token is `analysis` because changing that one word — or dropping the read — is the repair, and a per-call-site finding would give several findings one carrier and one token, which has no working waiver door at all',
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node.getSymbol()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E — `getSymbol` is the second door onto the same compiler and is flagged identically; without this row the arm would be shown to catch only half its own vocabulary",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node.getContextualType()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getContextualType` — the member #1958 was filed on: the contextual type of an expression is the checker answering a question about the node, reached without ever asking the context",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node.getSymbolOrThrow()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getSymbolOrThrow` — the throwing twin of `getSymbol` — a different spelling of the same read, and a tuple that named only the non-throwing form would miss every module that prefers the assertive one",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.symbol.getAliasedSymbol()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getAliasedSymbol` — import-alias resolution is a SYMBOL read through the compiler, and it is the exact call an origin recognizer reaches for",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.symbol.getAliasedSymbolOrThrow()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getAliasedSymbolOrThrow` — the throwing twin again — the pair is the rule, not the exception",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.symbol.getExportSymbol()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getExportSymbol` — the local-to-export symbol hop, the read a module-boundary policy wants and the one it must declare `types` for",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.symbol.getDeclaredType()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getDeclaredType` — a symbol's declared type is the checker's answer, not the node's syntax",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.resolved.getApparentType()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getApparentType` — a TYPE-level read chained off a type read: the arm must see the whole chain, not only its first link",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.signature.getReturnType()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getReturnType` — signature return types are the deepest of these reads and the most expensive, which is precisely why the declared plane must be honest",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.checkerLike.getTypeAtLocation(ctx.node)'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getTypeAtLocation` — the TypeChecker's own spelling — reachable through any handle a module gets on a checker, so naming only the node-side members would leave the front door open",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.project.getTypeChecker()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getTypeChecker` — taking the checker off a Project is a type read with an extra step; §12.3 bans the gate-owned Project separately, and this arm names the CLAIM",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.checker()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `checker` — `ctx.checker()` under a syntax owner throws at RUNTIME and only if the branch executes — a different tier. The DECLARATION is false the moment the call is written, and this arm is the one that reads declarations (#1958, cb-v-instruments)",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nfunction placed(node: { getType: () => unknown }): unknown {\n  return node.getType();\n}\nexport const gate = defineGate({ id: "__probe", message: "m", analysis: "syntax", create: (ctx) => placed(ctx.node), mustFlag: [1], mustPass: [1] });\n',
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SUBTREE — the read sits in a MODULE-LEVEL helper, not in the descriptor literal. Scanning only the literal made a one-line extraction a free evasion of an arm whose whole subject is what the policy reads; the claim is about the module, so the subtree is the module",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node["getType"]()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SPELLING — the ELEMENT-ACCESS callee (#2249). Measured CLEAN on the unmodified module while the dotted twin flagged, which is the #2202 shape one module over: a static string subscript is the SAME member position as the dot, and an arm that matched only `PropertyAccessExpression` handed every syntax policy a one-character escape from its own declaration",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node?.["getType"]()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SPELLING — the OPTIONAL-CHAINED element access (#2249). Its own row because #2202's whole lesson is that the optional chain mints a second node shape: the dotted arm already survived `?.` and the subscript arm had to be shown to as well",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => { const { getType } = ctx.node; return getType(); }'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SPELLING — the DESTRUCTURE (#2249), the shape a policy reaches for when it wants a short local name. The binding element IS the member position; resolving the bare identifier callee back to its binding would have been a second answer to a question the position already answers",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => { const { getType: read } = ctx.node; return read(); }'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SPELLING — the RENAMED destructure (#2249): the PROPERTY name is the member, never the local. Without this row the arm could have been written against the binding's own name and read clean on every alias, which is the rename-shaped blind spot the tuple's own narrow-back control was minted for",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.hand(ctx.node.getType.bind(ctx.node))'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SPELLING — the HANDOFF (#2249): `.bind` passes the compiler door to somebody else and never appears as a call whose callee is the member. This row is why the arm matches a member POSITION rather than an invocation — the CALL is not the read",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/lib/__probe-shared.ts": "export function typeOf(node: { getType: () => unknown }): unknown {\n  return node.getType();\n}\n",
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport { typeOf } from "../lib/__probe-shared.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", analysis: "syntax", create: (ctx) => typeOf(ctx.node), mustFlag: [1], mustPass: [1] });\n',
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E IMPORT HOP (#2249) — the byte-identical helper INLINE flags (the SUBTREE row above) and one import hop away read CLEAN, so the arm's own widening stopped exactly at the module boundary. §5b item 7 already names this route (*none smuggled into a `lib/` helper that only this module calls*); the hop is the fix, and this row is what dies without it",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/lib/__probe-shared.ts": "export function typeOf(node: { getType: () => unknown }): unknown {\n  return node.getType();\n}\n",
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport * as shared from "../lib/__probe-shared.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", analysis: "syntax", create: (ctx) => shared.typeOf(ctx.node), mustFlag: [1], mustPass: [1] });\n',
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: 'ARM E IMPORT HOP, NAMESPACE SPELLING (#2459) — THE SAME BYTES THAT WERE A `mustPass` ROW UNTIL THIS COMMIT, whose stated reason was *"a NAMESPACE import names no member at the import boundary, so the hop has nothing to resolve and does not guess"*. True of the DECLARATION, false of the REFERENCE: `shared.typeOf(ctx.node)` names its member with no guessing. `tests/tooling/gate-spelling-twins.int.test.ts` measured the cost as GROWTH — this policy newly blind to the namespace twin of the two import-hop rows above — and that ledger\'s law is that growth is fixed at the reader, never recorded as a row. Keeping the old reversal visible is the point: the same fixture now proves the opposite verdict',
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/lib/__probe-shared.ts":
          "function inner(node: { getType: () => unknown }): unknown {\n  return node.getType();\n}\nexport function outer(node: { getType: () => unknown }): unknown {\n  return inner(node);\n}\n",
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport { outer } from "../lib/__probe-shared.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", analysis: "syntax", create: (ctx) => outer(ctx.node), mustFlag: [1], mustPass: [1] });\n',
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E IMPORT HOP, IN-FILE CHAIN (#2249) — an INVENTED property, so it carries its planted-break receipt (§4.7): with the in-file recursion cut, this row goes green while the direct-helper row above stays red. Without it the hop would stop at the exported declaration's own body, and a two-line indirection inside the SAME lib module would defeat the whole fix — which is precisely how the real corpus is written (`deriveRootSpanOpeners` reaches `getType` three local calls down)",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned because reasons" };\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
      },
      expect: { count: 2 },
      why: "ARM A + ARM B — a legacy-shaped module is UNREGISTERED (arm A) and carries a one-sided exemption table (arm B); two findings on the same module, one per arm",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
        "tooling/src/verify/gates/__probe-health.ts":
          'import { ALLOWLIST } from "./__probe.ts";\nconst MSG = "ALLOWLIST row matching no live site (ratchet down) — delete the stale row";\nexport const gate = { name: "__probe-health", docRow: "x", message: MSG, mustFlag: [1], mustPass: [1], seen: ALLOWLIST };\n',
      },
      expect: { count: 3 },
      why: "ARM A + ARM B, THE INVERTED #2093 CARVE (#2219): both modules are UNREGISTERED (arm A, 2 findings) and __probe.ts carries the one-sided table (arm B, 1 finding). This exact arrangement — the table in the ordinary half, the stale arm in a `-health` sibling that IMPORTS it — is the shape #2096 forbids",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": "export function defineGate(policy: unknown): unknown {\n  return policy;\n}\n",
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", mustFlag: [1], mustPass: [1] });\n',
      },
      why: "ARM A — a CANONICAL `defineGate` module is REGISTERED and its proof floor belongs to lib/policy-validation.ts — the arm judges nothing further on it",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "types", create: (ctx) => ctx.node.getType()'),
      },
      why: 'ARM E DECLARED LIMIT — the arm judges the CLAIM, not the read: a policy that honestly declares `analysis: "types"` may call `getType` freely, and flagging it would price every type-reading gate as a defect',
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node.getText()'),
      },
      why: 'ARM E — `analysis: "syntax"` with no type read is the ordinary, correct shape; the arm must not fire on the mere presence of the declaration (the near-miss that separates "declares syntax" from "declares syntax and reads types")',
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/lib/__probe-shared.ts": "export function typeOf(node: { getType: () => unknown }): unknown {\n  return node.getType();\n}\n",
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport { typeOf } from "../lib/__probe-shared.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", analysis: "syntax", create: () => 1, mustFlag: [1], mustPass: [1] });\n',
      },
      why: "ARM E HOP NARROWING (#2249) — the hop follows only an imported name the module REFERENCES, and this fixture imports the type-reading `typeOf` and never calls it: an unused import reads nothing, so accusing it would be the arm inventing a violation",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/lib/__probe-deep.ts": "export function deep(node: { getType: () => unknown }): unknown {\n  return node.getType();\n}\n",
        "tooling/src/verify/lib/__probe-shared.ts":
          'import { deep } from "./__probe-deep.ts";\nexport function outer(node: { getType: () => unknown }): unknown {\n  return deep(node);\n}\n',
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport { outer } from "../lib/__probe-shared.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", analysis: "syntax", create: (ctx) => outer(ctx.node), mustFlag: [1], mustPass: [1] });\n',
      },
      why: "ARM E DECLARED LIMIT (#2249) — ONE hop, and this row is the limit stated as a RUN rather than as prose: a helper that imports the reader from a THIRD module is two hops and the arm does not follow it",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node[ctx.key]()'),
      },
      why: "ARM E DECLARED LIMIT (#2249) — a COMPUTED subscript names no member this arm can read",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", mustFlag: [1], mustPass: [1] });\n',
        "tooling/src/verify/gates/_proof/__probe-surface.ts": "export const SURFACE = 1;\n",
      },
      why: "ARM A — the corpus is the LOADER's corpus (top-level `gates/*.ts`): a shared proof surface under `gates/_proof/` is an input the policy proofs import, not a module that owes a descriptor",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nconst ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\nconst MSG = "ALLOWLIST row matching no live site (ratchet down) — delete the stale row";\nexport const gate = defineGate({ id: "__probe", message: MSG, mustFlag: [1], mustPass: [1] });\nvoid ALLOWLIST;\n',
      },
      why: "ARM B — the two-sided shape: the module carries a stale-arm diagnostic, so its populated allowlist is a promise it can keep",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/lib/__probe-shared.ts": 'export const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\n',
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport { ALLOWLIST } from "../lib/__probe-shared.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", mustFlag: [1], mustPass: [1] });\nvoid ALLOWLIST;\n',
        "tooling/src/verify/gates/__probe-health.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport { ALLOWLIST } from "../lib/__probe-shared.ts";\nconst MSG = "ALLOWLIST row matching no live site (ratchet down) — delete the stale row";\nexport const gate = defineGate({ id: "__probe-health", message: MSG, mustFlag: [1], mustPass: [1] });\nvoid ALLOWLIST;\n',
      },
      why: "ARM B, THE SANCTIONED ARRANGEMENT (#2219): the collection's ONE home is `lib/` and BOTH siblings import it from there, so neither gate DECLARES an exemption collection and arm B has nothing to accuse. This is the shape #2096 moved the whole corpus to, and pairing it with the `mustFlag` above is what keeps the property provable in both directions once the excuse is gone — without it, 'no accusations' could mean the arm stopped looking",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nconst ALLOWLIST: Record<string, string> = {};\nexport const gate = defineGate({ id: "__probe", message: "m", mustFlag: [1], mustPass: [1] });\nvoid ALLOWLIST;\n',
      },
      why: "ARM B — an EMPTY exemption table has no row to rot; it reds the moment a row lands, so flagging it now would be noise (`no-hover-display-swap`'s born-empty ALLOWLIST is the live precedent)",
    },
    {
      mode: "source",
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nconst SKIP_DIRS = ["dist", "generated"];\nexport const gate = defineGate({ id: "__probe", message: "m", mustFlag: [1], mustPass: [1] });\nvoid SKIP_DIRS;\n',
      },
      why: "ARM B — DECLARED SCOPE: a scan-scope constant is not an exemption. The vocabulary is deliberately narrow (`SKIP`/`SCANNED`/`ROOTS` are out) so scope decisions do not inherit the two-sidedness promise",
    },
  ],
});
