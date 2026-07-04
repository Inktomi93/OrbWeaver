// domain/chat/verbs/fork — `forkChat` (D27: a fork is a DEEP COPY into a NEW membership-scoped chat; the ONLY
// link is `chats.parentChatId`; NO shared rows). Per the auth matrix: a member may fork the
// source, and the FORKER becomes the new chat's HOST (a fork grants NO parent membership). Every copied row —
// the chat, each message SLOT + EVERY one of its variants (swipes), each persisted injection — gets a FRESH
// id, and the slot's `selectedVariantId` pointer is REMAPPED to the copied variant. The whole copy commits in
// ONE atomic `db.batch` (so a fork is all-or-nothing).
//
// WHAT IS COPIED vs RESET (D27 + the D16 participant chokepoint — reconciled):
//   • COPIED: the chat row's behavior (title/metadata/anchor/variables), the CHARACTER roster (the cast — so
//     the conversation can continue), the canon (messages + all variants up to `throughSeq`), the injections.
//   • RESET: `parentChatId` → the source; `forkedAt`/timestamps → now; `star`/`archived` → false; the HOST →
//     the FORKER (a fresh host participant). FLAG[fork-humans]: other HUMAN participants are NOT copied — D16
//     makes a `chat_participants` insert a chokepoint (invite/host-action only); auto-joining other humans to
//     a member's private fork would be a stray insert + a consent break. D27's literal "copy participants" is
//     read as the CAST (characters); the human side is the forker-as-host per the matrix. For a SOLO source
//     (forker == the lone host) this is byte-identical — copy-participants and forker-is-host coincide.
//   • compaction checkpoint (D25): copied only when `compactedAtSeq` is within the fork point (else reset to
//     null — a truncated fork must not carry a summary covering trimmed-away turns).

