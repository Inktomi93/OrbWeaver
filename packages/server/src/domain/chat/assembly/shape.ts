// domain/chat/assembly/shape — the SHAPE substrate: the per-runner, per-speaker transform turning
// (canon history, injections, speaker, params) into the final WIRE history + the cache breakpoint offset.
// Order: scope-to-speaker → splice in_chat by depth → name-stamp → deliver system rows + place the user tail →
// squash same-role. Name-stamp runs before the squash so adjacent distinct-character rows keep every
// speaker's label.
//
// ROLES FOLLOW THE AUTHOR (owner ruling). Every injection keeps the role and position its author chose; SHAPE
// never reorders one. A system-role row stays a real `system` row only where the turn's message-handling level
// and the model take it in that slot, and folds into user text in its neutral frame otherwise
// ({@link deliverSystemRows}). SHAPE's own user tail (the group or continuation cue) is placed so the rows
// around it stay legal: before a trailing system run, never after it.

import type {
  AssembleContext,
  ChatInjection,
  GroupConfig,
  MessageKind,
  MessageKindPolicy,
  MessageView,
  ShapeBreakpointDecision,
  ShapeFoldReason,
  ShapeRowSource,
  ShapeTraceRow,
} from "@orb/contracts/chat";
import { MESSAGE_KIND_POLICY } from "@orb/contracts/chat";
import type { RoleHandling, SystemRowPlacement } from "@orb/contracts/inference";
import { clampRoleHandling, SYSTEM_ROW_PLACEMENT, TURNS_FLOOR } from "@orb/contracts/inference";
import type { NamesBehavior } from "@orb/contracts/preset";
import type { ProseOverrides } from "@orb/contracts/prose";
import { resolveProseText } from "@orb/contracts/prose";
import { cacheDepthCovering } from "@orb/inference";
import type { CharacterId, MessageId, PersonaId, UserId } from "@orb/kit/ids";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { speakerTagsToPlain } from "@orb/kit/speaker-label";
import type { PromptHistoryRegexEnv } from "../contract/regex.ts";
import type { HistoryMacroNames } from "../contract/results.ts";
import { applyPromptHistoryRegex } from "./history-regex.ts";
import { frameInjection, spliceInChatInjections } from "./injections.ts";
import { renderHistoryMacros } from "./macros.ts";
import { applyNamesBehavior } from "./names.ts";
import { MERGE_SEPARATOR, squashRuns, squashSameRole } from "./role-squash.ts";
import { hasMultipleCharacters } from "./speaker-stamp.ts";

/** The CANON wire-history role axis (derive-don't-respell the non-system subset; canon rows are never
 *  system — `toShapeCanon` drops them). */
type WireRole = "user" | "assistant";

/** The DELIVERED wire-row role axis: canon roles plus the `system` row an injection keeps where
 *  {@link deliverSystemRows} lets it. An injection is the ONLY producer of a delivered `system` row: a CANON row
 *  never takes one (owner ruling 2026-08-18 — see {@link shape}'s narrator note). */
type DeliveredRole = WireRole | "system";

/** One loaded canon row SHAPE consumes (from `persistence/queries.loadCanonHistory`, already sanitized).
 *  `authorName` = the stored authoring name (persona on user rows, character on assistant rows);
 *  `characterId` = the authoring character (identity attribution — drives the distinct-speaker gate);
 *  `kind` = the row's DECLARED purpose (D129), which is what the label policy and the trace dispatch on —
 *  never re-derived here from role × attribution. Optional because a synthetic row SHAPE builds itself (the
 *  appended user turn, an egocentric fold's rewritten line) is not a canon row and declares no purpose;
 *  absent reads as `standard` at every dispatch. */
