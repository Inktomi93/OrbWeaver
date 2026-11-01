import { selectChat, setOpenOverlayPanel, useActiveChatId, useOpenOverlayPanel } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { CommittedSettingsTab } from "#client/features/chat/components/settings-context-tab.tsx";

function Tab({ chatId }: { readonly chatId: ChatId }): ReactElement {
  useState(() => {
    selectChat(chatId);
    // The phone's details sheet is open over the room while its forks are listed.
    setOpenOverlayPanel("context");
  });
  const active = useActiveChatId();
  const sheet = useOpenOverlayPanel();
  return (
    <>
      <CommittedSettingsTab chatId={chatId} roomOverrides={{}} isHost={true} background={null} showGroup={false} />
      <output data-probe="shell">{`active=${active ?? "none"} sheet=${sheet ?? "none"}`}</output>
    </>
  );
}

/** The production This-chat tab for one room, as its host sees it. */
export function ChatContextTabStory({ chatId }: { readonly chatId: ChatId }): ReactElement {
  return (
    <CtClientProviders>
      <Container role="group" aria-label="Chat context host" style={{ inlineSize: 480 }}>
        <Tab chatId={chatId} />
      </Container>
    </CtClientProviders>
  );
}
