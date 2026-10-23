import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";

// The first test pays for loading the whole flat config.
const CONFIG_LOAD_MS = 60_000;
const BOUND = "orb/bound-field-via-hook";
const STREAM = "orb/chat-stream-writes-in-bus-only";
const BUS = "orb/bus-on-data-no-store-write";
const SELECTION = "orb/selection-store-via-factory";
const ASSEMBLY = "orb/registry-assembly-at-door-only";
const CONTEXT = "orb/registry-context-via-mint";
const STATE = "orb/state-files";

const BOUND_FIELD = "packages/client/src/forms/editor/bound-fields/x-field.tsx";
const TURN = "packages/client/src/features/chat/components/turn.tsx";
const BUS_FILE = "packages/client/src/data/bus/use-chat-bus.ts";
const SELECTION_FILE = "packages/client/src/state/x-selection-store.ts";
const FEATURE_FILE = "packages/client/src/features/x/lib/x-section.ts";
const CONTEXT_FILE = "packages/client/src/state/g-registry-context.ts";
const STATE_FILE = "packages/client/src/state/grab-bag.ts";

let engine: ESLint | undefined;

async function messages(root: string, rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const filename = join(root, path);
  engine ??= new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: root });
  const config = await engine.calculateConfigForFile(filename);
  expect(config).toBeDefined();
  const found = new Linter().verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename },
  );
  expect(found.some(({ fatal }) => fatal === true)).toBe(false);
  return found;
}

const states = (count: number): string => `{ ${Array.from({ length: count }, (_, index) => `f${String(index)}: 0`).join(", ")} }`;

