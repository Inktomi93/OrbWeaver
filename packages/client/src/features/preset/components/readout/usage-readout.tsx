// The Presets CONTEXT panel's BACKWARD BINDINGS — "what is using this preset" (#279; UI-Arch §4.2's
// per-section grid names this section's CONTEXT arm "usage/bindings", and until now the panel was a forward
// readout only: everything it showed was what the preset SETS, nothing was what depends on it).
//
// IT IS NOT VIEW-PROJECTED, and that is deliberate against §7's projection pin. The five readouts project
// because what the eye needs depends on which HAND is active (params / prompt / actions / data /
// transforms). "What breaks if I change this" is true of every hand — it is a property of the preset, not
// of the view — so it sits under whichever panel is showing, once, rather than five times.
//
// ── WHAT A BINDING IS, RE-DERIVED (the shape of this block IS the finding) ──────────────────────────
// A CHAT DOES NOT CARRY A PRESET. There is no `chats.preset_id` and no preset in `chats.metadata`; a room
// generates under its HOST's active pick. So the honest block is two rows, not the list the issue
// imagined:
//   • YOUR ACTIVE PRESET — the binding for ordinary rooms, and it is a SETTING, so it is stated as one.
//     Listing "every chat you host" underneath would restate the chats list without adding a fact.
//   • GM VOICE — `rpg_games.gmPresetId`, the one per-room preset override, as named doors into those rooms.
//     Membership-filtered on the server (D18 — the caller may have left a table; `resolveVisibleRooms` drops
//     rooms they can no longer open, with no residue), and named by the client's ONE title chain.
// There is NO connection/role row: a role binds a MODEL through a connection, and nothing in the connection
// domain references a preset. Rendering an empty "roles" group would invent a binding class.

import type { VisibleRoomRef } from "@orb/contracts/chat";
import type { ChatId, PresetId } from "@orb/kit/ids";
import { Button } from "@orb/ui/button";
import { Icon, MessagesSquare } from "@orb/ui/icons";
import { Section, Stack } from "@orb/ui/layout";
import { Text } from "@orb/ui/text";
import { useQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryErrorState, useTRPC } from "#data";
import { deriveChatTitle, rowQualifiers, timeLib } from "#lib";
import { selectChat, setActiveSection } from "#state";

/** The block's one sentence, per the TWO facts it actually has (side-eye 2026-08-19 P2).
 *
 *  The zero-binding arm used to end "…through the GM voice of a game below." with NOTHING below it — the
 *  sentence pointed at a list that only renders when there ARE rooms, so the state with no bindings at all
 *  read as a rendering bug. That arm now STATES THE ANSWER and names both doors out of it; the deictic
 *  "below" is spoken only when there is in fact something below. `roomsListed` is passed rather than
 *  re-derived here so the copy and the list can never disagree about what is on screen. */
function bindingLine(isDefault: boolean, roomsListed: boolean): string {
  if (isDefault) {
    return "Your active preset — every chat you host generates with it, unless a game points its GM voice somewhere else.";
  }
  return roomsListed
    ? "Not your active preset. A chat only reaches it through the GM voice of a game below."
    : "Nothing uses this preset yet — activate it, or point a game's GM voice at it.";
}

export function UsageReadout({ presetId }: { readonly presetId: PresetId }): ReactElement {
  const trpc = useTRPC();
  const usage = useQuery(trpc.preset.listUsage.queryOptions({ id: presetId }));

  const rooms = usage.data?.gmRooms ?? [];
  const isDefault = usage.data?.isUserDefault === true;

  // A FAILED READ IS NOT A SLOW ONE (#1500). `usage.data === undefined` was the only branch, so once the
  // client's two retries were spent this block printed "Checking…" for the rest of the session, with no way
  // back but a reload. The error arm is tested FIRST — `isError` implies an absent `data`, never the reverse —
  // and it carries a Retry that really re-reads (the `QueryErrorState` grammar).
  let body: ReactElement;
  if (usage.isError) {
    body = <QueryErrorState label="what uses this preset" onRetry={(): void => void usage.refetch().catch(globalThis.reportError)} />;
  } else if (usage.data === undefined) {
    body = <Text voice="gloss">Checking…</Text>;
  } else {
    body = (
      <Stack gap="row">
        <Text voice="gloss">{bindingLine(isDefault, rooms.length > 0)}</Text>
        {rooms.length === 0 ? null : <GmRooms rooms={rooms} />}
      </Stack>
    );
  }

  return (
    <Section data-slot="preset-usage" kicker="Used by">
      {body}
    </Section>
  );
}

/** The rooms whose GM voice redirects here, as doors. `rowQualifiers` runs over the WHOLE set (rooms titled
 *  by their participant names collide legitimately), which is why the stamps are computed here and not per row. */
function GmRooms({ rooms }: { readonly rooms: readonly VisibleRoomRef[] }): ReactElement {
  const stamps = rowQualifiers(
    rooms.map((room) => ({ name: deriveChatTitle(room.title, room.participantNames), at: room.at })),
    timeLib.formatRelativeCompact,
    timeLib.formatDateTime,
  );
  return (
    <Stack gap="tight">
      <Text voice="label">{rooms.length === 1 ? "GM voice in 1 game" : `GM voice in ${String(rooms.length)} games`}</Text>
      {rooms.map((room, index) => (
        <Button className="w-full justify-start" intent="ghost" key={room.id} onClick={(): void => openChat(room.id)} size="sm" type="button">
          <Icon icon={MessagesSquare} size="xs" />
          <Text as="span" className="min-w-0 truncate" voice="label">
            {deriveChatTitle(room.title, room.participantNames)}
          </Text>
          <Text as="span" className="shrink-0" voice="datum">
            {stamps[index] ?? ""}
          </Text>
        </Button>
      ))}
    </Stack>
  );
}

/** Section first, then the room — the house spelling for a cross-section room door (`notification-bell`,
 *  the corpus omnibox, the databank Active-in list), so CONTENT is already on chats when the id lands. */
function openChat(chatId: ChatId): void {
  setActiveSection("chats");
  selectChat(chatId);
}
