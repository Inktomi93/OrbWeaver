// Completed paid facts exist under retained chat/source parents until one atomic canon transfer removes them.

import { parseVariantMetadata } from "@orb/contracts/chat";
import { generationUsageLegSchema, projectGenerationUsage, responseCacheSchema, storedGenerationUsageLegSchema } from "@orb/contracts/inference";
import type { RetainedChatAccountingScope } from "@orb/contracts/stats";
import { generationObservationSpendDelta } from "@orb/contracts/stats";
import { chatGenerationObservations, chats, messages, messageVariants, userConnections } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { GenerationObservationPersistenceError } from "@orb/inference";
import type { SQL } from "drizzle-orm";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import type { ChatContext } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type {
  GenerationObservationContext,
  GenerationObservationFact,
  GenerationObservationGroup,
  GenerationObservationParent,
  GenerationObservationRemovalScope,
  GenerationObservationSession,
} from "../contract/generation-observation.ts";
import { groupObservationRows } from "../substrate/generation-observation.ts";
import { appendStatsDeltas, canonMessageDelta, canonRowOf, swipeRowOf, swipeVariantDelta } from "../substrate/stats-delta.ts";
import { isRetainedParentFenceViolation, retainedChatFenceStatement } from "./canon-write.ts";

function retainedParent(parent: GenerationObservationParent, facts: readonly GenerationObservationFact[] = [], predicate?: SQL): SQL {
  return sql`select ${chats.id} from ${chats} where ${and(
    eq(chats.id, parent.chatId),
    predicate,
    parent.sourceMessageId === null
      ? undefined
      : sql`exists (
      select 1 from ${messages} where ${messages.id} = ${parent.sourceMessageId} and ${messages.chatId} = ${parent.chatId})`,
    parent.sourceVariantId === null
      ? undefined
      : sql`exists (
      select 1 from ${messageVariants} where ${messageVariants.id} = ${parent.sourceVariantId} and ${messageVariants.messageId} = ${parent.sourceMessageId})`,
    ...facts.map(
      (fact) => sql`exists (
      select 1 from ${chatGenerationObservations}
      where ${chatGenerationObservations.chatId} = ${parent.chatId}
        and ${chatGenerationObservations.turnId} = ${parent.turnId}
        and ${chatGenerationObservations.ordinal} = ${fact.ordinal}
        and ${chatGenerationObservations.funderUserId} = ${fact.funderUserId}
        and ${chatGenerationObservations.sourceMessageId} is ${parent.sourceMessageId}
        and ${chatGenerationObservations.sourceVariantId} is ${parent.sourceVariantId}
        and ${chatGenerationObservations.model} = ${fact.leg.model}
        and ${chatGenerationObservations.provider} = ${fact.leg.provider}
        and ${chatGenerationObservations.wire} = ${fact.leg.wire}
        and ${chatGenerationObservations.observedAt} = ${fact.leg.observedAt})`,
    ),
    facts.length === 0
      ? undefined
      : sql`(
      select count(*) from ${chatGenerationObservations}
      where ${chatGenerationObservations.chatId} = ${parent.chatId}
        and ${chatGenerationObservations.turnId} = ${parent.turnId}) = ${facts.length}`,
  )} `;
}

/** First write of a transfer batch: the required id refuses missing facts before any inverse or canon write. */
function generationObservationFenceStatement(
  ctx: GenerationObservationContext,
  parent: GenerationObservationParent,
  facts: readonly GenerationObservationFact[],
  predicate?: SQL,
): BatchStmt {
  return retainedChatFenceStatement(ctx.db, retainedParent(parent, facts, predicate));
}

function removalPredicate(scope: GenerationObservationRemovalScope): SQL {
  return sql`${and(
    inArray(chatGenerationObservations.chatId, scope.chatIds),
    scope.messageIds === undefined ? undefined : inArray(chatGenerationObservations.sourceMessageId, scope.messageIds),
    scope.variantIds === undefined ? undefined : inArray(chatGenerationObservations.sourceVariantId, scope.variantIds),
  )}`;
}

