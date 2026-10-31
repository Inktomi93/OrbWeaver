// Boot step: move plugin provider definitions to their canonical hash after their stored bytes changed under
// them (migration 0007 strips retired tasks). SQL cannot compute the hash, and a claim on a stale hash refuses
// the plugin's own unchanged definition at activation, so this runs before compose activates any plugin.

import type { BootDatabaseHandle } from "@orb/db/wiring";
import { rehashPluginProviderDefinitions } from "#domain/connection";
import type { Logger } from "#foundation/observability";
import { getLog } from "#foundation/observability";

export interface RehashPluginProviderDefinitionsDeps {
  readonly logger: Logger;
  readonly db: BootDatabaseHandle;
}

/** Returns the number of definitions moved: 0 on every boot after the first, and on a db with no stale hash. */
export async function rehashPluginProviderDefinitionsOnBoot(deps: RehashPluginProviderDefinitionsDeps): Promise<number> {
  const moved = await rehashPluginProviderDefinitions(deps.db);
  if (moved > 0) {
    getLog(deps.logger).info({ moved }, "boot/rehash-plugin-provider-definitions: moved plugin provider definitions and their claims to the canonical hash");
  }
  return moved;
}
