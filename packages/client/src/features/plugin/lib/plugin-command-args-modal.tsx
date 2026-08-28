// The `pluginCommandArgs` modal as ONE co-located definition (client-architecture-lockdown.md §6d; #791). The
// `pluginDialog` posture exactly: a `surface`-placement slot opened ONLY by a `#state` action
// (`openPluginCommandArgs`, fired by the command palette source when a picked command DECLARES typed args), never
// a rail/topbar affordance. `onClose` drops the subject so a re-open never inherits a stale one.
//
// ONE SLOT FOR THE PLATFORM, never one per command: the modal registry is a closed vocabulary assembled at the
// door, and its members are house chrome. The per-command fan is the SUBJECT the intent store carries.

import { Blocks } from "@orb/ui/icons";
import type { ReactElement } from "react";
import type { ModalDefinition } from "#state";
import { clearPluginCommandArgs } from "#state";
import { PluginCommandArgsBody } from "../components/plugin-command-args-body.tsx";

export const pluginCommandArgsModal: ModalDefinition = {
  id: "pluginCommandArgs",
  title: "Run command",
  size: "sm",
  trigger: { placement: "surface", label: "Command arguments", icon: Blocks },
  onClose: clearPluginCommandArgs,
  body: (): ReactElement => <PluginCommandArgsBody />,
};
