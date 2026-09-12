// Gate: types-in-contract — each server domain contract/service.ts exports its typed service interface.
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