interface CanonRow {
  role: WireRole;
  content: string;
  authorName?: string | null;
  characterId?: CharacterId | null;
  messageId?: MessageId | undefined;
  kind?: MessageKind | undefined;
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
  /** The room seats more than one present human (`AssembleContext.multiHuman`) — the name-stamp labels every
   *  canon user row. Absent ⇒ a solo room. */
  multiHuman?: boolean | undefined;
  /** The group nudge (`[Write the next reply only as X.]`), set only on a multi-speaker round. */
  groupNudge: string | null;
  resolveContent?: (content: string) => string;
  /** Model accepts a delivered trailing-assistant message as response prefill: `true` ⇒ deliver verbatim
   *  (no continuation nudge); `false` (default) ⇒ nudge a trailing-assistant to a user tail. */
  assistantPrefill?: boolean;
  /** The resolved `turns.midConversationSystem`: the model takes a system run that ENDS the history. Absent ⇒
   *  the `TURNS_FLOOR` fail-closed default: a trailing run folds (`tail`). */
  midConversationSystem?: boolean;
  /** The resolved `turns.historySystemRows` (read through `acceptsHistorySystemRows`): the model takes a system
   *  run INSIDE the history. A sibling of {@link midConversationSystem}, never the same bit: one wire can take
   *  the tail and refuse mid-array. Absent ⇒ a mid-array run folds (`mid-array`). It gates injections only: a
   *  `narrator`-kind CANON row delivers as `assistant` on every wire (owner ruling — group narration is the
   *  assistant's own voice, not the operator channel). */
  historySystemRows?: boolean;
  /** The preset message-handling knob (`params.advanced.roleHandling`); clamped against the floor. */
  roleHandling?: RoleHandling | undefined;
  /** The model's message-handling floor. Unset ⇒ `strict`. SHAPE runs the stricter of floor + knob. */
  roleHandlingFloor?: RoleHandling | undefined;
  /** The user `squashSystemMessages` knob (from preset `params.advanced.squashSystemMessages`): `true` ⇒
   *  merge consecutive system-note runs before they convert to user rows. Orthogonal to `roleHandling`. */
  squashSystemMessages?: boolean | undefined;
  /** The room host's PROSE-1 overrides (`assembleContext.prose`) — the two injection note frames. Absent ⇒
   *  the shipped frames, byte-identical. */
  prose?: ProseOverrides | undefined;
  /** Whether a row body converts to an empty wire row, which the conversion then drops
   *  (`substrate/wire-history` convertsToEmptyWireRow). Such a row is no neighbour when a system row's slot is
   *  judged. Required, so no caller judges slots against rows the wire never delivers. */
  convertsToEmptyWireRow: (content: string) => boolean;
}

interface ShapeOutput {
  /** The final delivered wire history (post-nudge, pre engine fit-pass). */
  history: WireRow[];
  /** The depth, in role groups from the end, of the last stable row for the runner to pin `cache_control` on
   *  (see {@link computeHistoryBreakpoint}), or undefined. */
  cacheBreakpointFromEnd: number | undefined;
  /** WHY that depth is present or absent — decided HERE, by the code that made the call, and carried out
   *  verbatim for `assembly/trace` to project. Stage row counts cannot see why a pin moved or vanished, so the
   *  trace never re-derives it. */
  breakpointDecision: ShapeBreakpointDecision;
  /** The new-chat marker SHAPE placed at the top of `history`, or null when the turn has none. `mergeSeparator`
   *  is the squash separator when this turn's level merges the marker into an adjacent user row, else null. The
   *  history fit trims the oldest rows first, so it places the marker again at the head of the rows it keeps
   *  (`substrate/wire-history` keepNewChatMarkerAtHead). */
  newChatMarker: { readonly content: string; readonly mergeSeparator: string | null } | null;
  /** Per-stage snapshots — the host/admin trace + differential-oracle diff surface. */
  stages: {
    multiCharacter: boolean;
    /** PRE-SPLICE, and therefore never `system`: canon rows are `user|assistant` on both the canon and the
     *  delivered plane (`toShapeCanon` drops system-role rows; no canon row is re-roled at delivery). */
    withTail: CanonRow[];
    injected: (CanonRow | { role: DeliveredRole; content: string })[];
    squashed: (CanonRow | { role: DeliveredRole; content: string })[];
    named: WireRow[];
    /** The FINAL stage's content-free projection: `history` as order + role + voice + provenance + size.
     *  The only stage snapshot that is already wire-shaped, because it is the one a host READS
     *  (`ShapeTrace.rows` via `assembly/trace`); the others feed that same builder's counts +
     *  breakpoint-decision derivation. (They also fed the neo differential oracle until #428 ripped it
     *  out 2026-08-22 — every field still has a live consumer in `buildShapeTrace`.) */
    delivered: readonly ShapeTraceRow[];
  };
}

// Trailing-user cue for a turn with no real user input and no group nudge — the delivered history must
// end on a user turn (a trailing assistant turn is response prefill; rejected when thinking is on).
//
// PROSE-1 slot `chat.assembly.continuationNudge` (per-PRESET): it is a sentence
// that reaches the model, so it is authorable in the preset Templates tab rather than a `const` here. An
// absent override resolves the shipped bytes, so the wire is byte-identical until a host edits it.
function continuationNudge(prose: ProseOverrides | undefined): string {
  return resolveProseText("chat.assembly.continuationNudge", prose ?? {});
}

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
        // Purpose survives the fold: the WIRE role changed, the row did not stop being what it is (D129's
        // three orthogonal axes — the fold moves DELIVERY, never PURPOSE).
        kind: m.kind,
      };
    }
    return m;
  });
}

