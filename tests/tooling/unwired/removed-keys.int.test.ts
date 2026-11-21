// `pnpm unwired removed-keys` fails a deletion branch only on a site the key resolver places on the shape the key was
// removed from, or on a key of a loose object that flows into one of our procedures. A same-named field of another
// shape is someone else's, and a body sent outside the repo is listed as unresolved, never failed on. A destination is
// the resolved callee: a tRPC verb the tRPC packages declare, a TanStack mutation built from a procedure, or a `fetch`
// whose URL, through a route constant, is a path on our own origin.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, plantedTsconfig, test } from "@orb/testkit/tooling";
import { execFixtureGit, FIXTURE_GIT_IDENTITY } from "@orb/tooling/floor/git/git-fixture";
import { checkRemovedKeys } from "../../../tooling/src/unwired/removed-keys.ts";
import { LIB, ZOD_STUB } from "./_planted.ts";

const WORLD = "tsconfig.json";
const CONTRACT = "packages/contracts/src/chat/send.ts";
const BEFORE = [
  'import { z } from "../z.ts";',
  "export interface SendInput {",
  "  readonly chatId: string;",
  "  readonly guidedPick?: string;",
  "}",
  "export const listInputSchema = z.object({ limit: z.string(), pageLimit: z.string().optional() });",
].join("\n");
const AFTER = [
  'import { z } from "../z.ts";',
  "export interface SendInput {",
  "  readonly chatId: string;",
  "}",
  "export const listInputSchema = z.object({ limit: z.string() });",
].join("\n");

// The tRPC packages' procedure verbs and TanStack's mutation, declared where the real ones are, so a call resolves to them.
const PACKAGES = {
  "node_modules/@trpc/client/package.json": '{ "name": "@trpc/client", "types": "index.d.ts" }',
  "node_modules/@trpc/client/index.d.ts": [
    "export interface MutationProcedure<I> { mutate(input: I): Promise<void>; mutationOptions(): { readonly input?: I } }",
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
  'import type { MutationProcedure, QueryProcedure } from "@trpc/client";',
  "type Loose = Readonly<Record<string, unknown>>;",
  "export declare const trpc: {",
  "  readonly chat: {",
  "    readonly send: MutationProcedure<{ readonly chatId: string; readonly intent?: Loose }>;",
  "    readonly list: QueryProcedure<Loose>;",
  "    readonly edit: MutationProcedure<Loose>;",
  "  };",
  "};",
].join("\n");
// The reason an open slot that reaches none of our procedures or routes is listed with.
const NO_DESTINATION = "open slot reaching none of our procedures or routes";

const commit = (repo: string, files: Readonly<Record<string, string>>, message: string): void => {
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(join(repo, file), text);
    execFixtureGit(repo, ["add", file]);
  }
  execFixtureGit(repo, ["commit", "-qm", message]);
};

async function deletionBranch(plantedTree: (tree: Record<string, string>) => Promise<string>, senders: Readonly<Record<string, string>>): Promise<string> {
  const repo = await plantedTree({
    // The DOM lib declares `fetch`, so a route call resolves to the platform's as the client's does.
    [WORLD]: plantedTsconfig({ lib: [...LIB, "DOM"], include: ["packages", "tests"] }),
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

const check = (repo: string): ReturnType<typeof checkRemovedKeys> => checkRemovedKeys({ root: repo, base: "main", head: "HEAD", worlds: [WORLD] });
const entry = (report: ReturnType<typeof checkRemovedKeys>, key: string): ReturnType<typeof checkRemovedKeys>["removed"][number] | undefined =>
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
  const report = check(repo);
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
  const report = check(repo);
  expect(report.removed.map(({ key, senders, loose, other }) => `${key} ${senders.length} ${loose.length} ${other}`)).toEqual([
    "guidedPick 0 0 1",
    "pageLimit 0 0 3",
  ]);
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
  const guidedPick = entry(check(repo), "guidedPick");
  expect(guidedPick?.senders.map(({ at }) => at)).toEqual(["packages/client/src/send.ts:4"]);
  expect(guidedPick?.other).toBe(1);
});

test("a body sent to an outside API is unresolved and passes", { timeout: 120_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {
    "packages/showcase-plugins/src/main.ts": [
      "declare function postJson(url: string, body: Readonly<Record<string, unknown>>): Promise<unknown>;",
      "export const sent = postJson('https://api.example.com/v1', { guidedPick: 'g' });",
    ].join("\n"),
  });
  const report = check(repo);
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
    "}",
  ].join("\n");
  const failing = check(await deletionBranch(plantedTree, { "tests/e2e/send.spec.ts": sender }));
  expect(entry(failing, "guidedPick")?.loose.map(({ at, destination }) => `${at} ${destination}`)).toEqual(["tests/e2e/send.spec.ts:4 trpc chat.send"]);
  expect(failing.failed).toBe(true);
  const passing = check(await deletionBranch(plantedTree, { "tests/e2e/send.spec.ts": outside }));
  expect(entry(passing, "guidedPick")?.loose).toEqual([]);
  expect(entry(passing, "guidedPick")?.unresolved.map(({ at, reason }) => `${at} ${reason}`)).toEqual([`tests/e2e/send.spec.ts:3 ${NO_DESTINATION}`]);
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
  const guidedPick = entry(check(await deletionBranch(plantedTree, SENDS)), "guidedPick");
  expect(guidedPick?.loose.map(({ at, destination }) => `${at} ${destination}`).toSorted()).toEqual([
    "packages/client/src/mutation.ts:6 trpc chat.edit",
    "packages/client/src/query.ts:4 trpc chat.list",
    "packages/client/src/route.ts:5 http /api/chat/send",
    "packages/client/src/route.ts:8 http /api/upload",
  ]);
  expect(guidedPick?.unresolved.map(({ at, reason }) => `${at} ${reason}`).toSorted()).toEqual([
    `packages/client/src/loose.ts:3 ${NO_DESTINATION}`,
    `packages/client/src/store.ts:4 ${NO_DESTINATION}`,
  ]);
});

test("the check refuses a head other than the checked-out commit, and a working tree that differs from it", { timeout: 120_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {});
  expect(() => checkRemovedKeys({ root: repo, base: "main", head: "main", worlds: [WORLD] })).toThrow("check out main first");
  expect(check(repo).failed).toBe(false);
  writeFileSync(join(repo, "packages/client/src/send.ts"), "export const send = { guidedPick: 'g' };\n");
  expect(() => check(repo)).toThrow("differs from HEAD");
});
