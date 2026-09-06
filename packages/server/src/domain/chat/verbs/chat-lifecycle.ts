// domain/chat/verbs/chat-lifecycle — the chat-row lifecycle + variables + persisted injections. The
// low-payload, non-canon mutations: chat-row flags (title/star/archive/delete), the two-plane variables,
// and the `chat_injections` CRUD. Most emit the `chatUpdated` catch-all; the three removing verbs fan
// `chatDeleted` on the LIVE-ONLY lane.
//
// Authority: title/star/archive/delete + injection write/delete → host; variables + injection list →
// member; `reapTemporaryChats` is per-user maintenance (non-chat-scoped); `reapHusk` is host-only.
//
// ⚠ DELETE-FIRST IS THE LAW HERE. Emitting `chatDeleted` BEFORE the delete would open a FALSE-EMIT window:
// a conditional delete that declines (a husk claimed under the reaper, a room that stopped qualifying)
// would have already announced its own death, bouncing every open device onto a room that survives.
// `chatDeleted` is a LIVE-ONLY bus member (`LIVE_ONLY_CHAT_EVENT_TYPES`), which writes no `chat_events`
// row — so there is no FK to lose and nothing to append ahead of the delete. Every removing verb therefore runs
//   DELETE … RETURNING  →  fan `emitLive` for exactly the rows that came back.
// The emits-precede-deletes rule survives INVERTED, not repealed: the fan must not be droppable by the
// delete's own success path, so it is unconditional over `RETURNING` and never nested in a later branch.
// Nothing was lost by dropping the durable row: `chat_events.chat_id` CASCADES, so the `chatDeleted` row
// was cascaded away by the very delete it announced — it was never replayable.
//
// HUSKS (R0 §4.2/§4.6). Every WRITE here CLAIMS the room first (`deps.claimChat`, before the write — the
// ordering invariant in `verbs/claim-chat.ts`): configuring a room is "doing something with it" (F4(a)), so a
// room the user titled/starred/tuned is no longer an abandonable husk. The three verbs that do NOT claim are
// the three that remove the row — `delete`, `reapHusk`, `reapTemporaryChats`.
// This file owns BOTH reap arms (§4.6): `reapHusk` is the best-effort nav-away drop (host-only, and the
// SERVER re-checks `started_at IS NULL` — the client's "it's a husk" is never trusted), and the TTL belt
// inside `reapTemporaryChats` is what catches the crash / tab-kill / never-came-back cases a web client
// cannot signal. Both fan `chatDeleted` per REAPED room — see the reaper's own note for why that
// deliberately diverges from the temporary sweep's historical silence.
//
// Every chat-row change rides the `chatUpdated` catch-all — there is no dedicated
// `titleUpdated`/`starred`/`injectionChanged` member, so a client refetches the chat detail.
// `reapTemporaryChats` sweeps the caller's expired temporary chats AND expired husks, scoped to chats the
// caller hosts. Bulk delete rides the same FK cascade as `delete`.
// `getVariables` returns the effective config-plane view: stored ChoiceBlock picks merged over the active
// preset's declared defaults, with `withRandomPick: false` so the read is stable.

