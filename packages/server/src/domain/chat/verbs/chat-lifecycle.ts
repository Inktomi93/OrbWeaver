// domain/chat/verbs/chat-lifecycle — the chat-ROW lifecycle + variables + persisted injections (chat.md Part I
// 8-slot `verbs/chat-lifecycle.ts`; Part III §11 the auth matrix). The low-payload, non-canon mutations: the
// chat-row flags (title/star/archive/delete), the two-plane variables (D46 — this verb owns the config-plane
// chat-row/stored writes), and the `chat_injections` CRUD. Most emit the `chatUpdated` catch-all (the bus has
// no per-field member — FLAG below); `delete` emits `chatDeleted`.
//
// AUTHORITY (chat.md §11 / substrate/auth/matrix): title/star/archive/delete + injection WRITE/DELETE → `host`
// (shared room-row config / a room-wide prompt-injection is a one-shot jailbreak surface); variables (shared
// gameplay state) + injection LIST → `member`; `reapTemporaryChats` is per-user maintenance (non-chat-scoped).
//
// FLAG[no-row-event]: every chat-ROW change rides the `chatUpdated` catch-all ("low-payload chat-row changes:
// star/archive/title/variables/injections/compact" — the contract's own comment) — there is no dedicated
// `titleUpdated`/`starred`/`injectionChanged` member, so a client refetches the chat detail. A dedicated event
// would need a new `ChatBusEvent` member (chunk 1's allowlist — out of scope).
// FLAG[reap-no-schema]: `reapTemporaryChats` has NO schema backing — `chats` carries no `temporary`/`expiresAt`
// column (db/schema/chat.ts), so there are ZERO temporary chats to reap and the verb is an honest `{reaped:0}`
// no-op. It is NOT stubbed-away logic: with no temporary-chat concept in the schema there is nothing to sweep.
// A real reap needs a `chats.temporary` flag + a TTL/`expiresAt` column (a db-schema decision, out of this
// chunk) — STOP-and-flagged rather than inventing a column.
// FLAG[effective-variables]: `getVariables` (the EFFECTIVE next-turn variables) returns the config-plane stored
// values only. D46's runtime plane (per-variant `setvar`/`incvar` deltas folded over the selected chain) has
// NO schema home yet (`message_variants` carries no variable-delta column) and the preset ChoiceBlock defaults
// are not an injected op on `ChatContext` — so the effective fold collapses to the stored config plane for now.

import type { ChatBusEvent } from "@orb/contracts/chat";
import { chatInjections, chats } from "@orb/db";
import { and, eq } from "drizzle-orm";
import type { ChatContext } from "../contract/context";
import { ChatNotFoundError } from "../contract/errors";
import type {
  ArchiveChatParams,
  ClearVariablesParams,
  DeleteChatInjectionParams,
  DeleteChatParams,
  GetStoredVariablesParams,
  GetVariablesParams,
  ListChatInjectionsParams,
  ReapTemporaryChatsParams,
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

/** The emit op the lifecycle verbs close over (inlined — the `types-in-contract` note). */
type EmitChatEvent = (event: ChatBusEvent) => Promise<void>;

/** The collaborators not on `ChatContext` (the second factory arg — the roster.ts precedent). */
interface ChatLifecycleDeps {
  readonly emit: EmitChatEvent;
}

/** The lifecycle slice of `ChatService` this grouped file owns (the bundle the root spreads in). */
type ChatLifecycleVerbs = Pick<
  ChatService,
  | "updateTitle"
  | "star"
  | "archive"
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

// ── chat-row flags (host-only — title / star / archive) ──────────────────────────────────────────────────────
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

// ── delete (host-only — cascades messages/roster/invites/injections/events) ──────────────────────────────────
/** `delete` — host-only. Drop the chat row; every child CASCADEs (FK). Emits `chatDeleted`. */
function createDelete(ctx: ChatContext, emit: EmitChatEvent): ChatService["delete"] {
  return async ({ principal, chatId }: DeleteChatParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    await ctx.db.delete(chats).where(eq(chats.id, chatId));
    await emit({ type: "chatDeleted", chatId });
  };
}

// ── reapTemporaryChats (non-chat-scoped — see FLAG[reap-no-schema]) ──────────────────────────────────────────
/** `reapTemporaryChats` — an honest no-op until the schema models temporary chats (file header FLAG). */
function createReapTemporaryChats(): ChatService["reapTemporaryChats"] {
  return (_params: ReapTemporaryChatsParams): Promise<ReapResult> => Promise.resolve({ reaped: 0 });
}

// ── variables (the D46 two-plane config writes — member) ─────────────────────────────────────────────────────
/** `getVariables` — member. The EFFECTIVE next-turn variables (the config plane — FLAG[effective-variables]). */
function createGetVariables(ctx: ChatContext): ChatService["getVariables"] {
  return async ({ principal, chatId }: GetVariablesParams): Promise<VariablesResult> => {
    await requireParticipant(ctx, principal, chatId);
    return (await loadStoredVariables(ctx.db, chatId)) ?? {};
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
    await ctx.db
      .update(chats)
      .set({ variableValues: values, updatedAt: ctx.now() })
      .where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** `clearVariables` — member. Null the persisted variable flush. Emits `chatUpdated`. */
function createClearVariables(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["clearVariables"] {
  return async ({ principal, chatId }: ClearVariablesParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    await ctx.db
      .update(chats)
      .set({ variableValues: null, updatedAt: ctx.now() })
      .where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
  };
}

// ── injections (positional `chat_injections` CRUD — write/delete host, list member) ──────────────────────────
/** `setChatInjection` — host-only. `id` set ⇒ UPDATE the existing row (scoped to chatId — a foreign/unknown id
 *  is a leak-free NOT_FOUND); absent ⇒ INSERT a fresh row. Emits `chatUpdated`; returns the resolved view. */
function createSetChatInjection(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["setChatInjection"] {
  return async ({
    principal,
    chatId,
    id,
    position,
    depth,
    role,
    content,
    order,
  }: SetChatInjectionParams): Promise<ChatInjectionView> => {
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
function createDeleteChatInjection(
  ctx: ChatContext,
  emit: EmitChatEvent,
): ChatService["deleteChatInjection"] {
  return async ({ principal, chatId, injectionId }: DeleteChatInjectionParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    await ctx.db
      .delete(chatInjections)
      .where(and(eq(chatInjections.id, injectionId), eq(chatInjections.chatId, chatId)));
    await emit({ type: "chatUpdated", chatId });
  };
}

/**
 * The chat-lifecycle verb BUNDLE (the grouped-file `create<File>` convention — `verb-naming` gate). The root
 * spreads it into the full service. `deps` carries the chat bus `emit` (chat's own collaborator — see bus.ts).
 */
export function createChatLifecycle(ctx: ChatContext, deps: ChatLifecycleDeps): ChatLifecycleVerbs {
  const { emit } = deps;
  return {
    updateTitle: createUpdateTitle(ctx, emit),
    star: createStar(ctx, emit),
    archive: createArchive(ctx, emit),
    delete: createDelete(ctx, emit),
    reapTemporaryChats: createReapTemporaryChats(),
    getVariables: createGetVariables(ctx),
    getStoredVariables: createGetStoredVariables(ctx),
    setVariables: createSetVariables(ctx, emit),
    clearVariables: createClearVariables(ctx, emit),
    setChatInjection: createSetChatInjection(ctx, emit),
    listChatInjections: createListChatInjections(ctx),
    deleteChatInjection: createDeleteChatInjection(ctx, emit),
  };
}
