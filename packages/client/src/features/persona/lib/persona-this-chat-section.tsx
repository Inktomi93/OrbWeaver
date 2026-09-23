// The persona THIS-CHAT config-section CONTRIBUTION — the per-chat picker
// (Playing as · the pinned {{user}} row · Restamp) as the Personas group's third section. The SAME component
// the rail popover and the You sheet render; only this mount hands it the anchor and an `idle` body, so its
// LIST row lands on real words when no chat is open instead of scrolling to nothing (F-12 as superseded).
// The PINNED row is this section's search leaf (fork F-14). No `owns`: chat verbs, not settings.

import { Text } from "@orb/ui/text";
import type { ConfigSectionContribution } from "#state";
import { configAnchorId } from "#state";
import { PersonaThisChatSection } from "../components/persona-this-chat-section.tsx";
import { PERSONA_THIS_CHAT_SUBCATEGORY } from "./personas-nav.ts";

export const personaThisChatSection: ConfigSectionContribution = {
  id: "persona-this-chat",
  anchor: "personas",
  nav: PERSONA_THIS_CHAT_SUBCATEGORY,
  body: () => (
    <PersonaThisChatSection
      anchorId={configAnchorId("personas", PERSONA_THIS_CHAT_SUBCATEGORY.id)}
      idle={<Text voice="gloss">Open a chat to choose who you play as there, and who its card sees you as.</Text>}
    />
  ),
};
