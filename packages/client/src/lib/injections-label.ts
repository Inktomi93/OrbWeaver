// The name of the chat's injections list, said once for every screen that points at it (D116). A zero-import leaf, so a
// names module and a spec's node side read it without loading the component graph. It also names what each sent
// injection is, in the prompt view.

import type { ChatInjectionOrigin } from "@orb/contracts/chat";
import type { AuthorsNoteEdge } from "@orb/kit/world-info";

export const INJECTIONS_LABEL = "Injections";

/** The two ends of the injections list, which world info can be seated at. */
export const AUTHORS_NOTE_EDGE_LABELS: Record<AuthorsNoteEdge, string> = {
  top: `Top of the ${INJECTIONS_LABEL}`,
  bottom: `Bottom of the ${INJECTIONS_LABEL}`,
};

const ORIGIN_LABELS: Record<ChatInjectionOrigin, string> = {
  user: "Chat injection",
  ["world-info"]: "World info",
  persona: "Persona",
  ["authors-note"]: "Character note",
  guided: "Guided steer",
  ["game-state"]: "Game state",
  ["new-chat-marker"]: "New chat marker",
};

/** An injection recorded before its producer was stamped carries no origin. */
const UNSTAMPED_LABEL = "Injection";

/** The producer of one sent injection, with its seat for world info seated beside the chat's injections. */
export function sentInjectionLabel(injection: { readonly origin?: ChatInjectionOrigin | undefined; readonly seatedAt?: AuthorsNoteEdge | undefined }): string {
  const origin = injection.origin === undefined ? UNSTAMPED_LABEL : ORIGIN_LABELS[injection.origin];
  return injection.seatedAt === undefined ? origin : `${origin} · ${AUTHORS_NOTE_EDGE_LABELS[injection.seatedAt]}`;
}
