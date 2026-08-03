// chatOptionsChrome — the active chat's options ⋯ as a registered `topbar.trail` widget, sorted to the END
// of the ghost cluster (order 40, after the shell's focus/detail toggles; ui-cohesion-north-star §4 N1
// moves it out of the identity row). `useVisible` gates it to the CHATS section on an ACTIVE (draft OR
// committed) chat — NOT just committed: the ⋯ menu is the ONE options surface for both phases (a draft
// renders it with the not-yet-available actions DISABLED, never a vanished/parallel reduced surface, #8).
// The trail is section-agnostic, so a stale active-chat pointer on another section must NOT surface it.
// shell-chrome-unification.md §A.

import type { ReactElement } from "react";
import type { ChromeEntry } from "#state";
import { isLanding, useActiveChatHandle, useActiveSection } from "#state";
import { ChatOptionsTopbar } from "../components/chat-options-topbar.tsx";

export const chatOptionsChrome: ChromeEntry = {
  id: "chat-options",
  label: "Chat options",
  zone: "topbar.trail",
  order: 40,
  useVisible: (): boolean => {
    const section = useActiveSection();
    const handle = useActiveChatHandle();
    return section === "chats" && !isLanding(handle);
  },
  behavior: { kind: "widget", body: (_presentation): ReactElement => <ChatOptionsTopbar /> },
};
