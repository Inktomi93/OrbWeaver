// Catalog snapshots use settings' registered namespace without interpreting the runtime's opaque strings.

import type { SettingsKvPort } from "@orb/contracts/settings";
import type { SnapshotStore } from "@orb/inference";

export function createSnapshotStore(kv: SettingsKvPort): SnapshotStore {
  return {
    read: async (key): Promise<string | null> => {
      const value = await kv.read(key);
      return typeof value === "string" ? value : null;
    },
    write: kv.write,
    deletePrefix: kv.deletePrefix,
  };
}
