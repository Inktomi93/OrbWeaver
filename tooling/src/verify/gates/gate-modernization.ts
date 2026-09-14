// Policy: gate-modernization — the META-gate. The gate corpus is the enforcement layer; nothing else
// enforces ITS shape, so a gate could register nothing, carry a one-sided exemption table, cite a
// section that does not exist, carry a ratchet ledger nobody counts, or claim syntax while reading types,
// forever and silently. Five
// mechanical axes, all keyed on the corpus itself: A DESCRIPTOR (a gate file must register under one of
// the two contracts) · B EXEMPTIONS (an exemption vocabulary promises a STALE arm) · C CITATION (a docRow
// `§` anchor must resolve in the doc it names) · D ADMITTED (a gate reading a committed ratchet ledger must
// DECLARE what it admitted) · E ANALYSIS (a final syntax policy must not reach compiler semantics). The law
// these arms mechanize is tooling/src/verify/gates/GATE-AUTHORING.md.
//
// MIXED RUNTIME (#1584, docs/reviews/gate-runtime/mixed-runtime-front-door.md §5): arm A recognises a module
// as REGISTERED under either contract — a legacy `gate` descriptor object, or a `gate = defineGate(…)` call
// whose callee resolves BY IMPORT ORIGIN to `contract/policy.ts` (`lib/gate-contract-origin.ts`; a same-named
// local `defineGate` is not the contract and the module registers nothing). A final module's proof floor
// (≥1 mustFlag/mustPass, no legacy fields) is `lib/policy-validation.ts`'s at load time, so arm A judges
// nothing further on it; arms B and D are MODULE-shape arms and run over both contracts (a one-sided
// exemption table or a silent ledger read is a defect whatever the descriptor); arm C reads `docRow`,
// which only a legacy descriptor carries. The corpus is the LOADER's corpus — top-level `gates/*.ts` —
// so the shared proof surfaces under `gates/_proof/` are inputs to policy proofs, never modules that owe
// a descriptor.
import { posix } from "node:path";
import type { Node, SourceFile } from "ts-morph";
import { Node as TsNode } from "ts-morph";
import type { GatePolicyContext, GatePolicyProof } from "../contract/policy.ts";
import { defineGate, POLICY_PROOF_ARMS } from "../contract/policy.ts";
import type { DocumentIndex } from "../contract/resource-document.ts";
import type { GateModernizationModuleSyntax } from "../lib/gate-modernization-fact.ts";
import { GATE_MODERNIZATION_POPULATION, gateModernizationFact, readGateModernizationFacts } from "../lib/gate-modernization-fact.ts";
import { finalDescriptorOf, gateRegistrationOf } from "../lib/policy-descriptor-read.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { GATE_MODERNIZATION_PROBE_LEDGER, GATE_MODERNIZATION_PROBE_LEDGER_SUFFIX } from "./_proof/gate-modernization.ts";

const GATES_REL = "tooling/src/verify/gates/";
/** This module's own path — ARM D's real-tree anchor (§4.5) and the file its tripwire reports on. */
const GATE_SELF = `${GATES_REL}gate-modernization.ts`;
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

