// domain/settings/contract/views — the read-models callers receive. UserSettingsView.config is always
// the parsed+defaulted UserSettings contract, never a raw blob. isSeed derives from ownerId IS NULL at
// projection and isDefault from the default palette's sentinel id — both derived, never stored columns.

import type { UserSettings } from "@orb/contracts/settings";
import type { ThemeOverride } from "@orb/contracts/theme";
import type { ThemeId, UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";

/** A never-touched account reads defaults with updatedAt: 0 and no row written. */
export interface UserSettingsView {
  userId: UserId;
  schemaVersion: number;
  config: UserSettings;
  updatedAt: number;
}

export interface GlobalSettingView {
  key: string;
  value: JsonValue;
  updatedAt: number;
}

export interface ThemeView {
  readonly id: ThemeId;
  readonly name: string;
  /** Lenient-parsed at the read seam — a corrupt stored blob degrades to defaults, never throws. */
  readonly override: ThemeOverride;
  readonly css: string | null;
  /** Derived (ownerId IS NULL) — a seed palette is un-editable/un-deletable by construction. */
  readonly isSeed: boolean;
  /** Derived (the row IS the default palette's sentinel row) — what `theme.selectedThemeId: null` resolves
   *  to. The sentinel id stays domain-internal (`../constants.ts`); this flag is what crosses (#1671). */
  readonly isDefault: boolean;
  readonly createdAt: number;
  readonly updatedAt: number;
}
