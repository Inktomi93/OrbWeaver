// Gate: test-presence (core/Spine-Testing.md §5) — required tests on the surfaces where an untested change
// silently breaks behavior. The DOMAIN arm is DEMAND-BY-DEFAULT (#767) and the entry/ + transport/ TIER arm
// is the same shape (#773): a file with runtime logic owes a mirror test unless its SHAPE exempts it
// (index/service/context/error-declaration/D58 stub in domain; a declaration file, a router shell with no
// callable export, or a PASS-THROUGH wiring file in the tiers — `isPassThroughWiring`), so a slot the
// template grows is demanded the day it appears. infra/ + foundation/ runtime logic and schema-bearing
// contracts files are demanded as before. Tests live at tests/<pkg>/<rest>.
import { existsSync } from "node:fs";
import { join } from "node:path";
import type { Expression, Project, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { RatchetAdmission, RatchetRow } from "../../_shared/ratchet-rows.ts";
import { classNote, readBudgetRows, writeBudgetLedger } from "../../_shared/ratchet-rows.ts";
import type { GateDescriptor, GateRunCtx } from "../contract/gate.ts";
import type { Violation } from "../contract/harness.ts";
import { codeTextForScan } from "../lib/comment-spans.ts";
import { fileLoaded } from "../lib/pass.ts";

const DOMAIN_DIR = "/packages/server/src/domain/";
/** The #773 arm's two tiers. Prefix-matched on the server-src-relative path (the `pushInfra` spelling). */
const TIER_PREFIXES: readonly string[] = ["entry/", "transport/"];
const DECLARATION_EXT = ".d.ts";
const SERVER_SRC = "/packages/server/src/";
const CONTRACTS_SRC = "/packages/contracts/src/";
const EXT_RE = /\.tsx?$/u;
const GATE_SELF = "tooling/src/verify/gates/test-presence.ts";
/** The committed shrink-only ledger for the #767 widening's residual population — burn-down is board row 772.
 *  Every row is one UNTESTED domain-logic file the widening newly demands, class DEBT: work another lane is
 *  named for, never a permanent exemption (a permanent one is a SHAPE above, not a row here). */
export const BASELINE_REL = "tooling/src/verify/gates/test-presence.baseline.json";
/** GATE-AUTHORING.md §4.5 — a real-tree file present on every live run and planted by no example here. */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";
const STALE_BASELINE_PREFIX =
  "stale test-presence baseline row — this file now carries its mirror test (or is gone / newly exempt), so the " +
  "budget grants nothing while reading as live debt. Regenerate and commit the shrink " +
  "(`node tooling/src/verify/cli.ts baseline test-presence`): ";
const BLIND_DOMAIN =
  "BLINDNESS TRIPWIRE — the domain scan matched ZERO files with runtime logic. The demand derivation is keyed " +
  "on the `packages/server/src/domain/` path; if that tree moved, this gate reports ✓ over an unscanned corpus.";
const BLIND_TIERS =
  "BLINDNESS TRIPWIRE — the entry/transport scan matched ZERO files with runtime logic. The #773 demand " +
  "derivation is keyed on the `entry/` + `transport/` prefixes under `packages/server/src/`; if either tier " +
  "moved or was renamed, this gate reports ✓ over an unscanned corpus.";

const MSG = {
  verb: "verb has no test — add a .test.ts or .int.test.ts at its mirror (core/Spine-Testing.md §5).",
  persistence: "persistence file has no .int.test.ts at its mirror (core/Spine-Testing.md §5).",
  contract: "contract schema has no .contract.test.ts at its mirror (core/Spine-Testing.md §5).",
  sharedContract: "shared contract schema has no .contract.test.ts at its mirror (core/Spine-Testing.md §5).",
  infra:
    "infra/foundation file with runtime logic has no test — security belts/adapters/dispatchers get a .test.ts or .int.test.ts at their mirror (core/Spine-Testing.md §5). Pure-type + index files are exempt.",
  runner:
    "workloads runner with real logic has no test — add a .test.ts or .int.test.ts at its mirror (core/Spine-Testing.md §5). A D58 no-op stub (reports + returns `{ deferred: true }`, no `ctx.env` call) is exempt until it's filled in.",
  domain:
    "domain file with runtime logic has no test — every substrate/ helper, named subsystem and guard owes a .test.ts or .int.test.ts at its mirror (core/Spine-Testing.md §5). Exempt BY SHAPE: index.ts, the zero-logic service.ts + context.ts roots, and a contract/ file declaring only error classes.",
  tier: "entry/transport file with runtime logic has no test — a boot step, composition seam, HTTP registrar, job driver, bus or ladder primitive owes a .test.ts or .int.test.ts at its mirror (core/Spine-Testing.md §5). Exempt BY SHAPE: index.ts barrels, a .d.ts declaration file, a tRPC router shell (no callable export — its logic is the domain verb's), and a PASS-THROUGH wiring file whose every exported callable is one delegating call or one DI-bundle object literal over its own parameters.",
} as const;

/** The demand-by-default arms whose residual population rides the shrink-only DEBT baseline. A finding from
 *  any OTHER arm (verb/persistence/contract/runner/infra) is never budgetable — those surfaces were demanded
 *  before the ledger existed and have no residual to burn down. */
const BUDGETED_MESSAGES: ReadonlySet<string> = new Set([MSG.domain, MSG.tier]);

function serverSrcRel(path: string): string | undefined {
  const parts = path.split(SERVER_SRC);
  return parts.length > 1 ? parts[1] : undefined;
}

function contractsSrcRel(path: string): string | undefined {
  const parts = path.split(CONTRACTS_SRC);
  return parts.length > 1 ? parts[1] : undefined;
}

function hasTest(root: string, pkg: string, rel: string, kinds: readonly string[]): boolean {
  const base = rel.replace(EXT_RE, "");
  return kinds.some((kind) => existsSync(join(root, "tests", pkg, `${base}${kind}`)));
}

// Read from CODE, never file text (issue #117/#132): a contract file whose comment SPELLS `z.object(` while
// declaring none demands a `.contract.test.ts` that has nothing to assert, and a runner whose comment quotes
// `deferred: true` is silently EXEMPTED from needing a test at all — comment-blindness in both directions.
const SCHEMA_NEEDLES: readonly string[] = ["z.object(", "z.enum(", "z.discriminatedUnion("];

function hasSchema(sf: SourceFile): boolean {
  const text = codeTextForScan(sf, (raw) => SCHEMA_NEEDLES.some((needle) => raw.includes(needle)));
  return SCHEMA_NEEDLES.some((needle) => text.includes(needle));
}

// A workloads runner is a D58 no-op STUB (inert — the kind exists so `RUNNERS`/exhaustive-dispatch stay
// green, but the real pass lands in a later wave) when its body only reports + returns the `DeferredResult`
// and never touches its injected env. There is no behavior to regress, so it's exempt UNTIL filled in:
// adding a real `ctx.env.*` call drops the exemption and the gate then demands a test. Detected on SOURCE
// SHAPE, not a static list, so the 16 current stubs need no per-file allowlist and can't go stale.
const DEFERRED_RESULT = "deferred: true";
const ENV_CALL = "ctx.env";

function isDeferredStubRunner(sf: SourceFile): boolean {
  const text = codeTextForScan(sf, (raw) => raw.includes(DEFERRED_RESULT));
  return text.includes(DEFERRED_RESULT) && !text.includes(ENV_CALL);
}

// A file carries runtime LOGIC (vs only types/data) if it exports a function, a class, or a const bound
// to an arrow/function expression. Pure type/interface files and pure data tuples need no behavioral test.
function hasCallableExport(sf: SourceFile): boolean {
  return exportedCallables(sf).length > 0;
}

function missing(pkg: string, rel: string, message: string): Violation {
  return { file: `packages/${pkg}/src/${rel}`, line: 0, message };
}

/** The slots that carry their OWN arm above (their message names the surface, and persistence/contract want a
 *  specific KIND). The residual arm is what is left after these — that residual is the #767 fix: the demand
 *  set stops being an enumerated slot list that the template can outgrow. */
const SLOTTED_SEGMENTS: readonly string[] = ["/verbs/", "/persistence/", "/workloads/runners/"];

/** A domain feature ROOT file whose template job is wiring, not behavior: `service.ts` is the composition root
 *  ("ZERO logic", Core-0 §4) and `context.ts` is the DI bundle Spine-Testing §5 names exempt by nature. Both
 *  are re-proved transitively — every verb they wire carries its own test. A root file with any OTHER name
 *  (`guard.ts`, a sanctioned singleton) is demanded. */
const WIRING_ROOT_FILES: ReadonlySet<string> = new Set(["service.ts", "context.ts"]);

/** `domain` + `<feature>` + basename — the segment count of a file sitting directly at a feature root. */
const FEATURE_ROOT_SEGMENTS = 3;

/** Is `rel` a file directly at `domain/<feature>/`? */
function isFeatureRoot(rel: string): boolean {
  return rel.split("/").length === FEATURE_ROOT_SEGMENTS;
}

/** A `contract/` file that DECLARES ONLY ERROR CLASSES — the 23-file `errors.ts` family. `hasCallableExport`
 *  counts an exported class, so these read as runtime logic while a `.test.ts` on one could only assert that
 *  `new XNotFoundError(id) instanceof Error` — the tautology this doc bans. Detected on SHAPE (every exported
 *  callable is a class extending a `*Error`), never a path list, so a contract file that grows a real function
 *  — `character/contract/handoff-copy.ts`'s provenance key, `rpg/contract/service.ts`'s row mapper — drops the
 *  exemption the moment it does. */
function isErrorDeclarationOnly(sf: SourceFile): boolean {
  if (sf.getFunctions().some((f) => f.isExported())) {
    return false;
  }
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) {
      continue;
    }
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        return false;
      }
    }
  }
  const classes = sf.getClasses().filter((c) => c.isExported());
  return classes.length > 0 && classes.every((c) => (c.getExtends()?.getExpression().getText() ?? "").endsWith("Error"));
}

