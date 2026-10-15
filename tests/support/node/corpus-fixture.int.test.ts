// @subject tests/support/node/corpus.ts
import { access, mkdtemp, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { localPath } from "@orb/db";
import { cloneCorpusFixture, loadCorpusFixture } from "@orb/testkit/node/corpus.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { processEnvValue } from "@orb/tooling/floor/process/process-env";

const publication = processEnvValue("CORPUS_PUBLICATION_FIXTURE");

async function firstFile(root: string): Promise<string> {
  for (const entry of await readdir(root, { recursive: true })) {
    if ((await stat(join(root, entry))).isFile()) {
      return entry;
    }
  }
  throw new Error("Published native corpus has no copied CAS file");
}

test("a separately published corpus reloads into independent disposable DB/CAS consumers without altering its durable bytes", async () => {
  const source = loadCorpusFixture(publication);
  const sourceDatabase = localPath(source.layout.databaseUrl);
  if (sourceDatabase === undefined) {
    throw new Error("The published fixture has no local database");
  }
  const databaseBytes = await readFile(sourceDatabase);
  const wireBytes = await readFile(join(source.layout.root, "corpus.json"));
  const asset = await firstFile(source.layout.assets);
  const assetBytes = await readFile(join(source.layout.assets, asset));
  const parent = await mkdtemp(join(tmpdir(), "orb-corpus-consumers-"));
  await using ownership = new AsyncDisposableStack();
  ownership.defer(() => rm(parent, { recursive: true, force: true }));
  const first = ownership.use(await cloneCorpusFixture(source, join(parent, "first")));
  const second = ownership.use(await cloneCorpusFixture(loadCorpusFixture(publication), join(parent, "second")));
  expect(first.wire).toEqual(source.wire);
  expect(second.wire).toEqual(source.wire);
  const firstDatabase = localPath(first.layout.databaseUrl);
  if (firstDatabase === undefined) {
    throw new Error("The consumer has no local database");
  }
  const db = new DatabaseSync(firstDatabase);
  try {
    for (const table of ["user_credentials", "sessions", "session_entries", "oidc_transactions", "oidc_pending_signups", "chat_invites"]) {
      expect(db.prepare(`SELECT count(*) AS n FROM ${table}`).get()).toEqual({ n: 0 });
    }
    expect(db.prepare("SELECT count(*) AS n FROM users WHERE password_hash IS NOT NULL").get()).toEqual({ n: 0 });
    db.exec("CREATE TABLE consumer_only (value TEXT NOT NULL)");
  } finally {
    db.close();
  }
  await writeFile(join(first.layout.assets, asset), "consumer-owned replacement");
  await first[Symbol.asyncDispose]();
  await expect(access(first.layout.root)).rejects.toMatchObject({ code: "ENOENT" });
  expect((await readFile(join(second.layout.assets, asset))).equals(assetBytes)).toBe(true);
  expect((await readFile(join(source.layout.assets, asset))).equals(assetBytes)).toBe(true);
  expect((await readFile(sourceDatabase)).equals(databaseBytes)).toBe(true);
  expect((await readFile(join(source.layout.root, "corpus.json"))).equals(wireBytes)).toBe(true);
  expect(loadCorpusFixture(publication).wire).toEqual(source.wire);
  await second[Symbol.asyncDispose]();
  await expect(access(second.layout.root)).rejects.toMatchObject({ code: "ENOENT" });
  await access(source.layout.root);
});
