import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";
import { resolvedConfig } from "./_eslint-config.ts";

const ROOT = join(import.meta.dirname, "../..");
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

const CLIENT = "packages/client/src/";
const FEATURE = `${CLIENT}features/chat/components/probe.tsx`;
const FEATURE_LIB = `${CLIENT}features/chat/lib/probe.tsx`;
const BUS = `${CLIENT}data/bus/probe.ts`;
const DATA = `${CLIENT}data/probe.ts`;
const STATE = `${CLIENT}state/probe.ts`;
const SHELL = `${CLIENT}features/app-shell/hooks/probe.ts`;

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(rule: string, source: string, path: string): Promise<readonly Linter.LintMessage[]> {
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      rules: { [rule]: config.rules[rule] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === rule);
}

// A component body around a read, so a case states only the read and its branches.
const ladder = (body: string): string => `export function Probe() {\n${body}\n}`;

// [rule, label, source, path, expected finding count]
const CASES = [
  ["orb/bus-on-data-no-store-write", "dot store write", "const x = { onData() { store.setState({}); } };", BUS, 1],
  // persistence-boundary
  ["orb/persistence-boundary", "template storage", "window[`indexedDB`];", FEATURE, 1],
  ["orb/persistence-boundary", "dynamic storage key", "window[indexedDB];", FEATURE, 1],
  ["orb/client-cache-surgery-only-in-data", "template cache", "client[`setQueryData`](key, value);", FEATURE, 1],
  ["orb/client-cache-surgery-only-in-data", "dynamic cache key", "client[setQueryData](key, value);", FEATURE, 0],
  ["orb/bus-on-data-no-store-write", "computed store write", 'const x = { onData() { store["setState"]({}); } };', BUS, 1],
  ["orb/bus-on-data-no-store-write", "template store write", "const x = { onData() { store[`setState`]({}); } };", BUS, 1],
  ["orb/bus-on-data-no-store-write", "dynamic store key", "const x = { onData() { store[setState]({}); } };", BUS, 0],
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
  // mutation-vars-derived
  [
    "orb/mutation-vars-derived",
    "a literal variables type",
    "export const useRename = createEntityMutation<{ readonly chatId: string; readonly title: string }, unknown>({ options });",
    FEATURE,
    1,
  ],
  [
    "orb/mutation-vars-derived",
    "variables derived from the procedure",
    "export const useStar = createEntityMutation<StarVars, unknown>({ options });",
    FEATURE,
    0,
  ],
  [
    "orb/mutation-vars-derived",
    "a literal response type beside derived variables",
    "export const useStar = createEntityMutation<StarVars, { readonly ok: boolean }>({ options });",
    FEATURE,
    0,
  ],
  ["orb/mutation-vars-derived", "a literal type on another generic", "export const x = wrap<{ readonly a: string }, unknown>({ options });", FEATURE, 0],
  // trpc-error-code-via-helper
  [
    "orb/trpc-error-code-via-helper",
    "a hand cast reading the code",
    'export const conflict = (error as { data?: { code?: string } }).data?.code === "CONFLICT";',
    FEATURE,
    1,
  ],
  [
    "orb/trpc-error-code-via-helper",
    "a nullable hand cast",
    "export const code = (error as { data?: { code?: string } } | null | undefined)?.data?.code;",
    FEATURE,
    1,
  ],
  ["orb/trpc-error-code-via-helper", "the helper", 'export const conflict = trpcErrorCode(error) === "CONFLICT";', FEATURE, 0],
  ["orb/trpc-error-code-via-helper", "a cast of a data field that is not a code", "export const d = (error as { data: unknown }).data;", FEATURE, 0],
  ["orb/trpc-error-code-via-helper", "a cast of another nested field", "export const r = (error as { data?: { reason?: string } }).data?.reason;", FEATURE, 0],
  // no-query-state-ladder
  [
    "orb/no-query-state-ladder",
    "an early-return pending arm",
    ladder("const q = useQuery(o);\nif (q.isPending) return <Skeleton />;\nreturn <X d={q.data} />;"),
    FEATURE,
    1,
  ],
  ["orb/no-query-state-ladder", "a destructured error ternary", ladder("const { error } = useQuery(o);\nreturn error ? <Failed /> : <X />;"), FEATURE, 1],
  [
    "orb/no-query-state-ladder",
    "a null-checked error drawn on its else arm",
    ladder("const q = useQuery(o);\nreturn q.error === null ? <X /> : <Failed />;"),
    FEATURE,
    1,
  ],
  [
    "orb/no-query-state-ladder",
    "a gated read's absent data",
    ladder("const { data } = useGatedQuery(id, f);\nif (data === undefined) return <Spinner />;\nreturn <X d={data} />;"),
    FEATURE,
    1,
  ],
  ["orb/no-query-state-ladder", "an && failure line", ladder("const q = useQuery(o);\nreturn <Row>{q.isError && <Text>failed</Text>}</Row>;"), FEATURE, 1],
  [
    "orb/no-query-state-ladder",
    "a useQueries element",
    ladder("const [a] = useQueries({ queries });\nreturn a.error !== null ? <Failed /> : <X />;"),
    FEATURE,
    1,
  ],
  [
    "orb/no-query-state-ladder",
    "a pending status literal",
    ladder('const q = useQuery(o);\nreturn q.status === "pending" ? <Skeleton /> : <X />;'),
    FEATURE,
    1,
  ],
  [
    "orb/no-query-state-ladder",
    "a success status literal",
    ladder('const q = useQuery(o);\nreturn q.status === "success" ? <X /> : <Skeleton />;'),
    FEATURE,
    1,
  ],
  [
    "orb/no-query-state-ladder",
    "two states joined in one test",
    ladder("const q = useQuery(o);\nif (q.isPending || q.isError) return <Skeleton />;\nreturn <X />;"),
    FEATURE,
    1,
  ],
  [
    "orb/no-query-state-ladder",
    "a plain copy of the data",
    ladder("const q = useQuery(o);\nconst rows = q.data;\nif (rows === undefined) return <Skeleton />;\nreturn <X d={rows} />;"),
    FEATURE,
    1,
  ],
  [
    "orb/no-query-state-ladder",
    "an aliased import",
    `import { useQuery as useQ } from "@tanstack/react-query";\n${ladder("const q = useQ(o);\nreturn q.isLoading ? <Skeleton /> : <X />;")}`,
    FEATURE,
    1,
  ],
  [
    "orb/no-query-state-ladder",
    "a ladder in a component tier file",
    ladder("const q = useQuery(o);\nif (q.isPending) return <Skeleton />;\nreturn <X />;"),
    `${CLIENT}components/probe.tsx`,
    1,
  ],
  [
    "orb/no-query-state-ladder",
    "the cited home: a suspending read under QueryBoundary",
    `${ladder("const { data } = useSuspenseQuery(o);\nreturn <X d={data} />;")}\nexport const Y = () => <QueryBoundary fallback={<Skeleton />} resetKeys={[]}><Probe /></QueryBoundary>;`,
    FEATURE,
    0,
  ],
  [
    "orb/no-query-state-ladder",
    "a value with a default drawn as nothing",
    ladder("const { data } = useQuery(o);\nreturn <Row>{data === undefined ? null : <Chip n={data.count} />}</Row>;"),
    FEATURE,
    0,
  ],
  [
    "orb/no-query-state-ladder",
    "a state read that feeds a prop and a label",
    ladder('const q = useQuery(o);\nreturn <Button disabled={q.isPending}>{q.isPending ? "Saving" : "Save"}</Button>;'),
    FEATURE,
    0,
  ],
  [
    "orb/no-query-state-ladder",
    "a component that returns nothing until the read lands",
    ladder("const { data } = useQuery(o);\nif (data === undefined) return null;\nreturn <X d={data} />;"),
    FEATURE,
    0,
  ],
  ["orb/no-query-state-ladder", "the settled arm alone", ladder("const q = useQuery(o);\nreturn q.data === undefined ? null : <X d={q.data} />;"), FEATURE, 0],
  [
    "orb/no-query-state-ladder",
    "a manual check behind a button",
    ladder("const q = useQuery({ ...o, enabled: false });\nreturn q.error === null ? null : <Failed />;"),
    FEATURE,
    0,
  ],
  ["orb/no-query-state-ladder", "a mutation's pending flag", ladder("const m = useSaveThing();\nreturn m.isPending ? <Spinner /> : <X />;"), FEATURE, 0],
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
  "shell-store.ts":
    "export function useActiveSection(): string { return 'home'; }\nexport function useOpenModal(): string | null { return null; }\nexport function useMobileViewport(): boolean { return false; }",
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
  const config = await resolvedConfig(eslint, join(ROOT, path));
  const found = new Linter({ cwd: root }).verify(
    `${HEADER}${source}`,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config.plugins,
      languageOptions: {
        parser: tseslint.parser,
        parserOptions: { project: ["tsconfig.json"], projectService: false, tsconfigRootDir: root, ecmaFeatures: { jsx: true } },
      },
      rules: { [EFFECT_RULE]: config.rules[EFFECT_RULE] ?? "off" },
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
  ["a dot member effect", imp("useActiveChatId") + keyed("useActiveChatId", "React.useEffect"), 1],
  ["a computed member effect", imp("useActiveChatId") + keyed("useActiveChatId", 'React["useEffect"]'), 1],
  ["a template member effect", imp("useActiveChatId") + keyed("useActiveChatId", "React[`useEffect`]"), 1],
  ["a dynamic member is not a named effect", imp("useActiveChatId") + keyed("useActiveChatId", "React[useEffect]"), 0],
  ["the persona editor pointer", imp("usePersonaEditorId") + keyed("usePersonaEditorId"), 1],
  ["the plugin page pointer", imp("usePluginPageKey") + keyed("usePluginPageKey"), 1],
  ["the collection selection", imp("useCollectionSelection") + keyed("useCollectionSelection"), 1],
  ["a hook that wraps a pointer hook", imp("useActiveConfigGroup") + keyed("useActiveConfigGroup"), 1],
  ["the shell store active section", imp("useActiveSection") + keyed("useActiveSection"), 1],
  ["the shell store open modal", imp("useOpenModal") + keyed("useOpenModal"), 1],
  ["a shell store device-state hook", imp("useMobileViewport") + keyed("useMobileViewport"), 0],
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