/** The residual (demand-by-default) arm's exemption set, all by SHAPE. */
function isDomainShapeExempt(rel: string, sf: SourceFile): boolean {
  const base = rel.slice(rel.lastIndexOf("/") + 1);
  if (isFeatureRoot(rel) && WIRING_ROOT_FILES.has(base)) {
    return true;
  }
  // `contract/` is only PARTLY the residual's business: a schema-bearing file already has its own arm (which
  // demands the RIGHT kind, `.contract.test.ts`), and an error-declaration file has nothing to assert. What is
  // left — a contract file carrying real logic — is exactly the hole `hasSchema` was never meant to leave.
  return rel.includes("/contract/") && (hasSchema(sf) || isErrorDeclarationOnly(sf));
}

function pushDomain(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  if (rel.includes("/verbs/") && !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing("server", rel, MSG.verb));
  }
  if (rel.includes("/persistence/") && !hasTest(root, "server", rel, [".int.test.ts"])) {
    out.push(missing("server", rel, MSG.persistence));
  }
  if (rel.includes("/contract/") && hasSchema(sf) && !hasTest(root, "server", rel, [".contract.test.ts"])) {
    out.push(missing("server", rel, MSG.contract));
  }
  if (rel.includes("/workloads/runners/") && !isDeferredStubRunner(sf) && !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing("server", rel, MSG.runner));
  }
  pushDomainResidual(root, rel, sf, out);
}

