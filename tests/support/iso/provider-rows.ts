import type { ProviderDef, ProviderDefInput } from "@orb/contracts/inference";
import { PLUGIN_PROVIDER_ID_PREFIX, providerDefSchema } from "@orb/contracts/inference";

/** The provider id a plugin's manifest may claim: `plugin:<plugin>/<local>`. */
export const pluginProviderId = (plugin: string, local: string): string => `${PLUGIN_PROVIDER_ID_PREFIX}${plugin}/${local}`;

/** A provider row parsed through the production schema: an endpoint row over the OpenAI-compatible wire, with `over`
 *  replacing any field. A row the schema refuses throws here, so a case that needs a refused row spells it raw. */
export function makeProviderRow(id: string, over: Partial<ProviderDefInput> = {}): ProviderDef {
  return providerDefSchema.parse({
    id,
    label: id,
    wire: "openai-compat",
    dialect: "openai-compatible",
    auth: "endpoint",
    apis: ["chat-completions"],
    catalog: "url",
    metered: false,
    ...over,
  });
}

/** {@link makeProviderRow} under a plugin's namespace, labelled by its local name. */
export function makePluginProviderRow(plugin: string, local: string, over: Partial<ProviderDefInput> = {}): ProviderDef {
  return makeProviderRow(pluginProviderId(plugin, local), { label: local, ...over });
}
