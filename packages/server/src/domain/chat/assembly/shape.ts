// domain/chat/assembly/shape — THE SHAPE substrate (ASSEMBLE phase 4 + the 2B rolling-pair cache
// breakpoint). The per-runner, per-speaker transform that turns the
// assembled (canon history, injections, speaker, params) into the final WIRE history + the cache
// breakpoint offset.
//
// HOME (justified): the 8-slot template offers two homes for this — "the SHAPE half of engine/pipeline.ts,
// or an assembly/shape.ts if the directory-module rule prefers". This chunk chooses `assembly/shape.ts`:
//   1. Disjoint file sets — `engine/pipeline.ts` is the ENGINE chunk's slice (the runChatTurn dispatch +
//      turn loop). SHAPE must not collide with it; co-locating SHAPE in `engine/` would force two chunks
//      to write one file.
//   2. Cohesion — every SHAPE shaper (role-squash/names/speaker-stamp/history-budget/injections/trace)
//      already lives in `assembly/`; the SHAPE COMPOSITION belongs with the shapers it orchestrates
//      (the directory-module rule: assembly/ is the RESOLVE→GATHER→BUILD→SHAPE subsystem).
//   3. Legibility — neo crammed SHAPE + dispatch into one 1600-line `pipeline.ts`, the exact "the order
//      is invisible" failure already flagged. A named `shape.ts` makes the SHAPE order readable top
//      to bottom. The ENGINE's pipeline imports `shape` from here and only PLACES the cache tag.
//
// THE ORDER (read top to bottom): scope-to-speaker (egocentric) → splice in_chat by depth → name-stamp →
// squash same-role → group/continuation nudge → [fit-pass: applied by the engine post-shape via
// history-budget.ts; the breakpoint offset-from-end survives its front-drop]. Plus the §8 breakpoint. The
// name-stamp precedes the FINAL squash so a group round's per-character `Name:` prefix lands on each row
// BEFORE adjacent distinct-character rows merge (F2 — the merged block keeps every speaker's label); the
// reported `squashed` stage remains the pre-name squash (labels are per-row annotations, adjacency-neutral).

import type { ChatInjection, GroupConfig } from "@orb/contracts/chat";
import type { RoleHandling } from "@orb/contracts/connection";
import type { NamesBehavior } from "@orb/contracts/preset";
import type { CharacterId, MessageId } from "@orb/kit/ids";
import { spliceInChatInjections } from "./injections";
import { applyNamesBehavior } from "./names";
import { clampRoleHandling, squashSameRole } from "./role-squash";
import { hasMultipleCharacters } from "./speaker-stamp";

/** The wire-history role axis (derive-don't-respell the non-system subset; system is converted at splice). */
type WireRole = "user" | "assistant";

/** One loaded canon row SHAPE consumes (from `persistence/queries.loadCanonHistory`, already sanitized).
 *  `authorName` = the stored authoring name (persona on user rows, character on assistant rows);
 *  `characterId` = the authoring character (identity attribution — drives the distinct-speaker gate). */
interface CanonRow {
  role: WireRole;
  content: string;
  authorName?: string | null;
  characterId?: CharacterId | null;
  messageId?: MessageId | undefined;
}

/** A name-stamped wire row (the SHAPE output row). */
interface WireRow {
  role: WireRole;
  content: string;
  name?: string;
  messageId?: MessageId | undefined;
}

/** Derive the group axes from the canonical `GroupConfig` (no inline re-spell). `cardScope` lives only on
 *  the `per-speaker` arm (`narrator ⇒ merged`, made unrepresentable in the schema). */
type GroupOutput = GroupConfig["output"];
type CardScope = Extract<GroupConfig, { output: "per-speaker" }>["cardScope"];

/** The resolved per-turn inputs SHAPE consumes. The engine RESOLVE/GATHER/BUILD stages produce these;
 *  SHAPE is pure given them (`shape(turnCtx, speaker)` — immutable-ctx). */
