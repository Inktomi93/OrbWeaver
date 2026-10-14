// Settings writers retain version, stored-config integrity, pinned-asset and theme CSS/name belts.
import type { Db } from "@orb/db";
import { settings, themes, userSeedLedger, userSettings } from "@orb/db";
import type { SettingsService } from "@orb/server/domain/settings";
import type { seedUserContent } from "@orb/server/entry/boot";
import { eq } from "drizzle-orm";

export type GlobalSettingRow = typeof settings.$inferSelect;
export type UserSettingsRow = typeof userSettings.$inferSelect;
export type ThemeRow = typeof themes.$inferSelect;
export type UserSeedLedgerRow = typeof userSeedLedger.$inferSelect;

/** This internal raw-KV producer is not evidence of the transport's admin admission. */
export async function seedGlobalSetting(
  db: Db,
  setGlobalSetting: SettingsService["setGlobalSetting"],
  params: Parameters<SettingsService["setGlobalSetting"]>,
): Promise<GlobalSettingRow> {
  const view = await setGlobalSetting(...params);
  const row = await db.select().from(settings).where(eq(settings.key, view.key)).get();
  if (row === undefined) {
    throw new Error("production global-setting write left no canonical row");
  }
  return row;
}

export async function seedUserSettings(
  db: Db,
  updateUserSettingsSection: SettingsService["updateUserSettingsSection"],
  params: Parameters<SettingsService["updateUserSettingsSection"]>[0],
): Promise<UserSettingsRow> {
  const view = await updateUserSettingsSection(params);
  const row = await db.select().from(userSettings).where(eq(userSettings.userId, view.userId)).get();
  if (row === undefined) {
    throw new Error("production user-settings write left no canonical row");
  }
  return row;
}

export async function seedTheme(db: Db, createTheme: SettingsService["createTheme"], params: Parameters<SettingsService["createTheme"]>[0]): Promise<ThemeRow> {
  const view = await createTheme(params);
  const row = await db.select().from(themes).where(eq(themes.id, view.id)).get();
  if (row === undefined) {
    throw new Error("production theme creation left no canonical row");
  }
  return row;
}

/** Off/withheld/failed seed steps remain absent; only the composed seed policy records ledger keys. */
export async function seedUserContentLedger(
  db: Db,
  seed: typeof seedUserContent,
  params: Parameters<typeof seedUserContent>[0],
): Promise<readonly UserSeedLedgerRow[]> {
  await seed(params);
  return await db.select().from(userSeedLedger).where(eq(userSeedLedger.userId, params.owner.userId)).orderBy(userSeedLedger.itemKey);
}
