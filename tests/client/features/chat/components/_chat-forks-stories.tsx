import { useChatBusDeps } from "@orb/client/data";
import { MessageListSurface } from "@orb/client/features/chat";
import { selectChat, setOpenOverlayPanel, useActiveChatId, useOpenOverlayPanel } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser";
import { Container, Row } from "@orb/ui/layout";
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

function TranscriptBesideTab({ chatId, isHost }: { readonly chatId: ChatId; readonly isHost: boolean }): ReactElement {
  useState(() => selectChat(chatId));
  const busDeps = useChatBusDeps();
  return (
    <Row align="start" gap="block">
      <Container role="group" aria-label="Room transcript host" style={{ inlineSize: 640, blockSize: 800 }}>
        <MessageListSurface chatId={chatId} busDeps={busDeps} surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />
      </Container>
      <Container role="group" aria-label="Chat context host" style={{ inlineSize: 480 }}>
        <CommittedSettingsTab chatId={chatId} roomOverrides={{}} isHost={isHost} background={null} showGroup={false} />
      </Container>
    </Row>
  );
}

/** One room's production transcript beside its This-chat tab, so what the display pass does to a row and what the
 *  room's Regex section says about it share one page session. */
export function TranscriptBesideTabStory({ chatId, isHost }: { readonly chatId: ChatId; readonly isHost: boolean }): ReactElement {
  return (
    <CtClientProviders>
      <TranscriptBesideTab chatId={chatId} isHost={isHost} />
    </CtClientProviders>
  );
}
