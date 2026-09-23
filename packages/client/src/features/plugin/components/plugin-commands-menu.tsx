// The "Plugins" chrome MENU — the wand (U5, §4.5; ST parity row 3, "top-bar / wand-menu
// buttons"). ONE house menu listing every command the caller's granted-and-enabled plugins registered, grouped
// by plugin.
//
// THE FIDELITY IS STATED, not glossed: ST extensions add arbitrary DOM to the top bar; here they add ITEMS to
// ONE labelled menu the house draws. That is the chrome-registry law (the registry stays door-owned, a widget is
// a fixed first-party member) AND the impersonation wall — a plugin that could paint the topbar could paint the
// app's own affordances.
//
// SILENT WHEN EMPTY, and the same shape as every other trail widget: `useVisible` returns false with no
// commands, so a person who has installed nothing (or nothing with commands) sees a topbar byte-identical to a
// build with no plugin plane at all. That is the contribution law's "zero registrants ⇒ the host renders its own
// default" applied to a widget whose registrants are DATA rather than door members.

import { Button } from "@orb/ui/button";
import { Icon, WandSparkles } from "@orb/ui/icons";
import { Menu, MenuGroup, MenuGroupLabel, MenuItem, MenuPopup, MenuTrigger } from "@orb/ui/menu";
import { Text } from "@orb/ui/text";
import type { ReactElement } from "react";
import { useActiveChatId } from "#state";
import { usePluginCommands, useRunPluginCommand } from "../hooks/use-plugin-commands.ts";

/** Group the flat command list by plugin, preserving the hook's (plugin, command) order. */
function groupByPlugin(commands: ReturnType<typeof usePluginCommands>): readonly { readonly pluginName: string; readonly commands: typeof commands }[] {
  const groups: { pluginName: string; commands: (typeof commands)[number][] }[] = [];
  for (const command of commands) {
    const last = groups.at(-1);
    if (last !== undefined && last.pluginName === command.pluginName) {
      last.commands.push(command);
    } else {
      groups.push({ pluginName: command.pluginName, commands: [command] });
    }
  }
  return groups;
}

export function PluginCommandsMenu({ presentation }: { readonly presentation: "bar" | "sheet" }): ReactElement | null {
  const commands = usePluginCommands();
  // The ROOM the command runs in, when there is one. A command run from a non-chat screen carries `null` and
  // the server admits no chat scope — `chat.current()` throws in the guest, which is the honest answer.
  const chatId = useActiveChatId();
  const runCommand = useRunPluginCommand(chatId);
  if (commands.length === 0) {
    return null;
  }
  const groups = groupByPlugin(commands);
  // The SHEET lens: a phone's You sheet renders the same commands as a flat list of rows rather than a menu —
  // a popover inside a sheet is a second layer over a layer, which is the shape the sheet exists to avoid.
  if (presentation === "sheet") {
    return (
      <>
        {commands.map((command) => (
          <Button intent="ghost" key={`${command.pluginId}:${command.name}`} onClick={(): void => runCommand(command)} size="sm">
            <Text voice="label">{`${command.pluginName} · ${command.name}`}</Text>
          </Button>
        ))}
      </>
    );
  }
  return (
    <Menu>
      <MenuTrigger
        render={
          <Button aria-label="Plugin commands" intent="ghost" size="sm">
            <Icon icon={WandSparkles} size="sm" />
          </Button>
        }
      />
      <MenuPopup>
        {groups.map((group) => (
          <MenuGroup key={group.pluginName}>
            {/* The group label IS the attribution: every command a person reads sits under the name of the
                plugin that registered it, so the menu can never present a plugin's command as the app's own. */}
            <MenuGroupLabel>{group.pluginName}</MenuGroupLabel>
            {group.commands.map((command) => (
              <MenuItem key={`${command.pluginId}:${command.name}`} onClick={(): void => runCommand(command)}>
                {command.describe}
              </MenuItem>
            ))}
          </MenuGroup>
        ))}
      </MenuPopup>
    </Menu>
  );
}
