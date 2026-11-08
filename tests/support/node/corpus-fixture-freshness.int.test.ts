// The committed corpus was captured on the shipped migration chain, and a capture behind that chain is refused with the
// migrations it lacks named. A clone migrates a stale capture forward silently, so only this check reports it.

import { mkdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createDb, localPath, runMigrations } from "@orb/db";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import { z } from "zod";
import { assertCorpusFresh, loadCorpusFixture, readCorpusFreshness } from "./corpus.ts";
import { migrationsBeforeLatest, ownFileDb, SHIPPED_MIGRATIONS } from "./db.ts";
import { expect, test } from "./fixtures.ts";
import { ownedTempDir } from "./temp-dir.ts";

const JOURNAL = z.looseObject({ entries: z.array(z.looseObject({ tag: z.string() })) });

test("the committed corpus capture matches the shipped migration chain and its schema", async () => {
  const freshness = await readCorpusFreshness(loadCorpusFixture());

  expect(freshness).toEqual({ lag: [], drift: [] });
});

test("a capture taken before the newest migration fails the check, which names that migration", async () => {
  await using owner = new AsyncDisposableStack();
  await using chain = await migrationsBeforeLatest();
  const shipped = JOURNAL.parse(JSON.parse(await readFile(join(SHIPPED_MIGRATIONS, "meta", "_journal.json"), "utf8")));
  const newest = shipped.entries.at(-1)?.tag;
  if (newest === undefined) {
    throw new Error("the shipped chain has no migrations");
  }
  const layout = resolveDataLayout({ ["DATA_DIR"]: join(await ownedTempDir(owner, "orb-corpus-lag-"), "capture") });
  const file = localPath(layout.databaseUrl);
  if (file === undefined) {
    throw new Error("a capture layout names a file database");
  }
  await mkdir(dirname(file), { recursive: true });
  {
    await using captured = ownFileDb(await createDb(layout.databaseUrl));
    await runMigrations(captured.db, chain.path);
  }

  const freshness = await readCorpusFreshness({ layout });

  expect(freshness.lag).toEqual([newest]);
  expect(() => assertCorpusFresh(freshness)).toThrow(new RegExp(`lags the migration chain by 1: ${RegExp.escape(newest)}`, "u"));
});
