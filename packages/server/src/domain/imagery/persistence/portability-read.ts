// Bulk history projection gates every output through the actual asset owner, including uncurated
// images. Owned subject handles are labels for restore, never a carried foreign character authority.
import type { PortableImageryCall, PortableImageryExecution } from "@orb/contracts/imagery";
import { imageryImportSourceSchema } from "@orb/contracts/imagery";
import { costDetailsSchema, generationUsageDetailsSchema, responseCacheSchema, tokenDetailsSchema } from "@orb/contracts/inference";
import type { Db } from "@orb/db";
import { assets, characters, imageryGenerations } from "@orb/db";
import type { UserId } from "@orb/kit/ids";
import { and, asc, eq, isNull } from "drizzle-orm";

function projectedCall(row: typeof imageryGenerations.$inferSelect, subjectHandle: string | null): PortableImageryCall {
  const source = imageryImportSourceSchema.nullable().parse(row.importSource);
  const responseCache = responseCacheSchema.safeParse(row.responseCache);
  const execution: PortableImageryExecution = {
    sourceCallId: source === null ? row.callId : source.sourceCallId,
    mode: row.mode,
    prompt: row.prompt,
    negativePrompt: row.negativePrompt,
    model: row.model,
    provider: row.provider,
    costUsd: row.costUsd,
    usage: generationUsageDetailsSchema.parse({
      servedModel: row.servedModel,
      tokensIn: row.tokensIn,
      tokensOut: row.tokensOut,
      cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens,
      reasoningTokens: row.reasoningTokens,
      costProvenance: row.costProvenance,
      costDetails: costDetailsSchema.nullable().catch(null).parse(row.costDetails),
      tokenDetails: tokenDetailsSchema.nullable().catch(null).parse(row.tokenDetails),
      ...(responseCache.success ? { responseCache: responseCache.data } : {}),
    }),
    subjectCharacterHandle: source === null ? subjectHandle : source.subjectCharacterHandle,
    chatId: source === null ? row.chatId : source.chatId,
    connectionId: source === null ? row.connectionId : source.connectionId,
    identityHash: source === null ? row.identityHash : source.identityHash,
    edited: row.edited,
    createdAt: row.createdAt,
  };
  const image = { sourceGenerationId: source?.sourceGenerationId ?? row.id, assetId: row.assetId };
  return { execution, images: [image] };
}

export async function readOwnedImageryCalls(db: Db, ownerId: UserId, nativeOnly = false): Promise<PortableImageryCall[]> {
  const rows = await db
    .select({ generation: imageryGenerations, subjectHandle: characters.handle })
    .from(imageryGenerations)
    .innerJoin(assets, eq(assets.id, imageryGenerations.assetId))
    .leftJoin(characters, and(eq(characters.id, imageryGenerations.subjectCharacterId), eq(characters.ownerId, ownerId)))
    .where(and(eq(assets.ownerId, ownerId), nativeOnly ? isNull(imageryGenerations.importSource) : undefined))
    .orderBy(asc(imageryGenerations.createdAt), asc(imageryGenerations.id));
  const calls: { readonly key: string; readonly call: PortableImageryCall }[] = [];
  for (const { generation: row, subjectHandle } of rows) {
    const key = row.callId ?? row.id;
    const call = projectedCall(row, subjectHandle);
    const prior = calls.find((item) => item.key === key);
    if (prior === undefined) {
      calls.push({ key, call });
    } else {
      prior.call.images.push(...call.images);
    }
  }
  return calls.map((item) => item.call);
}
