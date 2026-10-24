// Settings seeds run the production verbs and return their outcomes; rows-tier twins in `rows/settings.ts` read the rows.

import type { userSeedLedger, userSettings } from "@orb/db";
import type { SettingsService } from "@orb/server/domain/settings";
import type { ServerProducerRoot } from "../server.ts";

export type UserSettingsRow = typeof userSettings.$inferSelect;
export type UserSeedLedgerRow = typeof userSeedLedger.$inferSelect;

/** Run the section write; the merged view it returns is the seed's result. */
export async function seedUserSettings(
  root: ServerProducerRoot,
  params: Parameters<SettingsService["updateUserSettingsSection"]>[0],
): Promise<Awaited<ReturnType<SettingsService["updateUserSettingsSection"]>>> {
  return await root.services.settings.updateUserSettingsSection(params);
}
