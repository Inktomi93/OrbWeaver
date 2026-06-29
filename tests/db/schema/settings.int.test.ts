// settings.int — the settings (global KV) + user_settings slice against a real libSQL :memory: db (FK
// enforcement ON). Covers: the global KV round-trip (JSON value) + the key PK collision, the
// user_settings round-trip with the load-bearing schema_version COLUMN (default + threaded as
// storedVersion into parseUserSettings), and the userId PK/FK + its cascade-on-user-delete.

import { regexScriptSchema } from "@orb/contracts/regex";
import {
  DEFAULT_USER_SETTINGS,
  parseUserSettings,
  USER_SETTINGS_SCHEMA_VERSION,
} from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { isConstraintViolation, settings, userSettings, users } from "@orb/db";
import type { Handle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";

async function seedUser(db: Db, raw = "user_settings_owner"): Promise<UserId> {
  const id = castId<UserId>(raw);
  await db.insert(users).values({ id, handle: castId<Handle>(raw) });
  return id;
}

test("the global settings KV round-trips a JSON value on its natural key", async () => {
  const db = await freshDb();
  const value = { logLevel: "info", forbidExternalMedia: true };

  await db.insert(settings).values({ key: "app", value });

  const rows = await db.select().from(settings).where(eq(settings.key, "app"));
  expect(rows).toHaveLength(1);
  expect(rows[0]?.value).toEqual(value);
});

test("the global settings key PK rejects a duplicate key", async () => {
  const db = await freshDb();
  await db.insert(settings).values({ key: "openrouter-model-catalog", value: { models: [] } });

  let caught: unknown;
  try {
    await db.insert(settings).values({ key: "openrouter-model-catalog", value: { models: [1] } });
  } catch (err) {
    caught = err;
  }
  // SQLite reports a duplicate PRIMARY KEY as "UNIQUE constraint failed" → classifier kind is "unique".
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("user_settings round-trips; the schema_version COLUMN defaults to current + feeds parseUserSettings", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);

  await db.insert(userSettings).values({ userId, config: DEFAULT_USER_SETTINGS });

  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  expect(rows).toHaveLength(1);
  const row = rows[0];
  // The load-bearing column defaults to the current version (it BEATS the in-blob probe).
  expect(row?.schemaVersion).toBe(USER_SETTINGS_SCHEMA_VERSION);
  // The column is threaded into the parser as `storedVersion` (the corruption guard).
  const parsed = parseUserSettings(row?.config, row?.schemaVersion);
  expect(parsed.schemaVersion).toBe(USER_SETTINGS_SCHEMA_VERSION);
  expect(parsed.routing).toBeDefined();
});

test("the owner-global RegexScript[] round-trips through the user_settings config blob (D53)", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, "user_regex_owner");

  await db.insert(userSettings).values({
    userId,
    config: {
      ...DEFAULT_USER_SETTINGS,
      regexScripts: [
        regexScriptSchema.parse({
          id: "rx_global",
          name: "owner global",
          findRegex: "foo",
          replaceString: "bar",
          placement: ["USER_INPUT", "AI_OUTPUT"],
        }),
      ],
    },
  });

  const rows = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  const parsed = parseUserSettings(rows[0]?.config, rows[0]?.schemaVersion);
  expect(parsed.regexScripts).toHaveLength(1);
  expect(parsed.regexScripts[0]?.id).toBe("rx_global");
  expect(parsed.regexScripts[0]?.placement).toEqual(["USER_INPUT", "AI_OUTPUT"]);
});

test("user_settings is keyed by userId (the PK is also the FK; a duplicate collides)", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);
  await db.insert(userSettings).values({ userId, config: DEFAULT_USER_SETTINGS });

  let caught: unknown;
  try {
    await db.insert(userSettings).values({ userId, config: DEFAULT_USER_SETTINGS });
  } catch (err) {
    caught = err;
  }
  // SQLite reports a duplicate PRIMARY KEY as "UNIQUE constraint failed" → classifier kind is "unique".
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
});

test("the userId FK rejects a missing user", async () => {
  const db = await freshDb();

  let caught: unknown;
  try {
    await db
      .insert(userSettings)
      .values({ userId: castId<UserId>("user_does_not_exist"), config: DEFAULT_USER_SETTINGS });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("deleting the user cascades away their settings row", async () => {
  const db = await freshDb();
  const userId = await seedUser(db);
  await db.insert(userSettings).values({ userId, config: DEFAULT_USER_SETTINGS });

  await db.delete(users).where(eq(users.id, userId));

  const remaining = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  expect(remaining).toHaveLength(0);
});
