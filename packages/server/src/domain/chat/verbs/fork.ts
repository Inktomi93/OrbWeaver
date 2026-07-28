// domain/chat/verbs/fork — `forkChat`: a fork is a deep copy into a new membership-scoped chat; the only
// link is `chats.parentChatId`, no shared rows. A member may fork the source, and the forker becomes the
// new chat's host (a fork grants no parent membership). Every copied row gets a fresh id, and the slot's
// `selectedVariantId` pointer is remapped to the copied variant. The whole copy commits in one atomic
// `db.batch`.
//
// Copied: the chat row's behavior (title/metadata/anchor/variables), the character roster the forker owns
// (an owner forking their own chat keeps all), the canon (whole, even a dropped character's prior lines),
// the injections. Reset: `parentChatId`/`forkedAt`/timestamps/`star`/`archived`; the host becomes the
// forker. Other human participants are NOT copied (a fresh `chat_participants` insert is invite/host-action
// only). The compaction checkpoint copies only when covered by the fork point, else reset to null.

import type { ChatBusEvent, ParticipantView } from "@orb/contracts/chat";
import { variableDeltaSchema } from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatInjections, chatParticipants, chats, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import { stripHiddenSpans } from "@orb/kit/content";
import type { CharacterId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ChatContext } from "../context";
import { ChatNotFoundError } from "../contract/errors";
import type { ForkChatParams } from "../contract/params";
import type { ForkResult } from "../contract/results";
import type { ChatService } from "../contract/service";
import { requireParticipant } from "../guard";
import { loadChatMacroNameProducer } from "../persistence/macro-names";
import {
  loadChatInjections,
  loadChatRow,
  loadMessageSlots,
  loadStandaloneVariableDeltas,
  loadStoredVariables,
  loadVariantsByMessageIds,
} from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { loadCharacterAvatarProducer, loadPersonaAvatarProducer } from "../persistence/roster-avatars";
import { NO_HISTORY_FLOOR } from "../substrate/auth";
import { toChatDetail } from "../substrate/chat-detail";
import { viewerReadsHidden } from "../substrate/member-visibility";
import { foldChain } from "../substrate/runtime-variables";
import { canonMessageDelta, chatCreatedDelta, swipeVariantDelta } from "../substrate/stats-delta";

/** The collaborators not on `ChatContext`. `emit` is the chat bus; `loadParticipantViews` resolves the
 *  roster read-model for the returned `ChatDetail`. */
interface ForkDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
}

/** The fork slice of `ChatService` this grouped file owns. */
type ForkVerbs = Pick<ChatService, "forkChat">;

/** A present character roster row with its `characterId` narrowed non-null. */
type CharacterSeatRow = typeof chatParticipants.$inferSelect & {
  readonly characterId: CharacterId;
};

/** Build the deep-copy statements (per slot: a fresh slot with a null pointer, then every variant, then
 *  the remapped `selectedVariantId` flip — FK-safe in that order). */
/** Copy ONE variant into the fork: fresh id, remapped slot + boundary pointers, and (§3.6) a hidden-span
 *  strip when the forker is a non-host member of the source (identity when nothing is hidden). */
function copyVariantStmt(
  db: Db,
  args: {
    readonly variant: typeof messageVariants.$inferSelect;
    readonly newId: MessageVariantId;
    readonly newMessageId: MessageId;
    readonly slotIdMap: ReadonlyMap<MessageId, MessageId>;
    readonly stripHidden: boolean;
  },
): BatchStmt {
  const { variant, newId, newMessageId, slotIdMap, stripHidden } = args;
  // The fit-pass boundary references another slot (a cross-slot pointer). Remap it through the same slotIdMap;
  // a boundary outside the copied range has no entry → null (never a stale cross-chat id).
  const newBoundaryId = variant.contextBoundaryMessageId !== null ? (slotIdMap.get(variant.contextBoundaryMessageId) ?? null) : null;
  // §3.6 strip for a non-host forker: the live `content` AND the continue-snapshot BODY twins
  // (`preContinueContent`/`lastContinuationContent`) all carry body prose — undo/revert on the fork would
  // otherwise reconstruct a lie's truth from the snapshot. The `reasoning` twins are left alone (the deliberate
  // reasoning-channel exclusion). `stripBody` is identity when nothing is hidden / the field is null.
  const stripBody = (s: string | null): string | null => (stripHidden && s !== null ? stripHiddenSpans(s).content : s);
  return batchStmt(
    db.insert(messageVariants).values({
      ...variant,
      id: newId,
      messageId: newMessageId,
      content: stripBody(variant.content) ?? variant.content,
      preContinueContent: stripBody(variant.preContinueContent),
      lastContinuationContent: stripBody(variant.lastContinuationContent),
      contextBoundaryMessageId: newBoundaryId,
    }),
  );
}

