import { useHuskReaper } from "@orb/client/data";
import { enterCreatedChat, goToLanding, openImagine } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtModalCommit } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";

function Reaper(): null {
  useHuskReaper();
  return null;
}

function SeededImagine({ chatId, prompt, children }: { readonly chatId: ChatId; readonly prompt: string; readonly children: ReactNode }): ReactElement {
  useState(() => {
    openImagine({ chatId, mode: "free", prompt });
    return true;
  });
  return <CtModalCommit modalId="imagine">{children}</CtModalCommit>;
}

/** The real imagine commit for one room, the app root's husk reaper, and the store actions that enter a room as just
 *  created and leave it. The modal dialog makes the page around it inert, so the actions ride inside it. */
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
      <SeededImagine chatId={chatId} prompt={prompt}>
        <Button onClick={(): void => enterCreatedChat(chatId)}>Enter the new room</Button>
        <Button onClick={(): void => enterCreatedChat(otherChatId)}>Enter another new room</Button>
        <Button onClick={goToLanding}>Go to the landing</Button>
      </SeededImagine>
    </CtClientProviders>
  );
}
