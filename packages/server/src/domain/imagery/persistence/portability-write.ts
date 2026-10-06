// The first WRITE arbitrates the owned call identity; every later output selects that winning claim.
// Complete asset-group admission is repeated inside each write, so an invalid sibling admits nothing.
import type { ImageryImportSource, PortableImageryCall, PortableImageryImage } from "@orb/contracts/imagery";
import type { Db } from "@orb/db";
import { assets, characters, imageryGenerations, imageryImportCalls } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { CharacterHandle, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, inArray, isNull, notExists, or, sql } from "drizzle-orm";
import { imageryCallImportHash, imageryRowImportHash } from "#kit/serde/imagery";
import type { ImageryImportOutputInput, ImageryImportWriteResult, ImageryPortabilityContext, NativeImageryImportMatch } from "../contract/portability.ts";
import { readOwnedImageryCalls } from "./portability-read.ts";

async function findNativeMatch(db: Db, ownerId: UserId, call: PortableImageryCall): Promise<NativeImageryImportMatch | null> {
  const hash = imageryCallImportHash(call);
  for (const candidate of await readOwnedImageryCalls(db, ownerId, true)) {
    if (imageryCallImportHash(candidate) !== hash) {
      continue;
    }
    const survivingImages = candidate.images.filter((row) =>
      call.images.some((image) => row.sourceGenerationId === image.sourceGenerationId && row.assetId === image.assetId),
    );
    if (survivingImages.length > 0) {
      return { call: { ...candidate, images: survivingImages }, callId: candidate.execution.sourceCallId };
    }
  }
  return null;
}

function nativeRowExists(db: Db, ownerId: UserId, match: NativeImageryImportMatch, image: PortableImageryImage): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(imageryGenerations)
      .innerJoin(assets, eq(assets.id, imageryGenerations.assetId))
      .where(
        and(
          eq(assets.ownerId, ownerId),
          eq(assets.id, image.assetId),
          eq(imageryGenerations.id, image.sourceGenerationId),
          match.callId === null ? isNull(imageryGenerations.callId) : eq(imageryGenerations.callId, match.callId),
          isNull(imageryGenerations.importSource),
        ),
      ),
  );
}

function allAssetsOwned(db: Db, ownerId: UserId, call: PortableImageryCall): SQL {
  const ids = call.images.map((image) => image.assetId).filter((id, index, all) => all.indexOf(id) === index);
  return sql`(${db
    .select({ count: sql<number>`count(*)` })
    .from(assets)
    .where(and(eq(assets.ownerId, ownerId), inArray(assets.id, ids)))}) = ${ids.length}`;
}

function winningNativeRowExists(db: Db, ownerId: UserId, call: PortableImageryCall, image: PortableImageryImage): SQL {
  const claim = db
    .select({ id: imageryImportCalls.id })
    .from(imageryImportCalls)
    .where(and(eq(imageryImportCalls.ownerId, ownerId), eq(imageryImportCalls.identity, imageryCallImportHash(call))));
  return exists(
    db
      .select({ one: sql`1` })
      .from(imageryGenerations)
      .innerJoin(assets, eq(assets.id, imageryGenerations.assetId))
      .where(
        and(
          eq(assets.ownerId, ownerId),
          eq(assets.id, image.assetId),
          eq(imageryGenerations.id, image.sourceGenerationId),
          eq(imageryGenerations.callId, sql`(${claim})`),
          isNull(imageryGenerations.importSource),
        ),
      ),
  );
}

function importedRowExists(db: Db, ownerId: UserId, call: PortableImageryCall, image: PortableImageryImage): SQL {
  return exists(
    db
      .select({ one: sql`1` })
      .from(imageryGenerations)
      .innerJoin(assets, eq(assets.id, imageryGenerations.assetId))
      .where(and(eq(assets.ownerId, ownerId), eq(assets.id, image.assetId), eq(imageryGenerations.importHash, imageryRowImportHash(call, image)))),
  );
}

