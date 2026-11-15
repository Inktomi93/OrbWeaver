import { useChatBusDeps } from "@orb/client/data";
import { MessageListSurface } from "@orb/client/features/chat";
import { selectChat } from "@orb/client/state";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders, chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { Button } from "@orb/ui/button";
import { Container, Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

const ids = createSeededIds(FIXTURE_ID_CURSOR);
const TURN_ID = ids.typeId(ID_PREFIX.chatTurn);

function Transcript({
  chatId,
  speakerCharacterId,
  chunks,
  chunkLabel,
}: {
  readonly chatId: ChatId;
  readonly speakerCharacterId: CharacterId;
  readonly chunks: readonly string[];
  readonly chunkLabel: string;
}): ReactElement {
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
            busDeps.stream.beginTurn(chatId, { turnId: TURN_ID, intent: "send", speakerCharacterId, targetMessageId: null });
          }
          busDeps.stream.appendDelta(TURN_ID, { chatId, kind: "text", text: chunk });
          setSent(sent + 1);
        }}
      >
        {chunkLabel}
      </Button>
      <Container className="h-full min-h-0">
        <MessageListSurface chatId={chatId} busDeps={busDeps} surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />
      </Container>
    </Stack>
  );
}

/** The real transcript under the production appearance writer, plus a control that streams `chunks` one per press as
 *  `speakerCharacterId`'s live reply. */
export function StyledReplyStreamStory({
  chatId,
  speakerCharacterId,
  chunks,
  chunkLabel,
}: {
  readonly chatId: ChatId;
  readonly speakerCharacterId: CharacterId;
  readonly chunks: readonly string[];
  readonly chunkLabel: string;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={{ fontScale: 1 }}>
        <Stack className="h-screen">
          <Transcript chatId={chatId} speakerCharacterId={speakerCharacterId} chunks={chunks} chunkLabel={chunkLabel} />
        </Stack>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
