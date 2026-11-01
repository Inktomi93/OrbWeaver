import { useChatBusDeps } from "@orb/client/data";
import { MessageListSurface } from "@orb/client/features/chat";
import { selectChat } from "@orb/client/state";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { CtClientProviders, chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

function Transcript({
  chatId,
  speakerCharacterId,
  streamedText,
  streamLabel,
}: {
  readonly chatId: ChatId;
  readonly speakerCharacterId: CharacterId;
  readonly streamedText: string;
  readonly streamLabel: string;
}): ReactElement {
  useState(() => selectChat(chatId));
  const busDeps = useChatBusDeps();
  return (
    <>
      {/* The production stream's own calls, in the order the bus applier makes them for an accepted turn. */}
      <Button
        onClick={(): void => {
          busDeps.stream.beginTurn(chatId, { intent: "send", speakerCharacterId, targetMessageId: null });
          busDeps.stream.appendDelta({ chatId, kind: "text", text: streamedText });
        }}
      >
        {streamLabel}
      </Button>
      <MessageListSurface chatId={chatId} busDeps={busDeps} surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />
    </>
  );
}

/** The production transcript for one room, plus a control that streams `streamedText` as the speaker's live reply. */
export function StreamingReplyStory({
  chatId,
  speakerCharacterId,
  streamedText,
  streamLabel,
}: {
  readonly chatId: ChatId;
  readonly speakerCharacterId: CharacterId;
  readonly streamedText: string;
  readonly streamLabel: string;
}): ReactElement {
  return (
    <CtClientProviders>
      <Container role="group" aria-label="Room transcript host" style={{ inlineSize: 960, blockSize: 900 }}>
        <Transcript chatId={chatId} speakerCharacterId={speakerCharacterId} streamedText={streamedText} streamLabel={streamLabel} />
      </Container>
    </CtClientProviders>
  );
}
