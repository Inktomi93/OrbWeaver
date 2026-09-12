// Gate: types-in-contract — each server domain contract/service.ts exports its typed service interface.
//
// FAMILY: a declared SINGLETON under its own id. No sibling policy reads a domain's `contract/service.ts`
// export shape, and there is no shared `lib/` computation behind it.
// POPULATION PORT: BYTE-IDENTICAL. Legacy `scanRoot` was the regex
// `/\/packages\/server\/src\/domain\/[^/]+\/contract\/service\.ts$/u` over `/${p}`, which is exactly the
// `@server` root plus the `under` + `named` fences above.
// Re-derived 2026-09-12 by applying the legacy predicate and this declaration to the SAME 7,537-path
// compiler-source candidate set: 29 admitted on both sides, symmetric difference ZERO in both directions.
// LEGACY SHA: (b27a8950d^) — the conversion's parent.
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  "contract/service.ts must declare the exported <Feature>Service interface (the feature's typed API surface, Spine-TypeScript-and-Patterns.md §7.4).";

export const gate = defineGate({
  id: "types-in-contract",
  family: "types-in-contract",
  authority: "hard",
  severity: "error",
  population: { in: ["@server"], under: ["packages/server/src/domain/*/contract/service.ts"], named: ["service.ts"] },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: "declare the exported `<Feature>Service` interface in contract/service.ts (the feature's typed API surface).",
  create: (ctx) => ({
    visitFile: (sourceFile) => {
      if (!sourceFile.getInterfaces().some((declaration) => declaration.isExported())) {
        ctx.report.file(ctx.relativePath(sourceFile), { line: 1, column: 1 });
      }
    },
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/contract/service.ts": "export const noInterface = 1;\n" },
      expect: { count: 1, line: 1 },
      why: "a contract/service.ts with no exported interface is missing its typed API surface",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: { "packages/server/src/domain/hub/contract/service.ts": "export interface HubService { list(): void }\n" },
      why: "the service contract exports its interface",
    },
  ],
});
