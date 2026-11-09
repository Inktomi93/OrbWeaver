import { useHuskReaper } from "@orb/client/data";
import { installSafeErrorRing, safeErrorRing } from "@orb/client/lib";
import { enterCreatedChat, goToLanding } from "@orb/client/state";
import type { ChatId } from "@orb/kit/ids";
import { CtClientProviders, CtNoticeControl } from "@orb/testkit/browser";
import { Button } from "@orb/ui/button";
import { Stack } from "@orb/ui/layout";
import type { ReactElement } from "react";
import { useEffect, useState } from "react";

function Reaper({ chatId, controlNotice }: { readonly chatId: ChatId; readonly controlNotice: string }): ReactElement {
  useHuskReaper();
  // main.tsx installs the bug-report ring before render; the story installs the same ring so the case can read it.
  useEffect(() => installSafeErrorRing(), []);
  const [ring, setRing] = useState("");
  return (
    <Stack>
      <Button onClick={(): void => enterCreatedChat(chatId)}>Enter the new room</Button>
      <Button onClick={goToLanding}>Leave the room</Button>
      <CtNoticeControl notice={controlNotice} />
      <Button onClick={(): void => setRing(JSON.stringify(safeErrorRing().records))}>Read the bug-report ring</Button>
      <output aria-label="Bug-report ring">{ring}</output>
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
