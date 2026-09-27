// The generation credit in a message's reveal cluster: the model, provider and connection that produced the
// shown swipe, read off the persisted swipe record. Its posture is owner-ruled: the glyph is the only
// rendering, the sentence lives on `title` and in sr-only text, and it drops at a coarse pointer, where there
// is no hover to reveal it. The `message-metadata-model` slot is kept (rule 0.7).

import type { MessageView } from "@orb/contracts/chat";
import { Cpu, Icon } from "@orb/ui/icons";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { HIDE_AT_COARSE } from "#components";
import { cn } from "#lib";
import { useCreditConnections } from "../hooks/use-credit-connections.ts";
import { MESSAGE_ACTION_ICON_CLASS } from "../lib/message-actions-reveal.ts";
import { generationCreditSentence } from "../lib/swipe-attribution.ts";

export interface GenerationCreditProps {
  readonly message: Pick<MessageView, "model" | "provider" | "connectionId">;
}

/** Renders nothing for a swipe with no recorded model (a greeting or a draft was never generated). */
export function GenerationCredit({ message }: GenerationCreditProps): ReactElement | null {
  const connections = useCreditConnections();
  const sentence = generationCreditSentence(message, connections);
  if (sentence === null) {
    return null;
  }
  return (
    <Text as="span" voice="gloss" className={cn("inline-flex items-center", HIDE_AT_COARSE)} data-slot="message-metadata-model" title={sentence}>
      <Icon aria-hidden={true} className={MESSAGE_ACTION_ICON_CLASS} icon={Cpu} size="sm" />
      <Text as="span" className="sr-only">
        {sentence}
      </Text>
    </Text>
  );
}
