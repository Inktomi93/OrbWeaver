// All db access for `provider_rows` + `plugin_provider_claims` — the runtime's ProviderStore. An admin row is
// deployment-wide; a plugin row is content a user reaches only through their OWN claim (D147, D265), so one
// user's plugin can never fix, shadow or block a provider id for another. Claim owners come from `plugins`.

import type { ProviderDef, ProviderId } from "@orb/contracts/inference";
import { providerDefSchema } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { pluginProviderClaims, plugins, providerRows } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { ProviderSnapshot } from "@orb/inference";
import type { PluginId, UserId } from "@orb/kit/ids";
import { and, eq, inArray, isNotNull, notExists, notInArray, sql } from "drizzle-orm";
import { conflictingProviderDefinition, providerDefinitionHash } from "../substrate/provider-definitions.ts";

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

/** Unlink every claim whose install is no longer enabled, then reap the plugin definitions no claim holds. The
 *  listing below also joins on `enabled`, so an interrupted reconciliation still serves nothing it should not. */
// @orb-waive owner-scoped-reads(plugins): the deployment-global provider registry's system reconciliation reads plugin ids authorized by the claim's required FK, across every owner; no request-controlled id reaches this query. Ends if a user-facing door calls this helper or the claim stops FK-anchoring pluginId.
async function reconcilePluginClaims(db: Db): Promise<void> {
  const enabledPlugin = db
    .select({ id: plugins.id })
    .from(plugins)
    .where(and(eq(plugins.id, pluginProviderClaims.pluginId), eq(plugins.status, "enabled")));
  const claimed = db
    .select({ providerId: pluginProviderClaims.providerId })
    .from(pluginProviderClaims)
    .where(and(eq(pluginProviderClaims.providerId, providerRows.id), eq(pluginProviderClaims.definitionHash, providerRows.definitionHash)));
  await db.batch(
    batchMany([
      db
        .update(pluginProviderClaims)
        .set({ pluginId: null })
        .where(and(isNotNull(pluginProviderClaims.pluginId), notExists(enabledPlugin))),
      db.delete(providerRows).where(and(eq(providerRows.originKind, "plugin"), notExists(claimed))),
    ]),
  );
}

/** Admin rows, plus one entry per claim an enabled install serves: the claim's owner and that owner's own
 *  definition. The owner match against `plugins.owner_id` fails closed if a claim ever named another owner. */
export async function listProviderRows(db: Db): Promise<ProviderSnapshot> {
  await reconcilePluginClaims(db);
  const rows = await db.select().from(providerRows).where(eq(providerRows.originKind, "admin"));
  const served = await db
    .select({ ownerId: pluginProviderClaims.ownerId, row: providerRows })
    .from(pluginProviderClaims)
    .innerJoin(plugins, and(eq(plugins.id, pluginProviderClaims.pluginId), eq(plugins.ownerId, pluginProviderClaims.ownerId), eq(plugins.status, "enabled")))
    .innerJoin(providerRows, and(eq(providerRows.id, pluginProviderClaims.providerId), eq(providerRows.definitionHash, pluginProviderClaims.definitionHash)));
  return { rows: rows.map(toProviderDef), installs: served.map(({ ownerId, row }) => ({ ownerId, row: toProviderDef(row) })) };
}

/** Create or replace the deployment's one admin definition of `row.id`. The namespace CHECK keeps a plugin id
 *  out of this table's admin rows, so an admin write can never touch a user's claim. */
export async function putAdminProviderRow(db: Db, row: ProviderDef, admin: UserId, now: number): Promise<void> {
  await db.batch(
    batchMany([
      db.delete(providerRows).where(and(eq(providerRows.id, row.id), eq(providerRows.originKind, "admin"))),
      db.insert(providerRows).values(valuesOf({ row, hash: providerDefinitionHash(row), origin: "admin", admin, now })),
    ]),
  );
}

export async function deleteAdminProviderRow(db: Db, id: ProviderId): Promise<boolean> {
  const removed = await db
    .delete(providerRows)
    .where(and(eq(providerRows.id, id), eq(providerRows.originKind, "admin")))
    .returning({ id: providerRows.id });
  return removed.length > 0;
}

