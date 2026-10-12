import type { NotificationEvent } from "@orb/contracts/notifications";
import type { RecordParams } from "./params.ts";

/** Producer statements are committed by the notification owner before publication. */

export type RecordAndPublishNotification = (event: NotificationEvent, coStatements?: RecordParams["coStatements"]) => Promise<void>;
