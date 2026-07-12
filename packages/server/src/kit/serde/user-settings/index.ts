// @orb/server/kit/serde/user-settings — the ONE home for the orb-native user-settings-backup serde, BOTH
// directions over ONE canonical shape (the card/chat/tag-serde precedent). PURE: zero I/O, zero db. It maps a
// share-safe PROJECTION of `UserSettings` to/from the orb-native `.json` interchange bytes.
//
// THE SECRETS FENCE (export-import-portability.md §4 W-settings / R3 — a settings export MUST be safe to
// SHARE). The serde output type is a CLOSED ALLOWLIST of share-safe namespaces — `PortableUserSettings =
// Pick<UserSettings, ShareSafeSettingsNamespace>`. A credential / connection-source / auth field is
// STRUCTURALLY UNREPRESENTABLE in the output: it lives in a namespace that is NOT in the allowlist, so it has
// no key on `PortableUserSettings` and `tsc` rejects any attempt to carry it. This is an ALLOWLIST, not a
// denylist — a NEW namespace added to `UserSettings` is EXCLUDED BY DEFAULT (the tuple is fixed, not derived
// from `UserSettings`), so a future sensitive namespace can never silently leak; it must be explicitly added
// here (and this file's fence test re-read) before it can travel. `satisfies readonly UserSettingsSection[]`
// pins every allowlisted name to a REAL settings namespace, so a typo or a removed namespace fails `tsc`.
//
// FENCED OUT (excluded by construction — never share-safe): `routing` (the per-role provider assignments —
// `credential.source` / model / api / provider-routing = CONNECTION config), `seeds` / `profile` / `theme`-
// adjacent ENTITY-ID references that dangle on another box, `groupDefaults` (a chat-domain shape), `onboarding`
// (one-shot "has fired" latches), `workloads` (niche tuning), `regexScripts` (array-valued user content),
// `schemaVersion` (the payload's own version scalar — the file carries its OWN envelope version instead). Raw
// API keys / tokens / password hashes never live in `user_settings` at all (they are the `credentials`
// domain's, which has NO portable entity by design — R10); this fence is defense-in-depth over an already
// key-free blob.
//
// RESTORE = per-namespace MERGE (R7): parse yields ONLY the namespaces the file actually carried
// (`Partial<PortableUserSettings>`), so the import verb merges just those into the owner's settings and never
// clobbers a namespace the file omitted.
//
// Round-trip drift guard: buildUserSettingsBackup(parseUserSettingsBackup(buildUserSettingsBackup(x)))
// deep-equals buildUserSettingsBackup(x) — pinned in the mirror test (the SERIALIZED bytes are the fixed
// point; allowlist iteration order + `parseUserSettings`'s schema-order normalization make it byte-identical).

import type { UserSettings, UserSettingsSection } from "@orb/contracts/settings";
import { parseUserSettings, USER_SETTINGS_SCHEMA_VERSION } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";
import { z } from "zod";

// The wire discriminant + the FILE-FORMAT version (distinct from the payload's `USER_SETTINGS_SCHEMA_VERSION`
// — that governs the namespace SHAPES and is handled inside `parseUserSettings`; this versions the envelope).
export const USER_SETTINGS_SCHEMA_KIND = "orb.user-settings";
export const USER_SETTINGS_BACKUP_SCHEMA_VERSION = 1;

// ── THE ALLOWLIST (the fence) — the ONLY share-safe UserSettings namespaces. Fixed, NOT derived from
//    `UserSettings`, so a new namespace is excluded by default (fail-safe). Order = the deterministic
//    serialization order. `satisfies readonly UserSettingsSection[]` compile-checks each is a real namespace.
export const SHARE_SAFE_SETTINGS_NAMESPACES = [
  "appearance", // display-only prefs (fonts/sizes/color-refs/toggles) — D44 §12.1
  "theme", // the active-theme REFERENCE (selectedThemeId; dangling id degrades to default on another box)
  "memory", // the per-user memory opt-out (enabled)
  "chat", // chat behavior/display prefs (autoContinue/autoSwipe/stopping-strings — ST power_user parity)
  "persona", // persona UX prefs (showNotifications)
  "worldInfo", // world-info scan levers (scanDepth/tokenBudget — pure numeric behavior prefs)
] as const satisfies readonly UserSettingsSection[];

/** The share-safe namespace union — the fence at the TYPE level (a namespace not here is unrepresentable). */
export type ShareSafeSettingsNamespace = (typeof SHARE_SAFE_SETTINGS_NAMESPACES)[number];

/** The serde's CLOSED output type: `UserSettings` narrowed to ONLY the share-safe namespaces. A
 *  credential/connection/auth field lives in an excluded namespace, so it has no key here — structurally
 *  unrepresentable, `tsc`-checked. The build/parse halves both flow through this type. */
export type PortableUserSettings = Pick<UserSettings, ShareSafeSettingsNamespace>;

