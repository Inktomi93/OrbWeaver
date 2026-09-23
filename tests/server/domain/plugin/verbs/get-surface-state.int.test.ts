// verb: getSurfaceState — one owned surface's published state (U1; the room dimension is
// row 777). Owner-scoped (leak-free NOT_FOUND for a plugin the caller does not own); reads the in-memory
// surface-state plane the compose `ui.setState` op writes. `null` when nothing has been published for that
// (surface, room).
//
// HONEST LABELLING of the row-777 block below: those are FENCES on a capability that did not exist before this
// commit, not defect proofs — there was no `chatId` to mis-gate, so there is no red to demonstrate against the
// old source. What they fence is the failure this shape could have shipped with: a client-supplied `chatId`
// taken on trust, which would turn an owned-plugin read into a MEMBERSHIP ORACLE (walk chat ids against your
// own plugin, watch which ones answer differently). The membership test is the one that would go red if a
// future edit dropped `resolveChatAuthority` from the verb.

import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const ROOM = castId<ChatId>("chat_0000000000000000000001");

test("returns the surface's published state for an owned plugin", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  // The state plane is written by `ui.setState` at compose; here we seed the SAME store the verb reads.
  h.ctx.surfaceState.set(installed.id, "panel", null, { affinity: 7, mood: "warm" });

  expect(await h.service.getSurfaceState({ caller, pluginId: installed.id, surfaceId: "panel" })).toEqual({ affinity: 7, mood: "warm" });
});

test("returns null when nothing has been published for that surface", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const owner = await seedUser(db, { handle: castId<Handle>("owner") });
  const caller = ownerPrincipalFor(owner);
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  expect(await h.service.getSurfaceState({ caller, pluginId: installed.id, surfaceId: "panel" })).toBeNull();
});

test("a missing/foreign plugin is a leak-free NotFound (never a cross-tenant state read)", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
  const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
  const alphaPlugin = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "mood" }), grant: [] });
  h.ctx.surfaceState.set(alphaPlugin.id, "panel", null, { secret: "alpha" });

  // Beta holding alpha's REAL pluginId reads absent → NotFound, never alpha's state.
  await expect(h.service.getSurfaceState({ caller: beta, pluginId: alphaPlugin.id, surfaceId: "panel" })).rejects.toBeInstanceOf(PluginNotFoundError);
  await expect(h.service.getSurfaceState({ caller: alpha, pluginId: castId<PluginId>("plugin_missing"), surfaceId: "panel" })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );
});

test("row 777: a chatId reads THAT room's row, and never the plugin-wide one", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  h.ctx.surfaceState.set(installed.id, "panel", null, { scope: "plugin-wide" });
  h.ctx.surfaceState.set(installed.id, "panel", ROOM, { scope: "room" });

  expect(await h.service.getSurfaceState({ caller, pluginId: installed.id, surfaceId: "panel", chatId: ROOM })).toEqual({ scope: "room" });
  expect(await h.service.getSurfaceState({ caller, pluginId: installed.id, surfaceId: "panel" })).toEqual({ scope: "plugin-wide" });
});

test("row 777: a chatId the caller cannot READ is a leak-free NotFound — the claim is verified, not trusted", async () => {
  const db = await freshDb();
  // The membership seam refuses this room. In production it is `loadPresentRole` under the caller; here the
  // harness's own seam stands in, which is what makes this a test of the VERB's gate rather than of chat's.
  const h = makePluginHarness(db, { resolveChatAuthority: () => Promise.resolve({ canRead: false, canWrite: false }) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  // State EXISTS for that room — so a verb that skipped the gate would return it, and this test would go green
  // for the wrong reason. The refusal has to come from the membership check, not from an empty plane.
  h.ctx.surfaceState.set(installed.id, "panel", ROOM, { secret: "room" });

  await expect(h.service.getSurfaceState({ caller, pluginId: installed.id, surfaceId: "panel", chatId: ROOM })).rejects.toBeInstanceOf(DomainNotFoundError);
  // …and the plugin-wide read is UNAFFECTED: the gate fires on the room claim only, so a plugin whose settings
  // panel has nothing to do with rooms keeps working for a caller who is in no rooms at all.
  expect(await h.service.getSurfaceState({ caller, pluginId: installed.id, surfaceId: "panel" })).toBeNull();
});