/** THE #767 ARM. Everything the slot arms above do not already claim: substrate/, every named subsystem
 *  (engine/ assembly/ memory/ themes/ …), `guard.ts`, the sanctioned feature-root singletons, and a contract/
 *  file that carries real logic rather than schemas or error declarations. */
function pushDomainResidual(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  if (SLOTTED_SEGMENTS.some((seg) => rel.includes(seg)) || isDomainShapeExempt(rel, sf)) {
    return;
  }
  if (hasCallableExport(sf) && !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing("server", rel, MSG.domain));
  }
}

// ── THE #773 TIER ARM: entry/ + transport/, demand-by-default with a PASS-THROUGH exemption ────────────────
// The tier law is the exemption's whole justification: `entry/` "owns no business logic — only wiring/boot/
// HTTP-edge" (core/Tier-5-Entry.md invariant 1) and a transport router is "validate → call the verb → map the
// error, zero business logic" (core/Tier-4-Transport.md). So the shape that must stay free here is WIRING, and
// it is derived from the body, never from a path list or a basename: a file is exempt when EVERY exported
// callable reduces to ONE expression that is a delegating call, a DI-bundle object literal, or a factory
// returning one of those over its own parameters. Anything else — a branch, a second statement, a computed
// argument, a try/catch, a loop, an inline schema — is behavior, and behavior is demanded. The moment a
// pass-through grows a guard it loses the exemption, which is what a basename list could never do.
//
// The two other tier shapes need no predicate of their own: an `index.ts` barrel is skipped by the scan, and a
// tRPC router shell (`export const chatRouter = router({...})`) has no callable export at all, so
// `hasCallableExport` already leaves it alone — its procedures' logic lives in the domain verbs it calls.

/** Peel the wrappers that never change whether an expression is plumbing. */
function unwrapPlumbing(expr: Expression): Expression {
  let cur: Expression = expr;
  while (Node.isParenthesizedExpression(cur) || Node.isAwaitExpression(cur) || Node.isAsExpression(cur) || Node.isNonNullExpression(cur)) {
    cur = cur.getExpression();
  }
  return cur;
}

/** A PLUMBING ATOM: a value moved, never computed — an identifier, a member chain rooted at one, or an object
 *  literal whose every property is itself an atom or a wiring expression (the DI-bundle / context shape). */
function isPlumbingAtom(expr: Expression): boolean {
  const node = unwrapPlumbing(expr);
  if (Node.isIdentifier(node)) {
    return true;
  }
  if (Node.isPropertyAccessExpression(node) || Node.isElementAccessExpression(node)) {
    return isPlumbingAtom(node.getExpression());
  }
  if (!Node.isObjectLiteralExpression(node)) {
    return false;
  }
  return node.getProperties().every((prop) => {
    if (Node.isShorthandPropertyAssignment(prop)) {
      return true;
    }
    if (Node.isSpreadAssignment(prop)) {
      return isPlumbingAtom(prop.getExpression());
    }
    if (!Node.isPropertyAssignment(prop)) {
      return false;
    }
    const init = prop.getInitializer();
    return init !== undefined && (isPlumbingAtom(init) || isWiringExpression(init));
  });
}

