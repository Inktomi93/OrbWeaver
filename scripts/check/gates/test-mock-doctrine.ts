// Gate: test-mock-doctrine (core/Spine-Testing.md §3)
// vi.mock is effectively banned for internal modules; its only legitimate use is an unavoidable third-party node edge.
// Fakes should be injected at the composition root.
import type { CallExpression } from "ts-morph";
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

function checkMockCall(call: CallExpression, filePath: string): Violation | null {
  const expr = call.getExpression();
  if (expr.getKind() !== SyntaxKind.PropertyAccessExpression || expr.getText() !== "vi.mock") {
    return null;
  }
  const arg0 = call.getArguments()[0];
  if (arg0?.getKind() !== SyntaxKind.StringLiteral) {
    return null;
  }
  const mockTarget = arg0.getText().replace(/['"]/gu, "");
  // Internal paths typically start with relative paths or package names
  if (!(mockTarget.startsWith(".") || mockTarget.startsWith("packages/"))) {
    return null;
  }
  return {
    file: filePath,
    line: call.getStartLineNumber(),
    message: `vi.mock on internal module '${mockTarget}'. Fake at the edges, inject at the root (core/Spine-Testing.md §3).`,
  };
}

export const testMockDoctrine: Check = {
  name: "test-mock-doctrine",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const filePath = sf.getFilePath();
      if (!filePath.includes("/tests/")) {
        continue;
      }
      for (const call of sf.getDescendantsOfKind(SyntaxKind.CallExpression)) {
        const violation = checkMockCall(call, filePath);
        if (violation) {
          violations.push(violation);
        }
      }
    }
    return violations;
  },
};
