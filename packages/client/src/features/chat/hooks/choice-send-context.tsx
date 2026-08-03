// P5 CYOA click→choose — the context + consumer half (the Provider is `choice-send-provider.tsx`, split out
// so a JSX module never mixes a hook export with a component export — the attachment-url-context
// precedent). A `:::choices` block's option button routes the option TEXT through the room's `choose`,
// whose behavior is gated by the game's `cyoaChoiceBehavior` knob (§5.4): `send` fires the option as the
// user's next turn immediately (a choice IS a user turn — commits/swipes/steers identically to typed input;
// zero new turn machinery); `compose` (the default) drops the option into the composer draft + focuses it,
// so the reader appends flavor before sending. The default `null` (a provider-less mount: a CT story, the
// read-only edit preview) renders the options as DISABLED buttons — same surface, inert affordance.

import { createContext, use } from "react";

/** The room's choice capability: `choose` routes the option text per the game's `cyoaChoiceBehavior` knob
 *  (send-now vs compose-into-draft); `busy` disables the buttons while a turn is in flight (§5.3/§5.4). */
export interface ChoiceSend {
  readonly choose: (text: string) => void;
  readonly busy: boolean;
}

/** Null = no send capability in this tree (provider-less mount) — options render disabled. */
export const ChoiceSendContext = createContext<ChoiceSend | null>(null);

/** The room-scoped choice-send capability, or null when none is provided. */
export function useChoiceSend(): ChoiceSend | null {
  return use(ChoiceSendContext);
}
