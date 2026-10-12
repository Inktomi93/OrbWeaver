import type { EmitNotification } from "@orb/contracts/notifications";
import type { PluginNotificationPost, PluginQuickReplySurface } from "@orb/contracts/plugin";
import type { Db } from "@orb/db";
import type { EmitAutomationEvent } from "./ops.ts";

export interface PluginFeedbackDeps {
  readonly db: Db;
  readonly emit: EmitNotification;
  readonly notify: EmitAutomationEvent;
}
export interface PluginFeedbackOps {
  readonly postNotification: PluginNotificationPost["post"];
  readonly surfaceQuickReply: PluginQuickReplySurface["surface"];
}
