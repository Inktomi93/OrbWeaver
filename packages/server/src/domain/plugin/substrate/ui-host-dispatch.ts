// domain/plugin/substrate/ui-host-dispatch — the per-function ARGUMENT SCHEMA + bridge call for every member of
// `UI_PROXYABLE_HOST_FUNCTIONS` (U4, §4.6 / seam 5). This is the Tier-C mirror of what
// `infra/plugin-host/membrane.ts` does for the SERVER guest: a name plus untrusted arguments arrive, each
// function's own schema decides whether the arguments are a legal call, and only then does the shared
// `PluginBridge` op run. The bridge is the SAME one a server guest's call rides — closed over the installer,
// belted, ownership-scoped — so a proxied call adds a CALLER, never an authority.
//
// THE DISPATCH IS AN EXHAUSTIVE RECORD, not a switch with a default. `Record<UiProxyableHostFunction, …>` means
// widening the contracts tuple fails `tsc` HERE until the new function has a schema and a call — the one shape
// that makes "the proxy is a closed set" a compile fact rather than a comment. There is deliberately no
// fall-through arm: an unknown name never reaches this module (the verb checks membership first), and a
// default arm would be the place a future unvalidated call could hide.
//
// WHY EVERY ARGUMENT IS PARSED EVEN THOUGH THE BRIDGE OP WOULD SURVIVE GARBAGE. Two reasons, both concrete.
// (1) The bridge ops are typed, not validated — they were written for a caller (the membrane) that had already
// dumped a guest value and bounded it, so handing them a wrongly-shaped value is undefined behaviour reached
// from a browser. (2) A REFUSAL IS A DIFFERENT OUTCOME FROM AN EMPTY RESULT: a `storage.get` with a non-string
// key must reject, not answer `null`, or a plugin author debugging a typo sees "no value" forever.
//
// CHAT SCOPE. Two of the ten functions need a room, and they take it from the VERB's already-verified `chatId`
// rather than from the argument bag — a room is authority, and authority never rides in a payload the client
// composed. A chat-scoped function called with no admitted room is a refusal, not a silent no-op.

import type { PluginBridge, UiProxyableHostFunction } from "@orb/contracts/plugin";
import { PLUGIN_UI_HOST_CALL_CODES, pluginUiHostArgsSchemas } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import type { z } from "zod";
import { PluginUiHostCallRefusedError } from "../contract/errors.ts";

/** A chat-scoped proxy called without an admitted room is its own refusal (scope-required), distinct from "you
 *  passed a room you cannot read", which is the verb's leak-free NOT_FOUND. */
function requireChat(fn: string, chatId: ChatId | null): ChatId {
  if (chatId === null) {
    throw new PluginUiHostCallRefusedError(`plugin host: ${fn} needs a chat scope — pass the surface's room id with the call`, {
      code: PLUGIN_UI_HOST_CALL_CODES.scopeRequired,
    });
  }
  return chatId;
}

/** Parse a call's untrusted arguments. Only this parse turns a `ZodError` into the caller's own mistake: one thrown by
 *  a bridge op is the server's, and stays a fault. The schema's text names the guest's argument shapes, so it stays
 *  server-side as the cause. */
function parseArgs<S extends z.ZodType>(fn: UiProxyableHostFunction, schema: S, args: unknown): z.output<S> {
  const parsed = schema.safeParse(args);
  if (!parsed.success) {
    throw new PluginUiHostCallRefusedError(`plugin host: the arguments for ${fn} do not match its signature`, {
      code: PLUGIN_UI_HOST_CALL_CODES.argsInvalid,
      cause: parsed.error,
    });
  }
  return parsed.data;
}

/** One proxyable function's implementation: parse the untrusted args, then run the bridge op. Returns a
 *  JSON-safe value the verb re-serializes (inert both ways — the marshal law, second boundary). */
type UiHostCallImpl = (bridge: PluginBridge, args: unknown, chatId: ChatId | null) => Promise<unknown>;

/** The exhaustive proxy table. A new `UI_PROXYABLE_HOST_FUNCTIONS` member fails `tsc` here until it lands a
 *  schema and a call — which is the whole point of keying this by the contracts union. */
const UI_HOST_CALL_IMPLS: Record<UiProxyableHostFunction, UiHostCallImpl> = {
  "chat.listMessages": async (bridge, args, chatId) => {
    const [opts] = parseArgs("chat.listMessages", pluginUiHostArgsSchemas["chat.listMessages"], args);
    return await bridge.chat.listMessages(requireChat("chat.listMessages", chatId), opts?.limit);
  },
  "chat.getVariables": async (bridge, args, chatId) => {
    parseArgs("chat.getVariables", pluginUiHostArgsSchemas["chat.getVariables"], args);
    return await bridge.chat.getVariables(requireChat("chat.getVariables", chatId));
  },
  "variables.get": async (bridge, args) => {
    const [key] = parseArgs("variables.get", pluginUiHostArgsSchemas["variables.get"], args);
    return await bridge.variables.get(key);
  },
  "variables.set": async (bridge, args) => {
    const [key, value] = parseArgs("variables.set", pluginUiHostArgsSchemas["variables.set"], args);
    await bridge.variables.set(key, value);
    return null;
  },
  "variables.delete": async (bridge, args) => {
    const [key] = parseArgs("variables.delete", pluginUiHostArgsSchemas["variables.delete"], args);
    await bridge.variables.delete(key);
    return null;
  },
  "storage.get": async (bridge, args) => {
    const [key] = parseArgs("storage.get", pluginUiHostArgsSchemas["storage.get"], args);
    return await bridge.storage.get(key);
  },
  "storage.set": async (bridge, args) => {
    const [key, value] = parseArgs("storage.set", pluginUiHostArgsSchemas["storage.set"], args);
    await bridge.storage.set(key, value);
    return null;
  },
  "storage.compareAndSet": async (bridge, args) => {
    const [key, expected, next] = parseArgs("storage.compareAndSet", pluginUiHostArgsSchemas["storage.compareAndSet"], args);
    return await bridge.storage.compareAndSet(key, expected, next);
  },
  "storage.delete": async (bridge, args) => {
    const [key] = parseArgs("storage.delete", pluginUiHostArgsSchemas["storage.delete"], args);
    await bridge.storage.delete(key);
    return null;
  },
  "storage.list": async (bridge, args) => {
    const [prefix] = parseArgs("storage.list", pluginUiHostArgsSchemas["storage.list"], args);
    return await bridge.storage.list(prefix);
  },
};

/** Run one proxied host call. The caller (`verbs/ui-host-call.ts`) has already proven the fn is proxyable, the
 *  caller owns the plugin, the capability is granted, and the room (if any) is one the caller may read. */
export async function runUiHostCall(fn: UiProxyableHostFunction, bridge: PluginBridge, args: unknown, chatId: ChatId | null): Promise<unknown> {
  return await UI_HOST_CALL_IMPLS[fn](bridge, args, chatId);
}