/** The breakpoint call: the depth (absent ⇒ no breakpoint) PLUS the reason, which is the whole point of
 *  returning a record rather than a bare number — only the code that aborts knows WHY it aborted. */
interface BreakpointOutcome {
  readonly offsetFromEnd: number | undefined;
  readonly decision: ShapeBreakpointDecision;
}

const NO_STABLE_PREFIX: BreakpointOutcome = { offsetFromEnd: undefined, decision: "no-stable-prefix" };
/** The very first delivered row is volatile (an injection landed on it, or this turn's row merged into it), so
 *  nothing above it can be pinned. One label, because it is one fix for a host: something is rewriting the
 *  bytes the cache would have pinned. */
const PREFIX_DISRUPTED: BreakpointOutcome = { offsetFromEnd: undefined, decision: "in-prefix-injection-or-squash" };

/** One row on its way to the wire: the row, where it came from (an index into the name-stamped rows, or `null`
 *  for SHAPE's own user tail), and why it folded, if a system row did. */
interface DeliveryEntry {
  row: WireRow;
  readonly origin: number | null;
  folded?: ShapeFoldReason;
}

/** The pre-squash delivered list and the user tail SHAPE placed in it. */
interface Delivery {
  readonly entries: readonly DeliveryEntry[];
  readonly tailUser: string | null;
}

function isLive(entry: DeliveryEntry): boolean {
  return entry.row.content.trim().length > 0;
}

/** Fold a system row into user text in its neutral frame. */
function foldEntry(entry: DeliveryEntry, reason: ShapeFoldReason, prose: ProseOverrides | undefined): void {
  entry.row = { role: "user", content: frameInjection("user", entry.row.content, "system", prose ?? {}) };
  entry.folded = reason;
}

/** The role of the nearest non-system row in `entries` (walked in the order given) that reaches the wire, or
 *  undefined. A row that converts to nothing is dropped after SHAPE, so it is never the neighbour. */
function nearestRole(entries: readonly DeliveryEntry[], convertsToEmpty: (content: string) => boolean): DeliveredRole | undefined {
  return entries.find((entry) => isLive(entry) && entry.row.role !== "system" && !convertsToEmpty(entry.row.content))?.row.role;
}

/** Why a run INSIDE the history folds, or null when it stays a system row. The legal slot (`slotted`): the
 *  row before is a user row and the row after is an assistant row. */
function midArrayFold(
  placement: SystemRowPlacement,
  beforeRole: DeliveredRole | undefined,
  afterRole: DeliveredRole | undefined,
  historySystemRows: boolean,
): ShapeFoldReason | null {
  if (placement === "fold") {
    return "level";
  }
  if (placement === "slot" && !(beforeRole === "user" && afterRole === "assistant")) {
    return "slot";
  }
  return historySystemRows ? null : "mid-array";
}

/**
 * THE DELIVERY RULE for system-role rows, and the placement of SHAPE's own user tail. A system run is a maximal
 * run of adjacent system rows; each run keeps its author's position and either stays a real `system` row or
 * folds into user text:
 *
 *   • the level folds every system row (`semi-strict`, `strict`) ⇒ `level`;
 *   • a TRAILING run (it ends the history) needs `turns.midConversationSystem` ⇒ else `tail`. SHAPE's user tail,
 *     when the turn needs one, goes BEFORE a kept trailing run, so the run follows a user row and ends the array
 *     (the direct Anthropic wire refuses `[…assistant, system, user]`). Under `slotted` a kept trailing run that
 *     still follows an assistant row (a prefill turn) is out of its slot ⇒ `slot`;
 *   • a run INSIDE the history needs `turns.historySystemRows` ⇒ else `mid-array`; under `slotted` it must also
 *     sit between a user row and an assistant row ⇒ else `slot`.
 *
 * OpenRouter turns a system row in an illegal slot into bare, unframed user text without a signal, so the fold
 * happens here first, in its neutral frame.
 */
/** The options {@link deliverSystemRows} and its steps read. */
interface DeliveryOptions {
  readonly level: RoleHandling;
  readonly midConversationSystem: boolean;
  readonly historySystemRows: boolean;
  readonly groupNudge: string | null;
  readonly assistantPrefill: boolean;
  readonly prose: ProseOverrides | undefined;
  readonly convertsToEmptyWireRow: (content: string) => boolean;
}

