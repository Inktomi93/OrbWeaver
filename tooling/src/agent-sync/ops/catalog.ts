import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import { processEnvValue } from "../../_shared/process-env.ts";
import type { ModelCatalog } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm agents:sync");

const modelCatalogSchema = z
  .object({
    // biome-ignore lint/style/useNamingConvention: Codex cache uses this external JSON field.
    fetched_at: z.iso.datetime({ offset: true }),
    models: z
      .array(
        z.object({
          slug: z.string(),
          visibility: z.string(),
          // biome-ignore lint/style/useNamingConvention: Codex cache uses this external JSON field.
          supported_reasoning_levels: z.array(z.object({ effort: z.string() })),
        }),
      )
      .nonempty(),
  })
  .transform((catalog) => ({
    fetchedAt: catalog.fetched_at,
    models: catalog.models.map((model) => ({
      slug: model.slug,
      visibility: model.visibility,
      supportedReasoningLevels: model.supported_reasoning_levels,
    })),
  }));

/** The Codex-maintained catalog path. Sync reads it; check never does. */
export function modelCatalogPath(): string {
  return join(processEnvValue("CODEX_HOME") ?? join(homedir(), ".codex"), "models_cache.json");
}

/** Parse the complete catalog before sync can touch generated files. */
export function readModelCatalog(path: string): ModelCatalog {
  try {
    return modelCatalogSchema.parse(JSON.parse(readFileSync(path, "utf8")));
  } catch (error) {
    throw new Error(`invalid Codex model catalog at ${path}: ${String(error)}`, { cause: error });
  }
}
