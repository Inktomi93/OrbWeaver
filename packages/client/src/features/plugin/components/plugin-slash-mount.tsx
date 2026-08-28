// The `/plugin` runner mount — rendered invisibly by each slash-command host (the composer and the palette) in
// its OWN fiber, which is what lets the runner use hooks (the `SlashCommandContribution` mount contract).
//
// It publishes ONE runner over the shared `usePluginCommandRunner`, so the slash line and the Plugins chrome
// menu cannot drift. An incomplete line (`/plugin`, or `/plugin oracle` with no command) is REFUSED WITH A
// SENTENCE rather than swallowed: a command surface that silently does nothing teaches a person the feature is
// broken, and the sentence names the affordance that lists what they have.

import { coercePluginCommandArgs } from "@orb/contracts/plugin";
import type { ReactElement } from "react";
import { useEffect } from "react";
import type { SlashCommandMountProps } from "#lib";
import { notify } from "#lib";
import { usePluginCommandRunner, usePluginCommands } from "../hooks/use-plugin-commands.ts";
import { parseCommandArgInputs, parsePluginArgContext, parsePluginCommand, pluginCommandArgOffers } from "../lib/plugin-command-dispatch.ts";

/** The copy for a line that named no command. */
const INCOMPLETE = "Use /plugin <plugin> <command> — the Plugins menu lists what you have.";

export function PluginSlashMount({ context, onRunner, onArgComplete }: SlashCommandMountProps): ReactElement | null {
  const run = usePluginCommandRunner(context.chatId);
  const commands = usePluginCommands();
  // #791 — publish the composer arg completer: given the partial `<slug> <cmd> <args…>` remainder, resolve the
  // command off the caller's own installs and yield its declared-arg hints + enum-value completions. Absent when
  // the host does not ask for it (the field is optional); no command / no declared args ⇒ no offers ⇒ no arg strip.
  useEffect(() => {
    onArgComplete?.((argsText: string) => {
      const argContext = parsePluginArgContext(argsText);
      if (argContext === null) {
        return [];
      }
      const command = commands.find((candidate) => candidate.slug === argContext.slug && candidate.name === argContext.name);
      if (command === undefined || command.args.length === 0) {
        return [];
      }
      return pluginCommandArgOffers(command.args, argContext.prefix, argContext.rest);
    });
  }, [onArgComplete, commands]);
  useEffect(() => {
    onRunner((raw: string): void => {
      const { slug, name, args } = parsePluginCommand(raw);
      if (slug === "" || name === "") {
        notify.error(INCOMPLETE);
        return;
      }
      // #791 — a command with DECLARED args gets its `name=value`/positional remainder PARSED, TYPED and
      // VALIDATED before dispatch: a missing-required / non-number / off-enum value is refused with the exact
      // sentence rather than sent as a lie the guest cannot detect. A command with NO declared args (or one we
      // cannot resolve — the runner's own toast handles that) passes the raw remainder through, U5-unchanged.
      const command = commands.find((candidate) => candidate.slug === slug && candidate.name === name);
      if (command !== undefined && command.args.length > 0) {
        const { values, errors } = coercePluginCommandArgs(command.args, parseCommandArgInputs(command.args, args));
        if (errors.length > 0) {
          notify.error(`/plugin ${slug} ${name}: ${errors.join("; ")}`);
          return;
        }
        run(slug, name, args, values);
        return;
      }
      run(slug, name, args, {});
    });
  }, [onRunner, run, commands]);
  return null;
}
