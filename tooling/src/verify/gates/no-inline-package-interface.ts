// Policy: no-inline-package-interface (Spine-TypeScript-and-Patterns.md §7.4) — an exported interface in server
// entry, transport, infra or foundation, or in `@orb/inference`, outside a type home. The interface half of
// `no-inline-types` for the packages `no-inline-domain-interface` does not reach: a shape lives in a domain
// `contract/`, `@orb/contracts`, the package's `src/contract/` or `@orb/kit`, never beside the code that uses it.
// The client is not judged: client-only views are a home of their own (the §7.4 table).
//
// FAMILY `no-inline-types` (split by POPULATION): authored-name reporting lives in `lib/type-home-policy.ts`;
// the floor recognizes exported declarations. Server domains and `primitives/` are subtracted, as in the wire
// sibling, so the three interface policies partition the implementation roots without overlap.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { reportExportedShapes } from "../lib/type-home-policy.ts";

const MESSAGE =
  "exported interface in server entry, transport, infra, foundation or inference outside a type home — a shape " +
  "lives in a domain's contract/, @orb/contracts, the package's src/contract/ or @orb/kit. Move it there and " +
  "import it. See Spine-TypeScript-and-Patterns.md §7.4.";
const FIX =
  "move the interface to its type home and import it. A baselined site is waived with " +
  "`@orb-waive no-inline-package-interface(<position>): <reason naming its burn-down item>` on the line above, " +
  "where <position> is the interface's own declared name.";

export const gate = defineGate({
  id: "no-inline-package-interface",
  family: "no-inline-types",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@server", "@inference"],
    notUnder: ["packages/server/src/domain/**", "packages/server/src/primitives/**", "**/contract/**"],
    notNamed: ["contract.ts"],
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
          reportExportedShapes(ctx, node, MESSAGE, FIX);
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: {
        "packages/server/src/entry/compose/chat.ts": "export interface ChatComposeResult {\n  readonly a: string;\n}\n",
        "packages/server/src/infra/storage/cas.ts": "export interface PutResult {\n  readonly hash: string;\n}\n",
        "packages/server/src/foundation/env/bind.ts": "export interface BindPosture {\n  readonly host: string;\n}\n",
        "packages/server/src/transport/trpc/x.ts": "export interface Frame {\n  readonly n: number;\n}\n",
      },
      expect: { count: 4 },
      why: "the founding shape in each server tier the domain sibling does not reach, whatever the interface is named",
    },
    {
      mode: "source",
      files: { "packages/inference/src/backends/probe.ts": "export interface Probe {\n  readonly a: string;\n}\n" },
      expect: { count: 1, token: "Probe" },
      why: "an inference implementation module is not a type home; package-owned exported shapes live in src/contract/",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/server/src/entry/anchor.ts": "export const anchor = 1;\n",
        "packages/server/src/domain/x/verb.ts": "export interface FooView {\n  readonly a: string;\n}\n",
        "packages/server/src/primitives/x.ts": "export interface Bar {\n  readonly a: string;\n}\n",
        "packages/inference/src/contract/x.ts": "export interface Home {\n  readonly a: string;\n}\n",
        "packages/server/src/infra/contract.ts": "export interface Flat {\n  readonly a: string;\n}\n",
        "packages/server/src/infra/contract/x.ts": "export interface Nested {\n  readonly a: string;\n}\n",
      },
      why: "every subtracted home in one row: server domains (judged by `no-inline-domain-interface`), server primitives, the inference `contract/` home, the flat `contract.ts` and nested `contract/` directories. Dropping any one clause reds this row",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/entry/anchor.ts": "export const anchor = 1;\n",
        "packages/client/src/features/x/view.tsx": "export interface PanelState {\n  readonly a: string;\n}\n",
        "packages/ui/src/x.ts": "export interface UiShape {\n  readonly a: string;\n}\n",
        "packages/kit/src/x.ts": "export interface KitShape {\n  readonly a: string;\n}\n",
      },
      why: "the root list: a client-only view is a §7.4 home, and ui and kit sit below contracts",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/infra/x.ts":
          "interface Local {\n  readonly a: string;\n}\nexport const use = (value: Local): string => value.a;\nexport type Alias = string;\n",
      },
      why: "an unexported interface is file-local, and an exported alias is `no-inline-types`' question, not this one",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/infra/storage/cas.ts":
          "// @orb-waive no-inline-package-interface(PutResult): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export interface PutResult {\n  readonly hash: string;\n}\n",
      },
      why: "POSITIONAL IDENTITY: the position is the interface's declared name, built on a one-finding fixture",
    },
  ],
});
