// domain/plugin/substrate/registrar — the pure marshalling + gate logic the compose registrar bundle wires
// onto the automation fan-out (`subscribeEvent`) and chat's prompt-transform registry (`registerTransform`).
// Homed here (not inline in compose) so the SECURITY-load-bearing bits are one-home + unit-testable: the event
// field-cap (a DoS backstop before a typed fact crosses into an untrusted guest) and the transform §6 host-gate
// (a plugin transform attaches ONLY to a chat the installer HOSTS — the process-global registry is chat-blind).
// Both operate only on `@orb/contracts/*` shapes (below server), so this stays a leaf — the PluginTriggerSubscriber
// ASSEMBLY (which references the automation DOMAIN's contract) stays at compose, the one cross-domain wiring seam.

import type { TriggerFact } from "@orb/contracts/automation";
import type { PromptTransform } from "@orb/contracts/chat";
import type { PluginHandlerRef, PluginTransformRegistration } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";

/** Truncate a delivered fact's message content to `maxContentChars` BEFORE it is JSON-marshalled into the guest
 *  realm (the load-bearing field-cap — the sandbox's whole-payload inbound byte cap is only the coarse backstop;
 *  a normal-but-large message must not bloat the guest heap or trip the coarse cap). Only `message.content` is
 *  unbounded on a TF-1 fact; every other leaf is a scalar/short id. Returns the SAME fact object when under cap
 *  (no needless copy). Char-length is the ~16 KiB-class approximation (bytes ≥ chars — conservative). */
export function capFactContent(fact: TriggerFact, maxContentChars: number): TriggerFact {
  if (fact.message === undefined || fact.message.content.length <= maxContentChars) {
    return fact;
  }
  return { ...fact, message: { ...fact.message, content: fact.message.content.slice(0, maxContentChars) } };
}

/** Build ONE D50 `PromptTransform` from a collected plugin transform registration, in the caller-assigned plugin
 *  order band (1000+). The `apply`:
 *   1. §6 SCOPE GATE — `isInstallerHost(env.chatId)` false ⇒ pass the draft through UNCHANGED (fail-closed: the
 *      registry is process-global + chat-blind, so a plugin transform must never rewrite — nor leak into the
 *      guest — a draft in a chat the installer does not host; the plugin analog of a rule's chatId self-guard).
 *   2. RE-ENTER the guest with ONE `{draft, env}` object (the single-arg host→guest seam). A throw/timeout is
 *      contained by the registry's own 250 ms bound + skip (D53); the guest's string return IS the new draft. */
export function buildPluginPromptTransform(
  reg: PluginTransformRegistration,
  deps: {
    readonly id: string;
    readonly order: number;
    readonly isInstallerHost: (chatId: ChatId) => Promise<boolean>;
    readonly invoke: (handler: PluginHandlerRef, argsJson: string) => Promise<string>;
  },
): PromptTransform {
  return {
    id: deps.id,
    point: reg.point,
    order: deps.order,
    apply: async (draft, env): Promise<string> => {
      if (!(await deps.isInstallerHost(env.chatId))) {
        return draft;
      }
      return await deps.invoke(reg.handler, JSON.stringify({ draft, env }));
    },
  };
}
