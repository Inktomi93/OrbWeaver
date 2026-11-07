// @subject packages/server/src/domain/plugin/verbs/run-snippet.ts
// @subject packages/server/src/domain/plugin/substrate/snippet-gate.ts
import { expect, test } from "@orb/testkit/node";
import { createServerHarness } from "@orb/testkit/node/composed";
import { vi } from "vitest";
import { SNIPPET_CONCURRENCY_PER_USER } from "#server/domain/plugin/substrate/snippet-gate.ts";

const SOURCE = "const h = orb.host(1); h.log.info('admitted');";

test("the real snippet gates ownership before a refused raw spawn and releases admission for every later attempt", async () => {
  const execute = vi.fn((): never => {
    throw new Error("controlled plugin spawn refusal");
  });
  await using harness = await createServerHarness({ pluginSpawn: execute });
  const owner = await harness.internalCallerFor(harness.ownerId);
  const room = (await owner.chat.startChat({ characterIds: [] })).chat;
  const stranger = await harness.actor();
  const foreignCaller = await harness.internalCallerFor(stranger.id);
  await expect(foreignCaller.plugin.runSnippet({ chatId: room.id, code: SOURCE })).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect(execute).not.toHaveBeenCalled();
  // One past the ceiling, so a run that keeps its slot turns the last attempt into a busy refusal.
  const attempts = SNIPPET_CONCURRENCY_PER_USER + 1;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await expect(owner.plugin.runSnippet({ chatId: room.id, code: SOURCE })).rejects.toThrow("controlled plugin spawn refusal");
  }
  expect(execute).toHaveBeenCalledTimes(attempts);
});
