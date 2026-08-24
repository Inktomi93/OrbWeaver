// The `/imagine` slash command (client-architecture-lockdown.md §6c) — assembled at the door into the ONE
// slash-command registry both the composer and the palette read. Grafts onto both surfaces WITHOUT importing
// chat. A room-less invocation is REFUSED with a reason (never hidden — the one-real-surface rule); the mount
// opens the imagine modal seeded with the parsed mode + prompt.

import { ImagePlus } from "@orb/ui/icons";
import type { SlashCommandContribution } from "#lib";
import { ImagineSlashMount } from "../components/imagine-slash-mount.tsx";

const imagineCommand: SlashCommandContribution = {
  id: "imagine",
  label: "Imagine",
  describe: "Generate an image in this chat",
  usage: "[you·face·scene·background] <prompt>",
  keywords: ["image", "picture", "draw", "paint", "art", "generate"],
  icon: ImagePlus,
  group: "create",
  unavailableReason: (context) => (context.chatId === null ? "Open a chat to generate an image." : null),
  mount: ImagineSlashMount,
};

/** The imagery-owned slash commands, assembled at `compose/authed-app.tsx` into the one slash registry. */
export const imagerySlashCommands: readonly SlashCommandContribution[] = [imagineCommand];
