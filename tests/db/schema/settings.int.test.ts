// settings.int — the settings (global KV) + user_settings + themes slice against a real libSQL :memory:
// db (FK enforcement ON). Covers: the global KV round-trip (JSON value) + the key PK collision, the
// user_settings round-trip with the load-bearing schema_version COLUMN (default + threaded as
// storedVersion into parseUserSettings), the userId PK/FK + its cascade-on-user-delete, and the `themes`
// table's owner-cascade + lenient-parse-at-the-read-seam invariant (themes-design.md §6 invariants 5/7).

import { DEFAULT_USER_SETTINGS, parseUserSettings, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { themeOverrideSchema } from "@orb/contracts/theme";
import { settings, themes, userSettings, users } from "@orb/db";
import { isConstraintViolation } from "@orb/db/kit";
import type { ThemeId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import { freshDb } from "../../support/db";
import { expect, test } from "../../support/fixtures";
import { seedUser } from "./_support.ts";

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
  const userId = await seedUser(db, { id: "user_settings_owner" });

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

// The owner-global `RegexScript[]` blob round-trip is GONE with its carrier (D121-E): the owner's script
// library is `regex_scripts` rows + the `global_regex_scripts` junction, covered by `schema/regex.int.test.ts`.

test("user_settings is keyed by userId (the PK is also the FK; a duplicate collides)", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_settings_owner" });
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
    await db.insert(userSettings).values({ userId: castId<UserId>("user_does_not_exist"), config: DEFAULT_USER_SETTINGS });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("deleting the user cascades away their settings row", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_settings_owner" });
  await db.insert(userSettings).values({ userId, config: DEFAULT_USER_SETTINGS });

  await db.delete(users).where(eq(users.id, userId));

  const remaining = await db.select().from(userSettings).where(eq(userSettings.userId, userId));
  expect(remaining).toHaveLength(0);
});

test("deleting the user cascades away their OWNED themes; a seed (NULL owner) survives", async () => {
  const db = await freshDb();
  const userId = await seedUser(db, { id: "user_themes_owner" });
  const ownedId = castId<ThemeId>("theme_owned_x");
  const seedId = castId<ThemeId>("theme_seed_x");
  await db.insert(themes).values([
    { id: ownedId, ownerId: userId, name: "Mine", override: {} },
    { id: seedId, ownerId: null, name: "Hearth", override: {} },
  ]);

  await db.delete(users).where(eq(users.id, userId));

  const remainingOwned = await db.select().from(themes).where(eq(themes.id, ownedId));
  expect(remainingOwned).toHaveLength(0);
  const remainingSeed = await db.select().from(themes).where(eq(themes.id, seedId));
  expect(remainingSeed).toHaveLength(1);
});

test("themes.ownerId FK rejects a missing user", async () => {
  const db = await freshDb();
  let caught: unknown;
  try {
    await db.insert(themes).values({
      id: castId<ThemeId>("theme_orphan"),
      ownerId: castId<UserId>("user_does_not_exist"),
      name: "Orphan",
      override: {},
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("foreign-key");
});

test("a duplicate (ownerId, name) rejects; two DIFFERENT owners may share a name", async () => {
  const db = await freshDb();
  const a = await seedUser(db, { id: "user_theme_a" });
  const b = await seedUser(db, { id: "user_theme_b" });
  await db.insert(themes).values({
    id: castId<ThemeId>("theme_a1"),
    ownerId: a,
    name: "Mine",
    override: {},
  });
  // Same owner, same name → unique violation.
  let caught: unknown;
  try {
    await db.insert(themes).values({
      id: castId<ThemeId>("theme_a2"),
      ownerId: a,
      name: "Mine",
      override: {},
    });
  } catch (err) {
    caught = err;
  }
  expect(isConstraintViolation(caught)?.kind).toBe("unique");
  // A DIFFERENT owner reusing the same name is fine.
  await expect(
    db.insert(themes).values({
      id: castId<ThemeId>("theme_b1"),
      ownerId: b,
      name: "Mine",
      override: {},
    }),
  ).resolves.toBeDefined();
});

test("a hand-corrupted override blob reads as defaults at the seam (never throws)", async () => {
  const db = await freshDb();
  const id = castId<ThemeId>("theme_corrupt");
  // biome-ignore lint/suspicious/noExplicitAny: a deliberately hostile stored blob past the wire type.
  const corrupt = { accent: "javascript:alert(1)", font: "NotAllowlisted" } as any;
  await db.insert(themes).values({ id, ownerId: null, name: "Corrupt", override: corrupt });

  const rows = await db.select().from(themes).where(eq(themes.id, id));
  const row = rows[0];
  expect(row).toBeDefined();
  // The lenient read seam (themeOverrideSchema.catch({}) at projection, mirrored here directly against
  // the raw column) degrades per-field to undefined rather than throwing.
  const parsed = themeOverrideSchema.catch({}).parse(row?.override);
  expect(parsed.accent).toBeUndefined();
  expect(parsed.font).toBeUndefined();
});
