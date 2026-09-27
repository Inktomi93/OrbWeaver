// Chat's own SLASH COMMANDS — the built-in palette actions re-homed as first-class contributions, so the
// command palette and the composer read ONE source of truth (client-architecture-lockdown.md §5 rule 4:
// derive, don't re-declare). Before this, "New chat" was a hardcoded cmdk row the composer could not
// reach; it is now a definition both surfaces consume blind, exactly like a grafted feature's command.
//
// Assembled at the door (main.tsx, G8) — this file exports values, never registers.

import { LayoutGrid, Plus } from "@orb/ui/icons";
import type { SlashCommandContribution } from "#lib";
import { SlashGalleryMount } from "../components/slash-gallery-mount.tsx";
import { SlashNewChatMount } from "../components/slash-new-chat-mount.tsx";

/** `/new-chat` — opens the new-chat character picker (the palette's former hardcoded "New chat" row). */
const newChatCommand: SlashCommandContribution = {
  id: "new-chat",
  label: "New chat",
  describe: "Start a new thread",
  keywords: ["new", "chat", "thread"],
  icon: Plus,
  group: "create",
  mount: SlashNewChatMount,
};

/** `/gallery` — opens the gallery of this room's character, for the viewer who owns it. */
const galleryCommand: SlashCommandContribution = {
  id: "gallery",
  label: "Gallery",
  describe: "Open this chat's character gallery",
  keywords: ["gallery", "images", "pictures", "photos"],
  icon: LayoutGrid,
  unavailableReason: (context) => (context.chatId === null ? "Open a chat to see its character's gallery." : null),
  mount: SlashGalleryMount,
};

/** The chat-owned slash commands, assembled at `main.tsx` into the one slash-command registry. */
export const chatSlashCommands: readonly SlashCommandContribution[] = [newChatCommand, galleryCommand];
