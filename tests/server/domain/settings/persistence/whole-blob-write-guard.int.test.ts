// The two whole-blob settings writers refuse to overwrite a stored blob this build cannot read, and leave its bytes,
// because every caller builds the next blob from a read that degrades such a blob to defaults. The read names the
// failure so the settings pane offers its repair door, and that door works.
// @subject packages/server/src/domain/settings/persistence/queries.ts
// @subject packages/server/src/domain/settings/verbs/export-user-settings.ts
// @subject packages/db/src/custom-types/index.ts
import { APP_SETTINGS_SCHEMA_VERSION, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import type { VersionedParseFailure } from "@orb/contracts/versioned-config";
import { VERSIONED_PARSE_FAILURES } from "@orb/contracts/versioned-config";
import { settings, userSettings } from "@orb/db";
import { expect, test } from "@orb/testkit/node";
import { plantForeignSettingsBytes } from "@orb/testkit/node/composed";
import type { SQL } from "drizzle-orm";
import { eq, sql } from "drizzle-orm";
import { APP_SETTINGS_KEY } from "#server/domain/settings/contract/keys.ts";
import { STORED_CONFIG_UNREADABLE } from "#server/primitives/stored-config/index.ts";

// Text a truncated write leaves behind: no JSON parser reads it.
const NOT_JSON = '{"profile": {"flankCollapsed": tr';

const USER_CORRUPTIONS = ["future-version", "not-an-object", "not-json"] as const;
type PlantArgs = Parameters<typeof plantForeignSettingsBytes>;
interface Corruption {
  readonly plant: (root: PlantArgs[0], ownerId: PlantArgs[1]) => Promise<unknown>;
  readonly failure: VersionedParseFailure;
}

// One plant per corruption, with the failure the read names; a new member fails `tsc` until it has one.
const CORRUPTIONS: Record<(typeof USER_CORRUPTIONS)[number], Corruption> = {
  "future-version": {
    plant: async (root, ownerId) =>
      await root.db
        .update(userSettings)
        .set({ schemaVersion: USER_SETTINGS_SCHEMA_VERSION + 1 })
        .where(eq(userSettings.userId, ownerId)),
    failure: VERSIONED_PARSE_FAILURES.versionFromFuture,
  },
  "not-an-object": {
    plant: async (root, ownerId) => await plantForeignSettingsBytes(root, ownerId, '["profile"]'),
    failure: VERSIONED_PARSE_FAILURES.notAnObject,
  },
  "not-json": { plant: async (root, ownerId) => await plantForeignSettingsBytes(root, ownerId, NOT_JSON), failure: VERSIONED_PARSE_FAILURES.notJson },
};

test.for(USER_CORRUPTIONS)(
  "a %s settings blob reads as unreadable, refuses a section write and keeps its bytes until reset",
  async (corruption, { harness }) => {
    const principal = await harness.principalFor(harness.ownerId);
    const write = (): Promise<unknown> =>
      harness.services.settings.updateUserSettingsSection({ principal, input: { section: "profile", patch: { flankCollapsed: true } } });
    await write();
    await CORRUPTIONS[corruption].plant(harness, harness.ownerId);
    // The stored text itself, read past the column's decoding.
    const stored = async (): Promise<unknown> =>
      await harness.db
        .select({ text: sql<string>`${userSettings.config}`, version: userSettings.schemaVersion })
        .from(userSettings)
        .where(eq(userSettings.userId, harness.ownerId));
    const before = await stored();

    expect((await harness.services.settings.getUserSettings({ principal })).configUnreadable).toBe(CORRUPTIONS[corruption].failure);
    await expect(write()).rejects.toMatchObject({ code: STORED_CONFIG_UNREADABLE });
    expect(await stored()).toEqual(before);

    // The repair door does not descend from a read, so it is not refused, and section writes work again after it.
    expect((await harness.services.settings.resetUserConfig({ principal })).configUnreadable).toBeNull();
    await write();
    expect(await stored()).not.toEqual(before);
  },
);

const APP_CORRUPTIONS = ["future-version", "not-json"] as const;
const PLANT_APP_CORRUPTION: Record<(typeof APP_CORRUPTIONS)[number], SQL | { readonly schemaVersion: number }> = {
  "future-version": { schemaVersion: APP_SETTINGS_SCHEMA_VERSION + 1 },
  "not-json": sql`${NOT_JSON}`,
};

test.for(APP_CORRUPTIONS)("an app settings write refuses a %s override row and leaves it", async (corruption, { harness }) => {
  const principal = await harness.principalFor(harness.ownerId);
  const write = (): Promise<unknown> => harness.services.settings.updateAppSettings({ principal, partial: { localMultiUser: true } });
  // An absent override row is the first write, and proceeds.
  await write();
  await harness.db.update(settings).set({ value: PLANT_APP_CORRUPTION[corruption] }).where(eq(settings.key, APP_SETTINGS_KEY));
  const stored = async (): Promise<unknown> =>
    await harness.db
      .select({ text: sql<string>`${settings.value}` })
      .from(settings)
      .where(eq(settings.key, APP_SETTINGS_KEY));
  const before = await stored();

  await expect(write()).rejects.toMatchObject({ code: STORED_CONFIG_UNREADABLE });
  expect(await stored()).toEqual(before);
});

test.for(USER_CORRUPTIONS)(
  "the settings backup export refuses a %s blob instead of writing defaults as the user's settings",
  async (corruption, { harness }) => {
    const principal = await harness.principalFor(harness.ownerId);
    await harness.services.settings.updateUserSettingsSection({ principal, input: { section: "profile", patch: { flankCollapsed: true } } });
    const descriptor = harness.app.portability.find((entity) => entity.kind === "user-settings");
    if (descriptor === undefined) {
      throw new Error("the production graph omitted the user-settings portability descriptor");
    }
    const exportAll = async (): Promise<number> => {
      let files = 0;
      for await (const _file of descriptor.exportAll(harness.ownerId)) {
        files += 1;
      }
      return files;
    };
    // Positive control: the intact blob exports.
    expect(await exportAll()).toBe(1);

    await CORRUPTIONS[corruption].plant(harness, harness.ownerId);
    await expect(exportAll()).rejects.toMatchObject({ code: STORED_CONFIG_UNREADABLE });
  },
);
