// The `/plugin` slash command (client-architecture-lockdown.md §6c U5, §4.5) — ONE static
// first-party contribution, assembled at the door into the registry both the composer and the palette read.
//
// THE DOOR DOES NOT GROW PER PLUGIN (G8). This array has exactly one member forever: the per-plugin fan happens
// INSIDE the mount, off `plugin.listCommands`. That is also the impersonation wall at the command tier — a
// plugin's entire reachable namespace is the two tokens after `/plugin`, so it can never claim a house token or
// shadow another plugin's.
//
// IT IS AVAILABLE OUTSIDE A ROOM, and that is a real difference from `/imagine`: a plugin command need not be
// about a chat (a hub browser's "refresh catalogue" is not), and the server admits the room only when one is in
// view. So there is no `unavailableReason` — the command is always runnable, and a command that DOES need a
// room gets its refusal from its own guest, which is the only side that knows.

import { Blocks } from "@orb/ui/icons";
import type { SlashCommandContribution } from "#lib";
import { PluginSlashMount } from "../components/plugin-slash-mount.tsx";

const pluginCommand: SlashCommandContribution = {
  id: "plugin",
  label: "Plugin command",
  describe: "Run a command a plugin registered",
  usage: "<plugin> <command> [args]",
  keywords: ["extension", "addon", "add-on", "plugin", "command"],
  icon: Blocks,
  group: "commands",
  mount: PluginSlashMount,
};

/** The plugin-owned slash commands, assembled at `compose/authed-app.tsx` into the one slash registry. */
export const pluginSlashCommands: readonly SlashCommandContribution[] = [pluginCommand];
