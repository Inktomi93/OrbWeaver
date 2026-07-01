import type { FunctionDeclaration } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

function checkFactoryFunction(func: FunctionDeclaration, filePath: string): Violation | null {
  const name = func.getName() ?? "";
  if (name.startsWith("make")) {
    const hasDb = func
      .getParameters()
      .some((p) => p.getName() === "db" || p.getType().getText().includes("Database"));
    if (hasDb) {
      return {
        file: filePath,
        line: func.getStartLineNumber(),
        message: `Factory pure builder '${name}' must not accept a database parameter (core/Spine-Testing.md §4).`,
      };
    }
    return null;
  }
  if (name.startsWith("seed")) {
    const hasDb = func.getParameters().some((p) => p.getName() === "db");
    if (!hasDb) {
      return {
        file: filePath,
        line: func.getStartLineNumber(),
        message: `Factory persisted builder '${name}' must accept a 'db' parameter (core/Spine-Testing.md §4).`,
      };
    }
  }
  return null;
}

export const testFactoryContract: Check = {
  name: "test-factory-contract",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const filePath = sf.getFilePath();
      if (!filePath.includes("/tests/support/factories/")) {
        continue;
      }
      for (const func of sf.getFunctions()) {
        if (!func.isExported()) {
          continue;
        }
        const violation = checkFactoryFunction(func, filePath);
        if (violation) {
          violations.push(violation);
        }
      }
    }
    return violations;
  },
};