async function subjectIsLinked(db: Db, ownerId: UserId, call: PortableImageryCall, native: NativeImageryImportMatch | null): Promise<boolean> {
  const handle = call.execution.subjectCharacterHandle;
  if (handle === null) {
    return true;
  }
  const claim = db
    .select({ id: imageryImportCalls.id })
    .from(imageryImportCalls)
    .where(and(eq(imageryImportCalls.ownerId, ownerId), eq(imageryImportCalls.identity, imageryCallImportHash(call))));
  const nativeLegacy =
    native !== null && native.callId === null
      ? and(
          isNull(imageryGenerations.callId),
          inArray(
            imageryGenerations.id,
            call.images.map((image) => image.sourceGenerationId),
          ),
        )
      : sql`false`;
  const rows = await db
    .select({ id: imageryGenerations.id, assetId: imageryGenerations.assetId, importHash: imageryGenerations.importHash })
    .from(imageryGenerations)
    .innerJoin(assets, eq(assets.id, imageryGenerations.assetId))
    .innerJoin(characters, eq(characters.id, imageryGenerations.subjectCharacterId))
    .where(
      and(
        eq(assets.ownerId, ownerId),
        eq(characters.ownerId, ownerId),
        eq(characters.handle, castId<CharacterHandle>(handle)),
        or(eq(imageryGenerations.callId, sql`(${claim})`), nativeLegacy),
      ),
    );
  return call.images.every((image) =>
    rows.some((row) => row.assetId === image.assetId && (row.importHash === imageryRowImportHash(call, image) || row.id === image.sourceGenerationId)),
  );
}

function outputStatement(
  ctx: ImageryPortabilityContext,
  ownerId: UserId,
  call: PortableImageryCall,
  { image, id, native }: ImageryImportOutputInput,
): BatchStmt {
  const { db } = ctx;
  const execution = call.execution;
  const importHash = imageryRowImportHash(call, image);
  const source: ImageryImportSource = {
    sourceCallId: execution.sourceCallId,
    sourceGenerationId: image.sourceGenerationId,
    subjectCharacterHandle: execution.subjectCharacterHandle,
    chatId: execution.chatId,
    connectionId: execution.connectionId,
    identityHash: execution.identityHash,
  };
  const claim = db
    .select({ id: imageryImportCalls.id })
    .from(imageryImportCalls)
    .where(and(eq(imageryImportCalls.ownerId, ownerId), eq(imageryImportCalls.identity, imageryCallImportHash(call))));
  const subject =
    execution.subjectCharacterHandle === null
      ? sql`null`
      : sql`(${db
          .select({ id: characters.id })
          .from(characters)
          .where(and(eq(characters.ownerId, ownerId), eq(characters.handle, castId<CharacterHandle>(execution.subjectCharacterHandle))))
          .limit(1)})`;
  return db.insert(imageryGenerations).select(
    db
      .select({
        id: sql`${id}`.as("id"),
        assetId: sql`${image.assetId}`.as("asset_id"),
        chatId: sql`null`.as("chat_id"),
        mode: sql`${execution.mode}`.as("mode"),
        subjectCharacterId: subject.as("subject_character_id"),
        identityHash: sql`null`.as("identity_hash"),
        prompt: sql`${execution.prompt}`.as("prompt"),
        negativePrompt: sql`${execution.negativePrompt}`.as("negative_prompt"),
        model: sql`${execution.model}`.as("model"),
        provider: sql`${execution.provider}`.as("provider"),
        connectionId: sql`null`.as("connection_id"),
        costUsd: sql`${execution.costUsd}`.as("cost_usd"),
        servedModel: sql`${execution.usage.servedModel}`.as("served_model"),
        tokensIn: sql`${execution.usage.tokensIn}`.as("tokens_in"),
        tokensOut: sql`${execution.usage.tokensOut}`.as("tokens_out"),
        reasoningTokens: sql`${execution.usage.reasoningTokens}`.as("reasoning_tokens"),
        cacheReadTokens: sql`${execution.usage.cacheReadTokens}`.as("cache_read_tokens"),
        cacheWriteTokens: sql`${execution.usage.cacheWriteTokens}`.as("cache_write_tokens"),
        costProvenance: sql`${execution.usage.costProvenance}`.as("cost_provenance"),
        costDetails: sql`${execution.usage.costDetails === null ? null : JSON.stringify(execution.usage.costDetails)}`.as("cost_details"),
        tokenDetails: sql`${execution.usage.tokenDetails === null ? null : JSON.stringify(execution.usage.tokenDetails)}`.as("token_details"),
        responseCache: sql`${execution.usage.responseCache === undefined ? null : JSON.stringify(execution.usage.responseCache)}`.as("response_cache"),
        edited: sql`${execution.edited ? 1 : 0}`.as("edited"),
        createdAt: sql`${execution.createdAt}`.as("created_at"),
        callId: sql`(${claim})`.as("call_id"),
        importHash: sql`${importHash}`.as("import_hash"),
        importSource: sql`${JSON.stringify(source)}`.as("import_source"),
      })
      .from(assets)
      .where(
        and(
          eq(assets.id, image.assetId),
          eq(assets.ownerId, ownerId),
          allAssetsOwned(db, ownerId, call),
          exists(claim),
          native === null ? sql`true` : sql`not (${nativeRowExists(db, ownerId, native, image)})`,
          sql`not (${winningNativeRowExists(db, ownerId, call, image)})`,
          notExists(
            db
              .select({ one: sql`1` })
              .from(imageryGenerations)
              .where(and(eq(imageryGenerations.assetId, image.assetId), eq(imageryGenerations.importHash, importHash))),
          ),
        ),
      ),
  );
}

