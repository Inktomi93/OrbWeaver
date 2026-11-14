import type { ParticipantView } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { MemoryViewTab } from "#client/features/chat/components/memory-view-tab.tsx";

/** The production Memory tab for one room at the context pane's width, as the named viewer sees it. */
export function MemoryViewTabStory({
  chatId,
  isHost,
  participants,
  width = 367,
}: {
  readonly chatId: ChatId;
  readonly isHost: boolean;
  readonly participants: readonly ParticipantView[];
  readonly width?: number;
}): ReactElement {
  return (
    <CtClientProviders>
      <Container role="group" aria-label="Chat context host" style={{ inlineSize: width }}>
        <MemoryViewTab chatId={chatId} isHost={isHost} participants={participants} />
      </Container>
    </CtClientProviders>
  );
}
