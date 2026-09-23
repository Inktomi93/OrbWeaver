// Policy: registry-assembly-at-door-only (client-architecture-state-and-gates.md §16 G8, client-architecture-lockdown.md §5/§7) — a registry is
// ASSEMBLED at the composition root. `createRegistry` / `createContributorRegistry` may be CALLED only in
// `main.tsx` or a `compose/` module it imports; a call anywhere else is a feature or lib smuggling in its
// own private assembly, which reintroduces the import-order nondeterminism the one-door rule removes.
//
// THE DOOR IS POPULATION, NOT A GRANT. `main.tsx` plus any `compose/` module is a STRUCTURAL class the law
// itself names — not an enumeration of files someone reviewed. Writing it as reviewed grants would red
// every NEW compose module, which is the opposite of the law: a compose module is exactly where assembly
// belongs. So the door is `notUnder` and this policy's population is "everywhere assembly is illegal",
// which is the census's own reservation for population algebra ("where they define the policy's subject").
//
// THE `register()` BAN IS ITS OWN POLICY. Legacy carried it in the same module, and it is judged EVERYWHERE
// in client source including the door files — a mutating registration API is banned wherever it is declared
// (§5 rule 1). Subtracting the door from this policy's population would have made that arm blind inside
// `main.tsx` and every `compose/` module, so it moved to `no-mutating-register-api` with the wider
// population rather than losing coverage. Same authority; its own singleton family (see FAMILY below).
//
// IDENTITY, NOT SPELLING: the factories are the EXPORTED DECLARATIONS in `client/src/lib/registry.ts`,
// resolved through the shared project-home reader, so an alias or a re-export is the same assembly while a
// same-named local function is not. The home is bound through `ctx.files` and RECEIPTED: if the module
// moves or stops exporting a factory, the receipt refuses the run instead of reporting a silent zero. The
// name prefilter is a CANDIDATE filter, not a narrowing — measured 2026-09-11: removing it changes no proof
// row, because `classifyProjectHomeOrigin` is what decides, and `lib/project-home-origin.ts` is a shared
// PRIMITIVE seventeen policies read rather than a family key.
//
// FAMILY: a declared SINGLETON since #0038. The `register()` ban split into `no-mutating-register-api` and
// carried this family string until #0038, but the two share no reader — that arm resolves nothing, this one
// resolves a factory callee's identity to the registry home — so the string named a topic, not a shared
// computation (standardization §2). Nothing else judges where a registry is assembled.
// POPULATION PORT: an INTENTIONAL CORRECTION, stated above. The legacy `scanRoot:
// (p) => p.startsWith("packages/client/src/")` (68c8f42d6) becomes `@client` MINUS the door, because the
// door is a structural class the law itself names and carrying it as a run-time check would have kept the
// composition root inside a population it can never legally violate.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `registry-assembly-at-door-only` descriptor at 5dd83aaa42c85c361d321fe56bf13063c93edf17, the parent of the
// conversion `4885cde80` (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). The
// `68c8f42d6` cited above is an ancestor carrying a byte-identical legacy blob (`git rev-parse` of both), so both
// citations resolve to this source. Over the SAME 7,263 harness candidates at that tree (`git ls-tree` ∩
// `_shared/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 1,313 and final `population` admits 1,308.
// legacy − final = 5 — `packages/client/src/main.tsx` and the four `compose/` modules: the door, moved from the
// visitor into the population. final − legacy = ∅. Controls: inside
// `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `packages/contracts/src/assets/__cbbhr_out_index.ts` (virtual) rejected by both.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { referenceNamesExport } from "../lib/origin-verdict.ts";
import { classifyProjectHomeOrigin, locateProjectHome } from "../lib/project-home-origin.ts";

const REGISTRY_HOME = { path: "packages/client/src/lib/registry.ts", names: ["createRegistry", "createContributorRegistry"] } as const;
const FACTORY_POPULATION = "registry factories";

// The message says "any compose/ module", NOT "a compose/ module main.tsx imports": the population is
// `notUnder packages/client/src/**/compose/**` and NOTHING checks the import relation (deliberately — see
// the header). A message clause is a claim, so it states the structural class the code actually applies.
const MESSAGE =
  "createRegistry()/createContributorRegistry() may be CALLED only at the composition root (main.tsx) or " +
  "in any compose/ module — every other call site is a private assembly outside the ONE " +
  "registration door (client-architecture-lockdown.md §5/§7/client-architecture-state-and-gates.md §16 G8).";
const UNREADABLE =
  "this call is spelled like a registry mint but the shared readers cannot place the callee's declaration, so whether it enters through the registry home CANNOT be established. Reported rather than passed: a door an unreadable barrel can walk through is not a door.";
const FIX =
  "move the createRegistry()/createContributorRegistry() call into main.tsx (or a compose/ module). For a deliberate exception, write an adjacent `@orb-waive registry-assembly-at-door-only(<position>): <why + end condition>` — the position is the LOCAL callee name at the call site, after the last dot (`createRegistry`, or the alias you imported it under), never the factory's exported name.";