/** Fold every run INSIDE the history that the level or the model does not take. Every verdict is taken before
 *  any row folds, so a folded row never becomes the user neighbour that makes the next row look legal. */
function foldMidArrayRuns(entries: readonly DeliveryEntry[], lastNonSystem: number, opts: DeliveryOptions): void {
  const placement = SYSTEM_ROW_PLACEMENT[opts.level];
  const reasons = entries.map((entry, index): ShapeFoldReason | null => {
    if (index >= lastNonSystem || entry.row.role !== "system" || !isLive(entry)) {
      return null;
    }
    const before = nearestRole(entries.slice(0, index).toReversed(), opts.convertsToEmptyWireRow);
    const after = nearestRole(entries.slice(index + 1), opts.convertsToEmptyWireRow);
    return midArrayFold(placement, before, after, opts.historySystemRows);
  });
  entries.forEach((entry, index) => {
    const reason = reasons[index];
    if (reason !== null && reason !== undefined) {
      foldEntry(entry, reason, opts.prose);
    }
  });
}

/** Why the TRAILING run folds, or undefined when it stays. SHAPE's user tail goes before a kept run, so under
 *  `slotted` the run is out of its slot only when no user row can precede it (a prefill turn ending on the
 *  model's own reply). */
function trailingFold(lastRole: DeliveredRole | undefined, opts: DeliveryOptions): ShapeFoldReason | undefined {
  const placement = SYSTEM_ROW_PLACEMENT[opts.level];
  if (placement === "fold") {
    return "level";
  }
  if (!opts.midConversationSystem) {
    return "tail";
  }
  const cued = opts.groupNudge !== null || ((lastRole === undefined || lastRole === "assistant") && !opts.assistantPrefill);
  return placement === "slot" && lastRole !== "user" && !cued ? "slot" : undefined;
}

function deliverSystemRows(rows: readonly WireRow[], opts: DeliveryOptions): Delivery {
  const entries: DeliveryEntry[] = rows.map((row, index) => ({ row, origin: index }));
  const lastNonSystem = entries.findLastIndex((entry) => isLive(entry) && entry.row.role !== "system");
  foldMidArrayRuns(entries, lastNonSystem, opts);

  const trailing = entries.slice(lastNonSystem + 1).filter((entry) => entry.row.role === "system" && isLive(entry));
  const trailingReason = trailing.length === 0 ? undefined : trailingFold(entries[lastNonSystem]?.row.role, opts);
  if (trailingReason !== undefined) {
    for (const entry of trailing) {
      foldEntry(entry, trailingReason, opts.prose);
    }
  }

  const lastDelivered = entries.findLast((entry) => isLive(entry) && entry.row.role !== "system");
  const endsOnAssistant = lastDelivered === undefined || lastDelivered.row.role === "assistant";
  const tailUser = opts.groupNudge ?? (endsOnAssistant && !opts.assistantPrefill ? continuationNudge(opts.prose) : null);
  if (tailUser === null) {
    return { entries, tailUser };
  }
  const tail: DeliveryEntry = { row: { role: "user", content: tailUser }, origin: null };
  const keptTrailing = trailingReason === undefined ? trailing[0] : undefined;
  const at = keptTrailing === undefined ? entries.length : entries.indexOf(keptTrailing);
  return { entries: [...entries.slice(0, at), tail, ...entries.slice(at)], tailUser };
}

/** Which spliced rows repeat byte for byte on the next turn, so the cache may pin them: the committed canon
 *  before this turn's volatile row, and an injection anchored above the first canon row (the new-chat marker).
 *  Every other injection is volatile: a depth-N row moves as the history grows. Index-aligned with `injected`. */
function stableRows(
  withTail: readonly object[],
  stableCount: number,
  injected: readonly ({ readonly role: DeliveredRole; readonly content: string } | { readonly anchored?: true })[],
): boolean[] {
  const committed = new Set<object>(withTail.slice(0, stableCount));
  return injected.map((row) => committed.has(row) || "anchored" in row);
}

/**
 * THE HISTORY BREAKPOINT — the depth the runner pins its `cache_control` pair at, counted in role groups from the
 * end exactly as the runner counts it (`@orb/inference` `cacheDepthCovering`/`rowIndexAtCacheDepth`, where a
 * system row is transparent). The pin sits on the last row of the leading stable run: above the deepest
 * injection and above any row a volatile row merged into. A depth-N note therefore moves the pin up instead of
 * removing it, so the history above the note is read from the cache every turn.
 *
 * `delivered` is the final delivered history with each row's stability (a merged row is stable only when every
 * row in it is). @internal — exported for the unit test.
 */
