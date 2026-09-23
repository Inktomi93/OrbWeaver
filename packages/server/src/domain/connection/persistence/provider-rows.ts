// All db access for `provider_rows` + `plugin_provider_contributions` — the runtime's ProviderStore.
// Provider definitions are deployment-global; plugin activations contribute to them many-to-one. The
// contribution's composite FK includes the canonical definition hash and the literal `plugin` origin, so a
// same-id/different-definition row and an admin row are both impossible to adopt, even across replicas.

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { providerDefSchema } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { pluginProviderContributions, plugins, providerRows } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { ProviderSnapshot } from "@orb/inference";
import type { PluginId, UserId } from "@orb/kit/ids";
import { and, eq, exists, inArray, notExists, notInArray, or } from "drizzle-orm";
import { conflictingProviderDefinition, indexProviderDefinitions, providerDefinitionHash } from "../substrate/provider-definitions.ts";

type ProviderRow = typeof providerRows.$inferSelect;
type ProviderRowInsert = typeof providerRows.$inferInsert;

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

function valuesOf(args: {
  readonly row: ProviderDef;
  readonly hash: string;
  readonly origin: "plugin" | "admin";
  readonly admin: UserId | null;
  readonly now: number;
}): ProviderRowInsert {
  const { row, hash, origin, admin, now } = args;
  return {
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
    definitionHash: hash,
    originKind: origin,
    originUserId: admin,
    createdAt: now,
  } as const;
}

/** Drop contributions whose plugin is no longer authoritative. Provider definitions deliberately remain as
 * immutable identity tombstones: a connection or credential can retain only the ProviderId, so letting a
 * later install replace that id's definition would reroute the retained secret to the new baseUrl. */
// @orb-waive owner-scoped-reads(plugins): the deployment-global provider registry's system reconciliation reads plugin ids authorized by the contribution's required FK, across every owner; no request-controlled id reaches this query. Ends if a user-facing door calls this helper or the contribution stops FK-anchoring pluginId.
async function reconcileInactivePluginRows(db: Db): Promise<void> {
  const enabledPlugin = db
    .select({ id: plugins.id })
    .from(plugins)
    .where(and(eq(plugins.id, pluginProviderContributions.pluginId), eq(plugins.status, "enabled")));
  await db.delete(pluginProviderContributions).where(notExists(enabledPlugin));
}

/** A live plugin row must have at least one contribution from an enabled plugin. The explicit status join is
 * also a fail-closed read belt if reconciliation is interrupted before it commits. `installs` is the same join
 * projected to each contributing install's OWNER: the registry serves a plugin row to exactly those users
 * (D147), so ownership comes from `plugins.owner_id` through the contribution FK, never from a caller. */
export async function listProviderRows(db: Db): Promise<ProviderSnapshot> {
  await reconcileInactivePluginRows(db);
  const enabledContribution = and(eq(plugins.id, pluginProviderContributions.pluginId), eq(plugins.status, "enabled"));
  const contributed = db
    .select({ providerId: pluginProviderContributions.providerId })
    .from(pluginProviderContributions)
    .innerJoin(plugins, enabledContribution)
    .where(eq(pluginProviderContributions.providerId, providerRows.id));
  const rows = await db
    .select()
    .from(providerRows)
    .where(or(eq(providerRows.originKind, "admin"), exists(contributed)));
  const installs = await db
    .selectDistinct({ providerId: pluginProviderContributions.providerId, ownerId: plugins.ownerId })
    .from(pluginProviderContributions)
    .innerJoin(plugins, enabledContribution);
  return { rows: rows.map(toProviderDef), installs };
}

/** Admin rows may update admin rows, but can never adopt a plugin-contributed id. */
export async function putAdminProviderRow(db: Db, row: ProviderDef, admin: UserId, now: number): Promise<boolean> {
  const hash = providerDefinitionHash(row);
  const values = valuesOf({ row, hash, origin: "admin", admin, now });
  const written = await db
    .insert(providerRows)
    .values(values)
    .onConflictDoUpdate({ target: providerRows.id, set: values, setWhere: eq(providerRows.originKind, "admin") })
    .returning({ id: providerRows.id });
  return written.length > 0;
}

export async function deleteAdminProviderRow(db: Db, id: ProviderId): Promise<boolean> {
  const removed = await db
    .delete(providerRows)
    .where(and(eq(providerRows.id, id), eq(providerRows.originKind, "admin")))
    .returning({ id: providerRows.id });
  return removed.length > 0;
}

interface ExistingProvider {
  readonly id: ProviderId;
  readonly definitionHash: string;
  readonly originKind: "plugin" | "admin";
}

async function existingFor(db: Db, ids: readonly ProviderId[]): Promise<readonly ExistingProvider[]> {
  if (ids.length === 0) {
    return [];
  }
  return await db
    .select({ id: providerRows.id, definitionHash: providerRows.definitionHash, originKind: providerRows.originKind })
    .from(providerRows)
    .where(inArray(providerRows.id, [...ids]));
}

/** Replace one plugin install's complete contribution set. The batch is all writes, hence one libSQL
 *  transaction. Composite-FK failure is the race belt: if another replica creates/conflicts after the reads,
 *  no contribution or definition from this attempt commits. A ProviderId's first canonical definition is
 *  permanent: later versions publish a new id rather than changing where retained connections send secrets. */
export async function replacePluginProviderRows(
  db: Db,
  rows: readonly ProviderDef[],
  pluginId: PluginId,
  now: number,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly conflictingId: ProviderId }> {
  const desired = rows.map((row) => ({ row, hash: providerDefinitionHash(row) }));
  const ids = desired.map(({ row }) => row.id);
  const existing = await existingFor(db, ids);
  const conflict = conflictingProviderDefinition(desired, existing);
  if (conflict !== undefined) {
    return { ok: false, conflictingId: conflict };
  }
  const byId = indexProviderDefinitions(existing);
  const writes: BatchStmt[] = [];
  for (const { row, hash } of desired) {
    const current = byId.get(row.id);
    const values = valuesOf({ row, hash, origin: "plugin", admin: null, now });
    if (current === undefined) {
      writes.push(db.insert(providerRows).values(values).onConflictDoNothing());
    }
    writes.push(
      db
        .insert(pluginProviderContributions)
        .values({ providerId: row.id, pluginId, definitionHash: hash, providerKind: "plugin", createdAt: now })
        .onConflictDoUpdate({
          target: [pluginProviderContributions.providerId, pluginProviderContributions.pluginId],
          set: { definitionHash: hash, providerKind: "plugin", createdAt: now },
        }),
    );
  }
  const staleContribution =
    ids.length === 0
      ? eq(pluginProviderContributions.pluginId, pluginId)
      : and(eq(pluginProviderContributions.pluginId, pluginId), notInArray(pluginProviderContributions.providerId, [...ids]));
  writes.push(db.delete(pluginProviderContributions).where(staleContribution));
  try {
    await db.batch(batchMany(writes));
  } catch (err) {
    const after = await existingFor(db, ids);
    const raced = conflictingProviderDefinition(desired, after);
    if (raced !== undefined) {
      return { ok: false, conflictingId: raced };
    }
    throw err;
  }
  return { ok: true };
}

export async function deletePluginProviderRows(db: Db, pluginId: PluginId): Promise<void> {
  await db.delete(pluginProviderContributions).where(eq(pluginProviderContributions.pluginId, pluginId));
}
