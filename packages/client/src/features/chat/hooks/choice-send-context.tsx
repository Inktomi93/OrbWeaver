// P5 CYOA click→send — the context + consumer half (the Provider is `choice-send-provider.tsx`, split out
// so a JSX module never mixes a hook export with a component export — the attachment-url-context
// precedent). A `:::choices` block's option button sends the option TEXT as the user's next turn through
// the room's `useSendMessage` (§5.3 — a choice IS a user turn: it commits, swipes, and steers identically
// to typed input; zero new turn machinery). The default `null` (a provider-less mount: a CT story, the
// read-only edit preview) renders the options as DISABLED buttons — same surface, inert affordance.

import { createContext, useContext } from "react";

/** The room's choice-send capability: `send` fires the option text as a user turn; `busy` disables the
 *  buttons while a turn is in flight (the existing send-in-flight state, §5.3). */
export interface ChoiceSend {
  readonly send: (text: string) => void;
  readonly busy: boolean;
}

/** Null = no send capability in this tree (provider-less mount) — options render disabled. */
export const ChoiceSendContext = createContext<ChoiceSend | null>(null);

/** The room-scoped choice-send capability, or null when none is provided. */
export function useChoiceSend(): ChoiceSend | null {
  return useContext(ChoiceSendContext);
}
