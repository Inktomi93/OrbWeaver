// The COMMAND read + the ONE runner both consuming surfaces share: the
// `/plugin` composer dispatch and the "Plugins" chrome menu.
//
// EVERY SURFACE, ONE RUNNER — deliberately. Menus, composer placements and the slash line do the identical thing
// (resolve the command off the caller's own installs, invoke it, apply the outcome), and the moment that lives
// twice they drift: one grows a toast the other does not, one forgets to pass the room. So the hook below IS
// the behaviour, and each surface only decides how it is triggered.

import type { PluginCommandArgSpec, PluginCommandArgValue, PluginCommandPlacement } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";
import { useIsMutating, useQuery, useQueryClient } from "@tanstack/react-query";
import type { inferOutput } from "@trpc/tanstack-react-query";
import { useState } from "react";
import type { Trpc } from "#data";
import { peekQueryData, useInvalidation, useTRPC } from "#data";
import { notify } from "#lib";
import type { ComposerDraftSnapshot } from "#state";
import { activeChatId, openPluginCommandArgs, readComposerDraftSnapshot, replaceComposerDraft, useActiveChatId, useComposerDraftRevision } from "#state";
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
  readonly group: string | null;
  readonly placements: readonly PluginCommandPlacement[];
  readonly composerDraft?: true;
}

interface PluginCommandRunner {
  readonly isPending: boolean;
  readonly run: (
    request: PluginCommandRunRequest,
    onSettled?: (succeeded: boolean) => void,
    onReplaced?: (before: ComposerDraftSnapshot, after: ComposerDraftSnapshot) => void,
  ) => void;
}

interface PluginCommandRunRequest {
  readonly slug: string;
  readonly name: string;
  readonly args: string;
  readonly values: Record<string, PluginCommandArgValue>;
  readonly composerDraft?: ComposerDraftSnapshot;
}

interface PluginCommandAction {
  readonly isPending: boolean;
  readonly run: (command: PluginCommandView) => void;
  readonly undo: (() => void) | null;
  readonly undoLabel: string;
}

/** Every command across the caller's granted-and-enabled plugins, ordered by what the Plugins menu and palette
 *  show: the plugin attribution, then group and command name. The plugin id keeps same-attribution installs
 *  contiguous. Not a suspense read: the composer and the chrome menu are both always-mounted chrome, and neither
 *  may block the shell on a plugin catalog. */
export function usePluginCommands(includeComposerDraft = false): readonly PluginCommandView[] {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.plugin.listCommands.queryOptions());
  return (data ?? [])
    .filter((command) => includeComposerDraft || command.composerDraft !== true)
    .toSorted(
      (a, b) =>
        a.pluginName.localeCompare(b.pluginName) ||
        a.slug.localeCompare(b.slug) ||
        a.pluginId.localeCompare(b.pluginId) ||
        (a.group ?? "").localeCompare(b.group ?? "") ||
        a.name.localeCompare(b.name),
    );
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
export function usePluginCommandRunner(chatId: ChatId | null): PluginCommandRunner {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invalidation = useInvalidation();
  const invoke = useInvokeUiCommand({ trpc, invalidation });
  const runningCommandCount = useIsMutating({ mutationKey: trpc.plugin.invokeUiCommand.mutationKey() });
  const commands = usePluginCommands(true);
  // No manual memoization — the React Compiler runs full-compile on this tree and already caches this closure
  // across renders (D54). A hand-rolled `useCallback` here would be a second, weaker cache beside its.
  const run: PluginCommandRunner["run"] = (request, onSettled, onReplaced): void => {
    const command = commands.find((candidate) => candidate.slug === request.slug && candidate.name === request.name);
    if (command === undefined || (command.composerDraft === true) !== (request.composerDraft !== undefined)) {
      notify.error(PLUGIN_COMMAND_UNKNOWN);
      onSettled?.(false);
      return;
    }
    // The mutation's error toast owns the visible failure. Keep a collecting surface open with its values,
    // and report the rejection for diagnostics even when no collecting surface is mounted.
    invoke
      .mutateAsync({
        pluginId: command.pluginId,
        name: command.name,
        args: request.args,
        values: request.values,
        chatId,
        ...(request.composerDraft === undefined ? {} : { composerDraft: request.composerDraft.text }),
      })
      .then((outcome): void => {
        if (request.composerDraft !== undefined && outcome.composerDraft !== undefined && chatId !== null) {
          const currentCommands = peekQueryData<inferOutput<Trpc["plugin"]["listCommands"]>>(queryClient, trpc.plugin.listCommands.queryKey());
          const stillRegistered =
            currentCommands?.some(
              (candidate) => candidate.pluginId === command.pluginId && candidate.name === command.name && candidate.composerDraft === true,
            ) === true;
          const after = activeChatId() === chatId && stillRegistered ? replaceComposerDraft(chatId, request.composerDraft, outcome.composerDraft) : null;
          if (after === null) {
            notify.info("The draft or room changed. Nothing was replaced.");
            onSettled?.(false);
            return;
          }
          onReplaced?.(request.composerDraft, after);
        }
        applyPluginUiOutcome(command.pluginId, outcome);
        onSettled?.(true);
      })
      .catch((error: unknown): void => {
        onSettled?.(false);
        globalThis.reportError(error);
      });
  };
  return { isPending: invoke.isPending || runningCommandCount > 0, run };
}

/** The ONE "run this command" entry the DISCRETE surfaces share (the palette rows, the wand menu) — a command
 *  that DECLARES typed args (#791) opens the args-collection modal (typed inputs, coerced + validated before
 *  dispatch); a command with none dispatches directly with an empty bag (the U8 shape). Both surfaces route
 *  through here so a with-args command can never be fired with a bare, invalid bag from one door but not another.
 *  (The composer takes the parallel path: it PARSES `name=value` inline rather than opening a modal — one grammar,
 *  two entry gestures.) */
export function useRunPluginCommand(chatId: ChatId | null, allowComposerDraft = false): PluginCommandAction {
  const runner = usePluginCommandRunner(chatId);
  const selectedChat = useActiveChatId();
  const revision = useComposerDraftRevision();
  const [replacement, setReplacement] = useState<{
    readonly chatId: ChatId;
    readonly before: ComposerDraftSnapshot;
    readonly after: ComposerDraftSnapshot;
    readonly label: string;
  } | null>(null);
  const run = (command: PluginCommandView): void => {
    if (command.composerDraft === true) {
      if (!allowComposerDraft || chatId === null || activeChatId() !== chatId) {
        return;
      }
      runner.run(
        { slug: command.slug, name: command.name, args: "", values: {}, composerDraft: readComposerDraftSnapshot(chatId) },
        undefined,
        (before, after): void =>
          setReplacement({
            chatId,
            before,
            after,
            label: command.placements.find((placement) => placement.target === "composer-action")?.label ?? command.name,
          }),
      );
    } else if (command.args.length > 0) {
      openPluginCommandArgs({
        pluginId: command.pluginId,
        slug: command.slug,
        name: command.name,
        describe: command.describe,
        args: command.args,
        chatId,
      });
    } else {
      runner.run({ slug: command.slug, name: command.name, args: "", values: {} });
    }
  };
  const undo =
    replacement !== null && replacement.chatId === selectedChat && replacement.chatId === chatId && replacement.after.revision === revision
      ? (): void => {
          replaceComposerDraft(replacement.chatId, replacement.after, replacement.before.text);
          setReplacement(null);
        }
      : null;
  return { isPending: runner.isPending, run, undo, undoLabel: `Undo ${replacement?.label ?? "draft replacement"}` };
}
