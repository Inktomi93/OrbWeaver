// What proves a turn rode the harness's local engine: the bound connection dials it, the provider request recorded for
// this chat named its model and came back with response headers, and the committed row carries that model.
import type { ChatId, MessageId } from "@orb/kit/ids";
import { LOCAL_ENGINE_BASE_URL, LOCAL_ENGINE_PROVIDER } from "@orb/tooling/floor/http/local-engine";
import { expect } from "@playwright/test";
import { canonMessage, localEngineConnection, requireWireCaptures } from "./trpc.ts";

export async function expectLocalEngineServed(chatId: ChatId, assistantId: MessageId): Promise<void> {
  const engine = await localEngineConnection();
  expect(engine.baseUrl).toBe(LOCAL_ENGINE_BASE_URL);
  const [capture] = await requireWireCaptures(chatId, LOCAL_ENGINE_PROVIDER);
  expect(capture.body["model"]).toBe(engine.model);
  expect(capture.responseHeaders).toBeDefined();
  expect((await canonMessage(chatId, assistantId))?.model).toBe(engine.model);
}