/** Load only observations whose retained parents the already-authorized mutation removes. */
export async function loadGenerationObservationsForRemoval(
  ctx: GenerationObservationContext,
  scope: GenerationObservationRemovalScope,
): Promise<GenerationObservationGroup[]> {
  const rows = await ctx.db
    .select()
    .from(chatGenerationObservations)
    .where(removalPredicate(scope))
    .orderBy(asc(chatGenerationObservations.chatId), asc(chatGenerationObservations.turnId), asc(chatGenerationObservations.ordinal));
  return groupObservationRows(rows);
}

function removalFenceSelection(scope: GenerationObservationRemovalScope, groups: readonly GenerationObservationGroup[]): SQL {
  const count = groups.reduce((total, group) => total + group.facts.length, 0);
  return sql`select ${chats.id} from ${chats} where ${and(
    inArray(chats.id, scope.chatIds),
    scope.chatPredicate,
    sql`(select count(*) from ${chatGenerationObservations} where ${removalPredicate(scope)}) = ${count}`,
    ...groups.map((group) => sql`exists (${retainedParent(group.parent, group.facts, scope.chatPredicate)})`),
  )} order by ${chats.id} limit 1`;
}

/** A declined required-id gate is distinct from an unrelated database failure. */
export async function generationObservationRemovalRefused(
  ctx: GenerationObservationContext,
  scope: GenerationObservationRemovalScope,
  groups: readonly GenerationObservationGroup[],
  error: unknown,
): Promise<boolean> {
  return isRetainedParentFenceViolation(error) && (await ctx.db.all(removalFenceSelection(scope, groups))).length === 0;
}

/** Explicit mutations surface a stale accounting fence as a domain refusal, never a provider retry. */
export async function commitGenerationObservationRemoval(
  ctx: GenerationObservationContext,
  scope: GenerationObservationRemovalScope,
  groups: readonly GenerationObservationGroup[],
  statements: readonly BatchStmt[],
): Promise<Awaited<ReturnType<GenerationObservationContext["db"]["batch"]>>> {
  try {
    return await ctx.db.batch(batchMany(statements));
  } catch (error) {
    if (await generationObservationRemovalRefused(ctx, scope, groups, error)) {
      const refusal = new ChatOperationError(CHAT_OP_CODES.aborted, "the generation facts changed before their source could be removed");
      refusal.cause = error;
      throw refusal;
    }
    throw error;
  }
}

/** Every source and the complete removal cardinality are fenced before any funding inverse can execute. */
export function generationObservationRemovalStatements(
  ctx: GenerationObservationContext,
  scope: GenerationObservationRemovalScope,
  groups: readonly GenerationObservationGroup[],
): BatchStmt[] {
  if (scope.chatIds.length === 0) {
    return [];
  }
  const statements: BatchStmt[] = [retainedChatFenceStatement(ctx.db, removalFenceSelection(scope, groups))];
  for (const group of groups) {
    statements.push(...generationObservationTransferStatements(ctx, group.parent, group.facts).slice(1));
  }
  return statements;
}

/** Append observed economics and its live rollup together; a vanished source cannot leave orphan facts.
 *  @public Test-anchored persistence boundary: the atomic funding/source-fence proofs supply historical
 *  observedAt and nullable/unrecorded connection attribution that the live onObservedResult callback cannot
 *  express (it stamps the current clock and requires a resolved connection). */