interface ShapeInput {
  /** Loaded canon (empty when the `chat_history` pivot is disabled for the turn). */
  canon: readonly CanonRow[];
  /** The synthetic trailing user turn for the intent (regen prompt / draft+continue nudge), or null for a
   *  plain send (the verb-inserted user row is already the last canon element). */
  appendUserTurn: string | null;
  /** All positional injections for the turn (chat_injections ∪ WI converted at BUILD). */
  injections: readonly ChatInjection[] | undefined;
  output: GroupOutput;
  cardScope: CardScope;
  /** The per-speaker scoped target (egocentric fold); null for merged / narrator / solo. */
  scopedTargetId: CharacterId | null;
  namesBehavior: NamesBehavior;
  speakers: { user: string; assistant: string };
  /** The Step-6b group nudge (`[Write the next reply only as X.]`), set only on a multi-speaker round. */
  groupNudge: string | null;
  /** Macro resolver applied to injection content before framing (identity default for tests/hand-callers). */
  resolveContent?: (content: string) => string;
  /** D66 (W5) — the resolved `turns.assistantPrefill`: the model/wire accepts a DELIVERED trailing
   *  assistant message as response prefill. `true` ⇒ SHAPE delivers a trailing-assistant history verbatim
   *  (no `CONTINUATION_NUDGE`) and the splice keeps an assistant\@depth-0 injection at depth 0. `false`
   *  (default — the conservative floor) ⇒ normalize at delivery: nudge a trailing-assistant to a user tail,
   *  floor assistant\@0 to depth 1 (a `false`-model 400s on a trailing assistant). */
  assistantPrefill?: boolean;
  /** D66-C (W6) — the resolved USER role-handling knob (`RouteChatAssignment.roleHandling`, carried through
   *  `ResolvedConnection`). Clamped at SHAPE against {@link roleHandlingFloor} (`max(floor, knob)`). Unset ⇒
   *  falls to the floor. */
  roleHandling?: RoleHandling | undefined;
  /** D66-C (W6) — the MODEL/wire adjacent-same-role FLOOR (`capability.turns.roleHandlingFloor`). Unset ⇒
   *  `strict` (TURNS_FLOOR — the conservative today-behavior). SHAPE runs the stricter of floor + knob. */
  roleHandlingFloor?: RoleHandling | undefined;
}

interface ShapeOutput {
  /** The final delivered wire history (post-nudge). The engine applies the fit-pass after this. */
  history: WireRow[];
  /** §8: offset-from-end of the last STABLE message for the runner to pin `cache_control` on, or
   *  undefined (no safe breakpoint this round). */
  cacheBreakpointFromEnd: number | undefined;
  /** The per-stage snapshots — the host/admin trace surface AND the differential-oracle diff surface. */
  stages: {
    multiCharacter: boolean;
    withTail: CanonRow[];
    injected: (CanonRow | { role: WireRole; content: string })[];
    squashed: (CanonRow | { role: WireRole; content: string })[];
    named: WireRow[];
  };
}

// Minimal neutral trailing-user cue for a turn with NO real user input and NO group nudge (a force/auto
// round, or an empty-canon opening). Satisfies the hard invariant that the delivered history ends on a
// user turn (the Messages API treats a trailing assistant turn as response PREFILL — Anthropic rejects
// it when thinking is on). Carries no steering (the speaker is already pinned by the card + stops).
const CONTINUATION_NUDGE = "[Continue the conversation.]";

/** Egocentric history for `cardScope: "scoped"` (ST `scopeIndividualGroupMessagesForTarget`): fold every
 *  OTHER character's assistant row to a user-role line, attributed inline (`Name: …`), so the target reads
 *  castmates' turns as someone else's speech — keeping only ITS own past lines as `assistant`. Dropping
 *  the folded rows' `characterId` collapses the cast to one (the target) → `hasMultipleCharacters` is
 *  false → the name-stamp leaves the now-author-less rows alone. User rows + the target's own rows pass
 *  through untouched. */
