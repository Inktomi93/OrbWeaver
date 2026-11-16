import { useChatBusDeps } from "@orb/client/data";
import { MessageListSurface } from "@orb/client/features/chat";
import { selectChat } from "@orb/client/state";
import type { MessageView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders, chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { Button } from "@orb/ui/button";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

const ids = createSeededIds(FIXTURE_ID_CURSOR);
const TURN_ID = ids.typeId(ID_PREFIX.chatTurn);

interface StreamStoryProps {
  readonly chatId: ChatId;
  readonly speakerCharacterId: CharacterId;
  readonly chunks: readonly string[];
  readonly chunkLabel: string;
  /** Stream the reply as a swipe of this message instead of a new reply. */
  readonly swipeOf?: MessageId | undefined;
  /** The stored reply the live turn commits as, once the server has written it, and the control that delivers it. */
  readonly commit?: { readonly view: MessageView; readonly label: string } | undefined;
}

function Transcript({ chatId, speakerCharacterId, chunks, chunkLabel, swipeOf, commit }: StreamStoryProps): ReactElement {
  useState(() => selectChat(chatId));
  const busDeps = useChatBusDeps();
  const [sent, setSent] = useState(0);
  return (
    <Stack className="h-full min-h-0">
      {/* The production stream's own calls, in the order the bus applier makes them for an accepted turn. */}
      <Button
        onClick={(): void => {
          const chunk = chunks[sent];
          if (chunk === undefined) {
            return;
          }
          if (sent === 0) {
            busDeps.stream.beginTurn(chatId, {
              turnId: TURN_ID,
              intent: swipeOf === undefined ? "send" : "swipe",
              speakerCharacterId,
              targetMessageId: swipeOf ?? null,
            });
          }
          busDeps.stream.appendDelta(TURN_ID, { chatId, kind: "text", text: chunk });
          setSent(sent + 1);
        }}
      >
        {chunkLabel}
      </Button>
      {commit === undefined ? null : (
        <Button
          onClick={(): void => {
            busDeps.invalidate({ type: "messageCommitted", chatId, messageId: commit.view.id, view: commit.view, turnId: TURN_ID });
          }}
        >
          {commit.label}
        </Button>
      )}
      <Container className="h-full min-h-0">
        <MessageListSurface chatId={chatId} busDeps={busDeps} surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />
      </Container>
    </Stack>
  );
}

/** The real transcript under the production appearance writer, plus a control that streams `chunks` one per press as
 *  `speakerCharacterId`'s live reply, or as a swipe of `swipeOf`, and one that delivers the turn's commit. */
export function StyledReplyStreamStory({ chatId, speakerCharacterId, chunks, chunkLabel, swipeOf, commit }: StreamStoryProps): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={{ fontScale: 1 }}>
        <Stack className="h-screen">
          <Transcript chatId={chatId} speakerCharacterId={speakerCharacterId} chunks={chunks} chunkLabel={chunkLabel} swipeOf={swipeOf} commit={commit} />
        </Stack>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
