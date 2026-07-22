// domain/chat/assembly/shape — the SHAPE substrate: the per-runner, per-speaker transform turning
// (canon history, injections, speaker, params) into the final WIRE history + the cache breakpoint offset.
// Order: scope-to-speaker → splice in_chat by depth → name-stamp → squash same-role → continuation nudge.
// Name-stamp runs before the final squash so adjacent distinct-character rows keep every speaker's label.

import type { AssembleContext, ChatInjection, GroupConfig, MessageView } from "@orb/contracts/chat";
import type { RoleHandling } from "@orb/contracts/connection";
import type { NamesBehavior } from "@orb/contracts/preset";
import type { CharacterId, MessageId, PersonaId } from "@orb/kit/ids";
import type { HistoryMacroNames } from "../contract/results";
import { spliceInChatInjections } from "./injections";
import { renderHistoryMacros } from "./macros";
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

type GroupOutput = GroupConfig["output"];
type CardScope = Extract<GroupConfig, { output: "per-speaker" }>["cardScope"];

/** The resolved per-turn inputs SHAPE consumes; pure given them. */
interface ShapeInput {
  canon: readonly CanonRow[];
  /** The synthetic trailing user turn for the intent (regen/draft+continue), or null for a plain send. */
  appendUserTurn: string | null;
  injections: readonly ChatInjection[] | undefined;
  output: GroupOutput;
  cardScope: CardScope;
  /** The per-speaker scoped target (egocentric fold); null for merged / narrator / solo. */
  scopedTargetId: CharacterId | null;
  namesBehavior: NamesBehavior;
  speakers: { user: string; assistant: string };
  /** The group nudge (`[Write the next reply only as X.]`), set only on a multi-speaker round. */
  groupNudge: string | null;
  resolveContent?: (content: string) => string;
  /** Model accepts a delivered trailing-assistant message as response prefill: `true` ⇒ deliver verbatim
   *  (no continuation nudge); `false` (default) ⇒ nudge a trailing-assistant to a user tail. */
  assistantPrefill?: boolean;
  /** The user role-handling knob (from preset `params.advanced.roleHandling`); clamped against the floor. */
  roleHandling?: RoleHandling | undefined;
  /** The model/wire adjacent-same-role floor. Unset ⇒ `strict`. SHAPE runs the stricter of floor + knob. */
  roleHandlingFloor?: RoleHandling | undefined;
  /** The user `squashSystemMessages` knob (from preset `params.advanced.squashSystemMessages`): `true` ⇒
   *  merge consecutive system-note runs before they convert to user rows. Orthogonal to `roleHandling`. */
  squashSystemMessages?: boolean | undefined;
}

interface ShapeOutput {
  /** The final delivered wire history (post-nudge, pre engine fit-pass). */
  history: WireRow[];
  /** Offset-from-end of the last stable message for the runner to pin `cache_control` on, or undefined. */
  cacheBreakpointFromEnd: number | undefined;
  /** Per-stage snapshots — the host/admin trace + differential-oracle diff surface. */
  stages: {
    multiCharacter: boolean;
    withTail: CanonRow[];
    injected: (CanonRow | { role: WireRole; content: string })[];
    squashed: (CanonRow | { role: WireRole; content: string })[];
    named: WireRow[];
  };
}

// Trailing-user cue for a turn with no real user input and no group nudge — the delivered history must
// end on a user turn (a trailing assistant turn is response prefill; rejected when thinking is on).
const CONTINUATION_NUDGE = "[Continue the conversation.]";

/** Egocentric history for `cardScope: "scoped"`: fold every other character's assistant row to a
 *  user-role line attributed inline (`Name: …`), keeping only the target's own past lines as `assistant`. */
