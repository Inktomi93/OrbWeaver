// domain/chat/engine/round — the GROUP ROUND DRIVER. Maps an arbitration
// result (the ordered, name-resolved speakers) → a per-speaker `TurnPrep` carrying the two-axis SHAPE
// (output × cardScope × scopedTarget × name), off the ONE immutable assemble ctx built for the round, and
// executes each speaker through the chunk-9 engine. ONE ctx, N speakers shaped off it (§5 — each speaker is a
// `shape(ctx, speaker)`; the ctx is reused by reference, never mutated). Solo = a roster-of-1: ONE speaker,
// byte-identical, no `if(isGroup)` (D16).
//
// THE LOCK: a multi-speaker
// round acquires the per-chat lock **PER SPEAKER** (TTL sized for one turn) so a human send can interleave at
// a clean seq boundary. The chunk-9 `engine.runTurn` ALREADY locks per turn — so the driver simply LOOPS it
// (NO chunk-9 lifecycle refactor needed). A mid-round `locked` refusal = a concurrent human turn won the lock
// → the driver YIELDS the round (returns what committed so far; arbitration re-runs next trigger — §6
// "never DROP a concurrent trigger").
//
// CANON ADVANCES BETWEEN SPEAKERS: each `engine.runTurn` re-loads canon, so speaker k+1 witnesses speaker
// k's just-committed row (`shape` is pure; the canon advances, not the function).

import type { GroupConfig } from "@orb/contracts/chat";
import type { CharacterId } from "@orb/kit/ids";
import type { CastName } from "../contract/arbitration";
import { CHAT_OP_CODES, ChatOperationError } from "../contract/errors";
import type { TurnEngine, TurnOutcome, TurnPrep, TurnSpeakerShape } from "../contract/results";
import { committedOutcome } from "./result";

/** The shared per-round identity + the ONE immutable assemble ctx (every speaker's prep is built off this).
 *  Everything a `TurnPrep` carries EXCEPT the per-speaker axis the driver fills in. File-local. */
type RoundBase = Omit<TurnPrep, "speakerCharacterId" | "groupNudge" | "shape">;

/** The driver inputs (file-local — the verb/auto-mode passes a literal). */
interface DriveRoundParams {
  readonly engine: TurnEngine;
  /** The shared identity + the ONE immutable ctx (built ONCE for the round — §5). */
  readonly base: RoundBase;
  /** The resolved room behavior (`output` × `cardScope` × `groupNudge`). */
  readonly group: GroupConfig;
  /** The arbitration result, name-resolved + ordered (per-speaker). IGNORED for `narrator` (one cast turn). */
  readonly speakers: readonly CastName[];
  /** The synthetic group character that AUTHORS a narrator turn (a real id, never NULL — §10). REQUIRED when
   *  `group.output === "narrator"`; the verb mints it via `ctx.mintSyntheticGroupCharacter`. */
  readonly groupCharacterId: CharacterId | null;
  /** The joined present-cast name (`{{char}}`-as-cast — collapses to the single name at cast=1) for narrator. */
  readonly castName: string;
}

/** Build ONE speaker's two-axis prep off the shared round base. The `shape` axis SHAPEs
 *  the immutable ctx for THIS speaker; `groupNudge` fences a per-speaker turn only when \>1 speaker. */
function buildSpeakerPrep(
  base: RoundBase,
  group: GroupConfig,
  speaker: CastName,
  multi: boolean,
): TurnPrep {
  const isCharacter = speaker.ref.kind === "character";
  // The voiced slot's identity (doc 02 §2): a character stamps `characterId`; an agent stamps NOTHING here and
  // self-attributes via the persist arm below (`characterId` NULL, `authorUserId` = the agent).
  const speakerCharacterId = speaker.ref.kind === "character" ? speaker.ref.characterId : null;
  // `cardScope`/`scopedTarget` live only on the `per-speaker` arm (`narrator ⇒ merged`, schema-enforced). Only
  // a character has a card to scope to (an agent's identity is its soul — no roster card, doc 06 §5).
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
  // An agent speaker self-attributes (doc 02 §2/§3): a new-slot ASSISTANT row authored by the agent (host still
  // funds it via `runAsUserId` — D19). A character round leaves `persist` absent (the engine's new-slot default
  // stamps `characterId`, `authorUserId` NULL) → byte-identical.
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

/**
 * Drive ONE group round. Resolves the per-speaker list (the narrator collapses to a
 * single group-character turn voicing the cast; per-speaker runs the arbitration result in order), builds
 * each speaker's two-axis prep off the ONE immutable ctx, and runs each via the engine under its OWN per-turn
 * lock. Returns the committed messages across the round; a mid-round `locked` yields the round (partial
 * commit). Throws any non-lock turn error (the engine already emitted `turnAborted`).
 */
export async function driveRound(params: DriveRoundParams): Promise<TurnOutcome> {
  const speakers = roundSpeakers(params);
  const multi = speakers.length > 1;
  const committed: TurnOutcome["messages"][number][] = [];
  for (const speaker of speakers) {
    const prep = buildSpeakerPrep(params.base, params.group, speaker, multi);
    try {
      // SEQUENTIAL BY DESIGN: speaker k+1 must witness speaker k's committed row (canon
      // advances between speakers), and the per-chat lock is acquired PER SPEAKER — both forbid parallelism.
      // biome-ignore lint/performance/noAwaitInLoops: per-speaker sequencing is the invariant, not a perf miss.
      const outcome = await params.engine.runTurn(prep);
      committed.push(...outcome.messages);
    } catch (err) {
      if (isLockedRefusal(err)) {
        break; // a human send interleaved (§6) — yield the round with what committed so far.
      }
      throw err;
    }
  }
  return committedOutcome(committed);
}

/** The round's speaker list: a `narrator` round is ONE turn authored by the synthetic group character
 *  (`{{char}}` = the joined cast); a `per-speaker` round is the arbitration result, in order. The
 *  `output === "narrator"` switch is the documented two-axis discriminator (Part III §7), NOT an `if(isGroup)`
 *  branch (D16). */
function roundSpeakers(params: DriveRoundParams): readonly CastName[] {
  if (params.group.output === "narrator") {
    if (params.groupCharacterId === null) {
      // Born-compliant: narrator turns are authored by a REAL synthetic group-character id (§10). The verb
      // mints it before driving the round; a null here is a wiring bug, not a runtime fallback.
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
