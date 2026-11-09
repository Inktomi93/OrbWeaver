import { useHuskReaper } from "@orb/client/data";
import { enterCreatedChat, goToLanding } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtNoticeControl } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";

function Reaper({ chatId, controlNotice }: { readonly chatId: ChatId; readonly controlNotice: string }): ReactElement {
  useHuskReaper();
  return (
    <Stack>
      <Button onClick={(): void => enterCreatedChat(chatId)}>Enter the new room</Button>
      <Button onClick={goToLanding}>Leave the room</Button>
      <CtNoticeControl notice={controlNotice} />
    </Stack>
  );
}

/** The production husk reaper under the production providers, with the store actions that create and leave a room. */
export function HuskReaperStory({ chatId, controlNotice }: { readonly chatId: ChatId; readonly controlNotice: string }): ReactElement {
  return (
    <CtClientProviders>
      <Reaper chatId={chatId} controlNotice={controlNotice} />
    </CtClientProviders>
  );
}
