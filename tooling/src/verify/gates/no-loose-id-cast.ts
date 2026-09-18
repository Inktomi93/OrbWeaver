// Reject casts that erase type checking or launder a value directly into a canonical id brand.
//
// NO #944 THIRD ANSWER EXISTS HERE, audited #2041 — recorded rather than faked. Both arms are decided
// without a reference-origin reader, so there is no refusal to classify: `as never` is pure syntax, and the
// brand arm asks the CHECKER for the target type's `[brand]` property, which answers "this type does not
// carry the canonical brand" and never "I could not read this type". The construction attempted was
// `value as unknown as Missing` with `Missing` unimported: the checker hands back an error type, whose
// property list is empty, and that is literally indistinguishable from every legitimate non-brand target
// (`as unknown as string`, `as unknown as Row`) — so a fail-closed arm here would accuse the whole
// population rather than the unreadable subset. The identity is held by tsc, one tier up the enforcement
// ladder, not by a shared origin reader. Its family siblings (`no-mint-via-cast`, `no-fake-disabled-id`,
// `no-raw-id`) DO resolve origins and each carries the arm with a `messageIncludes` row.
//
// FAMILY (`id-brand-flow`): the shared reader is `lib/id-brand.ts` (`canonicalIdBrand`, the checker-backed
// brand-property test, shared with `brand-in-name-position`). No private reader, table or walk — the `as
// never` arm is pure syntax off the visited node.
//
// POPULATION PORT: an intentional NARROWING, the same one its two cast siblings took in the same commit. The
// legacy descriptor (`1ee6bb982^:tooling/src/verify/gates/no-loose-id-cast.ts`) SUBTRACTED rather than
// selected — `scanRoot: (p) => !(p.includes("tests/") || p.includes("tools/") || p.includes("scripts/") ||
// TEST_FILE_REGEX.test(p))` — so it also judged `tooling/src`, which `@packages` does not. The surviving half
// of that subtraction is stated positively by the `tests are outside this policy population` mustPass row.
// SUPERSEDED 2026-09-13 (lane cb-b-header-residue), the text above kept: "an intentional NARROWING" states one
// direction of a port that moves in BOTH. Measured over the harness candidates at `1ee6bb982^`: legacy − final = 986
// `tooling/src` paths plus `packages/showcase-plugins/src/index.ts` (the narrowing stated), and final − legacy = 13
// production server files the legacy SUBSTRING subtraction wrongly excluded — `domain/regex/verbs/scripts/*` (10,
// matched `scripts/`) and `domain/rpg/tools/*` (3, matched `tools/`). That widening was unrecorded; it repairs a
// legacy blind spot.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-loose-id-cast` descriptor at d10462449bb3b00307033eece47312f45455ca74, the parent of the conversion `1ee6bb982`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,132 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 4,324
// and final `population` admits 3,350. legacy − final = 987 — `tooling/src/**` (986), which the legacy SUBTRACTING
// `scanRoot` admitted and `@packages` does not, plus the showcase file; the recorded narrowing. final − legacy = 13
// production server files the legacy substring subtraction WRONGLY excluded — `domain/regex/verbs/scripts/*` (10,
// matched `scripts/`) and `domain/rpg/tools/*` (3, matched `tools/`); an UNRECORDED widening that repairs a legacy
// blind spot. Controls: inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both;
// outside `scripts/codemods/__cbbhr_out_rename-roster-participants.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { canonicalIdBrand, ID_BRAND_HOME } from "../lib/id-brand.ts";
import { waivableCoordinate } from "../lib/waivable-coordinate.ts";
import { idBrandProofModule } from "./_proof/id-brand.ts";

const MESSAGE =
  "a cast bypasses branded-id type safety with `as never` or `as unknown as <canonical brand>` — use the owning mint/parser/cast seam. (tooling/src/verify/gates/GATE-AUTHORING.md)";
/** Parentheses are transparent to the arm's semantic question. Keep this separate from `castAnchor`:
 *  detection needs the inner AsExpression, while the authored coordinate deliberately varies with where
 *  the author put parentheses. */
function unwrapParentheses(expression: Node): Node {
  let current = expression;
  while (Node.isParenthesizedExpression(current)) {
    current = current.getExpression();
  }
  return current;
}

/** THE ANCHOR for a cast's operand (#2197, #2325). A PARENTHESIZED operand's own text starts with `(`, so
 *  `waivableCoordinate` finds no leading paren-free head, returns `undefined`, and the report door refuses
 *  the finding as permanently unwaivable (#2107) — a refusal that withholds the WHOLE policy, not just the
 *  one finding. Unwrapping reaches the expression the reader actually means, whose head is nameable. The
 *  violation, its arm and its severity are unchanged; only the COORDINATE moves. Recursive because `((x))`
 *  is legal. The #2325 extension reaches that same wrapper through exactly one authored cast layer when
 *  the cast's operand is parenthesized (`("" as const) as unknown`); it does not generally unwrap casts,
 *  because the ordinary double-cast coordinate is deliberately the full `value as unknown` expression.
 *
 *  DECLARED LIMIT: this does not make every operand nameable, and it must not pretend to. An unwrapped
 *  expression whose own text still begins with `(` — a zero-arg arrow `() => x`, a parenthesized call
 *  receiver — has no leading paren-free slice either, and such a finding still refuses LOUDLY at the door.
 *  That is the correct outcome (a finding nobody can name is the defect #2107 exists to surface), and the
 *  fallback below deliberately hands the raw text back so the door refuses rather than silently dropping it. */
