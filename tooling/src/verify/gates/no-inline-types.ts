// Policy: no-inline-types (Spine-TypeScript-and-Patterns.md §7.4) — a shape has ONE home, decided by who
// needs it. An exported `type` alias, or an exported const bound to a zod object/enum/discriminatedUnion
// schema, declared OUTSIDE a type home is a second spelling of a shape that already has an owner.
//
// THE TYPE HOMES ARE POPULATION, NOT GRANTS. Every clause of the legacy `isTypeHome` predicate names a
// STRUCTURAL class the law itself defines — `contract/` directories, the `kit`/`contracts`/`db`/`ui`
// packages, the client's `data|forms|state|lib` tiers, `server/src/kit`, the tooling plumbing floor, and
// the test/script trees. None of them is a reviewed permission for a named file, so they convert as
// population algebra (`notUnder`/`notNamed`), which is exactly what the exception census reserves that
// arm for: "current test/spec population exclusions remain population algebra where they define the
// policy's subject". A NEW home would be a change to §7.4, never a row someone adds to a table here.
//
// THE INTERFACE ARM LIVES IN ITS OWN POLICY. Legacy judged an exported `interface` only inside
// `packages/server/src/domain/**` while judging type aliases everywhere — two different populations under
// one descriptor, which the final contract cannot express (one `population` per policy). It is
// `no-inline-domain-interface`, same family, same authority; neither arm was widened or narrowed.
//
// IDENTITY, NOT SPELLING, on the schema arm: the legacy reader compared the callee's TEXT to `z.object` /
// `z.enum` / `z.discriminatedUnion`, so `import * as zod from "zod"`, `import { object } from "zod"` and
// `import { z as s }` were all invisible while a same-named method on any project object would have
// matched had the text lined up. The subject is the module export: a call whose callee resolves through
// the shared module-origin reader to the `zod` door, terminating in one of the three factories.
//
// DECLARED LIMIT (its own mustPass row): the schema arm is NOT fail-closed. Its population is every
// exported const in three roots, so reporting each call whose origin cannot be read would accuse the
// whole unreadable tail rather than a candidate set — the honest opposite of a DECLARED-door arm, where
// fail-closure is bounded. An unreadable factory-named call therefore passes, and the type-alias arm
// (pure authored syntax, no identity question) carries the law for everything a schema read cannot place.
import type { Node as MorphNode } from "ts-morph";
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { readMemberReference, resolveModuleMemberOrigin } from "../lib/reference-fact.ts";

const ZOD_DOOR = "zod";
/** The three zod factories whose result IS a declared shape (F2 of §7.4 — an inferred schema is a type). */
const ZOD_FACTORIES: ReadonlySet<string> = new Set(["object", "enum", "discriminatedUnion"]);

const MESSAGE =
  "exported type/zod-schema outside a type home — feature types live in the feature's contract/ (or " +
  "@orb/contracts), not in a verb/service/component/substrate. Move it to contract/ and import it. See " +
  "Spine-TypeScript-and-Patterns.md §7.4.";
const FIX = "move the shape to contract/ (or @orb/contracts) and import it.";

/** The authored name a candidate call names, in every member spelling. Prefilter only: it decides whether
 *  the origin is worth resolving, never whether the call is a zod factory. */
function factoryCandidateName(callee: MorphNode): string | undefined {
  if (Node.isIdentifier(callee)) {
    return ZOD_FACTORIES.has(callee.getText()) ? callee.getText() : undefined;
  }
  const member = readMemberReference(callee);
  return member.kind === "resolved" && ZOD_FACTORIES.has(member.value.name) ? member.value.name : undefined;
}

/** Is this initializer a call to one of the three zod schema factories, proven through the module door? */
function isZodSchemaCall(initializer: MorphNode): boolean {
  if (!Node.isCallExpression(initializer)) {
    return false;
  }
  const callee = initializer.getExpression();
  if (factoryCandidateName(callee) === undefined) {
    return false;
  }
  const origin = resolveModuleMemberOrigin(callee);
  if (origin.kind === "unresolved") {
    return false;
  }
  const { moduleSpecifier, exportedName, memberPath, canonical } = origin.value;
  const terminal = memberPath.at(-1) ?? exportedName;
  const doors = new Set<string>([moduleSpecifier, ...(canonical.kind === "external-door" ? [canonical.moduleSpecifier] : [])]);
  return ZOD_FACTORIES.has(terminal) && doors.has(ZOD_DOOR);
}

/** The name nodes one delivered declaration owes a finding on: an exported alias's own name, and the name
 *  of every exported const in a statement whose initializer is a proven zod shape factory. */
function inlineTypeNames(node: MorphNode): readonly MorphNode[] {
  if (Node.isTypeAliasDeclaration(node)) {
    return node.hasExportKeyword() ? [node.getNameNode()] : [];
  }
  if (Node.isVariableStatement(node) && node.hasExportKeyword()) {
    return node
      .getDeclarations()
      .filter((declaration) => {
        const initializer = declaration.getInitializer();
        return initializer !== undefined && isZodSchemaCall(initializer);
      })
      .map((declaration) => declaration.getNameNode());
  }
  return [];
}

