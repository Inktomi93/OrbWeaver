// The one notice a freshly created or joined room raises about your persona: said only when something other
// than your default decided who you play there. Derived on the client from what it already holds: your seed
// pointers and the room's seat. A roster start names its persona itself, so its caller passes nothing here.

import type { QueryClient } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import { notify } from "#lib";
import { peekQueryData } from "./peek-query.ts";
import type { Trpc } from "./trpc.ts";

type ChatDetail = inferOutput<Trpc["chat"]["getChat"]>;

// Only a non-default persona selection needs explanation when entering a room.
function newRoomPersonaNotice(
  chat: Pick<ChatDetail, "viewerActivePersonaId" | "identities"> & {
    readonly participants: readonly Pick<ChatDetail["participants"][number], "kind" | "displayName">[];
  },
  seeds: { readonly defaultPersonaId: string | null },
): string | null {
  const seatId = chat.viewerActivePersonaId;
  if (seatId === null || seatId === seeds.defaultPersonaId) {
    return null;
  }
  const name = chat.identities.find((e) => e.kind === "persona" && e.id === seatId)?.name;
  if (name === undefined) {
    return null;
  }
  if (seeds.defaultPersonaId === null) {
    return `No default set — you're playing as ${name}, your last persona.`;
  }
  const characters = chat.participants.filter((p) => p.kind === "character");
  const character = characters.length === 1 ? characters[0]?.displayName : undefined;
  return character === undefined ? null : `You're playing as ${name} here — ${name} is connected to ${character}.`;
}

/** Raise {@link newRoomPersonaNotice} under the viewer's `persona.showNotifications`, from the cached settings. */
export function notifyNewRoomPersona(queryClient: QueryClient, trpc: Trpc, chat: ChatDetail): void {
  const settings = peekQueryData(queryClient, trpc.settings.getUserSettings.queryKey());
  if (settings === undefined || !settings.config.persona.showNotifications) {
    return;
  }
  const notice = newRoomPersonaNotice(chat, settings.config.seeds);
  if (notice !== null) {
    notify.info(notice);
  }
}
