// domain/chat/verbs/chat-lifecycle — the chat-row lifecycle + variables + persisted injections. The
// low-payload, non-canon mutations: chat-row flags (title/star/archive/delete), the two-plane variables,
// and the `chat_injections` CRUD. Most emit the `chatUpdated` catch-all; `delete` emits `chatDeleted`.
//
// Authority: title/star/archive/delete + injection write/delete → host; variables + injection list →
// member; `reapTemporaryChats` is per-user maintenance (non-chat-scoped); `reapHusk` is host-only.
//
// HUSKS (R0 §4.2/§4.6). Every WRITE here CLAIMS the room first (`deps.claimChat`, before the write — the
// ordering invariant in `verbs/claim-chat.ts`): configuring a room is "doing something with it" (F4(a)), so a
// room the user titled/starred/tuned is no longer an abandonable husk. The three verbs that do NOT claim are
// the three that remove the row — `delete`, `reapHusk`, `reapTemporaryChats`.
// This file owns BOTH reap arms (§4.6): `reapHusk` is the best-effort nav-away drop (host-only, and the
// SERVER re-checks `started_at IS NULL` — the client's "it's a husk" is never trusted), and the TTL belt
// inside `reapTemporaryChats` is what catches the crash / tab-kill / never-came-back cases a web client
// cannot signal. Both emit `chatDeleted` per reaped room — see the reaper's own note for why that
// deliberately diverges from the temporary sweep's historical silence.
//
// Every chat-row change rides the `chatUpdated` catch-all — there is no dedicated
// `titleUpdated`/`starred`/`injectionChanged` member, so a client refetches the chat detail.
// `reapTemporaryChats` sweeps the caller's expired temporary chats AND expired husks, scoped to chats the
// caller hosts. Bulk delete rides the same FK cascade as `delete`.
// `getVariables` returns the effective config-plane view: stored ChoiceBlock picks merged over the active
// preset's declared defaults, with `withRandomPick: false` so the read is stable.

import type { ChatBusEvent } from "@orb/contracts/chat";
import type { UserMacroSpec } from "@orb/contracts/preset";
import { userMacroValuesSchema } from "@orb/contracts/preset";
import { chatInjections, chatParticipants, chats } from "@orb/db";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { MacroSourceRef } from "@orb/kit/macro";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, inArray, isNotNull, isNull, lt, ne, not, or } from "drizzle-orm";
import type { ChatContext } from "../context.ts";
import type { ActiveTurns } from "../contract/active-turns.ts";
import type { ClaimChatOp } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors.ts";
import type {
  ArchiveChatParams,
  ClearVariablesParams,
  DeleteChatInjectionParams,
  DeleteChatParams,
  GetUserMacroPicksParams,
  GetVariablePicksParams,
  GetVariablesParams,
  ListChatInjectionsParams,
  ReapHuskParams,
  ReapTemporaryChatsParams,
  SetChatAnchorPersonaParams,
  SetChatInjectionParams,
  SetUserMacroValuesParams,
  SetVariablesParams,
  StarChatParams,
  UpdateTitleParams,
} from "../contract/params.ts";
import type { ReapResult, VariablesResult } from "../contract/results.ts";
import type { ChatService } from "../contract/service.ts";
import type { ChatInjectionView, UserMacroPicksView, VariablePicksView } from "../contract/views.ts";
import { requireHost, requireParticipant } from "../guard.ts";
import { loadChatInjections, loadStoredUserMacroValues, loadStoredVariables } from "../persistence/queries.ts";
import { loadRoster } from "../persistence/roster.ts";
import { presentHumanUserIdsOf } from "../substrate/roster-humans.ts";
import { shadowPresetUserMacros } from "../substrate/user-macros.ts";
import { resolveChoiceVariables } from "../substrate/variables.ts";

/** The emit op the lifecycle verbs close over. */
type EmitChatEvent = (event: ChatBusEvent) => Promise<void>;

/** The collaborators not on `ChatContext`. */
interface ChatLifecycleDeps {
  readonly emit: EmitChatEvent;
  /** The in-flight turn registry — `delete` sweeps the deleted room's turns (see {@link createDelete}). */
  readonly activeTurns: ActiveTurns;
  /** The husk→real transition (R0) — every write here calls it BEFORE writing. */
  readonly claimChat: ClaimChatOp;
}

