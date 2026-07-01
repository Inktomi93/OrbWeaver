// Gate: test-factory-contract (core/Spine-Testing.md §4)
// makeX must be a pure builder (no db access), seedX must be the persisted variant (takes db).
// Factories live only in support/factories/.
import { SyntaxKind } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

export const testFactoryContract: Check = {
  name: "test-factory-contract",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const filePath = sf.getFilePath();
      if (!filePath.includes("/tests/support/factories/")) {
        continue;
      }

      const funcs = sf.getFunctions();
      for (const func of funcs) {
        if (!func.isExported()) continue;
        
        const name = func.getName() ?? "";
        if (name.startsWith("make")) {
          // makeX should not have a 'db' parameter
          const hasDb = func.getParameters().some(p => p.getName() === "db" || p.getType().getText().includes("Database"));
          if (hasDb) {
            violations.push({
              file: filePath,
              line: func.getStartLineNumber(),
              message: `Factory pure builder '${name}' must not accept a database parameter (core/Spine-Testing.md §4).`,
            });
          }
        } else if (name.startsWith("seed")) {
          // seedX must have a 'db' parameter
          const hasDb = func.getParameters().some(p => p.getName() === "db");
          if (!hasDb) {
            violations.push({
              file: filePath,
              line: func.getStartLineNumber(),
              message: `Factory persisted builder '${name}' must accept a 'db' parameter (core/Spine-Testing.md §4).`,
            });
          }
        }
      }
    }
    return violations;
  },
};