function scopeHistoryToTarget(canon: readonly CanonRow[], targetId: CharacterId): CanonRow[] {
  return canon.map((m): CanonRow => {
    if (
      m.role === "assistant" &&
      m.characterId !== null &&
      m.characterId !== undefined &&
      m.characterId !== targetId
    ) {
      const name = m.authorName ?? "";
      return {
        role: "user",
        content: name.length > 0 ? `${name}: ${m.content}` : m.content,
        messageId: m.messageId,
      };
    }
    return m;
  });
}

// ── §8: the 2B rolling-tail cache breakpoint ──────────────────────────────────────────────────────────
// Offset-from-end of the last STABLE history message (the prior tip) for the runner to pin an Anthropic
// `cache_control` on, so the conversation PREFIX caches turn-over-turn (not just the system block). SHAPE
// computes the ONE safe offset (+ the conservative aborts the runner can't see); the runner PLACES the
// rolling PAIR from it — `cache_control` at `depth` AND `depth+2` (the kit-hoisted
// `computeCacheBreakpointOffsets`, R1). The pair keeps a cache hit inside Anthropic's 20-block lookback
// window that a single breakpoint drops on a long conversation; both sit on already-cached stable content,
// so the deeper read is FREE. (A single-breakpoint placement was the pre-W3 regression this offset feeds.)
//
// INVARIANT (holds for every intent — see the engine's planOrHistory): the volatile tail is ALWAYS
// exactly the LAST element of `withTail`; and (post ABORT #1) every surviving in_chat injection splices
// at/after that boundary (depth 0/1), never INSIDE the stable prefix. So the last stable message is the
// TAIL of the squashed stable prefix (`withTail[0..stableCount-1]`), and the offset counts from the
// SQUASHED prefix length — NOT the raw `stableCount`. The old `finalLen - stableCount` assumed the prefix
// never merges internally ("alternating canon"), which is FALSE for GROUP canon: two back-to-back
// single-speaker rounds (`…assistant(Aria), assistant(Kai)…`) are adjacent same-role rows that squash
// INSIDE the prefix, shrinking it. A boundary/tail injection then masks the collapse (adds a row the raw
// subtraction happens to cancel against) and the tag lands on the per-turn injection instead of the last
// real message → the rolling-pair cache silently stops hitting (F5). Counting from the squashed prefix
// length pins the true last-stable message.
/** @internal — exported for the off-by-one unit test, which drives the REAL splice + squash to build the
 *  inputs. `scopedFold` = an egocentric scoped round is in effect (its merged rows are DERIVED per-turn —
 *  and the target even changes within one group round — so a collapsed scoped prefix has no stable
 *  breakpoint; the group-canon merge, being committed messages, does). */
