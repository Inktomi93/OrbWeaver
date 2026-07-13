// Gate: package-layout (core/Core-0-Architecture-and-Structure.md §7)
// Enforces that "Every importable module is a DIRECTORY with index.ts (front-door = folder)"
// This runs on packages/kit, packages/contracts, packages/client, and packages/db.
// It bans any loose .ts files in packages/*/src except for index.ts.
// Note: packages/server is handled by server-layout.ts.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { GateDescriptor } from "../contract.ts";
import type { Violation } from "../harness.ts";

const PACKAGES = ["kit", "contracts", "client", "db", "ui"];

/** The fs scan shared by the legacy Check and the single-pass `run` descriptor. */
function scanPackageLayout(root: string): Violation[] {
  const violations: Violation[] = [];
  for (const pkg of PACKAGES) {
    const srcDir = join(root, "packages", pkg, "src");
    if (!existsSync(srcDir)) {
      continue;
    }
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
}

export const gate: GateDescriptor = {
  name: "package-layout",
  docRow: "core/Core-0-Architecture-and-Structure.md §7 (D15)",
  status: "active",
  scopeSafety: "whole-project",
  fsBacked: true,
  message:
    "a loose `.ts` file (not index.ts) sits at the root of a package's src/ — every importable module must be a DIRECTORY with an index.ts front door (core/Core-0-Architecture-and-Structure.md §7 D15).",
  fix: "move the loose module into its own directory with an index.ts front door.",
  run: (ctx) => {
    for (const v of scanPackageLayout(ctx.root)) {
      ctx.report({ file: v.file, line: v.line, column: 0, message: v.message });
    }
  },
  mustFlag: [
    {
      files: { "packages/kit/src/loose.ts": "export const x = 1;\n" },
      expect: { messageIncludes: "loose file" },
      why: "a loose .ts at packages/kit/src root — must be a directory with an index.ts (D15)",
    },
  ],
  mustPass: [
    {
      files: {
        "packages/kit/src/index.ts": "export const x = 1;\n",
        "packages/kit/src/mod/index.ts": "export const y = 1;\n",
      },
      why: "index.ts + a proper module directory (mod/index.ts) — the sanctioned layout, passes",
    },
  ],
};
