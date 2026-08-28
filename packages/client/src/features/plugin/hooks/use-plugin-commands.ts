// The COMMAND read + the ONE runner both consuming surfaces share (plugin-ui-plane #679 U5, §4.5): the
// `/plugin` composer dispatch and the "Plugins" chrome menu.
//
// TWO SURFACES, ONE RUNNER — deliberately. The menu item and the slash line must do the identical thing
// (resolve the command off the caller's own installs, invoke it, apply the outcome), and the moment that lives
// twice they drift: one grows a toast the other does not, one forgets to pass the room. So the hook below IS
// the behaviour, and each surface only decides how it is triggered.

import type { ChatId, PluginId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { useInvokeUiCommand } from "../lib/plugin-mutations.ts";
import { applyPluginUiOutcome } from "../lib/plugin-ui-outcome.ts";

/** One registered plugin command as both surfaces read it — the wire projection, unchanged. */
export interface PluginCommandView {
  readonly pluginId: PluginId;
  readonly slug: string;
  readonly pluginName: string;
  readonly name: string;
  readonly describe: string;
}

/** Every command across the caller's granted-and-enabled plugins, in a stable (plugin, command) order. Not a
 *  suspense read: the composer and the chrome menu are both always-mounted chrome, and neither may block the
 *  shell on a plugin catalog. */
export function usePluginCommands(): readonly PluginCommandView[] {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.plugin.listCommands.queryOptions());
  return (data ?? []).toSorted((a, b) => a.pluginName.localeCompare(b.pluginName) || a.name.localeCompare(b.name));
}

/** What a failed resolve tells the person. Written HERE, module-private, so the slash line and the menu say
 *  the same sentence — the runner below is the ONE place either surface can reach it. */
const PLUGIN_COMMAND_UNKNOWN = "No plugin command by that name — try the Plugins menu to see what you have.";

/** The ONE runner: resolve `(slug, name)` against the caller's own commands, invoke it, apply the host-mediated
 *  outcome. An unresolved pair is a house toast, never a silent no-op — a slash line that vanishes teaches a
 *  person that the feature is broken. */
export function usePluginCommandRunner(chatId: ChatId | null): (slug: string, name: string, args: string) => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const invoke = useInvokeUiCommand({ trpc, invalidation });
  const commands = usePluginCommands();
  // No manual memoization — the React Compiler runs full-compile on this tree and already caches this closure
  // across renders (D54). A hand-rolled `useCallback` here would be a second, weaker cache beside its.
  return (slug: string, name: string, args: string): void => {
    const command = commands.find((candidate) => candidate.slug === slug && candidate.name === name);
    if (command === undefined) {
      notify.error(PLUGIN_COMMAND_UNKNOWN);
      return;
    }
    void invoke
      .mutateAsync({ pluginId: command.pluginId, name: command.name, args, chatId })
      // The outcome is the plugin's host-mediated chrome (§4.5a): its toasts, and at most one dialog open.
      .then((outcome) => applyPluginUiOutcome(command.pluginId, outcome))
      // Handled already by the mutation's own `errorToast`; this keeps a handled rejection from surfacing as an
      // unhandled one on a fire-and-forget path.
      .catch(() => undefined);
  };
}
