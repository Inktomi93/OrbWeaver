// The quiet line under the composer naming the connection and model the next reply will use. The chat-role
// read is the host viewer's own, so a member never fires it: the turn runs on the host's connection, and the
// member's own chat binding would name the wrong row.

import type { ChatId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { retryUnlessBadRequest, useTRPC } from "#data";
import { cn } from "#lib";
import { openConfigTo } from "#state";
import { useCreditConnections } from "../hooks/use-credit-connections.ts";
import type { SendGate } from "../hooks/use-send-availability.ts";
import { CHAT_TRACK } from "../lib/chat-track.ts";
import type { NextTurnLine } from "../lib/next-turn-line.ts";
import { nextTurnLine, nextTurnReadsChatRole } from "../lib/next-turn-line.ts";

export interface ComposerNextTurnLineProps {
  readonly chatId: ChatId;
  /** The room's pre-send verdict (`useSendAvailability()`), shared with the Send gate. */
  readonly availability: Pick<SendGate, "cause" | "failed">;
  /** The line's element id: the composer's disabled controls are described by it while it states the refusal. */
  readonly id: string;
}

// Each state's ink: an unset connection warns, a failed read is an error, the rest keep the gloss voice.
const STATE_INK: Record<NextTurnLine["state"], string | undefined> = {
  named: undefined,
  checking: undefined,
  unset: "text-warning",
  failed: "text-destructive",
};

export function ComposerNextTurnLine({ chatId, availability, id }: ComposerNextTurnLineProps): ReactElement {
  const trpc = useTRPC();
  const chat = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  // `null` is the tRPC no-data wire shape (a CT stub yields it): an unknown viewer, never a host.
  const viewerIsHost = chat.data?.viewerIsHost ?? undefined;
  const readsChatRole = nextTurnReadsChatRole(viewerIsHost, availability.cause, availability.failed);
  const resolve = useQuery({
    ...trpc.connection.resolveChatCapability.queryOptions(readsChatRole ? undefined : skipToken),
    retry: retryUnlessBadRequest,
  });
  const connections = useCreditConnections();
  const line = nextTurnLine({
    viewerIsHost,
    chatFailed: chat.isError,
    availabilityCause: availability.cause,
    availabilityFailed: availability.failed,
    resolved: resolve.data ?? undefined,
    resolveFailed: resolve.isError,
    connections,
  });
  return (
    // The card's own track, so the line starts at the card's edge; the measure caps the paragraph itself.
    <Container className={CHAT_TRACK}>
      <Text
        as="p"
        voice="gloss"
        className={cn("min-w-0 max-w-(--reading-measure-prose) break-words", STATE_INK[line.state])}
        data-slot="composer-next-turn"
        data-unset={line.state === "unset" ? "" : undefined}
        data-failed={line.state === "failed" ? "" : undefined}
        id={id}
      >
        {line.text}
        {line.door === undefined ? null : (
          <>
            {` ${line.door.lead} `}
            {/* The literals are the house spelling of a settings deep link: a feature never imports another's nav. */}
            <Button
              className="underline"
              intent="ghost"
              onClick={(): void => openConfigTo("connections", "model-roles", "chat-model")}
              size="inline"
              type="button"
            >
              <Text as="span" ink="inherit" voice="gloss">
                {line.door.label}
              </Text>
            </Button>
          </>
        )}
      </Text>
    </Container>
  );
}
