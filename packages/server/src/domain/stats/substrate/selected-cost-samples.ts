import { legacyNotionalCostSamples, parseVariantMetadata } from "@orb/contracts/chat";
import { generationObservationSpendDelta } from "@orb/contracts/stats";
import type { messageVariants } from "@orb/db";
import type { CharacterId, UserId } from "@orb/kit/ids";
import type { SelectedCostAccumulator, SelectedCostSamples } from "../contract/cost-samples.ts";
import { recordedCost } from "./rates.ts";

const emptyCostSamples = (): SelectedCostSamples => ({ costUsd: 0, costSamples: 0, notionalCostSamples: 0 });

export function modelCostKey(characterId: CharacterId, model: string, provider: string | null): string {
  return JSON.stringify([characterId, model, provider]);
}

function addCostSamples<Key>(map: Map<Key, SelectedCostSamples>, key: Key, samples: SelectedCostSamples): void {
  const total = map.get(key) ?? emptyCostSamples();
  total.costUsd += samples.costUsd;
  total.costSamples += samples.costSamples;
  total.notionalCostSamples += samples.notionalCostSamples;
  map.set(key, total);
}

function variantCostSamples(ownerId: UserId, row: Pick<typeof messageVariants.$inferSelect, "costUsd" | "metadata">): SelectedCostSamples {
  const metadata = parseVariantMetadata(row.metadata);
  const samples = emptyCostSamples();
  const legs = metadata.usageLegs ?? [];
  if (legs.length === 0) {
    return { costUsd: row.costUsd ?? 0, costSamples: row.costUsd === null ? 0 : 1, notionalCostSamples: legacyNotionalCostSamples(row.costUsd, metadata) };
  }
  for (const leg of legs) {
    const delta = generationObservationSpendDelta({ ownerId, leg });
    samples.costUsd += delta.costUsd ?? 0;
    samples.costSamples += delta.costSamples ?? 0;
    samples.notionalCostSamples += delta.notionalCostSamples ?? 0;
  }
  return samples;
}

/** Fold only observed prices while retaining monetary-basis compatibility at the selected-record grain. */
export function createSelectedCostAccumulator(ownerId: UserId): SelectedCostAccumulator {
  const characters = new Map<CharacterId, SelectedCostSamples>();
  const models = new Map<string, SelectedCostSamples>();
  return {
    maps: { characters, models },
    append: (rows): void => {
      for (const row of rows) {
        const samples = variantCostSamples(ownerId, row);
        addCostSamples(characters, row.characterId, samples);
        if (row.model !== null) {
          addCostSamples(models, modelCostKey(row.characterId, row.model, row.provider), samples);
        }
      }
    },
  };
}

/** Read the compatible available priced-record subtotal, never a complete invoice total. */
export function costOfSamples(samples: SelectedCostSamples | undefined): number | null {
  return samples === undefined ? null : recordedCost(samples.costUsd, samples.costSamples, samples.notionalCostSamples);
}
