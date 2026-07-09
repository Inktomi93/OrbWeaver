// Gate: test-no-stubs (anti-gaming for test-presence)
// A test block must contain at least one assertion (expect or expectTypeOf).
// Empty tests or tests with no assertions are banned to prevent gaming the presence rules.
import type { CallExpression } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

const TEST_CALL_NAMES = new Set(["test", "it", "test.skip", "it.skip"]);

function callHasAssertion(call: CallExpression): boolean {
  return call.getDescendantsOfKind(SyntaxKind.CallExpression).some((c) => {
    // Collapse whitespace: a formatter-broken chain (`expect\n  .poll(...)`) must still read as `expect.poll`.
    const innerExprText = c.getExpression().getText().replaceAll(/\s+/gu, "");
    return (
      innerExprText === "expect" ||
      innerExprText === "expectTypeOf" ||
      innerExprText.startsWith("expect.")
    );
  });
}

function checkTestCall(call: CallExpression, filePath: string): Violation | null {
  const exprText = call.getExpression().getText();
  if (!TEST_CALL_NAMES.has(exprText) || callHasAssertion(call)) {
    return null;
  }
  let testName = "unnamed test";
  const arg0 = call.getArguments()[0];
  if (arg0?.getKind() === SyntaxKind.StringLiteral) {
    testName = arg0.getText();
  }
  return {
    file: filePath,
    line: call.getStartLineNumber(),
    message: `stub test '${testName}' contains no assertions (expect/expectTypeOf). Tests must assert behavior, not just satisfy presence rules (Spine-Testing.md §5).`,
  };
}

export const testNoStubs: Check = {
  name: "test-no-stubs",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const filePath = sf.getFilePath();
      if (!filePath.includes("/tests/")) {
        continue;
      }
      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const violation = checkTestCall(call, filePath);
        if (violation) {
          violations.push(violation);
        }
      }
    }
    return violations;
  },
};