for (const [name, rule, path, source, count] of [
  // bound-field-via-hook
  [
    "bound-field-via-hook import",
    BOUND,
    BOUND_FIELD,
    'import { useFieldContext } from "../contexts.ts";\nexport const f = (): unknown => useFieldContext<string>();\n',
    1,
  ],
  [
    "bound-field-via-hook alias",
    BOUND,
    BOUND_FIELD,
    'import { useFieldContext as readField } from "../contexts.ts";\nexport const f = (): unknown => readField<string>();\n',
    1,
  ],
  [
    "bound-field-via-hook namespace",
    BOUND,
    BOUND_FIELD,
    'import * as forms from "../contexts.ts";\nexport const f = (): unknown => forms.useFieldContext<string>();\n',
    1,
  ],
  [
    "bound-field-via-hook computed member",
    BOUND,
    BOUND_FIELD,
    'import * as forms from "../contexts.ts";\nexport const f = (): unknown => forms["useFieldContext"]<string>();\n',
    1,
  ],
  [
    "bound-field-via-hook destructured off a namespace",
    BOUND,
    BOUND_FIELD,
    'import * as forms from "../contexts.ts";\nconst { useFieldContext } = forms;\nexport const f = (): unknown => useFieldContext<string>();\n',
    1,
  ],
  [
    "bound-field-via-hook import plus two calls is one finding",
    BOUND,
    BOUND_FIELD,
    'import { useFieldContext } from "../contexts.ts";\nexport const a = (): unknown => useFieldContext<string>();\nexport const b = (): unknown => useFieldContext<number>();\n',
    1,
  ],
  [
    "bound-field-via-hook opaque receiver",
    BOUND,
    BOUND_FIELD,
    "declare function opaque(): any;\nexport const f = (): unknown => opaque().useFieldContext<string>();\n",
    1,
  ],
  [
    "bound-field-via-hook a second bound-fields file is judged",
    BOUND,
    "packages/client/src/forms/editor/bound-fields/other-hook.ts",
    'import { useFieldContext } from "../contexts.ts";\nexport const useOther = <T,>(): unknown => useFieldContext<T>();\n',
    1,
  ],
  [
    "bound-field-via-hook same name from another module is flagged, the declared identity limit",
    BOUND,
    BOUND_FIELD,
    'import { useFieldContext } from "./local-context.ts";\nexport const f = (): unknown => useFieldContext<string>();\n',
    1,
  ],
  [
    "bound-field-via-hook the fix passes",
    BOUND,
    BOUND_FIELD,
    'import { useBoundField } from "./use-bound-field.ts";\nexport const f = (): unknown => useBoundField<string>();\n',
    0,
  ],
  [
    "bound-field-via-hook local helper passes",
    BOUND,
    BOUND_FIELD,
    "function useFieldContext<T>(): T {\n  return null as T;\n}\nexport const f = (): unknown => useFieldContext<string>();\n",
    0,
  ],
  [
    "bound-field-via-hook the hook home is the one owner",
    BOUND,
    "packages/client/src/forms/editor/bound-fields/use-bound-field.ts",
    'import { useFieldContext } from "../contexts.ts";\nexport const useBoundField = <T,>(): unknown => useFieldContext<T>();\n',
    0,
  ],
  [
    "bound-field-via-hook the toolkit outside bound-fields is out of scope",
    BOUND,
    "packages/client/src/forms/editor/use-app-form.ts",
    'import { useFieldContext } from "./contexts.ts";\nexport const f = (): unknown => useFieldContext<string>();\n',
    0,
  ],
  // chat-stream-writes-in-bus-only
  ["chat-stream-writes-in-bus-only import", STREAM, TURN, 'import { chatStream } from "#state";\nexport const push = (): void => chatStream.push();\n', 1],
  [
    "chat-stream-writes-in-bus-only alias through a barrel",
    STREAM,
    TURN,
    'import { chatStream as stream } from "../../../state/index.ts";\nexport const push = (): void => stream.push();\n',
    1,
  ],
  [
    "chat-stream-writes-in-bus-only namespace member",
    STREAM,
    TURN,
    'import * as state from "#state";\nexport const push = (): void => state.chatStream.push();\n',
    1,
  ],
  [
    "chat-stream-writes-in-bus-only opaque receiver",
    STREAM,
    TURN,
    "declare function opaque(): any;\nexport const push = (): void => opaque().chatStream.push();\n",
    1,
  ],
  [
    "chat-stream-writes-in-bus-only same name from another module is flagged, the declared identity limit",
    STREAM,
    TURN,
    'import { chatStream } from "./other-stream.ts";\nexport const push = (): void => chatStream.push();\n',
    1,
  ],
  [
    "chat-stream-writes-in-bus-only destructured off a namespace",
    STREAM,
    TURN,
    'import * as state from "#state";\nconst { chatStream } = state;\nexport const push = (): void => chatStream.push();\n',
    1,
  ],
  [
    "chat-stream-writes-in-bus-only a client non-test support module is judged",
    STREAM,
    "tests/client/state/_stream-stories.tsx",
    'import { chatStream } from "@orb/client/state";\nexport const push = (): void => chatStream.push();\n',
    1,
  ],
  [
    "chat-stream-writes-in-bus-only a test file exercising the write api is a different subject",
    STREAM,
    "tests/client/state/chat-stream.test.ts",
    'import { chatStream } from "@orb/client/state";\nexport const push = (): void => chatStream.push();\n',
    0,
  ],
  [
    "chat-stream-writes-in-bus-only computed member",
    STREAM,
    TURN,
    'import * as state from "#state";\nexport const push = (): void => state["chatStream"].push();\n',
    1,
  ],
  [
    "chat-stream-writes-in-bus-only a second bus file is judged",
    STREAM,
    "packages/client/src/data/bus/other-writes.ts",
    'import { chatStream } from "#state";\nexport const apply = (): void => chatStream.push();\n',
    1,
  ],
  [
    "chat-stream-writes-in-bus-only reading a slot passes",
    STREAM,
    TURN,
    'import { useTurnSlot } from "#state";\nexport const read = (): unknown => useTurnSlot();\n',
    0,
  ],
  [
    "chat-stream-writes-in-bus-only local binding passes",
    STREAM,
    TURN,
    "const chatStream = {\n  push(): void {},\n};\nexport const push = (): void => chatStream.push();\n",
    0,
  ],
  [
    "chat-stream-writes-in-bus-only the applier is the one owner",
    STREAM,
    "packages/client/src/data/bus/chat-bus-writes.ts",
    'import { chatStream } from "#state";\nexport const apply = (): void => chatStream.push();\n',
    0,
  ],
  [
    "chat-stream-writes-in-bus-only the state barrel re-export is not a write",
    STREAM,
    "packages/client/src/state/index.ts",
    'export { chatStream } from "./chat-stream.ts";\n',
    0,
  ],
  [
    "chat-stream-writes-in-bus-only the population is every authored file, not only client source",
    STREAM,
    "packages/server/src/probe.ts",
    'import { chatStream } from "#state";\nexport const push = (): void => chatStream.push();\n',
    1,
  ],
  // bus-on-data-no-store-write
  ["bus-on-data-no-store-write onData arrow", BUS, BUS_FILE, "export const sub = {\n  onData: () => {\n    useX.setState({ a: 1 });\n  },\n};\n", 1],
  [
    "bus-on-data-no-store-write method shorthand",
    BUS,
    BUS_FILE,
    "export const sub = { onConnectionStateChange() { unrelated.setState({ ready: true }); } };\n",
    1,
  ],
  ["bus-on-data-no-store-write class method handler", BUS, BUS_FILE, "export class Sub {\n  onData(): void {\n    this.store.setState({ a: 1 });\n  }\n}\n", 1],
  ["bus-on-data-no-store-write optional call", BUS, BUS_FILE, "export const sub = {\n  onData: () => {\n    useX?.setState({ a: 1 });\n  },\n};\n", 1],
  ["bus-on-data-no-store-write reducer route passes", BUS, BUS_FILE, "export const sub = {\n  onData: () => {\n    applyChatBusEvent({});\n  },\n};\n", 0],
  ["bus-on-data-no-store-write setState outside a handler passes", BUS, BUS_FILE, "export function init() {\n  useX.setState({ a: 1 });\n}\n", 0],
  ["bus-on-data-no-store-write another handler passes", BUS, BUS_FILE, "export const sub = {\n  onError: () => {\n    useX.setState({ a: 1 });\n  },\n};\n", 0],
  [
    "bus-on-data-no-store-write another store member passes",
    BUS,
    BUS_FILE,
    "export const sub = {\n  onData: () => {\n    useX.replace({ a: 1 });\n  },\n};\n",
    0,
  ],
  [
    "bus-on-data-no-store-write a bare reference is not a write",
    BUS,
    BUS_FILE,
    "export const sub = {\n  onData: () => {\n    const write = useX.setState;\n    void write;\n  },\n};\n",
    0,
  ],
  [
    "bus-on-data-no-store-write bracket spelling is the declared limit",
    BUS,
    BUS_FILE,
    'export const sub = { onData: () => store["setState"]({ ready: true }) };\n',
    0,
  ],
  [
    "bus-on-data-no-store-write outside data/bus is out of scope",
    BUS,
    "packages/client/src/data/other.ts",
    "export const sub = {\n  onData: () => {\n    useX.setState({ a: 1 });\n  },\n};\n",
    0,
  ],
  // selection-store-via-factory
  [
    "selection-store-via-factory import and call",
    SELECTION,
    SELECTION_FILE,
    'import { createGatedStore } from "./create-gated-store.ts";\nexport const useX = createGatedStore<{ id: string | null }>("x-selection", () => ({ id: null }));\n',
    1,
  ],
  [
    "selection-store-via-factory alias",
    SELECTION,
    SELECTION_FILE,
    'import { createGatedStore as mint } from "./create-gated-store.ts";\nexport const useY = mint<{ id: string | null }>("y-selection", () => ({ id: null }));\n',
    1,
  ],
  [
    "selection-store-via-factory namespace",
    SELECTION,
    SELECTION_FILE,
    'import * as store from "./create-gated-store.ts";\nexport const useZ = store.createGatedStore<{ id: string | null }>("z-selection", () => ({ id: null }));\n',
    1,
  ],
  [
    "selection-store-via-factory opaque receiver",
    SELECTION,
    "packages/client/src/state/o-selection-store.ts",
    'declare function opaque(): any;\nexport const useO = opaque().createGatedStore("o-selection", () => ({ id: null }));\n',
    1,
  ],
  [
    "selection-store-via-factory destructured off a namespace",
    SELECTION,
    SELECTION_FILE,
    'import * as store from "./create-gated-store.ts";\nconst { createGatedStore } = store;\nexport const useX = createGatedStore("x-selection", () => ({ id: null }));\n',
    1,
  ],
  [
    "selection-store-via-factory same name from another module is flagged, the declared identity limit",
    SELECTION,
    "packages/client/src/state/w-selection-store.ts",
    'import { createGatedStore } from "./local-store.ts";\nexport const useW = createGatedStore("w", () => ({}));\n',
    1,
  ],
  [
    "selection-store-via-factory the fix passes",
    SELECTION,
    SELECTION_FILE,
    'import { createDrillSelectionStore } from "./create-drill-selection-store.ts";\nexport const useX = createDrillSelectionStore<string>("x-selection");\n',
    0,
  ],
  [
    "selection-store-via-factory a non-selection store may mint the door",
    SELECTION,
    "packages/client/src/state/shell-store.ts",
    'import { createGatedStore } from "./create-gated-store.ts";\nexport const useShell = createGatedStore("shell", () => ({ open: false }));\n',
    0,
  ],
  [
    "selection-store-via-factory a third factory is judged",
    SELECTION,
    "packages/client/src/state/create-foo-selection-store.ts",
    'import { createGatedStore } from "./create-gated-store.ts";\nexport const make = (name: string): unknown => createGatedStore(name, () => ({ id: null }));\n',
    1,
  ],
  [
    "selection-store-via-factory the drill factory is an owner",
    SELECTION,
    "packages/client/src/state/create-drill-selection-store.ts",
    'import { createGatedStore } from "./create-gated-store.ts";\nexport const make = (name: string): unknown => createGatedStore(name, () => ({ id: null }));\n',
    0,
  ],
  [
    "selection-store-via-factory the kinded factory is an owner",
    SELECTION,
    "packages/client/src/state/create-kinded-selection-store.ts",
    'import { createGatedStore } from "./create-gated-store.ts";\nexport const make = (name: string): unknown => createGatedStore(name, () => ({ id: null }));\n',
    0,
  ],
  [
    "selection-store-via-factory the bulk message store is an owner",
    SELECTION,
    "packages/client/src/state/message-selection-store.ts",
    'import { createGatedStore } from "./create-gated-store.ts";\nexport const useMessages = createGatedStore("message-selection", () => ({ active: false }));\n',
    0,
  ],
  // registry-assembly-at-door-only
  [
    "registry-assembly-at-door-only import",
    ASSEMBLY,
    FEATURE_FILE,
    'import { createRegistry } from "../../../lib/registry.ts";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
    1,
  ],
  [
    "registry-assembly-at-door-only alias",
    ASSEMBLY,
    FEATURE_FILE,
    'import { createRegistry as assemble } from "../../../lib/registry.ts";\nexport const x = assemble("t", ["a"], { a: 1 });\n',
    1,
  ],
  [
    "registry-assembly-at-door-only contributor factory through the lib barrel",
    ASSEMBLY,
    FEATURE_FILE,
    'import { createContributorRegistry } from "#lib";\nexport const x = createContributorRegistry("t", []);\n',
    1,
  ],
  [
    "registry-assembly-at-door-only name-preserving re-export barrel",
    ASSEMBLY,
    "packages/client/src/features/x/lib/x-list.ts",
    'import { createContributorRegistry } from "../../../lib/registry-barrel.ts";\nexport const x = createContributorRegistry("t", []);\n',
    1,
  ],
  [
    "registry-assembly-at-door-only namespace member",
    ASSEMBLY,
    FEATURE_FILE,
    'import * as registry from "../../../lib/registry.ts";\nexport const x = registry.createRegistry("t", ["a"], { a: 1 });\n',
    1,
  ],
  [
    "registry-assembly-at-door-only computed string member",
    ASSEMBLY,
    FEATURE_FILE,
    'import * as lib from "#lib";\nexport const x = lib["createRegistry"]("t", ["a"], { a: 1 });\n',
    1,
  ],
  [
    "registry-assembly-at-door-only computed template member",
    ASSEMBLY,
    FEATURE_FILE,
    'import * as lib from "#lib";\nexport const x = lib[`createContributorRegistry`]("t", []);\n',
    1,
  ],
  [
    "registry-assembly-at-door-only destructured off a namespace",
    ASSEMBLY,
    FEATURE_FILE,
    'import * as lib from "#lib";\nconst { createRegistry } = lib;\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
    1,
  ],
  [
    "registry-assembly-at-door-only the composition root is the door",
    ASSEMBLY,
    "packages/client/src/main.tsx",
    'import { createRegistry } from "./lib/registry.ts";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
    0,
  ],
  [
    "registry-assembly-at-door-only a compose module is the door",
    ASSEMBLY,
    "packages/client/src/compose/sections.ts",
    'import { createRegistry } from "../lib/registry.ts";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
    0,
  ],
  [
    "registry-assembly-at-door-only a nested compose module is the door",
    ASSEMBLY,
    "packages/client/src/features/x/compose/sections.ts",
    'import { createRegistry } from "../../../lib/registry.ts";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n',
    0,
  ],
  [
    "registry-assembly-at-door-only server source is another law",
    ASSEMBLY,
    "packages/server/src/domain/x/assemble.ts",
    'import { createRegistry } from "../../../../client/src/lib/registry.ts";\nexport const y = createRegistry("t", ["a"], { a: 1 });\n',
    0,
  ],
  [
    "registry-assembly-at-door-only a local function of the same name passes",
    ASSEMBLY,
    FEATURE_FILE,
    'function createRegistry(name: string): string {\n  return name;\n}\nexport const x = createRegistry("t");\n',
    0,
  ],
  [
    "registry-assembly-at-door-only the retired home-tile anti-god-map fixture is still red",
    ASSEMBLY,
    "packages/client/src/features/home/lib/compose-tiles.ts",
    'import { createContributorRegistry } from "../../../lib/registry.ts";\nexport const tiles = createContributorRegistry("home-tiles", []);\n',
    1,
  ],
  [
    "registry-assembly-at-door-only the same home-tile assembly at the composition root passes",
    ASSEMBLY,
    "packages/client/src/main.tsx",
    'import { createContributorRegistry } from "./lib/registry.ts";\nexport const tiles = createContributorRegistry("home-tiles", []);\n',
    0,
  ],
  [
    "registry-assembly-at-door-only the lib barrel re-export is not an assembly",
    ASSEMBLY,
    "packages/client/src/lib/index.ts",
    'export { createContributorRegistry, createRegistry } from "./registry.ts";\n',
    0,
  ],
  // registry-context-via-mint
  [
    "registry-context-via-mint raw registry",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = createContext<Registry<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint namespace-qualified type",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\nimport type * as registry from "../lib/registry.ts";\nexport const C = createContext<registry.Registry<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint registry alias type",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\nimport type { SectionRegistry } from "./section-registry-context.ts";\nexport const C = createContext<SectionRegistry | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint bare type argument",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\nimport type { ModalRegistry } from "./modal-registry-context.ts";\nexport const C = createContext<ModalRegistry>(null as never);\n',
    1,
  ],
  [
    "registry-context-via-mint namespace callee and contributor type",
    CONTEXT,
    CONTEXT_FILE,
    'import * as React from "react";\nimport type { ContributorRegistry } from "../lib/registry.ts";\nexport const C = React.createContext<ContributorRegistry<{ readonly id: string }> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint opaque callee",
    CONTEXT,
    CONTEXT_FILE,
    'import type { Registry } from "../lib/registry.ts";\ndeclare function opaque(): any;\nexport const C = opaque().createContext<Registry<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint both halves aliased",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext as mintContext } from "react";\nimport type { Registry as Reg } from "../lib/registry.ts";\nexport const C = mintContext<Reg<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint type alias hop to a name without Registry in it",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\nimport type { Registry } from "../lib/registry.ts";\ntype Sections = Registry<string, number>;\nexport const C = createContext<Sections | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint two alias hops, the alias declared after its use",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = createContext<Outer | null>(null);\ntype Outer = Inner;\ntype Inner = Registry<string, number>;\n',
    1,
  ],
  [
    "registry-context-via-mint an alias hop through a union arm",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\nimport type { ContributorRegistry } from "../lib/registry.ts";\ntype Rows = ContributorRegistry<{ readonly id: string }> | undefined;\nexport const C = createContext<Rows>(undefined);\n',
    1,
  ],
  [
    "registry-context-via-mint constructor aliased alone",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext as makeContext } from "react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = makeContext<Registry<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint default React import",
    CONTEXT,
    CONTEXT_FILE,
    'import React from "react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = React.createContext<Registry<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint computed constructor member",
    CONTEXT,
    CONTEXT_FILE,
    'import * as React from "react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = React["createContext"]<Registry<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint template-literal constructor member",
    CONTEXT,
    CONTEXT_FILE,
    'import * as React from "react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = React[`createContext`]<Registry<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint createContext re-exported by a project module",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "./react-shim.ts";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = createContext<Registry<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint createContext re-exported by a project module under an alias path",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "#lib";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = createContext<Registry<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint namespace of a project re-export module",
    CONTEXT,
    CONTEXT_FILE,
    'import * as shim from "./react-shim.ts";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = shim.createContext<Registry<string, number> | null>(null);\n',
    1,
  ],
  [
    "registry-context-via-mint a local interface named like a registry is not the vocabulary",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\ninterface SectionRegistry {\n  readonly get: (id: string) => number;\n}\nexport const C = createContext<SectionRegistry | null>(null);\n',
    0,
  ],
  [
    "registry-context-via-mint a local alias of a plain type passes",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\ntype Sections = Map<string, number>;\nexport const C = createContext<Sections | null>(null);\n',
    0,
  ],
  [
    "registry-context-via-mint another library's createContext passes",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "not-react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = createContext<Registry<string, number> | null>(null);\n',
    0,
  ],
  [
    "registry-context-via-mint another library's namespace createContext passes",
    CONTEXT,
    CONTEXT_FILE,
    'import * as other from "not-react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = other.createContext<Registry<string, number> | null>(null);\n',
    0,
  ],
  [
    "registry-context-via-mint a cross-module alias without Registry in its name is the declared limit",
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\nimport type { Sections } from "./sections.ts";\nexport const C = createContext<Sections | null>(null);\n',
    0,
  ],
  [
    "registry-context-via-mint the mint home types over a type parameter",
    CONTEXT,
    "packages/client/src/lib/create-registry-context.tsx",
    'import { createContext } from "react";\nexport function createRegistryContext<R>(name: string): unknown {\n  const Ctx = createContext<R | null>(null);\n  return { Ctx, name };\n}\n',
    0,
  ],
  [
    "registry-context-via-mint a plain value context passes",
    CONTEXT,
    "packages/client/src/features/chat/hooks/x-context.tsx",
    'import { createContext } from "react";\nexport const C = createContext<string | null>(null);\n',
    0,
  ],
  [
    "registry-context-via-mint the mint call itself passes",
    CONTEXT,
    CONTEXT_FILE,
    'declare function createRegistryContext<R>(name: string): unknown;\nexport const c = createRegistryContext<{ readonly get: (id: string) => number }>("x");\n',
    0,
  ],
  [
    "registry-context-via-mint server source is out of scope",
    CONTEXT,
    "packages/server/src/probe.ts",
    'import { createContext } from "react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = createContext<Registry<string, number> | null>(null);\n',
    0,
  ],
  // state-files
  [
    "state-files grab bag",
    STATE,
    STATE_FILE,
    "declare const create: (f: () => unknown) => unknown;\nexport const useA = create(() => ({}));\nexport const useB = create(() => ({}));\n",
    3,
  ],
  [
    "state-files eleven fields",
    STATE,
    "packages/client/src/state/big.ts",
    `const useX = createGatedStore("x", () => (${states(11)}));\nexport const v = () => useX();\n`,
    1,
  ],
  [
    "state-files eleven fields in a block body",
    STATE,
    "packages/client/src/state/big.ts",
    `const useX = createGatedStore("x", () => {\n  return ${states(11)};\n});\nexport const v = () => useX();\n`,
    1,
  ],
  [
    "state-files exactly ten fields is at the cap",
    STATE,
    "packages/client/src/state/edge.ts",
    `const useX = createGatedStore("x", () => (${states(10)}));\nexport const v = () => useX();\n`,
    0,
  ],
  ["state-files exported handle", STATE, "packages/client/src/state/leak.ts", 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n', 1],
  [
    "state-files exported wrapped create application",
    STATE,
    "packages/client/src/state/wrapped.ts",
    "export const s = create<{ n: number }>()(() => ({ n: 0 }));\n",
    1,
  ],
  [
    "state-files exported handle under a long application spine",
    STATE,
    "packages/client/src/state/deep.ts",
    "export const s = create<{ n: number }>()()()()(() => ({ n: 0 }));\n",
    1,
  ],
  [
    "state-files two leaks keep two findings plus the second mint",
    STATE,
    "packages/client/src/state/two-leaks.ts",
    'export const useA = createGatedStore("a", () => ({ n: 0 }));\nexport const useB = createEntityDraftStore({ name: "b" });\n',
    3,
  ],
  [
    "state-files two mints inside one statement",
    STATE,
    "packages/client/src/state/pair.ts",
    'const stores = { a: createGatedStore("a", () => ({})), b: createGatedStore("b", () => ({})) };\nexport const v = () => stores;\n',
    1,
  ],
  [
    "state-files one private store passes",
    STATE,
    "packages/client/src/state/one.ts",
    "declare const create: (f: () => unknown) => unknown;\nconst useOne = create(() => ({}));\n",
    0,
  ],
  [
    "state-files wrapped private store passes",
    STATE,
    "packages/client/src/state/one-wrapped.ts",
    "const useOne = create<{ n: number }>()(() => ({ n: 0 }));\nexport const read = () => useOne();\n",
    0,
  ],
  [
    "state-files a non-mint factory is not a store",
    STATE,
    "packages/client/src/state/not-a-mint.ts",
    "declare function configure(f: () => unknown): unknown;\nconst a = configure(() => ({}));\nconst b = configure(() => ({}));\nexport const c = configure(() => ({}));\n",
    0,
  ],
  [
    "state-files a nested state bucket is out of the flat tier",
    STATE,
    "packages/client/src/state/sub/nested.ts",
    'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
    0,
  ],
  ["state-files the index barrel is exempt", STATE, "packages/client/src/state/index.ts", 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n', 0],
  [
    "state-files a non-state client file is out of scope",
    STATE,
    "packages/client/src/data/x.ts",
    'export const useX = createGatedStore("x", () => ({ n: 0 }));\n',
    0,
  ],
] as const) {
  test(`native client seal ${name}`, { timeout: CONFIG_LOAD_MS }, async ({ repoRoot }) => {
    expect(await messages(repoRoot, rule, source, path)).toHaveLength(count);
  });
}

for (const [rule, path, bad] of [
  [BOUND, BOUND_FIELD, 'import { useFieldContext } from "../contexts.ts";\nexport const f = (): unknown => useFieldContext<string>();\n'],
  [STREAM, TURN, 'import { chatStream } from "#state";\nexport const push = (): void => chatStream.push();\n'],
  [BUS, BUS_FILE, "export const sub = {\n  onData: () => {\n    useX.setState({ a: 1 });\n  },\n};\n"],
  [
    SELECTION,
    SELECTION_FILE,
    'import { createGatedStore } from "./create-gated-store.ts";\nexport const useX = createGatedStore("x-selection", () => ({ id: null }));\n',
  ],
  [ASSEMBLY, FEATURE_FILE, 'import { createRegistry } from "../../../lib/registry.ts";\nexport const x = createRegistry("t", ["a"], { a: 1 });\n'],
  [
    CONTEXT,
    CONTEXT_FILE,
    'import { createContext } from "react";\nimport type { Registry } from "../lib/registry.ts";\nexport const C = createContext<Registry<string, number> | null>(null);\n',
  ],
  [STATE, "packages/client/src/state/leak.ts", 'export const useX = createGatedStore("x", () => ({ n: 0 }));\n'],
] as const) {
  test(`native client seal ${rule} reports under its own rule id`, { timeout: CONFIG_LOAD_MS }, async ({ repoRoot }) => {
    expect(await messages(repoRoot, rule, bad, path)).toMatchObject([{ ruleId: rule }]);
  });
}
