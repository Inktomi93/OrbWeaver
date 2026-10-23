// @subject packages/server/src/domain/chat/engine/engine.ts
// Saved capabilities and owned media cause real funnel warnings, never fabricated ChatResult events.
import type { ChatBusEvent } from "@orb/contracts/chat";
import { ID_PREFIX } from "@orb/kit/ids";
import { jsonValueSchema } from "@orb/kit/json";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { CORPUS_PROVIDER_ENDPOINT, CORPUS_TEXT_MODEL, makeAssetBytes } from "@orb/testkit/node/composed";
import { terminalSseLine } from "@orb/testkit/node/helpers";
import { coreFrame, coreHttpRoom, coreSse } from "./core-physical.ts";

const REPLY = "The actual text-only reply.";

function response(): Response {
  return coreSse([coreFrame({ choices: [{ delta: { content: REPLY } }] }), terminalSseLine({ usage: { promptTokens: 4, completionTokens: 2 } })]);
}

async function bindTextOnly(h: ChatRoot): Promise<void> {
  const connection = await h.root.services.connection.create({
    principal: h.owner,
    providerId: "custom-openai",
    credentialId: null,
    baseUrl: CORPUS_PROVIDER_ENDPOINT,
    model: CORPUS_TEXT_MODEL,
    declared: {
      kind: "generation",
      generation: { input: ["text"], context: { window: 32_000 }, sampling: { temperature: undefined } },
      features: { detectServer: false },
    },
  });
  await h.caller.connection.setBinding({ task: "chat", connectionId: connection.id });
}

test("a saved text-only model drops the actual owned input image exactly once and retains its user canon", async () => {
  await using h = await coreHttpRoom([response]);
  await bindTextOnly(h);
  const asset = await h.root.app.assets.store({
    principal: h.owner,
    kind: "attachment",
    mime: "image/png",
    bytes: makeAssetBytes(h.root.idSource.typeId(ID_PREFIX.asset)),
  });
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const outcome = await h.root.services.chat.send({
    principal: h.owner,
    chatId: h.chatId,
    content: "Inspect this owned picture.",
    attachmentAssetIds: [asset.assetId],
  });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages.filter((message) => message.role === "assistant")).toMatchObject([{ content: REPLY }]);
  expect(outcome.messages.find((message) => message.role === "user")?.content).toContain(`asset:${asset.assetId}`);
  expect(events.filter((event) => event.type === "warning" && event.code === "image_dropped")).toHaveLength(1);
  const requests = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(requests).toHaveLength(1);
  const body = await requests[0]?.clone().text();
  expect(body).not.toContain('"image_url"');
  expect(body).not.toContain("data:image/");
});

test("an unsupported actual temperature reaches the room as settings_adjusted naming the dropped knob", async () => {
  await using h = await coreHttpRoom([response]);
  await bindTextOnly(h);
  const events: ChatBusEvent[] = [];
  using subscription = new DisposableStack();
  subscription.defer(
    h.root.app.liveBuses.chat.subscribeAllChatEvents(({ event }) => {
      if (event.chatId === h.chatId) {
        events.push(event);
      }
    }),
  );
  const outcome = await h.root.services.chat.generate({ principal: h.owner, chatId: h.chatId, intent: { temperature: 0.9 } });
  expect(outcome.aborted).toBe(false);
  expect(outcome.messages).toMatchObject([{ content: REPLY }]);
  expect(events.filter((event) => event.type === "warning" && event.code === "settings_adjusted" && event.knob === "temperature")).toMatchObject([
    { adjustment: "sampling_knob_dropped", knob: "temperature" },
  ]);
  const requests = h.requests.filter((request) => request.method === "POST" && new URL(request.url).pathname.endsWith("/chat/completions"));
  expect(requests).toHaveLength(1);
  const sent = requests[0];
  if (sent === undefined) {
    throw new Error("the real warning turn never reached physical HTTP");
  }
  const body = jsonValueSchema.parse(JSON.parse(await sent.clone().text()));
  if (body === null || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("the actual warning response has no native request object");
  }
  expect(body["temperature"]).toBeUndefined();
});
