// domain/chat/assembly/shape — the SHAPE substrate: the per-runner, per-speaker transform turning
// (canon history, injections, speaker, params) into the final WIRE history + the cache breakpoint offset.
// Order: scope-to-speaker → splice in_chat by depth → name-stamp → squash same-role → continuation nudge.
// Name-stamp runs before the final squash so adjacent distinct-character rows keep every speaker's label.

import type { AssembleContext, ChatInjection, GroupConfig, MessageView, ShapeRowSource, ShapeTraceRow } from "@orb/contracts/chat";
import type { RoleHandling } from "@orb/contracts/connection";
import type { NamesBehavior } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { CharacterId, MessageId, PersonaId } from "@orb/kit/ids";
import { speakerTagsToPlain } from "@orb/kit/speaker-label";
import type { PromptHistoryRegexEnv } from "../contract/regex.ts";
import type { HistoryMacroNames } from "../contract/results.ts";
import { applyPromptHistoryRegex } from "./history-regex.ts";
import { spliceInChatInjections } from "./injections.ts";
import { renderHistoryMacros } from "./macros.ts";
import { applyNamesBehavior } from "./names.ts";
import { clampRoleHandling, squashRuns, squashSameRole } from "./role-squash.ts";
import { hasMultipleCharacters } from "./speaker-stamp.ts";

/** The CANON wire-history role axis (derive-don't-respell the non-system subset; canon rows are never
 *  system — `toShapeCanon` drops them). */
type WireRole = "user" | "assistant";

/** The DELIVERED wire-row role axis: canon roles plus the capability-gated `system` a depth-0 splice can
 *  emit when the model declares `turns.midConversationSystem` (see `assembly/injections`). */
type DeliveredRole = WireRole | "system";

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
  role: DeliveredRole;
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
  /** The resolved `turns.midConversationSystem`: `true` ⇒ a depth-0 in_chat system injection delivers as a
   *  REAL system wire row (the model honors a tail system-authority channel); `false`/absent (the
   *  `TURNS_FLOOR` safe default) ⇒ it demotes to the visible `[Note from system: …]` user note. */
  midConversationSystem?: boolean;
  /** The user role-handling knob (from preset `params.advanced.roleHandling`); clamped against the floor. */
  roleHandling?: RoleHandling | undefined;
  /** The model/wire adjacent-same-role floor. Unset ⇒ `strict`. SHAPE runs the stricter of floor + knob. */
  roleHandlingFloor?: RoleHandling | undefined;
  /** The user `squashSystemMessages` knob (from preset `params.advanced.squashSystemMessages`): `true` ⇒
   *  merge consecutive system-note runs before they convert to user rows. Orthogonal to `roleHandling`. */
  squashSystemMessages?: boolean | undefined;
  /** The room host's PROSE-1 overrides (`assembleContext.prose`) — the two injection note frames. Absent ⇒
   *  the shipped frames, byte-identical. */
  prose?: ProseOverrides | undefined;
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
    injected: (CanonRow | { role: DeliveredRole; content: string })[];
    squashed: (CanonRow | { role: DeliveredRole; content: string })[];
    named: WireRow[];
    /** The FINAL stage's content-free projection: `history` as order + role + voice + provenance + size.
     *  The only stage snapshot that is already wire-shaped, because it is the one a host READS
     *  (`ShapeTrace.rows` via `assembly/trace`); the others exist for counts + the differential oracle. */
    delivered: readonly ShapeTraceRow[];
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
  withTail: readonly { role: DeliveredRole; content: string }[],
  injected: readonly { role: DeliveredRole; content: string }[],
  finalHistory: readonly { role: DeliveredRole; content: string }[],
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

/** What ONE pre-squash row contributes to the delivered-row trace: where its bytes came from, and whose voice
 *  it is in. The VOICE is read here rather than off the delivered row because the name-stamp INLINES the
 *  speaker into content on every mode but `completion` — by the time a row is delivered, `name` is usually
 *  gone and the author is only recoverable from the pre-name row. File-local: a builder input, not a domain
 *  type (the wire shape is `@orb/contracts/chat`'s `ShapeTraceRow`). */
interface RowFacts {
  readonly source: ShapeRowSource;
  readonly name?: string;
}

/** Collapse a delivered row's contributing rows into one fact. Uniform provenance ⇒ that arm; MIXED ⇒
 *  `merged`, never the head's arm — a squash that folded an injected note into an adjacent canon turn is the
 *  INJECT-NAMED-AS-PLAYER shape, and reporting it as `canon` would hide exactly the row worth seeing. The
 *  voice is the first contributor that carries one (the merge keeps the head's identity). */
