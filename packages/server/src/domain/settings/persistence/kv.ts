// Settings owns the table; a tenant owns only the opaque values beneath its registered literal prefix.

import type { SettingsKvPort, SettingsTenantPrefix } from "@orb/contracts/settings";
import { SETTINGS_TENANT_PREFIXES } from "@orb/contracts/settings";
import type { Db } from "@orb/db";
import { settings } from "@orb/db";
import { DomainOperationError } from "@orb/kit/errors";
import type { JsonValue } from "@orb/kit/json";
import { eq, sql } from "drizzle-orm";
import { SETTINGS_OP_CODES } from "../contract/errors.ts";

export function createSettingsKvPort(db: Db, prefix: SettingsTenantPrefix, now: () => number): SettingsKvPort {
  if (!SETTINGS_TENANT_PREFIXES.includes(prefix)) {
    throw new DomainOperationError(SETTINGS_OP_CODES.tenantNamespace, "settings tenant prefix is not registered");
  }
  const requireNamespace = (key: string): void => {
    if (!key.startsWith(prefix)) {
      throw new DomainOperationError(SETTINGS_OP_CODES.tenantNamespace, "settings key is outside the tenant namespace");
    }
  };
  return {
    read: async (key): Promise<JsonValue | undefined> => {
      requireNamespace(key);
      const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
      return rows[0]?.value;
    },
    write: async (key, value): Promise<void> => {
      requireNamespace(key);
      const at = now();
      await db
        .insert(settings)
        .values({ key, value, updatedAt: at })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: at } });
    },
    deletePrefix: async (keyPrefix): Promise<void> => {
      requireNamespace(keyPrefix);
      // SQLite length/substr share character units; URL '%' and '_' remain literal.
      await db.delete(settings).where(sql`substr(${settings.key}, 1, length(${keyPrefix})) = ${keyPrefix}`);
    },
  };
}
