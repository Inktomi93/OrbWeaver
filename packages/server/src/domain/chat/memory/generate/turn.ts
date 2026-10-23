// Post-turn memory policy runs outside the engine, bound once to chat's memory collaborators.
import type { ChatContext } from "../../contract/context.ts";
import type { BuildTurnMemoryArgs } from "../../contract/memory.ts";
import { classifyParticipant } from "../../persistence/participant.ts";
import { loadParticipants } from "../../persistence/participants-read.ts";
import { digestsDerivable } from "../../substrate/digests-derivable.ts";
import { resolveGroupBucketCharacterId } from "../../substrate/group-bucket.ts";
import { loadWitnessHorizons } from "../persistence/queries.ts";
import { generateDigests } from "./digests.ts";
import { generateSegments } from "./segments.ts";

/** The caller owns detached lifetime and failure reporting; builds preserve per-character witness horizons. */
export async function buildTurnMemory(ctx: ChatContext, args: BuildTurnMemoryArgs): Promise<void> {
  await generateSegments(ctx, {
    chatId: args.chatId,
    funderUserId: args.funderUserId,
    config: args.config,
    embedOwnerId: args.runAsUserId,
    signal: args.signal,
  });
  // No summarize connection: digests pause (the Utility-model row says so) rather than fail every turn.
  if (!(await digestsDerivable(ctx, args.funderUserId))) {
    return;
  }
  const participants = await loadParticipants(ctx.db, args.chatId);
  const chars = participants.flatMap((r) => {
    const actor = classifyParticipant(r);
    return actor?.kind === "character" ? [actor.characterId] : [];
  });

  // Group-as-character scope (only for groups): the single synthetic bucket, keyed by the real
  // minted synthetic-character row id, never the fabricated `__group__` handle string.
  if (chars.length > 1) {
    const groupCharacterId = await resolveGroupBucketCharacterId(ctx, {
      ownerId: args.runAsUserId,
      chatId: args.chatId,
    });
    await generateDigests(ctx, {
      scope: { chatId: args.chatId, scopedCharacterId: groupCharacterId, isGroup: true },
      funderUserId: args.funderUserId,
      config: args.config,
      embedOwnerId: args.runAsUserId,
      signal: args.signal,
    });
  }
  // Each seated character's SCOPED bucket is gated by its own join/leave horizons — a member digests
  // only the blocks it was present for (correct across kick→re-add). The shared group bucket above
  // stays horizon-free (the merged/narrator build; digests.ts §22-23). The synthetic group char has
  // no participant seat, so it would (correctly) never appear in `chars` here.
  await Promise.all(
    chars.map(async (charId) =>
      generateDigests(ctx, {
        scope: {
          chatId: args.chatId,
          scopedCharacterId: charId,
          isGroup: chars.length > 1,
        },
        funderUserId: args.funderUserId,
        config: args.config,
        embedOwnerId: args.runAsUserId,
        signal: args.signal,
        witnessing: await loadWitnessHorizons(ctx.db, args.chatId, charId),
      }),
    ),
  );
}