export async function appendGenerationObservation(
  ctx: GenerationObservationContext,
  parent: GenerationObservationParent,
  fact: GenerationObservationFact,
): Promise<boolean> {
  const leg = generationUsageLegSchema.parse(fact.leg);
  const statements: BatchStmt[] = [
    batchStmt(
      ctx.db.insert(chatGenerationObservations).values({
        ...parent,
        chatId: sql`(${retainedParent(parent)})`,
        ordinal: fact.ordinal,
        funderUserId: fact.funderUserId,
        connectionId:
          fact.connectionId === null
            ? null
            : sql`(
      select ${userConnections.id} from ${userConnections}
      where ${userConnections.id} = ${fact.connectionId} and ${userConnections.ownerId} = ${fact.funderUserId})`,
        connectionAttributionProvenance: fact.connectionId === null ? "unrecorded" : "recorded",
        ...leg,
        responseCache: leg.responseCache ?? null,
      }),
    ),
  ];
  ctx.applyStatsDelta(statements, ctx.db, generationObservationSpendDelta({ ownerId: fact.funderUserId, leg }));
  try {
    await ctx.db.batch(batchMany(statements));
    return true;
  } catch (error) {
    if (isRetainedParentFenceViolation(error) && (await ctx.db.all(retainedParent(parent))).length === 0) {
      return false;
    }
    throw error;
  }
}

/** Private funding context stays in this parent-owned plane, not the copied normalized legs. */
async function loadGenerationObservations(ctx: GenerationObservationContext, parent: GenerationObservationParent): Promise<GenerationObservationFact[]> {
  const rows = await ctx.db
    .select()
    .from(chatGenerationObservations)
    .where(and(eq(chatGenerationObservations.chatId, parent.chatId), eq(chatGenerationObservations.turnId, parent.turnId)))
    .orderBy(asc(chatGenerationObservations.ordinal));
  return rows.map((row) => ({
    ordinal: row.ordinal,
    funderUserId: row.funderUserId,
    connectionId: row.connectionId,
    leg: storedGenerationUsageLegSchema.parse({ ...row, responseCache: responseCacheSchema.safeParse(row.responseCache).data }),
  }));
}

/** The caller appends these inverses and deletion to its variant write batch: there is never a second money home. */
function generationObservationTransferStatements(
  ctx: GenerationObservationContext,
  parent: GenerationObservationParent,
  facts: readonly GenerationObservationFact[],
  predicate?: SQL,
): BatchStmt[] {
  const statements: BatchStmt[] = facts.length === 0 ? [] : [generationObservationFenceStatement(ctx, parent, facts, predicate)];
  for (const fact of facts) {
    ctx.applyStatsDelta(statements, ctx.db, generationObservationSpendDelta({ ownerId: fact.funderUserId, leg: fact.leg, sign: -1, changedAt: ctx.now() }));
    statements.push(
      batchStmt(
        ctx.db
          .delete(chatGenerationObservations)
          .where(
            and(
              eq(chatGenerationObservations.chatId, parent.chatId),
              eq(chatGenerationObservations.turnId, parent.turnId),
              eq(chatGenerationObservations.ordinal, fact.ordinal),
            ),
          ),
      ),
    );
  }
  return statements;
}

function appendRetainedVariantEconomics(
  ctx: ChatContext,
  statements: BatchStmt[],
  args: {
    readonly scope: RetainedChatAccountingScope<SQL>;
    readonly slot: typeof messages.$inferSelect;
    readonly before: typeof messageVariants.$inferSelect;
    readonly after: typeof messageVariants.$inferSelect;
    readonly variantCount: number;
  },
): void {
  const now = ctx.now();
  const selected = args.slot.selectedVariantId === args.before.id;
  for (const ownerId of args.scope.ownerIds) {
    // @orb-waive membership-enforcer(ownerId): D167 accounting grains compare the canonical character owner, never room authority; ends if this comparison admits an operation.
    const ownerSlot = { ...args.slot, characterId: ownerId === args.scope.characterOwnerId ? args.slot.characterId : null };
    for (const [row, sign] of [
      [args.before, -1],
      [args.after, 1],
    ] as const) {
      appendStatsDeltas(
        ctx,
        statements,
        selected
          ? canonMessageDelta({ ownerId, sign, now, row: canonRowOf(ownerSlot, row, args.variantCount) })
          : swipeVariantDelta({ ownerId, sign, now, row: swipeRowOf(ownerSlot, row) }),
      );
    }
    ctx.bumpStatsCanonVersion(statements, ctx.db, ownerId);
  }
}

