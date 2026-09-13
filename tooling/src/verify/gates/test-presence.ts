// Policy: test-presence (core/Spine-Testing.md §5) — required tests on the surfaces where an untested
// change silently breaks behavior. The DOMAIN arm is DEMAND-BY-DEFAULT (#767) and the entry/ + transport/
// TIER arm is the same shape (#773): a file with runtime logic owes a mirror test unless its SHAPE exempts
// it (index/service/context/error-declaration/D58 stub in domain; a declaration file, a router shell with
// no callable export, or a PASS-THROUGH wiring file in the tiers — `isPassThroughWiring`), so a slot the
// template grows is demanded the day it appears. infra/ + foundation/ runtime logic and schema-bearing
// contracts files are demanded as before. Tests live at tests/<pkg>/<rest>.
//
// FAMILY `mirror-index` — the SHARED SUBJECT READER is `ops/resource-mirror.ts` `loadMirrorIndex` via the
// `mirrorIndex` host door. Siblings: `test-layout` (the test corpus' own homes) and `test-presence-client`
// (the client/ui reach this policy lacks). `contract/resource-mirror.ts:3-8` names exactly this trio.
//
// THE BASELINE IS RETIRED, AND ITS TWO ROWS TURNED OUT TO BE A DEMAND THIS POLICY SHOULD NEVER HAVE MADE
// (#2062). `test-presence.baseline.json` carried `domain/chat/substrate/{assembly-access,turn-access}.ts`,
// citing board item #772 as their burn-down. #772 is CLOSED while both subjects were still live debt, and
// guide §5 permits a retiring baseline exactly three dispositions: a fix, an exact grant, or warning debt
// tied to a POSITIVE LIVE issue. A closed issue is none of them — and the warning arm is not expressible
// here at all, because `severity` is per-POLICY: parking two rows as warning debt would take all seven arms
// of this policy to a severity that contributes 0 to `blocking` at every shipped entrypoint.
//
// THE FIX WAS ATTEMPTED AS TESTS FIRST, AND THE TREE REFUSED IT — which is the finding. Both subjects are
// pure spread-forwarding DI bridges (`export function W(...args: Parameters<typeof T>): ReturnType<typeof T>
// { return T(...args); }`, 18 and 6 of them) that exist ONLY to mediate a dep-cruiser boundary
// (`domain-no-cross-subsystem`). The only test expressible over such a file either asserts that a forwarder
// forwards — the tautology `Spine-Testing.md` §5 bans — or `vi.mock`s the sibling subsystem, which §3 bans
// outright: *"never mock an internal module … if a collaborator needs stubbing and isn't an injected port,
// the test just surfaced a design smell."* A drafted pair of `vi.mock` seam tests produced 14
// `test-mock-doctrine` findings and 2 `no-test-fabrication` findings on the real tree, measured, and was
// deleted rather than waived.
//
// THIS IS A DELIBERATE WIDENING OF A LIVE GATE'S EXEMPTION, LANDED 2026-09-12 AND APPROVED BY THE
// ORCHESTRATOR ON THE MEASUREMENT BELOW — read it as a widening, not as something that was always here.
// What it closes is an ASYMMETRY rather than minting a new exemption: the #773 TIER arm has exempted exactly
// this shape since it shipped — a file whose every exported callable is one delegating call over its own
// parameters, because *"the behavior is the target's and is demanded THERE"* — and the #767 DOMAIN residual
// arm never got it. Two changes: `isPlumbingAtom` now accepts a SPREAD of a plumbing atom (it did not, so
// `T(...args)` — the most literal forwarder possible — was the one forwarder shape the tier arm ALSO failed
// to recognise), and `pushDomainResidual` applies `isPassThroughWiring` like its tier sibling.
//
// BLAST RADIUS, AND THE METHOD THAT PRODUCED IT (2026-09-12). Both predicates were RE-IMPLEMENTED VERBATIM
// in a throwaway probe over `packages/server/src/**` and run twice, WITH and WITHOUT each clause, diffing
// the admitted sets: **the SPREAD clause changes exactly TWO files — `domain/chat/substrate/
// {assembly-access,turn-access}.ts` — and ZERO in `entry/` or `transport/`; the DOMAIN pass-through clause
// matches 11 files, of which 9 already carry mirror tests, so no finding disappears anywhere else.** The
// exemption is BY SHAPE rather than a path allowlist, so there is no row to rot and a seam that grows a
// guard, a second statement or a computed argument is demanded again the day it does — `mustFlag[17]` is
// that row, and both clauses are §4.1-cut to `mustPass[15]`.
//
// The ledger, its `writeBaseline` single writer, the `baseline test-presence` verb and the `pnpm debt` row
// are all deleted, and this policy now carries NO ratchet. The arm that policed the ledger — the
// stale/shrink sweep reporting at the gate's own source file — retires WITH it rather than becoming a
// `-health` sibling: it existed only to keep the ledger honest.
//
// POPULATION PORT — legacy at 6b1d01be0 (the parent of the conversion commit aecbc6c6c), a `GateDescriptor` with
// `scopeSafety: "whole-project"` and `fsBacked: true`. The legacy corpus was `project.getSourceFiles()`
// routed by `sf.getFilePath().split("/packages/server/src/")` and `.split("/packages/contracts/src/")`,
// i.e. the harness globs ∩ those two roots; the final expression is `population: ["@server", "@contracts"]`
// (`POPULATION_ROOTS["@server"] = packages/server/src/`, `["@contracts"] = packages/contracts/src/`), the
// same set by construction. The per-arm `index.ts` rule is UNCHANGED and stays in the routing rather than
// in the population, because it is asymmetric: a SERVER `index.ts` is a pure re-export barrel and is
// skipped, while a CONTRACTS `index.ts` is NOT a barrel (the domain's zod schemas co-locate there) and is
// checked. The one filesystem read moves to a declared door:
//   `existsSync(tests/<pkg>/<base><suffix>)`  →  `mirrorIndex("package-test").testFiles`
// Deltas, each deliberate: (1) a mirror under a non-authored segment or behind a symlink is no longer read
// as a mirror (the authored reader refuses both, where `existsSync` accepted them); (2) findings anchor at
// `line: 1, column: 1` rather than the legacy synthetic `line: 0`; (3) THE TRIPWIRE ANCHOR MOVED — see
// below. Nothing else: the seven arms, their order, their messages and every SHAPE exemption are unchanged.
//
// THE TRIPWIRE ANCHOR MOVE. Both blindness tripwires reported at this gate's OWN source file, which sits in
// `tooling/` — outside this policy's population AND outside its resource population, so `ctx.report.file`
// would THROW on it (guide §2.1's absent/foreign-subject class). They now anchor through
// `lib/absent-subject-anchor.ts` `subjectAnchor` on the real-tree anchor they are already gated on, with
// the diagnosis unchanged in the MESSAGE. §4.6 category 6 owes a marker receipt for an anchor move; the
// live `@orb-gate-ignore test-presence` census is ZERO, measured with a planted positive control, so
// nothing binds to the old position (RE-MEASURED 2026-09-13 at `5045a6a68`, planted control found, corpus
// otherwise empty).
//
// §4.6 DIFFERENTIAL — RECORDED 2026-09-13 (#2273), AND IT IS A POPULATION + OUTCOME RECEIPT, NOT CATCH
// PARITY. The conversion `aecbc6c6c` landed a population/refusal receipt and never ran a findings
// comparison for this policy, so the honest record names which of §4.6's three axes it has:
//   · FINDINGS. FINAL side driven through `runPolicyPass` over the real workspace at `5045a6a68`: 0
//     findings, owner `success`. The LEGACY side was never EXECUTED for findings — so this cell is guide
//     §4.6 VACUITY SHAPE 1 (both sides zero, or one side unmeasured) and it CANNOT be closed by rule, which
//     requires "a 1:1 port whose legacy side was EXECUTED and returned zero". What would close it is the
//     fixture-level replay (`origin-client-family-1584.md`'s method), not another real-corpus run: this
//     policy's real-tree answer is zero on both engines by construction, because the tree is fully mirrored.
//     The arms are NOT a 1:1 port either — `isPlumbingAtom`'s SPREAD clause and the DOMAIN pass-through
//     clause are a deliberate 2026-09-12 WIDENING whose blast radius was measured separately (above).
//   · POPULATION. `["@server", "@contracts"]` = the legacy corpus by construction (the port paragraph above
//     derives the equality); resource members on the real tree: `mirror-index:package-test` 6525,
//     `unresolved` 0.
//   · TOOL ERRORS. 0 on the final side; the legacy descriptor could not emit one at all (`existsSync` has
//     no refusal), which is the capability this conversion bought.
//
// THE REAL-TREE ANCHOR IS STILL REQUIRED AND IS NOW A MEMBERSHIP QUESTION. The tripwires ask "did the
// corpus this derivation is keyed on disappear?", which is a real question on the live tree and a false
// alarm on any small fixture. The legacy guard was `fileLoaded(ctx, "packages/db/src/schema/index.ts")`;
// it is now `mirrorIndex.sourceFiles.has(...)` — the same file, asked of a declared resource instead of the
// run's fileset. `mustFlag[15]` is the one row that reaches the tier tripwire, by planting the anchor.
//
// AUTHORITY `hard`. With the baseline gone the policy owns no exemption table, no marker grammar and no
// private parser, and every finding is FILE-anchored with no position token, so under this contract no
// ordinary door exists BY CONSTRUCTION. `hard` is the honest declaration.
//
// WHERE A BROKEN RESOURCE REFUSES — not here. The policy reads the ready mirror through
// `readyResourceValue`; the family `runPolicyPass` controls retain the complete runtime outcome for missing,
// empty, and unresolved mirrors: no findings, a named population-phase tool error, an incomplete owner, and
// this policy withheld. Healthy twins prove success and the unresolved-zero mirror receipt (§§3, 6.3).
// DECLARED LIMITS, each naming the row that holds it: the zero-logic `service.ts` / `context.ts` feature
// roots (`mustPass[4]`, `[5]`), the error-declaration-only `contract/` file (`mustPass[6]`), the D58 stub
// runner (`mustPass[2]`), the tier pass-through / DI-bundle / router-shell / curried-factory / `.d.ts`
// shapes (`mustPass[8]`-`[12]`), the comment-posture false positive (`mustPass[3]`), and the DOMAIN
// pass-through seam (`mustPass[15]`, with `mustFlag[17]` holding its permissive edge).
//
// FOUR NARROWINGS WENT UNHELD UNTIL 2026-09-12 AND NOW CARRY ROWS (#2131/#2132, cut one at a time and
// measured): the feature-root DEPTH test (`mustFlag[18]`), `isDeferredStubRunner`'s `!ctx.env` clause
// (`mustFlag[19]`), `isErrorDeclarationOnly`'s `extends *Error` test (`mustFlag[20]`) and
// `exportedCallables`' exported-CLASS arm (`mustFlag[21]`). Three were simply unpinned; the fourth fact is
// the trap the WIDENING above created, and it is why every one of those rows carries a body the
// pass-through predicate REJECTS: the exemption acquits any one-expression forwarder, so a fixture written
// to exercise some OTHER fence goes silent for the wrong reason and the cut it was meant to hold comes back
// clean. `mustPass[4]`/`[5]` were exactly that — their `why` named the wiring-root fence while
// `isPassThroughWiring` was doing the acquitting — so both bodies grew a second statement, which puts the
// claim back under the fence it names.
//
// THREE MORE NARROWINGS CAME BACK CLEAN AFTER THAT BATTERY AND NOW CARRY ROWS (#2254, same method — each
// cut alone, against THIS policy, driven through `verifyPolicyProofs`, with a planted control cut proving
// the driver can see a row die). They are the fences the four above do not reach, and each row states its
// DIRECTION, because two of the three are cuts that make the policy flag FEWER:
//   - `isDomainShapeExempt`'s `hasSchema` arm → `mustPass[16]` (cut ⇒ MORE: the CONTRACT arm's own subject
//     is handed to the residual arm as well, so one surface owes two different tests);
//   - its `rel.includes("/contract/")` fence → `mustFlag[22]` (cut ⇒ FEWER: any domain file that merely
//     mentions a zod builder becomes exempt);
//   - `hasTest`'s `mirror === "module"` filter → `mustFlag[23]` (cut ⇒ FEWER: a `.suite.test.ts` sitting at
//     the module path would satisfy a per-MODULE demand, which is the one thing a SUITE mirror is not — and
//     the family filter cannot hold that fence, since suite kinds share `unit`/`integration`).
// All three fixtures carry a two-statement body or a slotted `/verbs/` path for the reason the #2132
// repairs did: the pass-through widening acquits any one-expression forwarder, so a fixture written to
// exercise some OTHER fence goes silent for the wrong reason and its cut comes back clean.
import type { Expression, SourceFile } from "ts-morph";
import { Node } from "ts-morph";
import type { TestFamily } from "../../_shared/test-kinds.ts";
import { TEST_KIND_DEFINITIONS } from "../../_shared/test-kinds.ts";
import { defineGate } from "../contract/policy.ts";
import type { MirrorIndex } from "../contract/resource-mirror.ts";
import { subjectAnchor } from "../lib/absent-subject-anchor.ts";
import { codeTextForScan } from "../lib/comment-spans.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const SERVER_SRC = "packages/server/src/";
const CONTRACTS_SRC = "packages/contracts/src/";
const DOMAIN_DIR = "domain/";
/** The #773 arm's two tiers. Prefix-matched on the server-src-relative path. */
const TIER_PREFIXES: readonly string[] = ["entry/", "transport/"];
const DECLARATION_EXT = ".d.ts";
const EXT_RE = /\.tsx?$/u;
/** A real-tree file present on every live run and planted by no example but the tripwire rows. */
const REAL_TREE_ANCHOR = "packages/db/src/schema/index.ts";

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

