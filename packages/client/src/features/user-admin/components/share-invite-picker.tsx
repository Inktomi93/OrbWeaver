// The Share card's "Invite someone to a room": a menu of the owner's newest rooms. Picking one opens that room's
// Members tab with its invite dialog, the one place invites are made. The rooms read only while the menu is open.

import { Button } from "@orb/ui/button";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { ReactElement } from "react";
import { QueryBoundary } from "#components";
import { useTRPC } from "#data";
import { deriveChatTitle } from "#lib";
import { openRoomInvite } from "#state";

// Enough rooms to find a recent one; an older room is one search away in Chats.
const ROOM_PICKER_LIMIT = 20;

export function InviteRoomPicker(): ReactElement {
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button type="button" intent="ghost" size="inline">
            Invite someone to a room
          </Button>
        }
      />
      <MenuPopup align="start">
        <MenuGroup>
          <MenuGroupLabel>Your newest rooms</MenuGroupLabel>
          <QueryBoundary
            fallback={<MenuItem disabled={true}>Loading rooms</MenuItem>}
            renderError={(): ReactElement => <MenuItem disabled={true}>The rooms could not be read. Close this menu and open it again.</MenuItem>}
          >
            <RoomItems />
          </QueryBoundary>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  );
}

function RoomItems(): ReactElement {
  const trpc = useTRPC();
  const { data } = useSuspenseQuery(trpc.chat.listChats.queryOptions({ limit: ROOM_PICKER_LIMIT }));
  if (data.items.length === 0) {
    return <MenuItem disabled={true}>No rooms yet. Start one in Chats, then invite from it.</MenuItem>;
  }
  return (
    <>
      {data.items.map((room) => (
        <MenuItem key={room.id} data-invite-room={room.id} onClick={(): void => openRoomInvite(room.id)}>
          {deriveChatTitle(room.title, room.participantNames)}
        </MenuItem>
      ))}
    </>
  );
}