export const gate = defineGate({
  id: "registry-assembly-at-door-only",
  family: "registry-assembly-at-door-only",
  authority: "ordinary",
  severity: "error",
  // Client source MINUS the door: the composition root and every compose/ module are where assembly is
  // legal, so they are not part of the subject at all.
  population: { in: ["@client"], notUnder: ["packages/client/src/main.tsx", "packages/client/src/**/compose/**"] },
  analysis: "types",
  execution: "entire-population",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const home = locateProjectHome(ctx.files, ctx.relativePath, REGISTRY_HOME);
    return {
      visitors: [
        {
          kinds: [SyntaxKind.CallExpression],
          visit: (node): void => {
            if (!Node.isCallExpression(node)) {
              return;
            }
            const callee = node.getExpression();
            // The NAME PREFILTER that makes fail-closure honest: only a reference that could name one of the
            // two factories is ever resolved, so an unreadable verdict accuses a candidate rather than every
            // opaque call in the client tree.
            if (!REGISTRY_HOME.names.some((name) => referenceNamesExport(callee, name))) {
              return;
            }
            const verdict = classifyProjectHomeOrigin(callee, home);
            if (verdict !== "other") {
              const token = callee.getText();
              ctx.report.node(callee, {
                token: token.slice(token.lastIndexOf(".") + 1),
                offset: token.lastIndexOf(".") + 1,
                message: verdict === "home" ? MESSAGE : UNREADABLE,
                fix: FIX,
              });
            }
          },
        },
      ],
      evaluate: (): void => {
        ctx.receipt({ kind: "population", source: FACTORY_POPULATION, members: home.members, unresolved: home.unresolved });
      },
    };
  },
  mustFlag: [
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry.ts":
          "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\nexport declare function createContributorRegistry(name: string, contributions: readonly unknown[]): unknown;\n",
        "packages/client/src/features/x/lib/x-section.ts":
          'import { createRegistry } from "../../../lib/registry.ts";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
      },
      expect: { count: 1, token: "createRegistry" },
      why: "the founding shape — a registry assembled inside a feature, outside the ONE door",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry.ts":
          "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\nexport declare function createContributorRegistry(name: string, contributions: readonly unknown[]): unknown;\n",
        "packages/client/src/features/x/lib/x-section.ts":
          'import { createRegistry as assemble } from "../../../lib/registry.ts";\nexport const x = assemble("t", ["a"], { a: 1 });\n',
      },
      expect: { count: 1, token: "assemble" },
      why: "THE ALIAS RED: the same mint under another local name is the same private assembly, and the legacy callee-text check saw nothing",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry.ts":
          "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\nexport declare function createContributorRegistry(name: string, contributions: readonly unknown[]): unknown;\n",
        "packages/client/src/lib/registry-barrel.ts": 'export { createContributorRegistry } from "./registry.ts";\n',
        "packages/client/src/features/x/lib/x-list.ts":
          'import { createContributorRegistry } from "../../../lib/registry-barrel.ts";\nexport const x = createContributorRegistry("t", []);\n',
      },
      expect: { count: 1, token: "createContributorRegistry" },
      why: "a name-preserving RE-EXPORT resolves to the same canonical declaration — a barrel hop does not move the assembly to the door",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry.ts":
          "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\nexport declare function createContributorRegistry(name: string, contributions: readonly unknown[]): unknown;\n",
        "packages/client/src/compose/sections.ts":
          'import { createRegistry } from "../lib/registry.ts";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
      },
      why: "a compose/ module IS the door's own helper — outside the population by the structural clause the law names",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry.ts":
          "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\nexport declare function createContributorRegistry(name: string, contributions: readonly unknown[]): unknown;\n",
        "packages/client/src/main.tsx": 'import { createRegistry } from "./lib/registry.ts";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
      },
      why: "the composition root itself — the ONE sanctioned call site",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry.ts":
          "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\nexport declare function createContributorRegistry(name: string, contributions: readonly unknown[]): unknown;\n",
        "packages/client/src/main.tsx": 'import { createRegistry } from "./lib/registry.ts";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
        "packages/server/src/domain/x/assemble.ts":
          'import { createRegistry } from "../../../../client/src/lib/registry.ts";\nexport const y = createRegistry("t", ["a"], { a: 1 });\n',
      },
      why: 'THE ROOT FENCE (`in: ["@client"]`), which nothing exercised: this law is about the CLIENT composition root — `packages/client/src/main.tsx` is the door it names — so the byte-identical private assembly in SERVER source is not its subject, and the server has its own composition law. The two `notUnder` doors subtract paths INSIDE `@client` and reach nothing here. Widen the root and this row flags. `main.tsx` is the in-population ANCHOR a root falsifier needs',
    },
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry.ts":
          "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\nexport declare function createContributorRegistry(name: string, contributions: readonly unknown[]): unknown;\n",
        "packages/client/src/features/x/lib/local.ts":
          'function createRegistry(name: string): string {\n  return name;\n}\nexport const x = createRegistry("t");\n',
      },
      why: "THE COUNTERFACTUAL: a LOCAL function with the factory's name assembles no registry, so its caller is not a private assembly. The legacy text compare accused it",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/lib/registry.ts":
          "export declare function createRegistry(name: string, ids: readonly string[], definitions: Record<string, unknown>): unknown;\nexport declare function createContributorRegistry(name: string, contributions: readonly unknown[]): unknown;\n",
        "packages/client/src/features/x/lib/x-section.ts":
          'import { createRegistry } from "../../../lib/registry.ts";\n' +
          "// @orb-waive registry-assembly-at-door-only(createRegistry): pinned identity arm; ends when this assembly moves to a compose/ module.\n" +
          'export const x = createRegistry("t", ["a"], { a: 1 });\n',
      },
      why: "THE IDENTITY ARM (§4.2): the twin of the founding mustFlag row, which produces EXACTLY ONE finding, waived at the position this policy reports — the LOCAL callee name, which is why the alias row's position would be `assemble` instead",
    },
  ],
});
