import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

const CLIENT = "packages/client/src/";
const FEATURE = `${CLIENT}features/chat/components/probe.tsx`;
const FEATURE_LIB = `${CLIENT}features/chat/lib/probe.tsx`;
const DATA = `${CLIENT}data/probe.ts`;
const STATE = `${CLIENT}state/probe.ts`;
const SHELL = `${CLIENT}features/app-shell/hooks/probe.ts`;

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: config?.rules?.[rule] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule);
}

// [rule, label, source, path, expected finding count]
const CASES = [
  // persistence-boundary
  ["orb/persistence-boundary", "a bare localStorage read", 'export const v = localStorage.getItem("k");', FEATURE, 1],
  ["orb/persistence-boundary", "a globalThis sessionStorage write", 'globalThis.sessionStorage.setItem("k", "1");', FEATURE, 1],
  ["orb/persistence-boundary", "a cast storage read", "export const s = (globalThis as { localStorage?: Storage }).localStorage;", FEATURE, 1],
  ["orb/persistence-boundary", "a computed indexedDB read", 'export const s = window["indexedDB"];', STATE, 1],
  [
    "orb/persistence-boundary",
    "the namespace pointer home",
    "export const s = (globalThis as { localStorage?: Storage }).localStorage;",
    `${CLIENT}state/durable-local.ts`,
    0,
  ],
  ["orb/persistence-boundary", "the tab-scoped resume home", "export const s = globalThis.sessionStorage;", `${CLIENT}data/session-resume.ts`, 0],
  ["orb/persistence-boundary", "a store door call", 'export const useX = createPersistedStore("x", () => ({}), {});', STATE, 0],
  ["orb/persistence-boundary", "a property that only starts with the name", "export const v = cache.localStorageKey;", FEATURE, 0],
  // client-cache-surgery-only-in-data
  ["orb/client-cache-surgery-only-in-data", "setQueryData in a feature", "queryClient.setQueryData(key, value);", FEATURE, 1],
  ["orb/client-cache-surgery-only-in-data", "an optional-chained removal", "client?.removeQueries({ queryKey: key });", FEATURE, 1],
  ["orb/client-cache-surgery-only-in-data", "a computed cancel", 'client["cancelQueries"]({ queryKey: key });', FEATURE, 1],
  ["orb/client-cache-surgery-only-in-data", "invalidateQueries in a feature", "queryClient.invalidateQueries(filter);", FEATURE, 1],
  ["orb/client-cache-surgery-only-in-data", "surgery inside data", "queryClient.setQueryData(key, value);", DATA, 0],
  ["orb/client-cache-surgery-only-in-data", "the seam verb a feature may call", "invalidation.invalidateFilters(filters);", FEATURE, 0],
  // no-inline-invalidate-outside-seam
  ["orb/no-inline-invalidate-outside-seam", "invalidateQueries in a feature", "queryClient.invalidateQueries(filter);", FEATURE, 1],
  ["orb/no-inline-invalidate-outside-seam", "invalidateQueries in another data file", "queryClient.invalidateQueries(filter);", DATA, 1],
  ["orb/no-inline-invalidate-outside-seam", "refetchQueries in a feature", "queryClient.refetchQueries(filter);", FEATURE, 1],
  ["orb/no-inline-invalidate-outside-seam", "the seam itself", "deps.queryClient.invalidateQueries(filter);", `${CLIENT}data/invalidation.ts`, 0],
  ["orb/no-inline-invalidate-outside-seam", "setQueryData is surgery, not invalidation", "queryClient.setQueryData(key, value);", DATA, 0],
  ["orb/no-inline-invalidate-outside-seam", "the seam verb", "invalidation.invalidate(event);", FEATURE, 0],
  // mutation-only-in-factory
  [
    "orb/mutation-only-in-factory",
    "a useMutation import in a feature",
    'import { useMutation } from "@tanstack/react-query";\nexport const m = useMutation;',
    FEATURE,
    1,
  ],
  [
    "orb/mutation-only-in-factory",
    "an aliased import in data",
    'import { useMutation as mutate } from "@tanstack/react-query";\nexport const m = mutate;',
    DATA,
    1,
  ],
  [
    "orb/mutation-only-in-factory",
    "the factory",
    'import { useMutation } from "@tanstack/react-query";\nexport const m = useMutation;',
    `${CLIENT}data/create-entity-mutation.ts`,
    0,
  ],
  ["orb/mutation-only-in-factory", "a query import", 'import { useQuery } from "@tanstack/react-query";\nexport const q = useQuery;', FEATURE, 0],
  ["orb/mutation-only-in-factory", "a namespace import", 'import * as query from "@tanstack/react-query";\nexport const m = query.useMutation;', FEATURE, 1],
  ["orb/mutation-only-in-factory", "a namespace re-export", 'export * from "@tanstack/react-query";', DATA, 1],
  ["orb/mutation-only-in-factory", "a named re-export", 'export { useMutation } from "@tanstack/react-query";', DATA, 1],
  ["orb/mutation-only-in-factory", "a dynamic import", 'export const load = () => import("@tanstack/react-query");', FEATURE, 1],
  [
    "orb/mutation-only-in-factory",
    "a namespace import in the factory",
    'import * as query from "@tanstack/react-query";\nexport const m = query.useMutation;',
    `${CLIENT}data/create-entity-mutation.ts`,
    0,
  ],
  [
    "orb/mutation-only-in-factory",
    "a type-only namespace import",
    'import type * as query from "@tanstack/react-query";\nexport type Q = query.QueryClient;',
    FEATURE,
    0,
  ],
  [
    "orb/mutation-only-in-factory",
    "a namespace import of another module",
    'import * as other from "./cache.ts";\nexport const m = other.useMutation;',
    FEATURE,
    0,
  ],
  // no-raw-zustand-persist
  ["orb/no-raw-zustand-persist", "a persist import", 'import { persist } from "zustand/middleware";\nexport const p = persist;', STATE, 1],
  ["orb/no-raw-zustand-persist", "an aliased persist import", 'import { persist as keep } from "zustand/middleware";\nexport const p = keep;', STATE, 1],
  ["orb/no-raw-zustand-persist", "a namespace import", 'import * as middleware from "zustand/middleware";\nexport const p = middleware.persist;', STATE, 1],
  ["orb/no-raw-zustand-persist", "a namespace re-export", 'export * from "zustand/middleware";', STATE, 1],
  ["orb/no-raw-zustand-persist", "a dynamic import", 'export const load = () => import("zustand/middleware");', STATE, 1],
  [
    "orb/no-raw-zustand-persist",
    "a persist import in a sealed home",
    'import { persist } from "zustand/middleware";\nexport const p = persist;',
    `${CLIENT}state/persisted-store-implementation.ts`,
    0,
  ],
  ["orb/no-raw-zustand-persist", "another middleware import", 'import { devtools } from "zustand/middleware";\nexport const d = devtools;', STATE, 0],
  [
    "orb/no-raw-zustand-persist",
    "a type-only namespace import",
    'import type * as middleware from "zustand/middleware";\nexport type S = middleware.StateStorage;',
    STATE,
    0,
  ],
  ["orb/no-raw-zustand-persist", "a namespace import of another module", 'import * as zustand from "zustand";\nexport const c = zustand.create;', STATE, 0],
  // modal-definition-home
  ["orb/modal-definition-home", "a modal declared in a component", "const m: ModalDefinition = { id: 'x' };", FEATURE, 1],
  ["orb/modal-definition-home", "a modal declared in state", "export const m: ModalDefinition = { id: 'x' };", STATE, 1],
  ["orb/modal-definition-home", "a satisfies modal in a component", "export const m = { id: 'x' } satisfies ModalDefinition;", FEATURE, 1],
  ["orb/modal-definition-home", "a modal in the feature lib", "const m: ModalDefinition = { id: 'x' };", FEATURE_LIB, 0],
  ["orb/modal-definition-home", "a function that only takes the type", "export function use(def: ModalDefinition): string { return def.title; }", FEATURE, 0],
  // modal-definition-literal
  ["orb/modal-definition-literal", "a modal built by a call", "const m: ModalDefinition = makeModal();", FEATURE_LIB, 1],
  ["orb/modal-definition-literal", "a modal spread from another", "const m: ModalDefinition = { ...base };", FEATURE_LIB, 0],
  ["orb/modal-definition-literal", "a modal object literal", "const m: ModalDefinition = { id: 'x' };", FEATURE_LIB, 0],
  // config-group-definition-home
  ["orb/config-group-definition-home", "a group declared in a component", "const g: ConfigGroupDefinition = { id: 'x' };", FEATURE, 1],
  ["orb/config-group-definition-home", "a group declared in state", "export const g: ConfigGroupDefinition = { id: 'x' };", STATE, 1],
  ["orb/config-group-definition-home", "a group in the feature lib", "const g: ConfigGroupDefinition = { id: 'x' };", FEATURE_LIB, 0],
  ["orb/config-group-definition-home", "a modal is another vocabulary", "const m: ModalDefinition = { id: 'x' };", STATE, 0],
  // the queryKey selector
  ["no-restricted-syntax", "a hand-built queryKey", 'export const o = { queryKey: ["chat", id], queryFn };', FEATURE, 1],
  ["no-restricted-syntax", "a hand-built queryKey in data", 'export const o = queryOptions({ queryKey: ["auth", "me"], queryFn });', DATA, 1],
  ["no-restricted-syntax", "a proxy-derived queryKey", "export const o = { queryKey: trpc.chat.get.queryKey({ chatId }), queryFn };", FEATURE, 0],
  ["no-restricted-syntax", "a named key constant", "export const o = { queryKey: AUTH_ME_KEY, queryFn };", DATA, 0],
] as const;