/** The lifecycle slice of `ChatService` this grouped file owns. */
type ChatLifecycleVerbs = Pick<
  ChatService,
  | "updateTitle"
  | "star"
  | "archive"
  | "setChatAnchorPersona"
  | "delete"
  | "reapHusk"
  | "reapTemporaryChats"
  | "getVariables"
  | "getUserMacroPicks"
  | "getVariablePicks"
  | "setVariables"
  | "setUserMacroValues"
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
  claimChat: ClaimChatOp,
  args: {
    readonly principal: UpdateTitleParams["principal"];
    readonly chatId: UpdateTitleParams["chatId"];
    readonly patch: Partial<typeof chats.$inferInsert>;
  },
): Promise<void> {
  await requireHost(ctx, args.principal, args.chatId);
  await claimChat(args.chatId);
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
function createUpdateTitle(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["updateTitle"] {
  return async ({ principal, chatId, title }: UpdateTitleParams): Promise<void> => {
    await hostRowUpdate(ctx, emit, claimChat, { principal, chatId, patch: { title } });
  };
}

/** `star` — host-only (a room-level flag — see the matrix FLAG). */
function createStar(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["star"] {
  return async ({ principal, chatId, starred }: StarChatParams): Promise<void> => {
    await hostRowUpdate(ctx, emit, claimChat, { principal, chatId, patch: { starred } });
  };
}

/** `archive` — host-only (archiving removes the room from every member's active list). */
function createArchive(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["archive"] {
  return async ({ principal, chatId, archived }: ArchiveChatParams): Promise<void> => {
    await hostRowUpdate(ctx, emit, claimChat, { principal, chatId, patch: { archived } });
  };
}

/** `setChatAnchorPersona` — host-only manual re-pin of the anchor. `personaId: null` clears the pin. A
 *  non-null target must be owned by a present human participant of this room — checked via
 *  `ctx.verifyPersonaOwned` against each present human's `userId`. */
function createSetChatAnchorPersona(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setChatAnchorPersona"] {
  return async ({ principal, chatId, personaId }: SetChatAnchorPersonaParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    if (personaId !== null) {
      const roster = await loadRoster(ctx.db, chatId);
      // The SAME consent set the resolver gates its persona read on (`presentHumanUserIdsOf`) — one home, so
      // a pin this verb permits is a pin the assemble can actually resolve.
      const presentHumanIds = presentHumanUserIdsOf(roster);
      const ownership = await Promise.all(presentHumanIds.map((ownerId) => ctx.verifyPersonaOwned({ ownerId, personaId })));
      if (!ownership.some((owned) => owned)) {
        throw new ChatOperationError(CHAT_OP_CODES.notPersonaOwner, `chat ${chatId}: the anchor persona must be owned by a present human participant`);
      }
    }
    await claimChat(chatId);
    await ctx.db.update(chats).set({ anchorPersonaId: personaId, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** `delete` — host-only. Drop the chat row; every child cascades (FK). Emits `chatDeleted` + writes the
 *  best-effort audit row after the delete lands.
 *
 *  ORDER IS LOAD-BEARING (the delete-mid-turn crash):
 *  1. ABORT every in-flight turn (owner-blind — the room is going away, so a still-generating turn can commit
 *     nothing and only produces dropped writes). This stops the delta emits at the SOURCE.
 *  2. EMIT `chatDeleted` BEFORE the row delete — `chat_events.chat_id` FKs to `chats`, so an append after the
 *     delete can never land (it FK-fails and the bus drops it, bus.ts FLAG[emit-is-total]) and no live
 *     subscriber would ever learn the chat is gone. Emitting first fans it; the log row then cascades away
 *     with the chat, which is correct — there is nothing left to replay. */
function createDelete(ctx: ChatContext, emit: EmitChatEvent, abortTurns: (chatId: ChatId) => number): ChatService["delete"] {
  return async ({ principal, chatId }: DeleteChatParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    // Enumerate present human members before the FK cascade drops the roster — each must have the
    // deleted chat drop from their live list, so they ride `extraUserIds`.
    const roster = await loadRoster(ctx.db, chatId);
    const members = [...new Set(roster.flatMap((r) => (r.kind === "human" && r.userId !== null ? [r.userId] : [])))];
    abortTurns(chatId);
    await emit({ type: "chatDeleted", chatId });
    await ctx.db.delete(chats).where(eq(chats.id, chatId));
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

const MS_PER_HOUR = 3_600_000;

/** The caller HOSTS this chat (present `host` seat) — the scope both reap arms share, so the nav-away drop
 *  and the TTL belt can never disagree about whose rooms they may delete. */
function callerHostsChat(ctx: ChatContext, userId: UserId): SQL | undefined {
  return exists(
    ctx.db
      .select({ id: chatParticipants.id })
      .from(chatParticipants)
      .where(
        and(eq(chatParticipants.chatId, chats.id), eq(chatParticipants.userId, userId), eq(chatParticipants.role, "host"), isNull(chatParticipants.leftSeq)),
      ),
  );
}

/** The room has NO human besides the caller — the belt that keeps the TTL sweep off a room somebody else is
 *  also in. An unclaimed room that gained a second human (an invite was redeemed into it) is a shared space
 *  now, whatever the host did or did not type into it; it is not the reaper's to delete.
 */
function hasNoOtherHuman(ctx: ChatContext, userId: UserId): SQL {
  return not(
    exists(
      ctx.db
        .select({ id: chatParticipants.id })
        .from(chatParticipants)
        .where(
          and(
            eq(chatParticipants.chatId, chats.id),
            eq(chatParticipants.kind, "human"),
            // The NULL arm is spelled out rather than exempted: a userId-less seat can never be "another
            // human" (the born-whole `chat_participants_kind_shape` CHECK already makes `kind='human'`
            // imply a non-null userId, and the dormant `observer` arm is deliberately not one either), so
            // dropping the NULLs is the intent — and SQL three-valued logic would drop them silently anyway.
            isNotNull(chatParticipants.userId),
            ne(chatParticipants.userId, userId),
            isNull(chatParticipants.leftSeq),
          ),
        ),
    ),
  );
}

/** `reapHusk` — the nav-away drop (R0 §4.6, the Apple-Notes arm). Host-only, and the predicate is the
 *  SERVER's: the delete is conditional on `started_at IS NULL`, so a client that fires this at a room the
 *  user actually started deletes nothing (the client's "it's a husk" is never trusted — it may be a frame
 *  behind the claim). Idempotent: a second call, or a call at an already-reaped room, removes nothing.
 *
 *  A reaped husk EMITS `chatDeleted`, deliberately diverging from the temporary sweep's original silence
 *  (§1/§4.5): a temporary room is list-invisible everywhere, but a HUSK can be the OPEN room on the creating
 *  device — without the event that device sits pointed at a chat that no longer exists instead of taking the
 *  `chatDeletedFromList` → landing seam. Emitted BEFORE the row delete for the `createDelete` reason: a
 *  `chat_events` append after the delete FK-fails and reaches nobody. */
function createReapHusk(ctx: ChatContext, emit: EmitChatEvent): ChatService["reapHusk"] {
  return async ({ principal, chatId }: ReapHuskParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const [row] = await ctx.db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, chatId), isNull(chats.startedAt)));
    if (row === undefined) {
      return;
    }
    await emit({ type: "chatDeleted", chatId });
    await ctx.db.delete(chats).where(and(eq(chats.id, chatId), isNull(chats.startedAt)));
    await ctx.emitChatChanged(chatId, { detail: true, extraUserIds: [principal.userId] });
  };
}

/** `reapTemporaryChats` — the TTL BELT. Bulk-deletes the caller's expired rooms of BOTH ephemeral classes,
 *  each past the TTL and each hosted by the caller:
 *    • `temporary` (PD-65 ⑧) — born ephemeral, hidden from the list always.
 *    • HUSKS (R0 §4.6) — `started_at IS NULL`, plus the no-other-human belt. This is the arm that catches
 *      what nav-away cannot: a crash, a tab kill, a closed laptop. A temporary husk qualifies under both and
 *      reaps on whichever cutoff fires first — the arms are a UNION, not a conjunction.
 *  The TTL is the caller's own `UserSettings.chat.tempChatTtlHours` (⑧a, default 24h), resolved via the
 *  FOREIGN-inputs op. Children cascade (FK). Returns the count.
 *
 *  EVERY reaped room emits `chatDeleted` now, including the temporary ones: the two classes ride one delete
 *  and splitting the emit by class would mean re-reading the rows to classify them, for a silence that was
 *  only ever justified by "nothing could be looking at it" — which stopped being true when husks joined the
 *  sweep. An extra event for a room no device has open is inert.
 *
 *  SELECT → EMIT → DELETE, in that order, for `createDelete`'s reason: `chat_events.chat_id` FKs to `chats`,
 *  so an append after the row is gone can never land (it FK-fails, the total bus drops it) and no live
 *  subscriber would learn the room went away. This is why the sweep is not a single `DELETE … RETURNING`. */
function createReapTemporaryChats(ctx: ChatContext, emit: EmitChatEvent): ChatService["reapTemporaryChats"] {
  return async ({ principal }: ReapTemporaryChatsParams): Promise<ReapResult> => {
    const ttlHours = await ctx.resolveTempChatTtlHours(principal.userId);
    const cutoff = ctx.now() - ttlHours * MS_PER_HOUR;
    const doomed = await ctx.db
      .select({ id: chats.id })
      .from(chats)
      .where(
        and(
          lt(chats.createdAt, cutoff),
          or(eq(chats.temporary, true), and(isNull(chats.startedAt), hasNoOtherHuman(ctx, principal.userId))),
          callerHostsChat(ctx, principal.userId),
        ),
      );
    if (doomed.length === 0) {
      return { reaped: 0 };
    }
    // Concurrent, deliberately: the bus assigns seq PER CHAT, and these are N DISTINCT chats, so there is
    // no cross-room order to preserve (unlike `startChat`'s greeting seed, which is N events in ONE room's
    // seq space and must stay sequential).
    await Promise.all(doomed.map(async ({ id }) => await emit({ type: "chatDeleted", chatId: id })));
    const removed = await ctx.db
      .delete(chats)
      .where(
        inArray(
          chats.id,
          doomed.map((d) => d.id),
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

/** `setVariables` — member. Flush the `{{var}}`→value map to `chats.variableValues`. Emits `chatUpdated`. */
function createSetVariables(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setVariables"] {
  return async ({ principal, chatId, values }: SetVariablesParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    await claimChat(chatId);
    await ctx.db.update(chats).set({ variableValues: values, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** `setUserMacroValues` (WAVE MU) — member. Flush the per-chat user-macro INPUT picks (a nested
 *  macro→input→typed pick bag) to `chats.user_macro_values`. The `setVariables` sibling — a distinct column
 *  because the nested-typed shape can't share the flat `variableValues` map. Re-validates through
 *  `userMacroValuesSchema` at the verb (defense-in-depth over the tRPC boundary parse) — a malformed bag is
 *  refused rather than persisted; the turn build reads it back as the `values` bag. Emits `chatUpdated`. */
function createSetUserMacroValues(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setUserMacroValues"] {
  return async ({ principal, chatId, values }: SetUserMacroValuesParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    await claimChat(chatId);
    const parsed = userMacroValuesSchema.parse(values);
    await ctx.db.update(chats).set({ userMacroValues: parsed, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** `getUserMacroPicks` (#24) — member. The picks pane's ONE read: the chat's PICKABLE user macros (those
 *  declaring ≥1 typed input — a macro with none has nothing to pick) projected to identity + inputs + the
 *  authoring home, plus the persisted per-chat picks. The projection is deliberate least-privilege: the
 *  macro BODY is prompt content (host-gated everywhere else), the picker only needs the questions. An absent
 *  macro/input entry in `values` is UNSET — the turn resolves its per-kind default, which is what the pane
 *  renders.
 *
 *  BOTH definition homes (owner ruling #20): the active preset's macros AND the game's (the injected
 *  `ChatRpgOps.resolveUserMacros`), merged under the SAME ruled policy the turn build applies — the game
 *  shadows the preset by name (`shadowPresetUserMacros`, the one home for that rule). Without the merge the
 *  pane would ask about a def the turn no longer resolves (or hide a game knob entirely). */
function createGetUserMacroPicks(ctx: ChatContext): ChatService["getUserMacroPicks"] {
  return async ({ principal, chatId }: GetUserMacroPicksParams): Promise<UserMacroPicksView> => {
    await requireParticipant(ctx, principal, chatId);
    const [values, presetDefs, gameDefs] = await Promise.all([
      loadStoredUserMacroValues(ctx.db, chatId),
      ctx.resolvePromptUserMacros(chatId),
      ctx.rpg === null ? Promise.resolve<readonly UserMacroSpec[]>([]) : ctx.rpg.resolveUserMacros(chatId),
    ]);
    const macros = [
      ...gameDefs.filter(pickable).map((def) => toPickDef(def, "game")),
      ...shadowPresetUserMacros(presetDefs, gameDefs)
        .filter(pickable)
        .map((def) => toPickDef(def, "preset")),
    ];
    return { macros, values };
  };
}

/** A macro with no typed inputs has nothing to pick — it never reaches the picks pane. */
function pickable(def: UserMacroSpec): boolean {
  return def.inputs.length > 0;
}

/** The picks pane's least-privilege projection of one def (identity + inputs + its authoring home) — the
 *  BODY and the declared `args` are prompt content and are deliberately withheld ({@link UserMacroPicksView}). */
function toPickDef(def: UserMacroSpec, source: MacroSourceRef["kind"]): UserMacroPicksView["macros"][number] {
  return { name: def.name, description: def.description, inputs: def.inputs, source };
}

/** `getVariablePicks` — member. The picks pane's ChoiceBlock half (the `getUserMacroPicks` sibling — one
 *  pane, two knob families): the active preset's declared `variables` plus the persisted per-chat picks.
 *  The declarations are projected WHOLE — a ChoiceBlock has no body/args class to withhold, and every field
 *  decides how the pane stores a pick or what UNSET resolves to (see {@link VariablePicksView}). An absent
 *  key (or an empty string, which the resolver reads alike) is UNSET — the turn resolves the declared
 *  default, which is what the pane renders. */
function createGetVariablePicks(ctx: ChatContext): ChatService["getVariablePicks"] {
  return async ({ principal, chatId }: GetVariablePicksParams): Promise<VariablePicksView> => {
    await requireParticipant(ctx, principal, chatId);
    const [stored, variables] = await Promise.all([loadStoredVariables(ctx.db, chatId), ctx.resolvePromptVariables(chatId)]);
    return { variables, values: stored ?? {} };
  };
}

/** `clearVariables` — member. Null the persisted variable flush. Emits `chatUpdated`. */
function createClearVariables(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["clearVariables"] {
  return async ({ principal, chatId }: ClearVariablesParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    await claimChat(chatId);
    await ctx.db.update(chats).set({ variableValues: null, updatedAt: ctx.now() }).where(eq(chats.id, chatId));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** `setChatInjection` — host-only. `id` set ⇒ update the existing row (scoped to chatId — a foreign/unknown
 *  id is a leak-free NOT_FOUND); absent ⇒ insert a fresh row. Emits `chatUpdated`; returns the resolved view. */
function createSetChatInjection(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setChatInjection"] {
  return async ({ principal, chatId, id, position, depth, role, content, order }: SetChatInjectionParams): Promise<ChatInjectionView> => {
    await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
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
function createDeleteChatInjection(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["deleteChatInjection"] {
  return async ({ principal, chatId, injectionId }: DeleteChatInjectionParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    await ctx.db.delete(chatInjections).where(and(eq(chatInjections.id, injectionId), eq(chatInjections.chatId, chatId)));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** The chat-lifecycle verb bundle. `deps` carries the chat bus `emit`. */
export function createChatLifecycle(ctx: ChatContext, deps: ChatLifecycleDeps): ChatLifecycleVerbs {
  const { emit, claimChat } = deps;
  return {
    updateTitle: createUpdateTitle(ctx, emit, claimChat),
    star: createStar(ctx, emit, claimChat),
    archive: createArchive(ctx, emit, claimChat),
    setChatAnchorPersona: createSetChatAnchorPersona(ctx, emit, claimChat),
    delete: createDelete(ctx, emit, (chatId) => deps.activeTurns.abortAll(chatId)),
    reapHusk: createReapHusk(ctx, emit),
    reapTemporaryChats: createReapTemporaryChats(ctx, emit),
    getVariables: createGetVariables(ctx),
    setVariables: createSetVariables(ctx, emit, claimChat),
    setUserMacroValues: createSetUserMacroValues(ctx, emit, claimChat),
    getUserMacroPicks: createGetUserMacroPicks(ctx),
    getVariablePicks: createGetVariablePicks(ctx),
    clearVariables: createClearVariables(ctx, emit, claimChat),
    setChatInjection: createSetChatInjection(ctx, emit, claimChat),
    listChatInjections: createListChatInjections(ctx),
    deleteChatInjection: createDeleteChatInjection(ctx, emit, claimChat),
  };
}
