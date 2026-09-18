// Policy: no-inline-union-redecl (core/Spine-TypeScript-and-Patterns.md §7.5) — a string-union AXIS is
// declared ONCE as an `as const` tuple and the union derived; never re-spelled. Two arms, one authority:
// (A) an inline string-literal union TYPE ALIAS of ≥3 members. (B) any inline string-literal SET — a union
// in a property/return/argument position, or a `z.enum([...])` array — whose members EXACTLY equal a
// canonical tuple homed somewhere the re-speller can import from. A genuine one-off enum with no canonical
// tuple (NODE_ENV) is not flagged, which is why arm B is an exact-set match and not a heuristic.
//
// ── FAMILY: singleton, under its own id, reading `lib/union-axis.ts` ────────────────────────────────────
// The axis-identity layer (as-const unwrapping through `satisfies`, the `Interface["prop"]` co-declaration
// resolution, the two member floors, the package-cake reach fence) is in that reader; this module owns the
// INTENT — which arm reports, what it says, and where the waiver anchors. No sibling policy shares the
// reader today, so the family is this policy's own id (§3: "a policy with no proven sibling is a singleton
// family under its own id"); a second consumer of `union-axis.ts` renames the family, nothing else.
//
// ── THE RULED THREE-WAY ARITY WAS AMENDED TO ONE POLICY (#1584 §12.6, orchestrator ruling 2026-09-12) ───
// §12.6 ruled this module into "ordinary union/respell policy, reviewed SDK-mirror grant policy, and hard
// grant-health policy under one family". THE TREE REFUTES THE LAST TWO, and §12.6's own banner is the
// authority for amending a ruled row that disagrees with the tree. Receipt, re-derived at 2030ab180 and at
// HEAD (identical bytes): the legacy `FILE_CLASS_EXEMPT` table was `{}` — EMPTY — and the legacy header
// recorded why, at :22-24: "2026-09-05 (#1692): the published SDK mirror moved to
// packages/showcase-plugins/bundles/, outside the scanned corpus, so its row (and the proof that planted
// it) went". So a reviewed-grant policy would license NOTHING, and any row invented to give it a subject
// would go STALE on its first complete owner run (zero consumption is stale, §12.5); a grant-health policy
// would be a tripwire over an empty table. Both are §4.1's MUTUALLY REDUNDANT bucket — two mechanisms
// guarding a subject that does not exist — so the honest arity is ONE ordinary policy, and the SDK-mirror
// grant is minted by whoever brings that corpus back into population, not pre-emptively here.
//
// ── AUTHORITY: ordinary, and the door was CHECKED rather than inherited (§3, the 9/9 rule) ─────────────
// The legacy descriptor carried positions that were DISCRIMINATOR LABELS, legal under the legacy engine's
// `marker.position === undefined || marker.position === token` test and invalid under this contract's
// source-coordinate definition: arm A reported the synthetic token `union <Alias>` and arm B `re-spell
// <Tuple>` / `z.enum re-spell <Tuple>`, none of which is authored text anywhere. Under `report.node` all
// three THROW. Both arms are re-anchored on real source slices through the repo's one waiver-anchor
// contract (`lib/caught-failure.ts#firstAnchor`, whose `isAnchorableToken` refuses parens, newlines and
// the solidus — exactly the shapes a marker cannot hold): arm A anchors on the ALIAS NAME, arm B on the
// inline SET's own text. What the token lost — which tuple a re-spell matched, and which arm fired — moved
// into the per-finding MESSAGE, where it is more useful than it was in a position nobody could type.
//
// ── POPULATION PORT: byte-identical, measured ──────────────────────────────────────────────────────────
// Legacy scanned the harness corpus (`_shared/ts-workspace.ts#harnessGlobs`: `packages/*/src/**`,
// `tests/**`, `tooling/src/**`, `scripts/**`) minus its own `scanRoot` subtraction of
// `tooling/src/verify/gates/`. `@authored` + `@showcase` + `notUnder: ["tooling/src/verify/gates/**"]` is
// that set: driven over the 7,475 tracked `.ts`/`.tsx` paths, legacy admits 7,165 and this population
// admits the same 7,165, symmetric difference 0, with both directions controlled (293 gate-module paths
// subtracted; `packages/showcase-plugins/src` admitted). `@showcase` is named EXPLICITLY because
// `@authored` deliberately excludes it (contract/population.ts) while `packages/*/src/**` did not — the
// only way the port stays lossless. The gate-directory subtraction is LOAD-BEARING, not cosmetic: proof
// fixtures re-spell axes by design, and every module's `mustFlag` strings would otherwise be real subjects.
//
// ── §4.1 NARROWINGS: THIRTEEN, ALL CUT, ALL ENFORCED ───────────────────────────────────────────────────
// Every fence was cut in the §4.1 direction (make the policy flag MORE) in a fresh process — one cut per
// process, because a `?query` re-import returns the CACHED module — with the anchor asserted to occur
// EXACTLY ONCE in the file, since this header and the `why` strings below quote several of them. Each cut
// killed exactly the row its `why` names: the arm-A ≥3 floor, the default ≥3 registration floor, the
// contracts/kit trusted-home list, the D54 `ui`/`contracts` clause, the whole cake-reach fence, arm B's
// alias-parent skip, the `.enum` callee test, the union's string-member test, the tuple's string-element
// test, the `satisfies` co-declaration exemption (which kills TWO rows), the gate-directory subtraction and
// the `@showcase` root. The tuple's string-element test was the one CLEAN cut on the legacy row set, and
// §4.1's rule was applied rather than filing it UNFALSIFIABLE: the discriminating fixture — a numeric
// `[1, 2, 3] as const` beside the union `'1' | '2' | '3'` — was written, run, and reds under the cut.
// The thirteenth is the derived-position fallback below, and it is a CATCH rather than a narrowing: cut it
// back to an early return on an unanchorable set and the multi-line `mustFlag` row reports 0 findings.
//
// ── DECLARED LIMITS ────────────────────────────────────────────────────────────────────────────────────
// · An UNRESOLVABLE `satisfies readonly X[]` clause loses its co-declaration exemption and the source union
//   is then reported as a re-spell of its own tuple. It fails OPEN (a false positive with a working waiver
//   door), not closed, and it is legacy behaviour preserved byte-for-byte rather than a conversion choice.
//   There is no fail-closed "unreadable" arm anywhere in this policy, so no row owes a `messageIncludes`
//   for one (#1990); the probe is unnecessary because the branch does not exist.
// · Two re-spells of the SAME set inside ONE statement share a carrier AND a position token, so every
//   marker against them is `over-broad` and suppresses neither. Legacy had the identical collision (both
//   sites reported the token `re-spell <Tuple>`); the conversion neither introduces nor repairs it, and the
//   repair if it ever bites is to home the axis, which is what the finding asks for.
//
// ── §4.6 DIFFERENTIAL: committed, `tests/tooling/verify/gates/union-axis-family.suite.test.ts` ────────────────
// Every legacy example replayed through the frozen legacy descriptor at 2030ab180 and through this policy,
// over each example's OWN file map with this population applied. Legacy-side coverage: 5 of 10 examples
// flag (both arms, all three sub-kinds) — nonzero, so the replay is evidence. One classified difference,
// applied per finding rather than averaged: POSITION/TOKEN — arm A moves from the alias declaration's start
// to its NAME, and arm B's z.enum sub-kind from the CALL to its ARRAY argument, with every token becoming
// an authored slice. No marker re-binding is owed: the live `@orb-gate-ignore no-inline-union-redecl`
// census is ZERO across packages/tests/tooling/scripts/docs (positive control: the opener itself is live
// elsewhere), so this conversion translates no markers.
//
// AND THE SAME COMPARISON ON THE REAL TREE, because a conformance-green policy can still report NOTHING
// there (#1972): both descriptors driven over ONE workspace Project (7,460 files; this policy's population
// admits 7,167 of them, the 293 gate modules subtracted). LEGACY 12 findings, FINAL 12 findings, and the
// SITE sets (`file:line`) are IDENTICAL in both directions — every token moved exactly as classified above
// (`re-spell GATE_POLICY_ANALYSES` → `"syntax" | "types" | "resource"`, `union OrdinaryWaiverMarkerOutcome`
// → `OrdinaryWaiverMarkerOutcome`). So the conversion is catch-NEUTRAL on the live tree: those 12 are
// pre-existing debt the legacy gate already reported, neither introduced nor silently dropped here.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-inline-union-redecl` descriptor at ac0085c9101b35c5031363a29e32c1882477c4c0, the parent of the conversion
// `4ed5a94d5` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME
// 7,480 harness candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot`
// admits 7,175 and final `population` admits 7,175. legacy − final = ∅. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `tooling/src/verify/gates/_proof/__cbbhr_out_client-vendors.ts` (virtual) rejected by both.
import { Node } from "ts-morph";
import type { GatePolicyContext } from "../contract/policy.ts";
import { defineGate } from "../contract/policy.ts";
import { firstAnchor } from "../lib/caught-failure.ts";
import type { AxisRespellCandidate, CanonicalAxisTuple } from "../lib/union-axis.ts";
import {
  ALIAS_MIN_MEMBERS,
  axisRespellCandidate,
  canonicalAxisTuple,
  canReachAxisHome,
  inlineUnionAlias,
  UNION_AXIS_VISITOR_KINDS,
} from "../lib/union-axis.ts";

