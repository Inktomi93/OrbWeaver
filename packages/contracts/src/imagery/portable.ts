// Portable execution history, not replay instructions or authority. Asset ids retain the asset restore
// law; context ids are historical only. One common execution body survives partial image retention.
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { z } from "zod";
import { modelIdSchema } from "../inference/model-schema.ts";
import { providerIdSchema } from "../inference/provider-schema.ts";
import { generationUsageDetailsSchema } from "../inference/usage.ts";
import { promptTemplateModeSchema } from "./modes.ts";

export const imageryImportSourceSchema = z.strictObject({
  sourceCallId: typeIdSchema(ID_PREFIX.imageryCall).nullable(),
  sourceGenerationId: typeIdSchema(ID_PREFIX.imageryGeneration),
  subjectCharacterHandle: z.string().min(1).nullable(),
  chatId: typeIdSchema(ID_PREFIX.chat).nullable(),
  connectionId: typeIdSchema(ID_PREFIX.userConnection).nullable(),
  identityHash: z.string().nullable(),
});
export type ImageryImportSource = z.infer<typeof imageryImportSourceSchema>;

export const portableImageryExecutionSchema = z.strictObject({
  sourceCallId: imageryImportSourceSchema.shape.sourceCallId,
  mode: promptTemplateModeSchema,
  prompt: z.string(),
  negativePrompt: z.string().nullable(),
  model: modelIdSchema,
  provider: providerIdSchema.nullable(),
  costUsd: z.number().nonnegative().nullable(),
  usage: generationUsageDetailsSchema,
  subjectCharacterHandle: imageryImportSourceSchema.shape.subjectCharacterHandle,
  chatId: imageryImportSourceSchema.shape.chatId,
  connectionId: imageryImportSourceSchema.shape.connectionId,
  identityHash: imageryImportSourceSchema.shape.identityHash,
  edited: z.boolean(),
  createdAt: z.number().int().nonnegative(),
});
export const portableImageryImageSchema = z.strictObject({
  sourceGenerationId: imageryImportSourceSchema.shape.sourceGenerationId,
  assetId: typeIdSchema(ID_PREFIX.asset),
});
export const portableImageryCallSchema = z
  .strictObject({
    execution: portableImageryExecutionSchema,
    images: z.array(portableImageryImageSchema).min(1),
  })
  .superRefine((call, ctx) => {
    const ids = new Set(call.images.map((image) => image.sourceGenerationId));
    if (ids.size !== call.images.length || (call.execution.sourceCallId === null && call.images.length !== 1)) {
      ctx.addIssue({ code: "custom", message: "Duplicate image identity or grouped legacy generation" });
    }
  });
export type PortableImageryExecution = z.infer<typeof portableImageryExecutionSchema>;
export type PortableImageryImage = z.infer<typeof portableImageryImageSchema>;
export type PortableImageryCall = z.infer<typeof portableImageryCallSchema>;
