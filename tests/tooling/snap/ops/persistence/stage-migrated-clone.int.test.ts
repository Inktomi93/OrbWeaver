// @subject tooling/src/snap/ops/stage-source.ts
// The source runs a pre-migration schema where production verbs cannot run, so its rows are built directly.
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { createDb, hasPendingMigrations, localPath, preCloseHousekeeping, runMigrations } from "@orb/db";
import { createIdSource } from "@orb/kit/ids";
import { resolveDataLayout } from "@orb/server/foundation/data-layout";
import { createCas } from "@orb/server/infra/storage/cas";
import { createSeededIds } from "@orb/testkit/iso";
import { SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedUser } from "@orb/testkit/node/rows";
import { expect, test } from "@orb/testkit/tooling";
import { z } from "zod";
import { cloneMigratedStageDb } from "../../../../../tooling/src/snap/ops/stage-source.ts";

async function olderSource(
  parent: string,
  divergent = false,
): Promise<{
  readonly layout: ReturnType<typeof resolveDataLayout>;
  readonly user: Awaited<ReturnType<typeof seedUser>>;
  readonly bytes: Buffer;
  readonly asset: Awaited<ReturnType<ReturnType<typeof createCas>["putBytes"]>>;
}> {
  const migrations = join(parent, "older-migrations");
  await mkdir(join(migrations, "meta"), { recursive: true });
  const journal = z
    .object({
      version: z.string(),
      dialect: z.string(),
      entries: z.array(z.object({ idx: z.number(), version: z.string(), when: z.number(), tag: z.string(), breakpoints: z.boolean() })),
    })
    .parse(JSON.parse(await readFile(join(SHIPPED_MIGRATIONS, "meta/_journal.json"), "utf8")));
  await writeFile(join(migrations, "meta/_journal.json"), JSON.stringify({ ...journal, entries: journal.entries.slice(0, 1) }));
  await copyFile(join(SHIPPED_MIGRATIONS, "0000_baseline.sql"), join(migrations, "0000_baseline.sql"));
  if (divergent) {
    await writeFile(join(migrations, "0000_baseline.sql"), `${await readFile(join(migrations, "0000_baseline.sql"), "utf8")}\n-- divergent fixture baseline\n`);
  }
  const layout = resolveDataLayout({ ["DATA_DIR"]: join(parent, "source") });
  const source = await createDb(layout.databaseUrl);
  try {
    await runMigrations(source, migrations);
    const user = await seedUser(source, { role: "owner", passwordHash: "opaque-source-bound-password-hash" }, createIdSource(createSeededIds().next));
    const bytes = Buffer.from("existing synthetic asset bytes");
    const asset = await createCas(layout.assets).putBytes(user.id, bytes, user.createdAt);
    expect(await hasPendingMigrations(source, SHIPPED_MIGRATIONS)).toBe(true);
    return { layout, user, bytes, asset };
  } finally {
    await preCloseHousekeeping(source);
  }
}

test("a supported older source is migrated before current-schema scrubbing while preserving owner and assets", { tags: "slow" }, async ({ scratch }) => {
  const source = await olderSource(scratch);
  const path = localPath(source.layout.databaseUrl);
  if (path === undefined) {
    throw new Error("migration fixture source must be local");
  }
  const before = await readFile(path);
  const target = resolveDataLayout({ ["DATA_DIR"]: join(scratch, "clone") });
  await cloneMigratedStageDb(path, { databaseUrl: target.databaseUrl, assetsDir: target.assets });
  const clone = await createDb(target.databaseUrl);
  try {
    expect(await hasPendingMigrations(clone, SHIPPED_MIGRATIONS)).toBe(false);
    using native = new DatabaseSync(localPath(target.databaseUrl) ?? "");
    expect(native.prepare("SELECT id,handle,role,password_hash AS passwordHash FROM users").all()).toEqual([
      { id: source.user.id, handle: source.user.handle, role: source.user.role, passwordHash: null },
    ]);
    expect(native.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    expect(Buffer.from(await createCas(target.assets).read(source.user.id, source.asset.hash)).equals(source.bytes)).toBe(true);
  } finally {
    await preCloseHousekeeping(clone);
  }
  expect((await readFile(path)).equals(before)).toBe(true);
});

test("a divergent recorded baseline refuses a migrated clone without changing its source or offering a scrubbed fixture", async ({ scratch }) => {
  const source = await olderSource(scratch, true);
  const path = localPath(source.layout.databaseUrl);
  if (path === undefined) {
    throw new Error("migration fixture source must be local");
  }
  const before = await readFile(path);
  const target = resolveDataLayout({ ["DATA_DIR"]: join(scratch, "refused") });
  await expect(cloneMigratedStageDb(path, { databaseUrl: target.databaseUrl, assetsDir: target.assets })).rejects.toThrow(
    "refusing to auto-wipe a launched db",
  );
  expect((await readFile(path)).equals(before)).toBe(true);
});
