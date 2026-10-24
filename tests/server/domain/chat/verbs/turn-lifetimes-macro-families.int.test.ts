// @subject packages/server/src/domain/chat/verbs/turn.ts
// @subject packages/server/src/domain/chat/assembly/assemble.ts
import type { MessageView, TurnOutcome, VariantWireView } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { textRoom } from "../scenario-physical.ts";
import { followupRoom } from "./followup-physical.ts";
import { MOOD_CONFIG } from "./turn-lifetimes-macro-data.ts";

function assistant(outcome: TurnOutcome): MessageView {
  const reply = outcome.messages.find(({ role }) => role === "assistant");
  if (reply === undefined) {
    throw new Error("the actual macro operation produced no assistant variant");
  }
  return reply;
}

async function draw(h: ChatRoot, reply: MessageView): Promise<VariantWireView["macroDraws"]> {
  return (await h.root.services.chat.getVariantWire({ principal: h.owner, chatId: h.chatId, variantId: reply.selectedVariantId })).macroDraws;
}

async function wires(h: ChatRoot): Promise<string[]> {
  return await Promise.all(
    h.requests
      .filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"))
      .map(async (request) => await request.clone().text()),
  );
}

test("a real older slot with no macro draw records a fresh draw on swipe after its owner's preset changes", async () => {
  let entropy = 0;
  await using h = await textRoom(["An older complete reply.", "A newly drawn variant."], {
    group: { output: "per-speaker", policy: "natural", allowSelfResponses: true },
    server: { random: () => entropy },
  });
  const params = { principal: h.owner, chatId: h.chatId };
  const before = await h.root.services.chat.send({ ...params, content: "An old-style scene." });
  expect(before.aborted).toBe(false);
  const old = assistant(before);
  expect(await draw(h, old)).toBeNull();
  const preset = await h.caller.preset.create({ name: "New actual mood preset", kind: "custom", config: MOOD_CONFIG });
  await h.caller.settings.updateUserSettingsSection({ section: "seeds", patch: { defaultPresetId: preset.id } });
  entropy = 0.9;
  const swiped = await h.root.services.chat.swipe({ ...params, messageId: old.id });
  expect(swiped.aborted).toBe(false);
  const selected = assistant(swiped);
  expect(selected.id).toBe(old.id);
  expect(selected.selectedVariantId).not.toBe(old.selectedVariantId);
  expect(await draw(h, selected)).toEqual({ mood: { tone: "wry" } });
  const inputs = await wires(h);
  expect(inputs).toHaveLength(2);
  expect(inputs[0]).not.toContain("Scene tone:");
  expect(inputs[1]).toContain("Scene tone: wry.");
});

test("a later actual SEND creates a distinct slot with a fresh prompt and persisted draw", async () => {
  let entropy = 0;
  await using h = await textRoom(["The first complete scene.", "The second complete scene."], {
    promptConfig: MOOD_CONFIG,
    group: { output: "per-speaker", policy: "natural", allowSelfResponses: true },
    server: { random: () => entropy },
  });
  const params = { principal: h.owner, chatId: h.chatId };
  const first = await h.root.services.chat.send({ ...params, content: "First scene." });
  expect(first.aborted).toBe(false);
  const a = assistant(first);
  expect(await draw(h, a)).toEqual({ mood: { tone: "grim" } });
  entropy = 0.9;
  const second = await h.root.services.chat.send({ ...params, content: "Second scene." });
  expect(second.aborted).toBe(false);
  const b = assistant(second);
  expect(b.id).not.toBe(a.id);
  expect(await draw(h, b)).toEqual({ mood: { tone: "wry" } });
  expect(await draw(h, a)).toEqual({ mood: { tone: "grim" } });
  const inputs = await wires(h);
  expect(inputs).toHaveLength(2);
  expect(inputs[0]).toContain("Scene tone: grim.");
  expect(inputs[1]).toContain("Scene tone: wry.");
});

test("the real per-chat stored input narrows a random-pick pool instead of allowing the business PRNG to choose", async () => {
  await using h = await textRoom(["The saved warm scene."], {
    promptConfig: MOOD_CONFIG,
    server: { random: () => 0 },
    group: { output: "per-speaker", policy: "natural" },
  });
  const params = { principal: h.owner, chatId: h.chatId };
  await h.root.services.chat.setUserMacroValues({ ...params, values: { mood: { tone: ["warm"] } } });
  expect((await h.root.services.chat.getUserMacroPicks(params)).values).toEqual({ mood: { tone: ["warm"] } });
  const outcome = await h.root.services.chat.send({ ...params, content: "Use the stored pick." });
  expect(outcome.aborted).toBe(false);
  expect(await draw(h, assistant(outcome))).toEqual({ mood: { tone: "warm" } });
  const inputs = await wires(h);
  expect(inputs).toHaveLength(1);
  expect(inputs[0]).toContain("Scene tone: warm.");
  expect(inputs[0]).not.toContain("Scene tone: grim.");
});

test("actual continuation of a length-capped native reply retains its original prompt draw and saved record", async () => {
  let entropy = 0;
  await using h = await followupRoom(
    [
      { text: "Part one", finishReason: "length" },
      { text: " part two.", finishReason: "stop" },
    ],
    { promptConfig: MOOD_CONFIG, server: { random: () => entropy }, group: { output: "per-speaker", policy: "natural", allowSelfResponses: true } },
  );
  const params = { principal: h.owner, chatId: h.chatId };
  const first = await h.root.services.chat.send({ ...params, content: "Begin the capped scene." });
  expect(first.aborted).toBe(false);
  const target = assistant(first);
  const before = await draw(h, target);
  expect(before).toEqual({ mood: { tone: "grim" } });
  entropy = 0.9;
  const continued = await h.root.services.chat.continueTurn({ ...params, messageId: target.id });
  expect(continued.aborted).toBe(false);
  const after = assistant(continued);
  expect(after.id).toBe(target.id);
  expect(after.content).toContain("Part one");
  expect(after.content).toContain("part two.");
  expect(await draw(h, after)).toEqual(before);
  const inputs = await wires(h);
  expect(inputs).toHaveLength(2);
  expect(inputs.every((body) => body.includes("Scene tone: grim."))).toBe(true);
  expect(inputs.some((body) => body.includes("Scene tone: wry."))).toBe(false);
});