async function attachGenerationObservations(ctx: ChatContext, parent: GenerationObservationParent, session: GenerationObservationSession): Promise<void> {
  const { sourceMessageId, sourceVariantId } = parent;
  if (sourceMessageId === null || sourceVariantId === null) {
    return;
  }
  const [facts, rows] = await Promise.all([
    session.load(),
    ctx.db
      .select({
        variant: messageVariants,
        slot: messages,
        rawMetadata: sql<string | null>`${messageVariants.metadata}`,
        rawCostDetails: sql<string | null>`${messageVariants.costDetails}`,
        rawTokenDetails: sql<string | null>`${messageVariants.tokenDetails}`,
        rawResponseCache: sql<string | null>`${messageVariants.responseCache}`,
        variantCount: sql<number>`(select count(*) from ${messageVariants} where ${messageVariants.messageId} = ${messages.id})`,
      })
      .from(messageVariants)
      .innerJoin(messages, eq(messages.id, messageVariants.messageId))
      .where(and(eq(messages.chatId, parent.chatId), eq(messages.id, sourceMessageId), eq(messageVariants.id, sourceVariantId)))
      .limit(1),
  ]);
  const stored = rows[0];
  const metadata = parseVariantMetadata(stored?.variant.metadata);
  // Legacy economics have no guessed wire; facts stay parent-owned until a supported canon transfer exists.
  if (facts.length === 0 || stored === undefined || metadata.usageLegs === undefined || metadata.usageLegs.length === 0) {
    return;
  }
  const { variant, slot } = stored;
  const scope = await ctx.resolveRetainedChatAccountingScope(parent.chatId, slot.characterId);
  if (scope.ownerIds.length === 0) {
    return;
  }
  const usageLegs = [...metadata.usageLegs, ...facts.map((fact) => fact.leg)];
  const usage = projectGenerationUsage(usageLegs).total;
  const next = {
    ...variant,
    ...usage,
    responseCache: usage.responseCache ?? null,
    tokenProvenance: usage.tokensIn === null && usage.tokensOut === null ? ("unrecorded" as const) : ("measured" as const),
    metadata: { ...metadata, usageLegs },
  };
  const predicate = sql`${scope.predicate} and exists (
    select 1 from ${messageVariants} inner join ${messages} on ${messages.id} = ${messageVariants.messageId}
    where ${messageVariants.id} = ${variant.id} and ${messages.id} = ${slot.id} and ${messages.chatId} = ${parent.chatId}
      and ${messages.selectedVariantId} is ${slot.selectedVariantId} and ${messages.characterId} is ${slot.characterId}
      and ${messages.role} = ${slot.role} and ${messages.createdAt} = ${slot.createdAt}
      and ${messageVariants.metadata} is ${stored.rawMetadata} and ${messageVariants.costDetails} is ${stored.rawCostDetails}
      and ${messageVariants.tokenDetails} is ${stored.rawTokenDetails} and ${messageVariants.responseCache} is ${stored.rawResponseCache}
      and ${messageVariants.tokensIn} is ${variant.tokensIn} and ${messageVariants.tokensOut} is ${variant.tokensOut}
      and ${messageVariants.cacheReadTokens} is ${variant.cacheReadTokens} and ${messageVariants.cacheWriteTokens} is ${variant.cacheWriteTokens}
      and ${messageVariants.reasoningTokens} is ${variant.reasoningTokens} and ${messageVariants.costUsd} is ${variant.costUsd}
      and ${messageVariants.costProvenance} = ${variant.costProvenance} and ${messageVariants.tokenProvenance} = ${variant.tokenProvenance}
      and ${messageVariants.servedModel} is ${variant.servedModel} and ${messageVariants.model} is ${variant.model}
      and ${messageVariants.provider} is ${variant.provider} and ${messageVariants.idx} = ${variant.idx}
      and ${messageVariants.content} = ${variant.content} and ${messageVariants.reasoning} is ${variant.reasoning}
      and ${messageVariants.contextWindow} is ${variant.contextWindow} and ${messageVariants.genStartedAt} is ${variant.genStartedAt}
      and ${messageVariants.genFinishedAt} is ${variant.genFinishedAt}
      and (select count(*) from ${messageVariants} where ${messageVariants.messageId} = ${slot.id}) = ${stored.variantCount}
    )`;
  const statements = [...session.transferStatements(facts, predicate)];
  appendRetainedVariantEconomics(ctx, statements, { scope, slot, before: variant, after: next, variantCount: stored.variantCount });
  statements.push(
    batchStmt(
      ctx.db
        .update(messageVariants)
        .set({
          tokensIn: usage.tokensIn,
          tokensOut: usage.tokensOut,
          reasoningTokens: usage.reasoningTokens,
          cacheReadTokens: usage.cacheReadTokens,
          cacheWriteTokens: usage.cacheWriteTokens,
          costUsd: usage.costUsd,
          costDetails: usage.costDetails,
          costProvenance: usage.costProvenance,
          servedModel: usage.servedModel,
          tokenDetails: usage.tokenDetails,
          responseCache: usage.responseCache ?? null,
          tokenProvenance: next.tokenProvenance,
          metadata: next.metadata,
        })
        .where(eq(messageVariants.id, variant.id)),
    ),
  );
  await session.commit(statements, facts, predicate);
}

