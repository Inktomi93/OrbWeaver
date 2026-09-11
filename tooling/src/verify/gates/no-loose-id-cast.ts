// Reject casts that erase type checking or launder a value directly into a canonical id brand.
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
  fix: "use `castId<T>(raw)` only at the seam that owns an already-valid id, or validate with the canonical schema; remove broad cast laundering.",
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
      expect: { count: 1, messageIncludes: "bypasses branded-id" },
      why: "a double cast into a canonical id brand launders an unchecked value",
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
