import type { MessageView } from "@orb/contracts/chat";
import type { CorpusSourceOutcome } from "@orb/contracts/search";
import type { ChatId, MessageId } from "@orb/kit/ids";
import type { MessageListHandle } from "@orb/ui/message-list";
import type { RefObject } from "react";
import { useEffect, useState } from "react";
import { consumeChatMoment, useChatMoment } from "#state";

const OUTCOME_TEXT: Readonly<Record<CorpusSourceOutcome, string>> = {
  resolved: "Opened the exact source moment.",
  moved: "The source changed. Opened its surviving source anchor or visible original range.",
  deleted: "The source moment was deleted. Opened the room without an exact jump.",
  unavailable: "The source anchor is unavailable. Opened the room without an exact jump.",
};

/** Consume only after a stable anchor has rendered and accepted focus, including after query suspension. */
export function useCorpusAnchor({
  chatId,
  messages,
  anchorMessageId,
  outcome,
  listHandleRef,
}: {
  readonly chatId: ChatId;
  readonly messages: readonly MessageView[];
  readonly anchorMessageId: MessageId | null;
  readonly outcome: CorpusSourceOutcome | null;
  readonly listHandleRef: RefObject<MessageListHandle | null>;
}): string {
  const moment = useChatMoment(chatId);
  // A transcript remount must not reannounce a request that already completed.
  const [consumedOnMount] = useState(() => {
    if (moment === null || !moment.consumed) {
      return null;
    }
    return moment.request;
  });
  useEffect(() => {
    if (moment === null || moment.consumed || outcome === null) {
      return;
    }
    if (anchorMessageId === null) {
      consumeChatMoment(moment.request, outcome);
      return;
    }
    const index = messages.findIndex((message) => message.id === anchorMessageId);
    if (index < 0) {
      return;
    }
    let frame: number;
    const reveal = (): void => {
      if (listHandleRef.current?.revealIndex(index) === true) {
        consumeChatMoment(moment.request, outcome);
      } else {
        frame = requestAnimationFrame(reveal);
      }
    };
    frame = requestAnimationFrame(reveal);
    return (): void => cancelAnimationFrame(frame);
  }, [moment, messages, anchorMessageId, outcome, listHandleRef]);
  return moment !== null && moment.consumed && moment.request !== consumedOnMount && moment.announcement !== null ? OUTCOME_TEXT[moment.announcement] : "";
}
