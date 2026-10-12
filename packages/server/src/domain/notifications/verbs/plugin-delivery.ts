// Standing corrections publish only the rows their durable operation actually changed.

import type { PluginNotificationDelivery, PluginNotificationDeliveryDeps } from "../contract/plugin-delivery.ts";

/** Bind episodic and standing delivery with durable-before-live ordering. */

export function createPluginNotificationDelivery(deps: PluginNotificationDeliveryDeps): PluginNotificationDelivery {
  const { notifications, publish: publishNotification } = deps;
  return {
    emit: async (event): ReturnType<PluginNotificationDelivery["emit"]> => {
      publishNotification(await notifications.record({ event }));
    },
    emitStanding: async (event): ReturnType<PluginNotificationDelivery["emitStanding"]> => {
      publishNotification(await notifications.record({ event, supersedeActiveOfSameType: true }));
    },
    refreshStanding: async (event): ReturnType<PluginNotificationDelivery["refreshStanding"]> => {
      for (const view of await notifications.refreshStanding({ event })) {
        publishNotification(view, true);
      }
    },
    retractStanding: async ({ recipientUserId, type }): ReturnType<PluginNotificationDelivery["retractStanding"]> => {
      for (const view of await notifications.retract({ recipientUserId, type })) {
        publishNotification(view, true);
      }
    },
  };
}