export async function writeImportedImageryCall(ctx: ImageryPortabilityContext, ownerId: UserId, call: PortableImageryCall): Promise<ImageryImportWriteResult> {
  const { db } = ctx;
  const first = call.images[0];
  if (first === undefined) {
    throw new Error("An imagery call must contain an output");
  }
  const ids = call.images.map(() => ctx.newGenerationId());
  const native = await findNativeMatch(db, ownerId, call);
  // A retained native output proves the execution; missing siblings are restored only while that owned witness still exists.
  const nativeAdmission = native === null ? sql`true` : or(...native.call.images.map((image) => nativeRowExists(db, ownerId, native, image)));
  const candidateId = native?.callId ?? ctx.newCallId();
  const statements: BatchStmt[] = [
    db
      .insert(imageryImportCalls)
      .select(
        db
          .select({
            id: sql`${candidateId}`.as("id"),
            ownerId: sql`${ownerId}`.as("owner_id"),
            identity: sql`${imageryCallImportHash(call)}`.as("identity"),
          })
          .from(assets)
          .where(and(eq(assets.id, first.assetId), eq(assets.ownerId, ownerId), allAssetsOwned(db, ownerId, call), nativeAdmission)),
      )
      .onConflictDoNothing({ target: [imageryImportCalls.ownerId, imageryImportCalls.identity] }),
  ];
  call.images.forEach((image, index) => {
    const id = ids[index];
    if (id !== undefined) {
      statements.push(outputStatement(ctx, ownerId, call, { image, id, native }));
    }
  });
  ctx.bumpStatsCanonVersion(statements, db, ownerId);
  await db.batch(batchMany(statements));
  const complete = await db
    .select({ id: imageryImportCalls.id })
    .from(imageryImportCalls)
    .where(
      and(
        eq(imageryImportCalls.ownerId, ownerId),
        eq(imageryImportCalls.identity, imageryCallImportHash(call)),
        allAssetsOwned(db, ownerId, call),
        ...call.images.map((image) =>
          or(
            winningNativeRowExists(db, ownerId, call, image),
            native === null ? sql`false` : nativeRowExists(db, ownerId, native, image),
            importedRowExists(db, ownerId, call, image),
          ),
        ),
      ),
    )
    .limit(1);
  const created = await db
    .select({ id: imageryGenerations.id, subject: imageryGenerations.subjectCharacterId })
    .from(imageryGenerations)
    .innerJoin(assets, eq(assets.id, imageryGenerations.assetId))
    .where(and(eq(assets.ownerId, ownerId), inArray(imageryGenerations.id, ids)));
  return { admitted: complete.length > 0, created: created.length > 0, subjectLinked: await subjectIsLinked(db, ownerId, call, native) };
}
