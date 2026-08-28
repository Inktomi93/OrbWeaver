// The `/plugin` runner mount — rendered invisibly by each slash-command host (the composer and the palette) in
// its OWN fiber, which is what lets the runner use hooks (the `SlashCommandContribution` mount contract).
//
// It publishes ONE runner over the shared `usePluginCommandRunner`, so the slash line and the Plugins chrome
// menu cannot drift. An incomplete line (`/plugin`, or `/plugin oracle` with no command) is REFUSED WITH A
// SENTENCE rather than swallowed: a command surface that silently does nothing teaches a person the feature is
// broken, and the sentence names the affordance that lists what they have.

import type { ReactElement } from "react";
import { useEffect } from "react";
import type { SlashCommandMountProps } from "#lib";
import { notify } from "#lib";
import { usePluginCommandRunner } from "../hooks/use-plugin-commands.ts";
import { parsePluginCommand } from "../lib/plugin-command-dispatch.ts";

/** The copy for a line that named no command. */
const INCOMPLETE = "Use /plugin <plugin> <command> — the Plugins menu lists what you have.";

export function PluginSlashMount({ context, onRunner }: SlashCommandMountProps): ReactElement | null {
  const run = usePluginCommandRunner(context.chatId);
  useEffect(() => {
    onRunner((raw: string): void => {
      const { slug, name, args } = parsePluginCommand(raw);
      if (slug === "" || name === "") {
        notify.error(INCOMPLETE);
        return;
      }
      run(slug, name, args);
    });
  }, [onRunner, run]);
  return null;
}
