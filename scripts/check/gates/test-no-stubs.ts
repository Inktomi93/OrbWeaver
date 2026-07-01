// Gate: test-no-stubs (anti-gaming for test-presence)
// A test block must contain at least one assertion (expect or expectTypeOf).
// Empty tests or tests with no assertions are banned to prevent gaming the presence rules.
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

export const testNoStubs: Check = {
  name: "test-no-stubs",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      if (!sf.getFilePath().includes("/tests/")) {
        continue;
      }
      
      const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of calls) {
        const expr = call.getExpression();
        const exprText = expr.getText();
        if (exprText === "test" || exprText === "it" || exprText === "test.skip" || exprText === "it.skip") {
          // Check if there are any expect or expectTypeOf calls inside this test block
          const hasExpect = call.getDescendantsOfKind(SyntaxKind.CallExpression).some(c => {
            const innerExprText = c.getExpression().getText();
            return innerExprText === "expect" || innerExprText === "expectTypeOf" || innerExprText.startsWith("expect.");
          });
          
          if (!hasExpect) {
            // Find the test name if available
            let testName = "unnamed test";
            const args = call.getArguments();
            if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
              testName = args[0].getText();
            }
            violations.push({
              file: sf.getFilePath(),
              line: call.getStartLineNumber(),
              message: "stub test '" + testName + "' contains no assertions (expect/expectTypeOf). Tests must assert behavior, not just satisfy presence rules.",
            });
          }
        }
      }
    }
    return violations;
  },
};