// ── build (Partial<PortableUserSettings> → JSON bytes) ─────────────────────────────────────────────────────

/**
 * Project a full `UserSettings` down to the share-safe allowlist (the RUNTIME fence, mirroring the type
 * fence). Copies ONLY the allowlisted namespaces — a credential/connection/auth field in any excluded
 * namespace is never read, so it cannot reach the wire. The export verb calls this, then `buildUserSettingsBackup`.
 * PURE.
 */
export function projectShareSafe(full: UserSettings): PortableUserSettings {
  const out: Partial<PortableUserSettings> = {};
  for (const ns of SHARE_SAFE_SETTINGS_NAMESPACES) {
    copyNamespace(out, full, ns);
  }
  return out as PortableUserSettings;
}

/** Type-safe single-namespace copy (a union-indexed `dst[ns] = src[ns]` is rejected by `tsc`; a generic key
 *  parameter makes the write sound). `src` is a `UserSettings` (a structural supertype of the picked type). */
function copyNamespace<K extends ShareSafeSettingsNamespace>(
  dst: Partial<PortableUserSettings>,
  src: PortableUserSettings,
  key: K,
): void {
  dst[key] = src[key];
}

/**
 * Serialize a share-safe settings projection to the orb-native user-settings-backup JSON bytes (the inverse of
 * `parseUserSettingsBackup`). Emits ONLY the present allowlisted namespaces, in allowlist order, under the
 * `{schemaKind, schemaVersion}` envelope; UTF-8 encoded, deterministic. PURE.
 */
export function buildUserSettingsBackup(safe: Partial<PortableUserSettings>): Uint8Array {
  const settings: Record<string, unknown> = {};
  for (const ns of SHARE_SAFE_SETTINGS_NAMESPACES) {
    const value = safe[ns];
    if (value !== undefined) {
      settings[ns] = value;
    }
  }
  const wire = {
    schemaKind: USER_SETTINGS_SCHEMA_KIND,
    schemaVersion: USER_SETTINGS_BACKUP_SCHEMA_VERSION,
    settings,
  };
  return new TextEncoder().encode(JSON.stringify(wire, null, 2));
}

// ── parse (JSON bytes → Partial<PortableUserSettings> | null) ──────────────────────────────────────────────

// The envelope: the discriminant is REQUIRED and must match (a foreign file → parse null); `settings` is a
// permissive object (each allowlisted namespace re-validated below via the lenient `parseUserSettings`).
const wireBackupSchema = z.object({
  schemaKind: z.literal(USER_SETTINGS_SCHEMA_KIND),
  schemaVersion: z.number().int().positive(),
  settings: z.unknown(),
});

function decodeJson(bytes: Uint8Array): unknown {
  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    return null;
  }
}

/** Type-safe single-namespace copy into the parse output (same `tsc` soundness reason as `copyNamespace`). */
function takeNamespace<K extends ShareSafeSettingsNamespace>(
  dst: Partial<PortableUserSettings>,
  healed: UserSettings,
  key: K,
): void {
  dst[key] = healed[key];
}

/**
 * Parse orb-native user-settings-backup JSON bytes to a `Partial<PortableUserSettings>`, or null when the
 * bytes are not a user-settings-backup file (non-JSON, or a `schemaKind` that is not
 * {@link USER_SETTINGS_SCHEMA_KIND}). Returns ONLY the allowlisted namespaces the file actually carried (the
 * R7 per-namespace-merge contract) — a namespace the file omits is absent from the result, and any non-
 * allowlisted key in the file (e.g. a crafted `routing`/`credential`) is IGNORED (never read out). Each
 * carried namespace is healed through the lenient `parseUserSettings` (pinned to the current version so no
 * flat-grab-bag lift runs and a hostile field self-heals per-field). The inverse of `buildUserSettingsBackup`.
 * PURE.
 */
export function parseUserSettingsBackup(bytes: Uint8Array): Partial<PortableUserSettings> | null {
  const envelope = wireBackupSchema.safeParse(decodeJson(bytes));
  if (!envelope.success) {
    return null;
  }
  const rawObj = isPlainObject(envelope.data.settings) ? envelope.data.settings : {};
  // Heal the WHOLE blob leniently (never throws; every namespace `.catch`es per-field). Pin the version so the
  // v1 flat-grab-bag lift can't misfire on a namespaced payload and discard it (the `readUserSettings` guard).
  const healed = parseUserSettings(rawObj, USER_SETTINGS_SCHEMA_VERSION);
  const out: Partial<PortableUserSettings> = {};
  for (const ns of SHARE_SAFE_SETTINGS_NAMESPACES) {
    // Only namespaces the file actually carried travel (R7 merge-only-present); excluded keys are never read.
    if (Object.hasOwn(rawObj, ns)) {
      takeNamespace(out, healed, ns);
    }
  }
  return out;
}
