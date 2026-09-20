// All db access for `provider_rows` (queries only) — the runtime's `ProviderStore`: plugin-shipped and
// admin-added `ProviderDef` rows beside the built-ins (F9). Real columns per scalar; `features` a parsed
// document; `apis`/`serves` JSON arrays validated against the closed tuples by the registry's schema on write.

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { providerDefSchema } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { providerRows } from "@orb/db";
import type { PluginId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";

type ProviderRow = typeof providerRows.$inferSelect;

function toProviderDef(row: ProviderRow): ProviderDef {
  return providerDefSchema.parse({
    id: row.id,
    label: row.label,
    wire: row.wire,
    ...(row.dialect === null ? {} : { dialect: row.dialect }),
    auth: row.auth,
    ...(row.baseUrl === null ? {} : { baseUrl: row.baseUrl }),
    apis: row.apis,
    ...(row.serves === null ? {} : { serves: row.serves }),
    catalog: row.catalog,
    metered: row.metered,
    ...(row.docsUrl === null ? {} : { docsUrl: row.docsUrl }),
    ...(row.features === null ? {} : { features: row.features }),
  });
}

export async function listProviderRows(db: Db): Promise<readonly ProviderDef[]> {
  const rows = await db.select().from(providerRows);
  return rows.map(toProviderDef);
}

export async function putProviderRow(db: Db, row: ProviderDef, origin: { readonly plugin: PluginId } | { readonly admin: UserId }, now: number): Promise<void> {
  const values = {
    id: row.id,
    label: row.label,
    wire: row.wire,
    dialect: row.dialect ?? null,
    auth: row.auth,
    baseUrl: row.baseUrl ?? null,
    apis: row.apis,
    serves: row.serves ?? null,
    catalog: row.catalog,
    metered: row.metered,
    docsUrl: row.docsUrl ?? null,
    features: row.features ?? null,
    ...("plugin" in origin
      ? { originKind: "plugin" as const, originPluginId: origin.plugin, originUserId: null }
      : { originKind: "admin" as const, originPluginId: null, originUserId: origin.admin }),
    createdAt: now,
  };
  await db.insert(providerRows).values(values).onConflictDoUpdate({ target: providerRows.id, set: values });
}

export async function deleteProviderRow(db: Db, id: ProviderId): Promise<void> {
  await db.delete(providerRows).where(eq(providerRows.id, id));
}
