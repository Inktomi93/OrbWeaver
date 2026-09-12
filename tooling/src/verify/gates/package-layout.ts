// Gate: package-layout (Core-0-Architecture-and-Structure.md §7 / D15). A package src root contains
// only index.ts plus module directories. ResourceHost owns tree acquisition; the TS source population
// remains declared so an ordinary waiver can bind to the exact loose file occurrence.
// A broken declared resource refuses one phase EARLIER than this module: `resolveResourceDeclarations`
// (`lib/resource-declaration.ts:182`) throws during the POPULATION phase and the receipt phase withholds
// every consumer, both before `create`/`evaluate` (guide §11 ruling 3). So the read goes through
// `readyResourceValue` — a loud assertion that the runtime's refusal held — and never through an in-module
// not-ready branch, which would be unreachable and would model a silent return as the right answer.

import { defineGate } from "../contract/policy.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const PACKAGES = new Set(["kit", "contracts", "client", "db", "ui"]);
const MESSAGE =
  "a loose `.ts` file (not index.ts) sits at the root of a package's src/ — every importable module must be a DIRECTORY with an index.ts front door (core/Core-0-Architecture-and-Structure.md §7 D15).";

function looseModule(entry: ResourceTreeEntry): { readonly packageName: string; readonly file: string } | undefined {
  if (entry.kind !== "file") {
    return;
  }
  const [packages, packageName, src, file, ...rest] = entry.path.split("/");
  return packages === "packages" &&
    packageName !== undefined &&
    PACKAGES.has(packageName) &&
    src === "src" &&
    file !== undefined &&
    rest.length === 0 &&
    file !== "index.ts" &&
    file.endsWith(".ts")
    ? { packageName, file }
    : undefined;
}

export const gate = defineGate({
  id: "package-layout",
  family: "package-layout",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@client", "@ui", "@db", "@contracts", "@kit"] },
  analysis: "resource",
  execution: "entire-population",
  facts: [],
  resources: [{ kind: "authored-tree", id: "packages" }],
  message: MESSAGE,
  fix: "move the loose module into its own directory with an index.ts front door.",
  create: (ctx) => ({
    evaluate: () => {
      for (const row of readyResourceValue(ctx.resources.authoredTree("packages"))
        .map(looseModule)
        .filter((value): value is NonNullable<typeof value> => value !== undefined)) {
        const path = `packages/${row.packageName}/src/${row.file}`;
        ctx.report.file(path, { line: 1, column: 1, subject: path, operation: "loose-package-root-module" });
      }
    },
  }),
  mustFlag: [
    {
      mode: "resource",
      files: { "packages/kit/src/loose.ts": "export const x = 1;\n" },
      expect: { count: 1 },
      why: "a loose .ts at packages/kit/src root must become a directory with index.ts",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { "packages/kit/src/index.ts": "export const x = 1;\n", "packages/kit/src/mod/index.ts": "export const y = 1;\n" },
      why: "index.ts plus a proper module directory is the sanctioned layout",
    },
  ],
});
