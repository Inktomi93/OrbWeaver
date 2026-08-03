// domain/chat/engine/round — the group round driver. Maps an arbitration result (the ordered, name-resolved
// speakers) → a per-speaker TurnPrep carrying the two-axis shape (output × cardScope × scopedTarget × name),
// off the one immutable assemble ctx built for the round, and executes each speaker through the engine.
// Solo = a roster-of-1: one speaker, byte-identical, no if(isGroup) (D16).
//
// THE LOCK: a multi-speaker round acquires the per-chat lock per speaker so a human send can interleave at a
// clean seq boundary. engine.runTurn already locks per turn — the driver just loops it. A mid-round `locked`
// refusal (a concurrent human turn won the lock) yields the round — returns what committed so far.

import type { GroupConfig } from "@orb/contracts/chat";
import { resolveProseText } from "@orb/contracts/prose";
import type { CharacterId } from "@orb/kit/ids";
import type { CastName } from "../contract/arbitration.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors.ts";
import type { TurnEngine, TurnOutcome, TurnPrep, TurnSpeakerShape } from "../contract/results.ts";
import { committedOutcome } from "./result.ts";

/** Everything a `TurnPrep` carries except the per-speaker axis the driver fills in. */
type RoundBase = Omit<TurnPrep, "speakerCharacterId" | "groupNudge" | "shape">;

interface DriveRoundParams {
  /** The round driver only ever RUNS turns — it never drafts (the non-persisting `generateText` is a
   *  verb-level composer-fill path, not part of a persisted round), so it depends on the `runTurn` slice only. */
  readonly engine: Pick<TurnEngine, "runTurn">;
  readonly base: RoundBase;
  readonly group: GroupConfig;
  /** The arbitration result, name-resolved + ordered. Ignored for `narrator` (one cast turn). */
  readonly speakers: readonly CastName[];
  /** The synthetic group character that authors a narrator turn (a real id, never null). Required when
   *  `group.output === "narrator"`; the verb mints it via `ctx.mintSyntheticGroupCharacter`. */
  readonly groupCharacterId: CharacterId | null;
  /** The joined present-cast name (`{{char}}`-as-cast — collapses to the single name at cast=1) for narrator. */
  readonly castName: string;
  /** The present, NON-MUTED character names a narrator turn voices — the nudge's `{{names}}` and the
   *  cast-of-one guard. Empty/≤1 ⇒ a narrator round sends no nudge at all (byte-identical single turn). */
  readonly narratorMemberNames: readonly string[];
}

/** The NARRATOR round's trailing nudge — two INDEPENDENT host toggles, joined by a space:
 *  (a) `groupNudge` names the cast this one generation is voicing; (b) `speakerTags` asks for the
 *  `<speaker>NAME</speaker>` markers the client narrator renderer colors by. Both fire only on a
 *  MULTI-member round — a cast-of-one narrator turn is a solo turn and stays byte-identical. Both off
 *  (or cast ≤ 1) ⇒ null, and SHAPE falls through to its own continuation tail exactly as before. */
function buildNarratorNudge(base: RoundBase, group: GroupConfig, memberNames: readonly string[]): string | null {
  if (memberNames.length <= 1) {
    return null;
  }
  const prose = base.assembleContext.prose ?? {};
  const parts: string[] = [];
  if (group.groupNudge) {
    parts.push(resolveProseText("chat.group.narratorNudge", prose, { names: memberNames.join(", ") }));
  }
  if (group.speakerTags) {
    parts.push(resolveProseText("chat.group.speakerTags", prose));
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

/** The round-level facts one speaker's prep needs beyond its own `CastName`. */
interface RoundShape {
  /** True when the round has MORE THAN ONE speaker — the per-speaker fence's gate. */
  readonly multi: boolean;
  /** The present non-muted names a NARRATOR round voices (see {@link DriveRoundParams}). */
  readonly narratorMemberNames: readonly string[];
}

/** The round's trailing nudge for ONE speaker: the narrator arm, the multi-speaker per-speaker fence, or
 *  none. Split out of {@link buildSpeakerPrep} so neither arm nests inside the other's ternary. */
function buildRoundNudge(base: RoundBase, group: GroupConfig, speaker: CastName, round: RoundShape): string | null {
  if (group.output === "narrator") {
    return buildNarratorNudge(base, group, round.narratorMemberNames);
  }
  if (!(group.groupNudge && round.multi)) {
    return null;
  }
  return resolveProseText("chat.group.roundNudge", base.assembleContext.prose ?? {}, { name: speaker.name });
}

/** Build ONE speaker's two-axis prep off the shared round base. */
function buildSpeakerPrep(base: RoundBase, group: GroupConfig, speaker: CastName, round: RoundShape): TurnPrep {
  const speakerCharacterId = speaker.ref.characterId;
  const cardScope = group.output === "per-speaker" ? group.cardScope : "merged";
  const scopedTargetId = group.output === "per-speaker" && group.cardScope === "scoped" ? speaker.ref.characterId : null;
  const shape: TurnSpeakerShape = {
    output: group.output,
    cardScope,
    scopedTargetId,
    speakerName: speaker.name,
    speakerRef: speaker.ref,
  };
  // The per-speaker fence is a PROSE-1 slot (`chat.group.roundNudge`, per-USER under the room host) with the
  // speaker's name as its `{{name}}` pre-substitution token; the host prose rode onto the round's one
  // immutable assemble ctx at build. Unset ⇒ the shipped line, byte-identical. NARRATOR takes the other
  // arm: its round is ONE speaker by construction (so `multi` is always false), and the fence it needs is
  // the opposite one — voice the WHOLE cast, tagged per speaker.
  const groupNudge = buildRoundNudge(base, group, speaker, round);
  return {
    ...base,
    speakerCharacterId,
    groupNudge,
    shape,
  };
}

/** A per-chat lock refusal (`engine.runTurn` threw `locked`) — a concurrent turn holds the lock. */
function isLockedRefusal(err: unknown): boolean {
  return err instanceof ChatOperationError && err.code === CHAT_OP_CODES.locked;
}

/** Drive ONE group round; a mid-round `locked` yields the round (returns what committed so far). An engine
 *  turn that ABORTS mid-round (caller cancel / lock-stale — the return-based `abortedOutcome`) stops the loop
 *  and yields an ABORTED outcome that STILL carries the speakers who committed before the abort — the caller
 *  gets the whole truth (which rows landed) plus `aborted:true` + the reason, never a silent committed-looking
 *  partial round. */
export async function driveRound(params: DriveRoundParams): Promise<TurnOutcome> {
  const speakers = roundSpeakers(params);
  const multi = speakers.length > 1;
  const committed: TurnOutcome["messages"][number][] = [];
  for (const speaker of speakers) {
    const prep = buildSpeakerPrep(params.base, params.group, speaker, { multi, narratorMemberNames: params.narratorMemberNames });
    try {
      // biome-ignore lint/performance/noAwaitInLoops: per-speaker sequencing is the invariant, not a perf miss.
      const outcome = await params.engine.runTurn(prep);
      committed.push(...outcome.messages);
      if (outcome.aborted && outcome.abortReason !== undefined) {
        return { messages: committed, aborted: true, abortReason: outcome.abortReason };
      }
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
