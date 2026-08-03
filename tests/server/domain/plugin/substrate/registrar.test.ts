// substrate: registrar — the pure marshalling + gate logic the compose registrar bundle wires (P4b-tail). Two
// SECURITY-load-bearing bits, unit-proven here: the event field-cap (a DoS backstop truncating message content
// BEFORE it crosses into an untrusted guest) and the transform §6 host-gate (a plugin transform attaches ONLY to
// a chat the installer HOSTS — the process-global registry is chat-blind, so the apply self-guards).

import type { TriggerFact } from "@orb/contracts/automation";
import type { PromptTransformEnv } from "@orb/contracts/chat";
import type { PluginHandlerRef, PluginTransformRegistration } from "@orb/contracts/plugin";
import type { ChatId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { buildPluginPromptTransform, capFactContent } from "../../../../../packages/server/src/domain/plugin/substrate/registrar.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAT = castId<ChatId>("chat_reg000000000000000000000");
const HANDLER = castId<PluginHandlerRef>("handler_1");

function messageFact(content: string): TriggerFact {
  return {
    type: "messageCommitted",
    bus: "chat",
    chatId: CHAT,
    message: { id: "msg_1", role: "user", authorUserId: null, characterId: null, seq: 1, content },
  };
}

describe("capFactContent — the event field-cap (DoS backstop before the guest marshal)", () => {
  test("truncates message.content to the cap; other fields survive", () => {
    const capped = capFactContent(messageFact("x".repeat(100)), 16);
    expect(capped.message?.content).toBe("x".repeat(16));
    expect(capped.message?.id).toBe("msg_1");
    expect(capped.message?.seq).toBe(1);
    expect(capped.type).toBe("messageCommitted");
  });

  test("a message under cap is returned UNCHANGED (same object, no copy)", () => {
    const fact = messageFact("short");
    expect(capFactContent(fact, 16)).toBe(fact);
  });

  test("a fact with NO message is returned unchanged (no message content to cap)", () => {
    const fact: TriggerFact = { type: "chatOpened", bus: "chat", chatId: CHAT };
    expect(capFactContent(fact, 16)).toBe(fact);
  });
});

describe("buildPluginPromptTransform — the §6 host-gate + guest re-entry", () => {
  const reg: PluginTransformRegistration = { name: "shout", point: "assembled_dynamic", handler: HANDLER };
  const env: PromptTransformEnv = { chatId: CHAT, vars: { tension: "3" } };

  test("carries the caller-assigned id/point/order (the plugin band is compose's to assign)", () => {
    const t = buildPluginPromptTransform(reg, {
      id: "plugin:mood:shout:0",
      order: 1000,
      isInstallerHost: () => Promise.resolve(true),
      invoke: () => Promise.resolve("x"),
    });
    expect(t.id).toBe("plugin:mood:shout:0");
    expect(t.point).toBe("assembled_dynamic");
    expect(t.order).toBe(1000);
  });

  test("§6 GATE — a chat the installer does NOT host passes the draft through UNCHANGED (guest never re-entered)", async () => {
    let invoked = 0;
    const t = buildPluginPromptTransform(reg, {
      id: "t",
      order: 1000,
      isInstallerHost: () => Promise.resolve(false),
      invoke: () => {
        invoked += 1;
        return Promise.resolve("MUTATED");
      },
    });

    expect(await t.apply("original draft", env)).toBe("original draft");
    expect(invoked).toBe(0); // no marshal, no guest run — the draft never leaked into the untrusted guest
  });

  test("a hosted chat re-enters the guest with ONE {draft, env} object; the guest string IS the new draft", async () => {
    const seen: string[] = [];
    const t = buildPluginPromptTransform(reg, {
      id: "t",
      order: 1000,
      isInstallerHost: () => Promise.resolve(true),
      invoke: (handler, argsJson) => {
        seen.push(argsJson);
        expect(handler).toBe(HANDLER);
        return Promise.resolve("SHOUTED");
      },
    });

    expect(await t.apply("hi", env)).toBe("SHOUTED");
    expect(JSON.parse(seen[0] ?? "{}")).toEqual({ draft: "hi", env: { chatId: CHAT, vars: { tension: "3" } } });
  });
});