/** A WIRING EXPRESSION: one delegating call whose callee and arguments are all plumbing, a DI bundle, or a
 *  factory whose own body is one of those (the curried `minter(prefix)` shape). */
function isWiringExpression(expr: Expression): boolean {
  const node = unwrapPlumbing(expr);
  if (Node.isArrowFunction(node) || Node.isFunctionExpression(node)) {
    const inner = singleBodyExpression(node);
    return inner !== undefined && (isPlumbingAtom(inner) || isWiringExpression(inner));
  }
  if (Node.isCallExpression(node)) {
    return (
      isPlumbingAtom(node.getExpression()) && node.getArguments().every((arg) => Node.isExpression(arg) && (isPlumbingAtom(arg) || isWiringExpression(arg)))
    );
  }
  return Node.isObjectLiteralExpression(node) && isPlumbingAtom(node);
}

/** The ONE expression a BLOCK body reduces to — a single `return x;` / `x;` statement and nothing else. */
function loneStatementExpression(body: Node): Expression | undefined {
  if (!Node.isBlock(body)) {
    return;
  }
  const statements = body.getStatements();
  const only = statements.length === 1 ? statements[0] : undefined;
  if (only === undefined || !(Node.isReturnStatement(only) || Node.isExpressionStatement(only))) {
    return;
  }
  return only.getExpression();
}

/** The ONE expression a callable's body reduces to, or nothing when it has real statements. A concise arrow
 *  body IS the expression; a block qualifies only when its single statement returns/evaluates one. */
function singleBodyExpression(fn: Node): Expression | undefined {
  if (!(Node.isArrowFunction(fn) || Node.isFunctionExpression(fn) || Node.isFunctionDeclaration(fn))) {
    return;
  }
  const body = fn.getBody();
  if (body === undefined) {
    return;
  }
  if (Node.isBlock(body)) {
    return loneStatementExpression(body);
  }
  return Node.isExpression(body) ? body : undefined;
}

/** `export const f = () => …` / `= function () {}` — the callable-bearing variable initializers. */
function exportedCallableInitializers(sf: SourceFile): readonly Node[] {
  const out: Node[] = [];
  for (const stmt of sf.getVariableStatements()) {
    if (!stmt.isExported()) {
      continue;
    }
    for (const decl of stmt.getDeclarations()) {
      const init = decl.getInitializer();
      if (init !== undefined && (Node.isArrowFunction(init) || Node.isFunctionExpression(init))) {
        out.push(init);
      }
    }
  }
  return out;
}

/** Every exported callable declaration in the file. ONE derivation: `hasCallableExport` is this list being
 *  non-empty, and the pass-through predicate judges the same members — the two can never disagree. */
function exportedCallables(sf: SourceFile): readonly Node[] {
  return [...sf.getFunctions().filter((fn) => fn.isExported()), ...sf.getClasses().filter((cls) => cls.isExported()), ...exportedCallableInitializers(sf)];
}

/** The tier arm's exemption, by SHAPE: every exported callable is a pass-through. An exported CLASS is never
 *  a pass-through (it carries state and methods), so one class drops the whole file's exemption. */
function isPassThroughWiring(sf: SourceFile): boolean {
  const callables = exportedCallables(sf);
  if (callables.length === 0) {
    return false;
  }
  return callables.every((fn) => {
    const inner = singleBodyExpression(fn);
    return inner !== undefined && (isPlumbingAtom(inner) || isWiringExpression(inner));
  });
}

function pushTiers(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  if (rel.endsWith(DECLARATION_EXT) || isPassThroughWiring(sf)) {
    return;
  }
  if (hasCallableExport(sf) && !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing("server", rel, MSG.tier));
  }
}

function pushInfra(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  const inTier = rel.startsWith("infra/") || rel.startsWith("foundation/");
  if (inTier && hasCallableExport(sf) && !hasTest(root, "server", rel, [".test.ts", ".int.test.ts"])) {
    out.push(missing("server", rel, MSG.infra));
  }
}

function pushContracts(root: string, rel: string, sf: SourceFile, out: Violation[]): void {
  if (hasSchema(sf) && !hasTest(root, "contracts", rel, [".contract.test.ts"])) {
    out.push(missing("contracts", rel, MSG.sharedContract));
  }
}

