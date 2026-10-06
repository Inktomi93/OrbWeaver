import type { messageVariants } from "@orb/db";
import type { CharacterId } from "@orb/kit/ids";

export interface SelectedCostSamples {
  costUsd: number;
  costSamples: number;
  notionalCostSamples: number;
}

export interface SelectedCostMaps {
  readonly characters: ReadonlyMap<CharacterId, SelectedCostSamples>;
  readonly models: ReadonlyMap<string, SelectedCostSamples>;
}

type SelectedCostRow = Pick<typeof messageVariants.$inferSelect, "id" | "model" | "provider" | "costUsd" | "metadata"> & {
  readonly characterId: CharacterId;
};

export interface SelectedCostAccumulator {
  readonly maps: SelectedCostMaps;
  readonly append: (rows: readonly SelectedCostRow[]) => void;
}