// ── ARM C parsing ────────────────────────────────────────────────────────────────────────────────────
// A `§` binds to the nearest preceding PATH token, md or code — `member-visibility.ts §3.6` cites a code
// file's section, not the `.md` earlier in the same string.
const PATH_TOKEN_RE = /[\w][\w./-]*\.(?:md|ts|tsx)\b/gu;
const SECTION_RE = /§\s*([^§()/·—\n,;"']+)/gu;
const HEADING_RE = /^#{1,6}\s+(.*)$/gmu;
const LIST_PREFIX_RE = /^[\s>*+\-#`|§]*/u;
const WS_RE = /\s+/u;
// The docRow bare-name resolution roots, in order — the same convention `dangling-refs` resolves against.
const BARE_ROOTS: readonly string[] = ["docs/architecture/core", "docs/architecture/history", "docs/architecture/proposed", "."];
const ANCHOR_TERMINATORS = ".):; ";

// THE ONE REASON. The three NODE-anchored arms name themselves through their token; their per-finding
// messages folded in here when they left the Finding overload (which bypasses `hasGateIgnore` —
// GATE-AUTHORING §1 — so every marker on them was inert). The file-level NO-DESCRIPTOR arm keeps its own
// message: it anchors on a file, not a node.
const MESSAGE =
  "a gate file breaks the gate-authoring law (tooling/src/verify/gates/GATE-AUTHORING.md): it registers no proven " +
  "descriptor under either contract, carries an exemption vocabulary with no STALE arm, or cites a `§` anchor that does not exist " +
  "in the doc it names. The gate corpus is the enforcement layer — nothing else enforces its shape. " +
  "A `mustFlag`/`mustPass` token: the descriptor has no non-empty array for that field — a gate without a " +
  "self-proof cannot be shown to bite, so add ≥1 example WITH a `why`. A `§<anchor>` token: the docRow cites " +
  "that section but the doc it names defines no such anchor — no heading, no line-start anchor — which is " +
  "drift the amnesiac reader cannot tell from a real home (the UI-Gates §12.6 phantom class). A token that " +
  "IS a committed ratchet-ledger path: this gate READS that ledger and never calls `ctx.scan({ admitted })`, " +
  "so every finding its budgets absolve is missing from the single-pass's admitted total — declared debt " +
  "that renders as ZERO declared debt, which is the one number a reader uses to know the debt is still " +
  "there (#551). " +
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
  "A: export `gate = defineGate({…})` from tooling/src/verify/contract/policy.ts (its validator owns the proof floor), or a legacy " +
  "`gate: GateDescriptor` with ≥1 mustFlag + ≥1 mustPass (tooling/src/verify/contract/gate.ts). " +
  "B: give the exemption table a STALE arm in `finalize` — a row matching zero live sites must be RED, " +
  `guarded on a real-tree anchor, not on \`scope.kind\` alone (${LAW} §4); if the collection is a ` +
  "scan-SCOPE decision rather than an exemption, rename it out of the exemption vocabulary. " +
  "C: repoint the `§` to an anchor the cited doc actually defines. " +
  `D: call \`ctx.scan({ admitted: <the findings your budgets absolved> })\` in the gate's \`run\`/\`finalize\` (${LAW} §1) — ` +
  "`density-tier` and `duplicate-action-doors` are the worked examples; `pnpm debt` enumerates the rows behind the number. " +
  'E: declare `analysis: "types"` if the policy genuinely needs compiler-resolved semantics, or delete the ' +
  "compiler-reaching calls ANYWHERE IN THE MODULE and judge the node's syntax — a type read through a ts-morph " +
  "node is still a type read, and the declared plane is what the runtime prices.";

// ── ARM A ────────────────────────────────────────────────────────────────────────────────────────────
const NO_DESCRIPTOR = (rel: string): string =>
  `${rel} lives in the gate corpus but exports no \`gate\` descriptor object and no canonical \`defineGate\` policy — ` +
  "the mixed loader records such a module as UNREGISTERED (tooling/src/verify/lib/loader.ts) and the front door " +
  "reconciles the roster, but the file itself enforces nothing and reports nothing, forever. Export a valid legacy " +
  `descriptor, a \`defineGate\` policy imported from tooling/src/verify/contract/policy.ts, or delete the file (${LAW} §1).`;

/** How a gate module registers: the legacy descriptor OBJECT (judged field by field below), or a canonical
 *  `defineGate(…)` CALL (registered; its shape is the final contract's own validation). */
type Registration = { readonly contract: "legacy"; readonly obj: Node } | { readonly contract: "final"; readonly obj: Node | undefined };

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

/** The module's registration under either contract, or undefined when it registers under neither. Identity, not
 *  spelling: a `defineGate` whose import origin is not `contract/policy.ts` is a lookalike and registers nothing. */
function registrationOf(sf: SourceFile): Registration | undefined {
  const contract = gateRegistrationOf(sf);
  if (contract === "final") {
    // The descriptor literal itself — §12.1 requires `defineGate({ … })` to take a direct object literal,
    // and ARM E judges the CLAIM that literal makes about its own evidence plane. The shared reader keeps
    // this classification identical to the loader and the policy-soundness family.
    return { contract, obj: finalDescriptorOf(sf) };
  }
  const init = sf.getVariableDeclaration("gate")?.getInitializer();
  const value = init === undefined ? undefined : unwrap(init);
  return contract === "legacy" && value !== undefined && TsNode.isObjectLiteralExpression(value) ? { contract, obj: value } : undefined;
}

/** Is a descriptor property a non-empty array literal? */
function hasNonEmptyArrayProp(obj: Node, field: string): boolean {
  const prop = TsNode.isObjectLiteralExpression(obj) ? obj.getProperty(field) : undefined;
  const init = prop !== undefined && TsNode.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  return init !== undefined && TsNode.isArrayLiteralExpression(init) && init.getElements().length > 0;
}

/** ARM A for one module. Returns the LEGACY descriptor object for arm C, or undefined when there is nothing further
 *  to judge — a registered final policy (its floor is `lib/policy-validation.ts`) or an unregistered module. */
function armDescriptor(sf: SourceFile, rel: string, ctx: GatePolicyContext): Node | undefined {
  const registration = registrationOf(sf);
  if (registration === undefined) {
    // THE SANCTIONED Finding overload (§1): FILE-LEVEL by construction — the module exports no descriptor,
    // so there is no node to anchor on or hang a marker off.
    ctx.report.file(rel, { line: 1, column: 1, message: NO_DESCRIPTOR(rel) });
    return;
  }
  if (registration.contract === "final") {
    armSyntaxAnalysis(registration.obj, sf, ctx);
    return;
  }
  const { obj } = registration;
  for (const field of ["mustFlag", "mustPass"]) {
    if (!hasNonEmptyArrayProp(obj, field)) {
      // The missing FIELD is the token — both fields can be missing on the SAME descriptor node, which is
      // exactly the §4.3a case a line-scoped marker would over-exempt.
      reportToken(ctx, obj, field);
    }
  }
  return obj;
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

/** ONE IMPORT HOP (#2249): every NAMED import from a RELATIVE specifier whose local name this module
 *  actually references, resolved to the imported module's own declaration of that name.
 *
 *  DECLARED LIMITS, each with its own `mustPass` row: a namespace (`import * as x`) or default import names
 *  no member at this boundary and is not followed; a specifier this run's project did not load is skipped
 *  (the read is unobservable, not absolved); and the walk stops at the hopped module — a helper that itself
 *  imports the reader from a THIRD module is two hops and out of reach. */
function importHopReadsTypes(sf: SourceFile): boolean {
  const used = new Set<string>();
  referencedNames(sf, used);
  for (const declaration of sf.getImportDeclarations()) {
    if (!declaration.getModuleSpecifierValue().startsWith(".")) {
      continue;
    }
    const target = declaration.getModuleSpecifierSourceFile();
    if (target === undefined || target === sf) {
      continue;
    }
    for (const specifier of declaration.getNamedImports()) {
      const local = (specifier.getAliasNode() ?? specifier.getNameNode()).getText();
      if (used.has(local) && hoppedDeclarationReadsTypes(target, specifier.getName(), new Set())) {
        return true;
      }
    }
  }
  return false;
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

// ── ARM C ────────────────────────────────────────────────────────────────────────────────────────────
function docCandidates(ref: string): readonly string[] {
  return ref.includes("/") ? [posix.normalize(ref), posix.join("docs/architecture", ref)] : BARE_ROOTS.map((root) => posix.join(root, ref));
}

function resolveDoc(documents: DocumentIndex, ref: string): string | undefined {
  const candidates = docCandidates(ref);
  const refusal = documents.refusals.find((row) => candidates.includes(row.path));
  if (refusal !== undefined) {
    throw new Error(`cited document ${refusal.path} was refused (${refusal.status}): ${refusal.reason}`);
  }
  return documents.documents.find((document) => candidates.includes(document.path))?.text;
}

function headingsOf(src: string): string[] {
  const out: string[] = [];
  for (const m of src.matchAll(HEADING_RE)) {
    const t = m[1];
    if (t !== undefined) {
      out.push(t.trim().toLowerCase());
    }
  }
  return out;
}

/** Does the doc DEFINE this anchor at a line start (`### 6b. …`, `**F-2** …`, `- 13.4 …`)? A bare `§12.6`
 *  mention in prose does NOT count — that is a REFERENCE, and a doc citing an anchor it never defines is
 *  exactly the phantom this arm exists to catch. */
function definedAsListItem(src: string, token: string): boolean {
  for (const raw of src.split("\n")) {
    const line = raw.toLowerCase().replace(LIST_PREFIX_RE, "");
    if (!line.startsWith(token)) {
      continue;
    }
    const after = line.slice(token.length);
    if (after.length === 0 || ANCHOR_TERMINATORS.includes(after.charAt(0))) {
      return true;
    }
  }
  return false;
}

function anchorExists(src: string, section: string): boolean {
  const s = section.trim();
  if (s.length === 0) {
    return true;
  }
  const headings = headingsOf(src);
  if (headings.some((h) => h.includes(s.toLowerCase()))) {
    return true; // a phrase anchor: `§Cross-tier composition`
  }
  const first = (s.split(WS_RE)[0] ?? s).toLowerCase();
  if (headings.some((h) => h === first || h.startsWith(`${first}.`) || h.startsWith(`${first} `) || h.startsWith(`${first}:`) || h.includes(`§${first}`))) {
    return true;
  }
  return definedAsListItem(src, first);
}

/** The literal text of a docRow initializer (string or no-substitution template). */
function docRowText(obj: Node): string | undefined {
  const prop = TsNode.isObjectLiteralExpression(obj) ? obj.getProperty("docRow") : undefined;
  const init = prop !== undefined && TsNode.isPropertyAssignment(prop) ? prop.getInitializer() : undefined;
  if (init === undefined) {
    return;
  }
  const n = unwrap(init);
  return TsNode.isStringLiteral(n) || TsNode.isNoSubstitutionTemplateLiteral(n) ? n.getLiteralText() : undefined;
}

function armCitation(obj: Node, ctx: GatePolicyContext, documents: DocumentIndex): void {
  const value = docRowText(obj);
  if (value === undefined) {
    return;
  }
  const paths = [...value.matchAll(PATH_TOKEN_RE)].map((m) => ({ ref: m[0], at: m.index }));
  for (const sm of value.matchAll(SECTION_RE)) {
    const section = sm[1];
    if (section === undefined) {
      continue;
    }
    const owner = paths.findLast((p) => p.at < sm.index);
    if (owner === undefined || !owner.ref.endsWith(".md")) {
      continue; // a §-cite bound to a CODE file (or to nothing) — out of this arm's scope
    }
    const document = resolveDoc(documents, owner.ref);
    if (document === undefined) {
      continue; // the doc itself does not resolve — that is `dangling-refs`' arm, not a second red here
    }
    if (!anchorExists(document, section)) {
      // The ghost ANCHOR is the token — several ghost cites can ride one docRow on one node.
      reportToken(ctx, obj, `§${section.trim()}`);
    }
  }
}

// ── ARM D ────────────────────────────────────────────────────────────────────────────────────────────
// A gate that reads a committed ratchet ledger and never calls `ctx.scan({ admitted })` is invisible in
// the single-pass's "N finding(s) admitted by ratchet baselines" line — declared debt that reads as ZERO
// declared debt. Measured 2026-08-23 (#546/#551): three of the six ledger-carrying gates were silent, and
// the printed total (216) omitted 523 budgeted findings across their baselines. GATE-AUTHORING.md §1 said
// so in prose ("any new baseline ratchet owes the same call"); prose is a wish, so this is its enforcer.
//
// A gate is a LEDGER READER when one of its string literals IS a ratchet-ledger path (anchored whole-text
// match, so the sentence you are reading — and every other prose mention — can never trip it).
// …and that literal is NOT inside a `mustFlag`/`mustPass` example (#569): a conformance FIXTURE ledger is
// something the gate JUDGES, never a budget it reads — `ratchet-row-integrity` is the worked case.
const LEDGER_PATH_RE = /^[\w./-]+\.baseline\.json$/u;
const ADMITTED_PROP = "admitted";
const SCAN_METHOD = "scan";
/** ARM D's fixture ledger, ASSEMBLED from parts. This module declares no admitted count of its own, so a
 *  whole string literal that IS a ledger path would make the arm accuse its own conformance rows
 *  (GATE-AUTHORING.md §5 — never spell a gate's trigger literally near its scan root). Neither piece
 *  satisfies the anchored match; only their concatenation does, and that exists at runtime only. */
const NO_ADMITTED_TRIPWIRE =
  "BLINDNESS TRIPWIRE (ARM D) — no gate module in the corpus was recognised as a ratchet-ledger reader, so " +
  "this arm would report ✓ over every silent ratchet forever. The ledger-path recogniser in " +
  "tooling/src/verify/gates/gate-modernization.ts stopped matching: re-point it (GATE-AUTHORING.md §4.6).";

/** The SELF-PROOF fields: a ledger path inside a conformance example is a FIXTURE, not a read (#569 — the
 *  `ratchet-row-integrity` gate JUDGES ledgers and admits nothing, so its example files legitimately name
 *  `*.baseline.json` paths and ARM D accused it three times over). Narrow on purpose: a real reader's path
 *  constant lives at module scope, so this carve cannot absolve one. */
const EXAMPLE_FIELDS: ReadonlySet<string> = new Set(POLICY_PROOF_ARMS);

/** Is this literal inside a `mustFlag`/`mustPass` example block? */
function inExampleBlock(node: Node): boolean {
  for (let cur = node.getParent(); cur !== undefined; cur = cur.getParent()) {
    if (TsNode.isPropertyAssignment(cur) && EXAMPLE_FIELDS.has(cur.getName())) {
      return true;
    }
  }
  return false;
}

/** The ratchet-ledger paths this gate module reads, as their literal nodes (the report anchor). A path that
 *  only ever appears in a conformance example is EXCLUDED — see `inExampleBlock`. */
function ledgerLiterals(module: GateModernizationModuleSyntax): { readonly node: Node; readonly path: string }[] {
  const out: { node: Node; path: string }[] = [];
  for (const node of module.strings) {
    if (!(TsNode.isStringLiteral(node) || TsNode.isNoSubstitutionTemplateLiteral(node))) {
      continue;
    }
    const text = node.getLiteralText();
    if (LEDGER_PATH_RE.test(text) && !inExampleBlock(node)) {
      out.push({ node, path: text });
    }
  }
  return out;
}

/** Does this module declare an admitted count — `<x>.scan({ admitted: … })` anywhere in it? AST-positional
 *  (a mention of the call in a comment or a doc string enforces nothing, and this arm's own header names it). */
export function declaresAdmitted(module: GateModernizationModuleSyntax): boolean {
  for (const node of module.calls) {
    if (!TsNode.isCallExpression(node)) {
      continue;
    }
    const call = node;
    const callee = call.getExpression();
    if (!TsNode.isPropertyAccessExpression(callee) || callee.getName() !== SCAN_METHOD) {
      continue;
    }
    const arg = call.getArguments()[0];
    if (arg !== undefined && TsNode.isObjectLiteralExpression(arg) && arg.getProperty(ADMITTED_PROP) !== undefined) {
      return true;
    }
  }
  return false;
}

/** ARM D for one gate module. Returns whether it reads a ledger at all — the tripwire's evidence. */
function armAdmitted(module: GateModernizationModuleSyntax, ctx: GatePolicyContext): boolean {
  const ledgers = ledgerLiterals(module);
  if (ledgers.length === 0 || declaresAdmitted(module)) {
    return ledgers.length > 0;
  }
  for (const ledger of ledgers) {
    // NODE-anchored with the ledger path as its token: a gate can read two ledgers on two lines, and the
    // token is what a `@orb-gate-ignore` would have to name (§4.3a).
    reportToken(ctx, ledger.node, ledger.path);
  }
  return true;
}

/** Arm B for one gate module: every one-sided exemption collection it carries. Unsuppressed by
 *  construction — the RETRO handoff baseline reached its terminal state `{}` (GATE-AUTHORING.md §4.8) and was
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

interface CarriedProof {
  readonly files: Readonly<Record<string, string>>;
  readonly expect?: GatePolicyProof["expect"];
  readonly why: string;
}

const PROOF_DOC = "docs/architecture/core/__gate_modernization_resource_anchor.md";
const PROOF_CATALOG = "docs/catalog/catalog.json";

function resourceProof(proof: CarriedProof): GatePolicyProof {
  return {
    mode: "resource",
    files: {
      [PROOF_DOC]: "# Resource anchor\n",
      [PROOF_CATALOG]: `{"documents":[{"path":"${PROOF_DOC}"}]}\n`,
      ...proof.files,
    },
    ...(proof.expect === undefined ? {} : { expect: proof.expect }),
    why: proof.why,
  };
}

export const gate = defineGate({
  id: "gate-modernization",
  family: "gate-modernization",
  authority: "hard",
  severity: "error",
  population: GATE_MODERNIZATION_POPULATION,
  analysis: "resource",
  execution: "entire-population",
  facts: [gateModernizationFact],
  resources: [{ kind: "documents" }],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const documents = readyResourceValue(ctx.resources.documents());
    return {
      evaluate: () => {
        const syntax = readGateModernizationFacts(ctx);
        let ledgerReaders = 0;
        let selfVisited = false;
        for (const module of syntax.modules) {
          const rel = ctx.relativePath(module.sourceFile);
          selfVisited ||= rel === GATE_SELF;
          const obj = armDescriptor(module.sourceFile, rel, ctx);
          armExemptions(module, ctx);
          ledgerReaders += armAdmitted(module, ctx) ? 1 : 0;
          if (obj !== undefined) {
            armCitation(obj, ctx, documents);
          }
        }
        // §4.6: this arm is keyed on a NAME shape, so a corpus with zero recognised ledger readers means
        // the recogniser died, not that the debt did. The self module is the real-corpus anchor.
        if (ledgerReaders === 0 && selfVisited) {
          ctx.report.file(GATE_SELF, { line: 1, column: 1, message: NO_ADMITTED_TRIPWIRE });
        }
      },
    };
  },

  mustFlag: [
    {
      files: { "tooling/src/verify/gates/__probe.ts": "export const notAGate = 1;\n" },
      expect: { messageIncludes: "exports no `gate` descriptor" },
      why: "ARM A — a module in the gate corpus that registers under neither contract enforces nothing, forever; the mixed loader records it as unregistered, and this is the finding that names the file",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'function defineGate(policy: unknown): unknown {\n  return policy;\n}\nexport const gate = defineGate({ id: "__probe", message: "m", mustFlag: [1], mustPass: [1] });\n',
      },
      expect: { messageIncludes: "exports no `gate` descriptor" },
      why: "ARM A — IDENTITY, not spelling: a same-named LOCAL `defineGate` has no import origin in contract/policy.ts, so the module registers nothing (the loader would refuse its unbranded result too) and the arm names it rather than trusting the callee's name",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node.getType()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: 'ARM E — a policy declaring `analysis: "syntax"` while calling `getType` reads types past the only fence the runtime has (`ctx.checker()` throws for a syntax owner; a ts-morph node does not ask it). ONE finding, on the DECLARATION: the token is `analysis` because changing that one word — or dropping the read — is the repair, and a per-call-site finding would give several findings one carrier and one token, which has no working waiver door at all',
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node.getSymbol()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E — `getSymbol` is the second door onto the same compiler and is flagged identically; without this row the arm would be shown to catch only half its own vocabulary",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node.getContextualType()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getContextualType` — the member #1958 was filed on: the contextual type of an expression is the checker answering a question about the node, reached without ever asking the context",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node.getSymbolOrThrow()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getSymbolOrThrow` — the throwing twin of `getSymbol` — a different spelling of the same read, and a tuple that named only the non-throwing form would miss every module that prefers the assertive one",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.symbol.getAliasedSymbol()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getAliasedSymbol` — import-alias resolution is a SYMBOL read through the compiler, and it is the exact call an origin recognizer reaches for",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.symbol.getAliasedSymbolOrThrow()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getAliasedSymbolOrThrow` — the throwing twin again — the pair is the rule, not the exception",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.symbol.getExportSymbol()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getExportSymbol` — the local-to-export symbol hop, the read a module-boundary policy wants and the one it must declare `types` for",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.symbol.getDeclaredType()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getDeclaredType` — a symbol's declared type is the checker's answer, not the node's syntax",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.resolved.getApparentType()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getApparentType` — a TYPE-level read chained off a type read: the arm must see the whole chain, not only its first link",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.signature.getReturnType()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getReturnType` — signature return types are the deepest of these reads and the most expensive, which is precisely why the declared plane must be honest",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.checkerLike.getTypeAtLocation(ctx.node)'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getTypeAtLocation` — the TypeChecker's own spelling — reachable through any handle a module gets on a checker, so naming only the node-side members would leave the front door open",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.project.getTypeChecker()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `getTypeChecker` — taking the checker off a Project is a type read with an extra step; §12.3 bans the gate-owned Project separately, and this arm names the CLAIM",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.checker()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E MEMBER `checker` — `ctx.checker()` under a syntax owner throws at RUNTIME and only if the branch executes — a different tier. The DECLARATION is false the moment the call is written, and this arm is the one that reads declarations (#1958, cb-v-instruments)",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nfunction placed(node: { getType: () => unknown }): unknown {\n  return node.getType();\n}\nexport const gate = defineGate({ id: "__probe", message: "m", analysis: "syntax", create: (ctx) => placed(ctx.node), mustFlag: [1], mustPass: [1] });\n',
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SUBTREE — the read sits in a MODULE-LEVEL helper, not in the descriptor literal. Scanning only the literal made a one-line extraction a free evasion of an arm whose whole subject is what the policy reads; the claim is about the module, so the subtree is the module",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node["getType"]()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SPELLING — the ELEMENT-ACCESS callee (#2249). Measured CLEAN on the unmodified module while the dotted twin flagged, which is the #2202 shape one module over: a static string subscript is the SAME member position as the dot, and an arm that matched only `PropertyAccessExpression` handed every syntax policy a one-character escape from its own declaration",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node?.["getType"]()'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SPELLING — the OPTIONAL-CHAINED element access (#2249). Its own row because #2202's whole lesson is that the optional chain mints a second node shape: the dotted arm already survived `?.` and the subscript arm had to be shown to as well",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => { const { getType } = ctx.node; return getType(); }'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SPELLING — the DESTRUCTURE (#2249), the shape a policy reaches for when it wants a short local name. The binding element IS the member position; resolving the bare identifier callee back to its binding would have been a second answer to a question the position already answers",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => { const { getType: read } = ctx.node; return read(); }'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SPELLING — the RENAMED destructure (#2249): the PROPERTY name is the member, never the local. Without this row the arm could have been written against the binding's own name and read clean on every alias, which is the rename-shaped blind spot the tuple's own narrow-back control was minted for",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.hand(ctx.node.getType.bind(ctx.node))'),
      },
      expect: { count: 1, token: ANALYSIS_PROP },
      why: "ARM E SPELLING — the HANDOFF (#2249): `.bind` passes the compiler door to somebody else and never appears as a call whose callee is the member. This row is why the arm matches a member POSITION rather than an invocation — the CALL is not the read",
    },
    {
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
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [{ files: "x" }], mustPass: [] };\n',
      },
      expect: { token: "mustPass" },
      why: "ARM A — an empty self-proof arm: a gate nobody can show does not false-positive",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned because reasons" };\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
      },
      expect: { token: "ALLOWLIST" },
      why: "ARM B — the founding shape: a populated allowlist with no diagnostic that fires when a row stops matching (the ~57-gate one-sided census)",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
        "tooling/src/verify/gates/__probe-health.ts":
          'import { ALLOWLIST } from "./__probe.ts";\nconst MSG = "ALLOWLIST row matching no live site (ratchet down) — delete the stale row";\nexport const gate = { name: "__probe-health", docRow: "x", message: MSG, mustFlag: [1], mustPass: [1], seen: ALLOWLIST };\n',
      },
      expect: { token: "ALLOWLIST" },
      why: "ARM B, THE INVERTED #2093 CARVE (#2219): this EXACT arrangement — the table in the ordinary half, the stale arm in a `-health` sibling that IMPORTS it from the twin gate — used to be the excuse, and it is the arrangement #2096 now forbids outright (a gate never imports a gate; a shared collection's one home is `lib/`). It is therefore a FINDING, and this row is the tripwire that catches its return. The three modules the carve was built for all moved to `lib/` before it was retired, so retiring it accuses nobody on today's tree — which is exactly why the assertion has to exist instead",
    },
    {
      files: {
        "docs/architecture/core/__g_gm_doc.md": "---\nkind: law\n---\n\n## 11. A real section\n\nprose.\n\nSee §12.6 for more.\n",
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "__g_gm_doc.md §12.6", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      expect: { token: "§12.6" },
      why: "ARM C — the UI-Gates §12.6 phantom EXACTLY: the doc REFERENCES the anchor in prose but never DEFINES it, so a reference-counting check would false-pass",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts": `const LEDGER = "${GATE_MODERNIZATION_PROBE_LEDGER}";\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], run: (ctx) => { ctx.report({ file: LEDGER, line: 1, column: 0, message: "m" }); } };\n`,
      },
      expect: { token: GATE_MODERNIZATION_PROBE_LEDGER },
      why: "ARM D — THE FOUNDING SHAPE (#551): a gate reading a committed ratchet ledger and declaring no admitted count. Its whole budgeted population then renders as ZERO in the single-pass's admitted line — measured at 523 findings across three gates",
    },
  ].map(resourceProof),
  mustPass: [
    {
      files: {
        "tooling/src/verify/gates/__probe.ts": `export const gate = { name: "__probe", docRow: "x", message: "m", run: (ctx) => { ctx.scan({ unit: "ledger row" }); }, mustFlag: [{ files: { "${GATE_MODERNIZATION_PROBE_LEDGER}": "{}" }, why: "w" }], mustPass: [{ files: { "${GATE_MODERNIZATION_PROBE_LEDGER}": "{}" }, why: "w" }] };\n`,
      },
      why: "ARM D's example carve (#569): a gate whose ONLY ledger path sits inside its mustFlag/mustPass fixtures JUDGES ledgers rather than reading budgets — accusing it of a silent ratchet was a false positive that cost `ratchet-row-integrity` three findings at landing",
    },
    {
      files: {
        // The origin reader resolves the relative import on disk (this gate is fsBacked, so its example is a real
        // temp root), exactly as it resolves the real contract/policy.ts on the real tree.
        "tooling/src/verify/contract/policy.ts": "export function defineGate(policy: unknown): unknown {\n  return policy;\n}\n",
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", mustFlag: [1], mustPass: [1] });\n',
      },
      why: "ARM A — a CANONICAL `defineGate` module is REGISTERED (the mixed loader classifies it final by brand; this arm by import origin), and its proof floor belongs to lib/policy-validation.ts — the arm judges nothing further on it (the #1584 widening: 163 converted modules read as 'exports no descriptor' before it)",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "types", create: (ctx) => ctx.node.getType()'),
      },
      why: 'ARM E DECLARED LIMIT — the arm judges the CLAIM, not the read: a policy that honestly declares `analysis: "types"` may call `getType` freely, and flagging it would price every type-reading gate as a defect',
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node.getText()'),
      },
      why: 'ARM E — `analysis: "syntax"` with no type read is the ordinary, correct shape; the arm must not fire on the mere presence of the declaration (the near-miss that separates "declares syntax" from "declares syntax and reads types")',
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/lib/__probe-shared.ts": "export function typeOf(node: { getType: () => unknown }): unknown {\n  return node.getType();\n}\n",
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport { typeOf } from "../lib/__probe-shared.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", analysis: "syntax", create: () => 1, mustFlag: [1], mustPass: [1] });\n',
      },
      why: "ARM E HOP NARROWING (#2249) — the hop follows only an imported name the module REFERENCES, and this fixture imports the type-reading `typeOf` and never calls it: an unused import reads nothing, so accusing it would be the arm inventing a violation. IT DIED UNDER ITS OWN CUT, and only after the fixture was REPAIRED — the first draft imported a `SAFE` sibling from the same module and cut CLEAN, because the hop resolves the IMPORTED NAME and so never reached `typeOf` in either direction. An unenforced FIXTURE, not an unenforced fence; the discriminating import is the type-reading one",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/lib/__probe-deep.ts": "export function deep(node: { getType: () => unknown }): unknown {\n  return node.getType();\n}\n",
        "tooling/src/verify/lib/__probe-shared.ts":
          'import { deep } from "./__probe-deep.ts";\nexport function outer(node: { getType: () => unknown }): unknown {\n  return deep(node);\n}\n',
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport { outer } from "../lib/__probe-shared.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", analysis: "syntax", create: (ctx) => outer(ctx.node), mustFlag: [1], mustPass: [1] });\n',
      },
      why: "ARM E DECLARED LIMIT (#2249) — ONE hop, and this row is the limit stated as a RUN rather than as prose: a helper that imports the reader from a THIRD module is two hops and the arm does not follow it. The in-file chain IS followed (its own `mustFlag` above), so the boundary is the FILE, not the call depth; widening past it would make every `lib/` importer's transitive closure this arm's subject",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/lib/__probe-shared.ts": "export function typeOf(node: { getType: () => unknown }): unknown {\n  return node.getType();\n}\n",
        "tooling/src/verify/gates/__probe.ts":
          'import { defineGate } from "../contract/policy.ts";\nimport * as shared from "../lib/__probe-shared.ts";\nexport const gate = defineGate({ id: "__probe", message: "m", analysis: "syntax", create: (ctx) => shared.typeOf(ctx.node), mustFlag: [1], mustPass: [1] });\n',
      },
      why: "ARM E DECLARED LIMIT (#2249) — a NAMESPACE import names no member at the import boundary, so the hop has nothing to resolve and does not guess. Recorded as a run row rather than a sentence because a limit nobody ran is the shape §4.1 calls a fail-open wearing a limit's clothes; the corpus spells its lib imports named, and a namespace spelling would be visible in review",
    },
    {
      files: {
        "tooling/src/verify/contract/policy.ts": POLICY_STUB,
        "tooling/src/verify/gates/__probe.ts": finalProbe('analysis: "syntax", create: (ctx) => ctx.node[ctx.key]()'),
      },
      why: "ARM E DECLARED LIMIT (#2249) — a COMPUTED subscript names no member this arm can read. The static-string test is what keeps the element-access arm an IDENTITY test rather than a guess; resolving the key would be a type read inside the gate that polices type reads",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], run: (ctx) => ctx.node.getType() };\n',
      },
      why: "ARM E SCOPE — a LEGACY descriptor carries no `analysis` field, so it makes no claim about its evidence plane and there is nothing for a type read to contradict; arm E is final-contract only",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts": 'export const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1] };\n',
        "tooling/src/verify/gates/_proof/__probe-surface.ts": "export const SURFACE = 1;\n",
      },
      why: "ARM A — the corpus is the LOADER's corpus (top-level `gates/*.ts`): a shared proof surface under `gates/_proof/` is an input the policy proofs import, not a module that owes a descriptor (six such files read as unregistered before the predicate matched the loader's)",
    },

    {
      files: {
        "docs/architecture/core/__g_gm_doc.md": "---\nkind: law\n---\n\n## Cross-tier composition (who reads db)\n\n### 6b. A sub-anchor\n\nprose.\n",
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "__g_gm_doc.md §Cross-tier composition / __g_gm_doc.md §6b", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      why: "ARM C passes both anchor spellings — a PHRASE heading and a numbered sub-heading (`### 6b.`), the two forms the corpus actually uses",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\nconst MSG = "ALLOWLIST row matching no live site (ratchet down) — delete the stale row";\nexport const gate = { name: "__probe", docRow: "x", message: MSG, mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
      },
      why: "ARM B — the two-sided shape: the module carries a stale-arm diagnostic, so its populated allowlist is a promise it can keep",
    },
    {
      files: {
        "tooling/src/verify/lib/__probe-shared.ts": 'export const ALLOWLIST = { "packages/x/src/a.ts": "sanctioned" };\n',
        "tooling/src/verify/gates/__probe.ts":
          'import { ALLOWLIST } from "../lib/__probe-shared.ts";\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
        "tooling/src/verify/gates/__probe-health.ts":
          'import { ALLOWLIST } from "../lib/__probe-shared.ts";\nconst MSG = "ALLOWLIST row matching no live site (ratchet down) — delete the stale row";\nexport const gate = { name: "__probe-health", docRow: "x", message: MSG, mustFlag: [1], mustPass: [1], seen: ALLOWLIST };\n',
      },
      why: "ARM B, THE SANCTIONED ARRANGEMENT (#2219): the collection's ONE home is `lib/` and BOTH siblings import it from there, so neither gate DECLARES an exemption collection and arm B has nothing to accuse. This is the shape #2096 moved the whole corpus to, and pairing it with the `mustFlag` above is what keeps the property provable in both directions once the excuse is gone — without it, 'no accusations' could mean the arm stopped looking",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'const ALLOWLIST: Record<string, string> = {};\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], allow: ALLOWLIST };\n',
      },
      why: "ARM B — an EMPTY exemption table has no row to rot; it reds the moment a row lands, so flagging it now would be noise (`no-hover-display-swap`'s born-empty ALLOWLIST is the live precedent)",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'const SKIP_DIRS = ["dist", "generated"];\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], skip: SKIP_DIRS };\n',
      },
      why: "ARM B — DECLARED SCOPE: a scan-scope constant is not an exemption. The vocabulary is deliberately narrow (`SKIP`/`SCANNED`/`ROOTS` are out) so scope decisions do not inherit the two-sidedness promise",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "member-visibility.ts §3.6 producer-stamp", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      why: "ARM C — DECLARED LIMIT: a `§` bound to a CODE file cites a source-file section, not a doc anchor; binding to the nearest preceding PATH token (md OR code) keeps it out of scope instead of misattributing it to an earlier `.md`",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "NO-SUCH-DOC-ANYWHERE.md §4", message: "m", mustFlag: [1], mustPass: [1] };\n',
      },
      why: "ARM C — a docRow naming a doc that resolves NOWHERE is `dangling-refs`' finding, not a second red here: one defect, one diagnostic",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts": `const LEDGER = "${GATE_MODERNIZATION_PROBE_LEDGER}";\nexport const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], run: (ctx) => { ctx.scan({ admitted: LEDGER.length }); } };\n`,
      },
      why: "ARM D — the honest shape: the ledger reader declares what its budgets absolved, so the single-pass total includes it",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts": `const NOTE = "regenerate the committed ${GATE_MODERNIZATION_PROBE_LEDGER_SUFFIX} ledger when the count shrinks";\nexport const gate = { name: "__probe", docRow: "x", message: NOTE, mustFlag: [1], mustPass: [1] };\n`,
      },
      why: "ARM D — DECLARED LIMIT and the anti-self-flag: the recogniser matches a literal that IS a ledger PATH (whole-text anchored), never prose that merely mentions one — otherwise this gate's own header and every gate's fix text would accuse themselves",
    },
    {
      files: {
        "tooling/src/verify/gates/__probe.ts":
          'export const gate = { name: "__probe", docRow: "x", message: "m", mustFlag: [1], mustPass: [1], run: (ctx) => { ctx.scan({ scanned: 1 }); } };\n',
      },
      why: "ARM D — a gate that reads NO ledger owes no admitted count: the arm is about declared debt, not about every `ctx.scan` call (and the blindness tripwire stays quiet here, being real-tree anchored)",
    },
  ].map(resourceProof),
});