const BEHAVIOR_TEST_FAMILIES = ["unit", "integration"] as const satisfies readonly TestFamily[];
const PERSISTENCE_TEST_FAMILIES = ["integration"] as const satisfies readonly TestFamily[];
const SCHEMA_TEST_FAMILIES = ["contract"] as const satisfies readonly TestFamily[];

interface Finding {
  readonly file: string;
  readonly message: string;
}

function hasTest(tests: ReadonlySet<string>, pkg: string, rel: string, families: readonly TestFamily[]): boolean {
  const base = rel.replace(EXT_RE, "");
  return TEST_KIND_DEFINITIONS.some(
    ({ family, mirror, suffix }) => mirror === "module" && families.includes(family) && tests.has(`tests/${pkg}/${base}${suffix}`),
  );
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
// SHAPE, not a static list, so the current stubs need no per-file allowlist and can't go stale.
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

function missing(pkg: string, rel: string, message: string): Finding {
  return { file: `packages/${pkg}/src/${rel}`, message };
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

/** A `contract/` file that DECLARES ONLY ERROR CLASSES — the `errors.ts` family. `hasCallableExport`
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

function pushDomain(tests: ReadonlySet<string>, rel: string, sf: SourceFile, out: Finding[]): void {
  if (rel.includes("/verbs/") && !hasTest(tests, "server", rel, BEHAVIOR_TEST_FAMILIES)) {
    out.push(missing("server", rel, MSG.verb));
  }
  if (rel.includes("/persistence/") && !hasTest(tests, "server", rel, PERSISTENCE_TEST_FAMILIES)) {
    out.push(missing("server", rel, MSG.persistence));
  }
  if (rel.includes("/contract/") && hasSchema(sf) && !hasTest(tests, "server", rel, SCHEMA_TEST_FAMILIES)) {
    out.push(missing("server", rel, MSG.contract));
  }
  if (rel.includes("/workloads/runners/") && !isDeferredStubRunner(sf) && !hasTest(tests, "server", rel, BEHAVIOR_TEST_FAMILIES)) {
    out.push(missing("server", rel, MSG.runner));
  }
  pushDomainResidual(tests, rel, sf, out);
}

/** THE #767 ARM. Everything the slot arms above do not already claim: substrate/, every named subsystem
 *  (engine/ assembly/ memory/ themes/ …), `guard.ts`, the sanctioned feature-root singletons, and a contract/
 *  file that carries real logic rather than schemas or error declarations. */
function pushDomainResidual(tests: ReadonlySet<string>, rel: string, sf: SourceFile, out: Finding[]): void {
  if (SLOTTED_SEGMENTS.some((seg) => rel.includes(seg)) || isDomainShapeExempt(rel, sf) || isPassThroughWiring(sf)) {
    return;
  }
  if (hasCallableExport(sf) && !hasTest(tests, "server", rel, BEHAVIOR_TEST_FAMILIES)) {
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
  // A SPREAD of an atom is the argument list moved WHOLE — `target(...args)`, the seam shape. It was the one
  // gap in this predicate: a spread is not an Identifier, so `T(...args)` was not wiring and the most literal
  // forwarder on the tree was DEMANDED while every named-argument forwarder beside it was exempt. Measured
  // blast radius of this clause across `packages/server/src/**`: TWO files, both in the domain arm
  // (`domain/chat/substrate/{assembly-access,turn-access}.ts`), ZERO in entry/ or transport/.
  if (Node.isSpreadElement(node)) {
    return isPlumbingAtom(node.getExpression());
  }
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

function pushTiers(tests: ReadonlySet<string>, rel: string, sf: SourceFile, out: Finding[]): void {
  if (rel.endsWith(DECLARATION_EXT) || isPassThroughWiring(sf)) {
    return;
  }
  if (hasCallableExport(sf) && !hasTest(tests, "server", rel, BEHAVIOR_TEST_FAMILIES)) {
    out.push(missing("server", rel, MSG.tier));
  }
}

function pushInfra(tests: ReadonlySet<string>, rel: string, sf: SourceFile, out: Finding[]): void {
  const inTier = rel.startsWith("infra/") || rel.startsWith("foundation/");
  if (inTier && hasCallableExport(sf) && !hasTest(tests, "server", rel, BEHAVIOR_TEST_FAMILIES)) {
    out.push(missing("server", rel, MSG.infra));
  }
}

function pushContracts(tests: ReadonlySet<string>, rel: string, sf: SourceFile, out: Finding[]): void {
  if (hasSchema(sf) && !hasTest(tests, "contracts", rel, SCHEMA_TEST_FAMILIES)) {
    out.push(missing("contracts", rel, MSG.sharedContract));
  }
}

/** One scan's mutable state: where findings land and the two demand-by-default denominators, which are what
 *  let the tripwires tell "nothing violates" from "nothing was scanned". */
interface ScanState {
  readonly findings: Finding[];
  domainLogicFiles: number;
  tierLogicFiles: number;
}

/** Route ONE server source file to its arm, tallying that arm's runtime-logic denominator as it goes. */
function pushServer(state: ScanState, tests: ReadonlySet<string>, rel: string, sf: SourceFile): void {
  const logic = hasCallableExport(sf) ? 1 : 0;
  if (rel.startsWith(DOMAIN_DIR)) {
    state.domainLogicFiles += logic;
    pushDomain(tests, rel, sf, state.findings);
    return;
  }
  if (TIER_PREFIXES.some((prefix) => rel.startsWith(prefix))) {
    state.tierLogicFiles += logic;
    pushTiers(tests, rel, sf, state.findings);
    return;
  }
  pushInfra(tests, rel, sf, state.findings);
}

/** Which demand derivation saw an EMPTY corpus, if either. Domain first: both tripwires are terminal, so a
 *  tree missing both arms reports the domain one and the tier row never masks it. */
function blindnessMessage(state: ScanState): string | undefined {
  if (state.domainLogicFiles === 0) {
    return BLIND_DOMAIN;
  }
  return state.tierLogicFiles === 0 ? BLIND_TIERS : undefined;
}

/** The two §4.6 blindness tripwires, gated on the REAL-TREE ANCHOR: a conformance mini-project and a scoped
 *  run both legitimately carry neither the domain corpus nor the tier corpus, and judging either there would
 *  red the gate's own self-proof. The tripwire finding is ADDED to the arms' findings, never substituted for
 *  them — the legacy `run` reported every violation BEFORE its `return`, and clearing them here would make a
 *  blind derivation SUPPRESS the findings the sighted arms did produce. */
function pushBlindness(state: ScanState, mirror: MirrorIndex, reportable: ReadonlySet<string>): void {
  if (!mirror.sourceFiles.has(REAL_TREE_ANCHOR)) {
    return;
  }
  const blind = blindnessMessage(state);
  if (blind === undefined) {
    return;
  }
  // The legacy arm reported at this gate's own source file, which is outside every population it declares.
  const anchor = subjectAnchor(reportable, [REAL_TREE_ANCHOR]);
  state.findings.push({ file: anchor(REAL_TREE_ANCHOR), message: blind });
}

export const gate = defineGate({
  id: "test-presence",
  family: "mirror-index",
  authority: "hard",
  severity: "error",
  population: ["@server", "@contracts"],
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "mirror-index", id: "package-test" }],
  message:
    "a presence-gated source file has no mirror test — a domain verb / persistence / contract-schema / other domain-runtime-logic / infra-runtime-logic file must carry its test at tests/<mirror> (core/Spine-Testing.md §5).",
  fix: "add the required test at the mirror path (tests/server/<rest> or tests/contracts/<rest>) — a .test/.int.test/.contract.test per the surface.",
  create: (ctx) => {
    const state: ScanState = { findings: [], domainLogicFiles: 0, tierLogicFiles: 0 };
    return {
      evaluate: () => {
        const mirror = readyResourceValue(ctx.resources.mirrorIndex("package-test"));
        for (const sourceFile of ctx.files) {
          const rel = ctx.relativePath(sourceFile);
          // Server barrels (domain/infra `index.ts`) are pure re-exports — exempt. A contracts `index.ts` is
          // NOT a barrel (the domain's schemas co-locate there), so it is checked below.
          if (rel.startsWith(SERVER_SRC)) {
            if (sourceFile.getBaseName() !== "index.ts") {
              pushServer(state, mirror.testFiles, rel.slice(SERVER_SRC.length), sourceFile);
            }
            continue;
          }
          if (rel.startsWith(CONTRACTS_SRC)) {
            pushContracts(mirror.testFiles, rel.slice(CONTRACTS_SRC.length), sourceFile, state.findings);
          }
        }
        pushBlindness(state, mirror, new Set(ctx.resourcePaths));
        for (const finding of state.findings) {
          ctx.report.file(finding.file, { line: 1, column: 1, message: finding.message });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/persistence/record.ts": "export const record = () => 1;\n",
        "tests/server/domain/chat/persistence/record.dom.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "persistence file has no .int.test" },
      why: "a registered DOM unit mirror is still the wrong family for persistence, which requires integration coverage",
    },
    {
      mode: "resource",
      files: {
        "packages/contracts/src/chat/schema.ts": "export const S = z.object({});\n",
        "tests/contracts/chat/schema.test-d.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "shared contract schema has no .contract.test" },
      why: "a type-only mirror cannot substitute for runtime schema round-trip coverage",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = () => 1;\n",
        "tests/server/domain/chat/verbs/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "verb has no test" },
      why: "a domain verb file with no mirror .test/.int.test — an untested behavioral surface (§5)",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/persistence/chat-store.ts": "export const createChatStore = () => 1;\n",
        "tests/server/domain/chat/persistence/other.int.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "persistence file has no .int.test" },
      why: "a domain persistence file with no mirror .int.test — the persistence arm (distinct message)",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/contract/schema.ts": "export const S = z.object({});\nexport const build = () => S;\n",
        "tests/server/domain/chat/contract/other.contract.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "contract schema has no .contract.test" },
      why: "a domain contract file WITH a zod schema and no mirror .contract.test — the contract arm. The schema exemption keeps the residual arm silent on the same file, which the count pins",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/infra/providers/backends/agent-sdk/env-firewall.ts": "export function firewall(): void {}\n",
        "tests/server/infra/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "infra/foundation file with runtime logic has no test" },
      why: "an infra/ file with a callable export (runtime logic) and no mirror test — the infra arm (PD-blindspot)",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/workloads/runners/recall.ts": "export const run = (ctx: { env: { x: number } }) => ctx.env.x;\n",
        "tests/server/domain/workloads/runners/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "workloads runner with real logic has no test" },
      why: "a workloads runner that touches ctx.env (real logic, NOT a D58 stub) with no mirror test — the runner arm. `count: 1` also pins that `/workloads/runners/` is a SLOTTED segment, so the residual #767 arm stays silent on the same file rather than double-reporting it under the generic domain message",
    },
    {
      mode: "resource",
      files: {
        "packages/contracts/src/chat/index.ts": "export const S = z.object({});\n",
        "tests/contracts/chat/other.contract.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "shared contract schema has no .contract.test" },
      why: "a shared @orb/contracts schema-bearing file (even index.ts) with no mirror .contract.test — the contracts arm, and the row that dies if the server `index.ts` skip is widened to contracts",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/workloads/runners/regrown.ts":
          "// Not a D58 stub any more — it used to return { deferred: true } and now does the real pass.\nexport const run = (ctx: { env: { x: number } }) => ctx.env.x;\n",
        "tests/server/domain/workloads/runners/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "workloads runner with real logic has no test" },
      why: "COMMENT POSTURE (issue #117/#132) in the PERMISSIVE direction — the dangerous one. A runner whose COMMENT quotes `deferred: true` reads as an exempt D58 stub to a file-text scan and silently drops its test requirement; the code says otherwise, so it must still RED",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/discovery/substrate/pca.ts": "export const projectPca = (rows: number[][]) => rows.map((r) => r[0] ?? 0);\n",
        "tests/server/domain/discovery/substrate/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "domain file with runtime logic has no test" },
      why: "THE #767 SHAPE — `substrate/` is the second-largest slot in the domain tree and the old enumerated demand set never named it, so 54 pure, deterministic, most-testable files were invisible. Demand-by-default is what makes the next new slot demanded on the day it appears",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/rpg/guard.ts": "export function requireGameHost(): void {}\n",
        "tests/server/domain/rpg/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "domain file with runtime logic has no test" },
      why: "the ratified 9th slot: `guard.ts` is the `can()` authority seam — an I/O-touching gate primitive, the LAST file whose behavior should be unpinned, and it sat outside the demand set. THE FEATURE-ROOT NARROWING: `guard.ts` is a feature root that `WIRING_ROOT_FILES` does NOT name, so widening that set to every root reds this row",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/character/contract/handoff-copy.ts":
          "export function handoffProvenance(chatId: string): string {\n  return `handoff:` + chatId;\n}\n",
        "tests/server/domain/character/contract/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "domain file with runtime logic has no test" },
      why: "the `contract/`-without-schema hole (#767): `hasSchema` was never meant to exempt a contract file carrying REAL logic — this one derives the handoff copy's idempotency key, and the error-declaration exemption below does not cover it",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/entry/http/frame-handle-store.ts":
          "export function take(id: string, owner: string): string | undefined {\n  const hit = STORE.get(id);\n  if (hit === undefined || hit.owner !== owner) {\n    return undefined;\n  }\n  return hit.doc;\n}\n",
        "tests/server/entry/http/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "entry/transport file with runtime logic has no test" },
      why: "THE #773 SHAPE — an `entry/http/` unit that is NOT wiring: the opaque frame-handle store's owner check is a SECURITY primitive (a foreign owner must be indistinguishable from a miss) and it sat outside the demand set entirely, because the old arms only reached domain/ + infra/ + foundation/",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/transport/jobs/workload-schedule-scheduler.ts":
          "export function startWorkloadScheduleScheduler(deps: Deps): () => void {\n  const safeTick = (): void => {\n    tickWorkloadSchedules(deps).catch(() => undefined);\n  };\n  safeTick();\n  return deps.scheduleInterval(safeTick, deps.checkIntervalMs);\n}\n",
        "tests/server/transport/jobs/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "entry/transport file with runtime logic has no test" },
      why: "the transport half: a job DRIVER decides WHEN to fire and isolates a failing tick — real behavior, more than one statement, so the pass-through exemption does not reach it",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/entry/compose/gate.ts":
          "export const decide = (deps: Deps, req: Req): Verdict => (req.anonymous ? deps.publicBucket(req.ip) : deps.authedBucket(req.userId));\n",
        "tests/server/entry/compose/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "entry/transport file with runtime logic has no test" },
      why: "THE PERMISSIVE DIRECTION of the pass-through exemption — a ONE-EXPRESSION body that still DECIDES. It looks like the exempt delegating-call shape and is not one: a conditional is neither a plumbing atom nor a wiring call, so policy written as a ternary stays demanded",
    },
    {
      mode: "resource",
      files: {
        "packages/db/src/schema/index.ts": "export const schema = 1;\n",
        "packages/server/src/domain/discovery/substrate/pca.ts": "export const projectPca = (rows: number[][]) => rows.map((r) => r[0] ?? 0);\n",
        "tests/server/domain/discovery/substrate/pca.test.ts": "export const t = 1;\n",
      },
      expect: { count: 1, messageIncludes: "the entry/transport scan matched ZERO files" },
      why: "THE #773 ARM'S BLINDNESS TRIPWIRE (§4.6): a corpus that carries the real-tree anchor and a tested domain logic file but NO entry/transport file at all. The tier demand is keyed on two path prefixes, so a rename or a tier move would otherwise turn the whole arm into a silent ✓ over an unscanned corpus — this is the one row that reaches the tripwire, since a real run never has zero. THE ANCHOR MOVE is pinned here too: the finding reports at the db schema anchor, inside the declared resource population, never at the gate's own source file",
    },
    {
      mode: "resource",
      files: {
        "packages/db/src/schema/index.ts": "export const schema = 1;\n",
        "packages/server/src/entry/http/frame-handle-store.ts":
          "export function take(id: string): string | undefined {\n  const hit = STORE.get(id);\n  if (hit === undefined) {\n    return undefined;\n  }\n  return hit.doc;\n}\n",
        "tests/server/entry/http/frame-handle-store.test.ts": "export const t = 1;\n",
      },
      expect: { count: 1, messageIncludes: "the domain scan matched ZERO files" },
      why: "THE #767 ARM'S OWN TRIPWIRE, which the legacy suite held only in a scratch-tree test and no proof row ever reached: the anchor plus a TESTED tier corpus and no domain file at all — the shape a domain-tree move produces. Both tripwires return early, so each needs its own row or one masks the other",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/substrate/decides-access.ts":
          "export function shapeVia(ctx: Ctx, speaker: Speaker): Shaped {\n  return speaker.narrator ? shapeAll(ctx) : shapeOne(ctx, speaker);\n}\n",
        "tests/server/domain/chat/substrate/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "domain file with runtime logic has no test" },
      why: "THE PERMISSIVE EDGE of the DOMAIN pass-through exemption, the twin of `mustFlag[14]` one arm over: a `substrate/` seam whose one-expression body still DECIDES is not a forwarder — a conditional is neither a plumbing atom nor a wiring call — so it stays demanded. Without this row the exemption `mustPass[15]` relies on could widen into 'any substrate file with a short body' and no declared row would notice",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/tag/registry/service.ts":
          "export function createRegistryService(ctx: { db: number }) {\n  const db = ctx.db;\n  return { db, ready: db > 0 };\n}\n",
        "tests/server/domain/tag/registry/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "domain file with runtime logic has no test" },
      why: "THE `isFeatureRoot` DEPTH NARROWING (#2131), the row `mustPass[4]`'s `why` used to claim: the SAME basename one level below the feature root is NOT the composition root the template gives zero logic to, so it is demanded. Cutting the depth test makes every `service.ts`/`context.ts` in the domain tree exempt at any nesting and this row goes silent — the direction is FEWER findings, which is why only a `mustFlag` can hold it",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/workloads/runners/half-filled.ts":
          "export const run = (ctx: { env: { x: number } }) => {\n  const n = ctx.env.x;\n  return { deferred: true, n };\n};\n",
        "tests/server/domain/workloads/runners/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "workloads runner with real logic has no test" },
      why: "THE `!ctx.env` HALF of the D58 stub exemption (#2131): a runner that still returns `deferred: true` but has begun touching its injected env is a runner being FILLED IN, and the exemption ends the moment real behaviour arrives — `mustFlag[6]` only ever proved the other half (no `deferred: true` at all), so cutting `&& !text.includes(ENV_CALL)` came back clean. Two statements, so the pass-through widening cannot acquit it instead",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/tag/contract/holder.ts": "export class TagHolder extends DomainBase {\n  read(): number {\n    return 1;\n  }\n}\n",
        "tests/server/domain/tag/contract/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "domain file with runtime logic has no test" },
      why: "THE `extends *Error` TEST inside `isErrorDeclarationOnly` (#2131): the exemption is for a file whose only assertion would be `instanceof`, which is true of an error family and of NOTHING else. A `contract/` class extending an ordinary base carries methods and is demanded; cutting the suffix test exempts every class-only contract file and this row goes silent",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/tag/substrate/engine.ts": "export class TagEngine {\n  run(rows: number[]): number {\n    return rows.length;\n  }\n}\n",
        "tests/server/domain/tag/substrate/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "domain file with runtime logic has no test" },
      why: "THE EXPORTED-CLASS ARM of `exportedCallables` (#2131): a class is runtime logic, and dropping it from the callable list would make a class-only subsystem invisible to BOTH demand arms rather than exempt by a stated shape. This row is outside `contract/`, so `isErrorDeclarationOnly` cannot be what acquits it under the cut — the class arm is the only fence in play",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/substrate/limits.ts":
          "export const limitsSchema = z.object({});\nexport function clampLimit(n: number): number {\n  const next = n + 1;\n  return next;\n}\n",
        "tests/server/domain/chat/substrate/other.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "domain file with runtime logic has no test" },
      why: "THE `/contract/` FENCE inside `isDomainShapeExempt` (#2254): the schema exemption is a statement about the `contract/` slot, which has its OWN arm demanding the RIGHT kind — it is not a licence for any file that mentions a zod builder. A `substrate/` module that declares a schema BESIDE real logic is demanded, and cutting the fence exempts it (and every schema-mentioning file in the domain tree) — the direction is FEWER findings, so only a `mustFlag` can hold it. The function body is two statements so `isPassThroughWiring` cannot be what reds it instead",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = () => 1;\n",
        "tests/server/domain/chat/verbs/start-chat.suite.test.ts": "export {};\n",
      },
      expect: { count: 1, messageIncludes: "verb has no test" },
      why: "THE `mirror === \"module\"` FILTER in `hasTest` (#2254): a `.suite.test.ts` is a `unit`-family kind whose mirror is a SUITE — its name is the suite's, not the module's — so a file sitting at the demanded module path is a COINCIDENCE, not that module's coverage. Cutting the filter makes this suite name satisfy the verb demand and the row goes silent; the family filter alone cannot hold it, because `suite` kinds share `unit`/`integration` families with the module kinds",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/preview.ts": "export const preview = () => 1;\n",
        "tests/server/domain/chat/verbs/preview.dom.test.ts": "export {};\n",
        "packages/server/src/domain/chat/persistence/record.ts": "export const record = () => 1;\n",
        "tests/server/domain/chat/persistence/record.int.test.ts": "export {};\n",
        "packages/contracts/src/chat/schema.ts": "export const S = z.object({});\n",
        "tests/contracts/chat/schema.contract.test.ts": "export {};\n",
      },
      why: "registry-derived suffixes retain the distinct unit, integration and contract family obligations",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/verbs/start-chat.ts": "export const createStartChat = () => 1;\n",
        "tests/server/domain/chat/verbs/start-chat.test.ts": "export const t = 1;\n",
      },
      why: "the verb file has its mirror .test.ts — presence satisfied, passes",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/workloads/runners/stub.ts": "export const run = () => ({ deferred: true });\n",
        "tests/server/domain/workloads/runners/other.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT — a D58 no-op stub runner (deferred: true, never touches ctx.env) is exempt until filled in. It is also a pass-through-shaped residual subject, which is why it is silent on BOTH arms",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/contract/prose.ts":
          '// The wire shape for this lives in packages/contracts — z.object({ id }) is declared there, not here.\nexport const LABEL = "x";\n',
        "tests/server/domain/chat/contract/other.test.ts": "export {};\n",
      },
      why: "COMMENT POSTURE (issue #117/#132), false-POSITIVE direction: a contract-dir file whose COMMENT spells `z.object(` declares no schema, so demanding a .contract.test.ts would demand a test with nothing to assert",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/tag/service.ts":
          "export function createTagService(ctx: { db: number }) {\n  const db = ctx.db;\n  return { db, ready: db > 0 };\n}\n",
        "tests/server/domain/tag/other.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT of the #767 arm: a feature-root `service.ts` is the composition root the template gives ZERO logic (Core-0 §4) — it only assembles verb factories, each of which carries its own demanded test, so a test here would assert the wiring twice. THE WIRING-ROOT EXEMPTION is what this row holds: deleting the `isFeatureRoot(rel) && WIRING_ROOT_FILES.has(base)` branch reds it. The body is deliberately TWO statements so `isPassThroughWiring` cannot acquit it — with the original one-expression body the measured cut came back CLEAN and this `why` was claiming a fence that was not deciding (#2132). Its two halves are held from the other side, by `mustFlag[10]` (the NAME) and `mustFlag[18]` (the DEPTH)",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/stats/context.ts":
          "export function createStatsContext(db: number, now: () => number) {\n  const clock = now;\n  return { db, now: clock };\n}\n",
        "tests/server/domain/stats/other.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT: `context.ts` is the DI bundle Spine-Testing §5 names exempt by nature — its builder returns its own arguments, which is the tautology test the presence rule exists to avoid. Same repair as `mustPass[4]` (#2132): the body is TWO statements, so the wiring-root exemption is the only thing acquitting it and deleting that branch reds this row; the one-expression original was acquitted by `isPassThroughWiring` instead and held nothing",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/tag/contract/errors.ts": "export class TagNotFoundError extends DomainNotFoundError {}\n",
        "tests/server/domain/tag/other.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT: a `contract/` file declaring only error CLASSES is a type surface with a runtime shadow — `hasCallableExport` counts the class, but the only assertion available is `instanceof`. A function or a non-error class in the same file drops the exemption (mustFlag[11])",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/discovery/substrate/pca.ts": "export const projectPca = (rows: number[][]) => rows.map((r) => r[0] ?? 0);\n",
        "tests/server/domain/discovery/substrate/pca.test.ts": "export const t = 1;\n",
      },
      why: "the other direction of the #767 arm: the same substrate file WITH its mirror test passes — 91 substrate files were already tested and merely undemanded, so the widening must not accuse them",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/entry/boot/seed-themes.ts":
          "export async function seedThemes(deps: SeedThemesDeps): Promise<void> {\n  await ensureSeedThemes(deps.db, deps.now);\n}\n",
        "tests/server/entry/boot/other.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT of the #773 arm — THE PASS-THROUGH SHAPE: a boot step whose whole body forwards its own deps into ONE lower-tier call. The behavior is `ensureSeedThemes`'s and is demanded THERE (the domain arm); a test here could only assert that the forwarder forwards, which is the tautology this doc bans. It loses the exemption the day it grows a second statement",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/transport/trpc/context.ts":
          "export function createContext(parts: Parts): Context {\n  return { auth: parts.auth, services: parts.services, rateLimit: parts.rateLimit, clientIp: parts.clientIp };\n}\n",
        "tests/server/transport/trpc/other.test.ts": "export {};\n",
      },
      why: 'DECLARED LIMIT — THE DI-BUNDLE SHAPE, the transport twin of the domain `context.ts` exemption, derived from the BODY rather than the basename: a packaging function that returns its own arguments (`core/Tier-4-Transport.md`: "Pure packaging: no db, no header parsing, no identity resolution")',
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/transport/trpc/routers/chat.ts":
          "export const chatRouter = router({\n  send: authedProcedure.input(sendSchema).mutation(({ ctx, input }) => ctx.services.chat.send(input)),\n});\n",
        "tests/server/transport/trpc/routers/other.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT — THE ROUTER SHELL: `core/Tier-4-Transport.md` gives a router zero business logic (validate → call the verb → map the error), and it needs no predicate of its own because a `router({…})` call binds no callable export, so `hasCallableExport` already leaves it alone. The row exists so a future change to that helper cannot silently start demanding a test on all 24 shells",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/entry/compose/minter.ts":
          "export function minter<P extends string>(prefix: P): () => TypeIdOf<P> {\n  return (): TypeIdOf<P> => mintTypeId(prefix);\n}\n",
        "tests/server/entry/compose/other.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT — the CURRIED pass-through: a factory whose returned closure is itself one delegating call. The shape reduces through the arrow, so `minter` is wiring and stays exempt while a factory that computed anything before returning would not",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/entry/http/frame-types.d.ts": "export declare function hostV1(): void;\n",
        "tests/server/entry/http/other.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT — a `.d.ts` DECLARATION file inside a demanded TIER: it emits nothing at runtime, so there is no behavior a mirror test could assert. `hasCallableExport` counts an `export declare function`, which is exactly how a typings asset would otherwise be accused. THE `DECLARATION_EXT` NARROWING: dropping the `.d.ts` test reds this row",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/entry/http/frame-handle-store.ts":
          "export function take(id: string, owner: string): string | undefined {\n  const hit = STORE.get(id);\n  if (hit === undefined || hit.owner !== owner) {\n    return undefined;\n  }\n  return hit.doc;\n}\n",
        "tests/server/entry/http/frame-handle-store.test.ts": "export const t = 1;\n",
      },
      why: "the other direction of the #773 arm: the same entry file WITH its mirror test passes — 65 of the tier's 94 logic files were already tested and merely undemanded, so the widening must not accuse them",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/index.ts": 'export * from "./service.ts";\nexport const front = () => 1;\n',
        "tests/server/domain/chat/other.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT — THE SERVER `index.ts` SKIP: a server barrel is a pure re-export and is not a behavioural surface. It is the asymmetric half of the rule `mustFlag[7]` holds from the other side, where a CONTRACTS `index.ts` IS checked because the domain's zod schemas co-locate there. Deleting the skip reds this row",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/substrate/assembly-access.ts":
          "export function shapeTurn(...args: Parameters<typeof shape>): ReturnType<typeof shape> {\n  return shape(...args);\n}\n" +
          "export function fitHistory(...args: Parameters<typeof fitHistoryToWindow>): ReturnType<typeof fitHistoryToWindow> {\n  return fitHistoryToWindow(...args);\n}\n",
        "tests/server/domain/chat/substrate/other.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT — THE DOMAIN PASS-THROUGH SEAM (#2062), the shape that put two files in the retired baseline. A `substrate/` DI bridge exists to mediate a dep-cruiser boundary: every export forwards its OWN argument list into one sibling-subsystem call, so the behaviour is the target's and is demanded THERE, exactly as the #773 tier arm has always reasoned. It is also the shape the house's own test law makes UNTESTABLE — a test here either asserts that a forwarder forwards (the §5 tautology) or `vi.mock`s an internal module (§3, banned, and `test-mock-doctrine` reds it). TWO cuts red this row: dropping `isPassThroughWiring` from `pushDomainResidual`, and dropping the SPREAD clause from `isPlumbingAtom`",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/chat/contract/limits.ts":
          "export const limitsSchema = z.object({});\nexport function clampLimit(n: number): number {\n  const next = n + 1;\n  return next;\n}\n",
        "tests/server/domain/chat/contract/limits.contract.test.ts": "export {};\n",
      },
      why: "DECLARED LIMIT — THE SCHEMA ARM of `isDomainShapeExempt` (#2254): a `contract/` file that DECLARES a schema is the CONTRACT arm's subject, and that arm demands the kind the surface actually owes — the `.contract.test.ts` this row carries. Cutting `hasSchema` out of the exemption hands the same file to the residual arm as well, which then demands a SECOND, different test for one surface; the direction is MORE findings, which is why a `mustPass` is what holds it. `mustFlag[10]` holds the other edge (a `contract/` file with real logic and no schema stays demanded), and the body is two statements so `isPassThroughWiring` is not what acquits it",
    },
  ],
});
