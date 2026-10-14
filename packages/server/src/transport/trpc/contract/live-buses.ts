import type { AutomationBusEvent } from "@orb/contracts/automation";
import type { ChatBusEvent, ChatLivePublish } from "@orb/contracts/chat";
import type { UserBusEvent } from "@orb/contracts/user-bus";
import type { ChatId, UserId } from "@orb/kit/ids";
import type { InboxView } from "#domain/notifications";
import type { RpgEventBus } from "#domain/rpg";
import type { WorkloadProgressBus } from "#domain/workloads";
import type { QuietFanout } from "./quiet-fanout.ts";

export interface NotificationPublication {
  readonly view: InboxView;
  readonly inPlace: boolean;
}

export interface ChatLiveEvent {
  readonly seq: number | null;
  readonly event: ChatBusEvent;
}

export interface UserEventsBus extends Disposable {
  readonly publishUserEvent: (userId: UserId, event: UserBusEvent) => void;
  readonly publishChatChanged: (userId: UserId, chatId: ChatId | undefined) => void;
  readonly subscribeUserEvents: (userId: UserId, signal: AbortSignal) => AsyncIterable<UserBusEvent>;
}

export interface NotificationsBus extends Disposable {
  readonly publishNotification: (view: InboxView, inPlace?: boolean) => void;
  readonly subscribeNotifications: (userId: UserId, signal: AbortSignal) => AsyncIterable<NotificationPublication>;
}

export interface AutomationBus extends Disposable {
  readonly publishAutomationEvent: (event: AutomationBusEvent) => void;
  readonly subscribeAutomation: (chatId: ChatId, signal: AbortSignal) => AsyncIterable<AutomationBusEvent>;
}

export interface ChatEventsBus extends Disposable {
  readonly publishChatEvent: (entry: ChatLivePublish) => void;
  readonly subscribeAllChatEvents: (listener: (entry: ChatLiveEvent) => void) => () => void;
  readonly subscribeChatEvents: (chatId: ChatId, signal: AbortSignal) => AsyncIterable<ChatLiveEvent>;
}

export interface ChatOpenTap extends Disposable {
  readonly setChatOpenTap: (tap: ((chatId: ChatId, viewerUserId: UserId) => void) | null) => void;
  readonly notifyChatOpened: (chatId: ChatId, viewerUserId: UserId) => void;
}

export interface LiveBuses extends Disposable {
  readonly quiet: QuietFanout;
  readonly rpg: Pick<RpgEventBus, "subscribeRpgEvents">;
  readonly workloads: Pick<WorkloadProgressBus, "subscribeWorkloadEvents" | "getRecentWorkloadEvents">;
  readonly user: UserEventsBus;
  readonly notifications: NotificationsBus;
  readonly automation: AutomationBus;
  readonly chat: ChatEventsBus;
  readonly chatOpen: ChatOpenTap;
}
