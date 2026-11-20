// `pnpm unwired removed-keys` fails a deletion branch while a removed contract key still has a sender in the client,
// the plugins or e2e; a plain-word key, or one another contract still declares, is listed for a person, never failed on.
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@orb/testkit/tooling";
import { execFixtureGit, FIXTURE_GIT_IDENTITY } from "@orb/tooling/floor/git/git-fixture";
import { checkRemovedKeys } from "../../../tooling/src/unwired/removed-keys.ts";

const CONTRACT = "packages/contracts/src/chat/send.ts";
const BEFORE = [
  "export interface SendInput {",
  "  readonly chatId: string;",
  "  readonly guidedPick?: string;",
  "  readonly pageLimit?: number;",
  "  readonly draft?: string;",
  "}",
].join("\n");
const AFTER = ["export interface SendInput {", "  readonly chatId: string;", "}"].join("\n");
// `pageLimit` stays declared by another contract, so its hits may be that contract's; `draft` is a plain word.
const OTHER = ["export interface ListInput {", "  readonly pageLimit?: number;", "}"].join("\n");

const commit = (repo: string, files: Readonly<Record<string, string>>, message: string): void => {
  for (const [file, text] of Object.entries(files)) {
    writeFileSync(join(repo, file), text);
    execFixtureGit(repo, ["add", file]);
  }
  execFixtureGit(repo, ["commit", "-qm", message]);
};

async function deletionBranch(plantedTree: (tree: Record<string, string>) => Promise<string>, senders: Readonly<Record<string, string>>): Promise<string> {
  const repo = await plantedTree({
    [CONTRACT]: BEFORE,
    "packages/contracts/src/list.ts": OTHER,
    "packages/client/src/send.ts": "export const send = { chatId: 'c' };\n",
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
  commit(repo, { [CONTRACT]: AFTER, ...senders }, "remove guidedPick, pageLimit and draft");
  return repo;
}

test("a removed key with a sender in the client, a showcase plugin or e2e fails the branch", { timeout: 60_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {
    "packages/client/src/send.ts": "export const send = { chatId: 'c', guidedPick: 'g', pageLimit: 3, draft: 'd' };\n",
    "packages/showcase-plugins/src/main.ts": "export const plugin = (input: { guidedPick: string }) => input.guidedPick;\n",
    "tests/e2e/send.spec.ts": "export const spec = { guidedPick: 'g' };\n",
  });
  const report = checkRemovedKeys(repo, "main", "HEAD");
  expect(report.failed).toBe(true);
  const guidedPick = report.removed.find((entry) => entry.key === "guidedPick");
  expect(guidedPick?.ambiguous).toBe(false);
  expect(guidedPick?.hits.map(({ receiver, at }) => `${receiver} ${at}`)).toEqual([
    "client packages/client/src/send.ts:1",
    "plugins packages/showcase-plugins/src/main.ts:1",
    "e2e tests/e2e/send.spec.ts:1",
  ]);
  expect(report.removed.filter((entry) => entry.ambiguous).map(({ key, hits }) => `${key} ${hits.length}`)).toEqual(["draft 1", "pageLimit 1"]);
  expect(report.scanned).toEqual({ client: 1, plugins: 1, e2e: 1 });
});

test("a branch whose removed keys have no sender, or only an ambiguous one, passes", { timeout: 60_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, { "packages/client/src/send.ts": "export const send = { chatId: 'c', pageLimit: 3 };\n" });
  const report = checkRemovedKeys(repo, "main", "HEAD");
  expect(report.removed.map(({ key, ambiguous, hits }) => `${key} ${ambiguous} ${hits.length}`)).toEqual([
    "draft true 0",
    "guidedPick false 0",
    "pageLimit true 1",
  ]);
  expect(report.failed).toBe(false);
});

test("a key moved to another contract file is listed as removed from its old home, for a person to read", { timeout: 60_000 }, async ({ plantedTree }) => {
  const repo = await deletionBranch(plantedTree, {
    "packages/contracts/src/list.ts": ["export interface ListInput {", "  readonly pageLimit?: number;", "  readonly guidedPick?: string;", "}"].join("\n"),
    "packages/client/src/send.ts": "export const send = { chatId: 'c', guidedPick: 'g' };\n",
  });
  const report = checkRemovedKeys(repo, "main", "HEAD");
  expect(report.removed.map(({ key, ambiguous, hits }) => `${key} ${ambiguous} ${hits.length}`)).toEqual([
    "draft true 0",
    "guidedPick true 1",
    "pageLimit true 0",
  ]);
  expect(report.failed).toBe(false);
});
