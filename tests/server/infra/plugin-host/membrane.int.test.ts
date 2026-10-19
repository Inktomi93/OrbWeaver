// @subject packages/server/src/infra/plugin-host/membrane.ts
import "@orb/testkit/node/composed-real.ts";
import { spawn } from "node:child_process";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { createServerHarness } from "@orb/testkit/node/server.ts";

// Far past the membrane's dump depth guard, so the iterative pre-walk must refuse this argument.
const PAST_DEPTH_GUARD = 1000;

// `ctx.dump` serializes through the guest's JSON.stringify, which calls the root's `toJSON` before it walks
// anything. The guest records that call, so a materialization that ran before the guard refused is visible
// even when the refusal itself looks the same.
const DEEP_ARGUMENT = `
const h = orb.host(1);
(async () => {
  let deep = {};
  for (let i = 0; i < ${PAST_DEPTH_GUARD}; i++) { deep = { n: deep }; }
  let materialized = false;
  deep.toJSON = () => { materialized = true; return {}; };
  try { await h.chat.listMessages(h.chat.current(), deep); h.log.info("accepted"); }
  catch (e) { h.log.info("refused:" + e.name); }
  h.log.info("materialized:" + materialized);
})();`;

const ORDINARY_ARGUMENT = `
const h = orb.host(1);
(async () => {
  const view = { order: { newest: true } };
  let materialized = false;
  view.toJSON = () => { materialized = true; return { order: { newest: true } }; };
  try { const rows = await h.chat.listMessages(h.chat.current(), { limit: 5, view }); h.log.info("listed:" + Array.isArray(rows)); }
  catch (e) { h.log.info("refused:" + e.name); }
  h.log.info("materialized:" + materialized);
})();`;

test("a guest argument past the dump depth guard is refused without ever being materialized, and the runtime keeps serving", async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, random: () => 0 });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.startChat({ characterIds: [] })).chat;

  const deep = await caller.plugin.runSnippet({ chatId: room.id, code: DEEP_ARGUMENT });
  expect(deep.error).toBeUndefined();
  expect(deep.logLines).toEqual(["[info] refused:Error", "[info] materialized:false"]);

  // The positive control for the sentinel: an argument the guard admits is materialized through `toJSON`.
  const ordinary = await caller.plugin.runSnippet({ chatId: room.id, code: ORDINARY_ARGUMENT });
  expect(ordinary.error).toBeUndefined();
  expect(ordinary.logLines).toEqual(["[info] listed:true", "[info] materialized:true"]);
});
