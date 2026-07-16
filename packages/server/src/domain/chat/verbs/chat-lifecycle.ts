// domain/chat/verbs/chat-lifecycle — the chat-row lifecycle + variables + persisted injections. The
// low-payload, non-canon mutations: chat-row flags (title/star/archive/delete), the two-plane variables,
// and the `chat_injections` CRUD. Most emit the `chatUpdated` catch-all; `delete` emits `chatDeleted`.
//
// Authority: title/star/archive/delete + injection write/delete → host; variables + injection list →
// member; `reapTemporaryChats` is per-user maintenance (non-chat-scoped).
//
// Every chat-row change rides the `chatUpdated` catch-all — there is no dedicated
// `titleUpdated`/`starred`/`injectionChanged` member, so a client refetches the chat detail.
// `reapTemporaryChats` sweeps the caller's expired temporary chats, scoped to chats the caller hosts.
// Bulk delete rides the same FK cascade as `delete`; deliberately no bus event.
// `getVariables` returns the effective config-plane view: stored ChoiceBlock picks merged over the active
// preset's declared defaults, with `withRandomPick: false` so the read is stable.

import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatInjections, chatParticipants, chats } from "@orb/db";
import { and, eq, exists, isNull, lt } from "drizzle-orm";
import type { ChatContext } from "../context";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors";
import type {
  ArchiveChatParams,
  ClearVariablesParams,
  DeleteChatInjectionParams,
  DeleteChatParams,
  GetStoredVariablesParams,
  GetVariablesParams,
  ListChatInjectionsParams,
  ReapTemporaryChatsParams,
  SetChatAnchorPersonaParams,
  SetChatInjectionParams,
  SetVariablesParams,
  StarChatParams,
  UpdateTitleParams,
} from "../contract/params";
import type { ReapResult, VariablesResult } from "../contract/results";
import type { ChatService } from "../contract/service";
import type { ChatInjectionView } from "../contract/views";
import { requireHost, requireParticipant } from "../guard";
import { loadChatInjections, loadStoredVariables } from "../persistence/queries";
import { loadRoster } from "../persistence/roster";
import { resolveChoiceVariables } from "../substrate/variables";

/** The emit op the lifecycle verbs close over. */
type EmitChatEvent = (event: ChatBusEvent) => Promise<void>;

/** The collaborators not on `ChatContext`. */
interface ChatLifecycleDeps {
  readonly emit: EmitChatEvent;
}

/** The lifecycle slice of `ChatService` this grouped file owns. */
type ChatLifecycleVerbs = Pick<
  ChatService,
  | "updateTitle"
  | "star"
  | "archive"
  | "setChatAnchorPersona"
  | "delete"
  | "reapTemporaryChats"
  | "getVariables"
  | "getStoredVariables"
  | "setVariables"
  | "clearVariables"
  | "setChatInjection"
  | "listChatInjections"
  | "deleteChatInjection"
>;

/** Map a persisted `chat_injections` row → the `ChatInjectionView` wire shape (`order` omitted when null). */
function toInjectionView(row: typeof chatInjections.$inferSelect): ChatInjectionView {
  return {
    id: row.id,
    position: row.position,
    depth: row.depth,
    role: row.role,
    content: row.content,
    ...(row.order !== null ? { order: row.order } : {}),
  };
}

/** Host-only single-column chat-row write + the `chatUpdated` catch-all (the shared title/star/archive body). */
async function hostRowUpdate(
  ctx: ChatContext,
  emit: EmitChatEvent,
  args: {
    readonly principal: UpdateTitleParams["principal"];
    readonly chatId: UpdateTitleParams["chatId"];
    readonly patch: Partial<typeof chats.$inferInsert>;
  },
): Promise<void> {
  await requireHost(ctx, args.principal, args.chatId);
  await ctx.db
    .update(chats)
    .set({ ...args.patch, updatedAt: ctx.now() })
    .where(eq(chats.id, args.chatId));
  await emit({ type: "chatUpdated", chatId: args.chatId });
  // Fan `chatsChanged` to every present human member's device (the per-chat event above only reaches
  // subscribers of the open chat).
  await ctx.emitChatChanged(args.chatId, { detail: true });
}

/** `updateTitle` — host-only. */
function createUpdateTitle(ctx: ChatContext, emit: EmitChatEvent): ChatService["updateTitle"] {
  return async ({ principal, chatId, title }: UpdateTitleParams): Promise<void> => {
    await hostRowUpdate(ctx, emit, { principal, chatId, patch: { title } });
  };
}