export const gate = defineGate({
  id: "no-inline-types",
  family: "no-inline-types",
  authority: "ordinary",
  severity: "error",
  // The judged corpus: the three roots that host implementation code, minus every structural type home.
  // `@ui`/`@kit`/`@contracts`/`@db` and the root `tests/`/`scripts/` trees are homes WHOLE and are simply
  // not in the population — which is also why the legacy `/tests/`/`/scripts/` substring clauses are NOT
  // reproduced: inside these three roots they matched exactly one directory, `domain/regex/verbs/scripts/`,
  // by the same string accident the deleted `/tools/` clause was (#408). A domain subsystem is domain code.
  population: {
    in: ["@client", "@server", "@tooling"],
    notUnder: [
      "packages/client/src/data/**",
      "packages/client/src/forms/**",
      "packages/client/src/state/**",
      "packages/client/src/lib/**",
      "packages/server/src/kit/**",
      "tooling/src/_shared/**",
      "**/contract/**",
    ],
    notNamed: ["contract.ts", "*.test.ts", "*.test.tsx"],
  },
  analysis: "types",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.TypeAliasDeclaration, SyntaxKind.VariableStatement],
        visit: (node): void => {
          for (const name of inlineTypeNames(node)) {
            ctx.report.node(name, { token: name.getText(), offset: 0, message: MESSAGE, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/server/src/domain/x/verb.ts": "export type Foo = string;\n" },
      expect: { count: 1, token: "Foo" },
      why: "the founding shape — an exported type alias in a verb, whose home is the domain's contract/",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { object: (shape: unknown) => unknown };\n",
        "packages/server/src/domain/x/schema.ts": 'import { z } from "zod";\nexport const Foo = z.object({});\n',
      },
      expect: { count: 1, token: "Foo" },
      why: "the founding schema shape: an exported zod object outside a type home — a declared shape wearing a const",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { object: (shape: unknown) => unknown };\n",
        "packages/server/src/domain/x/schema.ts": 'import { z as s } from "zod";\nexport const Foo = s.object({});\n',
      },
      expect: { count: 1, token: "Foo" },
      why: "THE ALIAS RED: the same factory imported under another local name. The legacy check compared the callee TEXT to `z.object`, so every alias, namespace and named-import spelling was silently exempt",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts": "export declare function discriminatedUnion(key: string, arms: unknown): unknown;\n",
        "packages/server/src/domain/x/schema.ts": 'import { discriminatedUnion } from "zod";\nexport const Foo = discriminatedUnion("kind", []);\n',
      },
      expect: { count: 1, token: "Foo" },
      why: "the NAMED-IMPORT spelling of the same factory — no `z.` receiver exists at all, so a text match had nothing to see",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { object: (shape: unknown) => unknown };\n",
        "packages/server/src/domain/x/schema.ts": 'import * as zod from "zod";\nexport const Foo = zod.z["object"]({});\n',
      },
      expect: { count: 1, token: "Foo" },
      why: "the NAMESPACE import plus the COMPUTED-LITERAL member spelling — two respellings of one identity, both invisible to the legacy text compare",
    },
    {
      mode: "types",
      files: { "tooling/src/snap/ops/capture.ts": "export type Foo = string;\n" },
      expect: { count: 1, token: "Foo" },
      why: "a tool's ops/ exporting a shape — tool types live in the tool's contract/ slot (Core-Tooling-Law.md §2.5)",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/regex/verbs/scripts/create.ts": "export type Foo = string;\n" },
      expect: { count: 1, token: "Foo" },
      why: "THE #408 STRING ACCIDENT, closed on the same reasoning as the deleted `/tools/` clause: the legacy `/scripts/` type-home clause matched exactly ONE directory inside the judged roots — the regex SCRIPT library's verbs — and exempted a domain subsystem by pure substring luck. The repo's own `scripts/` tree is out of the population by root, so nothing is lost by not reproducing it",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/server/src/domain/x/contract/types.ts": "export type Foo = string;\n",
      },
      why: "the type home: a `contract/` directory is not in the population at all",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/x/verb.ts": "type Foo = string;\nexport const use = (value: Foo): Foo => value;\n" },
      why: "an UNEXPORTED alias is file-local and has no second home to collide with",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "tooling/src/_shared/x.ts": "export type Foo = string;\n",
      },
      why: "tooling `_shared/` is the plumbing floor — a sanctioned type home (Core-Tooling-Law.md §2.4)",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "tooling/src/snap/contract/types.ts": "export type Foo = string;\n",
      },
      why: "a tool's contract/ slot rides the same `contract/` clause — the five-slot type home",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/local.ts":
          "const z = {\n  object(shape: unknown): unknown {\n    return shape;\n  },\n};\nexport const Foo = z.object({});\n",
      },
      why: "THE COUNTERFACTUAL: a project object with an `object` method, called through a receiver spelled `z`. The text the legacy reader compared is IDENTICAL; the origin is a local declaration, so this is a different identity and passes",
    },
    {
      mode: "types",
      files: {
        "node_modules/zod/index.d.ts": "export declare const z: { string: () => unknown };\n",
        "packages/server/src/domain/x/schema.ts": 'import { z } from "zod";\nexport const Foo = z.string();\n',
      },
      why: "a zod call that is NOT one of the three shape factories — `z.string()` declares no object shape, and the arm is deliberately narrow",
    },
    {
      mode: "types",
      files: { "packages/server/src/domain/x/opaque.ts": "export const Foo = makeSchema.object({});\n" },
      why: "THE DECLARED LIMIT, written down rather than left silent: the schema arm is not fail-closed. `makeSchema` binds nothing this workspace can read, and reporting every unreadable factory-named call would accuse the whole unreadable tail of three roots rather than a bounded candidate set. The type-alias arm carries the law where a schema read cannot place the call",
    },
    {
      mode: "types",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/client/src/data/entity.ts": "export type Foo = string;\n",
      },
      why: "the client `data/` tier is a type home — outside the population by the same structural clause",
    },
  ],
});
