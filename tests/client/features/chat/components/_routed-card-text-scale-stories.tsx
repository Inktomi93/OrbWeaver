import { useChatBusDeps } from "@orb/client/data";
import { MessageListSurface } from "@orb/client/features/chat";
import type { ChatId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders, chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

function Transcript({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const busDeps = useChatBusDeps();
  return (
    <Container className="h-full min-h-0">
      <MessageListSurface chatId={chatId} busDeps={busDeps} surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />
    </Container>
  );
}

/** The real transcript under the production appearance writer, so a card in it mints through the routed frame path. */
export function RoutedCardTextScaleStory({ chatId, fontScale }: { readonly chatId: ChatId; readonly fontScale: number }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={{ fontScale }}>
        <Stack className="h-screen">
          <Transcript chatId={chatId} />
        </Stack>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
