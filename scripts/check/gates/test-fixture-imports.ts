// Gate: test-fixture-imports (core/Spine-Testing.md §4)
// Fixture doctrine: A test imports { test, expect } from support/fixtures, never directly from vitest or @playwright/test.
// This ensures composed fixtures (db, frozen clock, etc.) are used.
// Exempt: e2e (own Playwright lane), support/ (the fixture itself), and .test-d.ts (a separate
// tsc-only typecheck project that never touches the runtime fixture — core/Spine-Testing.md §1).
import type { ImportDeclaration } from "ts-morph";
import type { Check, Violation } from "../harness.ts";

function checkImportDeclaration(importDecl: ImportDeclaration, filePath: string): Violation[] {
  const violations: Violation[] = [];
  const moduleName = importDecl.getModuleSpecifierValue();
  if (moduleName !== "vitest" && moduleName !== "@playwright/test") {
    return violations;
  }
  for (const namedImport of importDecl.getNamedImports()) {
    const name = namedImport.getName();
    if (name === "test" || name === "it" || name === "expect") {
      violations.push({
        file: filePath,
        line: importDecl.getStartLineNumber(),
        message: `Importing '${name}' directly from '${moduleName}' bypasses the composed fixture. Import from 'support/fixtures' instead (core/Spine-Testing.md §4).`,
      });
    }
  }
  return violations;
}

export const testFixtureImports: Check = {
  name: "test-fixture-imports",
  run: ({ project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const filePath = sf.getFilePath();
      if (
        !filePath.includes("/tests/") ||
        filePath.includes("/tests/e2e/") ||
        filePath.includes("/tests/support/") ||
        filePath.endsWith(".test-d.ts")
      ) {
        continue;
      }
      for (const importDecl of sf.getImportDeclarations()) {
        violations.push(...checkImportDeclaration(importDecl, filePath));
      }
    }
    return violations;
  },
};
