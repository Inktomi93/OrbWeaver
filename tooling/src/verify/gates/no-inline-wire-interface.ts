// Policy: no-inline-wire-interface (Spine-TypeScript-and-Patterns.md §7.4) — an exported interface in client code,
// outside a type home, that crosses a boundary: its name is in the wire vocabulary (`WIRE_SHAPE_SUFFIXES`) AND its
// type is plain data (`floor/code-facts/shape-declaration.ts#isPlainDataShape`, no call or construct signature in it or
// anything it nests). A hand-declared twin of a response compiles on both sides and drifts silently. A hook result,
// a deps bundle or a component's props carries behaviour, so it never crosses a wire and is not judged here.
//
// FAMILY `no-inline-types` (split by POPULATION): shared reporting lives in `lib/type-home-policy.ts`;
// declaration recognition lives in the floor shape reader. Server and inference code is subtracted because
// `no-inline-domain-interface` and `no-inline-package-interface` already judge every exported interface there.
// POPULATION: the client minus its type homes (forms, state, lib, `contract/`); the `data/` tier is judged, since
// hand-spelled HTTP response shapes live there. Each clause has a mustPass row that dies without it.
import { Node, SyntaxKind } from "ts-morph";
import { isPlainDataShape } from "../../floor/code-facts/shape-declaration.ts";
import { defineGate } from "../contract/policy.ts";
import { reportExportedWireShapes } from "../lib/type-home-policy.ts";

const MESSAGE =
  "exported wire-named plain-data interface outside a type home — a cross-boundary wire shape lives in @orb/contracts " +
  "(zod + inferred type). Import or derive it (`z.infer`, `z.input`, `Pick<…>`) instead of declaring a second " +
  "spelling. See Spine-TypeScript-and-Patterns.md §7.4.";
const FIX =
  "move the shape to @orb/contracts and import it, or derive it from the owner. A baselined site is waived with " +
  "`@orb-waive no-inline-wire-interface(<position>): <reason naming its burn-down item>` on the line above, where " +
  "<position> is the interface's own declared name.";

export const gate = defineGate({
  id: "no-inline-wire-interface",
  family: "no-inline-types",
  authority: "ordinary",
  severity: "error",
  population: {
    in: ["@client"],
    notUnder: ["packages/client/src/forms/**", "packages/client/src/state/**", "packages/client/src/lib/**", "**/contract/**"],
    notNamed: ["contract.ts"],
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
        kinds: [SyntaxKind.InterfaceDeclaration],
        visit: (node): void => {
          if (!(Node.isInterfaceDeclaration(node) && isPlainDataShape(node))) {
            return;
          }
          reportExportedWireShapes(ctx, node, MESSAGE, FIX);
        },
      },
    ],
  }),
  mustFlag: [
    {
      mode: "types",
      files: { "packages/client/src/data/import-chats.ts": "export interface ChatImportResult {\n  readonly chatId: string;\n}\n" },
      expect: { count: 1, token: "ChatImportResult" },
      why: "the founding shape: the client `data/` tier is NOT a home for wire shapes, it is where the hand-spelled response twins live",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/view.tsx":
          "export interface PluginCommandView {\n  readonly id: string;\n  readonly tags: readonly { readonly name: string }[];\n}\nexport interface PageSummary {\n  readonly n: number;\n}\nexport interface ListRow {\n  readonly n: number;\n}\nexport interface EditInput {\n  readonly n: number;\n}\nexport interface ProbeRequest {\n  readonly a: string;\n}\nexport interface ProbeResponse {\n  readonly b: string;\n}\nexport interface ProbeWire {\n  readonly c: string;\n}\n",
      },
      expect: { count: 7 },
      why: "client features, and every suffix of the vocabulary flags on its own declaration; a nested plain-data array stays data",
    },
  ],
  mustPass: [
    {
      mode: "types",
      files: {
        "packages/client/src/data/use-start-chat.ts":
          "export interface UseStartChatResult {\n  readonly start: (id: string) => void;\n  readonly isPending: boolean;\n}\n",
      },
      why: "a client hook result carries a callable member: it is behaviour, never a wire shape",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/view.tsx":
          "interface Ops {\n  readonly run: () => void;\n}\nexport interface NestedResult {\n  readonly ops: Ops;\n}\nexport interface ListedResult {\n  readonly items: readonly Ops[];\n}\nexport interface MapRow {\n  readonly byKey: Record<string, Ops>;\n}\n",
      },
      why: "behaviour nested in an object, an array or an index signature still keeps the shape off the wire",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/view.tsx":
          "export interface PanelProps {\n  readonly a: string;\n}\nexport interface LoaderDeps {\n  readonly b: string;\n}\nexport interface BlobAssetsPort {\n  readonly c: string;\n}\nexport interface ResultDeps {\n  readonly d: string;\n}\n",
      },
      why: "props, deps bundles and structural ports are not wire shapes; a wire word inside the name (`ResultDeps`) is not the suffix",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/view.tsx":
          "interface LocalResult {\n  readonly a: string;\n}\nexport const use = (value: LocalResult): string => value.a;\n",
      },
      why: "an unexported interface is file-local and is the structural-copy policy's question, not this one",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/anchor.ts": "export const anchor = 1;\n",
        "packages/client/src/forms/x.ts": "export interface FormView {\n  readonly a: string;\n}\n",
        "packages/client/src/state/x.ts": "export interface StateView {\n  readonly a: string;\n}\n",
        "packages/client/src/lib/x.ts": "export interface LibView {\n  readonly a: string;\n}\n",
        "packages/client/src/features/y/contract/x.ts": "export interface HomeView {\n  readonly a: string;\n}\n",
        "packages/client/src/features/y/contract.ts": "export interface FlatView {\n  readonly a: string;\n}\n",
      },
      why: "every subtracted client home in one row: the forms, state and lib tiers, `contract/` directories and the flat `contract.ts`. Dropping any one clause reds this row",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/features/x/anchor.ts": "export const anchor = 1;\n",
        "packages/server/src/entry/compose/chat.ts": "export interface ChatComposeResult {\n  readonly a: string;\n}\n",
        "packages/server/src/entry/http/import-chat.ts": "export interface ChatImportResult {\n  readonly chatId: string;\n}\n",
        "packages/inference/src/backends/probe.ts": "export interface ProbeRequest {\n  readonly a: string;\n}\n",
        "packages/ui/src/x.ts": "export interface UiView {\n  readonly a: string;\n}\n",
        "packages/kit/src/x.ts": "export interface KitRow {\n  readonly a: string;\n}\n",
      },
      why: "the root list: server and inference are judged whole by the interface siblings of the family, and ui and kit sit below contracts. Adding a root to `in` reds this row",
    },
    {
      mode: "types",
      files: {
        "packages/client/src/data/import-chats.ts":
          "// @orb-waive no-inline-wire-interface(ChatImportResult): the proof's stand-in reason; ends when this fixture stops flagging.\n" +
          "export interface ChatImportResult {\n  readonly chatId: string;\n}\n",
      },
      why: "POSITIONAL IDENTITY: the position is the interface's declared name, built on the founding one-finding row",
    },
  ],
});
