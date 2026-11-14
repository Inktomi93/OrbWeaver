import { selectChat, setOpenOverlayPanel, useActiveChatId, useOpenOverlayPanel } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";
import { CommittedSettingsTab } from "#client/features/chat/components/settings-context-tab.tsx";

function Tab({ chatId, isHost }: { readonly chatId: ChatId; readonly isHost: boolean }): ReactElement {
  useState(() => {
    selectChat(chatId);
    // The phone's details sheet is open over the room while its forks are listed.
    setOpenOverlayPanel("context");
  });
  const active = useActiveChatId();
  const sheet = useOpenOverlayPanel();
  return (
    <>
      <CommittedSettingsTab chatId={chatId} roomOverrides={{}} isHost={isHost} background={null} showGroup={false} />
      <output data-probe="shell">{`active=${active ?? "none"} sheet=${sheet ?? "none"}`}</output>
    </>
  );
}

/** The production This-chat tab for one room, as its host sees it, or as a member does when `isHost` is false. */
export function ChatContextTabStory({
  chatId,
  width = 480,
  isHost = true,
}: {
  readonly chatId: ChatId;
  readonly width?: number;
  readonly isHost?: boolean;
}): ReactElement {
  return (
    <CtClientProviders>
      <Container role="group" aria-label="Chat context host" style={{ inlineSize: width }}>
        <Tab chatId={chatId} isHost={isHost} />
      </Container>
    </CtClientProviders>
  );
}
