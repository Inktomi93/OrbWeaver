// domain/chat/verbs/fork — `forkChat`: a fork is a deep copy into a new membership-scoped chat; the only
// link is `chats.parentChatId`, no shared rows. FORK GATE: the HOST may fork any
// room, and a non-host may fork ONLY a solo room (they are the sole present human) — a non-host in a
// MULTI-HUMAN room is refused (the member→host laundering case). A host who wants a member to fork a
// multi-human room transfers the room via `acceptHostHandoff` first. The forker becomes the new chat's host
// (a fork grants no parent membership). Every copied row gets a fresh id, and the slot's `selectedVariantId`
// pointer is remapped to the copied variant. The whole copy commits in one atomic `db.batch`.
//
// THE ROW COPIES ARE ALLOW-LISTS, KEPT TOTAL BY `tsc`: `forkVariantValues`/`forkSlotValues` name
// every `message_variants` / `messages` column and return `Required<…$inferInsert>`, so a column added to
// either table is a MISSING PROPERTY and fails the build until its author classifies it. They replaced a
// `...row` spread minus a hand-maintained deny-list — a shape that defaults a NEW column to COPIED, which is
// backwards at a member→host trust boundary and had already let three columns through (`promptSnapshot`;
// `rawContent`/`macroFreezes`, added by the identity spine). The classification law
// lives on `forkVariantValues`: a column readable ONLY through a HOST-GATED surface does not survive the fork.
//
// Copied: the chat row's behavior (title/metadata/anchor/variables), the character roster the forker owns
// (an owner forking their own chat keeps all), the canon (whole, even a dropped character's prior lines),
// the injections. Reset: `parentChatId`/`forkedAt`/timestamps/`starred`/`archived`; the host becomes the
// forker. Other human participants are NOT copied (a fresh `chat_participants` insert is invite/host-action
// only). The compaction checkpoint copies only when covered by the fork point, else reset to null — and under
// a floor the variable delta LOG collapses the same way, into ONE synthetic baseline batch
// (`buildForkStandaloneDeltas`, D79 ruling #8).

