import type { JsonValue, UnreadableJsonText } from "@orb/kit/json";

export const CATALOG_SETTINGS_PREFIX = "catalog:";
export const SETTINGS_TENANT_PREFIXES = [CATALOG_SETTINGS_PREFIX] as const;
export type SettingsTenantPrefix = (typeof SETTINGS_TENANT_PREFIXES)[number];

/** Full persisted keys remain stable; the bound port refuses keys outside its registered namespace. A stored value
 *  that is not JSON reads as its {@link UnreadableJsonText}; the tenant decides what that means for its key. */
export interface SettingsKvPort {
  readonly read: (key: string) => Promise<JsonValue | UnreadableJsonText | undefined>;
  readonly write: (key: string, value: JsonValue) => Promise<void>;
  readonly deletePrefix: (prefix: string) => Promise<void>;
}