import type { ChatBusEvent, ParticipantView } from "@orb/contracts/chat";
import {
  DEFAULT_GROUP_CONFIG,
  DEFAULT_ROOM_OVERRIDES,
  variableDeltaSchema,
} from "@orb/contracts/chat";
import type { Db } from "@orb/db";
import { chatInjections, chatParticipants, chats, messages, messageVariants } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany, batchStmt } from "@orb/db/kit";
import type { CharacterId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
import { eq } from "drizzle-orm";
import type { ChatContext } from "../contract/context";
import { ChatNotFoundError } from "../contract/errors";
import type { ForkChatParams } from "../contract/params";
import type { ForkResult } from "../contract/results";
import type { ChatService } from "../contract/service";
import type { ChatDetail } from "../contract/views";
import { requireParticipant } from "../guard";
import {
  loadChatInjections,
  loadChatRow,
  loadMessageSlots,
  loadStoredVariables,
  loadVariantsByMessageIds,
} from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { foldChain } from "../substrate/runtime-variables";
import { canonMessageDelta, chatCreatedDelta, swipeVariantDelta } from "../substrate/stats-delta";

/** The collaborators not on `ChatContext` (the second factory arg — the invites.ts precedent). `emit` is the
 *  chat bus; `loadParticipantViews` resolves the roster read-model for the returned `ChatDetail` (the root
 *  resolves `users` publics OUTSIDE the domain `no-direct-users-read` scope — shared with read.ts/invites.ts). */
interface ForkDeps {
  readonly emit: (event: ChatBusEvent) => Promise<void>;
  readonly loadParticipantViews: (chatId: ChatId) => Promise<readonly ParticipantView[]>;
}

/** The fork slice of `ChatService` this grouped file owns (the bundle the root spreads in). */
type ForkVerbs = Pick<ChatService, "forkChat">;

/** A loaded source chat row (the inferred `loadChatRow` return) — named locally (the invites.ts precedent). */
type LoadedChatRow = NonNullable<Awaited<ReturnType<typeof loadChatRow>>>;

/** Map a loaded chat row + its resolved roster → `ChatDetail` (the metadata sub-blobs applied to defaults). */
function toChatDetail(chat: LoadedChatRow, participants: readonly ParticipantView[]): ChatDetail {
  return {
    id: chat.id,
    title: chat.title,
    star: chat.star,
    archived: chat.archived,
    parentChatId: chat.parentChatId,
    forkedAt: chat.forkedAt,
    anchorPersonaId: chat.anchorPersonaId,
    participants,
    group: chat.metadata.group ?? DEFAULT_GROUP_CONFIG,
    roomOverrides: chat.metadata.roomOverrides ?? DEFAULT_ROOM_OVERRIDES,
    opening: chat.metadata.opening ?? null,
    compactSummary: chat.compactSummary,
    compactedAtSeq: chat.compactedAtSeq,
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
  };
}

/** Build the D26 deep-copy statements (per slot: a fresh slot with a null pointer, then every variant, then
 *  the remapped `selectedVariantId` flip — FK-safe in that order). Pure given the loaded rows + ctx minters. */
function buildCanonCopy(
  ctx: ChatContext,
  args: {
    readonly newChatId: ChatId;
    readonly slots: (typeof messages.$inferSelect)[];
    readonly variants: (typeof messageVariants.$inferSelect)[];
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
      variantInserts.push(
        batchStmt(
          db.insert(messageVariants).values({ ...variant, id: newId, messageId: newMessageId }),
        ),
      );
    }
  }
  for (const slot of args.slots) {
    const newId = slotIdMap.get(slot.id);
    const newSelected =
      slot.selectedVariantId !== null ? variantIdMap.get(slot.selectedVariantId) : undefined;
    if (newId !== undefined && newSelected !== undefined) {
      pointerFlips.push(
        batchStmt(
          db.update(messages).set({ selectedVariantId: newSelected }).where(eq(messages.id, newId)),
        ),
      );
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
    chatCreatedDelta({ ownerId, characterId: args.primaryCharacterId, forked: true, now }),
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

/** `forkChat` — D27 deep copy. Gate membership (a member may fork), copy the chat + cast + canon + injections
 *  with fresh ids into a NEW chat where the forker is host, in ONE atomic batch. Emits `chatCreated`. */
function createForkChat(ctx: ChatContext, deps: ForkDeps): ChatService["forkChat"] {
  return async ({ principal, chatId, throughSeq, title }: ForkChatParams): Promise<ForkResult> => {
    const { chat: source } = await requireParticipant(ctx, principal, chatId);
    const now = ctx.now();
    const newChatId = ctx.newChatId();

    const [variables, slots, injections, roster] = await Promise.all([
      loadStoredVariables(ctx.db, chatId),
      loadMessageSlots(ctx.db, chatId, throughSeq),
      loadChatInjections(ctx.db, chatId),
      loadRoster(ctx.db, chatId),
    ]);
    const variants = await loadVariantsByMessageIds(
      ctx.db,
      slots.map((s) => s.id),
    );

    // The compaction checkpoint copies only when it is covered by the fork point (else a truncated fork would
    // claim a summary over trimmed turns — D25).
    const keepCheckpoint =
      source.compactedAtSeq !== null &&
      (throughSeq === undefined || source.compactedAtSeq <= throughSeq);

    // D46 runtime plane: the fork's runtime cache = the FOLD of the COPIED selected-variant chain (recomputed
    // from the possibly-TRUNCATED `slots` — a partial fork must not claim the source's full-chain cache). The
    // config picks copy via `variableValues` above; the runtime state re-derives here (derive-don't-stamp).
    const forkRuntimeCache = foldChain(
      slots.map((s) => {
        const selected = variants.find((v) => v.id === s.selectedVariantId);
        const parsed = variableDeltaSchema.safeParse(selected?.variableDelta);
        return { seq: s.seq, delta: parsed.success ? parsed.data : [] };
      }),
    );

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
      ...roster.flatMap((r) =>
        r.kind === "character" && r.characterId !== null
          ? [
              {
                id: ctx.newParticipantId(),
                chatId: newChatId,
                kind: "character" as const,
                characterId: r.characterId,
                role: "member" as const,
                talkativeness: r.talkativeness,
                disabled: r.disabled,
                joinedAt: now,
                joinSeq: 0,
              },
            ]
          : [],
      ),
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
          createdAt: now,
          updatedAt: now,
        }),
      ),
      batchStmt(ctx.db.insert(chatParticipants).values(participantRows)),
      ...buildCanonCopy(ctx, { newChatId, slots, variants }),
      ...injections.map((inj) =>
        batchStmt(
          ctx.db
            .insert(chatInjections)
            .values({ ...inj, id: ctx.newInjectionId(), chatId: newChatId }),
        ),
      ),
    ];

    // The canon-mutator stats push: a fork is a COPY — the rebuild counts the copied canon under
    // the new room, so the live path must too (chat-created + fork lineage + every copied slot's SELECTED
    // contribution + every copied swipe), all in the SAME creation batch. Owner = the fork's host (the
    // forker — D19; PD-21 confirmed: roster characters are host-owned, so this IS the character owner).
    pushForkStatsDeltas(ctx, stmts, {
      ownerId: principal.userId,
      primaryCharacterId:
        roster.find((r) => r.kind === "character" && r.characterId !== null)?.characterId ?? null,
      slots,
      variants,
      now,
    });

    await ctx.db.batch(batchMany(stmts));
    await deps.emit({ type: "chatCreated", chatId: newChatId });

    const forkRow = await loadChatRow(ctx.db, newChatId);
    if (forkRow === undefined) {
      throw new ChatNotFoundError(newChatId);
    }
    const participants = await deps.loadParticipantViews(newChatId);
    return { chat: toChatDetail(forkRow, participants) };
  };
}

/**
 * The fork verb BUNDLE (the grouped-file `create<File>` convention — `verb-naming` gate). The root spreads it
 * into the full service. `deps` carries the chat bus `emit` + the `loadParticipantViews` resolver (see the
 * header FLAG / the invites.ts precedent).
 */
export function createFork(ctx: ChatContext, deps: ForkDeps): ForkVerbs {
  return {
    forkChat: createForkChat(ctx, deps),
  };
}
