import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { pluginCommandArgSpecSchema, pluginCommandPlacementSchema } from "./ui.ts";

/** Registered command data; handler references remain inside the server's runtime registry. */
export const pluginCommandViewSchema = z.strictObject({
  pluginId: typeIdSchema(ID_PREFIX.plugin),
  slug: z.string(),
  pluginName: z.string(),
  name: z.string(),
  describe: z.string(),
  args: z.array(pluginCommandArgSpecSchema).readonly(),
  group: z.string().nullable(),
  placements: z.array(pluginCommandPlacementSchema).readonly(),
  composerDraft: z.literal(true).exactOptional(),
});
export type PluginCommandView = z.output<typeof pluginCommandViewSchema>;
