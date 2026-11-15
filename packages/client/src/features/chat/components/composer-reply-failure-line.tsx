// The line under the composer after this client's message landed and its reply failed: it says so, gives the reason,
// and offers the next step. It is the failure's one statement, so the send raises no toast beside it.
// The host reads the server's own sentence and, for a failure fixed in the connection settings, the door there. A
// member reads only that the host's connection failed: the connection is the host's to fix, and its detail is the
// host's account state.

import { CONNECTION_FIXABLE_FAILURE_REASONS, PROVIDER_FAILURE_REASON_PREFIX } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { InlineAction } from "@orb/ui/inline-action";
import { Container } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { roomRosterOptions, useTRPC } from "#data";
import { openConfigTo } from "#state";
import { Track } from "../lib/chat-track.tsx";
import type { ReplyFailure } from "../lib/reply-failure.ts";
import { HOST_CONNECTION_FAILED_COPY, OPEN_CONNECTIONS_NAME, REPLY_FAILED_LEAD, RETRY_REPLY_NAME } from "../lib/send-failure-copy.ts";

const CONNECTION_FIXABLE: ReadonlySet<string> = new Set(CONNECTION_FIXABLE_FAILURE_REASONS);

export interface ComposerReplyFailureLineProps {
  readonly chatId: ChatId;
  /** The failure to state; `undefined` renders nothing. */
  readonly failure: ReplyFailure | undefined;
  readonly onRetry: () => void;
  /** The line's element id. */
  readonly id: string;
}

export function ComposerReplyFailureLine({ chatId, failure, onRetry, id }: ComposerReplyFailureLineProps): ReactElement | null {
  const trpc = useTRPC();
  const chat = useQuery(roomRosterOptions(trpc, { chatId }));
  if (failure === undefined) {
    return null;
  }
  // An unknown viewer reads as a member: the host's connection detail is never shown on a guess.
  const viewerIsHost = chat.data?.viewerIsHost === true;
  const providerFailed = failure.reason.startsWith(PROVIDER_FAILURE_REASON_PREFIX);
  const reason = providerFailed && !viewerIsHost ? HOST_CONNECTION_FAILED_COPY : failure.message;
  const offersConnections = viewerIsHost && CONNECTION_FIXABLE.has(failure.reason);
  return (
    // The next-turn line's own track and fill: the two lines take the same place under the composer.
    <Track of={Container} track="composer" className="shrink-0" ground="card">
      <Text
        as="p"
        voice="quiet"
        tone="destructive"
        className="min-inline-0"
        inset="control"
        cap="prose"
        wrap="word"
        role="alert"
        data-slot="composer-reply-failure"
        data-reason={failure.reason === "" ? undefined : failure.reason}
        id={id}
      >
        {reason === null ? REPLY_FAILED_LEAD : `${REPLY_FAILED_LEAD} ${reason}`}{" "}
        <InlineAction variant="link" onClick={onRetry} step="body" type="button">
          {RETRY_REPLY_NAME}
        </InlineAction>
        {offersConnections ? (
          <>
            {" "}
            <InlineAction variant="link" onClick={(): void => openConfigTo("connections")} step="body" type="button">
              {OPEN_CONNECTIONS_NAME}
            </InlineAction>
          </>
        ) : null}
      </Text>
    </Track>
  );
}