export function computeHistoryBreakpoint(
  withTail: readonly { role: WireRole; content: string }[],
  injected: readonly { role: WireRole; content: string }[],
  finalHistory: readonly { role: WireRole; content: string }[],
  opts: {
    readonly injections: readonly { position: string; depth: number }[] | undefined;
    readonly scopedFold?: boolean;
    /** W6: the effective strategy merges adjacent same-role rows (`false` ⇒ `none` — no merge, so the
     *  squashed prefix length is a pure pass-through and ABORT #2 is moot). Default `true` (today-behavior). */
    readonly merges?: boolean;
  },
): number | undefined {
  const { injections, scopedFold = false, merges = true } = opts;
  const stableCount = withTail.length - 1; // everything but the volatile last turn
  if (stableCount < 1) {
    return; // no stable prefix (first turn / history disabled)
  }
  // ABORT #1: a depth ≥ 2 in_chat injection splices INSIDE the stable prefix (insertAt = len - depth ≤
  // len-2), mutating bytes the cache would otherwise reuse → no safe breakpoint this round.
  if ((injections ?? []).some((i) => i.position === "in_chat" && i.depth >= 2)) {
    return;
  }
  // ABORT #2: boundary squash-merge — if the last stable message shares a role with the message
  // immediately after it (a depth-1 injection, or the volatile turn), a MERGING strategy would fold them
  // and the boundary's bytes change → skip (W6's re-frame keeps the DELIVERED prefix stable, but this turn
  // still has no safe breakpoint on the mutated boundary — the conservative abort holds). Under `none` (no
  // merge) there is no fold, so ABORT #2 is moot.
  const boundary = injected[stableCount - 1];
  const next = injected[stableCount];
  if (merges && boundary !== undefined && next !== undefined && boundary.role === next.role) {
    return;
  }
  // The last stable message is the TAIL of the SQUASHED stable prefix (group canon collapses adjacent
  // same-role rounds inside it — see the header). Count the offset from that length, not `stableCount`.
  // Under `none` this is a pass-through (no internal merge) → squashedPrefixLen === stableCount.
  const squashedPrefixLen = merges
    ? squashSameRole(withTail.slice(0, stableCount)).length
    : withTail.slice(0, stableCount).filter((r) => r.content.trim().length > 0).length;
  // FLAG[neo-quirk]: the egocentric scoped fold DERIVES its merged rows per-turn (target-dependent), so a
  // collapsed scoped prefix has no stable breakpoint — return `undefined` (neo returned a degenerate -1 it
  // then silently discarded; Part III §12 inv 7). Group canon's merges are committed messages → stable.
  if (scopedFold && squashedPrefixLen < stableCount) {
    return;
  }
  // A valid breakpoint must point at a real stable message BEFORE the volatile tail → offset ≥ 1.
  const offsetFromEnd = finalHistory.length - squashedPrefixLen;
  if (offsetFromEnd < 1) {
    return;
  }
  return offsetFromEnd;
}

/**
 * The SHAPE transform. Pure given its input. Returns the final wire history, the §8 cache
 * breakpoint offset, and the per-stage snapshots (host/admin trace + the differential oracle).
 *
 * `no-if(isGroup)`: every group behavior is DATA-driven (roster size via `hasMultipleCharacters`, the
 * scoped fold gated on a resolved target, the nudge set only on a multi-speaker round) — a solo
 * roster-of-1 chat takes none of them and ships a byte-identical history (Part III §12 inv 1).
 */
