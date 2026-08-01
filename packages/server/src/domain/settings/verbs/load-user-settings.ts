// verb: loadUserSettings — the lenient "read this user's typed blob" loader chat + workloads inject
// cross-feature (un-exiled from neo's `_shared/user-settings.ts`). Takes a RAW `userId` (the triggering
// user resolved upstream by the caller) — NOT a gated user-facing verb, so no Principal here; the
// composition root injects it into `chat.context` / the discovery workload contributions. Returns the parsed
// `UserSettings` (the corruption-guarding `storedVersion` thread happens inside `readUserSettings`).

import type { SettingsContext, SettingsService } from "../contract/service";
import { readUserSettings } from "../persistence/queries";

export function createLoadUserSettings(ctx: SettingsContext): SettingsService["loadUserSettings"] {
  return async (userId) => (await readUserSettings(ctx.db, userId)).config;
}
