// Gate: no-loose-id-cast (Spine-TypeScript-and-Patterns.md §4) — `as never` (and `as unknown as XId`)
// launders a value past every type check. TOKEN-ANCHORED on the cast's EXPRESSION text: one call can carry
// two casts (`setFieldValue(name as never, value as never)`), and GATE-AUTHORING §4.3a requires a nameable
// position there or one `@orb-gate-ignore` silently absolves the sibling nobody reasoned about. A MARKER
// GRAMMAR THAT NAMES POSITIONS REQUIRES EVERY GATE IT GOVERNS TO EMIT POSITIONS: while this gate reported
// node-anchored with no `token`, §4.3a here was not merely unenforced but UNSATISFIABLE — you cannot ask an
// author to name a position the report cannot express. Additive: an unpositioned marker still matches any
// token, so pre-existing suppressions are untouched.
// DECLARED LIMIT: two casts of the SAME expression text on one line share a position name, so one marker
// covers both — a shape that does not occur (and would be dead code if it did).
import { Node, SyntaxKind } from "ts-morph";
import type { GateDescriptor } from "../contract.ts";

const ID_REGEX = /^[A-Z][A-Za-z0-9]*Id$/u;
const TEST_FILE_REGEX = /\.(test|spec)\.tsx?$/u;

export const gate: GateDescriptor = {
  name: "no-loose-id-cast",
  docRow: "Spine-TypeScript-and-Patterns.md §4",
  status: "active",
  scopeSafety: "incremental-safe",
  message:
    "`as never` launders a value past ALL type checks. For a branded-ID parameter use the typed helper from @orb/kit/ids (castId / brandedId / parseId). For a genuine ORM/library escape, suppress WITH a reason. See Spine-TypeScript-and-Patterns.md.",
  scanRoot: (p) => !(p.includes("tests/") || p.includes("tools/") || p.includes("scripts/") || TEST_FILE_REGEX.test(p)),
  kinds: [SyntaxKind.AsExpression],
  visit(node, _sf, ctx): void {
    if (!Node.isAsExpression(node)) {
      return;
    }

    const typeNode = node.getTypeNode();
    if (!typeNode) {
      return;
    }
    const typeText = typeNode.getText().trim();
    const expr = node.getExpression();
    // The §4.3a position name: the cast's own expression text, so two casts in one call are separately
    // nameable (`no-loose-id-cast(name)` vs `no-loose-id-cast(value)`).
    const at = { token: expr.getText().trim(), offset: 0 };

    if (typeText === "never") {
      ctx.report(node, at);
      return;
    }

    // `expr as unknown as XId` parses as an AsExpression whose EXPRESSION is the inner `as unknown` —
    // the double-cast laundering route, matched on the outer branded type + the inner `unknown`.
    if (ID_REGEX.test(typeText) && Node.isAsExpression(expr) && expr.getTypeNode()?.getText().trim() === "unknown") {
      ctx.report(node, at);
    }
  },
  mustFlag: [
    {
      why: "as never",
      files: `
        const x = y as never;
      `,
    },
    {
      why: "as unknown as SomethingId",
      files: `
        const x = y as unknown as UserId;
      `,
    },
  ],
  mustPass: [
    {
      why: "castId helper",
      files: `
        const x = castId<UserId>(y);
      `,
    },
    {
      why: "as never in test file",
      files: {
        "src/foo.test.ts": "const x = y as never;",
      },
    },
  ],
};
