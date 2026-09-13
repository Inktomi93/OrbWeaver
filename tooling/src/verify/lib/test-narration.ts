// Test narration is prose; template substitutions remain executable evidence.
import type { CallExpression } from "ts-morph";
import { Node } from "ts-morph";

const NARRATION_CALLEES = new Set(["test", "it", "describe", "suite", "bench"]);
const EXPECT_CALLEE = "expect";

/** The ROOT identifier of a (possibly chained) callee — `test.describe.serial` → `test`, `expect.soft` →
 *  `expect`. Modifier chains are how both runners spell every variant, so keying on the root covers
 *  `.skip`/`.only`/`.each`/`.step`/`.poll` without enumerating them. */
function rootCalleeName(call: CallExpression): string | undefined {
  let expr: Node = call.getExpression();
  while (Node.isPropertyAccessExpression(expr)) {
    expr = expr.getExpression();
  }
  return Node.isIdentifier(expr) ? expr.getText() : undefined;
}

/** Which argument of this call (if any) is authored PROSE about the test itself. */
function narrationArgIndex(call: CallExpression): number | undefined {
  const root = rootCalleeName(call);
  if (root === EXPECT_CALLEE) {
    return 1; // expect(actual, "message") — the soft-assert message both runners take.
  }
  return root !== undefined && NARRATION_CALLEES.has(root) ? 0 : undefined;
}

/** Read only the supplied call. Literal template chunks are narration; substitutions remain code.
 * This preserves #507's two-sided boundary: issue citations in titles pass, interpolated colors do not. */
export function testNarrationSpans(call: CallExpression): readonly { readonly pos: number; readonly end: number }[] {
  const index = narrationArgIndex(call);
  const arg = index === undefined ? undefined : call.getArguments()[index];
  if (arg === undefined) {
    return [];
  }
  if (Node.isStringLiteral(arg) || Node.isNoSubstitutionTemplateLiteral(arg)) {
    return [{ pos: arg.getStart(), end: arg.getEnd() }];
  }
  if (Node.isTemplateExpression(arg)) {
    const literals = [arg.getHead(), ...arg.getTemplateSpans().map((span) => span.getLiteral())];
    return literals.map((literal) => ({ pos: literal.getStart(), end: literal.getEnd() }));
  }
  return [];
}