/** `star` — host-only (a room-level flag — see the matrix FLAG). */
function createStar(ctx: ChatContext, emit: EmitChatEvent): ChatService["star"] {
  return async ({ principal, chatId, star }: StarChatParams): Promise<void> => {
    await hostRowUpdate(ctx, emit, { principal, chatId, patch: { star } });
  };
}

/** `archive` — host-only (archiving removes the room from every member's active list). */
function createArchive(ctx: ChatContext, emit: EmitChatEvent): ChatService["archive"] {
  return async ({ principal, chatId, archived }: ArchiveChatParams): Promise<void> => {
    await hostRowUpdate(ctx, emit, { principal, chatId, patch: { archived } });
  };
}

/** `setChatAnchorPersona` — host-only manual re-pin of the anchor. `personaId: null` clears the pin. A
 *  non-null target must be owned by a present human participant of this room — checked via
 *  `ctx.verifyPersonaOwned` against each present human's `userId`. */
function createSetChatAnchorPersona(ctx: ChatContext, emit: EmitChatEvent): ChatService["setChatAnchorPersona"] {
  return async ({ principal, chatId, personaId }: SetChatAnchorPersonaParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    if (personaId !== null) {
      const roster = await loadRoster(ctx.db, chatId);
      const presentHumanIds = [...new Set(roster.flatMap((r) => (r.kind === "human" && r.userId !== null ? [r.userId] : [])))];
      const ownership = await Promise.all(presentHumanIds.map((ownerId) => ctx.verifyPersonaOwned({ ownerId, personaId })));
      if (!ownership.some((owned) => owned)) {
        throw new ChatOperationError(CHAT_OP_CODES.notPersonaOwner, `chat ${chatId}: the anchor persona must be owned by a present human participant`);
      }
    }
    await ctx.db.update(chats).set({ anchorPersonaId: personaId, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** `delete` — host-only. Drop the chat row; every child cascades (FK). Emits `chatDeleted` + writes the
 *  best-effort audit row after the delete lands. */
function createDelete(ctx: ChatContext, emit: EmitChatEvent): ChatService["delete"] {
  return async ({ principal, chatId }: DeleteChatParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    // Enumerate present human members before the FK cascade drops the roster — each must have the
    // deleted chat drop from their live list, so they ride `extraUserIds`.
    const roster = await loadRoster(ctx.db, chatId);
    const members = [...new Set(roster.flatMap((r) => (r.kind === "human" && r.userId !== null ? [r.userId] : [])))];
    await ctx.db.delete(chats).where(eq(chats.id, chatId));
    await emit({ type: "chatDeleted", chatId });
    await ctx.emitChatChanged(chatId, { detail: true, extraUserIds: members });
    await ctx.audit(
      {
        actorUserId: principal.userId,
        action: "chat.delete",
        entityType: "chat",
        entityId: chatId,
      },
      ctx.now(),
    );
  };
}

// How long a temporary chat lives before it is reap-eligible — 24h.
const TEMPORARY_CHAT_REAP_TTL_MS = 86_400_000;

/** `reapTemporaryChats` — bulk-delete the caller's expired temporary chats (temporary + past the TTL +
 *  caller is the present host). Children cascade (FK); no bus event. Returns the count. */
function createReapTemporaryChats(ctx: ChatContext): ChatService["reapTemporaryChats"] {
  return async ({ principal }: ReapTemporaryChatsParams): Promise<ReapResult> => {
    const cutoff = ctx.now() - TEMPORARY_CHAT_REAP_TTL_MS;
    const removed = await ctx.db
      .delete(chats)
      .where(
        and(
          eq(chats.temporary, true),
          lt(chats.createdAt, cutoff),
          exists(
            ctx.db
              .select({ id: chatParticipants.id })
              .from(chatParticipants)
              .where(
                and(
                  eq(chatParticipants.chatId, chats.id),
                  eq(chatParticipants.userId, principal.userId),
                  eq(chatParticipants.role, "host"),
                  isNull(chatParticipants.leftSeq),
                ),
              ),
          ),
        ),
      )
      .returning({ id: chats.id });
    return { reaped: removed.length };
  };
}

/** `getVariables` — member. The effective config-plane view: the stored ChoiceBlock picks merged over the
 *  active preset's declared defaults, `withRandomPick: false` for a stable read. */
function createGetVariables(ctx: ChatContext): ChatService["getVariables"] {
  return async ({ principal, chatId }: GetVariablesParams): Promise<VariablesResult> => {
    await requireParticipant(ctx, principal, chatId);
    const [stored, specs] = await Promise.all([loadStoredVariables(ctx.db, chatId), ctx.resolvePromptVariables(chatId)]);
    // withRandomPick:false ⇒ prng is never invoked; a no-op stub keeps the eval path off ambient entropy.
    return resolveChoiceVariables(specs, stored ?? {}, () => 0, { withRandomPick: false });
  };
}

/** `getStoredVariables` — member. The persisted `chats.variableValues` flush. */
function createGetStoredVariables(ctx: ChatContext): ChatService["getStoredVariables"] {
  return async ({ principal, chatId }: GetStoredVariablesParams): Promise<VariablesResult> => {
    await requireParticipant(ctx, principal, chatId);
    return (await loadStoredVariables(ctx.db, chatId)) ?? {};
  };
}

/** `setVariables` — member. Flush the `{{var}}`→value map to `chats.variableValues`. Emits `chatUpdated`. */
function createSetVariables(ctx: ChatContext, emit: EmitChatEvent): ChatService["setVariables"] {
  return async ({ principal, chatId, values }: SetVariablesParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    await ctx.db.update(chats).set({ variableValues: values, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** `clearVariables` — member. Null the persisted variable flush. Emits `chatUpdated`. */
function createClearVariables(ctx: ChatContext, emit: EmitChatEvent): ChatService["clearVariables"] {
  return async ({ principal, chatId }: ClearVariablesParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    await ctx.db.update(chats).set({ variableValues: null, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** `setChatInjection` — host-only. `id` set ⇒ update the existing row (scoped to chatId — a foreign/unknown
 *  id is a leak-free NOT_FOUND); absent ⇒ insert a fresh row. Emits `chatUpdated`; returns the resolved view. */
function createSetChatInjection(ctx: ChatContext, emit: EmitChatEvent): ChatService["setChatInjection"] {
  return async ({ principal, chatId, id, position, depth, role, content, order }: SetChatInjectionParams): Promise<ChatInjectionView> => {
    await requireHost(ctx, principal, chatId);
    const at = ctx.now();
    let injectionId = id;
    if (id !== undefined) {
      const rows = await ctx.db
        .update(chatInjections)
        .set({ position, depth, role, content, order: order ?? null })
        .where(and(eq(chatInjections.id, id), eq(chatInjections.chatId, chatId)))
        .returning({ id: chatInjections.id });
      if (rows.at(0) === undefined) {
        throw new ChatNotFoundError(chatId);
      }
    } else {
      injectionId = ctx.newInjectionId();
      await ctx.db.insert(chatInjections).values({
        id: injectionId,
        chatId,
        position,
        depth,
        role,
        content,
        order: order ?? null,
        createdAt: at,
      });
    }
    await emit({ type: "chatUpdated", chatId });
    if (injectionId === undefined) {
      throw new ChatNotFoundError(chatId);
    }
    return {
      id: injectionId,
      position,
      depth,
      role,
      content,
      ...(order !== undefined ? { order } : {}),
    };
  };
}

/** `listChatInjections` — member. The persisted positional injections, splice-ordered. */
function createListChatInjections(ctx: ChatContext): ChatService["listChatInjections"] {
  return async ({ principal, chatId }: ListChatInjectionsParams): Promise<ChatInjectionView[]> => {
    await requireParticipant(ctx, principal, chatId);
    const rows = await loadChatInjections(ctx.db, chatId);
    return rows.map(toInjectionView);
  };
}

/** `deleteChatInjection` — host-only. Drop one positional injection (scoped to chatId; idempotent). Emits
 *  `chatUpdated`. */
function createDeleteChatInjection(ctx: ChatContext, emit: EmitChatEvent): ChatService["deleteChatInjection"] {
  return async ({ principal, chatId, injectionId }: DeleteChatInjectionParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    await ctx.db.delete(chatInjections).where(and(eq(chatInjections.id, injectionId), eq(chatInjections.chatId, chatId)));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** The chat-lifecycle verb bundle. `deps` carries the chat bus `emit`. */
export function createChatLifecycle(ctx: ChatContext, deps: ChatLifecycleDeps): ChatLifecycleVerbs {
  const { emit } = deps;
  return {
    updateTitle: createUpdateTitle(ctx, emit),
    star: createStar(ctx, emit),
    archive: createArchive(ctx, emit),
    setChatAnchorPersona: createSetChatAnchorPersona(ctx, emit),
    delete: createDelete(ctx, emit),
    reapTemporaryChats: createReapTemporaryChats(ctx),
    getVariables: createGetVariables(ctx),
    getStoredVariables: createGetStoredVariables(ctx),
    setVariables: createSetVariables(ctx, emit),
    clearVariables: createClearVariables(ctx, emit),
    setChatInjection: createSetChatInjection(ctx, emit),
    listChatInjections: createListChatInjections(ctx),
    deleteChatInjection: createDeleteChatInjection(ctx, emit),
  };
}
