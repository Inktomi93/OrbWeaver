// verb: getUserSettings — read this user's typed/defaulted UserSettings (per-user tier). Scoped to
// `params.principal.userId` (a user reads ONLY its own row). A never-touched account reads the parsed
// defaults synthesized from `{}` with NO write (`updatedAt: 0`) — a pure read never materializes the row.

import type { SettingsContext, SettingsService } from "../contract/service.ts";
import { readUserSettings } from "../persistence/queries.ts";

export function createGetUserSettings(ctx: SettingsContext): SettingsService["getUserSettings"] {
  return (params) => readUserSettings(ctx.db, params.principal.userId);
}
