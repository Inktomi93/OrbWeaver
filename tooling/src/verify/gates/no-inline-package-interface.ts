// Interface placement outside sanctioned homes; qualified server declarations delegate to native lint.
// D324 factory ownership is judged only in the parser-owned native Program, never the syntax workspace.
// Generated and UI-authoring claims retain this owner; native placement owns authored export lists.
import { SyntaxKind } from "ts-morph";
import { UI_TOKEN_AUTHORING_CONTRACT_HOME } from "../../floor/code-facts/type-home.ts";
import { defineGate } from "../contract/policy.ts";
import { reportTypeHomeDeclaration } from "../lib/type-home-policy.ts";

const MESSAGE =
  "exported interface outside its canonical type home; native lint owns qualified server factory APIs, " +
  "while wire data, generated declarations and nonserver APIs retain their existing ownership obligations (D324; Spine-TypeScript §7.4).";
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
    in: ["@server", "@inference", "@ui-authoring"],
    notUnder: ["packages/server/src/domain/**", "packages/server/src/primitives/**", "**/contract/**", UI_TOKEN_AUTHORING_CONTRACT_HOME],
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
          reportTypeHomeDeclaration(ctx, node, "interface", { message: MESSAGE, fix: FIX });
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/foundation/result.gen.ts": "export interface Generated {readonly value:string}" },
      expect: { count: 1, token: "Generated" },
      why: "Unadmitted generated declarations retain the custom owner rather than receiving a syntax-checker factory grant.",
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
      files: { "packages/server/src/infra/storage/cas.ts": "export interface PutResult {readonly hash:string}" },
      why: "Native type-home lint owns this server interface; its native positional-authority control is retained in the factory-placement suite.",
    },
    {
      mode: "source",
      files: { "packages/inference/src/backends/probe.ts": "interface Probe {\n  readonly a: string;\n}\nexport { Probe };\n" },
      why: "native type-home lint owns an inference export list, so this owner does not accuse it twice",
    },
  ],
});
