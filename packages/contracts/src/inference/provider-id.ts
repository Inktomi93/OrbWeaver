// Provider identity is a leaf: pricing/usage provenance needs this parser without importing a provider
// row that itself imports endpoint pricing.
import type { Branded, LookupText } from "@orb/kit/ids";
import { brandedId } from "@orb/kit/ids";
import { z } from "zod";

const PROVIDER_ID = /^(?:[a-z0-9-]+|plugin:[a-z0-9-]+\/[a-z0-9-]+)$/;
const PLUGIN_PROVIDER_ID = /^plugin:([a-z0-9-]+)\/[a-z0-9-]+$/;
export const PLUGIN_PROVIDER_ID_PREFIX = "plugin:";
/** The id of the built-in vLLM row: the one spelling the curated rows, the server detector and the connection editor compare a server against. */
export const VLLM_PROVIDER_ID = "vllm";
export type ProviderId = Branded<"ProviderId">;
export const providerIdSchema: z.ZodType<ProviderId, string> = z
  .string()
  .regex(PROVIDER_ID, "a provider id is bare [a-z0-9-]+ (built-in) or plugin:<name>/<id>")
  .pipe(brandedId("ProviderId"));

export function isPluginProviderId(id: LookupText<ProviderId>): boolean {
  return PLUGIN_PROVIDER_ID.test(id);
}

export function pluginNameOfProviderId(id: LookupText<ProviderId>): string | undefined {
  return PLUGIN_PROVIDER_ID.exec(id)?.[1];
}
