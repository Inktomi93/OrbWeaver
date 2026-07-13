// verb: getCatalog — read the persisted OR catalog snapshot. The read warms
// the in-memory TTL cache as a side-effect (persistence/readCatalogSnapshot — the warm-on-read seam). A
// never-refreshed account reads the empty snapshot (`fetchedAt:0, models:[]`) — the same "defaults with no
// write" shape settings uses — rather than throwing; `refreshCatalog` is what populates it.

import type { ConnectionContext } from "../context";
import type { GetCatalogParams } from "../contract/params";
import type { CatalogSnapshot } from "../contract/results";
import type { ConnectionService } from "../contract/service";
import { readCatalogSnapshot } from "../persistence/catalog-snapshot";

const EMPTY_SNAPSHOT: CatalogSnapshot = { fetchedAt: 0, models: [] };

export function createGetCatalog(ctx: ConnectionContext): ConnectionService["getCatalog"] {
  return async (_params: GetCatalogParams): Promise<CatalogSnapshot> => {
    const snapshot = await readCatalogSnapshot(ctx.db);
    return snapshot ?? EMPTY_SNAPSHOT;
  };
}
