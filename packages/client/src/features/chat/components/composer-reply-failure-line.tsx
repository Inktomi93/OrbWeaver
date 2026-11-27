// The line under the composer after this client's message landed and its reply failed: it says so, gives the reason,
// and offers the next step. It is the failure's one statement, so the send raises no toast beside it.
// The host reads the server's own sentence and, for a failure fixed in the connection settings, the door there. A
// member reads the member rule of `provider-failure-reason.ts` and no door: the connection is the host's to fix.

import { CONNECTION_FIXABLE_FAILURE_REASONS, EMPTY_GENERATION_CAUSE, EMPTY_GENERATION_OP_CODE } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { InlineAction } from "@orb/ui/inline-action";
import { Container } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { roomRosterOptions, seedPresetId, useTRPC } from "#data";
import { timeLib } from "#lib";
import { openConfigTo } from "#state";
import { Track } from "../lib/chat-track.tsx";
import { openPresetParams } from "../lib/open-params.ts";
import { providerFailureReason } from "../lib/provider-failure-reason.ts";
import type { ReplyFailure } from "../lib/reply-failure.ts";
import { OPEN_CONNECTIONS_NAME, providerResetsLabel, RETRY_REPLY_NAME } from "../lib/send-failure-copy.ts";
import { OPEN_PARAMS_NAME } from "../lib/warning-notice.ts";

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
  const settings = useQuery(trpc.settings.getUserSettings.queryOptions());
  if (failure === undefined) {
    return null;
  }
  // An unknown viewer reads as a member: the host's connection detail is never shown on a guess.
  const viewerIsHost = chat.data?.viewerIsHost === true;
  const reason = failure.roomState ?? providerFailureReason(failure, viewerIsHost) ?? failure.message;
  // The reset belongs to the host's connection, so a member reads no more of it than of the rest of its detail.
  const offersReset = viewerIsHost && failure.reason === "provider_rate_limit" && failure.resetsAt !== null;
  const offersConnections = viewerIsHost && failure.reason !== null && CONNECTION_FIXABLE.has(failure.reason);
  // The preset the host's turns run is the host's own default, so only the host is sent to its Params, and only for the
  // failure its output limit causes.
  const presetId = viewerIsHost ? seedPresetId(settings.data?.config.seeds.defaultPresetId) : null;
  const offersParams = presetId !== null && failure.reason === EMPTY_GENERATION_OP_CODE && failure.cause === EMPTY_GENERATION_CAUSE.outputLimit;
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
        data-reason={failure.reason ?? undefined}
        data-cause={failure.cause === "" ? undefined : failure.cause}
        id={id}
      >
        {reason === null ? failure.lead : `${failure.lead} ${reason}`}
        {offersReset ? (
          <>
            {" "}
            <span data-slot="composer-reply-failure-reset" data-resets-at={failure.resetsAt}>
              {providerResetsLabel(timeLib.formatDateTime(failure.resetsAt))}
            </span>
          </>
        ) : null}
        {failure.retryable ? (
          <>
            {" "}
            <InlineAction variant="link" onClick={onRetry} step="body" type="button">
              {RETRY_REPLY_NAME}
            </InlineAction>
          </>
        ) : null}
        {offersConnections ? (
          <>
            {" "}
            <InlineAction variant="link" onClick={(): void => openConfigTo("connections")} step="body" type="button">
              {OPEN_CONNECTIONS_NAME}
            </InlineAction>
          </>
        ) : null}
        {offersParams ? (
          <>
            {" "}
            <InlineAction variant="link" onClick={(): void => openPresetParams(presetId)} step="body" type="button">
              {OPEN_PARAMS_NAME}
            </InlineAction>
          </>
        ) : null}
      </Text>
    </Track>
  );
}
