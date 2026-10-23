import type { IdSource } from "@orb/kit/ids";
import { createIdSource } from "@orb/kit/ids";
import type { ExtractionMints } from "../contract/params.ts";

export function createExtractionMints(source: IdSource = createIdSource()): ExtractionMints {
  return {
    item: () => source.unprefixed(),
    quest: () => source.rpgQuestId(),
    objective: () => source.unprefixed(),
  };
}