export function computeHistoryBreakpoint(
  delivered: readonly { readonly role: DeliveredRole; readonly stable: boolean }[],
  hasStablePrefix: boolean,
): BreakpointOutcome {
  if (!hasStablePrefix) {
    return NO_STABLE_PREFIX;
  }
  const firstVolatile = delivered.findIndex((row) => !row.stable);
  const pinLimit = (firstVolatile === -1 ? delivered.length : firstVolatile) - 1;
  const offsetFromEnd = cacheDepthCovering(delivered, pinLimit);
  if (offsetFromEnd === undefined || offsetFromEnd < 1) {
    return PREFIX_DISRUPTED;
  }
  return { offsetFromEnd, decision: "placed" };
}

/** What ONE pre-squash row contributes to the delivered-row trace: where its bytes came from, and whose voice
 *  it is in. The VOICE is read here rather than off the delivered row because the name-stamp INLINES the
 *  speaker into content on every mode but `completion` — by the time a row is delivered, `name` is usually
 *  gone and the author is only recoverable from the pre-name row. File-local: a builder input, not a domain
 *  type (the wire shape is `@orb/contracts/chat`'s `ShapeTraceRow`). */
interface RowFacts {
  readonly source: ShapeRowSource;
  readonly name?: string;
  /** The contributing canon row's DECLARED purpose; absent for an assembled row (no slot, no purpose). */
  readonly kind?: MessageKind;
  /** Why a system-role row folded into this one, if one did. */
  readonly folded?: ShapeFoldReason;
}

/** Collapse a delivered row's contributing rows into one fact. Uniform provenance ⇒ that arm; MIXED ⇒
 *  `merged`, never the head's arm — a squash that folded an injected note into an adjacent canon turn is the
 *  INJECT-NAMED-AS-PLAYER shape, and reporting it as `canon` would hide exactly the row worth seeing. The
 *  voice is the first contributor that carries one (the merge keeps the head's identity). */
