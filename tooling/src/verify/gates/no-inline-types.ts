// Policy: no-inline-types (Spine-TypeScript-and-Patterns.md §7.4) — a shape has ONE home, decided by who
// needs it. Shared reporting subtracts the native placement population, which owns every plane there, while
// retaining alias exports and proven zod shape-factory schema origins everywhere else.
//
// THE TYPE HOMES ARE POPULATION, NOT GRANTS. Every clause of the legacy `isTypeHome` predicate names a
// STRUCTURAL class the law itself defines — `contract/` directories, the `kit`/`contracts`/`db`/`ui`
// packages, the client's `data|forms|state|lib` tiers, `server/src/primitives` and the script tree. Native placement
// owns tooling and maintained tests with their own homes (D331), so neither root is in this population. None of
// them is a reviewed permission for a named file, so they convert as
// population algebra (`notUnder`/`notNamed`), which is exactly what the exception census reserves that
// arm for: "current test/spec population exclusions remain population algebra where they define the
// policy's subject". A NEW home would be a change to §7.4, never a row someone adds to a table here.
//
// THE INTERFACE ARM LIVES IN NATIVE LINT: exported interfaces are judged by `orb/type-home-direct-export` and the ESLint row
// `orb/no-inline-package-interface`, never by this policy.
//
// IDENTITY, NOT SPELLING, on the schema arm: the legacy reader compared the callee's TEXT to `z.object` /
// `z.enum` / `z.discriminatedUnion`, so `import * as zod from "zod"`, `import { object } from "zod"` and
// `import { z as s }` were all invisible while a same-named method on any project object would have
// matched had the text lined up. The subject is the module export: a call whose callee resolves through
// the shared module-origin reader to the `zod` door, terminating in one of the shape factories
// (`floor/code-facts/shape-declaration.ts`, over the canonical factory package-origin reader).
//
// EVERY POPULATION CLAUSE AND EVERY ARM FENCE CARRIES A ROW THAT DIES WITHOUT IT (§4.1; each measured in
// both directions 2026-09-12, the `notUnder` and `notNamed` entries cut one at a time): the `in` root list
// → `mustPass[7]`; the four client/server tier homes → `mustPass[8]`, which carries all four at once and
// reds under each of the four cuts separately; `notNamed` → `mustPass[9]`; the VariableStatement export-keyword
// test → `mustPass[10]`; the `zod` door → `mustPass[11]`. `mustPass[0]`/`[1]`/`[6]` carry `**/contract/**` and
// `packages/client/src/data/**`. Since #0038 the factory set is tested ONCE, on the candidate name, and
// `isZodCall` then requires the resolved terminal to equal that name — the earlier pair of mutually redundant
// factory tests (a name prefilter and a terminal-set test) is gone with the private reader.
//
// DECLARED LIMIT (its own mustPass row): the schema arm is NOT fail-closed. Its population is every
// exported const in three roots, so reporting each call whose origin cannot be read would accuse the
// whole unreadable tail rather than a candidate set — the honest opposite of a DECLARED-door arm, where
// fail-closure is bounded. An unreadable factory-named call therefore passes, and the type-alias arm
// (pure authored syntax, no identity question) carries the law for everything a schema read cannot place.
//
// POPULATION PORT — SET DIFFERENCES, MEASURED (standardization §2.1; lane cb-b-header-residue, 2026-09-13). Legacy
// `no-inline-types` descriptor at f4b6d0cbae5e9351b180b7079da5339b02820284, the parent of the conversion `493fdbedae`
// (blob read from git with no working-tree plant: a `GateDescriptor`, no `defineGate`). Over the SAME 7,263 harness
// candidates at that tree (`git ls-tree` ∩ `floor/compiler/ts-workspace.ts#harnessGlobs`), legacy `scanRoot` admits 7,263
// and final `population` admits 3,204. legacy − final = 4,059 §7.4 type homes the legacy visitor returned early on
// through `isTypeHome` — `@kit`/`@contracts`/`@db`/`@ui`, `packages/showcase-plugins`, `tests/**`, `scripts/**`, the
// client `data|forms|state|lib` tiers, `packages/server/src/primitives`, `tooling/src/floor`, every `contract/` directory
// and `contract.ts` — now population algebra, the move the paragraph above states. final − legacy = ∅. Controls:
// inside `packages/client/src/agent-handles/__cbbhr_in_index.ts` (virtual) admitted by both; outside
// `docs/__cbbhr_out_control.ts` (virtual) rejected by both.
// OUTSIDE-CONTROL CAVEAT (verifier cb-v-header-residue): `docs/__cbbhr_out_control.ts` is rejected by `harnessGlobs`,
// not by the legacy descriptor — which has no path predicate of its own and admits it — so it proves only that
// neither side reaches outside the harness corpus, not that the legacy filter discriminates.
//
// FAMILY `no-inline-types`, with `no-inline-wire-interface`: shared reporting is `lib/type-home-policy.ts`; recognition lives in the floor shape reader.

