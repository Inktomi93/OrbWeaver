import { z } from "zod";

const attributesSchema = z.record(z.string(), z.string());
const resolutionContextSchema = z.object({
  parentURL: z.string(),
  conditions: z.array(z.string()),
  importAttributes: attributesSchema.optional(),
});
const resolutionResultSchema = z.object({
  url: z.string(),
  format: z.string().nullable().optional(),
  importAttributes: attributesSchema.optional(),
});
export const inventoryRuntimeResolutionSchema = z.object({
  kind: z.enum(["request", "format"]),
  mode: z.enum(["import", "require"]),
  specifier: z.string(),
  context: resolutionContextSchema,
  outcome: z.union([
    z.object({ kind: z.literal("resolved"), value: resolutionResultSchema }),
    z.object({ kind: z.literal("failed"), code: z.string(), message: z.string() }),
  ]),
});
export const inventoryRuntimeSourceSchema = z.object({
  url: z.string(),
  path: z.string(),
  version: z.string(),
  format: z.string().nullable().optional(),
});
export const inventoryRuntimeSchema = z.object({
  version: z.literal(1),
  bootstrap: z.string(),
  nodeVersion: z.string(),
  nodeOptions: z.string(),
  execArgv: z.array(z.string()),
  roots: z.array(z.string()).min(1),
  sources: z.array(inventoryRuntimeSourceSchema).min(1),
  resolutions: z.array(inventoryRuntimeResolutionSchema),
  pins: z.array(z.object({ path: z.string(), version: z.string() })),
});
export const inventoryRuntimeHeaderSchema = inventoryRuntimeSchema.omit({ sources: true, resolutions: true }).extend({
  sourceCount: z.number().int().positive(),
  resolutionCount: z.number().int().nonnegative(),
});
export const INVENTORY_RUNTIME_ROLES = ["controller", "worker"] as const;
export const inventoryImplementationSchema = z.object({ controller: inventoryRuntimeSchema, worker: inventoryRuntimeSchema });

export type InventoryRuntimeResolution = z.infer<typeof inventoryRuntimeResolutionSchema>;
export type InventoryRuntimeSource = z.infer<typeof inventoryRuntimeSourceSchema>;
export type InventoryRuntime = z.infer<typeof inventoryRuntimeSchema>;
export type InventoryRuntimeRole = (typeof INVENTORY_RUNTIME_ROLES)[number];
