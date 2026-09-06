// Policy: no-inline-domain-interface (Spine-TypeScript-and-Patterns.md §7.4) — the INTERFACE half of
// `no-inline-types`, split off because it has a DIFFERENT POPULATION and the final contract gives one
// policy one population.
//
// Legacy `no-inline-types` judged an exported `interface` only when the file sat under
// `packages/server/src/domain/**` (`isDomainFeature`), while judging exported type aliases across the
// whole corpus. That is two subjects, and the narrowing is deliberate rather than accidental: a client
// component's exported prop interface is a different question from a domain feature declaring a shape
// outside its `contract/` slot. Splitting keeps BOTH arms exactly as wide as they were — the alternative
// (one policy, the wider population, a path test in the visitor) would either widen the accusation to
// every exported interface in three roots or re-home a corpus predicate inside a policy body, which the
// final design bans outright.
//
// No identity reader is involved: an exported interface is authored syntax, and `export` cannot be
// aliased, re-exported or computed into existence at the declaration site.
import { Node, SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";

const MESSAGE =
  "exported interface in a server domain outside a type home — a domain-internal shape lives in that " +
  "domain's contract/ (or @orb/contracts when it crosses a boundary), never in a verb/service/persistence " +
  "module. Move it to contract/ and import it. See Spine-TypeScript-and-Patterns.md §7.4.";
const FIX = "move the interface to the domain's contract/ slot (or @orb/contracts) and import it.";

export const gate = defineGate({
  id: "no-inline-domain-interface",
  family: "no-inline-types",
  authority: "ordinary",
  severity: "error",
  // The legacy admitted set exactly: server domain source, minus the `contract/` type home, minus the
  // `contract.ts` single-file spelling and the test mirror clause.
  population: {
    in: ["@server"],
    under: ["packages/server/src/domain/**"],
    notUnder: ["**/contract/**"],
    notNamed: ["contract.ts", "*.test.ts", "*.test.tsx"],
  },
  analysis: "syntax",
  execution: "selected-files",
  facts: [],
  resources: [],
  message: MESSAGE,
  fix: FIX,
  create: (ctx) => ({
    visitors: [
      {
        kinds: [SyntaxKind.InterfaceDeclaration],
        visit: (node): void => {
          if (Node.isInterfaceDeclaration(node) && node.hasExportKeyword()) {
            const name = node.getNameNode();
            ctx.report.node(name, { token: name.getText(), offset: 0, message: MESSAGE, fix: FIX });
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/domain/x/verb.ts": "export interface Foo {\n  readonly x: string;\n}\n" },
      expect: { count: 1, token: "Foo" },
      why: "the founding shape — an exported interface in a verb, whose home is the domain's contract/",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/rpg/tools/apply.ts": "export interface Foo {\n  readonly x: string;\n}\n" },
      expect: { count: 1, token: "Foo" },
      why: "#408 — the deleted `/tools/` clause used to exempt this by string accident; a domain tool SUBSYSTEM is domain code and its shapes belong in the domain's contract/",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/server/src/domain/x/contract/types.ts": "export interface Foo {\n  readonly x: string;\n}\n",
      },
      why: "the type home: a `contract/` directory is not in the population at all",
    },
    {
      mode: "source",
      files: { "packages/server/src/domain/x/verb.ts": "interface Foo {\n  readonly x: string;\n}\nexport const use = (value: Foo): string => value.x;\n" },
      why: "an UNEXPORTED interface is file-local and has no second home to collide with",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/domain/x/anchor.ts": "const local = 1;\nexport const use = (): number => local;\n",
        "packages/server/src/infra/network/egress.ts": "export interface Foo {\n  readonly x: string;\n}\n",
      },
      why: "THE POPULATION BOUNDARY the split preserves: infra is not a domain feature, and legacy judged an exported interface ONLY under domain/. Widening it here would have been a silent new accusation on every infra/transport/foundation module",
    },
  ],
});
