// Policy: no-inline-wire-interface (Spine-TypeScript-and-Patterns.md §7.4) — an exported interface whose NAME
// says it is a wire shape (`WIRE_SHAPE_SUFFIXES`) declared outside a type home in server, inference or client
// code. A cross-boundary wire shape lives in `@orb/contracts` (zod + inferred); a hand-declared twin compiles on
// both sides and drifts silently. The wire vocabulary is the subject: a deps bundle, a structural port or a
// component's props (`*Deps`, `*Port`, `*Props`) is not a wire shape and never matches a suffix.
//
// FAMILY `no-inline-types` (split by POPULATION, like `no-inline-domain-interface`): every member asks
// `lib/inline-shape-declaration.ts#inlineShapeNames` which declarations are exported shapes. Server domains
// are subtracted because `no-inline-domain-interface` already judges every exported interface there.
// POPULATION: new policy. The type homes are the `no-inline-types` homes minus the client `data/` tier, which
// is where hand-spelled HTTP response shapes live. Each clause has a mustPass row that dies without it.
import { SyntaxKind } from "ts-morph";
import { defineGate } from "../contract/policy.ts";
import { inlineShapeNames } from "../lib/inline-shape-declaration.ts";

/** The name suffixes that mark a shape as crossing a boundary. */
const WIRE_SHAPE_SUFFIXES = ["View", "Result", "Summary", "Row", "Input", "Request", "Response", "Wire"] as const;

const isWireShapeName = (name: string): boolean => WIRE_SHAPE_SUFFIXES.some((suffix) => name.endsWith(suffix) && name.length > suffix.length);

const MESSAGE =
  "exported wire-named interface outside a type home — a cross-boundary wire shape lives in @orb/contracts " +
  "(zod + inferred type), a package-internal one in that package's contract/. Import or derive it " +
  "(`z.infer`, `z.input`, `Pick<…>`) instead of declaring a second spelling. See Spine-TypeScript-and-Patterns.md §7.4.";
const FIX =
  "move the shape to @orb/contracts (or the package's contract/) and import it, or derive it from the owner. A " +
  "baselined site is waived with `@orb-waive no-inline-wire-interface(<position>): <reason naming its burn-down " +
  "item>` on the line above, where <position> is the interface's own declared name.";

export const gate = defineGate({
  id: "no-inline-wire-interface",
  family: "no-inline-types",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@server", "@inference", "@client"],
    notUnder: [
      "packages/server/src/domain/**",
      "packages/server/src/primitives/**",
      "packages/client/src/forms/**",
      "packages/client/src/state/**",
      "packages/client/src/lib/**",
      "**/contract/**",
    ],
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
          for (const name of inlineShapeNames(node)) {
            const text = name.getText();
            if (isWireShapeName(text)) {
              ctx.report.node(name, { token: text, offset: 0, message: MESSAGE, fix: FIX });
            }
          }
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "source",
      files: { "packages/server/src/entry/http/import-chat.ts": "export interface ChatImportResult {\n  readonly chatId: string;\n}\n" },
      expect: { count: 1, token: "ChatImportResult" },
      why: "the founding shape: a server route's response shape declared beside the route, with a hand twin on the client",
    },
    {
      mode: "source",
      files: { "packages/client/src/data/import-chats.ts": "export interface ChatImportResult {\n  readonly chatId: string;\n}\n" },
      expect: { count: 1, token: "ChatImportResult" },
      why: "the client `data/` tier is NOT a home for wire shapes: it is where the hand-spelled response twins live",
    },
    {
      mode: "source",
      files: {
        "packages/inference/src/backends/probe.ts":
          "export interface ProbeRequest {\n  readonly a: string;\n}\nexport interface ProbeResponse {\n  readonly b: string;\n}\nexport interface ProbeWire {\n  readonly c: string;\n}\n",
      },
      expect: { count: 3 },
      why: "inference is in the population, and three suffixes of the vocabulary each flag on their own declaration",
    },
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/view.tsx":
          "export interface PluginCommandView {\n  readonly id: string;\n}\nexport interface PageSummary {\n  readonly n: number;\n}\nexport interface ListRow {\n  readonly n: number;\n}\nexport interface EditInput {\n  readonly n: number;\n}\n",
      },
      expect: { count: 4 },
      why: "client features, and the View, Summary, Row and Input suffixes",
    },
  ],
  mustPass: [
    {
      mode: "source",
      files: {
        "packages/client/src/features/x/view.tsx":
          "export interface PanelProps {\n  readonly a: string;\n}\nexport interface LoaderDeps {\n  readonly b: string;\n}\nexport interface BlobAssetsPort {\n  readonly c: string;\n}\nexport interface ResultDeps {\n  readonly d: string;\n}\n",
      },
      why: "props, deps bundles and structural ports are not wire shapes; a wire word inside the name (`ResultDeps`) is not the suffix",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/entry/http/x.ts":
          "interface LocalResult {\n  readonly a: string;\n}\nexport const use = (value: LocalResult): string => value.a;\n",
      },
      why: "an unexported interface is file-local and is the structural-copy policy's question, not this one",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/entry/anchor.ts": "export const anchor = 1;\n",
        "packages/server/src/domain/x/verb.ts": "export interface FooView {\n  readonly a: string;\n}\n",
        "packages/server/src/primitives/x.ts": "export interface BarView {\n  readonly a: string;\n}\n",
        "packages/client/src/forms/x.ts": "export interface FormView {\n  readonly a: string;\n}\n",
        "packages/client/src/state/x.ts": "export interface StateView {\n  readonly a: string;\n}\n",
        "packages/client/src/lib/x.ts": "export interface LibView {\n  readonly a: string;\n}\n",
        "packages/inference/src/contract/x.ts": "export interface HomeView {\n  readonly a: string;\n}\n",
        "packages/server/src/infra/contract.ts": "export interface FlatView {\n  readonly a: string;\n}\n",
      },
      why: "every subtracted home in one row: server domains (judged whole by `no-inline-domain-interface`), server primitives, the client forms/state/lib tiers, `contract/` directories and the flat `contract.ts`. Dropping any one clause reds this row",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/entry/anchor.ts": "export const anchor = 1;\n",
        "packages/ui/src/x.ts": "export interface UiView {\n  readonly a: string;\n}\n",
        "packages/kit/src/x.ts": "export interface KitRow {\n  readonly a: string;\n}\n",
      },
      why: "the root list: ui and kit sit below contracts and are not in the population",
    },
    {
      mode: "source",
      files: {
        "packages/server/src/entry/http/import-chat.ts":
          "// @orb-waive no-inline-wire-interface(ChatImportResult): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export interface ChatImportResult {\n  readonly chatId: string;\n}\n",
      },
      why: "POSITIONAL IDENTITY: the position is the interface's declared name, built on the founding one-finding row",
    },
  ],
});
