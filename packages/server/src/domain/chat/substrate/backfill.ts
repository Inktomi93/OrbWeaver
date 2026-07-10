// domain/chat/substrate/backfill — the corpus-wide P5 maintenance sweeps the workloads engine drives
// (PD-41). Two sweeps, both @public composition-root helpers (the `generateDigests`/`generateSegments`
// front-door precedent), homed in `substrate/` because they COORDINATE the `memory/` subsystem +
// `persistence/` reads (the `assemble-gather.ts` seam rule — a verb may not import `memory/` directly):
//
//   • `backfillMemory` — the PD-41 memory-sweep piece: enumerate EVERY chat, run the segment build,
//     then the digest build per SCOPE BUCKET — mirroring the engine's post-turn enumeration EXACTLY
//     (engine.ts §3a: the `__group__<chatId>` shared bucket only when the cast is >1, then every cast
//     character's egocentric bucket). The per-chat builds are already idempotent/self-healing (hash-diff),
//     so the sweep is resumable by nature. The host's memory config is resolved per chat off the injected
//     `resolveMemoryConfig` (the SAME `AppSettings.memoryDefaults` ⊕ host D36 opt-out the live turn path
//     applies — one shared home at the composition root): a `mode:"off"` host's chat is SKIPPED ENTIRELY
//     (zero enumerate/mint/build — the engine's §3a gate parity), else the resolved config threads into the
//     segment + digest builds so the host's tuning (blockSize/verbatimWindow/…) is honored, not the baked
//     `resolveCfg(undefined)` floor.
//   • `backfillGroupCharacters` — mint the synthetic group character for every >1-character room that
//     lacks one (the shared memory bucket / narrator author — D38). Idempotent: `findSyntheticGroupCharacter`
//     short-circuits an existing mint. Owner = the room HOST (D18/D19 — the one authority + funding source).
//
// Cooperative abort (the `reconcileStats` precedent): the signal is checked BETWEEN chats/buckets — a
// partial sweep is safe (every unit is independently idempotent) and the next run resumes the rest.

import { buildCharacterNameMap, buildPersonaNameMap } from "@orb/contracts/chat";
import { chats } from "@orb/db";
import type { CharacterId, ChatId, UserId } from "@orb/kit/ids";
import type { RowMacroNameContext } from "@orb/kit/macro";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../contract/context";
import type {
  BackfillPassCounts,
  MemoryBackfillCounts,
  MemoryScope,
  ResolveBackfillMemoryConfig,
} from "../contract/memory";
import { generateDigests } from "../memory/build/digests";
import { generateSegments } from "../memory/build/segments";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import { loadRoster } from "../persistence/roster";
import { resolveGroupBucketCharacterId } from "./group-bucket";

/** Every chat id (the sweep universe — temporary chats included; they are live rooms until reaped). */
async function loadAllChatIds(ctx: ChatContext): Promise<ChatId[]> {
  const rows = await ctx.db.select({ id: chats.id }).from(chats);
  return rows.map((r) => r.id);
}

/** A chat's present cast + its HOST (the digest scope universe + the group-room predicate + the owner the
 *  shared synthetic bucket is minted under, D18/D19) + the macro NAME producer (F3/G1 — the summarizer
 *  transcript labels + BODY resolve by character AND persona name, D28, not the raw typeid/literal macro;
 *  built via the same member-gated producer the live turn path uses, keyed off THIS roster's seats). One
 *  roster read serves all three. */
async function loadCastAndHost(
  ctx: ChatContext,
  chatId: ChatId,
): Promise<{
  cast: CharacterId[];
  hostUserId: UserId | null;
  macroNames: RowMacroNameContext;
}> {
  const roster = await loadRoster(ctx.db, chatId);
  const cast = roster.flatMap((r) =>
    r.kind === "character" && r.characterId !== null ? [r.characterId] : [],
  );
  const hostUserId = roster.find((r) => r.role === "host" && r.userId !== null)?.userId ?? null;
  const producer = await loadChatMacroNameProducer(ctx.db, { participants: roster });
  const macroNames: RowMacroNameContext = {
    characterNamesById: buildCharacterNameMap(producer.characterNames),
    personaNamesById: buildPersonaNameMap(producer.personaNames),
  };
  return { cast, hostUserId, macroNames };
}