// @orb-waive owner-scoped-reads(plugins): resolves the OWNER a claim is written for; the pluginId is the lifecycle lane's own install, never request input, and the owner comes from this row rather than from any caller. Ends if a user-facing door passes a pluginId here directly.
async function pluginOwner(db: Db, pluginId: PluginId): Promise<UserId> {
  const [row] = await db.select({ ownerId: plugins.ownerId }).from(plugins).where(eq(plugins.id, pluginId));
  if (row === undefined) {
    throw new Error(`provider claims: plugin ${pluginId} has no row to claim for`);
  }
  return row.ownerId;
}

async function ownerClaims(
  db: Db,
  ownerId: UserId,
  ids: readonly ProviderId[],
): Promise<readonly { readonly id: ProviderId; readonly definitionHash: string }[]> {
  if (ids.length === 0) {
    return [];
  }
  return await db
    .select({ id: pluginProviderClaims.providerId, definitionHash: pluginProviderClaims.definitionHash })
    .from(pluginProviderClaims)
    .where(and(eq(pluginProviderClaims.ownerId, ownerId), inArray(pluginProviderClaims.providerId, [...ids])));
}

/** Link one plugin install's complete provider set to its owner's claims, in one batch. A claim is permanent
 *  for its owner: a changed definition of an id the owner already claimed is refused, because a retained
 *  connection or credential names only the ProviderId and would follow it to the new baseUrl. The claim upsert
 *  re-links only a claim with the same definition, so a claim a concurrent writer bound differently is left
 *  untouched; the re-read after the batch reports it as the conflict and unlinks this install. */
export async function replacePluginProviderRows(
  db: Db,
  rows: readonly ProviderDef[],
  pluginId: PluginId,
  now: number,
): Promise<{ readonly ok: true } | { readonly ok: false; readonly conflictingId: ProviderId }> {
  const ownerId = await pluginOwner(db, pluginId);
  const desired = rows.map((row) => ({ row, hash: providerDefinitionHash(row) }));
  const ids = desired.map(({ row }) => row.id);
  const conflict = conflictingProviderDefinition(desired, await ownerClaims(db, ownerId, ids));
  if (conflict !== undefined) {
    return { ok: false, conflictingId: conflict };
  }
  const writes: BatchStmt[] = [];
  for (const { row, hash } of desired) {
    writes.push(
      db
        .insert(providerRows)
        .values(valuesOf({ row, hash, origin: "plugin", admin: null, now }))
        .onConflictDoNothing(),
    );
    writes.push(
      db
        .insert(pluginProviderClaims)
        .values({ ownerId, providerId: row.id, definitionHash: hash, pluginId, createdAt: now })
        .onConflictDoUpdate({
          target: [pluginProviderClaims.ownerId, pluginProviderClaims.providerId],
          set: { pluginId },
          setWhere: eq(pluginProviderClaims.definitionHash, sql`excluded.definition_hash`),
        }),
    );
  }
  const staleClaim =
    ids.length === 0
      ? eq(pluginProviderClaims.pluginId, pluginId)
      : and(eq(pluginProviderClaims.pluginId, pluginId), notInArray(pluginProviderClaims.providerId, [...ids]));
  writes.push(db.update(pluginProviderClaims).set({ pluginId: null }).where(staleClaim));
  await db.batch(batchMany(writes));
  const raced = conflictingProviderDefinition(desired, await ownerClaims(db, ownerId, ids));
  if (raced !== undefined) {
    await releasePluginProviderClaims(db, pluginId);
    return { ok: false, conflictingId: raced };
  }
  return { ok: true };
}

/** Unlink every claim this install serves. The claims stay as their owner's tombstones. */
export async function releasePluginProviderClaims(db: Db, pluginId: PluginId): Promise<void> {
  await db.update(pluginProviderClaims).set({ pluginId: null }).where(eq(pluginProviderClaims.pluginId, pluginId));
}
