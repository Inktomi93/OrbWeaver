// One projection of the shipped manifest serves updates and seeding.
import type { ReadShowcaseVersionSource } from "../contract/seed-ops.ts";
import type { PluginContext } from "../contract/service.ts";

export function createShowcaseVersionReader(read: ReadShowcaseVersionSource): PluginContext["showcase"]["version"] {
  return async (slug): Promise<string | null> => (await read(slug))?.version ?? null;
}
