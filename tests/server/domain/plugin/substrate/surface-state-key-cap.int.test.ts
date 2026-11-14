// A real guest that holds its whole surface-state key allowance is refused a new key, and the operator log names the
// plugin, the surface and the room it was refused in; an overwrite of a key it already holds still lands (D351).
// @subject packages/server/src/domain/plugin/substrate/surface-state.ts
import { spawn } from "node:child_process";
import { DomainConflictError } from "@orb/kit/errors";
import { expect, test } from "@orb/testkit/node";
import type { GuestOps } from "@orb/testkit/node/composed";
import { createServerHarness, guestRunner, installGuest, seedChat } from "@orb/testkit/node/composed";
import { z } from "zod";
import { PLUGIN_SURFACE_STATE_MAX_KEYS } from "#server/domain/plugin/substrate/surface-state.ts";

// `fill` publishes one room-less key per surface id in [0, a.count); `put` publishes one key, in the invoking room
// when `a.inRoom` is set, and reports the refusal's name rather than throwing it.
const STATE_OPS = {
  fill: "async (h, room, a) => { for (let i = 0; i < a.count; i += 1) { await h.ui.setState('s' + i, { n: i }); } return null; }",
  put: "async (h, room, a) => { try { await h.ui.setState(a.id, { n: a.n }, a.inRoom ? room : undefined); return 'stored'; } catch (error) { return error.name; } }",
} as const satisfies GuestOps;

// A server log line is one JSON object; the case reads the refusal's structured fields, never its message.
const LOG_ENTRY = z.record(z.string(), z.unknown());

test("a new key past the cap is refused with the plugin and room logged, and an overwrite of a held key proceeds", { tags: ["slow"] }, async () => {
  await using root = await createServerHarness({ pluginSpawn: spawn, logLevel: "warn" });
  const owner = await root.principalFor(root.ownerId);
  const {
    view: { chat },
  } = await seedChat(root, { principal: owner, characterIds: [] });
  const pluginId = await installGuest(root, owner, { slug: "state-filler", capabilities: ["chat.read"] }, STATE_OPS);
  const plainRun = guestRunner({ root, caller: owner, pluginId, chatId: null });
  const roomRun = guestRunner({ root, caller: owner, pluginId, chatId: chat.id });
  const lastKey = `s${PLUGIN_SURFACE_STATE_MAX_KEYS - 1}`;

  expect(await plainRun("fill", { count: PLUGIN_SURFACE_STATE_MAX_KEYS })).toEqual({ ok: true, value: null });
  const held = await root.services.plugin.getSurfaceState({ caller: owner, pluginId, surfaceId: lastKey });
  expect(held).toEqual({ n: PLUGIN_SURFACE_STATE_MAX_KEYS - 1 });

  expect(await roomRun("put", { id: "overflow", n: 1, inRoom: true })).toEqual({ ok: true, value: DomainConflictError.name });
  expect(await root.services.plugin.getSurfaceState({ caller: owner, pluginId, surfaceId: "overflow", chatId: chat.id })).toBeNull();
  const refusals = root.observability
    .logLines()
    .map((line) => LOG_ENTRY.parse(JSON.parse(line)))
    .filter((entry) => entry["cap"] === PLUGIN_SURFACE_STATE_MAX_KEYS);
  expect(refusals).toEqual([expect.objectContaining({ pluginId, surfaceId: "overflow", chatId: chat.id })]);

  expect(await plainRun("put", { id: lastKey, n: -1, inRoom: false })).toEqual({ ok: true, value: "stored" });
  expect(await root.services.plugin.getSurfaceState({ caller: owner, pluginId, surfaceId: lastKey })).toEqual({ n: -1 });
});
