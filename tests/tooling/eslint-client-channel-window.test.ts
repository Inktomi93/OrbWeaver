import { join } from "node:path";
import { expect, test } from "@orb/testkit/node/tool-fixtures.ts";
import { ESLint, Linter } from "eslint";
import tseslint from "typescript-eslint";
import { beforeAll } from "vitest";

const ROOT = join(import.meta.dirname, "../..");
const CHANNEL = "orb/session-channel-boundary";
const WINDOW = "orb/windowed-infinite-query";
const FEATURE = "packages/client/src/features/chat/lib/sync.ts";
const eslint = new ESLint({ flags: ["unstable_native_nodejs_ts_config"], cwd: ROOT });

// The first config calculation loads the whole repo config; it must not bill to a test's timeout.
beforeAll(async () => {
  await eslint.calculateConfigForFile(join(ROOT, FEATURE));
}, 120_000);

async function findings(rule: string, source: string, path = FEATURE): Promise<readonly Linter.LintMessage[]> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  const found = new Linter({ cwd: ROOT }).verify(
    source,
    {
      files: ["**/*.{ts,tsx}"],
      plugins: config?.plugins ?? {},
      // The client program's DOM lib declares BroadcastChannel as a scope variable, as the real typed parse does.
      languageOptions: { parser: tseslint.parser, parserOptions: { project: false, projectService: false, programs: null, lib: ["esnext", "dom"] } },
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

async function inScope(rule: string, path: string): Promise<boolean> {
  const config = await eslint.calculateConfigForFile(join(ROOT, path));
  return config?.rules?.[rule]?.[0] === 2;
}

test.for([
  ["a feature constructing its own channel", 'export const rogue = new BroadcastChannel("chat:sync");\n', 1],
  ["a const alias of the global", 'const BC = BroadcastChannel;\nexport const c = new BC("chat:sync");\n', 1],
  ["the globalThis receiver", 'export const c = new globalThis.BroadcastChannel("chat:sync");\n', 1],
  ["the window receiver, computed", 'export const c = new window["BroadcastChannel"]("chat:sync");\n', 1],
  ["a casted ambient receiver", 'export const c = new (globalThis as typeof globalThis).BroadcastChannel("chat:sync");\n', 1],
  ["a non-null ambient receiver", 'export const c = new self!.BroadcastChannel("chat:sync");\n', 1],
  ["a satisfies-wrapped ambient receiver", 'export const c = new (window satisfies Window)["BroadcastChannel"]("chat:sync");\n', 1],
  ["an angle-asserted ambient receiver", 'export const c = new (<typeof globalThis>globalThis).BroadcastChannel("chat:sync");\n', 1],
  ["an alias of a wrapped ambient constructor", 'const BC = (globalThis as typeof globalThis).BroadcastChannel;\nexport const c = new BC("chat:sync");\n', 1],
  [
    "a written local copied off globalThis",
    'let BroadcastChannel = globalThis.BroadcastChannel;\nBroadcastChannel = self.BroadcastChannel;\nexport const c = new BroadcastChannel("x");\n',
    2,
  ],
] as const)("the channel rule reports %s", async ([, source, count]) => {
  expect(await findings(CHANNEL, source)).toHaveLength(count);
});

test.for([
  [
    "a project class sharing the global's name",
    'export class BroadcastChannel {\n  constructor(public readonly name: string) {}\n}\nexport const c = new BroadcastChannel("shim");\n',
  ],
  ["a local const aliasing another global", "const BroadcastChannel = Map;\nexport const c = new BroadcastChannel<string, number>();\n"],
  [
    "an injected port member",
    'export function open(deps: { BroadcastChannel: new (name: string) => unknown }): unknown {\n  return new deps.BroadcastChannel("chat:sync");\n}\n',
  ],
  [
    "an injected port named window",
    'export function open(window: { BroadcastChannel: new (name: string) => unknown }): unknown {\n  return new window.BroadcastChannel("chat:sync");\n}\n',
  ],
  [
    "an injected port named globalThis",
    'export function open(globalThis: { BroadcastChannel: new (name: string) => unknown }): unknown {\n  return new globalThis["BroadcastChannel"]("chat:sync");\n}\n',
  ],
  ["a local object named self", "const self = { BroadcastChannel: Map };\nexport const c = new self.BroadcastChannel();\n"],
  [
    "a wrapped injected port named window",
    'export function open(window: { BroadcastChannel: new (name: string) => unknown }): unknown {\n  return new (window as typeof window).BroadcastChannel("chat:sync");\n}\n',
  ],
  ["a type-only reference to the ambient constructor", "export type Channel = BroadcastChannel;\nexport type Constructor = typeof BroadcastChannel;\n"],
  ["an unrelated unresolved class", 'import { Thing } from "./missing.ts";\nexport const t = new Thing();\n'],
] as const)("the channel rule passes %s", async ([, source]) => {
  expect(await findings(CHANNEL, source)).toEqual([]);
});

test("the channel home is exempt and the rule is a client-tier fence", async () => {
  expect(await inScope(CHANNEL, FEATURE)).toBe(true);
  expect(await inScope(CHANNEL, "packages/client/src/lib/session-channel.ts")).toBe(false);
  expect(await inScope(CHANNEL, "packages/server/src/entry/app.ts")).toBe(false);
});

test.for([
  [
    "an inline cap",
    "export const q = (trpc) => trpc.character.list.infiniteQueryOptions({ limit: 30 }, { maxPages: 5, getNextPageParam: (p) => p.nextCursor });\n",
  ],
  [
    "a cap in a hoisted options const",
    "const OPTIONS = { maxPages: 5, getNextPageParam: (p) => p.nextCursor };\nexport const q = (trpc) => trpc.chat.list.infiniteQueryOptions({ limit: 30 }, OPTIONS);\n",
  ],
  ["a quoted key", 'export const q = (trpc) => trpc.chat.list.infiniteQueryOptions({ limit: 30 }, { "maxPages": 5 });\n'],
  ["a computed key", 'export const q = (trpc) => trpc.chat.list.infiniteQueryOptions({ limit: 30 }, { ["maxPages"]: 5 });\n'],
] as const)("the window rule reports %s", async ([, source]) => {
  expect(await findings(WINDOW, source)).toHaveLength(1);
});

test("the window rule passes a comment and a read of the name", async () => {
  expect(await findings(WINDOW, "// maxPages was deleted: the list is virtualized.\nexport const read = (o: { maxPages?: number }) => o.maxPages;\n")).toEqual(
    [],
  );
});

test("the window rule judges client source only", async () => {
  expect(await inScope(WINDOW, FEATURE)).toBe(true);
  expect(await inScope(WINDOW, "packages/server/src/domain/chat/verbs/list.ts")).toBe(false);
});
