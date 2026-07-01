// Gate: providers-runner-seal (core/Tier-3b-Providers.md invariant #3) — the runner DERIVATION + VOCAB
// (`deriveRunner` / `backendForSource` / `BackendKey` / `BACKEND_KEYS`) are sealed INSIDE infra/providers
// and never leave it. They ARE legitimately reachable on the providers barrel — the role dispatchers and
// the `roles/dispatch.test.ts` self-test consume them, and the derivation is unit-tested directly. What
// the doctrine forbids is a PRODUCTION CONSUMER ABOVE infra reaching for them: a `domain` / `transport` /
// `entry` module that imports the runner key escapes the firewall (it could route around the sealed
// (api,source)→backend derivation). This is the doc's "grep for runner/family in domain/** → RED": no
// consumer above infra may import a sealed runner symbol. Intra-providers + tests are exempt.
import type { Check, Violation } from "../harness.ts";

const SEALED = new Set(["deriveRunner", "backendForSource", "BackendKey", "BACKEND_KEYS"]);
const CONSUMER = /\/packages\/server\/src\/(?:domain|transport|entry)\//u;

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const providersRunnerSeal: Check = {
  name: "providers-runner-seal",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!CONSUMER.test(path)) {
        continue;
      }
      for (const decl of sf.getImportDeclarations()) {
        for (const named of decl.getNamedImports()) {
          const name = named.getName();
          if (SEALED.has(name)) {
            violations.push({
              file: relPath(root, path),
              line: named.getStartLineNumber(),
              message: `'${name}' is sealed inside infra/providers (the runner derivation/vocab) — a domain/transport/entry module must not import it; route through the providers role surface, never the runner key (core/Tier-3b-Providers.md inv #3).`,
            });
          }
        }
      }
    }
    return violations;
  },
};
