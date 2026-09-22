// Gate: package-layout (Core-0-Architecture-and-Structure.md §7 / D15). A package src root contains
// only index.ts plus module directories. ResourceHost owns tree acquisition; the TS source population
// remains declared so findings retain the exact loose file identity a reviewed grant names.
// A broken declared resource refuses one phase EARLIER than this module: `resolveResourceDeclarations`
// (`lib/resource-declaration.ts:182`) throws during the POPULATION phase and the receipt phase withholds
// every consumer, both before `create`/`evaluate` (guide §3's acquisition-refusal rule). So the read goes through
// `readyResourceValue` — a loud assertion that the runtime's refusal held — and never through an in-module
// not-ready branch, which would be unreachable and would model a silent return as the right answer.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `package-layout` descriptor at e6394c8ac9124d2ba175554f6ffb8d90f58bb463, the parent of the conversion `96e103fe4`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,046 harness
// candidates at that tree (`git ls-tree` ∩ `_shared/ts-workspace.ts#harnessGlobs`), the legacy harness — no
// `scanRoot` — dispatched 7,046, and the final `population` admits 1,854; the subject is the declared package
// `authored-tree`s (the TS population is the loose-file identity carrier). legacy − final = 5,192 — `@server` (1,466,
// whose root is `server-layout`'s) and every `tests`/`tooling`/`scripts` source: the legacy walk read only
// `packages/{kit,contracts,client,db,ui}/src` top-level `.ts` names. final − legacy = ∅. Controls (virtual paths fed
// to both predicates): inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` admitted by both; outside
// `docs/__cbbhr_out_control.ts` rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
//
// FAMILY: a declared SINGLETON under its own id. It reads no `lib/` reader except `readyResourceValue`, and no
// sibling judges a package `src` root's loose files (`server-layout` owns the server root).

import { defineGate } from "../contract/policy.ts";
import type { ResourceTreeEntry } from "../contract/resource.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";

const PACKAGES = new Set(["kit", "contracts", "client", "db", "ui", "inference"]);
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
    !(packageName === "inference" && file === "deps.ts") &&
    file.endsWith(".ts")
    ? { packageName, file }
    : undefined;
}

export const gate = defineGate({
  id: "package-layout",
  family: "package-layout",
  authority: "reviewed-grant",
  severity: "error",
  population: { in: ["@client", "@ui", "@db", "@contracts", "@kit", "@inference"] },
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
      grant: { subject: "packages/inference/src/loose.ts", operation: "loose-package-root-module" },
      files: { "packages/inference/src/loose.ts": "export const x = 1;\n" },
      expect: { count: 1 },
      why: "the inference package's exact deps.ts seam does not open arbitrary loose root modules",
    },
    {
      mode: "resource",
      grant: { subject: "packages/kit/src/deps.ts", operation: "loose-package-root-module" },
      files: { "packages/kit/src/deps.ts": "export interface Deps {}\n" },
      expect: { count: 1 },
      why: "deps.ts is sanctioned only for inference and does not become a general package-root filename",
    },
    {
      mode: "resource",
      grant: { subject: "packages/kit/src/loose.ts", operation: "loose-package-root-module" },
      files: { "packages/kit/src/loose.ts": "export const x = 1;\n" },
      expect: { count: 1 },
      why: "a loose .ts at packages/kit/src root must become a directory with index.ts",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: { "packages/inference/src/index.ts": "export const x = 1;\n", "packages/inference/src/deps.ts": "export interface Deps {}\n" },
      why: "D15 sanctions the inference package's one injected-dependency seam at src/deps.ts",
    },
    {
      mode: "resource",
      files: { "packages/kit/src/index.ts": "export const x = 1;\n", "packages/kit/src/mod/index.ts": "export const y = 1;\n" },
      why: "index.ts plus a proper module directory is the sanctioned layout",
    },
  ],
});