function mergeRowFacts(parts: readonly RowFacts[]): RowFacts {
  const source = collapseSources(parts);
  const name = parts.find((part) => part.name !== undefined)?.name;
  const kind = parts.find((part) => part.kind !== undefined)?.kind;
  const folded = parts.find((part) => part.folded !== undefined)?.folded;
  return {
    source,
    ...(name === undefined ? {} : { name }),
    ...(kind === undefined ? {} : { kind }),
    ...(folded === undefined ? {} : { folded }),
  };
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
    // PURPOSE off the same pre-name origin row the voice comes from — a canon row declares one, a spliced
    // injection/nudge does not (and `assembled` is the arm that says so).
    const kind = origin !== undefined && "kind" in origin ? origin.kind : undefined;
    return {
      source,
      ...(name === undefined ? {} : { name }),
      ...(kind === undefined ? {} : { kind }),
    };
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
 *  datum a host previously reconstructed by hand from wire captures. Walks the same squash SHAPE ran over the
 *  delivery list, as index runs, so each delivered row's facts are the union of the rows that actually became
 *  it — which is what makes a `merged` verdict and a fold reason provable rather than guessed. */
function traceDeliveredRows(args: {
  readonly injected: readonly (CanonRow | { role: DeliveredRole; content: string })[];
  readonly namedInput: readonly WireRow[];
  readonly delivery: Delivery;
  readonly history: readonly WireRow[];
  readonly merges: boolean;
}): ShapeTraceRow[] {
  const preSquash = preSquashRowFacts(args.namedInput, args.injected);
  // SHAPE's own user tail is assembly's own row, so it carries `assembled` provenance of its own.
  const entryFacts = args.delivery.entries.map((entry): RowFacts => {
    const base: RowFacts = entry.origin === null ? { source: "assembled" } : (preSquash[entry.origin] ?? { source: "assembled" });
    return entry.folded === undefined ? base : { ...base, folded: entry.folded };
  });
  const runs = squashRunsFor(
    args.delivery.entries.map((entry) => entry.row),
    args.merges,
  );
  return runs.flatMap((run, index): ShapeTraceRow[] => {
    const row = args.history[index];
    if (row === undefined) {
      return [];
    }
    const facts = mergeRowFacts(run.flatMap((source) => entryFacts[source] ?? []));
    return [
      {
        role: row.role,
        ...(facts.name === undefined ? {} : { name: facts.name }),
        source: facts.source,
        ...(facts.kind === undefined ? {} : { kind: facts.kind }),
        chars: row.content.length,
        ...(facts.folded === undefined ? {} : { folded: facts.folded }),
      },
    ];
  });
}

// THERE IS NO DELIVERED-ROLE DISPATCH — a canon row's wire role is its OWN role, on every model.
//
// D129(B) committed, and `56a979d44` shipped, a SHAPE-time mapping that re-roled a `narrator`-kind canon row
// to a wire `system` row wherever the model's MEASURED `turns.historySystemRows` said the wire takes mid-array
// system rows (the vLLM arm, 2026-08-18). The OWNER RULED IT OUT the same day, verbatim: "if you mean group
// chat narration mode then that is the wrong behavior." Group-chat narration mode is ONE generation voicing
// all the seated characters: it is the assistant's own OUTPUT voice, not an operator/system channel, so it delivers as an
// `assistant` row on every wire.
//
// The MEASUREMENT is honored and stands — `turns.historySystemRows` is real, and it keeps its ONE remaining
// reader, the depth > 0 arm of the injection splice (an author's note / depth-N world-info entry, which IS
// operator text). What was wrong was routing a canon PURPOSE (kind) through a wire-PLACEMENT capability: the
// capability answers "may a system row sit mid-array on this wire?", never "is this row system-authored?".
//
// `MESSAGE_KIND_POLICY.narrator.prompt === "system-channel"` therefore has exactly one performer left,
// `entersPrompt`, where it means DELIVERED, assistant-voiced, byte-identically to `conversation`.

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
  // synthetic user turn (regen/draft/continue). Every row here keeps its canon role — no kind × capability
  // re-roling happens at this build (see the delivered-role note above the transform).
  const withTail: CanonRow[] = input.appendUserTurn !== null ? [...scopedCanon, { role: "user", content: input.appendUserTurn }] : [...scopedCanon];

  // The turn's message-handling level: the stricter of the model floor + the preset knob. `none` skips merging;
  // every other level squashes. The level also decides where a system row may stay one (`deliverSystemRows`).
  const level = clampRoleHandling(input.roleHandlingFloor ?? TURNS_FLOOR.roleHandlingFloor, input.roleHandling);
  const merges = level !== "none";

  // The splice re-roles a depth-1 assistant injection that would merge into the last committed row before this
  // turn's own row (the last row of `withTail`).
  const prefixBoundaryLen = withTail.length > 1 ? withTail.length - 1 : undefined;

  const runSquash = <T extends { role: DeliveredRole; content: string; name?: string }>(rows: readonly T[]): T[] =>
    merges ? squashSameRole(rows) : rows.filter((r) => r.content.trim().length > 0);

  // 2. splice in_chat by depth (every system injection stays a bare system row at its author's position) →
  // 3. name-stamp → 4. deliver system rows + place the user tail → 5. squash same-role.
  // Name-stamp runs before the squash so adjacent distinct-character rows keep each speaker's label inside a
  // merged block instead of collapsing under the first author's name. The reported `squashed`/`named` stages
  // are the pre-delivery squashes (labels are role-adjacency-neutral annotations).
  const injected = spliceInChatInjections(withTail, input.injections, resolveContent, {
    allowAssistantPrefill: input.assistantPrefill === true,
    keepSystemRows: true,
    prefixBoundaryLen,
    squashSystemMessages: input.squashSystemMessages === true,
    prose: input.prose,
  });
  const squashed = runSquash(injected);
  const namedInput = applyNamesBehavior(injected, input.namesBehavior, input.speakers, {
    multiCharacter,
    multiHuman: input.multiHuman === true,
    mergesAdjacent: merges,
  });
  const named = runSquash(namedInput);

  // A multi-speaker round's group nudge, or the continuation cue for a turn that would otherwise end on the
  // model's own reply, rides as SHAPE's user tail.
  const delivery = deliverSystemRows(namedInput, {
    level,
    midConversationSystem: input.midConversationSystem === true,
    historySystemRows: input.historySystemRows === true,
    groupNudge: input.groupNudge,
    assistantPrefill: input.assistantPrefill === true,
    prose: input.prose,
    convertsToEmptyWireRow: input.convertsToEmptyWireRow,
  });
  const deliveredRows = delivery.entries.map((entry) => entry.row);
  const history = runSquash(deliveredRows);

  // The committed prefix the cache may pin: every canon row before this turn's own row. A turn with no row of its
  // own (a round, a forced turn) whose only new row is SHAPE's cue has a fully committed canon, so the cue is the
  // only volatile row and the pin is the last canon row before it.
  const stableCount = withTail.length - (input.appendUserTurn === null && delivery.tailUser !== null ? 0 : 1);
  const stable = stableRows(withTail, stableCount, injected);
  const historyStable = squashRunsFor(deliveredRows, merges).map((run) =>
    run.every((index) => {
      const origin = delivery.entries[index]?.origin;
      return origin !== null && origin !== undefined && stable[origin] === true;
    }),
  );
  const breakpoint = computeHistoryBreakpoint(
    history.map((row, index) => ({ role: row.role, stable: historyStable[index] === true })),
    stableCount >= 1,
  );

  // The content-free DELIVERED-row trace (`ShapeTrace.rows`) — order, role, voice, provenance, size, fold.
  const delivered = traceDeliveredRows({ injected, namedInput, delivery, history, merges });
  const marker = injected.find((row) => "newChatMarker" in row);

  return {
    history,
    cacheBreakpointFromEnd: breakpoint.offsetFromEnd,
    breakpointDecision: breakpoint.decision,
    newChatMarker: marker === undefined ? null : { content: marker.content, mergeSeparator: merges ? MERGE_SEPARATOR : null },
    stages: { multiCharacter, withTail, injected, squashed, named, delivered },
  };
}