/** What one scan saw, so the blindness tripwire can tell "nothing violates" from "nothing was scanned". */
interface PresenceScan {
  readonly violations: readonly Violation[];
  /** Domain files carrying runtime logic, exempt or not — the denominator of the demand-by-default arm. */
  readonly domainLogicFiles: number;
  /** The same denominator for the #773 entry/ + transport/ arm. */
  readonly tierLogicFiles: number;
}

/** One scan's mutable state: where findings land and the two demand-by-default denominators. */
interface ScanState {
  readonly root: string;
  readonly violations: Violation[];
  domainLogicFiles: number;
  tierLogicFiles: number;
}

/** Route ONE server source file to its arm, tallying that arm's runtime-logic denominator as it goes. */
function pushServer(state: ScanState, rel: string, sf: SourceFile): void {
  const logic = hasCallableExport(sf) ? 1 : 0;
  if (sf.getFilePath().includes(DOMAIN_DIR)) {
    state.domainLogicFiles += logic;
    pushDomain(state.root, rel, sf, state.violations);
    return;
  }
  if (TIER_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
    state.tierLogicFiles += logic;
    pushTiers(state.root, rel, sf, state.violations);
    return;
  }
  pushInfra(state.root, rel, sf, state.violations);
}

/** The fs+AST scan shared by the `run` descriptor, the ratchet's stale arm and the baseline generator: each
 *  server/contracts source file's presence-gated surface must have its mirror test (existsSync). */
function scanTestPresence(root: string, project: Project): PresenceScan {
  const state: ScanState = { root, violations: [], domainLogicFiles: 0, tierLogicFiles: 0 };
  for (const sf of project.getSourceFiles()) {
    const serverRel = serverSrcRel(sf.getFilePath());
    // Server barrels (domain/infra `index.ts`) are pure re-exports — exempt. A contracts `index.ts` is
    // NOT a barrel (the domain's schemas co-locate there), so it is checked below.
    if (serverRel !== undefined) {
      if (sf.getBaseName() !== "index.ts") {
        pushServer(state, serverRel, sf);
      }
      continue;
    }
    // Contracts arm: a schema-bearing file is presence-gated whether or not it is named `index.ts` — the
    // contracts convention co-locates the domain's zod schemas in `index.ts`, so a blanket barrel-skip
    // silently exempted whole domains. A pure-type/re-export `index.ts` carries no schema → still exempt.
    const contractsRel = contractsSrcRel(sf.getFilePath());
    if (contractsRel !== undefined) {
      pushContracts(root, contractsRel, sf, state.violations);
    }
  }
  return { violations: state.violations, domainLogicFiles: state.domainLogicFiles, tierLogicFiles: state.tierLogicFiles };
}

/** The residual arm's live census: subject (repo-relative file) → 1. The generator writes exactly this, and
 *  the stale arm judges the committed rows against it — ONE derivation, never two. */
function residualCensus(violations: readonly Violation[]): Readonly<Record<string, number>> {
  const counts: Record<string, number> = {};
  for (const v of violations) {
    if (BUDGETED_MESSAGES.has(v.message)) {
      counts[v.file] = 1;
    }
  }
  return counts;
}

/** THE SINGLE WRITER of `test-presence.baseline.json` (GATE-AUTHORING.md §4.8), driven by
 *  `cli.ts baseline test-presence`. Counts are re-derived from the tree; any classification rides through. */
export function writeBaseline(project: Project, root: string): number {
  return writeBudgetLedger(root, BASELINE_REL, residualCensus(scanTestPresence(root, project).violations), readBudgetRows(root, BASELINE_REL));
}

/** The ratchet's admission arm: a residual finding a committed row still covers is DECLARED DEBT (board row
 *  772's burn-down), not silence — it is reported as `admitted` on the gate's scan line and by `pnpm debt`. */
function judgeAdmission(ctx: GateRunCtx, violations: readonly Violation[], baseline: ReadonlyMap<string, RatchetRow>): RatchetAdmission {
  let admitted = 0;
  let ratified = 0;
  for (const v of violations) {
    const row = BUDGETED_MESSAGES.has(v.message) ? baseline.get(v.file) : undefined;
    if (row !== undefined && row.count > 0) {
      admitted += 1;
      ratified += row.ratified > 0 ? 1 : 0;
      continue;
    }
    ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
  }
  return { admitted, ratified };
}

/** The shrink-only arm (§4.8) AND §4.4a's mode (B): a row whose file now carries its test, became exempt, or
 *  left the tree entirely is judged from the LIVE census, so a deleted file's row cannot rot unseen. */
function judgeShrink(ctx: GateRunCtx, live: Readonly<Record<string, number>>, baseline: ReadonlyMap<string, RatchetRow>): void {
  for (const [subject, row] of baseline) {
    if (!(subject in live)) {
      ctx.report({
        file: GATE_SELF,
        line: 1,
        column: 0,
        message: `${STALE_BASELINE_PREFIX}${subject}${classNote(row)} — the ledger is tooling/src/verify/gates/test-presence.baseline.json`,
      });
    }
  }
}

