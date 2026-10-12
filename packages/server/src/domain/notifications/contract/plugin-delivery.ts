import type { InboxView } from "@orb/contracts/notifications";
import type { NotificationsService } from "./service.ts";

export interface PluginNotificationDeliveryDeps {
  readonly notifications: Pick<NotificationsService, "record" | "refreshStanding" | "retract">;
  readonly publish: (view: InboxView, correction?: boolean) => void;
}
export type { PluginNotificationDelivery } from "@orb/contracts/plugin";
