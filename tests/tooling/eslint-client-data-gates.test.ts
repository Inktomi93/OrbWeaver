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
  // no-effect-on-shared-selection
  [
    "orb/no-effect-on-shared-selection",
    "an effect keyed on the active chat",
    "export function useX(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => { load(chatId); }, [chatId]);\n}",
    FEATURE,
    1,
  ],
  [
    "orb/no-effect-on-shared-selection",
    "a layout effect keyed on a selected id",
    "export function useX(): void {\n  const id = useSelectedCharacterId();\n  useLayoutEffect(() => { load(id); }, [other, id]);\n}",
    FEATURE,
    1,
  ],
  [
    "orb/no-effect-on-shared-selection",
    "a namespaced effect keyed on a pointer member",
    "export function useX(): void {\n  const handle = useActiveChatHandle();\n  React.useEffect(() => { load(); }, [handle.id]);\n}",
    FEATURE,
    1,
  ],
  [
    "orb/no-effect-on-shared-selection",
    "an effect keyed on a prop",
    "export function X({ characterId }: P): void {\n  const facet = useSelectedCharacterFacetId();\n  useLayoutEffect(() => { reset(); }, [characterId]);\n  render(facet);\n}",
    FEATURE,
    0,
  ],
  [
    "orb/no-effect-on-shared-selection",
    "the pointer derived in render",
    "export function X(): string {\n  const chatId = useActiveChatId();\n  return chatId ?? 'none';\n}",
    FEATURE,
    0,
  ],
  [
    "orb/no-effect-on-shared-selection",
    "an empty-deps effect beside a pointer read",
    "export function X(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => { focus(); }, []);\n  render(chatId);\n}",
    FEATURE,
    0,
  ],
  [
    "orb/no-effect-on-shared-selection",
    "the shell tier",
    "export function useX(): void {\n  const chatId = useActiveChatId();\n  useEffect(() => { load(chatId); }, [chatId]);\n}",
    SHELL,
    0,
  ],
  // the queryKey selector
  ["no-restricted-syntax", "a hand-built queryKey", 'export const o = { queryKey: ["chat", id], queryFn };', FEATURE, 1],
  ["no-restricted-syntax", "a hand-built queryKey in data", 'export const o = queryOptions({ queryKey: ["auth", "me"], queryFn });', DATA, 1],
  ["no-restricted-syntax", "a proxy-derived queryKey", "export const o = { queryKey: trpc.chat.get.queryKey({ chatId }), queryFn };", FEATURE, 0],
  ["no-restricted-syntax", "a named key constant", "export const o = { queryKey: AUTH_ME_KEY, queryFn };", DATA, 0],
] as const;

test.for(CASES)("%s: %s", { timeout: 120_000 }, async ([rule, , source, path, count]) => {
  expect(await findings(rule, source, path)).toHaveLength(count);
});