function castAnchor(expression: Node): Node {
  let current = unwrapParentheses(expression);
  // Preserve the ordinary double-cast coordinate (`value as unknown`). Descend through an inner cast
  // only when its OPERAND is parenthesized: that wrapper is what makes the otherwise nameable carrier
  // start with `(`, while the type assertion itself remains part of the reported authored value.
  if (Node.isAsExpression(current) && Node.isParenthesizedExpression(current.getExpression())) {
    current = current.getExpression();
    while (Node.isParenthesizedExpression(current)) {
      current = current.getExpression();
    }
  }
  return current;
}

export const gate = defineGate({
  id: "no-loose-id-cast",
  family: "id-brand-flow",
  authority: "ordinary",
  severity: "error",
  population: "@packages",
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix:
    "use `castId<T>(raw)` only at the seam that owns an already-valid id, or validate with the canonical " +
    "schema; remove broad cast laundering. A deliberate site is waived with `@orb-waive " +
    "no-loose-id-cast(<position>): <reason>` on the line above, where <position> is the cast expression's " +
    "own text (the value being cast).",
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.AsExpression],
        visit: (node) => {
          if (!Node.isAsExpression(node)) {
            return;
          }
          const expression = node.getExpression();
          const anchor = castAnchor(expression);
          const raw = anchor.getText().trim();
          // `?? raw` is the REFUSAL path, not a fallback that hides one: an operand with no anchorable head
          // hands the raw text to the door, which refuses it loudly (#2107). Dropping the finding here would
          // trade a visible tool error for a silent blind spot.
          const token = waivableCoordinate(raw) ?? raw;
          if (node.getTypeNode()?.isKind(SyntaxKind.NeverKeyword) === true) {
            ctx.report.node(anchor, { token, offset: 0 });
            return;
          }
          const semanticExpression = unwrapParentheses(expression);
          const inner = Node.isAsExpression(semanticExpression) && semanticExpression.getTypeNode()?.isKind(SyntaxKind.UnknownKeyword) === true;
          const target = node.getTypeNode();
          if (inner && target !== undefined && canonicalIdBrand(ctx.checker().getTypeAtLocation(target), target, ctx.checker()) !== null) {
            ctx.report.node(anchor, { token, offset: 0 });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/x.ts": "export const x = value as never;\n" },
      expect: { count: 1, token: "value" },
      why: "as never disables every assignability check",
    },
    {
      mode: "types",
      files: { "packages/server/src/x.ts": "export const x = (async () => value) as never;\n" },
      expect: { count: 1, token: "async " },
      why: "A PARENTHESIZED OPERAND IS STILL NAMEABLE (#2197). Reported on the UNWRAPPED arrow, so the coordinate is its leading paren-free slice `async ` rather than the parenthesized text, which starts with `(` and would be refused as permanently unwaivable (#2107) — withholding the whole policy. That is not hypothetical: `check-gates.repo.int`'s `__g_vpcr` fixture, planted for a DIFFERENT gate (retired 2026-09-13 with that gate's conversion; these bytes survive only here), was `(async (a: never) => await loadCanonHistory(a, a)) as never`, and it took the barrier's planter to a tool-error exit 2 with this policy reporting zero violations. This row pins the anchor so the paren-leading coordinate cannot come back unnoticed",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts": 'import type { UserId } from "../../kit/src/ids/index";\nexport const x = value as unknown as UserId;\n',
      },
      expect: { count: 1, token: "value as unknown" },
      why: 'a double cast into a canonical id brand launders an unchecked value. THE TOKEN IS NOT THE ONE A READER GUESSES (#1968): the report anchors on the OUTER cast\'s operand, which is the whole inner `value as unknown` slice, so `token: "value"` — the position `mustFlag[0]` reports and the one the waiver row waives — is RED here. Naming it settles which position an author must spell on a double cast, and the two rows together prove the anchor differs between the arms',
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts": 'import type { UserId } from "../../kit/src/ids/index";\nexport const x = ("" as const) as unknown as UserId;\n',
      },
      expect: { count: 1, token: '"" as const' },
      why: "A parenthesized const assertion is a transparent spelling of the branded double cast. Its coordinate must be the nameable authored const-asserted operand, never the paren-leading inner `as unknown` expression that the report door refuses.",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts": 'import type { UserId } from "../../kit/src/ids/index";\nexport const x = (value as unknown) as UserId;\n',
      },
      expect: { count: 1, token: "value as unknown" },
      why: "Parentheses around the complete inner `as unknown` cast are semantically transparent. Removing them for detection and coordinate selection must retain the established full inner-cast token.",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts": 'import type { UserId } from "../../kit/src/ids/index";\nexport const x = ((value) as unknown) as UserId;\n',
      },
      expect: { count: 1, token: "value" },
      why: "When the inner cast's own operand is parenthesized, the semantic laundering pair still reports and the authored coordinate descends to the nameable value rather than minting a paren-leading token.",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts": 'import type { UserId } from "../../kit/src/ids/index";\nexport const x = (value as unknown as UserId) satisfies UserId;\n',
      },
      expect: { count: 1, token: "value as unknown" },
      why: "A `satisfies` wrapper around the completed double cast does not change the cast carrier or its established coordinate.",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: { "packages/server/src/x.ts": "export const x = castId<UserId>(value);\n" },
      why: "the explicit helper is not a broad TypeScript cast",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts": 'import type { UserId } from "../../kit/src/ids/index";\nexport const x = value as UserId;\n',
      },
      why: "§4.1 NARROWING (THE INNER `as unknown`): a SINGLE cast straight into a canonical brand passes, and that is deliberate rather than an oversight — tsc still checks assignability there, so the cast can only narrow a value the compiler already believes is string-shaped. It is the `as unknown as` double that erases every check, which is why the ban names the pair. Before #2047 the requirement was unpinned: forcing `inner` true left every row green and the policy would have flagged this row's ordinary shape",
    },
    {
      mode: "types",
      files: { "packages/server/src/x.ts": "export const x = value as unknown as string;\n" },
      why: "§4.1 NARROWING (THE TARGET IS A CANONICAL BRAND): `canonicalIdBrand(...) !== null`. A double cast to a NON-brand target is somebody else's policy — this one is about branded-id safety, and widening it to every `as unknown as` would make it a general cast ban under an id-brand name. This is also where the module's declared absence of a third answer bites: the checker answers `no canonical brand here` for this target exactly as it would for an unreadable one, which is why a fail-closed arm would accuse this row",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts": 'import type { UserId } from "../../kit/src/ids/index";\nexport const x = (value as UserId) satisfies UserId;\n',
      },
      why: "A `satisfies` wrapper does not turn the deliberately accepted single branded cast into the laundering pair this policy owns.",
    },
    {
      mode: "types",
      files: { "packages/server/src/clean.ts": "export const clean = true;\n", "tests/server/x.test.ts": "export const x = value as never;\n" },
      why: "tests are outside this policy population",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/x.ts":
          "// @orb-waive no-loose-id-cast(value): the proof's stand-in reason; ends when this fixture stops flagging.\nexport const x = value as never;\n",
      },
      why: "POSITIONAL IDENTITY: the report anchors on the cast OPERAND and its token is that operand's own text (`value`), so an author waives the operand, never the `as never` clause. The fixture is mustFlag[0] (:44) plus the marker line; the marker suppresses the finding that row proves this fixture produces, and it ends if that row changes",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts":
          'import type { UserId } from "../../kit/src/ids/index";\n// @orb-waive no-loose-id-cast("" as const): the proof reason; ends when the parenthesized carrier stops flagging.\nexport const x = ("" as const) as unknown as UserId;\n',
      },
      why: 'The repaired coordinate is not only syntactically valid: the ordinary waiver engine binds the exact `"" as const` token and suppresses this one parenthesized double-cast finding without changing the established unparenthesized identity.',
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts":
          'import type { UserId } from "../../kit/src/ids/index";\n// @orb-waive no-loose-id-cast(value as unknown): the proof reason; ends when the wrapped inner cast stops flagging.\nexport const x = (value as unknown) as UserId;\n',
      },
      why: "The full-inner-cast coordinate survives an authored parenthesis around it and binds the same ordinary waiver identity as the unparenthesized spelling.",
    },
    {
      mode: "types",
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts":
          'import type { UserId } from "../../kit/src/ids/index";\n// @orb-waive no-loose-id-cast(value): the proof reason; ends when the wrapped value stops flagging.\nexport const x = ((value) as unknown) as UserId;\n',
      },
      why: "The nested-parenthesis spelling binds only its exact value coordinate, proving coordinate selection stays distinct from the normalized inner cast used for detection.",
    },
  ],
  mustRefuse: [
    {
      mode: "types",
      files: { "packages/server/src/x.ts": "declare const value: string;\nexport const x = (() => value) as never;\n" },
      expect: { messageIncludes: "cannot be named by an @orb-waive marker" },
      why: "The bounded anchor repair does not pretend every paren-leading operand is nameable. After the authored parentheses are removed, a zero-argument arrow still begins with `(` and the report door must refuse it loudly rather than drop an unwaivable finding.",
    },
  ],
});
