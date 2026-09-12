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
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { canonicalIdBrand, ID_BRAND_HOME } from "../lib/id-brand.ts";
import { idBrandProofModule } from "./_proof/id-brand.ts";

const MESSAGE = "a cast bypasses branded-id type safety with `as never` or `as unknown as <canonical brand>` — use the owning mint/parser/cast seam.";
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
          const token = expression.getText().trim();
          if (node.getTypeNode()?.isKind(SyntaxKind.NeverKeyword) === true) {
            ctx.report.node(expression, { token, offset: 0 });
            return;
          }
          const inner = Node.isAsExpression(expression) && expression.getTypeNode()?.isKind(SyntaxKind.UnknownKeyword) === true;
          const target = node.getTypeNode();
          if (inner && target !== undefined && canonicalIdBrand(ctx.checker().getTypeAtLocation(target), target, ctx.checker()) !== null) {
            ctx.report.node(expression, { token, offset: 0 });
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
      files: {
        [ID_BRAND_HOME]: idBrandProofModule('export type UserId = Branded<"UserId">;\n'),
        "packages/server/src/x.ts": 'import type { UserId } from "../../kit/src/ids/index";\nexport const x = value as unknown as UserId;\n',
      },
      expect: { count: 1, token: "value as unknown" },
      why: 'a double cast into a canonical id brand launders an unchecked value. THE TOKEN IS NOT THE ONE A READER GUESSES (#1968): the report anchors on the OUTER cast\'s operand, which is the whole inner `value as unknown` slice, so `token: "value"` — the position `mustFlag[0]` reports and the one the waiver row waives — is RED here. Naming it settles which position an author must spell on a double cast, and the two rows together prove the anchor differs between the arms',
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
  ],
});
