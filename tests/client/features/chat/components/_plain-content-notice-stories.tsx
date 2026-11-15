import { useChatBusDeps } from "@orb/client/data";
import { MessageListSurface } from "@orb/client/features/chat";
import { useActiveSection, useConfigTarget, useContextTab, useOpenOverlayPanel, useSelectedCharacterId } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders, chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** Where the app's navigation stands, read off the stores the shell renders from: the section, the selected
 *  character, the context tab it asked for, the slide-over it opened and the settings landing it set. */
function NavigationReadout(): ReactElement {
  const section = useActiveSection();
  const character = useSelectedCharacterId();
  const tab = useContextTab();
  const overlay = useOpenOverlayPanel();
  const target = useConfigTarget();
  return (
    <output
      data-slot="navigation-readout"
      data-section={section}
      data-character={character ?? ""}
      data-context-tab={tab ?? ""}
      data-overlay={overlay ?? ""}
      data-config-target={target === null ? "" : [target.group, target.sub ?? "", target.setting ?? ""].join("/")}
    />
  );
}

function Transcript({ chatId }: { readonly chatId: ChatId }): ReactElement {
  const busDeps = useChatBusDeps();
  return (
    <Container className="h-full min-h-0">
      <MessageListSurface chatId={chatId} busDeps={busDeps} surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />
    </Container>
  );
}

/** The real transcript of one room, beside a readout of where a control in it navigated. */
export function PlainContentNoticeStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={{ fontScale: 1 }}>
        <Stack className="h-screen">
          <NavigationReadout />
          <Transcript chatId={chatId} />
        </Stack>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
