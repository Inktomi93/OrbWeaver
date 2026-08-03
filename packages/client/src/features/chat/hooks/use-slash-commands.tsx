// THE slash-command consumer mechanism (client-architecture-lockdown.md §6c) — one hook, every host.
// It reads the door-assembled registry (null-tolerant: no Provider ⇒ zero commands ⇒ the composer sends
// byte-identically and the palette shows only its native groups), yields the invisible per-command MOUNTS
// (each publishes its imperative runner from its OWN fiber, so runner hooks never run in a loop at the
// host), and exposes the two invocation doors: `dispatch` (a composer send) and `run` (a palette pick).
//
// A host mounts the whole set; two hosts therefore mount it twice (the composer and the palette live in
// different subtrees with different lifetimes) and each keeps its own runner map. That is deliberate: a
// shared runner map would need an app-level store above both, and a mount is required to be
// render-idempotent anyway (the contract says so) — duplicated mounting costs one null-returning fiber.
//
// Runners live in a ref, read at EVENT time (never in render — the refs-in-render ban).

import type { ChatId } from "@orb/kit/ids";
import type { ReactNode } from "react";
import { use, useMemo, useRef } from "react";
import type { SlashCommandContext, SlashCommandContribution, SlashCommandRunner } from "#lib";
import { SlashCommandRegistryContext } from "#state";
import { commandNotReadyNotice, parseSlashDraft, unknownCommandNotice } from "../lib/slash-command";

// The result of a composer send. Non-exported (a feature hooks module is not a `no-inline-types` home);
// the composer consumes it by inference and narrows on `kind`.
type SlashDispatch = { readonly kind: "send"; readonly text: string } | { readonly kind: "ran" } | { readonly kind: "blocked"; readonly reason: string };

/** `chatId` = the committed chat in view, or null (a draft room, or the palette outside a chat). The hook
 *  builds the {@link SlashCommandContext} projection from it — ONE place, so a future context field (a
 *  permission, a capability) is added here and reaches every command and every host at once. */
export function useSlashCommands(chatId: ChatId | null): {
  readonly commands: readonly SlashCommandContribution[];
  readonly mounts: ReactNode;
  readonly unavailableFor: (command: SlashCommandContribution) => string | null;
  readonly dispatch: (value: string) => SlashDispatch;
  readonly run: (id: string) => void;
} {
  const registry = use(SlashCommandRegistryContext);
  const commands = useMemo(() => registry?.list() ?? [], [registry]);
  const context = useMemo<SlashCommandContext>(() => ({ chatId }), [chatId]);
  const runnersRef = useRef<Map<string, SlashCommandRunner>>(new Map());
  // Stable per-command register callbacks (deps: the stable command list) → each mount's publish effect
  // runs ONCE, never re-registering on every keystroke in the host above it.
  const registers = useMemo(
    () => new Map(commands.map((c) => [c.id, (runner: SlashCommandRunner): void => void runnersRef.current.set(c.id, runner)] as const)),
    [commands],
  );

  const mounts = commands.map((c) => {
    const Mount = c.mount;
    const onRunner = registers.get(c.id);
    return onRunner === undefined ? null : <Mount key={c.id} context={context} onRunner={onRunner} />;
  });

  const unavailableFor = (command: SlashCommandContribution): string | null => command.unavailableReason?.(context) ?? null;

  const fire = (command: SlashCommandContribution, args: string): SlashDispatch => {
    const reason = unavailableFor(command);
    if (reason !== null) {
      return { kind: "blocked", reason };
    }
    const runner = runnersRef.current.get(command.id);
    if (runner === undefined) {
      return { kind: "blocked", reason: commandNotReadyNotice(command.id) };
    }
    runner(args);
    return { kind: "ran" };
  };

  const dispatch = (value: string): SlashDispatch => {
    const draft = parseSlashDraft(value);
    if (draft.kind === "message") {
      return { kind: "send", text: draft.text };
    }
    const command = commands.find((c) => c.id === draft.command);
    if (command === undefined) {
      return { kind: "blocked", reason: unknownCommandNotice(draft.command) };
    }
    return fire(command, draft.args);
  };

  // The palette door: a picked row runs its command with no arguments. A row the palette rendered disabled
  // can still be forced here, so `fire`'s availability re-check is the real gate, not the row's `disabled`.
  const run = (id: string): void => {
    const command = commands.find((c) => c.id === id);
    if (command !== undefined) {
      fire(command, "");
    }
  };

  return { commands, mounts, unavailableFor, dispatch, run };
}
