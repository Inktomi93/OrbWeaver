// Gate: package-layout (core/Core-0-Architecture-and-Structure.md §7)
// Enforces that "Every importable module is a DIRECTORY with index.ts (front-door = folder)"
// This runs on packages/kit, packages/contracts, packages/client, and packages/db.
// It bans any loose .ts files in packages/*/src except for index.ts.
// Note: packages/server is handled by server-layout.ts.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Check, Violation } from "../harness.ts";

const PACKAGES = ["kit", "contracts", "client", "db"];

export const packageLayout: Check = {
  name: "package-layout",
  run: ({ root }): Violation[] => {
    const violations: Violation[] = [];
    
    for (const pkg of PACKAGES) {
      const srcDir = join(root, "packages", pkg, "src");
      if (!existsSync(srcDir)) continue;

      for (const entry of readdirSync(srcDir, { withFileTypes: true })) {
        if (entry.isFile() && entry.name !== "index.ts" && entry.name.endsWith(".ts")) {
          violations.push({
            file: `packages/${pkg}/src/${entry.name}`,
            line: 0,
            message: `loose file '${entry.name}' is illegal — every importable module must be a DIRECTORY with an index.ts (core/Core-0-Architecture-and-Structure.md §7 D15)`,
          });
        }
      }
    }
    return violations;
  },
};