import { SyntaxKind } from "ts-morph";
import { UI_TOKEN_AUTHORING_CONTRACT_HOME } from "../../floor/code-facts/type-home.ts";
import { defineGate } from "../contract/policy.ts";
import { TOKEN_GENERATED_TYPE_PATHS, TOKEN_GENERATED_TYPE_REQUEST } from "../contract/resource-artifact.ts";
import { readyResourceValue } from "../lib/resource-declaration.ts";
import { reportTypeHomeDeclaration } from "../lib/type-home-policy.ts";

const MESSAGE =
  "exported type/zod-schema outside a type home — feature types live in the feature's contract/ (or " +
  "@orb/contracts), not in a verb/service/component/substrate. Move it to contract/ and import it. See " +
  "Spine-TypeScript-and-Patterns.md §7.4.";
const FIX =
  "move the shape to contract/ (or @orb/contracts) and import it. A deliberate keep is waived with " +
  "`// @orb-waive no-inline-types(<position>): <reason>` on a line above the declaration, where <position> is " +
  "the DECLARED NAME alone — the alias's own identifier, or the const's, bare and unquoted. It is never " +
  "`type`, never `export`, never `z.object` and never the whole statement; an `export const A = z.object({}), " +
  "B = z.object({})` statement is TWO findings at two names and takes two markers.";

