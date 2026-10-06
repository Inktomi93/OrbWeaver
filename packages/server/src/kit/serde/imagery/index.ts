// One identity home for parsed imagery history. Sibling images are deliberately outside the call hash:
// deleting one output, or restoring overlapping subsets, must not invent another provider call.
import type { PortableImageryCall, PortableImageryImage } from "@orb/contracts/imagery";
import { portableImageryCallSchema, portableImageryExecutionSchema } from "@orb/contracts/imagery";
import { z } from "zod";
import { sha256Hex } from "#kit/content-hash";
import { defineJsonObjectSerde } from "#kit/serde/lib";

export const IMAGERY_SCHEMA_KIND = "orb.imagery";
export const IMAGERY_SCHEMA_VERSION = 1;

function canonicalCall(call: PortableImageryCall): PortableImageryCall {
  const parsed = portableImageryCallSchema.parse(call);
  return { execution: parsed.execution, images: parsed.images.toSorted((a, b) => a.sourceGenerationId.localeCompare(b.sourceGenerationId)) };
}

const serde = defineJsonObjectSerde<PortableImageryCall, PortableImageryCall>({
  schemaKind: IMAGERY_SCHEMA_KIND,
  schemaVersion: IMAGERY_SCHEMA_VERSION,
  bodySchema: portableImageryCallSchema
    .safeExtend({ schemaKind: z.literal(IMAGERY_SCHEMA_KIND), schemaVersion: z.number().int().positive() })
    .transform(({ execution, images }): PortableImageryCall => ({ execution, images })),
  toWire: canonicalCall,
  fromWire: canonicalCall,
});

export const buildImageryCall = serde.build;
export const parseImageryCall = serde.parse;

export function imageryCallImportHash(call: PortableImageryCall): string {
  const execution = portableImageryExecutionSchema.parse(call.execution);
  const legacyGenerationId = execution.sourceCallId === null ? call.images[0]?.sourceGenerationId : null;
  // Context FK deletion/handle relink changes attribution, not the immutable execution it describes.
  const { subjectCharacterHandle: _subject, chatId: _chat, connectionId: _connection, identityHash: _reuse, ...facts } = execution;
  return sha256Hex(JSON.stringify({ execution: facts, legacyGenerationId }));
}

export function imageryRowImportHash(call: PortableImageryCall, image: PortableImageryImage): string {
  return sha256Hex(JSON.stringify({ call: imageryCallImportHash(call), sourceGenerationId: image.sourceGenerationId, assetId: image.assetId }));
}
