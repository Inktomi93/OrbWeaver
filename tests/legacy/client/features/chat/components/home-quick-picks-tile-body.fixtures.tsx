import { useActiveChatId } from "@orb/client/state";
import type { ReactElement } from "react";
import { ChatQuickPicksTileStory } from "../_ct-stories.tsx";

/** Drive the real launcher and observe the canonical room selection independently of its mutation. */
export function QuickPicksResumeStory(): ReactElement {
  const chatId = useActiveChatId();
  return (
    <>
      <ChatQuickPicksTileStory />
      <output aria-label="Active chat">{chatId ?? "none"}</output>
    </>
  );
}