import type { ChatMetadata, DurableChatBusEvent, ParticipantView, StandaloneVariableDelta } from "@orb/contracts/chat";
import { variableDeltaSchema } from "@orb/contracts/chat";
import type { Principal } from "@orb/contracts/identity";
import type { Db } from "@orb/db";
import { chatInjections, chatParticipants, chats, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt, isConstraintViolation } from "@orb/db/kit";
import { stripHiddenSpans } from "@orb/kit/content";
import type { CharacterId, ChatId, MessageId, MessageVariantId, PersonaId, UserId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { eq } from "drizzle-orm";
import { getLog } from "#foundation/observability";
import type { ChatContext } from "../context.ts";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors.ts";
import type { ForkChatParams } from "../contract/params.ts";
import type { ForkResult } from "../contract/results.ts";
import type { ChatService } from "../contract/service.ts";
import { requireParticipant } from "../guard.ts";
import { carriesAssetBackground, guardedChatId } from "../persistence/background-write.ts";
import { loadChatIdentityProducer } from "../persistence/identity.ts";
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import {
  loadChatInjections,
  loadChatRow,
  loadMessageSlots,
  loadStoredVariables,
  loadVariableDeltas,
  loadVariantsByMessageIds,
} from "../persistence/queries.ts";
import { NO_HISTORY_FLOOR, permitsHost } from "../substrate/auth/index.ts";
import { toChatDetail } from "../substrate/chat-detail.ts";
import { viewerReadsHidden } from "../substrate/member-visibility.ts";
import { foldChain } from "../substrate/runtime-variables.ts";
import { canonMessageDelta, chatCreatedDelta, seatChatDelta, swipeVariantDelta } from "../substrate/stats-delta.ts";

/** The collaborators not on `ChatContext`. `emit` is the chat bus; `loadParticipantViews` resolves the
 *  roster read-model for the returned `ChatDetail`. */
interface ForkDeps {
  readonly emit: (event: DurableChatBusEvent) => Promise<void>;
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
}

/** The fork slice of `ChatService` this grouped file owns. */
type ForkVerbs = Pick<ChatService, "forkChat">;

/** A present character roster row with its `characterId` narrowed non-null. */
type CharacterSeatRow = typeof chatParticipants.$inferSelect & {
  readonly characterId: CharacterId;
};

/** The per-forker copy verdict, resolved ONCE at the verb and threaded to every row projector.
 *  `stripHidden` = the forker is a NON-HOST of the SOURCE room (§3.6 — they never held the host plane);
 *  `stripReasoning` = that AND the source game is deception-active. Both `false` for a host forker. */
interface ForkCopyPosture {
  readonly stripHidden: boolean;
  readonly stripReasoning: boolean;
}

/** THE COPY IS AN ALLOW-LIST, AND `tsc` KEEPS IT TOTAL. This function names EVERY `message_variants` column and is typed
 *  `Required<…$inferInsert>`, so a column ADDED to the table is a MISSING PROPERTY here and fails `tsc` until
 *  its author classifies it. The predecessor spread `...variant` and then subtracted a hand-maintained list of
 *  host-plane fields; that shape defaults a NEW column to COPIED, which is exactly backwards at a
 *  member→host trust boundary — `promptSnapshot` had to be retro-fitted once, and
 *  `rawContent`/`macroFreezes` rode in unclassified the moment the identity spine added them.
 *
 *  THE CLASSIFICATION LAW (one line, so a future column is decidable without re-deriving §3.6): a column
 *  readable ONLY through a HOST-GATED surface does not survive the member→host fork. A non-host forker
 *  becomes HOST of the copy, so anything the source room withheld from them as a member must not be
 *  recoverable through the fork's own host reads. Everything a MEMBER could already read in the source room
 *  copies verbatim — the fork grants them nothing new.
 *
 *  The four classes below are the whole vocabulary: REMAPPED (fresh id / id-map pointer) · MEMBER-PROJECTED
 *  (body/reasoning prose the §3.6 strips transform) · HOST-PLANE (dropped for a non-host forker) · COPIED
 *  (already member-readable in the source room). */
function forkVariantValues(args: {
  readonly variant: typeof messageVariants.$inferSelect;
  readonly newId: MessageVariantId;
  readonly newMessageId: MessageId;
  readonly newBoundaryId: MessageId | null;
  readonly posture: ForkCopyPosture;
}): Required<typeof messageVariants.$inferInsert> {
  const { variant, posture } = args;
  // §3.6 strip for a non-host forker: the live `content` AND the continue-snapshot BODY twins
  // (`preContinueContent`/`lastContinuationContent`) all carry body prose — undo/revert on the fork would
  // otherwise reconstruct a lie's truth from the snapshot. `stripBody` is identity when nothing is hidden / the
  // field is null.
  const stripBody = (s: string | null): string | null => (posture.stripHidden && s !== null ? stripHiddenSpans(s).content : s);
  // P3 §3.6: on a DECEPTION-active source, a non-host forker also loses the REASONING channel (the live
  // `reasoning` + its continue-snapshot twins) — a deceptive model may spell a lie's truth in its thinking, and
  // the forker becomes HOST of the copy, so an unstripped reasoning twin would launder that leak past the
  // member→host transition. `nullReasoning` clears the field when the source game is deception-active.
  const nullReasoning = (s: string | null): string | null => (posture.stripReasoning ? null : s);
  // The HOST-PLANE arm of the member→host laundering boundary: `null` for a NON-HOST forker, verbatim for a
  // host (who already reads every byte). `stripHidden` is the whole verdict — a host is never floor-clamped
  // (`resolveHistoryFloorSeq` F2), so a clamped forker is necessarily a non-host and the one flag covers both
  // the hidden-span leak and the D16 pre-floor-history leak.
  const hostPlane = <T>(value: T): T | null => (posture.stripHidden ? null : value);
  return {
    // ── REMAPPED — identity + the cross-slot pointer ────────────────────────────────────────────────────
    id: args.newId,
    messageId: args.newMessageId,
    // The fit-pass boundary references another slot. Remapped by the caller through the same slotIdMap; a
    // boundary outside the copied range has no entry → null (never a stale cross-chat id).
    contextBoundaryMessageId: args.newBoundaryId,
    // ── MEMBER-PROJECTED — the prose channels the §3.6 strips transform for a non-host forker ───────────
    content: stripBody(variant.content) ?? variant.content,
    preContinueContent: stripBody(variant.preContinueContent),
    lastContinuationContent: stripBody(variant.lastContinuationContent),
    reasoning: nullReasoning(variant.reasoning),
    preContinueReasoning: nullReasoning(variant.preContinueReasoning),
    lastContinuationReasoning: nullReasoning(variant.lastContinuationReasoning),
    // The replayable reasoning BLOCKS carry the same thinking prose as `reasoning` (plus opaque signatures), so
    // they take the same P3 cut: a deception-active source hands a non-host forker none of them.
    reasoningParts: posture.stripReasoning ? null : variant.reasoningParts,
    // ── HOST-PLANE — served ONLY behind a host gate, so it must not cross the member→host transition ────
    // `promptSnapshot` is the `AssembledPrompt` the turn actually SENT: the wire projection rides hidden spans
    // VERBATIM (member-visibility.ts "WHO SEES WHAT"), so the blob re-materializes every `<lie>` truth the body
    // strip above just removed, AND it embeds the whole assembled history including slots below a clamped
    // member's D16 floor that the SLOT copy correctly withheld. `params` + `macroDraws` are its two
    // co-passengers on the SAME host-gated reader (`loadVariantWire` selects exactly these three;
    // `chat.getVariantWire` is `requireHost`): `params` is the initiator's per-send `UserIntent` (stop
    // sequences, `compaction.instructions` prose, the `advanced.claudeEnv` escape hatch) and `macroDraws` is
    // the turn's user-macro draw record over host-authored pools. None of the three has ANY member-gated
    // reader, so a member-turned-host forker reading them through the fork's own inspector is the leak.
    promptSnapshot: hostPlane(variant.promptSnapshot),
    params: hostPlane(variant.params),
    macroDraws: hostPlane(variant.macroDraws),
    // `rawContent` is the PRE-transform authored text and `macroFreezes` the volatile-macro values baked out of
    // it — both declared HOST-PLANE by their own contract (`schema/chat.ts`, `contracts/chat/messages.ts`:
    // served only on the host-gated variant wire view, never on `MessageView`). The receive transforms exist
    // partly to STRIP (a host regex can remove hidden material), so the raw is by definition PRE-strip bytes:
    // copying it forward hands a non-host forker exactly what the strip removed. LIVE, not dormant: the D129-F
    // writers landed in `c197ce01b` (the user send's pre-transform text, `turn.ts`; the volatile-macro freeze on
    // commit, `freezeVariantContentStatement`) and `16bb934a1` made every non-freeze content write CLEAR the
    // pair — so real rows carry these bytes and this strip is load-bearing on every member→host fork today.
    rawContent: hostPlane(variant.rawContent),
    macroFreezes: hostPlane(variant.macroFreezes),
    // ── COPIED — every column a MEMBER could already read in the source room (the fork grants nothing new) ─
    // Swipe position + the generation's identity/economics/diagnostics readout: `idx`, `model`, `provider`,
    // the token/cost/timing set, and the finish/stop/terminal reasons all ride the member-visible `MessageView`
    // (`generationId` too — the per-message cost key). `reasoningEffort`/`maxOutputTokens`/`apiErrorStatus` are
    // off-view but are scalar knobs/diagnostics that carry no authored prose.
    idx: variant.idx,
    model: variant.model,
    provider: variant.provider,
    // Attribution outlives the row it names (SET NULL) and reveals only WHICH of the generator's connections
    // wrote the swipe — an id, not a secret; it rides beside `provider`/`model` as the same readout.
    connectionId: variant.connectionId,
    reasoningEffort: variant.reasoningEffort,
    tokensIn: variant.tokensIn,
    tokensOut: variant.tokensOut,
    tokenProvenance: variant.tokenProvenance,
    cacheReadTokens: variant.cacheReadTokens,
    cacheWriteTokens: variant.cacheWriteTokens,
    // The reasoning-token count and the cost breakdown are economics figures beside `tokensOut`/`costUsd` — numbers,
    // no prose, the same member-readable readout (inference audit B5/B8).
    reasoningTokens: variant.reasoningTokens,
    costUsd: variant.costUsd,
    costProvenance: variant.costProvenance,
    costDetails: variant.costDetails,
    contextWindow: variant.contextWindow,
    maxOutputTokens: variant.maxOutputTokens,
    ttftMs: variant.ttftMs,
    finishReason: variant.finishReason,
    stopReason: variant.stopReason,
    terminalReason: variant.terminalReason,
    apiErrorStatus: variant.apiErrorStatus,
    genStartedAt: variant.genStartedAt,
    genFinishedAt: variant.genFinishedAt,
    generationId: variant.generationId,
    // `toolCalls` is on `MessageView` (the client's only tool read surface — members render the chips), so it
    // is member-plane by construction. `variableDelta` is the runtime-variable op-log whose folded state a
    // member already reads UNCLAMPED (`getVariables` is member-gated; the D79 ruling #8 baseline below leans on
    // exactly that), and the fork's own fold depends on it. `metadata` is a server-internal economics sidecar —
    // its ONLY reader is the stats delta's `reasoning_duration` (`substrate/stats-delta.ts`), it reaches no
    // caller-facing payload, and dropping it would desync the fork's stats REBUILD from its live delta.
    toolCalls: variant.toolCalls,
    variableDelta: variant.variableDelta,
    metadata: variant.metadata,
    createdAt: variant.createdAt,
  };
}

/** THE SLOT COPY, same allow-list discipline as {@link forkVariantValues} (`Required<…$inferInsert>` ⇒ a new
 *  `messages` column fails `tsc` until classified). Every column here is COPIED: `messages` is a PURE SLOT
 *  (D26 — identity + attribution + selection, zero content bytes), and each field is already member-readable
 *  on `MessageView` (`seq`/`role`/`kind`/the three attribution stamps/`excludedFromPrompt`/the timestamps) or
 *  is a slot-local turn-origin counter (`initiator`/`automationDepth`). The two exceptions are structural:
 *  `chatId` re-homes to the fork, and `selectedVariantId` is born null to break the message↔variant circular
 *  FK — the caller flips it to the copied variant after the variant inserts. */
function forkSlotValues(args: {
  readonly slot: typeof messages.$inferSelect;
  readonly newId: MessageId;
  readonly newChatId: ChatId;
}): Required<typeof messages.$inferInsert> {
  const { slot } = args;
  return {
    id: args.newId,
    chatId: args.newChatId,
    selectedVariantId: null,
    seq: slot.seq,
    role: slot.role,
    kind: slot.kind,
    authorUserId: slot.authorUserId,
    characterId: slot.characterId,
    personaId: slot.personaId,
    excludedFromPrompt: slot.excludedFromPrompt,
    initiator: slot.initiator,
    automationDepth: slot.automationDepth,
    createdAt: slot.createdAt,
    editedAt: slot.editedAt,
  };
}

/** Build the deep-copy statements (per slot: a fresh slot with a null pointer, then every variant, then
 *  the remapped `selectedVariantId` flip — FK-safe in that order). */
/** Copy ONE variant into the fork: fresh id, remapped slot + boundary pointers, and the §3.6 member→host
 *  projection ({@link forkVariantValues} owns the per-column classification). */
function copyVariantStmt(
  db: Db,
  args: {
    readonly variant: typeof messageVariants.$inferSelect;
    readonly newId: MessageVariantId;
    readonly newMessageId: MessageId;
    readonly slotIdMap: ReadonlyMap<MessageId, MessageId>;
    readonly posture: ForkCopyPosture;
  },
): BatchStmt {
  const { variant, newId, newMessageId, slotIdMap, posture } = args;
  const newBoundaryId = variant.contextBoundaryMessageId !== null ? (slotIdMap.get(variant.contextBoundaryMessageId) ?? null) : null;
  return batchStmt(db.insert(messageVariants).values(forkVariantValues({ variant, newId, newMessageId, newBoundaryId, posture })));
}

/** The canon copy's statements PLUS the id remaps it built — the maps are handed to `ChatRpgOps.forkGame` so
 *  rpg re-keys its snapshot/journal rows onto exactly the variants the fork copied (§3.2). Both maps only
 *  contain COPIED rows, so they already encode the fork horizon (a floor-clamped / throughSeq-truncated slot is
 *  absent → its rpg rows drop by construction). */
interface CanonCopy {
  readonly stmts: BatchStmt[];
  readonly slotIdMap: ReadonlyMap<MessageId, MessageId>;
  readonly variantIdMap: ReadonlyMap<MessageVariantId, MessageVariantId>;
}

function buildCanonCopy(
  ctx: ChatContext,
  args: {
    readonly newChatId: ChatId;
    readonly slots: (typeof messages.$inferSelect)[];
    readonly variants: (typeof messageVariants.$inferSelect)[];
    /** The §3.6 member→host copy verdict for this forker — `forkVariantValues` owns what each class means
     *  per column. `stripHidden` is set when the forker is a NON-HOST of the source: they never held the host
     *  plane there, so copying it forward would launder it past the transition (they become HOST of the copy).
     *  `stripReasoning` adds the P3 deception arm. Both `false` for a host forker (they already read it all). */
    readonly posture: ForkCopyPosture;
  },
): CanonCopy {
  const db: Db = ctx.db;
  const slotIdMap = new Map<MessageId, MessageId>();
  const variantIdMap = new Map<MessageVariantId, MessageVariantId>();
  const slotInserts: BatchStmt[] = [];
  const variantInserts: BatchStmt[] = [];
  const pointerFlips: BatchStmt[] = [];

  for (const slot of args.slots) {
    const newId = ctx.newMessageId();
    slotIdMap.set(slot.id, newId);
    slotInserts.push(batchStmt(db.insert(messages).values(forkSlotValues({ slot, newId, newChatId: args.newChatId }))));
  }
  for (const variant of args.variants) {
    const newId = ctx.newMessageVariantId();
    variantIdMap.set(variant.id, newId);
    const newMessageId = slotIdMap.get(variant.messageId);
    if (newMessageId !== undefined) {
      variantInserts.push(copyVariantStmt(db, { variant, newId, newMessageId, slotIdMap, posture: args.posture }));
    }
  }
  for (const slot of args.slots) {
    const newId = slotIdMap.get(slot.id);
    const newSelected = slot.selectedVariantId !== null ? variantIdMap.get(slot.selectedVariantId) : undefined;
    if (newId !== undefined && newSelected !== undefined) {
      pointerFlips.push(batchStmt(db.update(messages).set({ selectedVariantId: newSelected }).where(eq(messages.id, newId))));
    }
  }
  return { stmts: [...slotInserts, ...variantInserts, ...pointerFlips], slotIdMap, variantIdMap };
}

/** The fork's stats push (see the call-site note): chat-created/fork-lineage + every copied slot's
 *  SELECTED contribution + every copied swipe, each mirrored from the rebuild's folds. */
function pushForkStatsDeltas(
  ctx: ChatContext,
  stmts: BatchStmt[],
  args: {
    readonly ownerId: UserId;
    readonly characterIds: readonly CharacterId[];
    readonly slots: readonly (typeof messages.$inferSelect)[];
    readonly variants: readonly (typeof messageVariants.$inferSelect)[];
    readonly now: number;
  },
): void {
  const { ownerId, now } = args;
  ctx.applyStatsDelta(
    stmts,
    ctx.db,
    // newCharacter false by construction: a fork copies an existing room's seated characters, so the parent chat
    // already seats every character — a fork is never a character's first chat.
    chatCreatedDelta({
      ownerId,
      characterId: args.characterIds[0] ?? null,
      forked: true,
      newCharacter: false,
      now,
    }),
  );
  // The fork is a NEW ROOM FOR EVERY SEAT IT COPIES (#1147) — the rebuild credits the forked chat to each
  // of its character participants, so each kept seat past the first rides its own census bump. Owner-grain
  // `chats`/`forkedChats` stay on the head delta above: one new room, however wide its roster.
  for (const [idx, characterId] of args.characterIds.entries()) {
    if (idx > 0) {
      ctx.applyStatsDelta(stmts, ctx.db, seatChatDelta({ ownerId, characterId, forked: true, newCharacter: false, now }));
    }
  }
  const variantsByMessage = new Map<string, (typeof messageVariants.$inferSelect)[]>();
  for (const v of args.variants) {
    variantsByMessage.set(v.messageId, [...(variantsByMessage.get(v.messageId) ?? []), v]);
  }
  for (const slot of args.slots) {
    const own = variantsByMessage.get(slot.id) ?? [];
    const selected = own.find((v) => v.id === slot.selectedVariantId);
    if (selected !== undefined) {
      ctx.applyStatsDelta(
        stmts,
        ctx.db,
        canonMessageDelta({
          ownerId,
          row: {
            ...selected,
            characterId: slot.characterId,
            role: slot.role,
            createdAt: slot.createdAt,
            selectedIdx: selected.idx,
            variantCount: own.length,
          },
          sign: 1,
          now,
        }),
      );
    }
    for (const v of own) {
      if (v.id !== slot.selectedVariantId) {
        ctx.applyStatsDelta(
          stmts,
          ctx.db,
          swipeVariantDelta({
            ownerId,
            row: { ...v, characterId: slot.characterId, msgCreatedAt: slot.createdAt },
            sign: 1,
            now,
          }),
        );
      }
    }
  }
}

/** The character seats a forker owns — the seated characters a fork carries. A fork moves room authority to the
 *  forker, who becomes the sole `runAsUserId` under which every seated character's card resolves. Cards are
 *  single-owned, so a seat the forker doesn't own would collapse to a blank card — rather than refuse the
 *  fork, we drop those seats. An owner forking their own chat keeps the whole roster unchanged. */
async function resolveOwnedCharacterSeats(
  ctx: ChatContext,
  forkerUserId: UserId,
  sourceParticipants: readonly (typeof chatParticipants.$inferSelect)[],
): Promise<CharacterSeatRow[]> {
  const characterSeats = sourceParticipants.flatMap((p) => {
    const actor = classifyParticipant(p);
    return actor?.kind === "character" && p.leftSeq === null ? [{ ...p, characterId: actor.characterId }] : [];
  });
  const cards = await Promise.all(characterSeats.map((s) => ctx.getCard({ ownerId: forkerUserId, characterId: s.characterId })));
  return characterSeats.filter((_, i) => cards[i] !== null);
}

/** D79 ruling #8 — THE FORK'S VARIABLE CARRY. The runtime variable state is DERIVED by folding the seq-ordered
 *  delta chain (every slot's selected-variant `variable_delta` ∪ every standalone out-of-turn batch), so a fork
 *  that copies only `seq >= floor` slots must reconstitute the invisible PREFIX or its fold diverges from the
 *  room's real state at the fork point (F6a: a silent gameplay-state reset). Carrying the pre-floor batches
 *  VERBATIM instead is the other half of the defect (F6b): a batch value later overwritten is one the forker
 *  could never read, and it resurfaces in the room they now host once a copied-slot deletion triggers a refold.
 *
 *  The fix is the VARIABLES TWIN of the compaction checkpoint the fork already applies to prose: invisible
 *  history COLLAPSES into one visible present-state marker. Under a floor we emit ONE synthetic standalone
 *  batch — the FOLD of the whole source chain through the floor boundary, expressed as `set` ops and stamped at
 *  the floor — then carry only the standalone batches ABOVE it and let the copied (already-floored) slots
 *  contribute as today. Consequences, all three of the ruling's invariants: the fork's fold is byte-equal to the
 *  source's real state at the fork point; no pre-floor batch CONTENT survives (superseded values are folded
 *  away — what remains is the room state as the member walked in at their `joinSeq`, which their unclamped
 *  `getVariables` already reads); no pre-floor seq stamp survives.
 *
 *  BOUNDARY = the floor INCLUSIVE (deltas at `seq <= floor` fold into the baseline). Two reasons, one shape:
 *  ruling #1's interval algebra makes the row AT `joinSeq` the member's entry context, and the fold's stable
 *  seq-sort applies a standalone batch AFTER a message at the SAME seq — so a floor-EXCLUSIVE baseline stamped
 *  at the floor would clobber the copied floor row's own delta on every later refold. The floor row's delta is
 *  therefore inside the baseline AND on its copied slot; harmless by construction, because the baseline is an
 *  absolute `set` snapshot that lands after it, never a relative re-application.
 *
 *  DEVIATION FROM THE RULING'S LITERAL RECIPE (receipt): ruling #8 says to fold the source at
 *  `min(throughSeq, head)` — the state at the FORK POINT — and then still replay the above-floor deltas on top.
 *  `VarOp` is NOT idempotent (`inc`/`dec`/`add` — `@orb/kit/macro::applyVarOp`), so that composition
 *  double-counts every above-floor `inc`/`add` and breaks the ruling's own stated invariant ("byte-equal to the
 *  room's real state at the fork point"). The invariant wins over the recipe: the baseline is the fold through
 *  the FLOOR, which composes with the replayed above-floor deltas to exactly that state for every op kind.
 *
 *  An UNFLOORED forker (host, `full`, born-here) is unchanged: no baseline, every standalone batch within the
 *  fork horizon carries verbatim. A `throughSeq` BELOW the floor selects an empty visible slice — no canon, and
 *  therefore no variable state either (state as of a seq the forker may not read is exactly F6b). */
function buildForkStandaloneDeltas(args: {
  /** The source chat's WHOLE fold source (`loadVariableDeltas`): message deltas (`messageId` set) ∪ standalone
   *  batches (`messageId` null), message-before-standalone at equal seq — the order `foldChain` relies on. */
  readonly chain: readonly { readonly seq: number; readonly messageId: MessageId | null; readonly delta: readonly VarOp[] }[];
  readonly historyFloorSeq: number;
  readonly throughSeq: number | undefined;
}): StandaloneVariableDelta[] {
  const { chain, historyFloorSeq, throughSeq } = args;
  const inHorizon = (seq: number): boolean => throughSeq === undefined || seq <= throughSeq;
  const standalone = chain.filter((e) => e.messageId === null);
  // Standalone batches carry into the fork only up to the fork point — a truncated fork must not claim a delta
  // stamped past its horizon (mirrors the compaction-checkpoint gate) — and, under a floor, only ABOVE the
  // baseline that already folded everything at or below it.
  const carryAbove = (aboveSeq: number): StandaloneVariableDelta[] =>
    standalone.filter((e) => e.seq > aboveSeq && inHorizon(e.seq)).map((e) => ({ seq: e.seq, delta: [...e.delta] }));
  if (historyFloorSeq <= NO_HISTORY_FLOOR) {
    // Unfloored: nothing collapses. `messages.seq` is 1-based, so "above 0" is every batch.
    return carryAbove(NO_HISTORY_FLOOR);
  }
  if (!inHorizon(historyFloorSeq)) {
    return [];
  }
  const baselineFold = foldChain(chain.filter((e) => e.seq <= historyFloorSeq));
  const baseline: StandaloneVariableDelta[] =
    Object.keys(baselineFold).length === 0
      ? []
      : [{ seq: historyFloorSeq, delta: Object.entries(baselineFold).map(([key, value]) => ({ op: "set" as const, key, value })) }];
  return [...baseline, ...carryAbove(historyFloorSeq)];
}

/** `forkChat` — deep copy. Gate the fork (host, OR the sole present human), copy
 *  the chat + seated characters + canon + injections with fresh ids into a new chat where the forker is host, in one atomic
 *  batch. Emits `chatCreated`.
 *
 *  D16 join-history clamp: a fork COPIES canon into a room the forker HOSTS, so it is a read path with a
 *  permanent product — an unfloored copy would launder every pre-join row past the forker's own
 *  `joinHistoryVisibility` and hand them host authority over it. The copy floor is the forker's
 *  `historyFloorSeq` (`loadMessageSlots`), and the compaction checkpoint only rides along for an UNCLAMPED
 *  forker (the summary covers canon from seq 1, so a clamped forker would carry a distillation of exactly
 *  the rows the floor withheld). A host forker is unclamped; a solo non-host forker carries only their own
 *  floor-allowed rows — the clamp stays correct under the refined gate. */
/** P3 §3.6: does the fork copy strip the REASONING channel? Only when the forker is a NON-HOST of the source
 *  AND the source game is DECEPTION-ACTIVE (resolved via the injected rpg op; `false` for a non-game / a host
 *  forker / a non-deception chat — no regression). Hoisted to keep `createForkChat` under the complexity gate. */
async function resolveForkStripReasoning(ctx: ChatContext, chatId: ChatId, forkerReadsHidden: boolean): Promise<boolean> {
  if (forkerReadsHidden) {
    return false;
  }
  return (await ctx.rpg?.resolveReasoningHostOnly(chatId)) ?? false;
}

/** A fork is born a PLAIN chat: strip the rpg game pointer. `rpg_games` is a per-chat row keyed to the SOURCE
 *  chat, so a copied `metadata.rpg` would DANGLE on the fork (getGame(fork) → NOT_FOUND, which crashed the
 *  panel header). The rpg game (if any) is CLONED separately by `forkGameOntoFork` (which writes the fork's OWN
 *  valid pointer LAST); this strip keeps the COPIED-metadata pointer off the fork so the two reconcile. Every
 *  other metadata field carries. */
function forkMetadataWithoutGame(meta: ChatMetadata | null): ChatMetadata | null {
  if (meta === null || meta.rpg === undefined) {
    return meta;
  }
  const { rpg: _droppedGamePointer, ...rest } = meta;
  void _droppedGamePointer;
  return rest;
}

async function commitForkBatch(ctx: ChatContext, chatId: ChatId, metadata: ChatMetadata | null, stmts: readonly BatchStmt[]): Promise<void> {
  try {
    await ctx.db.batch(batchMany(stmts));
  } catch (err) {
    if (carriesAssetBackground(metadata) && isConstraintViolation(err)?.kind === "not-null") {
      const unavailable = new ChatOperationError(CHAT_OP_CODES.backgroundUnavailable, `chat ${chatId}: the background asset is no longer available`);
      unavailable.cause = err;
      throw unavailable;
    }
    throw err;
  }
}

/** FORK CLONES THE GAME (fork-clones-the-game §3.2): AFTER the chat's atomic fork batch commits, ask rpg to
 *  re-key its whole vertical onto the fork through the id maps `buildCanonCopy` built (they encode the fork
 *  horizon — floor-clamped + throughSeq-truncated). rpg writes the fork's OWN pointer LAST (crash-safe). A
 *  non-game source is a no-op (`cloned:false`) and the fork stays plain — reconciling with the metadata strip.
 *  A clone FAILURE is DEGRADED-not-broken: the fork already committed as a valid plain chat, so LOG and ship it
 *  plain rather than fail the whole fork (the stopgap posture — a plain fork never crashes; the W-G
 *  dangling-pointer heal covers any desync). Runs BEFORE the fork's read-back so the returned `ChatDetail`
 *  carries the fresh pointer. The clone still passes the forker's `readsHidden` posture so its host-secret
 *  strips (steeringNote / foreign gmPresetId / hidden-span tracker prose) stay wired as DEFENSE-IN-DEPTH —
 *  the verb gate already closes the multi-human member→host §3.6 laundering case (a non-host may fork only a
 *  solo room, which has no other human to launder to), so these strips are belt, retained against a future
 *  gate relaxation. */
async function forkGameOntoFork(
  ctx: ChatContext,
  args: {
    readonly sourceChatId: ChatId;
    readonly newChatId: ChatId;
    readonly canonCopy: CanonCopy;
    readonly forker: { readonly userId: UserId; readonly readsHidden: boolean };
  },
): Promise<void> {
  try {
    await ctx.rpg?.forkGame({
      sourceChatId: args.sourceChatId,
      newChatId: args.newChatId,
      slotIdMap: args.canonCopy.slotIdMap,
      variantIdMap: args.canonCopy.variantIdMap,
      forker: args.forker,
    });
  } catch (err) {
    getLog().warn(
      { event: "chat.fork.game_clone_failed", err, sourceChatId: args.sourceChatId, newChatId: args.newChatId },
      "chat: fork game-clone failed — the fork ships as a plain chat",
    );
  }
}

/** THE FORK GATE: the member→host secret-laundering risk exists ONLY when ANOTHER
 *  human could receive a laundered secret, so a fork is allowed when the caller is the HOST (role==="host",
 *  D19/D64 — a transferred-to NEW host qualifies, NOT first-join-seq) OR the SOLE present HUMAN in the room (a
 *  solo game/chat — nothing to launder; the sole remaining human forking their own room is always safe, even
 *  when the host left without a handoff). ONLY a non-host caller with ANOTHER present human member is refused —
 *  `ChatOperationError('not_host')`, a known-existence authority refusal (the caller IS a present member; the
 *  non-member case already threw the leak-free `ChatNotFoundError` at `requireParticipant`). Human = a
 *  `kind:"human"` present row (a seated character / agent is never a human recipient of a laundered secret).
 *
 *  The HOST half of the verdict routes through the ONE injected `can()` seam (`substrate/auth::permitsHost`,
 *  spine invariant #6) — never an inline `role === "host"`. The composite is still chat's own policy: the
 *  seam answers "is this caller the host?", this function decides what that means for a fork. */
function assertForkAllowed(args: {
  readonly can: ChatContext["can"];
  readonly principal: Principal;
  readonly role: (typeof chatParticipants.$inferSelect)["role"];
  readonly sourceParticipants: readonly (typeof chatParticipants.$inferSelect)[];
  readonly chatId: ChatId;
}): void {
  const { can, principal, role, sourceParticipants, chatId } = args;
  const presentHumanCount = sourceParticipants.filter((r) => classifyParticipant(r)?.kind === "human").length;
  if (!permitsHost(can, principal, role) && presentHumanCount > 1) {
    throw new ChatOperationError(CHAT_OP_CODES.notHost, `chat ${chatId}: only the host may fork a multi-human room`);
  }
}

/** The ANCHOR arm of the fork's single-owner rule (the host-handoff heal's twin): the
 *  fork's host is the FORKER, and the D51 `{{user}}` anchor is resolved under the host's principal
 *  (owner-scoped `persona.get`), so copying a foreign `anchorPersonaId` verbatim would mint a room born with a
 *  dead POV pin — `{{user}}` silently falls through to the active persona while the knob serves an id the new
 *  host can never inspect. Keep what the forker can read, null what they cannot (the `resolveOwnedCharacterSeats`
 *  shape). Personas are owner-sacred: this heals the POINTER, it never copies a persona. */
async function resolveForkAnchorPersonaId(ctx: ChatContext, forkerUserId: UserId, sourceAnchorPersonaId: PersonaId | null): Promise<PersonaId | null> {
  if (sourceAnchorPersonaId === null) {
    return null;
  }
  const owned = await ctx.verifyPersonaOwned({ ownerId: forkerUserId, personaId: sourceAnchorPersonaId });
  return owned ? sourceAnchorPersonaId : null;
}

function createForkChat(ctx: ChatContext, deps: ForkDeps): ChatService["forkChat"] {
  return async ({ principal, chatId, throughSeq, title }: ForkChatParams): Promise<ForkResult> => {
    // `requireParticipant` first — a non-member gets a leak-free `ChatNotFoundError` (never reveal existence);
    // then `assertForkAllowed` enforces the host-or-sole-human fork gate. The
    // member→host strips downstream are DEFENSE-IN-DEPTH: this gate closes the multi-human laundering case at
    // the source, and the solo arm has no OTHER human to launder to, so the strips are belt (safe if it relaxes).
    const membership = await requireParticipant(ctx, principal, chatId);
    const { chat: source, historyFloorSeq } = membership;
    const now = ctx.now();
    const newChatId = ctx.newChatId();

    // `loadVariableDeltas` is the ACTIVITY plane (seq-stamped variable ops, zero canon bytes — see the
    // `chat-viewer-plane-canon-reads` gate header), read UNFLOORED on purpose: the floored fork's baseline is a
    // fold of the whole chain, and folding is what strips the pre-floor history down to present state.
    const [variables, slots, injections, sourceParticipants, chainDeltas] = await Promise.all([
      loadStoredVariables(ctx.db, chatId),
      loadMessageSlots(ctx.db, chatId, throughSeq, historyFloorSeq),
      loadChatInjections(ctx.db, chatId),
      loadParticipants(ctx.db, chatId),
      loadVariableDeltas(ctx.db, chatId),
    ]);

    assertForkAllowed({ can: ctx.can, principal, role: membership.role, sourceParticipants, chatId });

    // §3.6 member-strip across the fork boundary (now DEFENSE-IN-DEPTH — the gate above closes the multi-human
    // member→host laundering case; the solo arm has no other human to launder to). The forker's SOURCE-room
    // role decides whether the copied bodies keep their hidden-class spans. A HOST forker copies verbatim; the
    // only forker reaching here who is NOT the host is a SOLO human (no other human present), whose strip is
    // harmless belt. Retained against a future gate relaxation.
    const forkerReadsHidden = viewerReadsHidden(membership);
    // P3 §3.6 (belt): on a DECEPTION-active source, a NON-HOST forker also loses the reasoning channel in the
    // copy — reachable now only for the solo non-host human arm (belt); a host forker keeps it. See
    // `resolveForkStripReasoning`.
    const stripReasoning = await resolveForkStripReasoning(ctx, chatId, forkerReadsHidden);
    // The fork's variable delta log: the fork-horizon standalone batches, prefixed under a floor by the ONE
    // synthetic present-state baseline that stands in for the invisible pre-floor history (D79 ruling #8 — see
    // `buildForkStandaloneDeltas` for the whole derivation).
    const forkStandaloneDeltas = buildForkStandaloneDeltas({ chain: chainDeltas, historyFloorSeq, throughSeq });
    // The fork carries only the character seats the forker owns. The canon is copied whole regardless,
    // so a dropped character's prior lines survive in the fork; only the live seat is gone.
    const keptCharacterSeats = await resolveOwnedCharacterSeats(ctx, principal.userId, sourceParticipants);
    const forkAnchorPersonaId = await resolveForkAnchorPersonaId(ctx, principal.userId, source.anchorPersonaId);
    const variants = await loadVariantsByMessageIds(
      ctx.db,
      slots.map((s) => s.id),
    );

    // The compaction checkpoint copies only when it is covered by the fork point (else a truncated fork
    // would claim a summary over trimmed turns) AND the forker is unclamped (a `from-join` forker's floor
    // withheld the very rows the summary distills — carrying it would re-expose them as prose).
    const keepCheckpoint =
      source.compactedAtSeq !== null && (throughSeq === undefined || source.compactedAtSeq <= throughSeq) && historyFloorSeq <= NO_HISTORY_FLOOR;

    // The fork's runtime cache is the fold of the copied selected-variant chain (recomputed from the
    // possibly-truncated `slots` — a partial fork must not claim the source's full-chain cache) ∪ the carried
    // standalone batches. `foldChain`'s sort is stable and `forkStandaloneDeltas` comes second, so a batch folds
    // AFTER a slot at the same seq — which is what lands the floored baseline over the floor row's own delta.
    const forkRuntimeCache = foldChain([
      ...slots.map((s) => {
        const selected = variants.find((v) => v.id === s.selectedVariantId);
        const parsed = variableDeltaSchema.safeParse(selected?.variableDelta);
        return { seq: s.seq, delta: parsed.success ? parsed.data : [] };
      }),
      ...forkStandaloneDeltas,
    ]);

    const forker = sourceParticipants.find((r) => r.userId === principal.userId);
    const participantRows: (typeof chatParticipants.$inferInsert)[] = [
      {
        id: ctx.newParticipantId(),
        chatId: newChatId,
        kind: "human",
        userId: principal.userId,
        role: "host",
        activePersonaId: forker?.activePersonaId ?? null,
        joinedAt: now,
        joinSeq: 0,
      },
      ...keptCharacterSeats.map((r) => ({
        id: ctx.newParticipantId(),
        chatId: newChatId,
        kind: "character" as const,
        characterId: r.characterId,
        role: "member" as const,
        talkativeness: r.talkativeness,
        disabled: r.disabled,
        joinedAt: now,
        joinSeq: 0,
      })),
    ];

    const canonCopy = buildCanonCopy(ctx, { newChatId, slots, variants, posture: { stripHidden: forkerReadsHidden === false, stripReasoning } });
    const forkMetadata = forkMetadataWithoutGame(source.metadata);
    const stmts: BatchStmt[] = [
      batchStmt(
        ctx.db.insert(chats).values({
          id: guardedChatId(ctx.db, newChatId, forkMetadata),
          title: title ?? source.title,
          parentChatId: chatId,
          forkedAt: now,
          // BORN CLAIMED (R0 §4.2): a fork arrives with the parent's canon already copied into it, so
          // there is no unstarted state for a husk to represent and the reaper must never see it.
          // `startChat` is the ONE mint that produces a husk. The fork's OWN creation stats fire here
          // in this batch (`pushForkStatsDeltas`), never at a claim — nothing is deferred for a fork.
          startedAt: now,
          anchorPersonaId: forkAnchorPersonaId,
          compactSummary: keepCheckpoint ? source.compactSummary : null,
          compactedAtSeq: keepCheckpoint ? source.compactedAtSeq : null,
          // DROP the rpg game pointer on a fork: `rpg_games` is a PER-CHAT row keyed to the SOURCE chat, so a
          // copied pointer would dangle (getGame(fork) → NOT_FOUND → the panel crashed). The fork is born a plain
          // chat HERE; the rpg game (if any) is CLONED below via `ctx.rpg?.forkGame`, which writes the fork's OWN
          // (valid) pointer LAST. So the copied-metadata strip stays correct AND the game clones — the two
          // reconcile: a plain-chat fork stays plain (forkGame → cloned:false), a game-chat fork gains a fresh
          // game + fresh pointer. Everything else in metadata carries.
          metadata: forkMetadata,
          variableValues: variables,
          runtimeVariables: Object.keys(forkRuntimeCache).length > 0 ? forkRuntimeCache : null,
          standaloneVariableDeltas: forkStandaloneDeltas.length > 0 ? forkStandaloneDeltas : null,
          createdAt: now,
          updatedAt: now,
        }),
      ),
      batchStmt(ctx.db.insert(chatParticipants).values(participantRows)),
      ...canonCopy.stmts,
      ...injections.map((inj) => batchStmt(ctx.db.insert(chatInjections).values({ ...inj, id: ctx.newInjectionId(), chatId: newChatId }))),
    ];

    // The rebuild counts the copied canon under the new room, so the live path must too. Owner = the
    // fork's host. The census counts EVERY kept (forker-owned) seated character; the first is the primary.
    pushForkStatsDeltas(ctx, stmts, {
      ownerId: principal.userId,
      characterIds: keptCharacterSeats.map((r) => r.characterId),
      slots,
      variants,
      now,
    });

    await commitForkBatch(ctx, chatId, forkMetadata, stmts);

    // FORK CLONES THE GAME (§3.2) — runs AFTER the atomic batch, BEFORE the read-back (so the returned
    // `ChatDetail` carries the fresh pointer). Degraded-not-broken on failure. See `forkGameOntoFork`.
    await forkGameOntoFork(ctx, { sourceChatId: chatId, newChatId, canonCopy, forker: { userId: principal.userId, readsHidden: forkerReadsHidden } });

    await deps.emit({ type: "chatCreated", chatId: newChatId });
    // Fan `chatsChanged` to the new room's present human members so their chat list gains the row.
    await ctx.emitChatChanged(newChatId, { detail: true });

    const forkRow = await loadChatRow(ctx.db, newChatId);
    if (forkRow === undefined) {
      throw new ChatNotFoundError(newChatId);
    }
    const participants = await deps.loadParticipantViews(newChatId);
    const identities = await loadChatIdentityProducer(ctx.db, { participants });
    return {
      chat: toChatDetail({
        chat: forkRow,
        participants,
        identities,
        viewerUserId: principal.userId,
        // The forker is the NEW room's born-here host (`joinSeq` 0) — unclamped in the fork, which already
        // carries only what their source-room floor allowed.
        viewerHistoryFloorSeq: NO_HISTORY_FLOOR,
      }),
    };
  };
}

/** The fork verb bundle. `deps` carries the chat bus `emit` + the `loadParticipantViews` resolver. */
export function createFork(ctx: ChatContext, deps: ForkDeps): ForkVerbs {
  return {
    forkChat: createForkChat(ctx, deps),
  };
}
