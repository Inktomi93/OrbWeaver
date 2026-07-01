// Gate: test-fixture-imports (core/Spine-Testing.md §4)
// Fixture doctrine: A test imports { test, expect } from support/test, never directly from vitest or @playwright/test.
// This ensures composed fixtures (db, frozen clock, etc.) are used.
import type { Check, Violation } from "../harness.ts";

export const testFixtureImports: Check = {
  name: "test-fixture-imports",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const filePath = sf.getFilePath();
      // Exempt e2e, support/test.ts itself, and ct-providers etc if they need it, but generally tests should use support/test
      if (!filePath.includes("/tests/") || filePath.includes("/tests/e2e/") || filePath.includes("/tests/support/")) {
        continue;
      }

      for (const importDecl of sf.getImportDeclarations()) {
        const moduleName = importDecl.getModuleSpecifierValue();
        if (moduleName === "vitest" || moduleName === "@playwright/test") {
          for (const namedImport of importDecl.getNamedImports()) {
            const name = namedImport.getName();
            if (name === "test" || name === "it" || name === "expect") {
              violations.push({
                file: filePath,
                line: importDecl.getStartLineNumber(),
                message: `Importing '${name}' directly from '${moduleName}' bypasses the composed fixture. Import from 'support/test' instead (core/Spine-Testing.md §4).`,
              });
            }
          }
        }
      }
    }
    return violations;
  },
};
