// Gate: feature-structure (structure.md §7) — every domain feature follows the per-feature template.
// Requires the universal slots: index.ts (front door), service.ts (composition root), context.ts
// (DI bundle), and contract/ + verbs/ dirs. persistence/ and substrate/ are per-feature (export has
// no persistence/; chat/workloads have no substrate/), so they are NOT required here.
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import type { Check, Violation } from "../harness.ts";

const DOMAIN_REL = "packages/server/src/domain";
const REQUIRED_FILES = ["index.ts", "service.ts", "context.ts"] as const;
const REQUIRED_DIRS = ["contract", "verbs"] as const;

export const featureStructure: Check = {
  name: "feature-structure",
  run: ({ root }): Violation[] => {
    const violations: Violation[] = [];
    const domainDir = join(root, DOMAIN_REL);
    if (!existsSync(domainDir)) {
      return violations;
    }
    for (const feature of readdirSync(domainDir)) {
      const featureDir = join(domainDir, feature);
      if (!statSync(featureDir).isDirectory()) {
        continue;
      }
      for (const file of REQUIRED_FILES) {
        if (!existsSync(join(featureDir, file))) {
          violations.push({
            file: `${DOMAIN_REL}/${feature}/${file}`,
            line: 0,
            message: `missing template file '${file}' (8-slot per-feature template)`,
          });
        }
      }
      for (const dir of REQUIRED_DIRS) {
        if (!existsSync(join(featureDir, dir))) {
          violations.push({
            file: `${DOMAIN_REL}/${feature}/${dir}/`,
            line: 0,
            message: `missing template dir '${dir}/' (8-slot per-feature template)`,
          });
        }
      }
    }
    return violations;
  },
};
