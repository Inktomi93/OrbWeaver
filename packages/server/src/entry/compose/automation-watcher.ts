// Bind chat-owned fact readers and action ports, then wire the watcher's detachable event sources.

import type { VariablePrecondition, VariableWriteResult } from "@orb/contracts/chat";
import type { ProseOverrides } from "@orb/contracts/prose";
import type { ThemeBackground } from "@orb/contracts/theme";
import type { UpsertEntriesResult, UpsertLoreEntryInput } from "@orb/contracts/world-info";
import type { Db } from "@orb/db";
import type { ChatId, UserId, WorldBookId } from "@orb/kit/ids";
import type { VarOp } from "@orb/kit/macro";
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
import { createChatAutomationReads } from "#domain/chat";
import type { EmitNotification } from "#domain/notifications";
import { subscribeAllChatEvents } from "#transport/trpc";
import type { DomainEventBus } from "./event-bus.ts";

/** The action WRITE ops, pre-bound at `entry/compose` (the automation domain declares only the TYPE —
 *  one-directional flow). Each closes over its owning sibling service; `authorUserId` resolves to a Principal
 *  where the sibling gates on ownership (world-info book owner, imagery caller). */

// @orb-waive no-inline-package-interface(AutomationActionOpsDeps): baselined when the gate landed; burn-down item 952.
export interface AutomationActionOpsDeps {
  readonly db: Db;
  /** THE cross-domain viewer-visibility op (chat's `resolveViewerVisibility`) — membership AND the D16 canon
   *  floor as one answer. The plugin fan-out's delivery gate consumes it; automation never re-derives either
   *  half (no membership select of its own, no second clamp home). */
  readonly resolveViewerVisibility: AutomationOps["chat"]["resolveViewerVisibility"];
  /** chat's standalone (out-of-turn) variable write — `ChatComposeResult.applyVariableOps`. */
  readonly applyVariableOps: (chatId: ChatId, ops: readonly VarOp[], expect?: readonly VariablePrecondition[]) => Promise<VariableWriteResult>;
  /** the SHARED hand-edit-safe world-info writer (CC-D), resolving the book owner's Principal at compose. */
  readonly upsertEntries: (args: {
    readonly authorUserId: UserId;
    readonly bookId: WorldBookId;
    readonly entries: readonly UpsertLoreEntryInput[];
  }) => Promise<UpsertEntriesResult>;
  /** the durable-first unified-inbox delivery (the `automation-notice` member). */
  readonly emitNotification: EmitNotification;
  /** the `/imagine` engine — `imagery.generatePicture` narrowed to automation's request/result. */
  readonly generatePicture: (req: AutomationImageRequest) => Promise<AutomationImageResult>;
  /** the `trigger_turn` arm's autonomous chat turn — chat's `requestTurn` bound with
   *  `initiator:"automation"` + the funder resolved from the rule author, narrowed to automation's request/result. */
  readonly requestTurn: (req: AutomationTurnRequest) => Promise<AutomationTurnResult>;
  /** BG-F — the author's owned background library projected to `(name, source)` pairs (settings read). */
  readonly listBackgroundChoices: (authorUserId: UserId) => Promise<readonly BackgroundChoice[]>;
  /** BG-F — chat's host-gated `setChatBackground` bound under the author's resolved Principal. */
  readonly setChatBackground: (args: { readonly authorUserId: UserId; readonly chatId: ChatId; readonly background: ThemeBackground }) => Promise<void>;
  /** PROSE-1 census 91 — the room HOST's prose overrides for a chat (chat's `resolveChatProse`). */
  readonly resolveChatProse: (chatId: ChatId) => Promise<ProseOverrides>;
  /** The generic quiet-LLM op (the /autobg pick + the `run_analysis` structured pass) — the ONE lane;
   *  `contract/ops.ts` states the variant split. Same signature as the op (a pure passthrough here). */
  readonly summarizeQuiet: AutomationOps["summarizeQuiet"];
  /** D146 — the `run_tool` arm's two seams onto the ONE tool registry: the direct-drive reachability predicate
   *  (the mint gate + the per-fire pause gate) and the invocation itself. Both bound in
   *  `compose/automation-plugin.ts`, where `domain/tool-use` is in scope. */
  readonly isToolDrivableBy: AutomationOps["tools"]["isToolDrivableBy"];
  readonly runTool: AutomationOps["tools"]["runTool"];
}

/** Assemble the FULL `AutomationOps`: the chat READ projections (turn origin via chat's own
 *  `loadTurnOrigin`; the remaining canon readers live behind chat's own front door) + the action WRITE ops. */
export function createAutomationOps(deps: AutomationActionOpsDeps): AutomationOps {
  const { db } = deps;
  return {
    chat: {
      ...createChatAutomationReads(db),
      resolveViewerVisibility: deps.resolveViewerVisibility,
      applyVariableOps: deps.applyVariableOps,
      listBackgroundChoices: deps.listBackgroundChoices,
      resolveChatProse: deps.resolveChatProse,
      setChatBackground: deps.setChatBackground,
      requestTurn: deps.requestTurn,
    },
    worldInfo: { upsertEntries: deps.upsertEntries },
    notifications: { emit: deps.emitNotification },
    imagery: { generatePicture: deps.generatePicture },
    tools: { isToolDrivableBy: deps.isToolDrivableBy, runTool: deps.runTool },
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
    onDomainEvent: (handler) => args.eventBus.subscribe(handler),
  };
}
