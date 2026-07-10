// domain/connection/persistence/agent-sdk-catalog-snapshot — the agent-sdk model-catalog snapshot KV
// (queries only). Mirrors `catalog-snapshot.ts` (the OR half) with a DISTINCT key — the
// `'agent-sdk-model-catalog'` row is connection's own tenant in the shared `settings` table (settings owns
// the table mechanism, connection owns this blob's meaning). SEPARATE from the OR snapshot (OR ≠ agent-sdk,
// like OR ≠ vLLM); the two are never co-mingled. NEVER reads `users` (no-direct-users-read); NO HTTP/fetch
// (persistence-no-io — the live fetch is `infra/providers.fetchAgentSdkModels`, injected into the refresh).
//
// LOAD-BEARING — the warm-on-read seam: `readAgentSdkCatalogSnapshot` seeds the in-memory TTL cache
// (`seedAgentSdkModelCache`) as a side-effect so the cold-boot alias resolver has a hydrated cache after
// the first read. Co-located with the read that triggers it; do NOT split it out.
//
// LOAD-BEARING — the tightened parse: the stored blob is parsed with the EXACT
// `agentSdkCatalogSnapshotSchema` and the inferred result IS used (no blind cast); a malformed row degrades
// to `null` (treated as "no snapshot").

import type { Db } from "@orb/db";
import { settings } from "@orb/db";
import type { JsonValue } from "@orb/kit/json";
import { eq } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { AgentSdkCatalogSnapshot } from "../contract/results";
import { agentSdkCatalogSnapshotSchema } from "../contract/results";
import { seedAgentSdkModelCache } from "../substrate/agent-sdk-model-cache";

/** The connection-owned KV key in the shared `settings` table. One home for the literal (read + write). */
const SNAPSHOT_KEY = "agent-sdk-model-catalog";

/**
 * Read the persisted agent-sdk catalog snapshot, or `null` when absent/malformed. ALWAYS warms the
 * in-memory TTL cache on a successful read (the load-bearing side-effect — file header). The TTL is seeded
 * with the snapshot's own `fetchedAt`, so a stale persisted snapshot expires correctly against the reader's
 * clock.
 */
export async function readAgentSdkCatalogSnapshot(db: Db): Promise<AgentSdkCatalogSnapshot | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, SNAPSHOT_KEY)).limit(1);
  const value = rows[0]?.value;
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = agentSdkCatalogSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    getLog().warn(
      { key: SNAPSHOT_KEY },
      "connection: persisted agent-sdk catalog snapshot failed validation",
    );
    return null;
  }
  const snapshot = parsed.data;
  // Warm-on-read: hydrate the sync TTL cache the alias resolver reads (no cold-boot null hole).
  seedAgentSdkModelCache(snapshot.models, snapshot.fetchedAt);
  return snapshot;
}

/**
 * Upsert the agent-sdk catalog snapshot (the refresh write). `updatedAt` mirrors the snapshot's
 * `fetchedAt`. `value` is a valid `JsonValue` at runtime (the snapshot is JSON-shaped); the cast bridges
 * only the type (interface → index-signature), the established settings-KV write pattern.
 */
export async function writeAgentSdkCatalogSnapshot(
  db: Db,
  snapshot: AgentSdkCatalogSnapshot,
): Promise<void> {
  const value = snapshot as JsonValue;
  await db
    .insert(settings)
    .values({ key: SNAPSHOT_KEY, value, updatedAt: snapshot.fetchedAt })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: snapshot.fetchedAt },
    });
}
