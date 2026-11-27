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
//
// The file's version IS the payload's settings version, so the import reads the payload through the same lifts a
// stored row runs. A lift that changes what a present key means (auto-continue's switch folded into its count) would
// otherwise misread an old file as today's shape. A file from a newer build is refused by name by the spine's version
// gate. A file written before the stamp says version 1 and carries no settings version; its payload is read as the last
// settings version before the stamp.

import type { PortableParse } from "@orb/contracts/portability";
import { USER_SETTINGS_SCHEMA_KIND } from "@orb/contracts/portability";
import type { UserSettings, UserSettingsSection } from "@orb/contracts/settings";
import { parseUserSettings, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";
import { z } from "zod";
import { defineJsonObjectSerde } from "#primitives/serde/lib";

// The file version every backup written before the stamp carries, and the settings version its payload was read at.
const PRE_STAMP_FILE_VERSION = 1;
const PRE_STAMP_SETTINGS_VERSION = 10;

// The settings version a file's payload was written at.
function payloadSettingsVersion(fileVersion: number): number {
  return fileVersion === PRE_STAMP_FILE_VERSION ? PRE_STAMP_SETTINGS_VERSION : fileVersion;
}

// The allowlist (the fence) — the only share-safe UserSettings namespaces. Fixed, not derived from
// UserSettings, so a new namespace is excluded by default. Order = deterministic serialization order.
// Fenced out: `schemaVersion` and every other member of `USER_SETTINGS_SECTIONS`.
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

/** Type-safe single-namespace copy (a union-indexed `dst[ns] = src[ns]` is rejected by tsc, (`pnpm typecheck`)). */
function copyNamespace<K extends ShareSafeSettingsNamespace>(dst: Partial<Pick<PortableUserSettings, K>>, src: Pick<PortableUserSettings, K>, key: K): void {
  dst[key] = src[key];
}

/** Type-safe single-namespace copy into the parse output (same reason as `copyNamespace`). */
function takeNamespace<K extends ShareSafeSettingsNamespace>(dst: Partial<Pick<PortableUserSettings, K>>, healed: Pick<UserSettings, K>, key: K): void {
  dst[key] = healed[key];
}

/** The fence, applied at the wire boundary: only the allowlisted namespaces the file actually carried
 *  survive; any non-allowlisted key (a crafted `routing`/`credential`) is never read. */
function takeShareSafe(raw: unknown, settingsVersion: number): Partial<PortableUserSettings> {
  const rawObj = isPlainObject(raw) ? raw : {};
  const healed = parseUserSettings(rawObj, settingsVersion);
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
// The envelope gate has already accepted `schemaVersion` (a positive integer no newer than this build's) before the body
// parse reads it here.
const userSettingsSerde = defineJsonObjectSerde<Partial<PortableUserSettings>, { readonly schemaVersion: number; readonly settings: unknown }>({
  schemaKind: USER_SETTINGS_SCHEMA_KIND,
  schemaVersion: USER_SETTINGS_SCHEMA_VERSION,
  bodySchema: z.object({ schemaVersion: z.int().positive(), settings: z.unknown() }).strip(),
  toWire: (safe) => {
    const settings: Record<string, unknown> = {};
    for (const ns of SHARE_SAFE_SETTINGS_NAMESPACES) {
      const value = safe[ns];
      if (value !== undefined) {
        settings[ns] = value;
      }
    }
    return { schemaVersion: USER_SETTINGS_SCHEMA_VERSION, settings };
  },
  fromWire: (body) => takeShareSafe(body.settings, payloadSettingsVersion(body.schemaVersion)),
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
