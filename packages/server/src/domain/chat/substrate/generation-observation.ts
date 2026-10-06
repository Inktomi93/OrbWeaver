import { responseCacheSchema, storedGenerationUsageLegSchema } from "@orb/contracts/inference";
import type { chatGenerationObservations } from "@orb/db";
import type { GenerationObservationFact, GenerationObservationGroup, GenerationObservationParent } from "../contract/generation-observation.ts";

/** Group normalized retained rows without adding mutable state to the query layer. */
export function groupObservationRows(rows: readonly (typeof chatGenerationObservations.$inferSelect)[]): GenerationObservationGroup[] {
  const groups = new Map<string, { parent: GenerationObservationParent; facts: GenerationObservationFact[] }>();
  for (const row of rows) {
    const key = `${row.chatId}/${row.turnId}`;
    const group = groups.get(key) ?? {
      parent: { chatId: row.chatId, turnId: row.turnId, sourceMessageId: row.sourceMessageId, sourceVariantId: row.sourceVariantId },
      facts: [],
    };
    group.facts.push({
      ordinal: row.ordinal,
      funderUserId: row.funderUserId,
      connectionId: row.connectionId,
      leg: storedGenerationUsageLegSchema.parse({ ...row, responseCache: responseCacheSchema.safeParse(row.responseCache).data }),
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}