function scopeHistoryToTarget(canon: readonly CanonRow[], targetId: CharacterId): CanonRow[] {
  return canon.map((m): CanonRow => {
    if (m.role === "assistant" && m.characterId !== null && m.characterId !== undefined && m.characterId !== targetId) {
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

// Offset-from-end of the last stable history message for the runner to pin `cache_control` on (the runner
// places a rolling pair from it). Must count from the SQUASHED prefix length, not raw stableCount — group
// canon can merge adjacent same-role rows inside the prefix, shrinking it.
/** @internal — exported for the off-by-one unit test. `scopedFold`: an egocentric scoped round's merged
 *  rows are derived per-turn (target can change mid-round) so a collapsed scoped prefix has no stable
 *  breakpoint; group-canon merges are committed messages, so they do. */
export function computeHistoryBreakpoint(
  withTail: readonly { role: WireRole; content: string }[],
  injected: readonly { role: WireRole; content: string }[],
  finalHistory: readonly { role: WireRole; content: string }[],
  opts: {
    readonly injections: readonly { position: string; depth: number }[] | undefined;
    readonly scopedFold?: boolean;
    /** Whether the effective strategy merges adjacent same-role rows (`false` ⇒ pass-through). */
    readonly merges?: boolean;
  },
): number | undefined {
  const { injections, scopedFold = false, merges = true } = opts;
  const stableCount = withTail.length - 1;
  if (stableCount < 1) {
    return;
  }
  // A depth ≥ 2 in_chat injection splices INSIDE the stable prefix, mutating cached bytes → abort.
  if ((injections ?? []).some((i) => i.position === "in_chat" && i.depth >= 2)) {
    return;
  }
  // If the last stable message shares a role with the one right after it, a merge would fold the
  // boundary and change its bytes → abort (moot under `none`, which never merges).
  const boundary = injected[stableCount - 1];
  const next = injected[stableCount];
  if (merges && boundary !== undefined && next !== undefined && boundary.role === next.role) {
    return;
  }
  // The last stable message is the tail of the SQUASHED stable prefix — group canon can merge adjacent
  // same-role rounds inside it, so count from the squashed length, not raw stableCount.
  const squashedPrefixLen = merges
    ? squashSameRole(withTail.slice(0, stableCount)).length
    : withTail.slice(0, stableCount).filter((r) => r.content.trim().length > 0).length;
  // An egocentric scoped fold derives its merged rows per-turn (target can change mid-round), so a
  // collapsed scoped prefix has no stable breakpoint; group-canon merges are committed, so they do.
  if (scopedFold && squashedPrefixLen < stableCount) {
    return;
  }
  const offsetFromEnd = finalHistory.length - squashedPrefixLen;
  if (offsetFromEnd < 1) {
    return;
  }
  return offsetFromEnd;
}

/** The SHAPE transform. Pure given its input. Group behaviors are all data-driven (roster size,
 *  resolved scoped target, multi-speaker nudge) so a solo roster-of-1 chat ships an unmodified history. */
export function shape(input: ShapeInput): ShapeOutput {
  const resolveContent = input.resolveContent ?? ((c: string): string => c);

  // 1. scope-to-speaker (egocentric) — gated on a per-speaker scoped round with a resolved target.
  const scopedCanon =
    input.output === "per-speaker" && input.cardScope === "scoped" && input.scopedTargetId !== null
      ? scopeHistoryToTarget(input.canon, input.scopedTargetId)
      : input.canon;

  const multiCharacter = hasMultipleCharacters(scopedCanon);

  // The volatile tail is always the last element: the verb-inserted user row (send), or the appended
  // synthetic user turn (regen/draft/continue).
  const withTail: CanonRow[] = input.appendUserTurn !== null ? [...scopedCanon, { role: "user", content: input.appendUserTurn }] : [...scopedCanon];

  // Effective role-handling strategy: the stricter of the model floor + the user knob, clamped here
  // (where the merge physically happens). `none` skips merging; every other strategy squashes.
  const strategy = clampRoleHandling(input.roleHandlingFloor, input.roleHandling);
  const merges = strategy !== "none";

  // Rows [0, prefixBoundaryLen) in withTail are the committed cached prefix. Undefined when there's no
  // stable prefix, or a depth≥2 injection already mutates it.
  const stableCount = withTail.length - 1;
  const prefixDisrupted = (input.injections ?? []).some((i) => i.position === "in_chat" && i.depth >= 2);
  const prefixBoundaryLen = stableCount >= 1 && !prefixDisrupted ? stableCount : undefined;

  const runSquash = <T extends { role: WireRole; content: string; name?: string }>(rows: readonly T[]): T[] =>
    merges ? squashSameRole(rows) : rows.filter((r) => r.content.trim().length > 0);

  // 2. splice in_chat by depth → 3. name-stamp → 4. squash same-role.
  // Name-stamp runs before the final squash so adjacent distinct-character rows keep each speaker's
  // label inside a merged block instead of collapsing under the first author's name. The reported
  // `squashed` stage stays the pre-name squash (labels are role-adjacency-neutral annotations).
  const injected = spliceInChatInjections(withTail, input.injections, resolveContent, {
    allowAssistantPrefill: input.assistantPrefill === true,
    prefixBoundaryLen,
    squashSystemMessages: input.squashSystemMessages === true,
  });
  const squashed = runSquash(injected);
  const named = runSquash(applyNamesBehavior(injected, input.namesBehavior, input.speakers, multiCharacter));

  // 5. group/continuation nudge: a multi-speaker round's nudge rides as a trailing user message; a
  // force/auto/empty-opening round that would otherwise end on assistant gets CONTINUATION_NUDGE. Either
  // is a second volatile tail → the breakpoint aborts for the round.
  const nudge = input.groupNudge;
  const endsOnAssistant = named.length === 0 || named.at(-1)?.role === "assistant";
  const needsContinuation = endsOnAssistant && input.assistantPrefill !== true;
  const tailUser = nudge ?? (needsContinuation ? CONTINUATION_NUDGE : null);
  const history = tailUser !== null ? runSquash([...named, { role: "user", content: tailUser }]) : named;

  // Computed on the nudge-free stages (an appended tail is a second volatile tail → abort).
  const cacheBreakpointFromEnd =
    tailUser !== null
      ? undefined
      : computeHistoryBreakpoint(withTail, injected, named, {
          injections: input.injections,
          scopedFold: input.output === "per-speaker" && input.cardScope === "scoped" && input.scopedTargetId !== null,
          merges,
        });

  return {
    history,
    cacheBreakpointFromEnd,
    stages: { multiCharacter, withTail, injected, squashed, named },
  };
}

/** The wire authorName for a user/narrator row: the row's OWN stamped personaId resolved through the
 *  per-chat producer, not the current active persona. A null stamp or unresolvable id yields null, so
 *  `applyNamesBehavior` falls back to the active persona. */
function userRowAuthorName(personaId: PersonaId | null, macroNames: HistoryMacroNames): string | null {
  return personaId !== null ? (macroNames.personaNamesById.get(personaId)?.name ?? null) : null;
}

/** Maps the loaded canon (`MessageView[]`) → SHAPE wire input rows: drops hidden + system rows and resolves
 *  each row's macros against its own stamps + the per-chat `macroNames` producer (matching client display
 *  resolution). The ONE mapping shared by the engine turn pipeline and the host/admin shape-trace preview
 *  (`verbs/read.ts`) — both reach it via the `substrate/assembly-access` seam (no drift, no duplicate). */
export function toShapeCanon(canon: readonly MessageView[], ctx: AssembleContext, macroNames: HistoryMacroNames): CanonRow[] {
  const nameById = new Map<CharacterId, string>();
  const cast = ctx.cast ?? [];
  const ids = ctx.castCharacterIds ?? [];
  ids.forEach((id, i) => {
    const name = cast[i]?.name;
    if (id !== null && name !== undefined) {
      nameById.set(id, name);
    }
  });
  const rows: CanonRow[] = [];
  for (const m of canon) {
    if (m.excludedFromPrompt || m.role === "system") {
      continue;
    }
    const stamps = { characterId: m.characterId, personaId: m.personaId };
    if (m.role === "assistant") {
      const authorName = m.characterId !== null ? (nameById.get(m.characterId) ?? null) : null;
      rows.push({
        role: "assistant",
        content: renderHistoryMacros(m.content, stamps, ctx, {
          producer: macroNames,
          speakerCharName: authorName ?? undefined,
        }),
        characterId: m.characterId,
        authorName,
        messageId: m.id,
      });
    } else {
      // User/narrator rows: {{user}}/{{persona}} resolve to this row's own stamped personaId, falling back
      // to the active persona only when the stamp is null.
      rows.push({
        role: "user",
        content: renderHistoryMacros(m.content, stamps, ctx, { producer: macroNames }),
        authorName: userRowAuthorName(m.personaId, macroNames),
        messageId: m.id,
      });
    }
  }
  return rows;
}