function buildCanonCopy(
  ctx: ChatContext,
  args: {
    readonly newChatId: ChatId;
    readonly slots: (typeof messages.$inferSelect)[];
    readonly variants: (typeof messageVariants.$inferSelect)[];
    /** §3.6 member-strip across the fork boundary: a NON-HOST forker never had host-plane access to the
     *  source room's hidden-class spans, so the copied bodies must be stripped — else the forker (now HOST of
     *  the copy) would read the GM-plane secrets verbatim via the fork's host `listMessages`, laundering the
     *  member-strip through the member→host transition. A host forker copies verbatim (they already read it). */
    readonly stripHidden: boolean;
  },
): BatchStmt[] {
  const db: Db = ctx.db;
  const slotIdMap = new Map<MessageId, MessageId>();
  const variantIdMap = new Map<MessageVariantId, MessageVariantId>();
  const slotInserts: BatchStmt[] = [];
  const variantInserts: BatchStmt[] = [];
  const pointerFlips: BatchStmt[] = [];

  for (const slot of args.slots) {
    const newId = ctx.newMessageId();
    slotIdMap.set(slot.id, newId);
    slotInserts.push(
      batchStmt(
        db.insert(messages).values({
          ...slot,
          id: newId,
          chatId: args.newChatId,
          selectedVariantId: null,
        }),
      ),
    );
  }
  for (const variant of args.variants) {
    const newId = ctx.newMessageVariantId();
    variantIdMap.set(variant.id, newId);
    const newMessageId = slotIdMap.get(variant.messageId);
    if (newMessageId !== undefined) {
      variantInserts.push(copyVariantStmt(db, { variant, newId, newMessageId, slotIdMap, stripHidden: args.stripHidden }));
    }
  }
  for (const slot of args.slots) {
    const newId = slotIdMap.get(slot.id);
    const newSelected = slot.selectedVariantId !== null ? variantIdMap.get(slot.selectedVariantId) : undefined;
    if (newId !== undefined && newSelected !== undefined) {
      pointerFlips.push(batchStmt(db.update(messages).set({ selectedVariantId: newSelected }).where(eq(messages.id, newId))));
    }
  }
  return [...slotInserts, ...variantInserts, ...pointerFlips];
}

/** The fork's stats push (see the call-site note): chat-created/fork-lineage + every copied slot's
 *  SELECTED contribution + every copied swipe, each mirrored from the rebuild's folds. */
