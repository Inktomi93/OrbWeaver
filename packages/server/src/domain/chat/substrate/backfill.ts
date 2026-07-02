// domain/chat/substrate/backfill — the corpus-wide P5 maintenance sweeps the workloads engine drives
// (PD-41). Two sweeps, both @public composition-root helpers (the `generateDigests`/`generateSegments`
// front-door precedent), homed in `substrate/` because they COORDINATE the `memory/` subsystem +
// `persistence/` reads (the `assemble-gather.ts` seam rule — a verb may not import `memory/` directly):
//
//   • `backfillMemory` — the PD-41 memory-sweep piece: enumerate EVERY chat, run the segment build,
//     then the digest build per SCOPE BUCKET — mirroring the engine's post-turn enumeration EXACTLY
//     (engine.ts §3a: the `__group__<chatId>` shared bucket only when the cast is >1, then every cast
//     character's egocentric bucket). The per-chat builds are already idempotent/self-healing (hash-diff),
//     so the sweep is resumable by nature; `mode:'off'` chats fold zero work.
//   • `backfillGroupCharacters` — mint the synthetic group character for every >1-character room that
//     lacks one (the shared memory bucket / narrator author — D38). Idempotent: `findSyntheticGroupCharacter`
//     short-circuits an existing mint. Owner = the room HOST (D18/D19 — the one authority + funding source).
//
// Cooperative abort (the `reconcileStats` precedent): the signal is checked BETWEEN chats/buckets — a
// partial sweep is safe (every unit is independently idempotent) and the next run resumes the rest.

import { chats } from "@orb/db";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ChatContext } from "../contract/context";
import type { BackfillPassCounts, MemoryBackfillCounts, MemoryScope } from "../contract/memory";
import { generateDigests } from "../memory/build/digests";
import { generateSegments } from "../memory/build/segments";
import { loadRoster } from "../persistence/roster";

/** Every chat id (the sweep universe — temporary chats included; they are live rooms until reaped). */
async function loadAllChatIds(ctx: ChatContext): Promise<ChatId[]> {
  const rows = await ctx.db.select({ id: chats.id }).from(chats);
  return rows.map((r) => r.id);
}

/** The present cast character ids of a chat (the digest scope universe + the group-room predicate). */
async function loadCastIds(ctx: ChatContext, chatId: ChatId): Promise<CharacterId[]> {
  const roster = await loadRoster(ctx.db, chatId);
  return roster.flatMap((r) =>
    r.kind === "character" && r.characterId !== null ? [r.characterId] : [],
  );
}

/** The digest scope buckets for one chat — MIRRORS the engine's post-turn enumeration (engine.ts §3a):
 *  the `__group__<chatId>` shared bucket gated on CAST SIZE (no-op at a cast of 1 — byte-identity for
 *  solo), then every cast character's bucket. */
function scopesFor(chatId: ChatId, cast: readonly CharacterId[]): MemoryScope[] {
  return [
    ...(cast.length > 1
      ? [
          {
            chatId,
            scopedCharacterId: castId<CharacterId>(`__group__${chatId}`),
            isGroup: cast.length > 1,
          },
        ]
      : []),
    ...cast.map((scopedCharacterId) => ({ chatId, scopedCharacterId, isGroup: cast.length > 1 })),
  ];
}

/**
 * The corpus-wide memory backfill (PD-41): segments then digests-per-scope for every chat, folding the
 * written counts. Each per-chat build is the SAME idempotent/self-healing front door the engine's post-turn
 * trigger uses — this sweep only ENUMERATES (chat × scope) and folds; the memory logic stays in `memory/`.
 */
export async function backfillMemory(
  ctx: ChatContext,
  args: { readonly signal: AbortSignal },
): Promise<MemoryBackfillCounts> {
  const segments = { scanned: 0, changed: 0 };
  const digests = { scanned: 0, changed: 0 };
  for (const chatId of await loadAllChatIds(ctx)) {
    if (args.signal.aborted) {
      break; // cooperative abort between chats — every completed unit is durable + idempotent
    }
    // biome-ignore lint/performance/noAwaitInLoops: the sweep is sequential BY DESIGN (the engine's own §3a comment — the memory logic bounds its concurrency; parallel chats would race the summarizer + db).
    const seg = await generateSegments(ctx, { chatId, signal: args.signal });
    segments.scanned += 1;
    segments.changed += seg.written;
    const cast = await loadCastIds(ctx, chatId);
    for (const scope of scopesFor(chatId, cast)) {
      if (args.signal.aborted) {
        break;
      }
      // biome-ignore lint/performance/noAwaitInLoops: sequential by design (see the segment pass above).
      const d = await generateDigests(ctx, { scope, signal: args.signal });
      digests.scanned += 1;
      digests.changed += d.written;
    }
  }
  return { segments, digests };
}

/**
 * The group-character backfill (PD-41/D38): every >1-character room gets its synthetic group character
 * (the shared memory bucket key + the narrator author) if it lacks one. Idempotent — an existing mint is a
 * scanned-not-changed pass. `scanned` = group rooms visited; `changed` = characters minted this run.
 */
export async function backfillGroupCharacters(
  ctx: ChatContext,
  args: { readonly signal: AbortSignal },
): Promise<BackfillPassCounts> {
  const counts = { scanned: 0, changed: 0 };
  for (const chatId of await loadAllChatIds(ctx)) {
    if (args.signal.aborted) {
      break;
    }
    // biome-ignore lint/performance/noAwaitInLoops: sequential by design — the mint writes must not race each other (idempotence is per-chat, checked-then-minted).
    const roster = await loadRoster(ctx.db, chatId);
    const cast = roster.filter((r) => r.kind === "character" && r.characterId !== null);
    const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
    if (cast.length <= 1 || hostUserId === null) {
      continue; // solo/empty rooms need no group character; a hostless room has no funding owner (D19)
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
