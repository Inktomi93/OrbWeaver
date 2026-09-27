// The quiet line under the composer naming the connection and model the next reply will use. The chat-role
// read is the host viewer's own, so a member never fires it: the turn runs on the host's connection, and the
// member's own chat binding would name the wrong row.

import type { UnavailableCause } from "@orb/contracts/inference";
import type { ChatId } from "@orb/kit/ids";
import { Text } from "@orb/ui/text";
import { skipToken, useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { useTRPC } from "#data";
import { cn } from "#lib";
import { useCreditConnections } from "../hooks/use-credit-connections.ts";
import { nextTurnLine } from "../lib/next-turn-line.ts";

export interface ComposerNextTurnLineProps {
  readonly chatId: ChatId;
  /** The room's settled pre-send verdict (`useSendAvailability().cause`), shared with the Send gate. */
  readonly availabilityCause: UnavailableCause | null | undefined;
}

export function ComposerNextTurnLine({ chatId, availabilityCause }: ComposerNextTurnLineProps): ReactElement {
  const trpc = useTRPC();
  const { data: chat } = useQuery(trpc.chat.getChat.queryOptions({ chatId }));
  // `null` is the tRPC no-data wire shape (a CT stub yields it): an unknown viewer, never a host.
  const viewerIsHost = chat?.viewerIsHost ?? undefined;
  const resolve = useQuery(trpc.connection.resolveChatCapability.queryOptions(viewerIsHost === true ? undefined : skipToken));
  const connections = useCreditConnections();
  const line = nextTurnLine({
    viewerIsHost,
    availabilityCause,
    resolved: resolve.data ?? undefined,
    resolveFailed: resolve.isError,
    connections,
  });
  return (
    <Text
      as="p"
      voice="gloss"
      className={cn("min-w-0 break-words", line.unset && "text-warning")}
      data-slot="composer-next-turn"
      data-unset={line.unset ? "" : undefined}
    >
      {line.text}
    </Text>
  );
}
