// The ONE contract-shaped `settings.getUserSettings` CT fixture (#1017). `UserSettingsView.config` is
// ALWAYS the parsed+defaulted `UserSettings` contract (packages/server/src/domain/settings/contract/
// views.ts:11 — "never a raw blob"). A stub built by hand from a bare partial object
// (`{ config: { seeds: { defaultPresetId } } }`) is invisible to `trpc.unstubbed()` — the read WAS
// served — and silently absorbed by every consumer that reads through a `??` fallback, right up until
// the first consumer that dereferences a section the partial omitted (e.g.
// `data.config.appearance.backgroundLibrary`) throws straight inside an unrelated component's
// QueryBoundary (#1014, commit 820000ef7). `userSettingsView` builds the WHOLE view from
// `DEFAULT_USER_SETTINGS` (the contract's own `userSettingsSchema.parse({})`), and a per-knob override
// SPREADS the section's own contract default rather than replacing the section —
// `userSettingsView({ chat: { offerChoices: true } })` yields a full `ChatSettings`, never a one-key
// object.
//
// `userSettingsSchema.parse` re-validates the assembled config before it is handed back — the companion
// pin #1017 asked for, adjusted to what this schema actually does (measured, not assumed): the
// `UserSettings` tier is deliberately lenient TOP TO BOTTOM (every field carries its own `.catch()` +
// `.default()`/`.prefault()` — "a stale/deleted id degrades at consumption", the section headers say so
// themselves), so `.parse()` on a bare partial HEALS rather than throws — `userSettingsSchema.parse({
// seeds: { defaultPresetId: "x" } })` already yields a fully-defaulted `UserSettings`. A loud throw was
// never on the table for this schema; the defect #1014 pinned was that the OLD hand-rolled stub never
// called `.parse()` AT ALL — it shipped the bare object over the wire as-is, so `"appearance" in
// theStub` was `false`. Running every stub through `.parse()` here guarantees the fixture's shape is
// BYTE-IDENTICAL to what the production `getUserSettings` verb actually returns for that same partial —
// the healing is the fix, not a thrown error. Plain TS module (no `test`/`expect`), so
// `test-fixture-imports`'s door rule does not apply — it lives under tests/support/, the gate's own
// exempt root.

import type { UserSettings } from "@orb/contracts/settings";
import { DEFAULT_USER_SETTINGS, userSettingsSchema } from "@orb/contracts/settings";
import type { VersionedParseFailure } from "@orb/contracts/versioned-config";
import type { UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";

/** Module-local — a CT that needs a DIFFERENT viewer id passes `view.userId` rather than reaching for
 *  this; an exported id nobody imports is a knip orphan. */
const CT_SETTINGS_USER_ID = castId<UserId>("user_ct_settings");

/** Per-SECTION override: an object-valued section (`appearance`, `chat`, `seeds`, …) spreads under its
 *  own contract default; a primitive-valued key (`schemaVersion`) replaces outright. Never a bare
 *  replacement that drops every sibling key in the section. */
export type UserSettingsOverrides = {
  readonly [K in keyof UserSettings]?: UserSettings[K] extends object ? Partial<UserSettings[K]> : UserSettings[K];
};

/**
 * The WHOLE parsed+defaulted `UserSettings`, with each named section's override spread under ITS OWN
 * contract default. `userSettingsConfig({ seeds: { defaultPresetId: "preset_x" } })` carries every other
 * `seeds` field (and every OTHER section) at the shipped default — the shape #1014's fix pinned by hand,
 * generalized to every section.
 */
export function userSettingsConfig(overrides: UserSettingsOverrides = {}): UserSettings {
  const merged: Record<string, unknown> = { ...DEFAULT_USER_SETTINGS };
  for (const [key, value] of Object.entries(overrides)) {
    const base = (DEFAULT_USER_SETTINGS as Record<string, unknown>)[key];
    merged[key] = value !== null && typeof value === "object" && base !== null && typeof base === "object" ? { ...base, ...value } : value;
  }
  // The healing gate: whatever `merged` looks like, this always returns a byte-complete `UserSettings` —
  // the same defaulting production's read verb performs — instead of the raw, possibly-incomplete
  // object a hand-rolled stub used to ship straight over the wire (#1014).
  return userSettingsSchema.parse(merged);
}

/** The full `UserSettingsView` a `settings.getUserSettings` stub answers with — `config` is always
 *  `userSettingsConfig(overrides)`, never a raw blob.
 *
 *  `configUnreadable` defaults to `null` — the stub says "the stored blob read fine", which is what every
 *  existing story means. A story that wants the #1716 state passes the failure kind, and passing one is the
 *  ONLY way to get it: the field is REQUIRED here rather than optional so a stub cannot silently omit the
 *  server's verdict and leave a surface asserting a state the wire never carries. */
export function userSettingsView(
  overrides: UserSettingsOverrides = {},
  view: {
    readonly userId?: UserId;
    readonly schemaVersion?: number;
    readonly updatedAt?: number;
    readonly configUnreadable?: VersionedParseFailure;
  } = {},
): { userId: UserId; schemaVersion: number; config: UserSettings; updatedAt: number; configUnreadable: VersionedParseFailure | null } {
  return {
    userId: view.userId ?? CT_SETTINGS_USER_ID,
    schemaVersion: view.schemaVersion ?? 1,
    config: userSettingsConfig(overrides),
    updatedAt: view.updatedAt ?? 0,
    configUnreadable: view.configUnreadable ?? null,
  };
}

/** The at-rest fixture — every knob at its shipped default. Most `settings.getUserSettings` stubs want
 *  exactly this; a test with a knob to flip calls `userSettingsView({ ... })` instead. */
export const USER_SETTINGS_VIEW: {
  userId: UserId;
  schemaVersion: number;
  config: UserSettings;
  updatedAt: number;
  configUnreadable: VersionedParseFailure | null;
} = userSettingsView();
