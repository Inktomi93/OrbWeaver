// Gate: types-in-contract (core/Core-0-Architecture-and-Structure.md §7.4) — a feature's contract/service.ts is the typed API
// surface and MUST declare the exported <Feature>Service interface (read it to know everything the
// feature does). Lenient: only fires once a feature HAS a contract/service.ts (skips features not yet
// built). The "no exported types OUTSIDE contract/" half is the no-inline-types grit; this is the
// "service.ts interface always present" half. Object shapes are interfaces (biome
// useConsistentTypeDefinitions:interface) — this gate ensures the service interface actually exists.
import type { GateDescriptor } from "../contract.ts";

const SERVICE_RE = /\/packages\/server\/src\/domain\/[^/]+\/contract\/service\.ts$/u;

const SERVICE_MESSAGE =
  "contract/service.ts must declare the exported <Feature>Service interface (the feature's typed API surface, Spine-TypeScript-and-Patterns.md §7.4).";

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

// ── SINGLE-PASS CONTRACT FORM (§1.2, §8.1 batch (b) — a FILE-LEVEL presence gate via visitFile) ────
// The legacy predicate as a per-file hook (no node subscription — the finding is FILE-LEVEL, line 0, no
// AST anchor): a contract/service.ts with no exported interface. scanRoot mirrors the legacy SERVICE_RE.
// This is the visitFile exemplar — a whole-file presence assertion, not a per-node predicate. Kept
// ALONGSIDE the legacy Check.
export const gate: GateDescriptor = {
  name: "types-in-contract",
  docRow: "core/Core-0-Architecture-and-Structure.md §7.4",
  status: "active",
  scopeSafety: "incremental-safe",
  message: SERVICE_MESSAGE,
  fix: "declare the exported `<Feature>Service` interface in contract/service.ts (the feature's typed API surface).",
  scanRoot: (p) => SERVICE_RE.test(`/${p}`),
  visitFile: (sf, ctx) => {
    if (sf.getInterfaces().some((i) => i.isExported())) {
      return;
    }
    ctx.report({
      file: relPath(ctx.root, sf.getFilePath()),
      line: 0,
      column: 0,
      message: SERVICE_MESSAGE,
    });
  },
  mustFlag: [
    {
      files: "export const noInterface = 1;\n",
      at: "packages/server/src/domain/hub/contract/service.ts",
      why: "a contract/service.ts with no exported interface — the typed API surface is missing (§7.4)",
    },
  ],
  mustPass: [
    {
      files: "export interface HubService { list(): void }\n",
      at: "packages/server/src/domain/hub/contract/service.ts",
      why: "the service.ts declares its exported <Feature>Service interface — present, passes",
    },
  ],
};
