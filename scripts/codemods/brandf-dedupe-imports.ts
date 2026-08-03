#!/usr/bin/env tsx
// BRAND-F sweep follow-up: kit addNamedImport merges a `type X` specifier into the VALUE import
// declaration without checking the file's separate `import type { X }` declaration for the same
// module — TS2300 duplicate identifiers in ~20 test files. This removes the inline `type X` specifier
// from a value import of @orb/kit/ids whenever a type-only import declaration of the same module in
// the same file already names X. One-shot; delete after the sweep lands.
import type { Plan } from "./codemod-kit.ts";
import { runCodemod } from "./codemod-kit.ts";

const IDS_MODULE = "@orb/kit/ids";

await runCodemod("brandf-dedupe-imports", (ctx) => {
  for (const sf of ctx.project.getSourceFiles()) {
    if (!sf.getFilePath().includes("/tests/")) {
      continue;
    }
    const typeOnlyNames = new Set<string>();
    for (const decl of sf.getImportDeclarations()) {
      if (decl.getModuleSpecifierValue() === IDS_MODULE && decl.isTypeOnly()) {
        for (const spec of decl.getNamedImports()) {
          typeOnlyNames.add(spec.getName());
        }
      }
    }
    if (typeOnlyNames.size === 0) {
      continue;
    }
    const valueDecl = sf.getImportDeclaration((d) => d.getModuleSpecifierValue() === IDS_MODULE && !d.isTypeOnly());
    if (valueDecl === undefined) {
      continue;
    }
    const dupes = valueDecl.getNamedImports().filter((spec) => spec.isTypeOnly() && typeOnlyNames.has(spec.getName()));
    if (dupes.length === 0) {
      continue;
    }
    const names = dupes.map((d) => d.getName());
    const plan: Plan = {
      description: `dedupe { ${names.join(", ")} } in ${sf.getBaseName()}`,
      touchedFiles: [sf.getFilePath()],
      transform(): void {
        for (const spec of dupes) {
          spec.remove();
        }
      },
    };
    ctx.plan(plan);
  }
});
