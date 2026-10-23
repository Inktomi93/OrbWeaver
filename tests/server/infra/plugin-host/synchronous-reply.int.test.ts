// @subject packages/server/src/infra/plugin-host/worker-runtime.ts
import { spawn } from "node:child_process";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

const SOURCE = 'const h = orb.host(1); h.log.info("random=" + h.random.next());';

test("a non-finite app entropy value is refused after JSON transport, never coerced into guest zero", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, random: () => Number.NaN });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;
  const result = await caller.plugin.runSnippet({ chatId: room.id, code: SOURCE });
  expect(result.error).toBeDefined();
  expect(result.logLines).toEqual([]);
});

test("the synchronous native codec preserves valid zero entropy and marshals a guest error without breaking the next run", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, random: () => 0 });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;
  const first = await caller.plugin.runSnippet({ chatId: room.id, code: SOURCE });
  expect(first.error).toBeUndefined();
  expect(first.logLines).toEqual([expect.stringContaining("random=0")]);
  const failed = await caller.plugin.runSnippet({ chatId: room.id, code: 'throw new TypeError("guest refusal");' });
  expect(failed.error).toContain("guest refusal");
  const after = await caller.plugin.runSnippet({ chatId: room.id, code: SOURCE });
  expect(after.error).toBeUndefined();
  expect(after.logLines).toEqual(first.logLines);
});
