// Gate: types-in-contract (structure.md §7.4) — a feature's contract/service.ts is the typed API
// surface and MUST declare the exported <Feature>Service interface (read it to know everything the
// feature does). Lenient: only fires once a feature HAS a contract/service.ts (skips features not yet
// built). The "no exported types OUTSIDE contract/" half is the no-inline-types grit; this is the
// "service.ts interface always present" half. Object shapes are interfaces (biome
// useConsistentTypeDefinitions:interface) — this gate ensures the service interface actually exists.
import type { Check, Violation } from "../harness.ts";

const SERVICE_RE = /\/packages\/server\/src\/domain\/[^/]+\/contract\/service\.ts$/;

function relPath(root: string, abs: string): string {
  return abs.startsWith(root) ? abs.slice(root.length + 1) : abs;
}

export const typesInContract: Check = {
  name: "types-in-contract",
  run: ({ root, project }): Violation[] => {
    const violations: Violation[] = [];
    for (const sf of project.getSourceFiles()) {
      const path = sf.getFilePath();
      if (!SERVICE_RE.test(path)) {
        continue;
      }
      const exportedInterfaces = sf.getInterfaces().filter((i) => i.isExported());
      if (exportedInterfaces.length === 0) {
        violations.push({
          file: relPath(root, path),
          line: 0,
          message:
            "contract/service.ts must declare the exported <Feature>Service interface (the feature's typed API surface, §7.4).",
        });
      }
    }
    return violations;
  },
};
