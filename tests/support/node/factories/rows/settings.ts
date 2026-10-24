// Settings rows a production verb left, read behind the rows door for persistence-tier and corpus captures.

import { userSeedLedger, userSettings } from "@orb/db";
import type { SettingsService } from "@orb/server/domain/settings";
import { seedUserContent } from "@orb/server/entry/boot";
import { eq } from "drizzle-orm";
import type { ServerProducerRoot } from "../../server.ts";
import type { UserSeedLedgerRow, UserSettingsRow } from "../settings.ts";

/** Off/withheld/failed seed steps remain absent; only the composed seed policy records ledger keys. */
export async function seedUserContentLedgerRows(
  root: ServerProducerRoot,
  owner: Parameters<typeof seedUserContent>[0]["owner"],
): Promise<readonly UserSeedLedgerRow[]> {
  await seedUserContent({ seeder: root.app.contentSeeder, owner });
  return await root.db.select().from(userSeedLedger).where(eq(userSeedLedger.userId, owner.userId)).orderBy(userSeedLedger.itemKey);
}

/** This internal raw-KV producer is not evidence of the transport's admin admission. */
export async function seedUserSettingsRows(
  root: ServerProducerRoot,
  params: Parameters<SettingsService["updateUserSettingsSection"]>[0],
): Promise<UserSettingsRow> {
  const db = root.db;
  const updateUserSettingsSection = root.services.settings.updateUserSettingsSection;
  const view = await updateUserSettingsSection(params);
  const row = await db.select().from(userSettings).where(eq(userSettings.userId, view.userId)).get();
  if (row === undefined) {
    throw new Error("production user-settings write left no canonical row");
  }
  return row;
}
