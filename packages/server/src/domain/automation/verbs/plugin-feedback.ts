// Plugin feedback names only admitted participants; quick replies remain member-editable compose chips.

import { AUTOMATION_NOTICE_MESSAGE_MAX } from "@orb/contracts/notifications";
import type { DbAssemblyInput } from "@orb/db/wiring";
import { databaseForOwner } from "@orb/db/wiring-owner";
import type { PluginFeedbackDeps, PluginFeedbackOps } from "../contract/plugin-feedback.ts";
import { resolveNotificationRecipients } from "../substrate/notification-recipients.ts";

/** Bind the plugin producer to the same recipient axis and feedback bus automation uses. */

export function createPluginFeedbackOps(input: DbAssemblyInput<PluginFeedbackDeps>): PluginFeedbackOps {
  const deps: PluginFeedbackDeps = { ...input, db: databaseForOwner(input.db) };
  const { db, notify: automationNotify } = deps;
  return {
    postNotification: async ({ pluginId, installerUserId, chatId, recipient, message }): ReturnType<PluginFeedbackOps["postNotification"]> => {
      // The SAME axis resolver the `post_notification` arm uses — one home, so a new recipient member can
      // never land on the rule path and silently miss this one. `actorUserId: null` is not a shrug: a guest
      // `notify` carries no triggering fact, and its selector type (`PluginNotificationRecipient`) cannot
      // name the actor-excluding member at all, so there is no actor to pass and none can be asked for.
      const recipients = await resolveNotificationRecipients(db, { recipient, chatId, hostUserId: installerUserId, actorUserId: null });
      const capped = message.slice(0, AUTOMATION_NOTICE_MESSAGE_MAX);
      const source = { kind: "plugin", pluginId } as const;
      await Promise.all(
        recipients.map(async (recipientUserId) => {
          const event = { type: "automation-notice", recipientUserId, chatId, source, message: capped } as const;
          await deps.emit(event);
        }),
      );
    },
    surfaceQuickReply: ({ pluginId, chatId, choices }): ReturnType<PluginFeedbackOps["surfaceQuickReply"]> => {
      // `mode` is pinned to `compose` for the PLUGIN emitter: the guest's `surfaceQuickReply` capability
      // carries no mode field (widening it is the plugin program's own row), and compose is the fail-safe
      // half of the axis — the member owns and edits guest-authored text before it becomes their message,
      // where `send` would post it as their turn on one click. The RULE emitter (host-authored, host-gated
      // `createRule`) declares its mode per choice and defaults to `send`.
      const projected = choices.map((c) => ({ label: c.label, sendText: c.sendText, mode: "compose" as const }));
      automationNotify({ type: "quickReplySurfaced", chatId, source: { kind: "plugin", pluginId }, choices: projected });
      return Promise.resolve();
    },
  };
}
