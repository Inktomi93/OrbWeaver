// `pnpm unwired removed-keys` fails a deletion branch only on a site the key resolver places on the shape the key was
// removed from, or on a key of a loose object that flows into one of our procedures. A same-named field of another
// shape is someone else's, and a body sent outside the repo is listed as unresolved, never failed on.
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

// The client's tRPC proxy, typed by procedure as the real one is.
const TRPC = [
  "export declare const trpc: {",
  "  readonly chat: { readonly send: { mutate(input: { readonly chatId: string; readonly intent?: Readonly<Record<string, unknown>> }): Promise<void> } };",
  "};",
].join("\n");

const commit = (repo: string, files: Readonly<Record<string, string>>, message: string): void => {
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(join(repo, file), text);
    execFixtureGit(repo, ["add", file]);
  }
  execFixtureGit(repo, ["commit", "-qm", message]);
};

async function deletionBranch(plantedTree: (tree: Record<string, string>) => Promise<string>, senders: Readonly<Record<string, string>>): Promise<string> {
  const repo = await plantedTree({
    [WORLD]: plantedTsconfig({ lib: LIB, include: ["packages", "tests"] }),
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
    "packages/showcase-plugins/src/main.ts:2 open slot sent outside the repo",
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
  expect(entry(passing, "guidedPick")?.unresolved.map(({ at, reason }) => `${at} ${reason}`)).toEqual([
    "tests/e2e/send.spec.ts:3 open slot sent outside the repo",
  ]);
  expect(passing.failed).toBe(false);
});
