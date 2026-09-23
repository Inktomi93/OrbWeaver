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
import type { ChatId } from "@orb/kit/ids";
import { z } from "zod";

/** A key/prefix/value bound for the KV proxies. The DOMAIN op enforces the real `storage.kv` ceilings (64 KiB
 *  value, 256 keys); this is the wire-shape floor under it, so a pathological key never reaches the op. */
const KV_KEY_MAX = 512;
/** `chat.listMessages`'s host-side ceiling (`PluginHostV1`: "≤ 50, default 20") — re-stated at this second
 *  boundary so a proxied read cannot ask for more than a guest read can. */
const LIST_MESSAGES_LIMIT_MAX = 50;

const kvKey = z.string().min(1).max(KV_KEY_MAX);

/** The ten argument schemas, one per proxyable function. Each parses the DECODED `argsJson` value — a
 *  positional array, mirroring the membrane's own `args` convention so a plugin author writes the same call on
 *  both sides of the wire. */
const listMessagesArgs = z.tuple([z.object({ limit: z.number().int().positive().max(LIST_MESSAGES_LIMIT_MAX).optional() }).optional()]);
const noArgs = z.tuple([]);
const oneKey = z.tuple([kvKey]);
const keyAndValue = z.tuple([kvKey, z.string()]);
const optionalPrefix = z.tuple([z.string().max(KV_KEY_MAX).optional()]);
/** `storage.compareAndSet` (#1442): key, the PRECONDITION (`null` = "must be absent" — `nullable`, never
 *  optional, so a client that forgot the argument is a refusal rather than a silent create), and the next
 *  value. Same key/value floor as `keyAndValue`; the real ceilings are the domain op's. */
const casArgs = z.tuple([kvKey, z.string().nullable(), z.string()]);

/** Thrown when a chat-scoped proxy is called without an admitted room. A distinct MESSAGE because the two
 *  failures a plugin author hits here are genuinely different: "you did not pass the room" (this) versus "you
 *  passed a room you cannot read" (the verb's leak-free NOT_FOUND). Module-private on purpose — it is a named
 *  message, not a taxonomy member: nothing branches on the class, the transport maps it like any other domain
 *  throw, and exporting it would invite a caller to start branching on a distinction that only exists to make
 *  the sentence right. */
class UiHostCallScopeError extends Error {
  constructor(fn: string) {
    super(`plugin host: ${fn} needs a chat scope — pass the surface's room id with the call`);
    this.name = "UiHostCallScopeError";
  }
}

function requireChat(fn: string, chatId: ChatId | null): ChatId {
  if (chatId === null) {
    throw new UiHostCallScopeError(fn);
  }
  return chatId;
}

/** One proxyable function's implementation: parse the untrusted args, then run the bridge op. Returns a
 *  JSON-safe value the verb re-serializes (inert both ways — the marshal law, second boundary). */
type UiHostCallImpl = (bridge: PluginBridge, args: unknown, chatId: ChatId | null) => Promise<unknown>;

/** The exhaustive proxy table. A new `UI_PROXYABLE_HOST_FUNCTIONS` member fails `tsc` here until it lands a
 *  schema and a call — which is the whole point of keying this by the contracts union. */
const UI_HOST_CALL_IMPLS: Record<UiProxyableHostFunction, UiHostCallImpl> = {
  "chat.listMessages": async (bridge, args, chatId) => {
    const [opts] = listMessagesArgs.parse(args);
    return await bridge.chat.listMessages(requireChat("chat.listMessages", chatId), opts?.limit);
  },
  "chat.getVariables": async (bridge, args, chatId) => {
    noArgs.parse(args);
    return await bridge.chat.getVariables(requireChat("chat.getVariables", chatId));
  },
  "variables.get": async (bridge, args) => {
    const [key] = oneKey.parse(args);
    return await bridge.variables.get(key);
  },
  "variables.set": async (bridge, args) => {
    const [key, value] = keyAndValue.parse(args);
    await bridge.variables.set(key, value);
    return null;
  },
  "variables.delete": async (bridge, args) => {
    const [key] = oneKey.parse(args);
    await bridge.variables.delete(key);
    return null;
  },
  "storage.get": async (bridge, args) => {
    const [key] = oneKey.parse(args);
    return await bridge.storage.get(key);
  },
  "storage.set": async (bridge, args) => {
    const [key, value] = keyAndValue.parse(args);
    await bridge.storage.set(key, value);
    return null;
  },
  "storage.compareAndSet": async (bridge, args) => {
    const [key, expected, next] = casArgs.parse(args);
    return await bridge.storage.compareAndSet(key, expected, next);
  },
  "storage.delete": async (bridge, args) => {
    const [key] = oneKey.parse(args);
    await bridge.storage.delete(key);
    return null;
  },
  "storage.list": async (bridge, args) => {
    const [prefix] = optionalPrefix.parse(args);
    return await bridge.storage.list(prefix);
  },
};

/** Run one proxied host call. The caller (`verbs/ui-host-call.ts`) has already proven the fn is proxyable, the
 *  caller owns the plugin, the capability is granted, and the room (if any) is one the caller may read. */
export function runUiHostCall(fn: UiProxyableHostFunction, bridge: PluginBridge, args: unknown, chatId: ChatId | null): Promise<unknown> {
  return UI_HOST_CALL_IMPLS[fn](bridge, args, chatId);
}
