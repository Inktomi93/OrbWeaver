// Provider identity is a leaf: pricing/usage provenance needs this parser without importing a provider
// row that itself imports endpoint pricing. Public row-module reexports preserve the existing API.
import type { Branded } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { z } from "zod";

export const PROVIDER_ID = /^(?:[a-z0-9-]+|plugin:[a-z0-9-]+\/[a-z0-9-]+)$/;
const PLUGIN_PROVIDER_ID = /^plugin:([a-z0-9-]+)\/[a-z0-9-]+$/;
export const PLUGIN_PROVIDER_ID_PREFIX = "plugin:";
export type ProviderId = Branded<"ProviderId">;
export const providerIdSchema: z.ZodType<ProviderId, string> = z
  .string()
  .regex(PROVIDER_ID, "a provider id is bare [a-z0-9-]+ (built-in) or plugin:<name>/<id>")
  .transform((value): ProviderId => castId<ProviderId>(value));

export function isPluginProviderId(id: string): boolean {
  return PLUGIN_PROVIDER_ID.test(id);
}

export function pluginNameOfProviderId(id: string): string | undefined {
  return PLUGIN_PROVIDER_ID.exec(id)?.[1];
}