function mergeRowFacts(parts: readonly RowFacts[]): RowFacts {
  const source = collapseSources(parts);
  const name = parts.find((part) => part.name !== undefined)?.name;
  return name === undefined ? { source } : { source, name };
}

function collapseSources(parts: readonly RowFacts[]): ShapeRowSource {
  const first = parts[0];
  if (first === undefined) {
    return "assembled";
  }
  return parts.every((part) => part.source === first.source) ? first.source : "merged";
}

/** The pre-squash row facts the delivered trace reads, index-aligned with the name-stamp's 1:1 output.
 *  PROVENANCE off `messageId` (present ⇒ a stored message, absent ⇒ assembly made it this turn — the same
 *  discriminator `resolveFullCards` reads); VOICE off the PRE-name row's `authorName`, because the name-stamp
 *  inlines the speaker into content on every mode but `completion`, so the delivered row usually has no `name`
 *  left to read. */
function preSquashRowFacts(namedInput: readonly WireRow[], injected: readonly (CanonRow | { role: DeliveredRole; content: string })[]): RowFacts[] {
  return namedInput.map((row, index): RowFacts => {
    const origin = injected[index];
    const authorName = origin !== undefined && "authorName" in origin ? (origin.authorName ?? undefined) : undefined;
    const source: ShapeRowSource = row.messageId === undefined ? "assembled" : "canon";
    const name = row.name ?? authorName;
    return name === undefined ? { source } : { source, name };
  });
}

/** The SAME grouping `runSquash` applies, as INPUT INDICES per delivered row — the delivered-row trace needs
 *  "which inputs became this row" to report a merged row's provenance. ONE rule, two readers
 *  (`role-squash::squashRuns` is what `squashSameRole` is built on), so the trace cannot drift from the wire.
 *  `merges === false` is the pass-through arm: empties drop, nothing groups. */
function squashRunsFor<T extends { role: DeliveredRole; content: string; name?: string }>(rows: readonly T[], merges: boolean): readonly (readonly number[])[] {
  return merges ? squashRuns(rows) : rows.flatMap((row, index) => (row.content.trim().length > 0 ? [[index]] : []));
}

/** Project the DELIVERED wire history onto the content-free `ShapeTrace.rows` — the block-order/role/voice
 *  datum a host previously reconstructed by hand from wire captures. Walks the same TWO squash passes SHAPE
 *  ran (name-stamp squash, then the nudge-tail squash), as index runs, so each delivered row's facts are the
 *  union of the rows that actually became it — which is what makes a `merged` verdict provable rather than
 *  guessed. */
