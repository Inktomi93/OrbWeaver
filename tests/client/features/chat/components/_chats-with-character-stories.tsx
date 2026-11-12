import { ChatsWithCharacterPane } from "@orb/client/features/chat";
import type { CharacterId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";

/** The production chats-with-this-character pane at a side pane's width, over the real chat list read. */
export function ChatsWithCharacterStory({
  characterId,
  characterName,
  width,
}: {
  readonly characterId: CharacterId;
  readonly characterName: string;
  readonly width: number;
}): ReactElement {
  return (
    <CtClientProviders>
      <Container className="h-screen" style={{ inlineSize: width }}>
        <ChatsWithCharacterPane characterId={characterId} characterName={characterName} onNewChat={(): void => undefined} />
      </Container>
    </CtClientProviders>
  );
}
