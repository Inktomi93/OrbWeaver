// domain/settings/contract/views — the read-models callers receive (core/Core-0-Architecture-and-Structure.md §4 "what shape does the
// client get?"). `UserSettingsView.config` is ALWAYS the parsed+defaulted `UserSettings` contract, never a
// raw blob (invariant #8 — `persistence/queries` is the only projection and routes through
// `parseUserSettings`). `GlobalSettingView.value` is honest `JsonValue` (Json-validated at the read seam).

import type { UserSettings } from "@orb/contracts/settings";
import type { UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";

/** The per-user settings read-model. `config` is the parsed contract; `schemaVersion`/`updatedAt` are the
 *  stored row's (a never-touched account reads defaults with `updatedAt: 0` and NO row written). */
export interface UserSettingsView {
  userId: UserId;
  schemaVersion: number;
  config: UserSettings;
  updatedAt: number;
}

/** One raw global-KV row (the `settings` table escape hatch). `value` is Json-validated, not `unknown`. */
export interface GlobalSettingView {
  key: string;
  value: JsonValue;
  updatedAt: number;
}