test.for(CASES)("%s: %s", { timeout: 120_000 }, async ([rule, , source, path, count]) => {
  expect(await findings(rule, source, path)).toHaveLength(count);
});

// no-effect-on-shared-selection resolves each hook to its declaring file, so it runs over a planted program.
const EFFECT_RULE = "orb/no-effect-on-shared-selection";
const STATE_FILES = {
  "active-chat-store.ts":
    "export function useActiveChatId(): string | null { return null; }\nexport function activeChatId(): string | null { return null; }\nexport function useActiveChatHandle(): { id: string } { return { id: '' }; }",
  "character-selection-store.ts": "const sel = { usePrimaryId: (): string | null => null };\nexport const useSelectedCharacterId = sel.usePrimaryId;",
  "persona-editor-selection-store.ts": "export function usePersonaEditorId(): string | null { return null; }",
  "plugin-page-selection-store.ts": "const store = { usePrimaryId: (): string | null => null };\nexport const usePluginPageKey = store.usePrimaryId;",
  "config-selection-store.ts": "export const useCollectionSelection = (): { kind: string } | null => null;",
  "config-nav-store.ts":
    "import { useCollectionSelection } from './config-selection-store.ts';\nexport function useActiveConfigGroup(): string | null { const member = useCollectionSelection(); return member === null ? null : member.kind; }\nexport function useActiveConfigSub(): string | null { return null; }",
  "other-store.ts":
    "import { activeChatId } from './active-chat-store.ts';\nexport function useOther(): string | null { return null; }\nexport function useReadsNow(): string | null { return activeChatId(); }",
} as const;
const STATE_BARREL = `${Object.keys(STATE_FILES)
  .map((file) => `export * from './${file}';`)
  .join("\n")}\n`;
