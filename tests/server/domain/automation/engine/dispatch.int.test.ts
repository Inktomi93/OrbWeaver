// @subject packages/server/src/domain/automation/engine/dispatch.ts
// @subject packages/server/src/domain/automation/service.ts

import { createBookSchema } from "@orb/contracts/world-info";
import { DomainNotFoundError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import { createServerHarness } from "@orb/testkit/node/composed";
import { enabledRule } from "../runtime.fixtures.ts";
import { portraits, portraitTest } from "./dispatch.fixtures.ts";

portraitTest("contentChanged admits a real content write but not a flag-only character event", async ({ portrait }) => {
  const { root, character, physical } = portrait;
  const principal = await root.principalFor(root.ownerId);
  const rule = await enabledRule(root, {
    chatId: null,
    name: "Content-only living library",
    trigger: { bus: "domain", type: "character.updated" },
    predicateCel: "has(event.character) && event.character.contentChanged",
    actions: [{ type: "generate_image", mode: "character_multimodal", n: 1, useAvatarReference: false, reuse: "prefer", quiet: true }],
  });
  await root.services.automation.handleEvent({ type: "character.updated", characterId: character.id, contentChanged: false });
  expect(physical.requests.filter((request) => request.startsWith("POST "))).toEqual([]);
  expect(await portraits(root)).toEqual([]);
  expect(await root.services.automation.listFires({ principal, ruleId: rule.id })).toEqual([]);
  await root.services.automation.handleEvent({ type: "character.updated", characterId: character.id, contentChanged: true });
  expect(physical.requests.filter((request) => request.startsWith("POST "))).toEqual(["POST /v1/chat/completions", "POST /v1/images/generations"]);
  expect(await portraits(root)).toHaveLength(1);
  expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => fire.outcome)).toEqual(["fired"]);
});

portraitTest("a rule-fired free-mode generate_image reaches the image provider and keeps its prompt and negative prompt", async ({ portrait }) => {
  const { root, character, physical } = portrait;
  const prompt = "a lighthouse at dusk";
  const negative = "blurry hands, extra fingers";
  const { chat } = await root.services.chat.startChat({ principal: await root.principalFor(root.ownerId), characterIds: [character.id], opening: "none" });
  await enabledRule(root, {
    chatId: chat.id,
    name: "Free-mode drawing",
    trigger: { bus: "chat", type: "chatOpened" },
    predicateCel: null,
    actions: [{ type: "generate_image", mode: "free", prompt, negative, n: 1, useAvatarReference: false, reuse: "never", quiet: true }],
  });
  await root.services.automation.handleEvent({ type: "chatOpened", chatId: chat.id });
  expect(physical.requests.filter((request) => request.startsWith("POST "))).toEqual(["POST /v1/images/generations"]);
  const [provenance, ...rest] = await portraits(root);
  expect(rest).toEqual([]);
  expect(provenance).toMatchObject({ mode: "free", prompt });
  // The provider's own default negatives stay; the rule's are added to them.
  expect(provenance?.negativePrompt).toContain(negative);
});

async function prepareChain(
  root: ServerTestHarness,
  confirmFirst: boolean,
): Promise<{
  readonly chatId: Awaited<ReturnType<ServerTestHarness["services"]["chat"]["startChat"]>>["chat"]["id"];
  readonly book: Awaited<ReturnType<ServerTestHarness["services"]["worldInfo"]["createBook"]>>;
  readonly rule: Awaited<ReturnType<typeof enabledRule>>;
}> {
  const principal = await root.principalFor(root.ownerId);
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [], opening: "none" });
  const book = await root.services.worldInfo.createBook({ principal, input: createBookSchema.parse({ name: "Chain witness" }) });
  await root.services.worldInfo.attachToChat({ principal, chatId: chat.id, bookId: book.id });
  const rule = await enabledRule(root, {
    chatId: chat.id,
    name: "Mixed postures",
    trigger: { bus: "chat", type: "chatOpened" },
    actions: [
      { type: "set_variable", scope: "global", key: "before", op: "inc" },
      { type: "insert_world_info_entry", bookId: book.id, entryKey: "asks", keys: ["loom"], contentTemplate: "The keeper records the loom.", confirmFirst },
      { type: "set_variable", scope: "global", key: "after", op: "inc" },
    ],
  });
  return { chatId: chat.id, book, rule };
}

test("CONTROL: without confirmation every real arm runs and the rule fires", async () => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const { chatId, book, rule } = await prepareChain(root, false);
  await root.services.automation.handleEvent({ type: "chatOpened", chatId });
  expect(await root.services.automation.getGlobalVariable({ principal, key: "before" })).toBe("1");
  expect((await root.services.worldInfo.listEntries({ principal, bookId: book.id })).map((entry) => entry.content)).toEqual(["The keeper records the loom."]);
  expect(await root.services.automation.getGlobalVariable({ principal, key: "after" })).toBe("1");
  expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => fire.outcome)).toEqual(["fired"]);
});