// test-presence reconciles server/contracts source (AST — schema/callable detection) against its
// mirror tests (existsSync of tests/<mirror>).
export const gate: GateDescriptor = {
  name: "test-presence",
  docRow: "core/Spine-Testing.md §5",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a presence-gated source file has no mirror test — a domain verb / persistence / contract-schema / other domain-runtime-logic / infra-runtime-logic file must carry its test at tests/<mirror> (core/Spine-Testing.md §5).",
  fix: "add the required test at the mirror path (tests/server/<rest> or tests/contracts/<rest>) — a .test/.int.test/.contract.test per the surface.",
  run: (ctx) => {
    const scan = scanTestPresence(ctx.root, ctx.project);
    const baseline = readBudgetRows(ctx.root, BASELINE_REL);
    const admission = judgeAdmission(ctx, scan.violations, baseline);
    ctx.scan({ admitted: admission.admitted, admittedRatified: admission.ratified });
    // Real-tree anchored (§4.5): a conformance mini-project and a scoped run both legitimately carry neither
    // the domain corpus nor the ledger, and judging either there would red the gate's own self-proof.
    if (!fileLoaded(ctx, REAL_TREE_ANCHOR)) {
      return;
    }
    if (scan.domainLogicFiles === 0) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_DOMAIN });
      return;
    }
    if (scan.tierLogicFiles === 0) {
      ctx.report({ file: GATE_SELF, line: 1, column: 0, message: BLIND_TIERS });
      return;
    }
    judgeShrink(ctx, residualCensus(scan.violations), baseline);
  },
  mustFlag: [
    {
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = 1;\n",
      },
      expect: { messageIncludes: "verb has no test" },
      why: "a domain verb file with no mirror .test/.int.test — an untested behavioral surface (§5)",
    },
    {
      files: {
        "packages/server/src/domain/chat/persistence/chat-store.ts": "export const createChatStore = 1;\n",
      },
      expect: { messageIncludes: "persistence file has no .int.test" },
      why: "a domain persistence file with no mirror .int.test — the persistence arm (distinct message)",
    },
    {
      files: {
        "packages/server/src/domain/chat/contract/schema.ts": "export const S = z.object({});\n",
      },
      expect: { messageIncludes: "contract schema has no .contract.test" },
      why: "a domain contract file WITH a zod schema and no mirror .contract.test — the contract arm",
    },
    {
      files: {
        "packages/server/src/infra/providers/backends/agent-sdk/env-firewall.ts": "export function firewall(): void {}\n",
      },
      expect: { messageIncludes: "infra/foundation file with runtime logic has no test" },
      why: "an infra/ file with a callable export (runtime logic) and no mirror test — the infra arm (PD-blindspot)",
    },
    {
      files: {
        "packages/server/src/domain/workloads/runners/recall.ts": "export const run = (ctx: { env: { x: number } }) => ctx.env.x;\n",
      },
      expect: { messageIncludes: "workloads runner with real logic has no test" },
      why: "a workloads runner that touches ctx.env (real logic, NOT a D58 stub) with no mirror test — the runner arm",
    },
    {
      files: {
        "packages/contracts/src/chat/index.ts": "export const S = z.object({});\n",
      },
      expect: { messageIncludes: "shared contract schema has no .contract.test" },
      why: "a shared @orb/contracts schema-bearing file (even index.ts) with no mirror .contract.test — the contracts arm",
    },
    {
      files: {
        "packages/server/src/domain/workloads/runners/regrown.ts":
          "// Not a D58 stub any more — it used to return { deferred: true } and now does the real pass.\nexport const run = (ctx: { env: { x: number } }) => ctx.env.x;\n",
      },
      expect: { messageIncludes: "workloads runner with real logic has no test" },
      why: "COMMENT POSTURE (issue #117/#132) in the PERMISSIVE direction — the dangerous one. A runner whose COMMENT quotes `deferred: true` reads as an exempt D58 stub to a file-text scan and silently drops its test requirement; the code says otherwise, so it must still RED",
    },
    {
      files: {
        "packages/server/src/domain/discovery/substrate/pca.ts": "export const projectPca = (rows: number[][]) => rows.map((r) => r[0] ?? 0);\n",
      },
      expect: { messageIncludes: "domain file with runtime logic has no test" },
      why: "THE #767 SHAPE — `substrate/` is the second-largest slot in the domain tree and the old enumerated demand set never named it, so 54 pure, deterministic, most-testable files were invisible. Demand-by-default is what makes the next new slot demanded on the day it appears",
    },
    {
      files: {
        "packages/server/src/domain/rpg/guard.ts": "export function requireGameHost(): void {}\n",
      },
      expect: { messageIncludes: "domain file with runtime logic has no test" },
      why: "the ratified 9th slot: `guard.ts` is the `can()` authority seam — an I/O-touching gate primitive, the LAST file whose behavior should be unpinned, and it sat outside the demand set",
    },
    {
      files: {
        "packages/server/src/domain/character/contract/handoff-copy.ts":
          "export function handoffProvenance(chatId: string): string {\n  return `handoff:` + chatId;\n}\n",
      },
      expect: { messageIncludes: "domain file with runtime logic has no test" },
      why: "the `contract/`-without-schema hole (#767): `hasSchema` was never meant to exempt a contract file carrying REAL logic — this one derives the handoff copy's idempotency key, and the error-declaration exemption below does not cover it",
    },
    {
      files: {
        "packages/server/src/entry/http/frame-handle-store.ts":
          "export function take(id: string, owner: string): string | undefined {\n  const hit = STORE.get(id);\n  if (hit === undefined || hit.owner !== owner) {\n    return undefined;\n  }\n  return hit.doc;\n}\n",
      },
      expect: { messageIncludes: "entry/transport file with runtime logic has no test" },
      why: "THE #773 SHAPE — an `entry/http/` unit that is NOT wiring: the opaque frame-handle store's owner check is a SECURITY primitive (a foreign owner must be indistinguishable from a miss) and it sat outside the demand set entirely, because the old arms only reached domain/ + infra/ + foundation/",
    },
    {
      files: {
        "packages/server/src/transport/jobs/workload-schedule-scheduler.ts":
          "export function startWorkloadScheduleScheduler(deps: Deps): () => void {\n  const safeTick = (): void => {\n    tickWorkloadSchedules(deps).catch(() => undefined);\n  };\n  safeTick();\n  return deps.scheduleInterval(safeTick, deps.checkIntervalMs);\n}\n",
      },
      expect: { messageIncludes: "entry/transport file with runtime logic has no test" },
      why: "the transport half: a job DRIVER decides WHEN to fire and isolates a failing tick — real behavior, more than one statement, so the pass-through exemption does not reach it",
    },
    {
      files: {
        "packages/server/src/entry/compose/gate.ts":
          "export const decide = (deps: Deps, req: Req): Verdict => (req.anonymous ? deps.publicBucket(req.ip) : deps.authedBucket(req.userId));\n",
      },
      expect: { messageIncludes: "entry/transport file with runtime logic has no test" },
      why: "THE PERMISSIVE DIRECTION of the pass-through exemption — a ONE-EXPRESSION body that still DECIDES. It looks like the exempt delegating-call shape and is not one: a conditional is neither a plumbing atom nor a wiring call, so policy written as a ternary stays demanded",
    },
    {
      files: {
        "packages/db/src/schema/index.ts": "export const schema = 1;\n",
        "packages/server/src/domain/discovery/substrate/pca.ts": "export const projectPca = (rows: number[][]) => rows.map((r) => r[0] ?? 0);\n",
        "tests/server/domain/discovery/substrate/pca.test.ts": "export const t = 1;\n",
      },
      expect: { messageIncludes: "the entry/transport scan matched ZERO files" },
      why: "THE #773 ARM'S BLINDNESS TRIPWIRE (§4.6): a project that loads the real-tree anchor and a domain logic file but NO entry/transport file at all. The tier demand is keyed on two path prefixes, so a rename or a tier move would otherwise turn the whole arm into a silent ✓ over an unscanned corpus — this is the one example that reaches the tripwire, since a real run never has zero",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = 1;\n",
        "tests/server/domain/chat/verbs/start-chat.test.ts": "export const t = 1;\n",
      },
      why: "the verb file has its mirror .test.ts — presence satisfied, passes",
    },
    {
      files: {
        "packages/server/src/domain/workloads/runners/stub.ts": "export const run = () => ({ deferred: true });\n",
      },
      why: "a D58 no-op stub runner (deferred: true, never touches ctx.env) — exempt until filled in, passes",
    },
    {
      files: {
        "packages/server/src/domain/chat/contract/prose.ts":
          '// The wire shape for this lives in packages/contracts — z.object({ id }) is declared there, not here.\nexport const LABEL = "x";\n',
      },
      why: "COMMENT POSTURE (issue #117/#132), false-POSITIVE direction: a contract-dir file whose COMMENT spells `z.object(` declares no schema, so demanding a .contract.test.ts would demand a test with nothing to assert",
    },
    {
      files: {
        "packages/server/src/domain/tag/service.ts": "export function createTagService(ctx: { db: number }) {\n  return { db: ctx.db };\n}\n",
      },
      why: "DECLARED LIMIT of the #767 arm: a feature-root `service.ts` is the composition root the template gives ZERO logic (Core-0 §4) — it only assembles verb factories, each of which carries its own demanded test, so a test here would assert the wiring twice",
    },
    {
      files: {
        "packages/server/src/domain/stats/context.ts": "export function createStatsContext(db: number, now: () => number) {\n  return { db, now };\n}\n",
      },
      why: "DECLARED LIMIT: `context.ts` is the DI bundle Spine-Testing §5 names exempt by nature — its builder returns its own arguments, which is the tautology test the presence rule exists to avoid",
    },
    {
      files: {
        "packages/server/src/domain/tag/contract/errors.ts": "export class TagNotFoundError extends DomainNotFoundError {}\n",
      },
      why: "DECLARED LIMIT: a `contract/` file declaring only error CLASSES is a type surface with a runtime shadow — `hasCallableExport` counts the class, but the only assertion available is `instanceof`. A function or a non-error class in the same file drops the exemption (the mustFlag above)",
    },
    {
      files: {
        "packages/server/src/domain/discovery/substrate/pca.ts": "export const projectPca = (rows: number[][]) => rows.map((r) => r[0] ?? 0);\n",
        "tests/server/domain/discovery/substrate/pca.test.ts": "export const t = 1;\n",
      },
      why: "the other direction of the #767 arm: the same substrate file WITH its mirror test passes — 91 substrate files were already tested and merely undemanded, so the widening must not accuse them",
    },
    {
      files: {
        "packages/server/src/entry/boot/seed-themes.ts":
          "export async function seedThemes(deps: SeedThemesDeps): Promise<void> {\n  await ensureSeedThemes(deps.db, deps.now);\n}\n",
      },
      why: "DECLARED LIMIT of the #773 arm — THE PASS-THROUGH SHAPE: a boot step whose whole body forwards its own deps into ONE lower-tier call. The behavior is `ensureSeedThemes`'s and is demanded THERE (the domain arm); a test here could only assert that the forwarder forwards, which is the tautology this doc bans. It loses the exemption the day it grows a second statement",
    },
    {
      files: {
        "packages/server/src/transport/trpc/context.ts":
          "export function createContext(parts: Parts): Context {\n  return { auth: parts.auth, services: parts.services, rateLimit: parts.rateLimit, clientIp: parts.clientIp };\n}\n",
      },
      why: 'DECLARED LIMIT — THE DI-BUNDLE SHAPE, the transport twin of the domain `context.ts` exemption, derived from the BODY rather than the basename: a packaging function that returns its own arguments (`core/Tier-4-Transport.md`: "Pure packaging: no db, no header parsing, no identity resolution")',
    },
    {
      files: {
        "packages/server/src/transport/trpc/routers/chat.ts":
          "export const chatRouter = router({\n  send: authedProcedure.input(sendSchema).mutation(({ ctx, input }) => ctx.services.chat.send(input)),\n});\n",
      },
      why: "DECLARED LIMIT — THE ROUTER SHELL: `core/Tier-4-Transport.md` gives a router zero business logic (validate → call the verb → map the error), and it needs no predicate of its own because a `router({…})` call binds no callable export, so `hasCallableExport` already leaves it alone. The row exists so a future change to that helper cannot silently start demanding a test on all 24 shells",
    },
    {
      files: {
        "packages/server/src/entry/compose/minter.ts":
          "export function minter<P extends string>(prefix: P): () => TypeIdOf<P> {\n  return (): TypeIdOf<P> => mintTypeId(prefix);\n}\n",
      },
      why: "DECLARED LIMIT — the CURRIED pass-through: a factory whose returned closure is itself one delegating call. The shape reduces through the arrow, so `minter` is wiring and stays exempt while a factory that computed anything before returning would not",
    },
    {
      files: {
        "packages/showcase-plugins/bundles/host-v1.d.ts": "export declare function hostV1(): void;\n",
      },
      why: "DECLARED LIMIT — a `.d.ts` DECLARATION file: it emits nothing at runtime, so there is no behavior a mirror test could assert. `hasCallableExport` counts an `export declare function`, which is exactly how a shipped typings asset (the plugin host contract lives under `packages/showcase-plugins/bundles/`) would otherwise be accused",
    },
    {
      files: {
        "packages/server/src/entry/http/frame-handle-store.ts":
          "export function take(id: string, owner: string): string | undefined {\n  const hit = STORE.get(id);\n  if (hit === undefined || hit.owner !== owner) {\n    return undefined;\n  }\n  return hit.doc;\n}\n",
        "tests/server/entry/http/frame-handle-store.test.ts": "export const t = 1;\n",
      },
      why: "the other direction of the #773 arm: the same entry file WITH its mirror test passes — 65 of the tier's 94 logic files were already tested and merely undemanded, so the widening must not accuse them",
    },
  ],
};
