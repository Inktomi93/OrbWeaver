import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { PLUGIN_ORIGINS, PLUGIN_STATUSES } from "./lifecycle.ts";
import { PLUGIN_CAPABILITIES, pluginBuiltAgainstSchema, pluginNetHostSchema } from "./manifest.ts";

// Origin records installed bytes; update source names who can provide the next version.
export const PLUGIN_UPDATE_SOURCES = ["url", "git", "showcase"] as const;
export type PluginUpdateSource = (typeof PLUGIN_UPDATE_SOURCES)[number];

const capabilityListSchema = z.array(z.enum(PLUGIN_CAPABILITIES)).readonly();

/** Owner-facing management data keeps the declared ask separate from the consented grant. */
export const pluginViewSchema = z.strictObject({
  id: typeIdSchema(ID_PREFIX.plugin),
  slug: z.string(),
  name: z.string(),
  version: z.string(),
  status: z.enum(PLUGIN_STATUSES),
  origin: z.enum(PLUGIN_ORIGINS),
  sourceUrl: z.string().nullable(),
  sourceCommit: z.string().nullable(),
  updateSource: z.enum(PLUGIN_UPDATE_SOURCES).nullable(),
  grantedCapabilities: capabilityListSchema,
  declaredCapabilities: capabilityListSchema,
  netHosts: z.array(pluginNetHostSchema).readonly().nullable(),
  reconsentPending: z.boolean(),
  widenedNetHosts: z.array(pluginNetHostSchema).readonly(),
  builtAgainst: pluginBuiltAgainstSchema.nullable(),
  description: z.string(),
  lastError: z.string().nullable(),
  installedAt: z.number(),
  updatedAt: z.number(),
});
export type PluginView = z.output<typeof pluginViewSchema>;
