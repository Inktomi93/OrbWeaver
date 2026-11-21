// The composer's empty-Enter turn actions, joined with the reply-failure line they retry from. The line stands down
// while anything generates, and a room the send gate refuses states that refusal instead, so one fault is never said
// twice.

import type { ChatId } from "@orb/kit/ids";
import { useEffect } from "react";
import { isSilencedTurnAbort } from "#lib";
import type { ReplyFailure } from "../lib/reply-failure.ts";
import { clearReplyFailure, markReplyRetrying, peekReplyFailure, recordReplyFailure, useReplyFailure } from "../lib/reply-failure.ts";
import type { UseContinueTurnResult } from "./use-continue-turn.ts";
import { useContinueTurn } from "./use-continue-turn.ts";

export interface ReplyFailureLine {
  readonly continueOnEmpty: UseContinueTurnResult;
  /** The failure to state, or `undefined` while the line stands down. */
  readonly failure: ReplyFailure | undefined;
  /** Ask for the reply again: the empty-Enter generate on the saved tail. Its own failure replaces the line's reason. */
  readonly retry: () => void;
}

export function useReplyFailureLine(args: { readonly chatId: ChatId; readonly refused: boolean; readonly generating: boolean }): ReplyFailureLine {
  const { chatId, generating } = args;
  const recorded = useReplyFailure(chatId);
  // A turn that starts after the failure, other than its own retry, answers the room, so the failure is over. Read at
  // the rising edge only: the failing turn itself starts before its failure is recorded.
  useEffect(() => {
    const held = peekReplyFailure(chatId);
    if (generating && held !== undefined && !held.retrying) {
      clearReplyFailure(chatId);
    }
  }, [chatId, generating]);
  const failure = recorded !== undefined && !recorded.retrying && !args.refused && !generating ? recorded : undefined;
  const continueOnEmpty = useContinueTurn();
  const retry = (): void => {
    const lead = peekReplyFailure(chatId)?.lead;
    markReplyRetrying(chatId);
    continueOnEmpty.generateReply(chatId, {
      onError: (error) => {
        if (isSilencedTurnAbort(error)) {
          clearReplyFailure(chatId);
        } else {
          recordReplyFailure(chatId, error, lead === undefined ? {} : { lead });
        }
      },
      onSuccess: () => clearReplyFailure(chatId),
    });
  };
  return { continueOnEmpty, failure, retry };
}
