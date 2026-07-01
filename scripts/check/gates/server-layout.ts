// Gate: server-layout (core/Core-0-Architecture-and-Structure.md §3)
// The server package's tiers ARE its directories. The only legal items at the root of
// packages/server/src/ are the 6 tier directories and index.ts.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Check, Violation } from "../harness.ts";

const SERVER_SRC = "packages/server/src";
const ALLOWED_ENTRIES = [
  "entry",
  "transport",
  "domain",
  "infra",
  "foundation",
  "kit",
  "index.ts",
] as const;

export const serverLayout: Check = {
  name: "server-layout",
  run: ({ root }): Violation[] => {
    const violations: Violation[] = [];
    const srcDir = join(root, SERVER_SRC);
    if (!existsSync(srcDir)) {
      return violations;
    }

    for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
      if (!ALLOWED_ENTRIES.includes(entry.name as any)) {
        violations.push({
          file: `${SERVER_SRC}/${entry.name}`,
          line: 0,
          message: `illegal top-level entry '${entry.name}' — packages/server/src/ is locked to the 6 tier directories and index.ts (core/Core-0-Architecture-and-Structure.md §3)`,
        });
      }
    }
    return violations;
  },
};
