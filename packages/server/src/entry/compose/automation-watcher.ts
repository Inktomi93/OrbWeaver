// Assembles the automation cross-feature READ ops (the A5 `AutomationOps` the fact resolver + CEL env consume)
// and the `AutomationWatcherEnv` for `startAutomationWatcher` (the buddy-observer compose adapter precedent).
// Automation stays chat-blind: this is the ONE place the chat domain's turn-origin/message/variable projections
// are narrowed onto automation's injected op shape (turn-origin rides chat's own `loadTurnOrigin` export — the
// D26 selected-variant join + the delta-fold semantics stay chat-owned). The watcher env narrows the per-chat
// firehose + the domain-event bus onto the watcher's two sources.

import type { TriggerFact } from "@orb/contracts/automation";
import type { NotificationEvent } from "@orb/contracts/notifications";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { UpsertEntriesResult, UpsertLoreEntryInput } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import { chats, messages, messageVariants } from "@orb/db";
import type { ChatId, MessageId, UserId, WorldBookId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
import { eq } from "drizzle-orm";
import type {
  AutomationImageRequest,
  AutomationImageResult,
  AutomationOps,
  AutomationService,
  AutomationTurnRequest,
  AutomationTurnResult,
  AutomationWatcherEnv,
  BackgroundChoice,
} from "#domain/automation";
import { loadTurnOrigin } from "#domain/chat";
import { subscribeAllChatEvents } from "../../transport/trpc";
import type { DomainEventBus } from "./event-bus";

const LIMIT_ONE = 1;

/** The triggering message projected to the CEL fact — the SELECTED variant's content (D26). Null on a raced
 *  delete (the id names no live slot). */
async function getMessageFact(db: Db, messageId: MessageId): Promise<NonNullable<TriggerFact["message"]> | null> {
  const rows = await db
    .select({
      id: messages.id,
      role: messages.role,
      authorUserId: messages.authorUserId,
      characterId: messages.characterId,
      seq: messages.seq,
      content: messageVariants.content,
    })
    .from(messages)
    .innerJoin(messageVariants, eq(messageVariants.id, messages.selectedVariantId))
    .where(eq(messages.id, messageId))
    .limit(LIMIT_ONE);
  return rows[0] ?? null;
}

async function readChatColumn(db: Db, chatId: ChatId, column: "runtime" | "choice"): Promise<Record<string, string>> {
  const rows = await db.select({ runtime: chats.runtimeVariables, choice: chats.variableValues }).from(chats).where(eq(chats.id, chatId)).limit(LIMIT_ONE);
  return rows[0]?.[column] ?? {};
}

/** The action WRITE ops (A6), pre-bound at `entry/compose` (the automation domain declares only the TYPE —
 *  one-directional flow). Each closes over its owning sibling service; `authorUserId` resolves to a Principal
 *  where the sibling gates on ownership (world-info book owner, imagery caller). */
export interface AutomationActionOpsDeps {
  readonly db: Db;
  /** THE cross-domain viewer-visibility op (chat's `resolveViewerVisibility`) — membership AND the D16 canon
   *  floor as one answer. The plugin fan-out's delivery gate consumes it; automation never re-derives either
   *  half (no membership select of its own, no second clamp home). */
  readonly resolveViewerVisibility: AutomationOps["chat"]["resolveViewerVisibility"];
  /** chat's standalone (out-of-turn) variable write — `ChatComposeResult.applyVariableOps`. */
  readonly applyVariableOps: (chatId: ChatId, ops: readonly VarOp[]) => Promise<void>;
  /** the SHARED hand-edit-safe world-info writer (CC-D), resolving the book owner's Principal at compose. */
  readonly upsertEntries: (args: {
    readonly authorUserId: UserId;
    readonly bookId: WorldBookId;
    readonly entries: readonly UpsertLoreEntryInput[];
  }) => Promise<UpsertEntriesResult>;
  /** the durable-first unified-inbox delivery (the `automation-notice` member). */
  readonly emitNotification: (event: NotificationEvent) => Promise<void>;
  /** the `/imagine` engine — `imagery.generatePicture` narrowed to automation's request/result. */
  readonly generatePicture: (req: AutomationImageRequest) => Promise<AutomationImageResult>;
  /** the `trigger_turn` arm's autonomous chat turn (03 §1.6 / §4) — chat's `requestTurn` bound with
   *  `initiator:"automation"` + the funder resolved from the rule author, narrowed to automation's request/result. */
  readonly requestTurn: (req: AutomationTurnRequest) => Promise<AutomationTurnResult>;
  /** BG-F — the author's owned background library projected to `(name, source)` pairs (settings read). */
  readonly listBackgroundChoices: (authorUserId: UserId) => Promise<readonly BackgroundChoice[]>;
  /** BG-F — chat's host-gated `setChatBackground` bound under the author's resolved Principal. */
  readonly setChatBackground: (args: { readonly authorUserId: UserId; readonly chatId: ChatId; readonly background: ThemeBackground }) => Promise<void>;
  /** PROSE-1 census 91 — the room HOST's prose overrides for a chat (chat's `resolveChatProse`). */
  readonly resolveChatProse: (chatId: ChatId) => Promise<ProseOverrides>;
  /** BG-F — the quiet summarize-role LLM pick (the `set_chat_background` arm's model call). */
  readonly summarizeQuiet: (args: { readonly authorUserId: UserId; readonly chatId: ChatId; readonly prompt: string }) => Promise<{ readonly text: string }>;
}

/** Assemble the FULL `AutomationOps` (04 §4): the A5 chat READ projections (turn origin via chat's own
 *  `loadTurnOrigin`; the rest narrow canon reads the entry root is sanctioned to do — the buddy-observer
 *  precedent) + the A6 action WRITE ops. */
export function createAutomationOps(deps: AutomationActionOpsDeps): AutomationOps {
  const { db } = deps;
  return {
    chat: {
      getMessageFact: (_chatId, messageId) => getMessageFact(db, messageId),
      getTurnOrigin: (chatId, messageId) => loadTurnOrigin(db, chatId, messageId),
      resolveViewerVisibility: deps.resolveViewerVisibility,
      readVariables: (chatId) => readChatColumn(db, chatId, "runtime"),
      readChoicePicks: (chatId) => readChatColumn(db, chatId, "choice"),
      applyVariableOps: deps.applyVariableOps,
      listBackgroundChoices: deps.listBackgroundChoices,
      resolveChatProse: deps.resolveChatProse,
      setChatBackground: deps.setChatBackground,
      requestTurn: deps.requestTurn,
    },
    worldInfo: { upsertEntries: deps.upsertEntries },
    notifications: { emit: deps.emitNotification },
    imagery: { generatePicture: deps.generatePicture },
    summarizeQuiet: deps.summarizeQuiet,
  };
}

/** Assemble the watcher env from the per-chat firehose + the domain-event bus. */
export function createAutomationWatcherEnv(args: {
  readonly automation: Pick<AutomationService, "handleEvent">;
  readonly eventBus: DomainEventBus;
}): AutomationWatcherEnv {
  return {
    automation: args.automation,
    onChatEvent: (handler) => subscribeAllChatEvents((entry) => handler(entry.event)),
    onDomainEvent: (handler) => {
      args.eventBus.subscribe(handler);
      // The domain bus has no per-subscriber unsubscribe (a boot-lifetime subscriber set); teardown is process
      // exit. The returned unsub is a no-op — the watcher stops consuming when the process does.
      return () => undefined;
    },
  };
}
