// The one `topbar.trail` entry for the `topbar` placement. Its commands are data off `plugin.listCommands`, so the
// chrome registry never grows on install, and `useVisible` leaves the row untouched when no plugin places here.

import type { ReactElement } from "react";
import type { ChromeEntry } from "#state";
import { PluginTopbarCommands } from "../components/plugin-topbar-commands.tsx";
import { usePlacedCommands } from "../hooks/use-placed-commands.ts";
import { usePluginTopbarForms } from "../hooks/use-plugin-topbar-forms.ts";

export const pluginTopbarChrome: ChromeEntry = {
  id: "plugin-topbar",
  label: "Plugin top bar commands",
  zone: "topbar.trail",
  // After every house entry: third-party width overflows first, so a plugin never pushes a host control off the row.
  order: 120,
  // The phone row belongs to the room's name; the You sheet renders these commands as rows.
  mobile: "sheet",
  useVisible: (): boolean => usePlacedCommands("topbar").length > 0,
  behavior: {
    kind: "widget",
    body: (presentation): ReactElement => <PluginTopbarCommands presentation={presentation} />,
    useMenuForms: usePluginTopbarForms,
  },
};