/**
 * The wire authorName for a user/narrator row: the row's OWN stamped personaId resolved through the per-chat
 * producer, never the current active persona.
 *
 * THE NULL-STAMP GUARD. Returning `null` here makes `applyNamesBehavior` fall back to `speakers.user` — this
 * turn's `{{user}}`, which belongs to ONE human. A row with no persona stamp authored by SOMEBODY ELSE would
 * therefore reach the model wearing that human's name: the prompt half of INVITE-JOIN-NULL-PERSONA, where an
 * invite-joined member seated with `activePersonaId = NULL` had every line he wrote attributed to the host.
 * So a null-stamped row may borrow the turn's `{{user}}` ONLY when it is that same human's OWN row —
 * the server twin of the client's render rule (`client/features/chat/lib/attribution.ts`
 * `resolveUserAttribution`: the `authorUserId === viewerUserId` gate, "fail closed: name nobody rather than
 * name wrongly"). Everyone else gets {@link UNRESOLVED_USER_NAME}, the same word the reader sees on screen.
 *
 * Fail-closed on purpose: an UNKNOWN author or an unknown trigger (a drain/auto turn, a preview, any
 * hand-built ctx) takes the floor rather than the borrow. The one case that still borrows — the trigger's OWN
 * unstamped row — is unchanged from before this guard, and is byte-identical in a solo personaless chat where
 * `speakers.user` is already the "User" floor.
 */
