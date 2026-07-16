// chatOptionsChrome — the active chat's options ⋯ as a registered `topbar.trail` widget, sorted to the END
// of the ghost cluster (order 40, after the shell's focus/detail toggles; ui-cohesion-north-star §4 N1
// moves it out of the identity row). `useVisible` gates it to the CHATS section with a committed chat — the
// trail is section-agnostic, so a stale active-chat pointer on another section must NOT surface it.
// shell-chrome-unification.md §A.

import type { ReactElement } from "react";
import type { ChromeEntry } from "#state";
import { useActiveChatId, useActiveSection } from "#state";
import { ChatOptionsTopbar } from "../components/chat-options-topbar";

export const chatOptionsChrome: ChromeEntry = {
  id: "chat-options",
  label: "Chat options",
  zone: "topbar.trail",
  order: 40,
  useVisible: (): boolean => {
    const section = useActiveSection();
    const chatId = useActiveChatId();
    return section === "chats" && chatId !== null;
  },
  behavior: { kind: "widget", body: (_presentation): ReactElement => <ChatOptionsTopbar /> },
};
