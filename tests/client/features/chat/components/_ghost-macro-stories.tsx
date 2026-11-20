import { useChatBusDeps } from "@orb/client/data";
import { MessageListSurface } from "@orb/client/features/chat";
import { selectChat } from "@orb/client/state";
import type { CharacterId, ChatId } from "@orb/kit/ids";
import { ID_PREFIX } from "@orb/kit/ids";
import { CtClientProviders, chatSurfaceContributors, toolRenderers } from "@orb/testkit/browser";
import { createSeededIds, FIXTURE_ID_CURSOR } from "@orb/testkit/iso";
import { Button } from "@orb/ui/button";
import { Container } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useState } from "react";

const DEFAULT_HOST_WIDTH = 960;
const ids = createSeededIds(FIXTURE_ID_CURSOR);
const TURN_ID = ids.typeId(ID_PREFIX.chatTurn);
const REFUSED_TURN_ID = ids.typeId(ID_PREFIX.chatTurn);
/** Plays what a send the lock refused puts on the bus while the story's turn streams. */
const REFUSE_LABEL = "Refuse another send";
/** Plays a reconnect to a process where the story's turn is gone, then the next turn's opening. */
const RESTART_LABEL = "Restart, then stream the next turn";
const NEXT_TURN_ID = ids.typeId(ID_PREFIX.chatTurn);

function Transcript({
  chatId,
  speakerCharacterId,
  streamedText,
  streamLabel,
  nextText = "",
  nextLabel = "Stream more",
  kind = "text",
}: {
  readonly chatId: ChatId;
  readonly speakerCharacterId: CharacterId;
  readonly streamedText: string;
  readonly streamLabel: string;
  /** A second chunk appended by its own control, so a test can stop the stream between the two. */
  readonly nextText?: string;
  readonly nextLabel?: string;
  /** Which stream the chunks ride: the answer text or the reasoning trace. */
  readonly kind?: "text" | "reasoning";
}): ReactElement {
  useState(() => selectChat(chatId));
  const busDeps = useChatBusDeps();
  return (
    <>
      {/* The production stream's own calls, in the order the bus applier makes them for an accepted turn. */}
      <Button
        onClick={(): void => {
          busDeps.stream.beginTurn(chatId, { turnId: TURN_ID, intent: "send", speakerCharacterId, targetMessageId: null });
          busDeps.stream.appendDelta(TURN_ID, { chatId, kind, text: streamedText });
        }}
      >
        {streamLabel}
      </Button>
      <Button onClick={(): void => busDeps.stream.appendDelta(TURN_ID, { chatId, kind, text: nextText })}>{nextLabel}</Button>
      <Button
        onClick={(): void => {
          busDeps.stream.beginTurn(chatId, { turnId: REFUSED_TURN_ID, intent: "send", speakerCharacterId: null, targetMessageId: null });
          busDeps.stream.abortTurn(chatId, REFUSED_TURN_ID, "error");
        }}
      >
        {REFUSE_LABEL}
      </Button>
      <Button
        onClick={(): void => {
          busDeps.stream.closeDeadTurn(chatId, []);
          busDeps.stream.beginTurn(chatId, { turnId: NEXT_TURN_ID, intent: "send", speakerCharacterId, targetMessageId: null });
          busDeps.stream.appendDelta(NEXT_TURN_ID, { chatId, kind, text: nextText });
        }}
      >
        {RESTART_LABEL}
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
  nextText = "",
  nextLabel = "Stream more",
  kind = "text",
  hostWidth = DEFAULT_HOST_WIDTH,
}: {
  readonly chatId: ChatId;
  readonly speakerCharacterId: CharacterId;
  readonly streamedText: string;
  readonly streamLabel: string;
  /** A second chunk appended by its own control, so a test can stop the stream between the two. */
  readonly nextText?: string;
  readonly nextLabel?: string;
  /** Which stream the chunks ride: the answer text or the reasoning trace. */
  readonly kind?: "text" | "reasoning";
  /** The transcript host's inline size, so a case can mount at a phone's width. */
  readonly hostWidth?: number;
}): ReactElement {
  return (
    <CtClientProviders>
      <Container role="group" aria-label="Room transcript host" style={{ inlineSize: hostWidth, blockSize: 900 }}>
        <Transcript
          chatId={chatId}
          speakerCharacterId={speakerCharacterId}
          streamedText={streamedText}
          streamLabel={streamLabel}
          nextText={nextText}
          nextLabel={nextLabel}
          kind={kind}
        />
      </Container>
    </CtClientProviders>
  );
}
