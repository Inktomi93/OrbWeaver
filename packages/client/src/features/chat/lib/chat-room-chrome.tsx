// The open room's Members and Memory entries, registered as `topbar.trail` widgets. They sit last among the host's own
// trail entries, Members before Memory, so after any plugin buttons the trail's overflow row moves Memory into the
// "More top bar actions" menu first and Members next, and the menu trigger itself stays in the row. Both are visible only while the Chats section holds an open room.

import { BrainCircuit, Users } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { OverflowMenuForm } from "#lib";
import type { ChromeEntry } from "#state";
import { useActiveSection, useRecallState } from "#state";
import { RoomRecallChip, RoomRosterChip } from "../components/chat-header.tsx";
import { useRoomRoster } from "../hooks/use-room-roster.ts";
import { chatMembersEntryName } from "./chat-surface-names.ts";
import { openMembersTab } from "./open-members-tab.ts";
import { recallLabel } from "./recall-label.ts";
import { recallRequests } from "./recall-requests.ts";

function useRoomOpen(): boolean {
  const section = useActiveSection();
  const { chatId, resolved } = useRoomRoster();
  return section === "chats" && chatId !== null && resolved;
}

function useMembersMenuForms(): readonly OverflowMenuForm[] {
  const { memberCount } = useRoomRoster();
  return [{ id: "chat-members", label: chatMembersEntryName(memberCount), icon: Users, onSelect: openMembersTab }];
}

function useMemoryMenuForms(): readonly OverflowMenuForm[] {
  const { chatId } = useRoomRoster();
  const recall = useRecallState(chatId);
  return [{ id: "chat-memory", label: recallLabel(recall), icon: BrainCircuit, onSelect: (): void => recallRequests.request() }];
}

export const chatMembersChrome: ChromeEntry = {
  id: "chat-members",
  label: "Members",
  zone: "topbar.trail",
  order: 100,
  useVisible: useRoomOpen,
  behavior: { kind: "widget", body: (): ReactElement => <RoomRosterChip />, useMenuForms: useMembersMenuForms },
};

export const chatMemoryChrome: ChromeEntry = {
  id: "chat-memory",
  label: "Memory",
  zone: "topbar.trail",
  order: 110,
  useVisible: useRoomOpen,
  behavior: { kind: "widget", body: (): ReactElement => <RoomRecallChip />, useMenuForms: useMemoryMenuForms },
};
