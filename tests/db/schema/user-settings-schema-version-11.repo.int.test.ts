// The user_settings rebuild that moves the schema_version default to the current settings version and drops the
// updated_at wall-clock default: every stored row keeps its version, its config bytes (unreadable text included) and
// its stamp, and the rebuilt table is the one a fresh database gets.
// @subject packages/db/src/schema/settings.ts
import { USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { assertReferentialIntegrity, createDb, runMigrations } from "@orb/db";
import { createIdSource } from "@orb/kit/ids";
import { createSeededIds } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { migrationsBefore, ownDb, SHIPPED_MIGRATIONS } from "@orb/testkit/node/composed";
import { seedUser } from "@orb/testkit/node/rows";
import { sql } from "drizzle-orm";

const MIGRATION = "0023_user-settings-schema-version-11";
const OLDER_VERSION = USER_SETTINGS_SCHEMA_VERSION - 1;
const NOT_JSON = '{"theme": {"selectedThemeId": tr';
const UNICODE_CONFIG = JSON.stringify({ profile: { flankCollapsed: true }, prose: { note: "Ève \u{1F409} 夜" } });

interface StoredSettingsRow {
  readonly userId: string;
  readonly schemaVersion: number;
  readonly config: string;
  readonly updatedAt: number;
}

async function storedRows(db: Db): Promise<readonly StoredSettingsRow[]> {
  return await db.all<StoredSettingsRow>(
    sql`select user_id as userId, schema_version as schemaVersion, config, updated_at as updatedAt from user_settings order by user_id`,
  );
}

/** The table's stored definition, which the migrated and the fresh database must share. */
async function settingsTableShape(db: Db): Promise<unknown> {
  return {
    master: await db.all(sql`select type, name, tbl_name, sql from sqlite_master where tbl_name = 'user_settings' order by type, name`),
    columns: await db.all(sql`select * from pragma_table_info('user_settings') order by cid`),
    keys: await db.all(sql`select * from pragma_foreign_key_list('user_settings') order by id, seq`),
  };
}

test("the rebuild keeps every user_settings row byte for byte and takes the current version as its default", async () => {
  await using previous = await migrationsBefore(MIGRATION);
  using opened = ownDb(await createDb(":memory:"));
  const db = opened.db;
  await runMigrations(db, previous.path);
  const ids = createIdSource(createSeededIds().next);
  const planted = [
    { config: "{}", schemaVersion: OLDER_VERSION, updatedAt: 1_700_000_000_000 },
    { config: UNICODE_CONFIG, schemaVersion: USER_SETTINGS_SCHEMA_VERSION, updatedAt: 1_700_000_000_001 },
    { config: NOT_JSON, schemaVersion: OLDER_VERSION, updatedAt: 1_700_000_000_002 },
  ];
  const expected: StoredSettingsRow[] = [];
  for (const row of planted) {
    const owner = await seedUser(db, {}, ids);
    await db.run(
      sql`insert into user_settings (user_id, schema_version, config, updated_at) values (${owner.id}, ${row.schemaVersion}, ${row.config}, ${row.updatedAt})`,
    );
    expected.push({ userId: owner.id, ...row });
  }
  expected.sort((a, b) => a.userId.localeCompare(b.userId));

  await runMigrations(db, SHIPPED_MIGRATIONS);

  expect(await storedRows(db)).toEqual(expected);
  await expect(assertReferentialIntegrity(db)).resolves.toBeUndefined();
  const columns = await db.all<{ readonly name: string; readonly defaultValue: string | null }>(
    sql`select name, dflt_value as defaultValue from pragma_table_info('user_settings')`,
  );
  expect(Object.fromEntries(columns.map(({ name, defaultValue }) => [name, defaultValue]))).toMatchObject({
    ["schema_version"]: String(USER_SETTINGS_SCHEMA_VERSION),
    ["updated_at"]: null,
  });

  using fresh = ownDb(await createDb(":memory:"));
  await runMigrations(fresh.db, SHIPPED_MIGRATIONS);
  expect(await settingsTableShape(db)).toEqual(await settingsTableShape(fresh.db));
});
