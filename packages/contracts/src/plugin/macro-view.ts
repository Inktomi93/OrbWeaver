import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";

/** A macro one of the caller's enabled plugins registered. `name` is the host-namespaced spelling an author types. */
export const pluginMacroViewSchema = z.strictObject({
  pluginId: typeIdSchema(ID_PREFIX.plugin),
  pluginName: z.string(),
  name: z.string(),
  description: z.string(),
});
export type PluginMacroView = z.output<typeof pluginMacroViewSchema>;