export function shape(input: ShapeInput): ShapeOutput {
  const resolveContent = input.resolveContent ?? ((c: string): string => c);

  // 1. scope-to-speaker (egocentric) — gated on a per-speaker scoped round with a resolved target.
  const scopedCanon =
    input.output === "per-speaker" && input.cardScope === "scoped" && input.scopedTargetId !== null
      ? scopeHistoryToTarget(input.canon, input.scopedTargetId)
      : input.canon;

  // The distinct-speaker gate (drives the name-stamp; false for solo/scoped-collapsed → byte-identical).
  const multiCharacter = hasMultipleCharacters(scopedCanon);

  // The volatile tail (always the LAST element — the §8 invariant): the verb-inserted user row (send) or
  // the appended synthetic user turn (regen/draft/continue).
  const withTail: CanonRow[] =
    input.appendUserTurn !== null
      ? [...scopedCanon, { role: "user", content: input.appendUserTurn }]
      : [...scopedCanon];

  // The EFFECTIVE role-handling strategy (W6): the stricter of the model floor + the user knob, clamped
  // HERE at SHAPE (ruling 2 — the clamp lives where the merge physically happens). `none` skips merging
  // entirely (injected notes stay standalone rows); every other strategy runs the boundary-aware squash.
  const strategy = clampRoleHandling(input.roleHandlingFloor, input.roleHandling);
  const merges = strategy !== "none";

  // The stable/volatile boundary for the prefix-stable re-frame (W6 §6b): rows `[0, prefixBoundaryLen)` in
  // `withTail` are the committed cached prefix (everything but the volatile tail). Only meaningful when
  // there's a stable prefix AND no depth≥2 injection already mutates it (ABORT #1). Undefined ⇒ no re-frame
  // (no prefix to protect / prefill delivers a bare tail).
  const stableCount = withTail.length - 1;
  const prefixDisrupted = (input.injections ?? []).some(
    (i) => i.position === "in_chat" && i.depth >= 2,
  );
  const prefixBoundaryLen = stableCount >= 1 && !prefixDisrupted ? stableCount : undefined;

  // The selected strategy runner: `none` passes rows through un-merged (only empties dropped); the merge
  // strategies run `squashSameRole`. The prefix-stable protection lives at the SPLICE (a volatile injection
  // is re-framed BEFORE it can fold into the cached prefix, part 01 §6b), so squash stays the pure merge.
  const runSquash = <T extends { role: WireRole; content: string; name?: string }>(
    rows: readonly T[],
  ): T[] => (merges ? squashSameRole(rows) : rows.filter((r) => r.content.trim().length > 0));

  // 2. splice in_chat by depth → 3. name-stamp → 4. squash same-role.
  // F2: the per-character `Name:` prefix is stamped BEFORE the FINAL squash, so adjacent distinct-character
  // rows (a per-speaker group round / the greet-all opening) keep EACH speaker's label inside the merged
  // block (`"Aria: …\n\nKai: …"`) instead of collapsing under the first author's name. squash is
  // author-aware (completion `name` fields survive — role-squash.ts). The reported `squashed` stage stays
  // the PRE-name squash: the trusted `Name:` prefix + the OpenAI `name` field are pure per-row annotations
  // that never change the role-adjacency the §8 breakpoint math + the content-free trace reason about (so
  // the stage/oracle contract is unchanged), while `named` is the FINAL name-stamped-then-squashed prefix.
  // W5: `assistantPrefill:true` keeps an assistant@depth-0 injection at depth 0 (the trailing-assistant
  // prefill the model honors); `false` floors it to depth 1. W6: `prefixBoundaryLen` re-frames a depth-1
  // assistant injection that would fold into the cached prefix.
  const injected = spliceInChatInjections(withTail, input.injections, resolveContent, {
    allowAssistantPrefill: input.assistantPrefill === true,
    prefixBoundaryLen,
  });
  const squashed = runSquash(injected);
  const named = runSquash(
    applyNamesBehavior(injected, input.namesBehavior, input.speakers, multiCharacter),
  );

  // 5. group/continuation nudge: a multi-speaker round's `[Write the next reply only as X.]` rides as a
  // trailing user message (squashed into the tail); a force/auto/empty-opening round that would otherwise
  // end on an assistant turn gets the neutral CONTINUATION_NUDGE. Either is a SECOND volatile tail → the
  // §8 breakpoint aborts for the round. W5: on a `assistantPrefill:true` model a trailing-assistant history
  // is DELIVERED verbatim (no nudge) — the model continues from the prefill; the group nudge still applies.
  const nudge = input.groupNudge;
  const endsOnAssistant = named.length === 0 || named.at(-1)?.role === "assistant";
  const needsContinuation = endsOnAssistant && input.assistantPrefill !== true;
  const tailUser = nudge ?? (needsContinuation ? CONTINUATION_NUDGE : null);
  const history =
    tailUser !== null ? runSquash([...named, { role: "user", content: tailUser }]) : named;

  // §8: the breakpoint is computed on the NUDGE-FREE stages (an appended tail is a second volatile tail
  // → abort). Offset-from-end survives the engine's downstream fit-pass front-drop.
  const cacheBreakpointFromEnd =
    tailUser !== null
      ? undefined
      : computeHistoryBreakpoint(withTail, injected, named, {
          injections: input.injections,
          scopedFold:
            input.output === "per-speaker" &&
            input.cardScope === "scoped" &&
            input.scopedTargetId !== null,
          merges,
        });

  return {
    history,
    cacheBreakpointFromEnd,
    stages: { multiCharacter, withTail, injected, squashed, named },
  };
}
