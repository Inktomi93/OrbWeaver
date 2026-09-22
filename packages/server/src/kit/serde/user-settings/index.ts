// The one home for the orb-native user-settings-backup serde, both directions over one canonical shape.
// Pure: zero I/O, zero db. It maps a share-safe projection of `UserSettings` to/from the orb-native .json
// interchange bytes.
//
// The secrets fence: a settings export must be safe to share. The serde output type is a closed allowlist
// of share-safe namespaces — a credential/connection-source/auth field is structurally unrepresentable in
// the output (no key on `PortableUserSettings`, tsc-rejected). This is an allowlist, not a denylist: a new
// namespace added to `UserSettings` is excluded by default (the tuple is fixed, not derived), so a future
// sensitive namespace can never silently leak. Raw API keys/tokens/password hashes never live in
// user_settings at all (they are the credentials domain's, which has no portable entity); this fence is
// defense-in-depth over an already key-free blob.
//
// Restore is a per-namespace merge: parse yields only the namespaces the file actually carried, so the
// import verb never clobbers a namespace the file omitted.
//
// Round-trip drift guard: buildUserSettingsBackup(parseUserSettingsBackup(buildUserSettingsBackup(x)))
// deep-equals buildUserSettingsBackup(x).

import type { PortableParse } from "@orb/contracts/portability";
import type { UserSettings, UserSettingsSection } from "@orb/contracts/settings";
import { parseUserSettings, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";
import { z } from "zod";
import { defineJsonObjectSerde } from "#kit/serde/lib";

// The file-format version, distinct from the payload's USER_SETTINGS_SCHEMA_VERSION (which governs the
// namespace shapes and is handled inside parseUserSettings).
export const USER_SETTINGS_SCHEMA_KIND = "orb.user-settings";
export const USER_SETTINGS_BACKUP_SCHEMA_VERSION = 1;

// The allowlist (the fence) — the only share-safe UserSettings namespaces. Fixed, not derived from
// UserSettings, so a new namespace is excluded by default. Order = deterministic serialization order.
// Fenced out: routing (connection config), seeds/profile/theme entity-id refs, groupDefaults, onboarding,
// workloads, regex, schemaVersion.
export const SHARE_SAFE_SETTINGS_NAMESPACES = [
  "appearance",
  "theme",
  "memory",
  "chat",
  "persona",
  "worldInfo",
] as const satisfies readonly UserSettingsSection[];

/** The share-safe namespace union — the fence at the type level (a namespace not here is unrepresentable). */
export type ShareSafeSettingsNamespace = (typeof SHARE_SAFE_SETTINGS_NAMESPACES)[number];

/** The serde's closed output type: `UserSettings` narrowed to only the share-safe namespaces. */
export type PortableUserSettings = Pick<UserSettings, ShareSafeSettingsNamespace>;

/** Project a full `UserSettings` down to the share-safe allowlist (the runtime fence, mirroring the type
 *  fence). A credential/connection/auth field in any excluded namespace is never read, so it cannot reach
 *  the wire. */
export function projectShareSafe(full: UserSettings): PortableUserSettings {
  const out: Partial<PortableUserSettings> = {};
  for (const ns of SHARE_SAFE_SETTINGS_NAMESPACES) {
    copyNamespace(out, full, ns);
  }
  return out as PortableUserSettings;
}

/** Type-safe single-namespace copy (a union-indexed `dst[ns] = src[ns]` is rejected by tsc). */
function copyNamespace<K extends ShareSafeSettingsNamespace>(dst: Partial<PortableUserSettings>, src: PortableUserSettings, key: K): void {
  dst[key] = src[key];
}

/** Type-safe single-namespace copy into the parse output (same reason as `copyNamespace`). */
function takeNamespace<K extends ShareSafeSettingsNamespace>(dst: Partial<PortableUserSettings>, healed: UserSettings, key: K): void {
  dst[key] = healed[key];
}

/** The fence, applied at the wire boundary: only the allowlisted namespaces the file actually carried
 *  survive; any non-allowlisted key (a crafted `routing`/`credential`) is never read. */
function takeShareSafe(raw: unknown): Partial<PortableUserSettings> {
  const rawObj = isPlainObject(raw) ? raw : {};
  const healed = parseUserSettings(rawObj, USER_SETTINGS_SCHEMA_VERSION);
  const out: Partial<PortableUserSettings> = {};
  for (const ns of SHARE_SAFE_SETTINGS_NAMESPACES) {
    if (Object.hasOwn(rawObj, ns)) {
      takeNamespace(out, healed, ns);
    }
  }
  return out;
}

// The fence PROJECTION stays outside the spine (it is this family's security property, not a serde
// mechanic); the spine owns only the envelope, decode, and version gate.
const userSettingsSerde = defineJsonObjectSerde<Partial<PortableUserSettings>, { readonly settings: unknown }>({
  schemaKind: USER_SETTINGS_SCHEMA_KIND,
  schemaVersion: USER_SETTINGS_BACKUP_SCHEMA_VERSION,
  bodySchema: z.object({ settings: z.unknown() }),
  toWire: (safe) => {
    const settings: Record<string, unknown> = {};
    for (const ns of SHARE_SAFE_SETTINGS_NAMESPACES) {
      const value = safe[ns];
      if (value !== undefined) {
        settings[ns] = value;
      }
    }
    return { settings };
  },
  fromWire: (body) => takeShareSafe(body.settings),
});

/** Serialize a share-safe settings projection to the orb-native user-settings-backup JSON bytes (the
 *  inverse of `parseUserSettingsBackup`). Emits only the present allowlisted namespaces, in allowlist
 *  order. */
export function buildUserSettingsBackup(safe: Partial<PortableUserSettings>): Uint8Array {
  return userSettingsSerde.build(safe);
}

/** Parse orb-native user-settings-backup JSON bytes to a `Partial<PortableUserSettings>`, or the typed
 *  reason they were refused. */
export function parseUserSettingsBackup(bytes: Uint8Array): PortableParse<Partial<PortableUserSettings>> {
  return userSettingsSerde.parse(bytes);
}
