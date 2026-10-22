// One service-owned recipient queue keeps the final consent count after committed writes.
// The recipient is the owning verb's caller, including distribution recipients (D147).
// Notification failures are logged without rejecting the durable consent act.

import type { NotificationEvent } from "@orb/contracts/notifications";
import { errorMessage } from "@orb/kit/error-message";
import type { UserId } from "@orb/kit/ids";
import { getLog } from "#foundation/observability";
import type { OwnedPluginConsentPrompt } from "../contract/ops.ts";
import type { PluginContext } from "../contract/service.ts";
import { countPendingConsent } from "../persistence/plugins.ts";

const CONSENT_PROMPT_TYPE = "plugins-awaiting-consent" satisfies NotificationEvent["type"];

async function publish(ctx: PluginContext, recipientUserId: UserId, raised: boolean): Promise<void> {
  const pendingCount = await countPendingConsent(ctx.db, recipientUserId);
  if (pendingCount === 0) {
    await ctx.ops.notifications.retractStanding({ recipientUserId, type: CONSENT_PROMPT_TYPE });
    return;
  }
  const event: NotificationEvent = { type: CONSENT_PROMPT_TYPE, recipientUserId, pendingCount };
  if (raised) {
    await ctx.ops.notifications.emitStanding(event);
    return;
  }
  await ctx.ops.notifications.refreshStanding(event);
}

/** Build the service's publisher; every refresh follows its management verb's committed write. */
export function createConsentPrompt(ctx: PluginContext): OwnedPluginConsentPrompt {
  const chains = new Map<UserId, Promise<void>>();
  let closed = false;
  return {
    refresh(recipientUserId, raised): Promise<void> {
      if (closed) {
        return Promise.reject(new Error("plugin consent prompt is closed"));
      }
      const tail = chains.get(recipientUserId) ?? Promise.resolve();
      // Every stored link absorbs publication failure; the next recipient count can always run.
      const next: Promise<void> = tail
        .then(async (): Promise<void> => {
          try {
            await publish(ctx, recipientUserId, raised);
          } catch (err: unknown) {
            getLog().error({ userId: recipientUserId, err: errorMessage(err) }, "plugin: could not refresh the pending-consent notification");
          }
        })
        .finally((): void => {
          if (chains.get(recipientUserId) === next) {
            chains.delete(recipientUserId);
          }
        });
      chains.set(recipientUserId, next);
      return next;
    },
    async [Symbol.asyncDispose](): Promise<void> {
      closed = true;
      await Promise.all(chains.values());
    },
  };
}