/** The digest scope buckets for one chat — MIRRORS the engine's post-turn enumeration (engine.ts §3a): the
 *  shared group bucket gated on CAST SIZE (no-op at a cast of 1 — byte-identity for solo), then every cast
 *  character's bucket. The shared bucket keys on the REAL minted synthetic-character row id (inv 8 —
 *  substrate/group-bucket), NEVER the fabricated `__group__` handle; a hostless group has no funding owner
 *  (D19) to mint under, so its shared bucket is skipped (per-character buckets still build). */
async function scopesFor(
  ctx: ChatContext,
  chatId: ChatId,
  cast: readonly CharacterId[],
  hostUserId: UserId | null,
): Promise<MemoryScope[]> {
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
 * The corpus-wide memory backfill (PD-41): segments then digests-per-scope for every chat, folding the
 * written counts. Each per-chat build is the SAME idempotent/self-healing front door the engine's post-turn
 * trigger uses — this sweep only ENUMERATES (chat × scope) and folds; the memory logic stays in `memory/`.
 */
export async function backfillMemory(
  ctx: ChatContext,
  args: { readonly signal: AbortSignal },
  resolveMemoryConfig: ResolveBackfillMemoryConfig,
): Promise<MemoryBackfillCounts> {
  const segments = { scanned: 0, changed: 0 };
  const digests = { scanned: 0, changed: 0 };
  for (const chatId of await loadAllChatIds(ctx)) {
    if (args.signal.aborted) {
      break; // cooperative abort between chats — every completed unit is durable + idempotent
    }
    try {
      // biome-ignore lint/performance/noAwaitInLoops: the sweep is sequential BY DESIGN (the engine's own §3a comment — the memory logic bounds its concurrency; parallel chats would race the summarizer + db).
      const { cast, hostUserId, macroNames } = await loadCastAndHost(ctx, chatId);
      // The host's effective memory tuning — the SAME merge the live turn path applies (D36 opt-out). A
      // hostless room has no owner to have opted out (and no funding owner, D19), so it sweeps on the floor.
      // Resolved INSIDE the per-chat try so a settings-read failure warns + continues (never kills the sweep).
      const config = hostUserId === null ? null : await resolveMemoryConfig(hostUserId);
      if (config?.mode === "off") {
        continue; // D36 opt-out: the host disabled memory — skip enumerate/mint/build entirely (engine §3a gate).
      }
      const seg = await generateSegments(ctx, { chatId, config, macroNames, signal: args.signal });
      segments.scanned += 1;
      segments.changed += seg.written;
      const scopes = await scopesFor(ctx, chatId, cast, hostUserId);
      for (const scope of scopes) {
        if (args.signal.aborted) {
          break;
        }
        // biome-ignore lint/performance/noAwaitInLoops: sequential by design (see the segment pass above).
        const d = await generateDigests(ctx, { scope, config, macroNames, signal: args.signal });
        digests.scanned += 1;
        digests.changed += d.written;
      }
    } catch (err) {
      // PER-CHAT ISOLATION: ONE bad chat (a mint failure, a summarizer outage, a corrupt row) must NOT kill
      // the corpus-wide PD-41 sweep — every unit is idempotent, so the poisoned chat self-heals on a later
      // run. Log it (visible, not swallowed) and keep sweeping the rest.
      getLog().warn({ err, chatId }, "memory backfill: chat skipped after error");
    }
  }
  return { segments, digests };
}

/**
 * The group-character backfill (PD-41/D38): every \>1-character room gets its synthetic group character
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
