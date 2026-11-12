// The two whole-blob settings writers refuse to overwrite a stored blob this build cannot read, and leave its bytes,
// because every caller builds the next blob from a read that degrades such a blob to defaults.
// @subject packages/server/src/domain/settings/persistence/queries.ts
import { APP_SETTINGS_SCHEMA_VERSION, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { settings, userSettings } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { plantForeignSettingsBytes } from "@orb/testkit/node/composed";
import { eq } from "drizzle-orm";
import { APP_SETTINGS_KEY } from "#server/domain/settings/contract/keys.ts";
import { STORED_CONFIG_UNREADABLE } from "#server/primitives/stored-config/index.ts";

const USER_CORRUPTIONS = ["future-version", "not-an-object"] as const;

test.for(USER_CORRUPTIONS)("a section write refuses a %s settings blob and leaves its bytes", async (corruption, { harness }) => {
  const principal = await harness.principalFor(harness.ownerId);
  const write = (): Promise<unknown> =>
    harness.services.settings.updateUserSettingsSection({ principal, input: { section: "profile", patch: { flankCollapsed: true } } });
  await write();
  if (corruption === "future-version") {
    await harness.db
      .update(userSettings)
      .set({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION + 1 })
      .where(eq(userSettings.userId, harness.ownerId));
  } else {
    await plantForeignSettingsBytes(harness, harness.ownerId, '["profile"]');
  }
  const stored = async (): Promise<unknown> => await harness.db.select().from(userSettings).where(eq(userSettings.userId, harness.ownerId));
  const before = await stored();

  await expect(write()).rejects.toMatchObject({ code: STORED_CONFIG_UNREADABLE });
  expect(await stored()).toEqual(before);

  // The repair door does not descend from a read, so it is not refused, and section writes work again after it.
  await harness.services.settings.resetUserConfig({ principal });
  await write();
  expect(await stored()).not.toEqual(before);
});

test("an app settings write refuses an override row from a newer build and leaves it", async ({ harness }) => {
  const principal = await harness.principalFor(harness.ownerId);
  const write = (): Promise<unknown> => harness.services.settings.updateAppSettings({ principal, partial: { localMultiUser: true } });
  // An absent override row is the first write, and proceeds.
  await write();
  await harness.db
    .update(settings)
    .set({ value: { schemaVersion: APP_SETTINGS_SCHEMA_VERSION + 1 } })
    .where(eq(settings.key, APP_SETTINGS_KEY));
  const stored = async (): Promise<unknown> => await harness.db.select().from(settings).where(eq(settings.key, APP_SETTINGS_KEY));
  const before = await stored();

  await expect(write()).rejects.toMatchObject({ code: STORED_CONFIG_UNREADABLE });
  expect(await stored()).toEqual(before);
});
