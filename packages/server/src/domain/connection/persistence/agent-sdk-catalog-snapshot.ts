// domain/connection/persistence/agent-sdk-catalog-snapshot — mirrors catalog-snapshot.ts (the OR half)
// with a distinct key ('agent-sdk-model-catalog'), never co-mingled with the OR snapshot.
//
// readAgentSdkCatalogSnapshot ALWAYS warms the in-memory TTL cache (seedAgentSdkModelCache) as a side-effect
// on success, co-located with the read that triggers it — do not split it out.

import type { Db } from "@orb/db";
import { settings } from "@orb/db";
import type { JsonValue } from "@orb/kit/json";
import { eq } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { AgentSdkCatalogSnapshot } from "../contract/results";
import { agentSdkCatalogSnapshotSchema } from "../contract/results";
import { seedAgentSdkModelCache } from "../substrate/agent-sdk-model-cache";

const SNAPSHOT_KEY = "agent-sdk-model-catalog";

export async function readAgentSdkCatalogSnapshot(db: Db): Promise<AgentSdkCatalogSnapshot | null> {
  const rows = await db.select().from(settings).where(eq(settings.key, SNAPSHOT_KEY)).limit(1);
  const value = rows[0]?.value;
  if (value === undefined || value === null) {
    return null;
  }
  const parsed = agentSdkCatalogSnapshotSchema.safeParse(value);
  if (!parsed.success) {
    getLog().warn({ key: SNAPSHOT_KEY }, "connection: persisted agent-sdk catalog snapshot failed validation");
    return null;
  }
  const snapshot = parsed.data;
  seedAgentSdkModelCache(snapshot.models, snapshot.fetchedAt);
  return snapshot;
}

/** PERSIST + WARM in one call — the pair every discovery path owes (the daily refresh workload AND the
 *  cold-cache on-demand warm at the resolve seam). The OR twin's `persistCatalogSnapshot` rationale applies:
 *  one home so a new caller can't persist without seeding the mirror the capability synthesis reads. */
export async function persistAgentSdkCatalogSnapshot(db: Db, snapshot: AgentSdkCatalogSnapshot): Promise<void> {
  await writeAgentSdkCatalogSnapshot(db, snapshot);
  seedAgentSdkModelCache(snapshot.models, snapshot.fetchedAt);
}

export async function writeAgentSdkCatalogSnapshot(db: Db, snapshot: AgentSdkCatalogSnapshot): Promise<void> {
  // Snapshot is JSON-shaped at runtime; cast bridges interface → index-signature only.
  const value = snapshot as JsonValue;
  await db
    .insert(settings)
    .values({ key: SNAPSHOT_KEY, value, updatedAt: snapshot.fetchedAt })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: snapshot.fetchedAt },
    });
}
