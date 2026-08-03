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
//
// The shared group-bucket FK is structurally satisfied, not caught (#41): `scopesFor` resolves the shared
// bucket's `scopedCharacterId` through `resolveGroupBucketCharacterId`, which is find-OR-MINT — it persists
// the synthetic group `characters` row (via `ctx.mintSyntheticGroupCharacter`) BEFORE any digest write, so
// the `chat_digests.scopedCharacterId` FK can never dangle here. The row's existence is a precondition the
// sweep MINTS, not an assumption it hopes for; `backfillGroupCharacters` is a separate warm-up, not the
// guarantee. And because that precondition is minted inline, the per-chat isolation catch below is NOT a
// silent-skip engine: an isolated chat is COUNTED (`failed`) and logged at `error` level — see there.

import { buildCharacterNameMap, buildPersonaNameMap } from "@orb/contracts/chat";
import { chatParticipants, chats } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { and, eq, isNull } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../context.ts";
import type { BackfillPassCounts, MemoryBackfillCounts, MemoryConfig, MemoryScope, ResolveBackfillMemoryConfig } from "../contract/memory.ts";
import { generateDigests } from "../memory/build/digests.ts";
import { generateSegments } from "../memory/build/segments.ts";
import { loadWitnessHorizons } from "../memory/persistence/queries.ts";
import { loadChatMacroNameProducer } from "../persistence/macro-names.ts";
import { loadRoster } from "../persistence/roster.ts";
import { resolveGroupBucketCharacterId } from "./group-bucket.ts";
import { hostUserIdOf } from "./roster-host.ts";

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
  const hostUserId = hostUserIdOf(roster);
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

/** Build every digest scope bucket for ONE chat, folding the written counts. A cast character's SCOPED bucket
 *  is horizon-gated (it digests only the blocks it witnessed — correct across kick→re-add); the shared group
 *  bucket (its `scopedCharacterId` is the synthetic group char, NOT in the cast) stays horizon-free (the merged
 *  build; digests.ts §22-23). Mirrors the engine's post-turn enumeration exactly. Cooperative abort between
 *  buckets. */
async function buildChatDigests(
  ctx: ChatContext,
  args: {
    readonly chatId: ChatId;
    readonly cast: readonly CharacterId[];
    readonly config: MemoryConfig | null;
    readonly macroNames: RowMacroNameContext;
    readonly scopes: readonly MemoryScope[];
    readonly signal: AbortSignal;
  },
): Promise<BackfillPassCounts> {
  const counts = { scanned: 0, changed: 0 };
  const castSet = new Set<CharacterId>(args.cast);
  for (const scope of args.scopes) {
    if (args.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: sequential by design (parallel buckets would race the summarizer + db).
    const witnessing = castSet.has(scope.scopedCharacterId) ? await loadWitnessHorizons(ctx.db, args.chatId, scope.scopedCharacterId) : undefined;
    const d = await generateDigests(ctx, {
      scope,
      config: args.config,
      macroNames: args.macroNames,
      signal: args.signal,
      ...(witnessing !== undefined ? { witnessing } : {}),
    });
    counts.scanned += 1;
    counts.changed += d.written;
  }
  return counts;
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
  let failed = 0;
  for (const chatId of await loadAllChatIds(ctx, args.ownerId)) {
    if (args.signal.aborted) {
      break; // cooperative abort between chats — every completed unit is durable + idempotent
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: the sweep is sequential by design — parallel chats would race the summarizer + db.
      const { cast, hostUserId, macroNames } = await loadCastAndHost(ctx, chatId);
      // Resolved inside the per-chat try so a settings-read failure is counted + continues.
      const config = hostUserId === null ? null : await resolveMemoryConfig(hostUserId);
      if (config?.mode === "off") {
        continue; // the host disabled memory — skip enumerate/mint/build entirely.
      }
      const seg = await generateSegments(ctx, { chatId, config, macroNames, signal: args.signal });
      segments.scanned += 1;
      segments.changed += seg.written;
      const scopes = await scopesFor(ctx, chatId, cast, hostUserId);
      const chatDigests = await buildChatDigests(ctx, { chatId, cast, config, macroNames, scopes, signal: args.signal });
      digests.scanned += chatDigests.scanned;
      digests.changed += chatDigests.changed;
    } catch (err) {
      // One bad chat must not kill the corpus-wide sweep — every unit is idempotent, so the poisoned chat
      // self-heals on a later run. But an isolated skip is NOT a silent skip (#41): every reachable
      // "expected" branch above (`mode:"off"` → continue, hostless shared bucket → handled in `scopesFor`,
      // abort → break) resolves WITHOUT throwing, so anything landing here is an UNEXPECTED failure. Surface
      // it LOUDLY (`error` level) AND count it into the returned `failed` — so a future unknown fault can't
      // vanish a chat's memory without a trace in the log or the workload result.
      failed += 1;
      getLog().error({ err, chatId }, "memory backfill: chat FAILED and was skipped (unexpected error)");
    }
  }
  return { segments, digests, failed };
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
    const hostUserId = hostUserIdOf(roster);
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