function traceDeliveredRows(args: {
  readonly injected: readonly (CanonRow | { role: DeliveredRole; content: string })[];
  readonly namedInput: readonly WireRow[];
  readonly named: readonly WireRow[];
  readonly history: readonly WireRow[];
  /** The appended group/continuation nudge, or `null` when the history needed no tail. */
  readonly tailUser: string | null;
  readonly merges: boolean;
}): ShapeTraceRow[] {
  const preSquash = preSquashRowFacts(args.namedInput, args.injected);
  const namedFacts = squashRunsFor(args.namedInput, args.merges).map((run) => mergeRowFacts(run.flatMap((index) => preSquash[index] ?? [])));
  // The nudge is assembly's own row, so it enters the second pass with `assembled` provenance of its own.
  const stage: readonly RowFacts[] = args.tailUser === null ? namedFacts : [...namedFacts, { source: "assembled" }];
  const historyRuns =
    args.tailUser === null
      ? args.named.map((_, index) => [index])
      : squashRunsFor([...args.named, { role: "user" as const, content: args.tailUser }], args.merges);
  return historyRuns.flatMap((run, index): ShapeTraceRow[] => {
    const row = args.history[index];
    if (row === undefined) {
      return [];
    }
    const facts = mergeRowFacts(run.flatMap((source) => stage[source] ?? []));
    return [{ role: row.role, ...(facts.name === undefined ? {} : { name: facts.name }), source: facts.source, chars: row.content.length }];
  });
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

  const runSquash = <T extends { role: DeliveredRole; content: string; name?: string }>(rows: readonly T[]): T[] =>
    merges ? squashSameRole(rows) : rows.filter((r) => r.content.trim().length > 0);

  // 2. splice in_chat by depth → 3. name-stamp → 4. squash same-role.
  // Name-stamp runs before the final squash so adjacent distinct-character rows keep each speaker's
  // label inside a merged block instead of collapsing under the first author's name. The reported
  // `squashed` stage stays the pre-name squash (labels are role-adjacency-neutral annotations).
  const injected = spliceInChatInjections(withTail, input.injections, resolveContent, {
    allowAssistantPrefill: input.assistantPrefill === true,
    allowMidConversationSystem: input.midConversationSystem === true,
    prefixBoundaryLen,
    squashSystemMessages: input.squashSystemMessages === true,
    prose: input.prose,
  });
  const squashed = runSquash(injected);
  const namedInput = applyNamesBehavior(injected, input.namesBehavior, input.speakers, { multiCharacter, mergesAdjacent: merges });
  const named = runSquash(namedInput);

  // 5. group/continuation nudge: a multi-speaker round's nudge rides as a trailing user message; a
  // force/auto/empty-opening round that would otherwise end on assistant gets CONTINUATION_NUDGE. Either
  // is a second volatile tail → the breakpoint aborts for the round.
  const nudge = input.groupNudge;
  // A capability-kept trailing SYSTEM row is neither prefill nor a user turn — the ends-on-user invariant
  // reads the last NON-SYSTEM row, so a canon ending on assistant still gets its user tail (appended after
  // the system row; on the agent-sdk arm the system rows fold out of the prompt tail into the hook channel).
  const lastNonSystem = named.findLast((r) => r.role !== "system");
  const endsOnAssistant = lastNonSystem === undefined || lastNonSystem.role === "assistant";
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

  // The content-free DELIVERED-row trace (`ShapeTrace.rows`) — order, role, voice, provenance, size.
  const delivered = traceDeliveredRows({ injected, namedInput, named, history, tailUser, merges });

  return {
    history,
    cacheBreakpointFromEnd,
    stages: { multiCharacter, withTail, injected, squashed, named, delivered },
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
/** The seq the compaction marker covers THROUGH — covered rows fall out of the shaped prompt history (full-reset:
 *  the marker stands in for them). Api-agnostic (covered turns never re-enter on any source). Returns 0 (no
 *  exclusion) unless a NON-empty `compactSummary` is present, so a stale `compactedThroughSeq` alone never trims. */
function compactionCoveredThroughSeq(ctx: AssembleContext): number {
  const summary = ctx.compactSummary;
  if (summary === null || summary === undefined || summary.trim().length === 0) {
    return 0;
  }
  return ctx.compactedThroughSeq ?? 0; // null/undefined ⇒ 0 (no exclusion)
}

/**
 * Map the loaded canon → SHAPE wire rows. `promptHistory` runs the `PROMPT_HISTORY` regex leg over the
 * result (`assembly/history-regex` — the ephemeral prompt-build leg); it is REQUIRED and explicitly
 * nullable rather than optional, because "this build shows the model something the transform would have
 * changed" has to be a decision a caller makes out loud. `null` = no leg (a hand-built/preview call with no
 * watchdog to run it under); the turn pipeline and the host `previewAssembly`/`getShapeTrace` reads all
 * pass a real env, so what the preview prints is what the wire carries.
 */
export function toShapeCanon(
  canon: readonly MessageView[],
  ctx: AssembleContext,
  macroNames: HistoryMacroNames,
  promptHistory: PromptHistoryRegexEnv | null,
): readonly CanonRow[] {
  const nameById = new Map<CharacterId, string>();
  const cast = ctx.cast ?? [];
  const ids = ctx.castCharacterIds ?? [];
  ids.forEach((id, i) => {
    const name = cast[i]?.name;
    if (id !== null && name !== undefined) {
      nameById.set(id, name);
    }
  });
  const coveredThroughSeq = compactionCoveredThroughSeq(ctx);
  const rows: CanonRow[] = [];
  for (const m of canon) {
    if (m.excludedFromPrompt || m.role === "system" || m.seq <= coveredThroughSeq) {
      continue;
    }
    const stamps = { characterId: m.characterId, personaId: m.personaId };
    if (m.role === "assistant") {
      const authorName = m.characterId !== null ? (nameById.get(m.characterId) ?? null) : null;
      rows.push({
        role: "assistant",
        // A narrator row's inline `<speaker>NAME</speaker>` markers are kept in STORED canon (the renderer
        // colors by them) but must not ride into the prompt as raw XML: it wastes tokens AND trains the
        // model to parrot the syntax. They convert to the plain `NAME: ` attribution the transcript already
        // speaks — the SAME form the name-stamp uses. A body with no markers (every per-speaker / solo row)
        // is returned unchanged, so this is a byte-identical no-op everywhere else.
        content: renderHistoryMacros(speakerTagsToPlain(m.content), stamps, ctx, {
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
  // MACROS FIRST, THEN REGEX (D121-E): every row above resolved its own stamps through
  // `renderHistoryMacros`; the leg rewrites that resolved text and returns copies — `rows` itself is what
  // gets discarded, and the `messages` rows it was read from were never touched.
  return promptHistory === null ? rows : applyPromptHistoryRegex(rows, promptHistory);
}
