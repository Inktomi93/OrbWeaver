// domain/settings/substrate/merge — PURE deep-merge helpers (zero I/O) for the settings write paths. Plain
// objects recurse; arrays + primitives REPLACE (no array-concat — that would make "set
// importSkipCharacters to [x]" impossible). `undefined` means "don't touch this key". `isPlainObject` is
// the single-homed kit guard (no local copy — `kit-purity`/one-home).

import type { AppSettings } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";

/** Typed AppSettings merge. `undefined` skips a key, `null` CLEARS a top-level override (every
 *  appSettingsSchema field is `.nullable()`, so a stored null reads back as "no override"), `{}` resets a
 *  leaf, plain objects recurse, arrays/primitives replace. The caller persists the result. */
export function deepMergeAppSettings(base: AppSettings, patch: AppSettings): AppSettings {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue; // explicit "don't touch"
    }
    if (value === null) {
      merged[key] = null; // explicit clear (the null=CLEAR sentinel)
      continue;
    }
    const baseValue = merged[key];
    merged[key] =
      isPlainObject(value) && isPlainObject(baseValue)
        ? deepMergeAppSettings(baseValue as AppSettings, value as AppSettings)
        : value; // arrays, primitives, or shape mismatch → replace
  }
  return merged as AppSettings;
}

/** Generic untyped deep-merge for a UserSettings section patch (the caller re-validates the whole blob
 *  through the lenient parser afterwards). `undefined` means "don't touch". */
export function deepMergePlain(
  base: Record<string, unknown>,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    const baseValue = merged[key];
    merged[key] =
      isPlainObject(value) && isPlainObject(baseValue) ? deepMergePlain(baseValue, value) : value;
  }
  return merged;
}
