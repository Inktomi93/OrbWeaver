// The per-room OFFER-CHOICES switch (B1, RULED F2) — the CLIENT half of `chat.setOfferChoices`.
//
// WHAT IT DOES, in the host's terms: turn it on and this room's model is told it may end a reply with a set
// of choices; when it does, the reader sees them as buttons that drop the pick into the composer to edit
// and send. The one-shot equivalent is "Offer choices" in the composer's ✨ menu — that asks for the next
// reply only, this one is the room's standing posture.
//
// A room-settings control on the chat context panel's "This chat" tab (NOT a settings pane), mounted only
// under `isHost` — the §8.1 permission-OMIT, matching the two host switches beside it. It reaches the
// PROMPT (unlike its render-only display-scripts neighbour), which is why host is the floor.
//
// THE INHERIT SEAM IS THE WHOLE REASON THIS FILE HAS A HOOK CALL IT LOOKS LIKE IT DOESN'T NEED. A room that
// has never been pinned reads `ChatDetail.offerChoices === null`, and what it RESOLVES to is the host's own
// per-user default — so the switch has to read that default to show the truth. `resolveOfferChoices` (in
// `@orb/contracts/chat`) is the one home of that precedence, shared with the server's turn resolution: two
// spellings of it is how a toggle starts disagreeing with what the model is actually being told. The host's
// settings are the right ones to read here without any cross-user hazard, because this control renders only
// for the host — the viewer IS the room's host.

import { resolveOfferChoices } from "@orb/contracts/chat";
import type { ChatId } from "@orb/kit/ids";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { SettingSwitchRow } from "#components";
import { useInvalidation, useTRPC } from "#data";
import { useChatBehaviorPrefs } from "../hooks/use-chat-behavior-prefs.ts";
import { useSetOfferChoices } from "../hooks/use-context-panel-mutations.ts";

export interface OfferChoicesControlProps {
  readonly chatId: ChatId;
}

/** The host-only "offer choices in this chat" row. */
export function OfferChoicesControl({ chatId }: OfferChoicesControlProps): ReactElement {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const { data: chat } = useSuspenseQuery(trpc.chat.getChat.queryOptions({ chatId }));
  const prefs = useChatBehaviorPrefs();
  const setEnabled = useSetOfferChoices({ trpc, invalidation });
  return (
    // `SettingSwitchRow`, not a hand-paired Field+Switch: the composite is the ONE home for the row
    // grammar, and Base UI mints the label/control id from field context (C21 / LANE NAVFORM).
    <SettingSwitchRow
      label="Offer choices"
      description="Ask this chat's model to end replies with a few numbered options; clicking one puts it in your composer to edit before you send. Your default for new chats lives in Settings → Chat behavior."
      checked={resolveOfferChoices(chat.offerChoices ?? undefined, prefs.offerChoices)}
      onChange={(next): void => {
        setEnabled.mutate({ chatId, enabled: next });
      }}
    />
  );
}
