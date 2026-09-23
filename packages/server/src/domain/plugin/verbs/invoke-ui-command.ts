// verb: invokeUiCommand — the COMMAND round-trip. `/plugin <slug> <name> …` in
// the composer and the "Plugins" chrome menu both land here; the verb re-enters the command's `onRun` in the
// resident guest and returns the drained UI outcome (toasts + at most one dialog open).
//
// THE AUTHORITY GATE, in the order a hostile caller meets it — the `invokeUiAction` ladder plus a fourth rung
// this verb has and that one does not:
//  1. OWNER SCOPE — `getById(db, caller.userId, pluginId)` reads absent for a plugin the caller does not own →
//     leak-free NOT_FOUND. This is the whole cross-tenant story; it is first and unconditional.
//  2. RESIDENCE — a disabled/errored plugin has no resident instance; nothing to invoke. Past the owner gate,
//     so it is a state fact about the caller's OWN plugin, never a cross-tenant oracle.
//  3. COMMAND — the `name` must name a command THIS instance registered. Own plugin ⇒ a plain refusal is safe.
//  4. CHAT SCOPE — the room the person ran it in, admitted through the SAME leak-free `resolveChatAuthority`
//     the snippet gate uses (a chat the caller cannot read resolves `{false,false}` → NOT_FOUND, no existence
//     oracle) and threaded as a real `InvocationChat` with the resolved `canWrite`. THIS RUNG IS THE POINT: a
//     command is a NEW way to reach a guest with a room attached, and if it admitted the chat by itself, it
//     would be a door around the chat-read admission every other guest entry point passes through. A command
//     run outside a room (the chrome menu on a non-chat section) carries `null` and `chat.current()` throws in
//     the guest — the honest answer, not a synthesized room.
//
// The re-entry runs through the resident's crash-policy'd `invoke`, so a throwing/hung command bumps
// `consecutive_crashes` toward the 3-strike auto-disable exactly like a tool, event or action handler. The guest
// receives ONE `{ args, chat }` object (the single-arg host→guest seam); its return is DISCARDED — a command's
// effect is the state it publishes and the chrome it asks for, never a value the client renders unlabelled.

import type { InvocationChat, PluginCommandArgSpec, PluginCommandArgValue, PluginUiOutcome } from "@orb/contracts/plugin";
import { pluginCommandArgsSchema } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import { z } from "zod";
import { PluginNotFoundError } from "../contract/errors.ts";
import type { InvokeUiCommandParams } from "../contract/params.ts";
import type { PluginContext, PluginRegistry, PluginService } from "../contract/service.ts";
import { getById } from "../persistence/plugins.ts";
import { resolveUiOutcome } from "../substrate/ui-outbox.ts";

/** RE-VALIDATE the client's typed `values` (#791) against the RESIDENT command's OWN declared specs — the
 *  membrane trust boundary: a bag missing a required arg, mistyping one, or naming an off-enum value is a typed
 *  refusal, so `onRun` only ever sees well-typed, in-enum, required-present values. A command that declared no
 *  args validates an empty schema (extra keys stripped) and receives `{}`. Throws on refusal; returns the parsed,
 *  stripped bag on success. */
function validateCommandValues(
  name: string,
  specs: readonly PluginCommandArgSpec[],
  values: Record<string, PluginCommandArgValue> | undefined,
): Record<string, PluginCommandArgValue> {
  const parsed = pluginCommandArgsSchema(specs).safeParse(values ?? {});
  if (!parsed.success) {
    throw new Error(`plugin host: invalid arguments for command '${name}' — ${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}

export function createInvokeUiCommand(ctx: PluginContext, registry: PluginRegistry): PluginService["invokeUiCommand"] {
  return async ({ caller, pluginId, name, args, values, chatId }: InvokeUiCommandParams) => {
    // (1) OWNER SCOPE — leak-free NOT_FOUND for a plugin the caller does not own (the cross-tenant gate).
    const existing = await getById(ctx.db, caller.userId, pluginId);
    if (existing === undefined) {
      throw new PluginNotFoundError(pluginId);
    }
    // (2) RESIDENCE — the caller's own plugin must be enabled to hold a live command handler.
    const resident = registry.get(pluginId);
    if (resident === undefined) {
      throw new Error("plugin host: this plugin is not enabled — no command to run");
    }
    // (3) COMMAND — a command this instance registered (own plugin ⇒ safe refusal, no foreign existence leaked).
    const command = resident.instance.commands.find((c) => c.name === name);
    if (command === undefined) {
      throw new Error(`plugin host: no command '${name}' on this plugin`);
    }
    // (3a) TYPED ARGS (#791) — the membrane trust boundary, re-derived from the resident command's OWN specs.
    const typedValues = validateCommandValues(name, command.args ?? [], values);
    // (4) CHAT SCOPE — admitted leak-free, exactly as the snippet gate does it. A room the caller cannot read is
    // indistinguishable from one that does not exist.
    let chat: InvocationChat | null = null;
    if (chatId !== null) {
      const authority = await ctx.resolveChatAuthority(caller, chatId);
      if (!authority.canRead) {
        throw new DomainNotFoundError("chat", chatId);
      }
      // A command is a HUMAN-initiated act, so it is the cascade ROOT (depth 0) — a turn it triggers stamps 1.
      chat = { chatId, canWrite: authority.canWrite, automationDepth: 0 };
    }
    // The DRAIN is in a `finally` so a throwing command's toasts still reach the person who ran it (and never
    // leak into a later, unrelated round-trip). The invoke's own rejection still propagates.
    let outcome: PluginUiOutcome = { toasts: [] };
    try {
      // ONE `{ args }` object (the single-arg host→guest seam). The ROOM is not in the bag: it is the
      // invocation's chat SCOPE, which the guest reads through `chat.current()`'s opaque handle — one mint, one
      // accessor (see `registerCommand`'s contract).
      await resident.invoke(command.onRun, JSON.stringify({ args, values: typedValues }), chat);
    } finally {
      outcome = resolveUiOutcome(ctx.uiOutbox.drain(pluginId), resident.instance);
    }
    return outcome;
  };
}
