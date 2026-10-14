import type { ChunkParamsWire, DatabankRetrievalSettings, DatabankSettings } from "@orb/contracts/databank";
import { chunkParamsSchema, databankRetrievalSettingsSchema, databankSettingsSchema } from "@orb/contracts/databank";

/** Builds chunk configuration from the contract's complete defaults. */
export function makeChunkParams(overrides: Partial<ChunkParamsWire> = {}): ChunkParamsWire {
  return chunkParamsSchema.parse(overrides);
}

/** Builds retrieval configuration from the contract's complete defaults. */
export function makeDatabankRetrievalSettings(overrides: Partial<DatabankRetrievalSettings> = {}): DatabankRetrievalSettings {
  return databankRetrievalSettingsSchema.parse(overrides);
}

/** Builds the actual cross-domain settings projection; the chat slot budget is not part of this output. */
export function makeDatabankSettings(overrides: Partial<DatabankSettings> = {}): DatabankSettings {
  return databankSettingsSchema.parse({
    chunk: makeChunkParams(overrides.chunk),
    retrieval: makeDatabankRetrievalSettings(overrides.retrieval),
  });
}