export const gate = defineGate({
  id: "no-inline-types",
  family: "no-inline-types",
  authority: "ordinary",
  severity: "error",
  // Token Node authoring joins ordinary placement; only the producer's exact output modules join @ui.
  // Output admission never supplies provenance: the demanded resource and canonical judgment own that proof.
  population: {
    anyOf: [
      {
        in: ["@client", "@server", "@inference", "@ui-authoring"],
        notUnder: [
          UI_TOKEN_AUTHORING_CONTRACT_HOME,
          "packages/client/src/data/**",
          "packages/client/src/forms/**",
          "packages/client/src/state/**",
          "packages/client/src/lib/**",
          "packages/server/src/primitives/**",
          "**/contract/**",
        ],
        notNamed: ["contract.ts"],
      },
      { in: ["@ui"], under: TOKEN_GENERATED_TYPE_PATHS },
    ],
  },
  analysis: "resource",
  execution: "selected-files",
  facts: [],
  resources: [TOKEN_GENERATED_TYPE_REQUEST],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => {
    const generated = ctx.files.some((source) => TOKEN_GENERATED_TYPE_PATHS.includes(ctx.relativePath(source)))
      ? readyResourceValue(ctx.resources.tokenContract(TOKEN_GENERATED_TYPE_REQUEST)).context
      : undefined;
    return {
      visitors: [
        {
          kinds: [SyntaxKind.TypeAliasDeclaration, SyntaxKind.VariableStatement],
          visit: (node): void => {
            reportTypeHomeDeclaration(ctx, node, "alias-or-schema", { message: MESSAGE, fix: FIX, ...(generated === undefined ? {} : { generated }) });
          },
        },
      ],
    };
  },
  mustFlag: [
    {
      mode: "resource",
      files: { "packages/client/src/features/x/view.ts": "type ProbeResult = string;\nexport type { ProbeResult };\n" },
      expect: { count: 1, token: "ProbeResult" },
      why: "a client export list stays with this owner; native placement owns export lists only in its admitted population",
    },
    {
      mode: "resource",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { object: (shape: unknown) => unknown };\n",
        "packages/client/src/features/x/schema.ts": 'import { z } from "zod";\nexport const Foo = z.object({});\n',
      },
      expect: { count: 1, token: "Foo" },
      why: "the founding schema shape: an exported zod object outside a type home — a declared shape wearing a const",
    },
    {
      mode: "resource",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { object: (shape: unknown) => unknown };\n",
        "packages/client/src/features/x/schema.ts": 'import { z as s } from "zod";\nexport const Foo = s.object({});\n',
      },
      expect: { count: 1, token: "Foo" },
      why: "THE ALIAS RED: the same factory imported under another local name. The legacy check compared the callee TEXT to `z.object`, so every alias, namespace and named-import spelling was silently exempt",
    },
    {
      mode: "resource",
      files: {
        "node_modules/zod/index.d.ts": "export declare function discriminatedUnion(key: string, arms: unknown): unknown;\n",
        "packages/client/src/features/x/schema.ts": 'import { discriminatedUnion } from "zod";\nexport const Foo = discriminatedUnion("kind", []);\n',
      },
      expect: { count: 1, token: "Foo" },
      why: "the NAMED-IMPORT spelling of the same factory — no `z.` receiver exists at all, so a text match had nothing to see",
    },
    {
      mode: "resource",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { object: (shape: unknown) => unknown };\n",
        "packages/client/src/features/x/schema.ts": 'import * as zod from "zod";\nexport const Foo = zod.z["object"]({});\n',
      },
      expect: { count: 1, token: "Foo" },
      why: "the NAMESPACE import plus the COMPUTED-LITERAL member spelling — two respellings of one identity, both invisible to the legacy text compare",
    },
    {
      mode: "resource",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { strictObject: (shape: unknown) => unknown; looseObject: (shape: unknown) => unknown };\n",
        "packages/client/src/features/x/schema.ts":
          'import { z } from "zod";\nexport const Strict = z.strictObject({});\nexport const Loose = z.looseObject({});\n',
      },
      expect: { count: 2 },
      why: "the strict and loose object factories declare the same object shape as `z.object`; each is a shape factory the arm must judge",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/features/x/fixtures.ts": "export type A = string;\n",
        "packages/client/src/features/x/seed-fixtures.ts": "type B = string;\nexport type { B };\n",
        "packages/client/src/features/x/_support.ts": "type C = string;\nexport type { C };\n",
      },
      expect: { count: 3 },
      why: "THE TEST HOME IS SCOPED TO `tests/`: a product module named like a fixture or support file is not a type home",
    },
  ],
  mustPass: [
    {
      mode: "resource",
      files: {
        "packages/inference/src/index.ts": "export const inference = true;\n",
        "packages/inference/src/contract/probe.ts": "type ProbeResult = string;\nexport type { ProbeResult };\n",
      },
      why: "packages/inference/src/contract is the package-level type home",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/server/src/domain/x/contract/types.ts": "export type Foo = string;\n",
      },
      why: "the type home: a `contract/` directory is not in the population at all",
    },
    {
      mode: "resource",
      files: { "packages/client/src/features/x/view.ts": "type Foo = string;\nexport const use = (value: Foo): Foo => value;\n" },
      why: "an UNEXPORTED alias is file-local and has no second home to collide with",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/features/x/local.ts":
          "const z = {\n  object(shape: unknown): unknown {\n    return shape;\n  },\n};\nexport const Foo = z.object({});\n",
      },
      why: "THE COUNTERFACTUAL: a project object with an `object` method, called through a receiver spelled `z`. The text the legacy reader compared is IDENTICAL; the origin is a local declaration, so this is a different identity and passes",
    },
    {
      mode: "resource",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { string: () => unknown };\n",
        "packages/client/src/features/x/schema.ts": 'import { z } from "zod";\nexport const Foo = z.string();\n',
      },
      why: "a zod call that is NOT a shape factory — `z.string()` declares no object shape, and the arm is deliberately narrow",
    },
    {
      mode: "resource",
      files: { "packages/client/src/features/x/opaque.ts": "export const Foo = makeSchema.object({});\n" },
      why: "THE DECLARED LIMIT, written down rather than left silent: the schema arm is not fail-closed. `makeSchema` binds nothing this workspace can read, and reporting every unreadable factory-named call would accuse the whole unreadable tail of three roots rather than a bounded candidate set. The type-alias arm carries the law where a schema read cannot place the call",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/client/src/data/entity.ts": "export type Foo = string;\n",
      },
      why: "the client `data/` tier is a type home — outside the population by the same structural clause",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/kit/src/shape.ts": "export type Foo = string;\n",
      },
      why: "THE ROOT LIST: `@kit` is a type home WHOLE, so it is not named in `in` at all — the same is true of `@contracts`, `@db` and `@ui`. A home that is an entire package is expressed by ABSENCE from the root list rather than by subtraction, which is why no `notUnder` mentions them. Add `@kit` to `in` and this is the row that dies; the server anchor keeps the population non-empty so the row measures a fence rather than a `[population]` tool error",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/client/src/forms/x.ts": "export type Foo = string;\n",
        "packages/client/src/state/x.ts": "export type Bar = string;\n",
        "packages/client/src/lib/x.ts": "export type Baz = string;\n",
        "packages/server/src/primitives/x.ts": "export type Qux = string;\n",
      },
      why: "THE FOUR REMAINING STRUCTURAL TIER HOMES, one file each, in ONE row because they are one clause of one legacy predicate: the client's `forms`/`state`/`lib` tiers and `server/src/primitives`. Each is falsified separately — dropping any ONE `notUnder` entry makes that file flag and reds this row, measured four times. `data/` has its own row above and `**/contract/**` has its own",
    },
    {
      mode: "resource",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/server/src/domain/x/contract.ts": "export type Foo = string;\n",
        "packages/client/src/features/x/anchor.tsx": "export const Anchor = (): null => null;\n",
      },
      why: "THE `contract.ts` SPELLING: a FILE named `contract.ts` is the single-file form of a `contract/` directory. Dropping that entry reds this row. The `.tsx` anchor is here so the row measures tsx admission rather than inheriting the `.ts` verdict",
    },
    {
      mode: "resource",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { object: (shape: unknown) => unknown };\n",
        "packages/client/src/features/x/local.ts": 'import { z } from "zod";\nconst Foo = z.object({});\nexport const use = (): unknown => Foo;\n',
      },
      why: "AN UNEXPORTED SCHEMA CONST is the zod twin of `mustPass[1]`'s unexported alias: a file-local shape has no second home to collide with, and §7.4 is about the module's EXPORTED surface. The statement is delivered to the visitor either way, so only the export-keyword test on the VariableStatement arm keeps it silent — cut `node.hasExportKeyword()` there and this row reds while the type-alias arm's own test stays untouched",
    },
    {
      mode: "resource",
      files: {
        "packages/client/src/features/x/shapes.ts": "export const object = (shape: unknown): unknown => shape;\n",
        "packages/client/src/features/x/schema.ts": 'import { object } from "./shapes.ts";\nexport const Foo = object({});\n',
      },
      why: "THE DOOR TEST, the other half of the identity claim `mustFlag[1..4]` make from the flagging side: a PROJECT module exporting a function named `object`, imported and called — the prefilter accepts the name and the origin reader RESOLVES it, to `shapes.ts` rather than to the `zod` door. `mustPass[4]`'s counterfactual uses a local object literal, which the origin reader refuses outright; this one resolves and is still not zod, so it is the row that dies when the door test in `floor/code-facts/zod-origin.ts#isFactoryCallFromPackage` goes",
    },
    {
      mode: "resource",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { object: (shape: unknown) => unknown };\n",
        "packages/server/src/domain/x/verb.ts": 'import { z } from "zod";\ntype Foo = string;\nexport type { Foo };\nexport const Bar = z.object({});\n',
        "packages/inference/src/backends/probe.ts": "type ProbeResult = string;\nexport type { ProbeResult };\n",
      },
      why: "native `orb/type-home-direct-export` owns direct, export-list and zod-shape placement in its admitted population; this owner subtracts the population rather than accusing it twice",
    },
  ],
});