const MESSAGE =
  "a string-union AXIS is declared ONCE as an `as const` tuple and the union derived — never re-spelled inline (Spine-TypeScript-and-Patterns.md §7.5).";
const ALIAS_MESSAGE =
  `an inline string-literal union TYPE ALIAS of ${String(ALIAS_MIN_MEMBERS)} or more members: declare the axis once as ` +
  "`export const X = [...] as const` and derive `(typeof X)[number]` (Spine-TypeScript-and-Patterns.md §7.5).";
const FIX =
  "home the axis in one `as const` tuple and derive from it — `(typeof X)[number]` for a type, `z.enum(X)` for a schema. " +
  "A deliberate occurrence waives with `@orb-waive no-inline-union-redecl(<position>): <reason + end condition>`, where " +
  "<position> is the ALIAS NAME for an inline alias (`Mode`) and the inline SET's own source text for a re-spell " +
  "(`'a' | 'b' | 'c'`, or `['a', 'b', 'c']` for a z.enum) — the exact slice the report anchors on. A set spanning a " +
  "newline cannot be a marker position at all, so the runtime derives the set's first member literal instead.";

/** What a re-spell must be told: which homed tuple it duplicates, where that tuple lives, and how to
 *  derive from it in the spelling the site actually uses. */
function respellMessage(candidate: AxisRespellCandidate, home: CanonicalAxisTuple): string {
  const derive = candidate.kind === "zenum" ? `z.enum(${home.name})` : `(typeof ${home.name})[number]`;
  return (
    `this inline ${candidate.kind === "zenum" ? "`z.enum([...])` array" : "string-literal union"} re-spells the canonical ` +
    `tuple \`${home.name}\` homed at ${home.file} — derive \`${derive}\` instead (Spine-TypeScript-and-Patterns.md §7.5).`
  );
}