function pushForkStatsDeltas(
  ctx: ChatContext,
  stmts: BatchStmt[],
  args: {
    readonly ownerId: UserId;
    readonly primaryCharacterId: CharacterId | null;
    readonly slots: readonly (typeof messages.$inferSelect)[];
    readonly variants: readonly (typeof messageVariants.$inferSelect)[];
    readonly now: number;
  },
): void {
  const { ownerId, now } = args;
  ctx.applyStatsDelta(
    stmts,
    ctx.db,
    // newCharacter false by construction: a fork copies an existing room's cast, so the parent chat
    // already seats every character — a fork is never a character's first chat.
    chatCreatedDelta({
      ownerId,
      characterId: args.primaryCharacterId,
      forked: true,
      newCharacter: false,
      now,
    }),
  );
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

/** The character seats a forker owns — the cast seats a fork carries. A fork moves room authority to the
 *  forker, who becomes the sole `runAsUserId` under which every cast card resolves. Cards are
 *  single-owned, so a seat the forker doesn't own would collapse to a blank card — rather than refuse the
 *  fork, we drop those seats. An owner forking their own chat keeps the whole cast unchanged. */
async function resolveOwnedCharacterSeats(
  ctx: ChatContext,
  forkerUserId: UserId,
  roster: readonly (typeof chatParticipants.$inferSelect)[],
): Promise<CharacterSeatRow[]> {
  const characterSeats = roster.flatMap((p) =>
    p.kind === "character" && p.characterId !== null && p.leftSeq === null ? [{ ...p, characterId: p.characterId }] : [],
  );
  const cards = await Promise.all(characterSeats.map((s) => ctx.getCard({ ownerId: forkerUserId, characterId: s.characterId })));
  return characterSeats.filter((_, i) => cards[i] !== null);
}

/** `forkChat` — deep copy. Gate membership (a member may fork), copy the chat + cast + canon + injections
 *  with fresh ids into a new chat where the forker is host, in one atomic batch. Emits `chatCreated`.
 *
 *  D16 join-history clamp: a fork COPIES canon into a room the forker HOSTS, so it is a read path with a
 *  permanent product — an unfloored copy would launder every pre-join row past the forker's own
 *  `joinHistoryVisibility` and hand them host authority over it. The copy floor is the forker's
 *  `historyFloorSeq` (`loadMessageSlots`), and the compaction checkpoint only rides along for an UNCLAMPED
 *  forker (the summary covers canon from seq 1, so a clamped forker would carry a distillation of exactly
 *  the rows the floor withheld). `full` forkers are unaffected. */
function createForkChat(ctx: ChatContext, deps: ForkDeps): ChatService["forkChat"] {
  return async ({ principal, chatId, throughSeq, title }: ForkChatParams): Promise<ForkResult> => {
    const membership = await requireParticipant(ctx, principal, chatId);
    const { chat: source, historyFloorSeq } = membership;
    // §3.6 member-strip across the fork boundary — the forker's SOURCE-room role decides whether the copied
    // bodies keep their hidden-class spans. A non-host member never had host-plane access to the source's GM
    // secrets; the copy must not launder them past the member→host transition (they become the fork's host).
    const forkerReadsHidden = viewerReadsHidden(membership);
    const now = ctx.now();
    const newChatId = ctx.newChatId();

    const [variables, slots, injections, roster, standaloneDeltas] = await Promise.all([
      loadStoredVariables(ctx.db, chatId),
      loadMessageSlots(ctx.db, chatId, throughSeq, historyFloorSeq),
      loadChatInjections(ctx.db, chatId),
      loadRoster(ctx.db, chatId),
      loadStandaloneVariableDeltas(ctx.db, chatId),
    ]);
    // Standalone (out-of-turn) variable deltas carry into the fork only up to the fork point — a truncated
    // fork must not claim a delta stamped past its horizon (mirrors the compaction-checkpoint gate below).
    const forkStandaloneDeltas = standaloneDeltas.filter((s) => throughSeq === undefined || s.seq <= throughSeq);
    // The fork carries only the character seats the forker owns. The canon is copied whole regardless,
    // so a dropped character's prior lines survive in the fork; only the live seat is gone.
    const keptCharacterSeats = await resolveOwnedCharacterSeats(ctx, principal.userId, roster);
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
    // possibly-truncated `slots` — a partial fork must not claim the source's full-chain cache).
    const forkRuntimeCache = foldChain([
      ...slots.map((s) => {
        const selected = variants.find((v) => v.id === s.selectedVariantId);
        const parsed = variableDeltaSchema.safeParse(selected?.variableDelta);
        return { seq: s.seq, delta: parsed.success ? parsed.data : [] };
      }),
      ...forkStandaloneDeltas,
    ]);

    const forker = roster.find((r) => r.userId === principal.userId);
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

    const stmts: BatchStmt[] = [
      batchStmt(
        ctx.db.insert(chats).values({
          id: newChatId,
          title: title ?? source.title,
          parentChatId: chatId,
          forkedAt: now,
          anchorPersonaId: source.anchorPersonaId,
          compactSummary: keepCheckpoint ? source.compactSummary : null,
          compactedAtSeq: keepCheckpoint ? source.compactedAtSeq : null,
          metadata: source.metadata,
          variableValues: variables,
          runtimeVariables: Object.keys(forkRuntimeCache).length > 0 ? forkRuntimeCache : null,
          standaloneVariableDeltas: forkStandaloneDeltas.length > 0 ? forkStandaloneDeltas : null,
          createdAt: now,
          updatedAt: now,
        }),
      ),
      batchStmt(ctx.db.insert(chatParticipants).values(participantRows)),
      ...buildCanonCopy(ctx, { newChatId, slots, variants, stripHidden: forkerReadsHidden === false }),
      ...injections.map((inj) => batchStmt(ctx.db.insert(chatInjections).values({ ...inj, id: ctx.newInjectionId(), chatId: newChatId }))),
    ];

    // The rebuild counts the copied canon under the new room, so the live path must too. Owner = the
    // fork's host. primaryCharacterId is the first kept (forker-owned) cast seat.
    pushForkStatsDeltas(ctx, stmts, {
      ownerId: principal.userId,
      primaryCharacterId: keptCharacterSeats.at(0)?.characterId ?? null,
      slots,
      variants,
      now,
    });

    await ctx.db.batch(batchMany(stmts));
    await deps.emit({ type: "chatCreated", chatId: newChatId });
    // Fan `chatsChanged` to the new room's present human members so their chat list gains the row.
    await ctx.emitChatChanged(newChatId, { detail: true });

    const forkRow = await loadChatRow(ctx.db, newChatId);
    if (forkRow === undefined) {
      throw new ChatNotFoundError(newChatId);
    }
    const participants = await deps.loadParticipantViews(newChatId);
    const macroNames = await loadChatMacroNameProducer(ctx.db, { participants });
    const personaAvatars = await loadPersonaAvatarProducer(ctx.db, { participants });
    const characterAvatars = await loadCharacterAvatarProducer(ctx.db, { participants });
    return {
      chat: toChatDetail({
        chat: forkRow,
        participants,
        macroNames,
        personaAvatars,
        characterAvatars,
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
