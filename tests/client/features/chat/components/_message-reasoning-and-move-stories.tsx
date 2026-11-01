import { useChatBusDeps } from "@orb/client/data";
import { MessageListSurface } from "@orb/client/features/chat";
import { selectChat } from "@orb/client/state";
import type { AppearanceSettings } from "@orb/contracts/settings/appearance";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { CtAppearanceChannels, CtClientProviders, chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

const TURN_ID = createSeededIds(FIXTURE_ID_CURSOR).typeId(ID_PREFIX.chatTurn);

function Transcript({ chatId, startTurnLabel }: { readonly chatId: ChatId; readonly startTurnLabel: string }): ReactElement {
  useState(() => selectChat(chatId));
  const busDeps = useChatBusDeps();
  return (
    <>
      {/* The turn opens through the production stream's own `beginTurn`, the call the bus applier makes for an accepted turn. */}
      <Button onClick={(): void => busDeps.stream.beginTurn(chatId, { turnId: TURN_ID, intent: "send", speakerCharacterId: null, targetMessageId: null })}>
        {startTurnLabel}
      </Button>
      <MessageListSurface chatId={chatId} busDeps={busDeps} surfaceContributors={chatSurfaceContributors} toolRenderers={toolRenderers} />
    </>
  );
}

/** The production transcript surface for one room, plus a control that puts the room's turn state into a live turn. */
export function RoomTranscriptStory({
  chatId,
  width,
  height,
  appearance,
  startTurnLabel,
}: {
  readonly chatId: ChatId;
  readonly width: number;
  readonly height: number;
  readonly appearance: AppearanceSettings;
  readonly startTurnLabel: string;
}): ReactElement {
  return (
    <CtClientProviders>
      <CtAppearanceChannels settings={appearance}>
        <Container role="group" aria-label="Room transcript host" style={{ inlineSize: width, blockSize: height }}>
          <Transcript chatId={chatId} startTurnLabel={startTurnLabel} />
        </Container>
      </CtAppearanceChannels>
    </CtClientProviders>
  );
}
