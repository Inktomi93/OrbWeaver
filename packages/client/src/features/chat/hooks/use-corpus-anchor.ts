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
  const [announcement, setAnnouncement] = useState("");
  useEffect(() => {
    if (moment === null || moment.consumed || outcome === null) {
      return;
    }
    if (anchorMessageId === null) {
      setAnnouncement(OUTCOME_TEXT[outcome]);
      consumeChatMoment(moment.request);
      return;
    }
    const index = messages.findIndex((message) => message.id === anchorMessageId);
    if (index < 0) {
      return;
    }
    let frame: number;
    const reveal = (): void => {
      if (listHandleRef.current?.revealIndex(index) === true) {
        setAnnouncement(OUTCOME_TEXT[outcome]);
        consumeChatMoment(moment.request);
      } else {
        frame = requestAnimationFrame(reveal);
      }
    };
    frame = requestAnimationFrame(reveal);
    return (): void => cancelAnimationFrame(frame);
  }, [moment, messages, anchorMessageId, outcome, listHandleRef]);
  return announcement;
}