function userRowAuthorName(
  row: { readonly personaId: PersonaId | null; readonly authorUserId: UserId | null },
  macroNames: HistoryMacroNames,
  triggerUserId: UserId | null,
): string | null {
  const stamped = row.personaId === null ? undefined : macroNames.personaNamesById.get(row.personaId);
  if (stamped !== undefined) {
    return stamped.name;
  }
  // No usable identity of its own (never stamped, or stamped with a since-deleted persona).
  const ownRow = row.authorUserId !== null && row.authorUserId === triggerUserId;
  return ownRow ? null : DEFAULT_PERSONA_NAME;
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

/** One ASSISTANT canon row → its wire row.
 *
 *  A NARRATOR row's inline `<speaker>NAME</speaker>` markers are kept in STORED canon (the renderer colors by
 *  them) but must not ride into the prompt as raw XML: it wastes tokens AND trains the model to parrot the
 *  syntax. They convert to the plain `NAME: ` attribution the transcript already speaks — the SAME form the
 *  name-stamp uses.
 *
 *  THE STRIP IS GATED ON THE DECLARED KIND (D129), not applied to every assistant row and left to be a no-op
 *  on the ones that carry no markers. Tag-ABSENCE is not the same claim as "this row is not narrator-voiced":
 *  a standard row whose author typed `<speaker>` into their own prose was silently re-written by an
 *  attribution transform that had no business reading it, and "is this a narrator row?" had three ad-hoc
 *  spellings (here, the client's `narratorVoiced` inference, memory's label fallback) that could disagree.
 *  One field read, one answer. Byte-identical for every real narrator row, which is the only row the strip
 *  was ever for. */
function assistantShapeRow(m: MessageView, ctx: AssembleContext, macroNames: HistoryMacroNames, nameById: ReadonlyMap<CharacterId, string>): CanonRow {
  const authorName = m.characterId !== null ? (nameById.get(m.characterId) ?? null) : null;
  const body = m.kind === "narrator" ? speakerTagsToPlain(m.content) : m.content;
  return {
    role: "assistant",
    content: renderHistoryMacros(body, { characterId: m.characterId, personaId: m.personaId }, ctx, {
      producer: macroNames,
      speakerCharName: authorName ?? undefined,
    }),
    characterId: m.characterId,
    authorName,
    messageId: m.id,
    kind: m.kind,
  };
}

/** One USER/narrator canon row → its wire row. `{{user}}`/`{{persona}}` resolve against the row's OWN stamped
 *  personaId; the NAME-stamp falls back only under {@link userRowAuthorName}'s null-stamp guard. */
function userShapeRow(m: MessageView, ctx: AssembleContext, macroNames: HistoryMacroNames): CanonRow {
  return {
    role: "user",
    content: renderHistoryMacros(m.content, { characterId: m.characterId, personaId: m.personaId }, ctx, { producer: macroNames }),
    authorName: userRowAuthorName(m, macroNames, ctx.triggerUserId ?? null),
    messageId: m.id,
    kind: m.kind,
  };
}

/**
 * THE PROMPT-POLICY DISPATCH (D129(G)) — does a row of this DECLARED purpose enter the assembled prompt at
 * all? Total over `MESSAGE_KIND_POLICY[kind].prompt` with an `assertNever` tail (spine §5.5), so a fourth kind
 * cannot build until it declares what the prompt does with it. Until this landed, `comment: {prompt:"never"}`
 * was a policy row nothing enforced — the record described a behavior no code performed.
 *
 *   • `conversation`   — an ordinary history row.
 *   • `system-channel` — delivered, assistant-voiced and byte-identically to `conversation`, on EVERY wire.
 *     The arm's NAME is now archaeology: it was minted for the D129(B) narrator→wire-`system` mapping, which
 *     `56a979d44` built on the measured vLLM cell and the OWNER RULED OUT on 2026-08-18 ("if you mean group
 *     chat narration mode then that is the wrong behavior" — group narration is the assistant's own output
 *     voice). The arm is kept, not folded into `conversation`, because the POLICY record still distinguishes
 *     the two purposes for the label policy and the trace; it has never meant "drop the row", which is why
 *     this is a policy read and not a truthiness test.
 *   • `never`          — not prompt material (an OOC `comment`): dropped.
 *
 * The `role === "system"` drop above is a SEPARATE, still-live gate on the ROLE plane, deliberately NOT folded
 * into this one. D32 keeps `system` the injection plane, but an ST import mints system-ROLE canon rows
 * (`kit/serde/chat::roleOf` — `is_system:true`), and those rows are `standard`-kind, so the purpose policy
 * would now admit them into a wire history whose `CanonRow.role` is a two-arm `user|assistant` union. Two
 * planes, two gates; collapsing them would ship ST's assembly-dropped rows into every prompt.
 */
function entersPrompt(kind: MessageKind): boolean {
  // The local is ANNOTATED rather than inferred: biome's type service cannot see through the cross-package
  // `Readonly<Record<MessageKind, …>>` index and narrows the switch subject to `never`, which makes it call
  // every arm below unreachable (`noUnnecessaryConditions`). tsc is fine either way; the annotation is what
  // keeps both readers agreeing, and it is the same shape the policy record declares.
  const policy: MessageKindPolicy["prompt"] = MESSAGE_KIND_POLICY[kind].prompt;
  switch (policy) {
    case "conversation":
    case "system-channel":
      return true;
    case "never":
      return false;
    default:
      return assertNeverPromptPolicy(policy);
  }
}

function assertNeverPromptPolicy(policy: never): never {
  throw new Error(`toShapeCanon: unhandled MESSAGE_KIND_POLICY prompt arm ${JSON.stringify(policy)}`);
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
  const characters = ctx.characters ?? [];
  const ids = ctx.characterIds ?? [];
  ids.forEach((id, i) => {
    const name = characters[i]?.name;
    if (id !== null && name !== undefined) {
      nameById.set(id, name);
    }
  });
  const coveredThroughSeq = compactionCoveredThroughSeq(ctx);
  const rows: CanonRow[] = canon
    .filter((m) => !(m.excludedFromPrompt || m.role === "system" || m.seq <= coveredThroughSeq) && entersPrompt(m.kind))
    .map((m) => (m.role === "assistant" ? assistantShapeRow(m, ctx, macroNames, nameById) : userShapeRow(m, ctx, macroNames)));
  // MACROS FIRST, THEN REGEX (D121-E): every row above resolved its own stamps through
  // `renderHistoryMacros`; the leg rewrites that resolved text and returns copies — `rows` itself is what
  // gets discarded, and the `messages` rows it was read from were never touched.
  return promptHistory === null ? rows : applyPromptHistoryRegex(rows, promptHistory);
}
