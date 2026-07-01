// Gate: test-mock-doctrine (core/Spine-Testing.md §3)
// vi.mock is effectively banned for internal modules; its only legitimate use is an unavoidable third-party node edge.
// Fakes should be injected at the composition root.
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

export const testMockDoctrine: Check = {
  name: "test-mock-doctrine",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      if (!sf.getFilePath().includes("/tests/")) {
        continue;
      }
      
      const calls = sf.getDescendantsOfKind(SyntaxKind.CallExpression);
      for (const call of calls) {
        const expr = call.getExpression();
        if (expr.getKind() === SyntaxKind.PropertyAccessExpression && expr.getText() === "vi.mock") {
          const args = call.getArguments();
          if (args.length > 0 && args[0].getKind() === SyntaxKind.StringLiteral) {
            const mockTarget = args[0].getText().replace(/['"]/g, "");
            // Internal paths typically start with relative paths or package names
            if (mockTarget.startsWith(".") || mockTarget.startsWith("packages/")) {
              violations.push({
                file: sf.getFilePath(),
                line: call.getStartLineNumber(),
                message: `vi.mock on internal module '${mockTarget}'. Fake at the edges, inject at the root (core/Spine-Testing.md §3).`,
              });
            }
          }
        }
      }
    }
    return violations;
  },
};
