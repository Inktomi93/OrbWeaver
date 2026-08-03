// The character-owned SLASH COMMANDS (client-architecture-lockdown.md §6c) — grafted onto the chat
// composer AND the command palette without importing features/chat; the `SlashCommandContribution`
// contract is the only coupling, and `main.tsx` is the one assembly.
//
// This is the seam's proof by REAL registrant: "New character" used to be a hardcoded row inside chat's
// palette surface (a cross-feature action owned by the wrong slice). It now lives with its own feature.

import { Users } from "@orb/ui/icons";
import type { SlashCommandContribution } from "#lib";
import { SlashNewCharacterMount } from "../components/slash-new-character-mount.tsx";

/** `/new-character` — opens the Characters section (the palette's former hardcoded "New character" row). */
const newCharacterCommand: SlashCommandContribution = {
  id: "new-character",
  label: "New character",
  describe: "Create a character",
  keywords: ["new", "character"],
  icon: Users,
  group: "create",
  mount: SlashNewCharacterMount,
};

/** The character-owned slash commands, assembled at `main.tsx` into the one slash-command registry. */
export const characterSlashCommands: readonly SlashCommandContribution[] = [newCharacterCommand];