import type { DurableChatBusEvent, LiveOnlyChatBusEvent } from "@orb/contracts/chat";
import type { UserMacroSpec, UserMacroValues } from "@orb/contracts/preset";
import { userMacroValuesSchema } from "@orb/contracts/preset";
import { chatInjections, chatParticipants, chats } from "@orb/db";
import type { BatchStmt } from "@orb/db/kit";
import { batchMany } from "@orb/db/kit";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { MacroSourceRef, OffVocabularyPick } from "@orb/kit/macro";
import { findOffVocabularyPicks } from "@orb/kit/macro";
import type { SQL } from "drizzle-orm";
import { and, eq, exists, isNotNull, isNull, lt, ne, not, or } from "drizzle-orm";
import type { ChatContext } from "../context.ts";
import type { ActiveTurns } from "../contract/active-turns.ts";
import type { ClaimChatOp } from "../contract/context.ts";
import { CHAT_OP_CODES, ChatNotFoundError, ChatOperationError } from "../contract/errors.ts";
import type {
  ArchiveChatParams,
  ClearVariablesParams,
  DeleteChatInjectionParams,
  DeleteChatParams,
  GetRuntimeVariablesParams,
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
import { classifyParticipant } from "../persistence/participant.ts";
import { loadParticipants } from "../persistence/participants-read.ts";
import { loadChatInjections, loadRuntimeVariables, loadStoredUserMacroValues, loadStoredVariables } from "../persistence/queries.ts";
import { hostUserIdOf } from "../substrate/participants-host.ts";
import { presentAndEnabledHumanUserIdsOf } from "../substrate/participants-humans.ts";
import { shadowPresetUserMacros } from "../substrate/user-macros.ts";
import { resolveChoiceVariables } from "../substrate/variables.ts";

/** The emit op the lifecycle verbs close over. */
type EmitChatEvent = (event: DurableChatBusEvent) => Promise<void>;

/** The LIVE-ONLY fan (`entry/compose/services::emitChatEventLive`) — the door `chatDeleted` takes. Not
 *  async and never rejecting: a no-listener publish is a free in-process `EventEmitter.emit`, which is what
 *  makes it safe to call AFTER the DELETE without a failure mode to classify. */
type EmitChatEventLive = (event: LiveOnlyChatBusEvent) => void;

/** The collaborators not on `ChatContext`. */
interface ChatLifecycleDeps {
  readonly emit: EmitChatEvent;
  /** The durable-append-free fan the three removing verbs announce a dead room on (see the file header's
   *  DELETE-FIRST block). Separate from `emit` because they are different LANES, not two spellings of one. */
  readonly emitLive: EmitChatEventLive;
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
  | "getRuntimeVariables"
  | "setVariables"
  | "setUserMacroValues"
  | "clearVariables"
  | "setChatInjection"
  | "listChatInjections"
  | "deleteChatInjection"
>;

/** Commit a rebuild-consumed chat-row mutation with the current host owner's retry token. */
async function commitFencedChatWrite(ctx: ChatContext, chatId: ChatId, statement: BatchStmt): Promise<void> {
  const statements = [statement];
  const hostUserId = hostUserIdOf(await loadParticipants(ctx.db, chatId));
  if (hostUserId !== null) {
    ctx.bumpStatsCanonVersion(statements, ctx.db, hostUserId);
  }
  await ctx.db.batch(batchMany(statements));
}

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
  await commitFencedChatWrite(
    ctx,
    args.chatId,
    ctx.db
      .update(chats)
      .set({ ...args.patch, updatedAt: ctx.now() })
      .where(eq(chats.id, args.chatId)),
  );
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
 *  non-null target must be owned by a present AND ENABLED human participant of this room — checked via
 *  `ctx.verifyPersonaOwned` against each present-and-enabled human's `userId`. */
function createSetChatAnchorPersona(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setChatAnchorPersona"] {
  return async ({ principal, chatId, personaId }: SetChatAnchorPersonaParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    if (personaId !== null) {
      const participants = await loadParticipants(ctx.db, chatId);
      // The SAME consent set the resolver gates its persona read on (`presentAndEnabledHumanUserIdsOf`) — one
      // home, so a pin this verb permits is a pin the assemble can actually resolve (2026-08-15: this used to
      // call the presence-only `presentHumanUserIdsOf`, which let a host pin — and a live turn silently refuse
      // — a DISABLED member's persona; the enabled axis reintroduced the exact silently-dead-pin bug the
      // presence axis was widened to fix).
      const presentHumanIds = await presentAndEnabledHumanUserIdsOf(ctx, participants);
      const ownership = await Promise.all(presentHumanIds.map((ownerId) => ctx.verifyPersonaOwned({ ownerId, personaId })));
      if (!ownership.some((owned) => owned)) {
        throw new ChatOperationError(CHAT_OP_CODES.notPersonaOwner, `chat ${chatId}: the anchor persona must be owned by a present, enabled human participant`);
      }
    }
    await claimChat(chatId);
    await commitFencedChatWrite(ctx, chatId, ctx.db.update(chats).set({ anchorPersonaId: personaId, updatedAt: ctx.now() }).where(eq(chats.id, chatId)));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** `delete` — host-only. Drop the chat row; every child cascades (FK). Fans `chatDeleted` on the live-only
 *  lane + writes the best-effort audit row after the delete lands.
 *
 *  ORDER IS LOAD-BEARING (the delete-mid-turn crash + R1-4a):
 *  1. READ the roster BEFORE the write — the FK cascade drops it, and every present human needs the deleted
 *     chat to fall out of their live list (`extraUserIds`).
 *  2. ABORT every in-flight turn (owner-blind — the room is going away, so a still-generating turn can commit
 *     nothing and only produces dropped writes). This stops the delta emits at the SOURCE.
 *  3. DELETE, then fan. `RETURNING` is the authority for whether a death happened at all; the fan is
 *     unconditional over it and precedes every later step, so no branch can swallow it (the emits-are-total
 *     rule, inverted by the live-only lane — file header). Being append-free is what allows this order: the
 *     old durable `chatDeleted` had to precede the delete or FK-fail, and paid for it with the false-emit. */
function createDelete(ctx: ChatContext, emitLive: EmitChatEventLive, abortTurns: (chatId: ChatId) => number): ChatService["delete"] {
  return async ({ principal, chatId }: DeleteChatParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    // Enumerate present human members before the FK cascade drops the roster — each must have the
    // deleted chat drop from their live list, so they ride `extraUserIds`.
    const participants = await loadParticipants(ctx.db, chatId);
    const members = [
      ...new Set(
        participants.flatMap((r) => {
          const actor = classifyParticipant(r);
          return actor?.kind === "human" ? [actor.userId] : [];
        }),
      ),
    ];
    abortTurns(chatId);
    const statements: BatchStmt[] = [ctx.db.delete(chats).where(eq(chats.id, chatId)).returning({ id: chats.id })];
    ctx.bumpStatsCanonVersion(statements, ctx.db, principal.userId);
    const results = await ctx.db.batch(batchMany(statements));
    const removed = results[0] as readonly { readonly id: ChatId }[];
    if (removed.length > 0) {
      emitLive({ type: "chatDeleted", chatId });
    }
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
 *  A reaped husk FANS `chatDeleted`, deliberately diverging from the temporary sweep's original silence
 *  (§1/§4.5): a temporary room is list-invisible everywhere, but a HUSK can be the OPEN room on the creating
 *  device — without the event that device sits pointed at a chat that no longer exists instead of taking the
 *  `chatDeleted` → landing seam (`apply-chat-bus-event.ts`, wired R3).
 *
 *  ⚠️ THE PREDICATE IS THE DELETE'S, NOT THE SELECT'S (R3 — the verifier's R1-4a). The `started_at IS NULL`
 *  test rides the DELETE's own WHERE, so a claim that lands between the read and the write CANNOT lose the
 *  room: the DELETE simply removes nothing, and `RETURNING` says so. R1-4a — THE FALSE-EMIT — IS NOW CLOSED
 *  TOO, and this is where it lived: the announcement used to precede the DELETE (forced, because a durable
 *  append after the row is gone FK-fails), so a claim landing in that window left every open device told the
 *  room had died while it survived. `chatDeleted` is live-only now, so the fan happens AFTER `RETURNING` and
 *  a declined reap announces nothing at all. The window is gone, not narrowed.
 *
 *  The pre-SELECT stays, and it is not a redundant read: it is what distinguishes "this was never a husk"
 *  (idempotent no-op, no list repaint owed — the client fires this on every nav-away) from "it WAS a husk and
 *  someone claimed it under us" (the survivor case, which still repaints). */
function createReapHusk(ctx: ChatContext, emitLive: EmitChatEventLive): ChatService["reapHusk"] {
  return async ({ principal, chatId }: ReapHuskParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    const [row] = await ctx.db
      .select({ id: chats.id })
      .from(chats)
      .where(and(eq(chats.id, chatId), isNull(chats.startedAt)));
    if (row === undefined) {
      return;
    }
    // The predicate rides the DELETE, so a claim racing in after the SELECT costs the reap, never the room —
    // and `RETURNING` is what the fan below is conditioned on, so it can never announce a survivor.
    const removed = await ctx.db
      .delete(chats)
      .where(and(eq(chats.id, chatId), isNull(chats.startedAt)))
      .returning({ id: chats.id });
    if (removed.length > 0) {
      emitLive({ type: "chatDeleted", chatId });
    }
    // Both arms repaint: the reaped room must leave the list, and a room that survived the race must come
    // BACK to a list the client had already dropped it from optimistically.
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
 *  EVERY reaped room fans `chatDeleted` now, including the temporary ones: the two classes ride one delete
 *  and splitting the emit by class would mean re-reading the rows to classify them, for a silence that was
 *  only ever justified by "nothing could be looking at it" — which stopped being true when husks joined the
 *  sweep. An extra event for a room no device has open is inert.
 *
 *  ⚠️ ONE `DELETE … RETURNING`, AND THE PREDICATE IS ITS OWN (R3 — the verifier's R1-4b, REAL DATA LOSS; and
 *  R1-4a). Two defects were fixed here, in that order. It used to delete by an id list read from a prior
 *  SELECT, so a room CLAIMED between the two — a user returning to a day-old husk and typing, exactly the
 *  case the composer-text skip protects — was deleted anyway, with its canon; the conjunction moved into the
 *  DELETE's own WHERE, which makes the decision atomic with the write. The SELECT then survived only as the
 *  EMIT set, because a durable `chatDeleted` had to be appended BEFORE the row it names disappeared — and
 *  that ordering was R1-4a: a room that stopped qualifying had already been announced dead. With the fan on
 *  the live-only lane there is nothing to append and nothing to pre-read: the sweep IS a single
 *  `DELETE … RETURNING`, and `RETURNING` is simultaneously the honest `reaped` count and the exact fan set. */
function createReapTemporaryChats(ctx: ChatContext, emitLive: EmitChatEventLive): ChatService["reapTemporaryChats"] {
  return async ({ principal }: ReapTemporaryChatsParams): Promise<ReapResult> => {
    const ttlHours = await ctx.resolveTempChatTtlHours(principal.userId);
    const cutoff = ctx.now() - ttlHours * MS_PER_HOUR;
    const statements: BatchStmt[] = [
      ctx.db
        .delete(chats)
        .where(
          and(
            lt(chats.createdAt, cutoff),
            or(eq(chats.temporary, true), and(isNull(chats.startedAt), hasNoOtherHuman(ctx, principal.userId))),
            callerHostsChat(ctx, principal.userId),
          ),
        )
        .returning({ id: chats.id }),
    ];
    ctx.bumpStatsCanonVersion(statements, ctx.db, principal.userId);
    const results = await ctx.db.batch(batchMany(statements));
    const removed = results[0] as readonly { readonly id: ChatId }[];
    for (const { id } of removed) {
      emitLive({ type: "chatDeleted", chatId: id });
    }
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
    await commitFencedChatWrite(ctx, chatId, ctx.db.update(chats).set({ variableValues: values, updatedAt: ctx.now() }).where(eq(chats.id, chatId)));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** `setUserMacroValues` (WAVE MU) — member. Flush the per-chat user-macro INPUT picks (a nested
 *  macro→input→typed pick bag) to `chats.user_macro_values`. The `setVariables` sibling — a distinct column
 *  because the nested-typed shape can't share the flat `variableValues` map. Re-validates through
 *  `userMacroValuesSchema` at the verb (defense-in-depth over the tRPC boundary parse) — a malformed bag is
 *  refused rather than persisted; the turn build reads it back as the `values` bag. Emits `chatUpdated`.
 *
 *  #1356 — and the VOCABULARY belt: the wire schema is per-VALUE (it can never see the def's `options`), so
 *  the membership check lives HERE, the one seam that holds both the picks and the definitions. A select
 *  pick is spliced into the author's template, so an off-vocabulary value is arbitrary prose in someone
 *  else's prompt — refused whole with a typed reason, never silently cleaned (a partial write would tell the
 *  member their pick landed). Kit's `resolveStaticInput` is the second belt, for picks ALREADY stored when
 *  their option was renamed away. */
function createSetUserMacroValues(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["setUserMacroValues"] {
  return async ({ principal, chatId, values }: SetUserMacroValuesParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    await claimChat(chatId);
    const parsed = userMacroValuesSchema.parse(values);
    await assertDeclaredPicks(ctx, chatId, parsed);
    await commitFencedChatWrite(ctx, chatId, ctx.db.update(chats).set({ userMacroValues: parsed, updatedAt: ctx.now() }).where(eq(chats.id, chatId)));
    await emit({ type: "chatUpdated", chatId });
  };
}

/** The #1356 vocabulary gate over one flush. The def set is resolved exactly as the picks pane resolves it
 *  — BOTH authoring homes under the ruled preset↔game shadow — so the write is judged against the def the
 *  turn will actually render, never a preset def the game has replaced. A bag entry naming a macro or an
 *  input NO def declares is ignored: the pane rebuilds the whole bag, so an orphan left by a def edit is a
 *  benign race (the same posture `getVariablePicks` takes on an orphaned ChoiceBlock pick), and refusing it
 *  would wedge the pane against a preset the member cannot edit. */
async function assertDeclaredPicks(ctx: ChatContext, chatId: ChatId, values: UserMacroValues): Promise<void> {
  const [presetDefs, gameDefs, stored] = await Promise.all([
    ctx.resolvePromptUserMacros(chatId),
    ctx.rpg === null ? Promise.resolve<readonly UserMacroSpec[]>([]) : ctx.rpg.resolveUserMacros(chatId),
    loadStoredUserMacroValues(ctx.db, chatId),
  ]);
  for (const def of [...gameDefs, ...shadowPresetUserMacros(presetDefs, gameDefs)]) {
    const bag = values[def.name];
    if (bag === undefined) {
      continue;
    }
    // ONLY A NEW off-vocabulary pick is refused. The pane is a whole-bag flush (`withPick` carries every
    // OTHER knob forward untouched), so a pick that went stale when its option was renamed away would
    // otherwise wedge the member out of editing ANY knob in the room until someone fixed the preset. A
    // value already in the stored bag is grandfathered here and neutralised by the RESOLVE belt instead —
    // that split is the whole reason the ruling has two belts.
    const grandfathered = new Set(findOffVocabularyPicks(def.inputs, stored[def.name] ?? {}).map(pickKey));
    const offending = findOffVocabularyPicks(def.inputs, bag).find((pick) => !grandfathered.has(pickKey(pick)));
    if (offending !== undefined) {
      throw new ChatOperationError(
        CHAT_OP_CODES.unknownMacroPick,
        `${def.name}.${offending.input}: "${offending.value}" is not one of the declared options [${offending.options.join(", ")}]`,
      );
    }
  }
}

/** One off-vocabulary pick's identity for the grandfather set — input + value, joined by U+0000 (spelled as
 *  an escape, never a raw byte: a raw NUL makes git treat the file as binary, #1356). No input NAME or value
 *  can carry a NUL, so the first NUL always ends the name and no two distinct picks collide into one key. */
function pickKey(pick: OffVocabularyPick): string {
  return `${pick.input}\u0000${pick.value}`;
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

/** `getRuntimeVariables` — member. The room's RUNTIME variable fold (`chats.runtimeVariables` — the plane a
 *  `set_variable` arm, a turn's `{{setvar}}` delta, and the needle's GATED score write all land in; S5 §4).
 *  Member-gated by design (the plane is member-visible — the reason analysis arcs/twists/guidance may never
 *  write into it); the plugin membrane's `getVariables` reads the same column through its own admission.
 *  No claim, no emit — a pure read; client invalidation rides the existing turn-commit/swipe bus events. */
function createGetRuntimeVariables(ctx: ChatContext): ChatService["getRuntimeVariables"] {
  return async ({ principal, chatId }: GetRuntimeVariablesParams): Promise<Record<string, string>> => {
    await requireParticipant(ctx, principal, chatId);
    return loadRuntimeVariables(ctx.db, chatId);
  };
}

/** `clearVariables` — member. Null the persisted variable flush. Emits `chatUpdated`. */
function createClearVariables(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["clearVariables"] {
  return async ({ principal, chatId }: ClearVariablesParams): Promise<void> => {
    await requireParticipant(ctx, principal, chatId);
    await claimChat(chatId);
    await commitFencedChatWrite(ctx, chatId, ctx.db.update(chats).set({ variableValues: null, updatedAt: ctx.now() }).where(eq(chats.id, chatId)));
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
 *  `chatUpdated` ONLY when a row actually went away.
 *
 *  THE VERB STAYS IDEMPOTENT — a repeated or stale id is not an error (unlike its `setChatInjection` sibling,
 *  whose unknown id is a leak-free NOT_FOUND: an UPDATE that matched nothing was asked to change a specific
 *  row, while a DELETE that matched nothing has already got what it asked for). What it stops doing is
 *  ANNOUNCING: `chatUpdated` is what makes every present client re-read the room, so firing it for a delete
 *  that moved no row asserts a mutation that did not happen — to every member's cache and to any automation
 *  watching the room (#1463 item 9). `RETURNING` is the transition test, the same shape the claim stamp uses. */
function createDeleteChatInjection(ctx: ChatContext, emit: EmitChatEvent, claimChat: ClaimChatOp): ChatService["deleteChatInjection"] {
  return async ({ principal, chatId, injectionId }: DeleteChatInjectionParams): Promise<void> => {
    await requireHost(ctx, principal, chatId);
    await claimChat(chatId);
    const dropped = await ctx.db
      .delete(chatInjections)
      .where(and(eq(chatInjections.id, injectionId), eq(chatInjections.chatId, chatId)))
      .returning({ id: chatInjections.id });
    if (dropped.length > 0) {
      await emit({ type: "chatUpdated", chatId });
    }
  };
}

/** The chat-lifecycle verb bundle. `deps` carries the chat bus `emit`. */
export function createChatLifecycle(ctx: ChatContext, deps: ChatLifecycleDeps): ChatLifecycleVerbs {
  const { emit, emitLive, claimChat } = deps;
  return {
    updateTitle: createUpdateTitle(ctx, emit, claimChat),
    star: createStar(ctx, emit, claimChat),
    archive: createArchive(ctx, emit, claimChat),
    setChatAnchorPersona: createSetChatAnchorPersona(ctx, emit, claimChat),
    delete: createDelete(ctx, emitLive, (chatId) => deps.activeTurns.abortAll(chatId)),
    reapHusk: createReapHusk(ctx, emitLive),
    reapTemporaryChats: createReapTemporaryChats(ctx, emitLive),
    getVariables: createGetVariables(ctx),
    setVariables: createSetVariables(ctx, emit, claimChat),
    setUserMacroValues: createSetUserMacroValues(ctx, emit, claimChat),
    getUserMacroPicks: createGetUserMacroPicks(ctx),
    getVariablePicks: createGetVariablePicks(ctx),
    getRuntimeVariables: createGetRuntimeVariables(ctx),
    clearVariables: createClearVariables(ctx, emit, claimChat),
    setChatInjection: createSetChatInjection(ctx, emit, claimChat),
    listChatInjections: createListChatInjections(ctx),
    deleteChatInjection: createDeleteChatInjection(ctx, emit, claimChat),
  };
}
