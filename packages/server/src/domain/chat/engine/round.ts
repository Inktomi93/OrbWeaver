// domain/chat/engine/round — the group round driver. Maps an arbitration result (the ordered, name-resolved
// speakers) → a per-speaker TurnPrep carrying the two-axis shape (output × cardScope × scopedTarget × name),
// off the one immutable assemble ctx built for the round, and executes each speaker through the engine.
// Solo = a roster-of-1: one speaker, byte-identical, no if(isGroup) (D16).
//
// THE LOCK: a multi-speaker round acquires the per-chat lock per speaker so a human send can interleave at a
// clean seq boundary. engine.runTurn already locks per turn — the driver just loops it. A mid-round `locked`
// refusal (a concurrent human turn won the lock) yields the round — returns what committed so far.

import type { GroupConfig } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import type { CastName } from "../contract/arbitration";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors";
import type { TurnEngine, TurnOutcome, TurnPrep, TurnSpeakerShape } from "../contract/results";
import { committedOutcome } from "./result";

/** Everything a `TurnPrep` carries except the per-speaker axis the driver fills in. */
type RoundBase = Omit<TurnPrep, "speakerCharacterId" | "groupNudge" | "shape">;

interface DriveRoundParams {
  readonly engine: TurnEngine;
  readonly base: RoundBase;
  readonly group: GroupConfig;
  /** The arbitration result, name-resolved + ordered. Ignored for `narrator` (one cast turn). */
  readonly speakers: readonly CastName[];
  /** The synthetic group character that authors a narrator turn (a real id, never null). Required when
   *  `group.output === "narrator"`; the verb mints it via `ctx.mintSyntheticGroupCharacter`. */
  readonly groupCharacterId: CharacterId | null;
  /** The joined present-cast name (`{{char}}`-as-cast — collapses to the single name at cast=1) for narrator. */
  readonly castName: string;
}

/** Build ONE speaker's two-axis prep off the shared round base. */
function buildSpeakerPrep(
  base: RoundBase,
  group: GroupConfig,
  speaker: CastName,
  multi: boolean,
): TurnPrep {
  const isCharacter = speaker.ref.kind === "character";
  const speakerCharacterId = speaker.ref.kind === "character" ? speaker.ref.characterId : null;
  // Only a character has a card to scope to (an agent's identity is its soul — no roster card).
  const cardScope = group.output === "per-speaker" ? group.cardScope : "merged";
  const scopedTargetId =
    group.output === "per-speaker" &&
    group.cardScope === "scoped" &&
    speaker.ref.kind === "character"
      ? speaker.ref.characterId
      : null;
  const shape: TurnSpeakerShape = {
    output: group.output,
    cardScope,
    scopedTargetId,
    speakerName: speaker.name,
    speakerRef: speaker.ref,
  };
  const groupNudge =
    group.groupNudge && multi ? `[Write the next reply only as ${speaker.name}.]` : null;
  // An agent speaker self-attributes: a new-slot assistant row authored by the agent. A character round
  // leaves `persist` absent (the engine's new-slot default stamps characterId, authorUserId null).
  return {
    ...base,
    speakerCharacterId,
    groupNudge,
    shape,
    ...(isCharacter
      ? {}
      : {
          persist: {
            mode: "new-slot",
            role: "assistant",
            authorUserId: speaker.ref.userId,
          },
        }),
  };
}

/** A per-chat lock refusal (`engine.runTurn` threw `locked`) — a concurrent turn holds the lock. */
function isLockedRefusal(err: unknown): boolean {
  return err instanceof ChatOperationError && err.code === CHAT_OP_CODES.locked;
}

/** Drive ONE group round; a mid-round `locked` yields the round (returns what committed so far). */
export async function driveRound(params: DriveRoundParams): Promise<TurnOutcome> {
  const speakers = roundSpeakers(params);
  const multi = speakers.length > 1;
  const committed: TurnOutcome["messages"][number][] = [];
  for (const speaker of speakers) {
    const prep = buildSpeakerPrep(params.base, params.group, speaker, multi);
    try {
      // biome-ignore lint/performance/noAwaitInLoops: per-speaker sequencing is the invariant, not a perf miss.
      const outcome = await params.engine.runTurn(prep);
      committed.push(...outcome.messages);
    } catch (err) {
      if (isLockedRefusal(err)) {
        break; // a human send interleaved — yield the round with what committed so far.
      }
      throw err;
    }
  }
  return committedOutcome(committed);
}

/** The round's speaker list: `narrator` is ONE turn authored by the synthetic group character; `per-speaker`
 *  is the arbitration result, in order. */
function roundSpeakers(params: DriveRoundParams): readonly CastName[] {
  if (params.group.output === "narrator") {
    if (params.groupCharacterId === null) {
      // A null here is a wiring bug: the verb mints the synthetic group-character id before driving the round.
      throw new Error("narrator round requires a synthetic group-character id (§10)");
    }
    return [
      {
        ref: { kind: "character", characterId: params.groupCharacterId },
        name: params.castName,
      },
    ];
  }
  return params.speakers;
}
