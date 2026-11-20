// @subject packages/inference/src/funnel/resolve-chat.ts
// The reply cap a turn sends. A connection whose server states no max output holds the kind floor's guess, and a guess
// never shortens a preset's own number; a cap the user declares or the server states still does.
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import { makePromptConfig } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL } from "@orb/testkit/node/composed";
import { textRoom, wireOf } from "../scenario-physical.ts";

// Above the kind floor's guess and above the declared cap below.
const PRESET_ASKS = 29_828;
const DECLARED_CAP = 8192;

async function bindProxy(h: ChatRoot, declaredCap: number | null): Promise<{ readonly guessed: boolean; readonly cap: number }> {
  const connection = await h.caller.connection.create({
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    label: "Proxy",
    declared: {
      kind: "generation",
      features: { detectServer: false },
      ...(declaredCap === null ? {} : { generation: { output: { maxTokens: { min: 1, max: declaredCap } } } }),
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
  const view = await h.caller.connection.capabilities({ connectionId: connection.id });
  if (view.capability.kind !== "generation") {
    throw new Error("The proxy connection did not resolve a generation model");
  }
  const { output } = view.capability.generation;
  return { guessed: output.maxTokensEstimated === true, cap: output.maxTokens.max };
}

async function sentCap(h: ChatRoot): Promise<unknown> {
  const { newest } = await wireOf(h, () => h.root.services.chat.send({ principal: h.owner, chatId: h.chatId, content: "Go on." }));
  if (newest === null || typeof newest !== "object" || Array.isArray(newest)) {
    throw new Error("The provider request is not an object");
  }
  return newest["max_tokens"] ?? newest["max_completion_tokens"];
}

test("a preset's Max output tokens over a guessed cap is sent as the preset sets it", async () => {
  await using h = await textRoom(["The keeper answers."], {
    promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, maxOutputTokens: PRESET_ASKS } }),
  });
  const proxy = await bindProxy(h, null);
  expect(proxy.guessed).toBe(true);
  expect(proxy.cap).toBeLessThan(PRESET_ASKS);

  expect(await sentCap(h)).toBe(PRESET_ASKS);
});

test("a max output the user declares still holds the same preset to it", async () => {
  await using h = await textRoom(["The keeper answers."], {
    promptConfig: makePromptConfig({ params: { ...DEFAULT_PROMPT_CONFIG.params, maxOutputTokens: PRESET_ASKS } }),
  });
  const proxy = await bindProxy(h, DECLARED_CAP);
  expect(proxy).toEqual({ guessed: false, cap: DECLARED_CAP });

  expect(await sentCap(h)).toBe(DECLARED_CAP);
});
