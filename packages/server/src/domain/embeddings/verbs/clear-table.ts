// verb: clearTable — the maintenance wipe of a primary vector table (replaces the neo `db/vector-ops.ts`
// test+bootstrap helper, now owned by the domain that owns the tables). A plain `DELETE FROM` — safe without
// an index rebuild (no ANN/DiskANN shadow index; see persistence/clear.ts).

import type { EmbeddingsContext } from "../context.ts";
import type { ClearTableParams } from "../contract/params.ts";
import type { EmbeddingsService } from "../contract/service.ts";
import { clearVectorTable } from "../persistence/clear.ts";

export function createClearTable(ctx: EmbeddingsContext): EmbeddingsService["clearTable"] {
  return async (params: ClearTableParams): Promise<void> => {
    await clearVectorTable(ctx.db, params.table);
  };
}
