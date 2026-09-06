// domain/settings/contract/views — the read-models callers receive. UserSettingsView.config is always
// the parsed+defaulted UserSettings contract, never a raw blob. isSeed derives from ownerId IS NULL at
// projection and isDefault from the default palette's sentinel id — both derived, never stored columns.

import type { UserSettings } from "@orb/contracts/settings";
import type { ThemeOverride } from "@orb/contracts/theme";
import type { VersionedParseFailure } from "@orb/contracts/versioned-config";
import type { ThemeId, UserId } from "@orb/kit/ids";
import type { JsonValue } from "@orb/kit/json";

/** A never-touched account reads defaults with updatedAt: 0 and no row written. */
export interface UserSettingsView {
  userId: UserId;
  schemaVersion: number;
  config: UserSettings;
  updatedAt: number;
  /**
   * WHY THE `config` ABOVE MAY NOT BE THIS USER'S (#1716) — `null` ⇒ the stored blob was read faithfully
   * (and, for a never-written account, there is nothing to fail to read: absence is not corruption);
   * a failure kind ⇒ `config` is a STAND-IN and every settings write derived from it is refused with
   * `stored_config_unreadable` (`#kit/stored-config`, the #471 guard).
   *
   * Projected from the SAME `userSettingsConfig.parseOutcome(row.config, row.schemaVersion)` call
   * `writeUserConfig` makes, so the state a settings pane renders cannot disagree with the refusal its
   * save would produce. The KIND crosses because the repairs differ: a `version-from-future` blob is
   * intact data an older build cannot represent, the rest is corruption. Leak-free — a verdict about the
   * blob, never its contents.
   *
   * NOTE (#1771): settings has no repair door at all today — the backup restore
   * (`verbs/import-user-settings.ts`) read-merges and hits the same guard — so the client states the
   * condition and offers no reset it cannot honor.
   */
  configUnreadable: VersionedParseFailure | null;
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
