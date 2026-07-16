// domain/settings/substrate/merge — pure deep-merge helpers (zero I/O) for the settings write paths.
// Plain objects recurse; arrays + primitives replace (no array-concat). undefined means "don't touch this key".

import type { AppSettings } from "@orb/contracts/settings";
import { isPlainObject } from "@orb/kit/guards";

/** undefined skips a key, null clears a top-level override, \{\} resets a leaf, plain objects recurse. */
export function deepMergeAppSettings(base: AppSettings, patch: AppSettings): AppSettings {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    if (value === null) {
      merged[key] = null;
      continue;
    }
    const baseValue = merged[key];
    merged[key] = isPlainObject(value) && isPlainObject(baseValue) ? deepMergeAppSettings(baseValue as AppSettings, value as AppSettings) : value;
  }
  return merged as AppSettings;
}

/** Untyped deep-merge for a UserSettings section patch (caller re-validates through the lenient parser after). */
export function deepMergePlain(base: Record<string, unknown>, patch: Record<string, unknown>): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) {
      continue;
    }
    const baseValue = merged[key];
    merged[key] = isPlainObject(value) && isPlainObject(baseValue) ? deepMergePlain(baseValue, value) : value;
  }
  return merged;
}
