// substrate/macro-render — the ONE arm-template render seam. Pins the load-bearing claim in its header: the
// chat-keyed CEL roots (`vars`/`choice`/`chat`) are BOUND only when `chatScoped`, and leaving them unbound on
// an owner-global frame makes a `{{expr::chat.messageCount}}` template answer a visible `expr-error` instead
// of a silent, confidently-wrong `0` for a room that does not exist.

import type { AutomationCelEnv } from "@orb/contracts/automation";
import { describe } from "vitest";
import { renderArmTemplate } from "../../../../../packages/server/src/domain/automation/substrate/macro-render.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAT_ENV: AutomationCelEnv = {
  vars: { mood: "grim" },
  choice: {},
  global: { streak: "3" },
  chat: { id: "chat_x", messageCount: 5 },
  now: { epochMs: 1000, hour: 0, dayOfWeek: 0 },
};

describe("renderArmTemplate", () => {
  test("renders a global-var macro and a chat-scoped CEL expr when chatScoped", () => {
    const result = renderArmTemplate({
      template: "streak={{getglobalvar::streak}} count={{expr::chat.messageCount}}",
      env: CHAT_ENV,
      nowMs: 1000,
      prng: () => 0.5,
      chatScoped: true,
    });
    expect(result).toEqual({ text: "streak=3 count=5" });
  });

  test("an owner-global (chatScoped:false) render leaves the chat plane UNBOUND — a chat-keyed expr errors rather than lying with an invented 0", () => {
    const result = renderArmTemplate({
      template: "count={{expr::chat.messageCount}}",
      env: CHAT_ENV,
      nowMs: 1000,
      prng: () => 0.5,
      chatScoped: false,
    });
    expect(result).toMatchObject({ error: expect.any(String) });
  });

  test("the global plane stays reachable even when chatScoped is false", () => {
    const result = renderArmTemplate({
      template: "streak={{getglobalvar::streak}}",
      env: CHAT_ENV,
      nowMs: 1000,
      prng: () => 0.5,
      chatScoped: false,
    });
    expect(result).toEqual({ text: "streak=3" });
  });

  test("macroEnv feeds a per-call variable (transform_draft's {{draft}})", () => {
    const result = renderArmTemplate({
      template: "was:[{{draft}}]",
      env: CHAT_ENV,
      nowMs: 1000,
      prng: () => 0.5,
      chatScoped: true,
      macroEnv: { draft: "hello" },
    });
    expect(result).toEqual({ text: "was:[hello]" });
  });
});
