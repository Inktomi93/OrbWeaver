// domain/settings/contract/views — the read-models callers receive (core/Core-0-Architecture-and-Structure.md §4 "what shape does the
// client get?"). `UserSettingsView.config` is ALWAYS the parsed+defaulted `UserSettings` contract, never a
// raw blob (`persistence/queries` is the only projection and routes through
// `parseUserSettings`). `GlobalSettingView.value` is honest `JsonValue` (Json-validated at the read seam).
// `ThemeView` (themes-design.md §3.2/§4) mirrors the `preset` `PresetSummary`/`isSystemDefault` pattern:
// `isSeed` is DERIVED from `ownerId IS NULL` at projection — never a stored column (§2.1).

import type { UserSettings } from "@orb/contracts/settings";
import type { ThemeOverride } from "@orb/contracts/theme";
import type { ThemeId, UserId } from "@orb/kit/ids";
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

/** The theme-library read-model (themes-design.md §3.2/§4). `isSeed` DERIVES from `ownerId IS NULL` (the
 *  caller never sees the raw owner or the domain-internal sentinel ids). */
export interface ThemeView {
  readonly id: ThemeId;
  readonly name: string;
  /** Lenient-parsed (per-field `.catch`) at the read seam — a corrupt stored blob degrades to defaults,
   *  never throws (invariant 5). */
  readonly override: ThemeOverride;
  readonly css: string | null;
  /** Derived (`ownerId IS NULL`) — a seed palette is un-editable/un-deletable BY CONSTRUCTION (§2.1). */
  readonly isSeed: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}