test("the arms behind a real confirm-first question wait for the human instead of racing ahead", async ({ signal }) => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const { chatId, book, rule } = await prepareChain(root, true);
  const cancellation = new AbortController();
  const stream = root.app.liveBuses.automation.subscribeAutomation(chatId, AbortSignal.any([signal, cancellation.signal]))[Symbol.asyncIterator]();
  try {
    const raised = stream.next();
    await root.services.automation.handleEvent({ type: "chatOpened", chatId });
    const event = await raised;
    expect(event).toMatchObject({ done: false, value: { type: "suggestionRaised", kind: "confirm", source: { kind: "rule", ruleId: rule.id } } });
    expect(await root.services.automation.getGlobalVariable({ principal, key: "before" })).toBe("1");
    expect(await root.services.worldInfo.listEntries({ principal, bookId: book.id })).toEqual([]);
    expect(await root.services.automation.getGlobalVariable({ principal, key: "after" })).toBeNull();
    expect(await root.services.automation.listFires({ principal, ruleId: rule.id })).toEqual([]);
    if (event.done || event.value.type !== "suggestionRaised") {
      throw new Error("the real confirm-first arm did not raise its pending question");
    }
    await root.services.automation.confirmSuggestion({ principal, suggestionId: event.value.suggestionId });
    expect((await root.services.worldInfo.listEntries({ principal, bookId: book.id })).map((entry) => entry.content)).toEqual(["The keeper records the loom."]);
    expect(await root.services.automation.getGlobalVariable({ principal, key: "after" })).toBe("1");
    expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => fire.outcome)).toEqual(["fired"]);
  } finally {
    cancellation.abort();
    await stream.return?.();
  }
});

test("a confirmed arm that errors refuses the confirm, keeps its action_error fire, and has spent the ask", async ({ signal }) => {
  await using root = await createServerHarness();
  const principal = await root.principalFor(root.ownerId);
  const { chatId, book, rule } = await prepareChain(root, true);
  const cancellation = new AbortController();
  const stream = root.app.liveBuses.automation.subscribeAutomation(chatId, AbortSignal.any([signal, cancellation.signal]))[Symbol.asyncIterator]();
  try {
    const raised = stream.next();
    await root.services.automation.handleEvent({ type: "chatOpened", chatId });
    const event = await raised;
    if (event.done || event.value.type !== "suggestionRaised") {
      throw new Error("the real confirm-first arm did not raise its pending question");
    }
    const params = { principal, suggestionId: event.value.suggestionId };
    // The room's consent is withdrawn after the question: the lore write the host is about to confirm now fails.
    await root.services.worldInfo.detachFromChat({ principal, chatId, bookId: book.id });
    await expect(root.services.automation.confirmSuggestion(params)).rejects.toMatchObject({ code: "automation_suggestion_act_failed" });
    expect(await root.services.worldInfo.listEntries({ principal, bookId: book.id })).toEqual([]);
    expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => fire.outcome)).toEqual(["action_error"]);
    // A retry finds nothing: the ask was spent when the host confirmed.
    await expect(root.services.automation.confirmSuggestion(params)).rejects.toBeInstanceOf(DomainNotFoundError);
  } finally {
    cancellation.abort();
    await stream.return?.();
  }
});

portraitTest("a confirmed fresh run whose arm errors refuses the confirm instead of reading as success", async ({ portrait }) => {
  const { root, character } = portrait;
  const principal = await root.principalFor(root.ownerId);
  const { chat } = await root.services.chat.startChat({ principal, characterIds: [character.id], opening: "none" });
  const rule = await enabledRule(root, {
    chatId: chat.id,
    name: "One drawing an hour",
    trigger: { bus: "chat", type: "chatOpened" },
    predicateCel: null,
    maxFiresPerHour: 1,
    actions: [{ type: "generate_image", mode: "free", prompt: "a lighthouse", n: 1, useAvatarReference: false, reuse: "never", quiet: true }],
  });
  await root.services.automation.handleEvent({ type: "chatOpened", chatId: chat.id });
  const cancellation = new AbortController();
  const stream = root.app.liveBuses.automation.subscribeAutomation(chat.id, cancellation.signal)[Symbol.asyncIterator]();
  try {
    const raised = stream.next();
    await root.services.automation.handleEvent({ type: "chatOpened", chatId: chat.id });
    const event = await raised;
    if (event.done || event.value.type !== "suggestionRaised") {
      throw new Error("the rate-capped rule did not raise its invitation");
    }
    expect(event.value.kind).toBe("invitation");
    await root.services.connection.setBinding({ principal, task: "generateImage", connectionId: null });
    await expect(root.services.automation.confirmSuggestion({ principal, suggestionId: event.value.suggestionId })).rejects.toMatchObject({
      code: "automation_suggestion_act_failed",
    });
    expect((await root.services.automation.listFires({ principal, ruleId: rule.id })).map((fire) => fire.outcome)).toContain("action_error");
  } finally {
    cancellation.abort();
    await stream.return?.();
  }
});
