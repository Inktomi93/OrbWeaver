// The COMMAND read + the ONE runner both consuming surfaces share: the
// `/plugin` composer dispatch and the "Plugins" chrome menu.
//
// TWO SURFACES, ONE RUNNER — deliberately. The menu item and the slash line must do the identical thing
// (resolve the command off the caller's own installs, invoke it, apply the outcome), and the moment that lives
// twice they drift: one grows a toast the other does not, one forgets to pass the room. So the hook below IS
// the behaviour, and each surface only decides how it is triggered.

import type { PluginCommandArgSpec, PluginCommandArgValue } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";
import { useQuery } from "@tanstack/react-query";
import { useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import { openPluginCommandArgs } from "#state";
import { useInvokeUiCommand } from "../lib/plugin-mutations.ts";
import { applyPluginUiOutcome } from "../lib/plugin-ui-outcome.ts";

/** One registered plugin command as both surfaces read it — the wire projection, unchanged. `args` is the #791
 *  DECLARED typed-arg grammar (empty when the command declared none), read by the palette to build its typed
 *  input strip and by the composer to parse/complete `name=value`. */
export interface PluginCommandView {
  readonly pluginId: PluginId;
  readonly slug: string;
  readonly pluginName: string;
  readonly name: string;
  readonly describe: string;
  readonly args: readonly PluginCommandArgSpec[];
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
 *  person that the feature is broken.
 *
 *  It carries BOTH the raw `args` remainder (a command's own opaque grammar — the U5 shape) AND the #791 typed
 *  `values` bag the surfaces collected against the command's declared args (`{}` for a command that declared
 *  none). The server re-validates `values` against the resident command's specs, so a mistyped/missing/off-enum
 *  value is refused there too. */
export function usePluginCommandRunner(
  chatId: ChatId | null,
): (slug: string, name: string, args: string, values: Record<string, PluginCommandArgValue>) => void {
  const trpc = useTRPC();
  const invalidation = useInvalidation();
  const invoke = useInvokeUiCommand({ trpc, invalidation });
  const commands = usePluginCommands();
  // No manual memoization — the React Compiler runs full-compile on this tree and already caches this closure
  // across renders (D54). A hand-rolled `useCallback` here would be a second, weaker cache beside its.
  return (slug: string, name: string, args: string, values: Record<string, PluginCommandArgValue>): void => {
    const command = commands.find((candidate) => candidate.slug === slug && candidate.name === name);
    if (command === undefined) {
      notify.error(PLUGIN_COMMAND_UNKNOWN);
      return;
    }
    // @orb-waive caught-failure-ownership(mutateAsync): the comment below explains — the
    // mutation's own errorToast already told the person; this catch only keeps a handled rejection from
    // surfacing as unhandled on this fire-and-forget path. Ends if that mutation drops its errorToast.
    void invoke
      .mutateAsync({ pluginId: command.pluginId, name: command.name, args, values, chatId })
      // The outcome is the plugin's host-mediated chrome (§4.5a): its toasts, and at most one dialog open.
      .then((outcome) => applyPluginUiOutcome(command.pluginId, outcome))
      // Handled already by the mutation's own `errorToast`; this keeps a handled rejection from surfacing as an
      // unhandled one on a fire-and-forget path.
      .catch(() => undefined);
  };
}

/** The ONE "run this command" entry the DISCRETE surfaces share (the palette rows, the wand menu) — a command
 *  that DECLARES typed args (#791) opens the args-collection modal (typed inputs, coerced + validated before
 *  dispatch); a command with none dispatches directly with an empty bag (the U8 shape). Both surfaces route
 *  through here so a with-args command can never be fired with a bare, invalid bag from one door but not another.
 *  (The composer takes the parallel path: it PARSES `name=value` inline rather than opening a modal — one grammar,
 *  two entry gestures.) */
export function useRunPluginCommand(chatId: ChatId | null): (command: PluginCommandView) => void {
  const run = usePluginCommandRunner(chatId);
  return (command: PluginCommandView): void => {
    if (command.args.length > 0) {
      openPluginCommandArgs({
        pluginId: command.pluginId,
        slug: command.slug,
        name: command.name,
        describe: command.describe,
        args: command.args,
        chatId,
      });
    } else {
      run(command.slug, command.name, "", {});
    }
  };
}
