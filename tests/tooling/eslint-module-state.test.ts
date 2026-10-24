import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const RULE = "orb/no-module-state";
const SUBJECT = "packages/server/src/domain/hub/probe.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, SUBJECT));
}, 120_000);

async function findings(source: string, path = SUBJECT): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, ecmaFeatures: { jsx: true } } },
      linterOptions: { reportUnusedDisableDirectives: "error" },
      rules: { [RULE]: config?.rules?.[RULE] ?? "off" },
    },
    { filename: join(ROOT, path) },
  );
  expect(
    found.filter(({ fatal }) => fatal === true),
    source,
  ).toEqual([]);
  return found.filter(({ ruleId }) => ruleId === RULE);
}

const WRITTEN_MAP = "const cache = new Map<string, number>();\nexport function remember(key: string): void {\n  cache.set(key, 1);\n}\n";

test.for([
  ["a module-scope let", "let count = 0;\nexport function read(): number {\n  return count;\n}\n", "count"],
  ["an exported module-scope let", "export let current: string | undefined;\n", "current"],
  ["a module-scope Map written with set", WRITTEN_MAP, "cache"],
  ["a module-scope Set written with add", "const seen = new Set<string>();\nexport function see(x: string): void {\n  seen.add(x);\n}\n", "seen"],
  ["a module-scope array written with push", "const queue: string[] = [];\nexport function enqueue(x: string): void {\n  queue.push(x);\n}\n", "queue"],
  [
    "a module-scope object written by property assignment",
    "const state = { open: false };\nexport function open(): void {\n  state.open = true;\n}\n",
    "state",
  ],
  [
    "a module-scope record written by index assignment",
    "const byId: Record<string, number> = {};\nexport function put(id: string): void {\n  byId[id] = 1;\n}\n",
    "byId",
  ],
  ["a module-scope object written by an update", "const counter = { n: 0 };\nexport function bump(): void {\n  counter.n++;\n}\n", "counter"],
  [
    "a module-scope object written by delete",
    "const byId: Record<string, number> = { a: 1 };\nexport function drop(id: string): void {\n  delete byId[id];\n}\n",
    "byId",
  ],
  [
    "a write through a nested member chain",
    "const state = { items: [] as string[] };\nexport function add(x: string): void {\n  state.items.push(x);\n}\n",
    "state",
  ],
  [
    "a module-scope bounded ring written after load",
    'import { createBoundedRing } from "@orb/kit/bounded-ring";\nconst ring = createBoundedRing<string>(8);\nexport function record(x: string): void {\n  ring.push(x);\n}\n',
    "ring",
  ],
  ["an id minted by randomUUID at load", 'import { randomUUID } from "node:crypto";\nexport const INSTANCE = randomUUID();\n', "INSTANCE"],
  ["an id minted by crypto.randomUUID at load", "export const INSTANCE = crypto.randomUUID();\n", "INSTANCE"],
  ["a clock read by Date.now at load", "export const BOOTED_AT = Date.now();\n", "BOOTED_AT"],
] as const)("flags %s at the declared name", async ([, source, name]) => {
  const found = await findings(source);
  expect(found).toHaveLength(1);
  const line = source.split("\n")[(found[0]?.line ?? 1) - 1] ?? "";
  expect(line.slice((found[0]?.column ?? 1) - 1, (found[0]?.endColumn ?? 1) - 1)).toBe(name);
});

test.for([
  ["a read-only lookup Map", 'const LABELS = new Map([["a", "A"]]);\nexport function label(k: string): string | undefined {\n  return LABELS.get(k);\n}\n'],
  [
    "a read-only lookup array",
    'const KINDS = ["a", "b"] as const;\nexport function known(k: string): boolean {\n  return (KINDS as readonly string[]).includes(k);\n}\n',
  ],
  ["a read-only lookup object", "const LIMITS = { max: 3 };\nexport function max(): number {\n  return LIMITS.max;\n}\n"],
  [
    "an identity-keyed WeakMap written per key",
    "const seen = new WeakMap<object, number>();\nexport function mark(key: object): void {\n  seen.set(key, 1);\n}\n",
  ],
  ["an identity-keyed WeakSet written per key", "const seen = new WeakSet<object>();\nexport function mark(key: object): void {\n  seen.add(key);\n}\n"],
  [
    "a Map built inside a function",
    'export function make(): Map<string, number> {\n  const local = new Map<string, number>();\n  local.set("a", 1);\n  return local;\n}\n',
  ],
  [
    "a shadowing local mutated inside a function",
    "const queue: string[] = [];\nexport function other(): number {\n  const queue = [1];\n  queue.push(2);\n  return queue.length;\n}\n",
  ],
  ["a clock read inside a function", "export function now(): number {\n  return Date.now();\n}\n"],
] as const)("passes %s", async ([, source]) => {
  expect(await findings(source)).toEqual([]);
});

test("the population: every server source, minus the named own-process files; other packages are out of scope", async () => {
  expect(await findings(WRITTEN_MAP, "packages/server/src/infra/network/x.ts")).toHaveLength(1);
  expect(await findings(WRITTEN_MAP, "packages/server/src/domain/chat/persistence/x.ts")).toHaveLength(1);
  expect(await findings(WRITTEN_MAP, "packages/server/src/infra/plugin-host/broker-entry.ts")).toEqual([]);
  expect(await findings(WRITTEN_MAP, "packages/inference/src/backends/x.ts")).toEqual([]);
  expect(await findings(WRITTEN_MAP, "packages/client/src/x.ts")).toEqual([]);
});
