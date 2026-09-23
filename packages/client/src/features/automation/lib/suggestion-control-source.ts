// Automation's CONTROL SOURCE for chat's one above-composer band.
// A value, not a registration: the door (`compose/authed-app.tsx`) appends it to the `chat-controls`
// registry, and chat renders it blind through the single mount — neither feature imports the other.

import type { ChatControlSource } from "#lib";
import { AutomationSuggestionMount } from "../components/suggestion-card-mount.tsx";

/** The registry key — one source, one id; the band namespaces this source's controls under it. */
const AUTOMATION_SUGGESTION_SOURCE_ID = "automation-suggestions";

/** The S4 suggest/confirm cards. `mount` is rendered as a COMPONENT by the band, so its hooks (the room
 *  subscription, the two mutations, the TTL timer) live in their own fiber. */
export const automationSuggestionSource: ChatControlSource = {
  id: AUTOMATION_SUGGESTION_SOURCE_ID,
  mount: AutomationSuggestionMount,
};