const HEADER =
  "declare function useEffect(f: () => void, deps?: readonly unknown[]): void;\ndeclare function useLayoutEffect(f: () => void, deps?: readonly unknown[]): void;\n";

async function effectFindings(source: string, path: string, plantedTree: (files: Record<string, string>) => Promise<string>): Promise<number> {
  const root = await plantedTree({
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        strict: true,
        module: "esnext",
        moduleResolution: "bundler",
        target: "esnext",
        allowImportingTsExtensions: true,
        noEmit: true,
        skipLibCheck: true,
        jsx: "preserve",
      },
      include: ["packages"],
    }),
    ...Object.fromEntries(Object.entries(STATE_FILES).map(([file, text]) => [`${CLIENT}state/${file}`, text])),
    [`${CLIENT}state/index.ts`]: STATE_BARREL,
    [path]: `${HEADER}${source}`,
  });
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: root }).verify(
    `${HEADER}${source}`,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: ["tsconfig.json"], projectService: false, tsconfigRootDir: root, ecmaFeatures: { jsx: true } },
      },
      rules: { [EFFECT_RULE]: config?.rules?.[EFFECT_RULE] ?? "off" },
    },
    { filename: join(root, path) },
  );
  expect(found.filter(({ fatal }) => fatal === true)).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === EFFECT_RULE).length;
}

