// domain/connection/persistence/catalog-snapshot — the runtime's `SnapshotStore`: a generic `key → json`
// tenant in the shared `settings` table (`catalog:openrouter`, `catalog:agent-sdk`, `catalog:endpoint:<url>`).
// The runtime parses what it reads through its own schema; this slot moves opaque strings. No HTTP here.

import type { Db } from "@orb/db";
import { settings } from "@orb/db";
import type { SnapshotStore } from "@orb/inference";
import { eq } from "drizzle-orm";

export function createSnapshotStore(db: Db, now: () => number): SnapshotStore {
  return {
    read: async (key): Promise<string | null> => {
      const rows = await db.select({ value: settings.value }).from(settings).where(eq(settings.key, key)).limit(1);
      const value = rows[0]?.value;
      return typeof value === "string" ? value : null;
    },
    write: async (key, value): Promise<void> => {
      const at = now();
      await db
        .insert(settings)
        .values({ key, value, updatedAt: at })
        .onConflictDoUpdate({ target: settings.key, set: { value, updatedAt: at } });
    },
  };
}
