// domain/chat/substrate/backfill — the corpus-wide maintenance sweeps the workloads engine drives. Two
// sweeps, both @public composition-root helpers, homed in `substrate/` because they coordinate the
// `memory/` subsystem + `persistence/` reads.
//
//   - `backfillMemory` — enumerate every chat, run the segment build, then the digest build per scope
//     bucket, mirroring the engine's post-turn enumeration. Per-chat builds are already idempotent/
//     self-healing, so the sweep is resumable. A `mode:"off"` host's chat is skipped entirely.
//   - `backfillGroupCharacters` — mint the synthetic group character for every >1-character room that
//     lacks one. Idempotent: `findSyntheticGroupCharacter` short-circuits an existing mint.
//
// Cooperative abort: the signal is checked between chats/buckets — a partial sweep is safe.

import { buildCharacterNameMap, buildPersonaNameMap } from "@orb/contracts/chat";
import { chatParticipants, chats } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { and, eq, isNull } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../context";
import type { BackfillPassCounts, MemoryBackfillCounts, MemoryScope, ResolveBackfillMemoryConfig } from "../contract/memory";
import { generateDigests } from "../memory/build/digests";
import { generateSegments } from "../memory/build/segments";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import { loadRoster } from "../persistence/roster";
import { resolveGroupBucketCharacterId } from "./group-bucket";

/** The sweep universe (temporary chats included; they are live rooms until reaped). `ownerId` scopes to
 *  the chats that user hosts (a present, non-departed host participant); omitted/null = every chat. */
async function loadAllChatIds(ctx: ChatContext, hostUserId?: UserId | null): Promise<ChatId[]> {
  if (hostUserId === undefined || hostUserId === null) {
    const rows = await ctx.db.select({ id: chats.id }).from(chats);
    return rows.map((r) => r.id);
  }
  const rows = await ctx.db
    .select({ id: chats.id })
    .from(chats)
    .innerJoin(
      chatParticipants,
      and(
        eq(chatParticipants.chatId, chats.id),
        eq(chatParticipants.kind, "human"),
        eq(chatParticipants.role, "host"),
        eq(chatParticipants.userId, hostUserId),
        isNull(chatParticipants.leftSeq),
      ),
    );
  return rows.map((r) => r.id);
}

/** A chat's present cast + its host + the macro name producer (the summarizer transcript labels resolve
 *  by character/persona name, not the raw id). One roster read serves all three. */
async function loadCastAndHost(
  ctx: ChatContext,
  chatId: ChatId,
): Promise<{
  cast: CharacterId[];
  hostUserId: UserId | null;
  macroNames: RowMacroNameContext;
}> {
  const roster = await loadRoster(ctx.db, chatId);
  const cast = roster.flatMap((r) => (r.kind === "character" && r.characterId !== null ? [r.characterId] : []));
  const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
  const producer = await loadChatMacroNameProducer(ctx.db, { participants: roster });
  const macroNames: RowMacroNameContext = {
    characterNamesById: buildCharacterNameMap(producer.characterNames),
    personaNamesById: buildPersonaNameMap(producer.personaNames),
  };
  return { cast, hostUserId, macroNames };
}

/** The digest scope buckets for one chat — mirrors the engine's post-turn enumeration: the shared group
 *  bucket gated on cast size (no-op for solo), then every cast character's bucket. A hostless group has
 *  no funding owner to mint under, so its shared bucket is skipped (per-character buckets still build). */
async function scopesFor(ctx: ChatContext, chatId: ChatId, cast: readonly CharacterId[], hostUserId: UserId | null): Promise<MemoryScope[]> {
  const scopes: MemoryScope[] = [];
  if (cast.length > 1 && hostUserId !== null) {
    const scopedCharacterId = await resolveGroupBucketCharacterId(ctx, {
      ownerId: hostUserId,
      chatId,
    });
    scopes.push({ chatId, scopedCharacterId, isGroup: cast.length > 1 });
  }
  for (const scopedCharacterId of cast) {
    scopes.push({ chatId, scopedCharacterId, isGroup: cast.length > 1 });
  }
  return scopes;
}

/**
 * The corpus-wide memory backfill: segments then digests-per-scope for every chat, folding the written
 * counts. Each per-chat build is the same idempotent/self-healing front door the engine's post-turn
 * trigger uses — this sweep only enumerates (chat × scope) and folds.
 */
export async function backfillMemory(
  ctx: ChatContext,
  args: { readonly signal: AbortSignal; readonly ownerId?: UserId | null },
  resolveMemoryConfig: ResolveBackfillMemoryConfig,
): Promise<MemoryBackfillCounts> {
  const segments = { scanned: 0, changed: 0 };
  const digests = { scanned: 0, changed: 0 };
  for (const chatId of await loadAllChatIds(ctx, args.ownerId)) {
    if (args.signal.aborted) {
      break; // cooperative abort between chats — every completed unit is durable + idempotent
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: the sweep is sequential by design — parallel chats would race the summarizer + db.
      const { cast, hostUserId, macroNames } = await loadCastAndHost(ctx, chatId);
      // Resolved inside the per-chat try so a settings-read failure warns + continues.
      const config = hostUserId === null ? null : await resolveMemoryConfig(hostUserId);
      if (config?.mode === "off") {
        continue; // the host disabled memory — skip enumerate/mint/build entirely.
      }
      const seg = await generateSegments(ctx, { chatId, config, macroNames, signal: args.signal });
      segments.scanned += 1;
      segments.changed += seg.written;
      const scopes = await scopesFor(ctx, chatId, cast, hostUserId);
      for (const scope of scopes) {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- signal.aborted can flip between the outer check and here (multiple awaits in between); tsc's narrowing doesn't see that.
        if (args.signal.aborted) {
          break;
        }
        // biome-ignore lint/performance/noAwaitInLoops: sequential by design (see the segment pass above).
        const d = await generateDigests(ctx, { scope, config, macroNames, signal: args.signal });
        digests.scanned += 1;
        digests.changed += d.written;
      }
    } catch (err) {
      // One bad chat must not kill the corpus-wide sweep — every unit is idempotent, so the poisoned
      // chat self-heals on a later run.
      getLog().warn({ err, chatId }, "memory backfill: chat skipped after error");
    }
  }
  return { segments, digests };
}

/**
 * The group-character backfill: every \>1-character room gets its synthetic group character if it lacks
 * one. Idempotent — an existing mint is a scanned-not-changed pass. `scanned` = group rooms visited;
 * `changed` = characters minted this run.
 */
export async function backfillGroupCharacters(
  ctx: ChatContext,
  args: { readonly signal: AbortSignal; readonly ownerId?: UserId | null },
): Promise<BackfillPassCounts> {
  const counts = { scanned: 0, changed: 0 };
  for (const chatId of await loadAllChatIds(ctx, args.ownerId)) {
    if (args.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: sequential by design — the mint writes must not race each other (idempotence is per-chat, checked-then-minted).
    const roster = await loadRoster(ctx.db, chatId);
    const cast = roster.filter((r) => r.kind === "character" && r.characterId !== null);
    const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
    if (cast.length <= 1 || hostUserId === null) {
      continue; // solo/empty rooms need no group character; a hostless room has no funding owner
    }
    counts.scanned += 1;
    const existing = await ctx.findSyntheticGroupCharacter({ ownerId: hostUserId, chatId });
    if (existing !== null) {
      continue;
    }
    await ctx.mintSyntheticGroupCharacter({ ownerId: hostUserId, chatId });
    counts.changed += 1;
  }
  return counts;
}