/** Report at an EXACT SOURCE SLICE inside the reported node — or, when the slice the marker grammar needs
 *  (no paren, newline or solidus) does not exist, report with NO token so the RUNTIME derives one
 *  (`policy-pass-context.ts:109`, the first authored identifier/literal/keyword in the node's own text).
 *  Never `return` on a missing anchor: an underivable position is a waiver-ergonomics problem and dropping
 *  the finding would turn it into a silent catch loss. This is `lib/caught-failure.ts`'s documented
 *  fallback, applied by the same rule that owns the anchor. */
function reportAnchored(
  report: GatePolicyContext["report"]["node"],
  options: { readonly reported: Node; readonly anchor: Node; readonly message: string },
): void {
  const anchor = firstAnchor(options.reported, [options.anchor]);
  const position = anchor === undefined ? {} : { token: anchor.token, offset: anchor.offset };
  report(options.reported, { ...position, message: options.message, fix: FIX });
}

export const gate = defineGate({
  id: "no-inline-union-redecl",
  family: "no-inline-union-redecl",
  authority: "ordinary",
  severity: "error",
  population: { in: ["@authored", "@showcase"], notUnder: ["tooling/src/verify/gates/**"] },
  // The `satisfies readonly Interface["prop"][]` co-declaration exemption resolves the indexed access
  // through the compiler (`union-axis.ts#coDeclarationUnionNode`), so the evidence plane is types, not
  // syntax — declared rather than smuggled behind a `lib/` hop.
  analysis: "types",
  // ARM B COMPARES AGAINST TUPLES COLLECTED FROM THE WHOLE TREE: a re-spell in `packages/server` matches a
  // tuple homed in `packages/contracts`, and a narrowed request that admits only the re-speller would
  // "prove" the axis has no home and report nothing. The verdict cannot compose over a subset, so a proper
  // subset DEFERS the whole policy (pinned in the family test, §4.5).
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const tuples = new Map<string, CanonicalAxisTuple>();
    /** The compiler nodes of every registered tuple's own `satisfies` co-declaration union — the SOURCE a
     *  tuple derives from, never a re-spell of it. Keyed on `compilerNode` identity rather than a
     *  file:line:column string: the pass owns one Project, so identity is exact and cannot alias. */
    const coDeclarations = new Set<object>();
    const candidates: { readonly candidate: AxisRespellCandidate; readonly file: string }[] = [];
    return {
      visitors: [
        {
          kinds: [...UNION_AXIS_VISITOR_KINDS],
          visit: (node): void => {
            const alias = inlineUnionAlias(node);
            if (alias !== undefined) {
              reportAnchored(ctx.report.node, { reported: alias.alias, anchor: alias.nameNode, message: ALIAS_MESSAGE });
              return;
            }
            const file = ctx.relativePath(node.getSourceFile());
            const tuple = Node.isVariableDeclaration(node) ? canonicalAxisTuple(node, file) : undefined;
            if (tuple !== undefined) {
              tuples.set(tuple.signature, tuple);
              if (tuple.coDeclaration !== undefined) {
                coDeclarations.add(tuple.coDeclaration.compilerNode);
              }
              return;
            }
            const candidate = axisRespellCandidate(node);
            if (candidate !== undefined) {
              candidates.push({ candidate, file });
            }
          },
        },
      ],
      evaluate: (): void => {
        for (const { candidate, file } of candidates) {
          const home = tuples.get(candidate.signature);
          if (home === undefined || coDeclarations.has(candidate.reported.compilerNode)) {
            continue;
          }
          if (!canReachAxisHome(file, home.file)) {
            continue;
          }
          reportAnchored(ctx.report.node, { reported: candidate.reported, anchor: candidate.reported, message: respellMessage(candidate, home) });
        }
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: { "packages/contracts/src/x.ts": "export type Mode = 'a' | 'b' | 'c';\n" },
      expect: { count: 1, token: "Mode", messageIncludes: "TYPE ALIAS" },
      why: "ARM A, the founding row — an inline string-union type alias of ≥3 members. The position is the ALIAS NAME, an authored slice: the legacy synthetic token `union Mode` appears in no source file and would THROW under `report.node`",
    },
    {
      mode: "types",
      files: { "tooling/src/verify/lib/reader.ts": 'export type ReaderVerdict = "reads" | "other" | "unreadable";\n' },
      expect: { count: 1, token: "ReaderVerdict", messageIncludes: "TYPE ALIAS" },
      why: 'ARM A ON THE SHAPE THIS PROGRAM ITSELF RE-SPELLS (#2051). #1584\'s identity readers each declared a private `<hit> | "other" | "unreadable"` — the #944 three answers — and this gate reported SIX of them on the real tree, three minted by the wave that converted this very policy. They now derive from `contract/origin-verdict.ts`\'s `OriginVerdict<Hit>`; this row is the ratchet that reds the seventh reader to re-spell it, and it is under `@tooling` deliberately, because that is where the re-spelling happened and where a lane would otherwise assume the policy does not look',
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/home.ts": "export const AXIS = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/x.ts": "export interface T { mode: 'a' | 'b' | 'c' }\n",
      },
      expect: { count: 1, token: "'a' | 'b' | 'c'", messageIncludes: "re-spells the canonical tuple `AXIS`" },
      why: "ARM B, the founding CROSS-FILE row — a union in a property position whose members exactly equal a homed tuple. Both halves of the identity are pinned: the position is the inline SET itself, and the message names the tuple the author must derive from, which is the whole content of the verdict",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/mode-home.ts": "export const MODE = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/z.ts": "export const schema = z.enum(['a', 'b', 'c']);\n",
      },
      expect: { count: 1, token: "['a', 'b', 'c']", messageIncludes: "z.enum(MODE)" },
      why: "ARM B's ZENUM sub-kind (the AUTH_MODE bug) — a `z.enum([...])` re-spelling a homed tuple. The report anchors on the ARRAY argument, not the call: `z.enum(['a', 'b', 'c'])` contains parens, and the marker grammar's position group is `[^()\\r\\n]+`, so anchoring on the call would leave the finding UNWAIVABLE. The message discriminates the sub-kind by naming the `z.enum(X)` derivation rather than `(typeof X)[number]`",
    },
    {
      mode: "types",
      files: {
        "packages/kit/src/pair-home.ts": "export const PAIR = ['x', 'y'] as const;\n",
        "packages/server/src/pair-respell.ts": "export interface P { side: 'x' | 'y' }\n",
      },
      expect: { count: 1, token: "'x' | 'y'", messageIncludes: "`PAIR`" },
      why: "THE ≥2 HOMED REGISTRATION FLOOR: a 2-member tuple homed in `packages/kit/` registers as canonical, so a 2-member re-spell is caught. Paired with the `mustPass` row placing the identical 2-member tuple in `packages/server/` — that one is BELOW the floor and passes, which is the fence this row shares",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/sat-home.ts":
          "export interface Cfg { mode: 'a' | 'b' | 'c'; n: number }\nexport const MODES = ['a', 'b', 'c'] as const satisfies readonly Cfg['mode'][];\n",
        "packages/server/src/sat-respell.ts": "export interface Reuse { mode: 'a' | 'b' | 'c' }\n",
      },
      expect: { count: 1, token: "'a' | 'b' | 'c'", messageIncludes: "`MODES`" },
      why: "THE `as const satisfies readonly X[]` REGISTRATION: the house derive idiom parses as a SatisfiesExpression wrapping the AsExpression, so a reader that does not peel it registers no tuple and the FOREIGN re-spell escapes. `count: 1` is load-bearing here — the home file's own `Cfg['mode']` co-declaration is inside the population and is exempt, so a broken exemption shows up as 2",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/wrapped-home.ts": "export const WRAPPED_AXIS = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/wrapped-respell.ts": "export interface M {\n  mode:\n    | 'a'\n    | 'b'\n    | 'c';\n}\n",
      },
      expect: { count: 1, token: "'a'" },
      why: "THE UNDERIVABLE-ANCHOR FALLBACK, and it is a row about a CATCH rather than about ergonomics: a union written across lines has no source slice the marker grammar can hold (`[^()\\r\\n]+`), so `firstAnchor` refuses and the report passes NO token — the RUNTIME then derives the first authored literal, `'a'`. The finding must still fire. Returning early on a missing anchor instead (the shape this row was written against) drops it silently, which is a catch loss wearing a position problem's clothes",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/showcase-home.ts": "export const SHOWCASE_AXIS = ['a', 'b', 'c'] as const;\n",
        "packages/showcase-plugins/src/plugin.ts": "export interface S { mode: 'a' | 'b' | 'c' }\n",
      },
      expect: { count: 1, token: "'a' | 'b' | 'c'" },
      why: "THE `@showcase` ROOT, pinned: `@authored` deliberately EXCLUDES `packages/showcase-plugins/src` (contract/population.ts) while the legacy `packages/*/src/**` glob covered it, so naming `@showcase` is the only thing that keeps the port lossless. Drop it from `in` and this row is the one that dies — the contracts home stays admitted, so the fixture still admits paths and the failure is a missing FINDING rather than an empty-population tool error",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/alias-home.ts": "export const ALIAS_AXIS = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/alias-respell.ts": "export type Reuse = 'a' | 'b' | 'c';\n",
      },
      expect: { count: 1, token: "Reuse" },
      why: "ONE SITE, ONE FINDING: an inline alias whose members ALSO match a homed tuple is arm A's subject and arm B must not claim it as well. `count: 1` with the ALIAS-NAME token is the discriminator — delete `axisRespellCandidate`'s type-alias-parent skip and this row reports 2 findings on one declaration, which (sharing a carrier and needing two different markers) is a site with no working waiver door",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/contracts/src/y.ts": "export type NodeEnv = 'development' | 'production';\n" },
      why: "THE ARM-A ≥3 FLOOR: a 2-member one-off alias with no canonical tuple anywhere. Drop the floor to 2 and this row is the one that dies",
    },
    {
      mode: "types",
      files: { "packages/contracts/src/env.ts": "export const schema = z.enum(['development', 'production', 'test']);\n" },
      why: "THE EXACT-SET PREDICATE, from arm B's other side: a `z.enum([...])` one-off (the NODE_ENV class) with NO matching canonical tuple in the tree is not a re-spell of anything. Arm B is a set-identity match, never a heuristic about literal arrays",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/sat-selfsource.ts":
          "export interface Cfg { mode: 'a' | 'b' | 'c'; n: number }\nexport const MODES = ['a', 'b', 'c'] as const satisfies readonly Cfg['mode'][];\n",
      },
      why: "THE CO-DECLARATION EXEMPTION: `Cfg['mode']` is the SOURCE the satisfies tuple derives from, not a re-spell of it — without the exemption the house-encouraged derive idiom flags ITSELF, and the fix the message asks for is the code already written. Delete the `coDeclarations` skip and this row reds",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/local-pair-home.ts": "export const LOCAL_PAIR = ['x', 'y'] as const;\n",
        "packages/server/src/local-pair-use.ts": "export interface Q { side: 'x' | 'y' }\n",
      },
      why: "THE DEFAULT ≥3 REGISTRATION FLOOR: the same 2-member tuple as `mustFlag[3]`, homed OUTSIDE contracts/kit, does NOT register — a coincidental generic pair is not an axis. Raise the trusted floor to 3 (or widen `TRUSTED_TUPLE_HOMES` to `packages/`) and this row is the one that dies",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/scope-home.ts": "export const SCOPES = ['always', 'keyword'] as const;\n",
        "packages/kit/src/engine.ts": "export function resolve(): 'always' | 'keyword' {\n  return 'always';\n}\n",
      },
      why: "THE CAKE REACH FENCE (the live `resolveEntryScope` case): a kit function returning a union matching a CONTRACTS-homed tuple cannot import it — `kit ← contracts` is one-directional — so flagging it would demand an illegal import. Fail `canReachAxisHome` open and this row reds",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/ui-axis-home.ts": "export const UI_AXIS = ['a', 'b', 'c'] as const;\n",
        "packages/ui/src/widget.ts": "export interface W { mode: 'a' | 'b' | 'c' }\n",
      },
      why: "THE D54 RANK-PEER EXCEPTION inside that fence: `ui` and `contracts` share import rank 1, so a rank comparison ALONE would flag this — but the sealed `ui` package deps `kit` ONLY, so the contracts tuple is unreachable from it. Delete the explicit `ui`/`contracts` clause and this row is the only one that dies",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/fence-home.ts": "export const FENCE_AXIS = ['a', 'b', 'c'] as const;\n",
        "tooling/src/verify/gates/example-policy.ts": "export interface F { mode: 'a' | 'b' | 'c' }\n",
      },
      why: "THE GATE-DIRECTORY SUBTRACTION, and it is load-bearing rather than cosmetic: every gate module's `mustFlag` fixtures re-spell axes BY DESIGN — this policy's own rows above are exactly that — so without `notUnder: ['tooling/src/verify/gates/**']` the corpus reports its own proof strings. The contracts home is the second admitted file the fence needs: delete the subtraction and this row reds with a finding rather than an empty-population tool error",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/call-home.ts": "export const CALL_AXIS = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/call-use.ts": "declare function pick(values: readonly string[]): void;\npick(['a', 'b', 'c']);\n",
      },
      why: "THE `.enum` CALLEE TEST: arm B's zenum sub-kind is about a SCHEMA vocabulary, not about array arguments. An ordinary call taking the same literal array is passing data, not re-declaring an axis, and there is nothing to derive. Accept any callee and this row reds",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/mixed.ts": "export const NUMBERS = [1, 2, 3] as const;\nexport type Mixed = 'a' | 'b' | 3;\n",
      },
      why: "STRING-ONLY, THE UNION SIDE: a union carrying a numeric member is not a string axis, so arm A's ≥3 count never reaches it and arm B never signs it. Accept a non-string union member and this row reds",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/number-home.ts": "export const CODES = [1, 2, 3] as const;\n",
        "packages/server/src/number-respell.ts": "export interface N { code: '1' | '2' | '3' }\n",
      },
      why: "STRING-ONLY, THE TUPLE SIDE, and it is the row that makes that fence falsifiable at all: a numeric `as const` tuple registers NO axis, so the string union `'1' | '2' | '3'` — whose members stringify to the same three lexemes — matches nothing. Accept a non-string tuple element (the reader would then read `1` as the member `\"1\"`) and the two sets collide and this row reds. Written and run for exactly that reason: the fence cut clean against every other row, and the discriminating fixture is what separates UNENFORCED from enforced",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/waived-alias.ts":
          "// @orb-waive no-inline-union-redecl(Mode): the proof's stand-in reason; ends when this fixture stops flagging.\nexport type Mode = 'a' | 'b' | 'c';\n",
      },
      why: "§4.2 POSITIONAL IDENTITY, ARM A: the twin of `mustFlag[0]` (count 1, so exactly one occurrence exists for the one marker to consume) plus the marker line. An author waives the ALIAS NAME — the exact slice `firstAnchor` anchors on — not the file and not the union text. The family test drives the same fixture through `runPolicyPass` for the two assertions a `mustPass` cannot make (`waivedFindings === 1`, `authorityAlarms === []`)",
    },
    {
      mode: "types",
      files: {
        "packages/contracts/src/waived-home.ts": "export const WAIVED_AXIS = ['a', 'b', 'c'] as const;\n",
        "packages/server/src/waived-respell.ts":
          "// @orb-waive no-inline-union-redecl('a' | 'b' | 'c'): the proof's stand-in reason; ends when this fixture stops flagging.\nexport interface T { mode: 'a' | 'b' | 'c' }\n",
      },
      why: "§4.2 POSITIONAL IDENTITY, ARM B: the twin of `mustFlag[1]`, and the arm whose position shape is unusual — the marker carries the SET's own source text, spacing included. The carrier is the interface STATEMENT (a node finding binds to leading trivia on the node or its ancestors up to the enclosing statement), which is why the marker sits above `export interface T` and not inside it",
    },
  ],
});
