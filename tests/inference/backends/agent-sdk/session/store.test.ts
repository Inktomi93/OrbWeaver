import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { SessionCache } from "../../../../../packages/inference/src/backends/agent-sdk/session/store.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const log = {
  debug: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
};

test("a chat session recorded for one connection is not resumed through another connection", () => {
  const cache = new SessionCache(log);
  const chatId = mintTypeId(ID_PREFIX.chat);
  const firstConnectionId = mintTypeId(ID_PREFIX.userConnection);
  const secondConnectionId = mintTypeId(ID_PREFIX.userConnection);

  // Reflect.apply keeps this regression executable against the old two-argument cache API: before the
  // repair, the extra connection identity is ignored and the chat-wide handle leaks across connections.
  Reflect.apply(cache.record, cache, [chatId, firstConnectionId, "8f51fc80-b118-4c5f-a06a-37bcb7dd88e3"]);

  expect(Reflect.apply(cache.resolveResumeId, cache, [chatId, secondConnectionId])).toBeUndefined();
});
