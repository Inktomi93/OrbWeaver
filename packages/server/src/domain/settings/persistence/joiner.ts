// D259 — a sign-up joiner's first settings row as one unexecuted statement for chat's signup batch: the shipped
// defaults with the current and default persona aimed at the persona the same batch created. It writes only where
// the statement before it changed a row, so a refused signup leaves no settings row behind.

import type { UserSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { userSettings } from "@orb/db";
import type { AwaitableBatchStmt } from "@orb/db/kit";
import type { PersonaId, UserId } from "@orb/kit/ids";
import { sql } from "drizzle-orm";

export function insertJoinerSettingsStatement(
  db: Db,
  row: { readonly ownerId: UserId; readonly personaId: PersonaId; readonly at: number },
): AwaitableBatchStmt<{ userId: UserId }[]> {
  const config: UserSettings = {
    ...DEFAULT_USER_SETTINGS,
    seeds: { ...DEFAULT_USER_SETTINGS.seeds, currentPersonaId: row.personaId, defaultPersonaId: row.personaId },
  };
  return db
    .insert(userSettings)
    .select(sql`select ${row.ownerId}, ${USER_SETTINGS_SCHEMA_VERSION}, ${JSON.stringify(config)}, ${row.at} where changes() > 0`)
    .returning({ userId: userSettings.userId });
}
