// The `pluginDialog` modal as ONE co-located definition (client-architecture-lockdown.md §6d 
// #679 U5, §4.5a). `surface` placement — opened by a round-trip OUTCOME via `openPluginDialog` (a `#state`
// action carrying which (plugin, surface)), never a rail/topbar affordance. `onClose` drops the subject.
//
// ONE SLOT FOR THE PLATFORM, never one per plugin: the modal registry is a closed vocabulary assembled at the
// door, and its members are house chrome. The per-plugin fan is the SUBJECT the intent store carries.
//
// THE TITLE IS THE HOUSE'S, and it is generic on purpose: `ModalDefinition.title` is the shell's heading, drawn
// before any plugin content exists, so it names the CLASS ("Extension") rather than the instance. The plugin's
// own name and its surface title are inside, on the attribution band the body draws — which is the §4.8 order:
// the house speaks first, the plugin second, and a person can always tell which sentence is whose.

import { Blocks } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ModalDefinition } from "#state";
import { clearPluginDialog } from "#state";
import { PluginDialogBody } from "../components/plugin-dialog-body.tsx";

export const pluginDialogModal: ModalDefinition = {
  id: "pluginDialog",
  title: "Extension",
  size: "md",
  trigger: { placement: "surface", label: "Extension dialog", icon: Blocks },
  onClose: clearPluginDialog,
  body: (): ReactElement => <PluginDialogBody />,
};
