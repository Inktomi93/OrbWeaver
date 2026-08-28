// The plugin-COMMAND-ARGS intent store (#791 — the typed-arg grammar's palette half) — the payload channel for
// the ONE `pluginCommandArgs` modal slot, the `plugin-dialog-store` posture applied to command arguments: the
// command palette picks a command that DECLARES args and, instead of dispatching a bare run, opens this slot with
// the command + its declared specs as the subject; the modal body renders one typed input per arg, collects them,
// and dispatches the run with the TYPED values. The def's `onClose` clears the subject.
//
// WHY THE SUBJECT LIVES IN `#state` RATHER THAN THE MODAL BODY. The opener is the command palette source (a
// `#features` module), and the modal is a shell-level singleton that outlives the palette (which closes the moment
// a row is picked — the `openPluginDialog` precedent exactly). A `#state` action is the one channel that reaches
// the shell modal from a feature without a `#features` import (§5.1). Ephemeral, never persisted (a reload never
// reopens a modal — the `openModal` transient posture).

import type { PluginCommandArgSpec } from "@orb/contracts/plugin";
import type { ChatId, PluginId } from "@orb/kit/ids";
import { createGatedStore } from "./create-gated-store.ts";
import { openModal } from "./shell-store.ts";

/** WHICH command the `pluginCommandArgs` slot is collecting args for — the wire projection the palette already
 *  read (`plugin.listCommands`), carried whole so the body needs no second read. `chatId` is the room the person
 *  ran the command in (null outside a chat), threaded to the invoke as the command's invocation scope. */
export interface PluginCommandArgsSubject {
  readonly pluginId: PluginId;
  readonly slug: string;
  readonly name: string;
  readonly describe: string;
  readonly args: readonly PluginCommandArgSpec[];
  readonly chatId: ChatId | null;
}

interface PluginCommandArgsState {
  readonly subject: PluginCommandArgsSubject | undefined;
}

const usePluginCommandArgsStore = createGatedStore<PluginCommandArgsState>("plugin-command-args", (): PluginCommandArgsState => ({ subject: undefined }));

/** Open the args-collection modal for a picked command that declares typed args. Called ONLY from the command
 *  palette source's row `run` when `command.args` is non-empty — a no-arg command dispatches directly, never here. */
export function openPluginCommandArgs(subject: PluginCommandArgsSubject): void {
  usePluginCommandArgsStore.setState({ subject }, false, "plugin-command-args/open");
  openModal("pluginCommandArgs");
}

/** The `pluginCommandArgs` modal's `onClose` — drop the subject so a re-open never inherits a stale one. */
export function clearPluginCommandArgs(): void {
  usePluginCommandArgsStore.setState({ subject: undefined }, false, "plugin-command-args/clear");
}

/** Reactive: which command the slot is collecting args for (`undefined` ⇒ nothing to draw). */
export function usePluginCommandArgsSubject(): PluginCommandArgsSubject | undefined {
  return usePluginCommandArgsStore((s) => s.subject);
}

/** Non-reactive snapshot — for the store's own tests and reads outside a render. */
export function __readPluginCommandArgsSubjectForTest(): PluginCommandArgsSubject | undefined {
  return usePluginCommandArgsStore.getState().subject;
}

/** Clear the slot — test-only hygiene (a module singleton must not leak state across tests). */
export function __resetPluginCommandArgs(): void {
  usePluginCommandArgsStore.setState({ subject: undefined }, false, "plugin-command-args/reset");
}
