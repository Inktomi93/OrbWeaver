import { useChatBusDeps } from "@orb/client/data";
import { MessageListSurface } from "@orb/client/features/chat";
import type { ChatId, MessageId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders, chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

interface GreetingRoomProps {
  readonly chatId: ChatId;
  readonly messageId: MessageId;
  readonly deliverLabel: string;
}

/** The real transcript, plus a control that delivers the room's `messageEdited` for `messageId` through the
 *  production bus seam, as the socket does once a greeting step or a send lands. */
function Transcript({ chatId, messageId, deliverLabel }: GreetingRoomProps): ReactElement {
  const busDeps = useChatBusDeps();
  return (
    <Stack className="h-full min-h-0">
      <Button
        onClick={(): void => {
          busDeps.invalidate({ type: "messageEdited", chatId, messageId });
        }}
      >
        {deliverLabel}
      </Button>
      <Container className="h-full min-h-0">
        <MessageListSurface chatId={chatId} busDeps={busDeps} surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />
      </Container>
    </Stack>
  );
}

export function GreetingRoomStory(props: GreetingRoomProps): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={{ fontScale: 1 }}>
        <Stack className="h-screen">
          <Transcript {...props} />
        </Stack>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