const imp = (...names: string[]): string => `import { ${names.join(", ")} } from '../../../state/index.ts';\n`;
const keyed = (hook: string, call = "useEffect"): string =>
  `export function useX(): void {\n  const id = ${hook}();\n  ${call}(() => { void id; }, [id]);\n}\n`;

test.for([
  ["the active chat", imp("useActiveChatId") + keyed("useActiveChatId"), 1],
  [
    "the active chat handle member",
    `${imp("useActiveChatHandle")}export function useX(): void {\n  const handle = useActiveChatHandle();\n  useEffect(() => { void 0; }, [handle.id]);\n}\n`,
    1,
  ],
  ["a layout effect on a selected id", imp("useSelectedCharacterId") + keyed("useSelectedCharacterId", "useLayoutEffect"), 1],
  ["the persona editor pointer", imp("usePersonaEditorId") + keyed("usePersonaEditorId"), 1],
  ["the plugin page pointer", imp("usePluginPageKey") + keyed("usePluginPageKey"), 1],
  ["the collection selection", imp("useCollectionSelection") + keyed("useCollectionSelection"), 1],
  ["a hook that wraps a pointer hook", imp("useActiveConfigGroup") + keyed("useActiveConfigGroup"), 1],
  ["a nav hook that reads no pointer", imp("useActiveConfigSub") + keyed("useActiveConfigSub"), 0],
  [
    "a parameter fed a pointer value at a call site",
    `${imp("useActiveChatId")}function useArrival(active: string | null): void {\n  useEffect(() => { void active; }, [active]);\n}\nexport function X(): void {\n  const chat = useActiveChatId();\n  useArrival(chat);\n}\n`,
    1,
  ],
  [
    "a parameter fed a non-pointer value",
    `${imp("useOther")}function useArrival(active: string | null): void {\n  useEffect(() => { void active; }, [active]);\n}\nexport function X(): void {\n  const other = useOther();\n  useArrival(other);\n}\n`,
    0,
  ],
  ["a hook that only calls the non-hook pointer reader", imp("useReadsNow") + keyed("useReadsNow"), 0],
  ["a hook from a non-pointer store", imp("useOther") + keyed("useOther"), 0],
  [
    "an effect imported under another name",
    `${imp("useActiveChatId")}import { useEffect as run } from 'react';\nexport function useX(): void {\n  const id = useActiveChatId();\n  run(() => { void id; }, [id]);\n}\n`,
    1,
  ],
  [
    "a layout effect imported under another name",
    `${imp("useActiveChatId")}import { useLayoutEffect as sync } from 'react';\nexport function useX(): void {\n  const id = useActiveChatId();\n  sync(() => { void id; }, [id]);\n}\n`,
    1,
  ],
  [
    "an aliased effect keyed on a non-pointer value",
    `${imp("useOther")}import { useEffect as run } from 'react';\nexport function useX(): void {\n  const id = useOther();\n  run(() => { void id; }, [id]);\n}\n`,
    0,
  ],
  [
    "a call named like an alias that is not a React effect",
    `${imp("useActiveChatId")}import { run } from './runner.ts';\nexport function useX(): void {\n  const id = useActiveChatId();\n  run(() => { void id; }, [id]);\n}\n`,
    0,
  ],
  [
    "an effect keyed on a prop beside a pointer read",
    `${imp("useActiveChatId")}export function X({ characterId }: { characterId: string }): void {\n  const chat = useActiveChatId();\n  useLayoutEffect(() => { void chat; }, [characterId]);\n}\n`,
    0,
  ],
  [
    "an empty-deps effect beside a pointer read",
    `${imp("useActiveChatId")}export function X(): void {\n  const chat = useActiveChatId();\n  useEffect(() => { void chat; }, []);\n}\n`,
    0,
  ],
  [
    "the pointer derived in render",
    `${imp("useActiveChatId")}export function X(): string {\n  const chat = useActiveChatId();\n  return chat ?? 'none';\n}\n`,
    0,
  ],
] as const)("orb/no-effect-on-shared-selection judges %s", { timeout: 120_000 }, async ([, source, count], { plantedTree }) => {
  expect(await effectFindings(source, FEATURE, plantedTree)).toBe(count);
});

test("orb/no-effect-on-shared-selection leaves the shell tier alone", { timeout: 120_000 }, async ({ plantedTree }) => {
  expect(await effectFindings(imp("useActiveChatId") + keyed("useActiveChatId"), SHELL, plantedTree)).toBe(0);
});