/** One operation's ordinal allocator is private to that operation, never a registry-global recording sink. */
export function createGenerationObservationSession(
  ctx: GenerationObservationContext,
  parent: GenerationObservationParent,
  targetCtx?: ChatContext,
): GenerationObservationSession {
  let ordinal = 0;
  const session: GenerationObservationSession = {
    onObservedResult: async (result, source): Promise<void> => {
      const factOrdinal = ordinal++;
      try {
        const leg = generationUsageLegSchema.parse({
          ...result.usage,
          model: source.model,
          provider: source.providerId,
          wire: source.wire,
          observedAt: ctx.now(),
          modelCalls: result.numTurns,
          durationApiMs: result.durationApiMs,
          ttftMs: result.ttftMs,
          finishReason: result.finishReason,
          stopReason: result.stopReason,
          terminalReason: result.terminalReason,
          generationId: result.generationId ?? null,
        });
        const retained = await appendGenerationObservation(ctx, parent, {
          ordinal: factOrdinal,
          funderUserId: source.ownerId,
          connectionId: source.connectionId,
          leg,
        });
        if (!retained) {
          throw new ChatOperationError(CHAT_OP_CODES.aborted, "the generation source changed before its completed result could be retained");
        }
        if (targetCtx !== undefined) {
          await attachGenerationObservations(targetCtx, parent, session);
        }
      } catch (cause) {
        throw new GenerationObservationPersistenceError("The completed generation could not be retained.", { cause });
      }
    },
    load: () => loadGenerationObservations(ctx, parent),
    transferStatements: (facts, predicate) => generationObservationTransferStatements(ctx, parent, facts, predicate),
    commit: async (statements, facts, predicate): Promise<void> => {
      try {
        await ctx.db.batch(batchMany(statements));
      } catch (error) {
        if (facts.length > 0 && isRetainedParentFenceViolation(error) && (await ctx.db.all(retainedParent(parent, facts, predicate))).length === 0) {
          const refusal = new ChatOperationError(CHAT_OP_CODES.aborted, "the generation source changed before its completed result could be committed");
          refusal.cause = error;
          throw refusal;
        }
        throw error;
      }
    },
  };
  return session;
}
