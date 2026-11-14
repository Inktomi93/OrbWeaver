import { chatMessageHandlingSection } from "@orb/client/features/chat";
import { CtClientProviders } from "@orb/testkit/browser";
import type { ReactElement } from "react";

const ANCHOR_ID = "message-handling-setting-names-anchor";

/** The chat feature's production Chat & message handling section, mounted over the CT runtime. */
export function MessageHandlingSectionStory(): ReactElement {
  return <CtClientProviders>{chatMessageHandlingSection.body(ANCHOR_ID)}</CtClientProviders>;
}
