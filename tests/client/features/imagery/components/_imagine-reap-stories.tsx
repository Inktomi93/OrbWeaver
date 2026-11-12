import { useHuskReaper } from "@orb/client/data";
import { imagineModal } from "@orb/client/features/imagery";
import { enterCreatedChat, goToLanding, openImagine } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement } from "react";
import { useState } from "react";

function Reaper(): null {
  useHuskReaper();
  return null;
}

function SeededImagine({ chatId, prompt }: { readonly chatId: ChatId; readonly prompt: string }): ReactElement {
  useState(() => {
    openImagine({ chatId, mode: "free", prompt });
    return true;
  });
  const { body } = imagineModal;
  if (typeof body !== "function") {
    throw new Error("The imagine modal must have a built body");
  }
  return body();
}

/** The real imagine body for one room, the app root's husk reaper, and the store actions that enter a room as just
 *  created and leave it. */
export function ImagineReapStory({
  chatId,
  otherChatId,
  prompt,
}: {
  readonly chatId: ChatId;
  readonly otherChatId: ChatId;
  readonly prompt: string;
}): ReactElement {
  return (
    <CtClientProviders>
      <Reaper />
      <Button onClick={(): void => enterCreatedChat(chatId)}>Enter the new room</Button>
      <Button onClick={(): void => enterCreatedChat(otherChatId)}>Enter another new room</Button>
      <Button onClick={goToLanding}>Go to the landing</Button>
      <SeededImagine chatId={chatId} prompt={prompt} />
    </CtClientProviders>
  );
}
