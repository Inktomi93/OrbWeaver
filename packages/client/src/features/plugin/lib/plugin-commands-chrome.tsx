// pluginCommandsChrome — the registered `topbar.trail` widget for the "Plugins" wand menu.
// ONE first-party chrome entry for the whole
// platform: the commands inside it are DATA, fanned per-plugin off `plugin.listCommands`, so the chrome registry
// never grows when a person installs something.
//
// `useVisible` is the SILENCE rule: no commands ⇒ no affordance, so a topbar in a deployment with no plugins (or
// no plugin commands) is byte-identical to a build without this entry. It reads the SAME query the menu body
// reads — react-query dedupes the key, so this is a second reader, not a second source.
//
// `mobile: "sheet"` — the phone topbar is already at its budget (the notifications bell was curated out of it
// for exactly this reason), and a wand competing with the room's own name loses. The sheet lens renders the
// commands as plain rows.

import type { ReactElement } from "react";
import type { ChromeEntry } from "#state";
import { PluginCommandsMenu } from "../components/plugin-commands-menu.tsx";
import { usePluginCommands } from "../hooks/use-plugin-commands.ts";

export const pluginCommandsChrome: ChromeEntry = {
  id: "plugin-commands",
  label: "Plugin commands",
  zone: "topbar.trail",
  mobile: "sheet",
  useVisible: (): boolean => usePluginCommands().length > 0,
  behavior: { kind: "widget", body: (presentation): ReactElement | null => <PluginCommandsMenu presentation={presentation} /> },
};
