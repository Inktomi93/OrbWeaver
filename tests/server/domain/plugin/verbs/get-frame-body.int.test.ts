// verb: getFrameBody — the plugin-frame doorway's ONE read. Its three gates,
// each probed at the boundary it defends:
//
//   1. OWNERSHIP — a stranger holding a REAL pluginId learns nothing a stranger holding a fabricated one does
//      not (the D147 leak-free posture: `getById` is the gate, and it throws `PluginNotFoundError` either way).
//   2. CONSENT, RE-CHECKED PER CALL — the row must still carry the `ui.frame` grant. This is the gate that
//      matters most, because the membrane's registration-time check CANNOT be the whole story: a resident
//      instance outlives a re-grant, so consent that is only checked when code registers is consent that cannot
//      be withdrawn.
//   3. THE SURFACE — a live registration of THIS plugin, at the `frame` tier, carrying a body.
//
// Everything that is not "yes" is the same `null`, so the doorway serves one identical miss for all of them.

import type { Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginInstance } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const BOARD = { html: "<canvas id='board'></canvas><script>drawChess()</script>", css: "body{margin:0}" };

/** A resident carrying one frame surface at the flank, plus a declarative sibling so the tier filter is
 *  non-vacuous (a verb that returned the first surface regardless would pass an only-frames fixture). */
function residentWithFrame(): PluginInstance {
  return {
    tools: [],
    transforms: [],
    events: [],
    pubsub: [],
    displayTransforms: [],
    macros: [],
    commands: [],
    surfaces: [
      { id: "panel", anchor: "settings", title: "Panel", tier: "static", spec: { kind: "text", value: "hi" } },
      { id: "board", anchor: "chat-flank", title: "Chess", tier: "frame", frame: BOARD },
    ],
  };
}

/** Install + enable a plugin carrying the frame surface, with `grant` as the confirmed capability subset. */
async function seedFramePlugin(grant: readonly ("ui.frame" | "ui.surface")[]): Promise<{
  readonly h: ReturnType<typeof makePluginHarness>;
  readonly caller: Awaited<ReturnType<typeof ownerPrincipalFor>>;
  readonly pluginId: Awaited<ReturnType<ReturnType<typeof makePluginHarness>["service"]["install"]>>["id"];
}> {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  h.port.script({ ok: true, instance: residentWithFrame() });
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "chess", capabilities: [...grant] }), grant: [...grant] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  return { h, caller, pluginId: installed.id };
}

test("the owner of a GRANTED plugin gets the frame's document bytes", async () => {
  const { h, caller, pluginId } = await seedFramePlugin(["ui.frame"]);
  expect(await h.service.getFrameBody({ caller, pluginId, surfaceId: "board" })).toEqual(BOARD);
});

// THE WITHDRAWAL BELT, and this test is deliberately built to be NON-VACUOUS about what it proves.
//
// A first draft asserted "the resident outlives a re-grant" and FAILED, which is how the claim got corrected:
// `setGrant` deactivates BEFORE the write and re-activates only if the row was enabled ("THE RUNNING-INSTANCE
// INVARIANT", `verbs/set-grant.ts`), so in production a narrowed grant rebuilds the guest and the refused
// registration is never collected again. The membrane is therefore the primary control.
//
// So this test SIMULATES THE INVARIANT BREAKING — it re-scripts the port to hand back a resident that still
// carries the frame registration after the re-grant, which is exactly what the tree would look like if that
// coupling were ever relaxed ("a NARROWING re-grant needs no restart" is a plausible optimization). Under that
// condition the row's grant is the ONLY thing standing between a revoked capability and a served document, and
// that is the property being pinned.
test("with the grant REVOKED, a resident that still carries the registration serves nothing and lists nothing", async () => {
  const { h, caller, pluginId } = await seedFramePlugin(["ui.frame", "ui.surface"]);
  expect(await h.service.getFrameBody({ caller, pluginId, surfaceId: "board" })).toEqual(BOARD);

  // The owner keeps the plugin on and keeps its panels; they take back only the frame. The re-script is what
  // makes the assertion below meaningful: without it the port's default (zero registrations) would make every
  // arm pass for the wrong reason.
  h.port.script({ ok: true, instance: residentWithFrame() });
  await h.service.setGrant({ caller, pluginId, grant: ["ui.surface"], acknowledgedNetHosts: [] });

  // The doorway's read refuses…
  expect(await h.service.getFrameBody({ caller, pluginId, surfaceId: "board" })).toBeNull();
  // …and the LIST agrees, which is the half that matters for pixels: a listed-but-un-mintable surface is an
  // empty labelled box at the anchor forever. Both reads sit on the same predicate for exactly this reason.
  const surfaces = await h.service.listSurfaces({ caller });
  expect(surfaces.map((s) => s.id)).not.toContain("board");
  // The DECLARATIVE sibling is untouched — the withdrawal is scoped to what was withdrawn.
  expect(surfaces.map((s) => s.id)).toContain("panel");
});

test("a plugin that never held ui.frame serves no bytes, even though its resident carries the registration", async () => {
  const { h, caller, pluginId } = await seedFramePlugin(["ui.surface"]);
  expect(await h.service.getFrameBody({ caller, pluginId, surfaceId: "board" })).toBeNull();
  expect((await h.service.listSurfaces({ caller })).map((s) => s.id)).toEqual(["panel"]);
});

test("a FOREIGN pluginId is refused exactly like a fabricated one — no existence oracle", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
  const mallory = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("mallory") }));
  h.port.script({ ok: true, instance: residentWithFrame() });
  const installed = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "chess", capabilities: ["ui.frame"] }), grant: ["ui.frame"] });
  await h.service.setEnabled({ caller: alpha, pluginId: installed.id, enabled: true });

  // The owner's own read works, so the fixture is live…
  expect(await h.service.getFrameBody({ caller: alpha, pluginId: installed.id, surfaceId: "board" })).toEqual(BOARD);
  // …and a stranger holding alpha's REAL id gets the same refusal as one holding a made-up id.
  const stolen = await h.service.getFrameBody({ caller: mallory, pluginId: installed.id, surfaceId: "board" }).catch((e: unknown) => e);
  const bogus = await h.service
    .getFrameBody({ caller: mallory, pluginId: castId<typeof installed.id>("plugin_00000000000000000000000000"), surfaceId: "board" })
    .catch((e: unknown) => e);
  expect(stolen).toBeInstanceOf(Error);
  expect((stolen as Error).name).toBe((bogus as Error).name);
});

test("a DECLARATIVE surface named by a frame read, an unknown surfaceId, and a DISABLED plugin are ONE answer", async () => {
  const { h, caller, pluginId } = await seedFramePlugin(["ui.frame", "ui.surface"]);
  // A frame mint naming the plugin's static settings panel must not serve it as a document.
  expect(await h.service.getFrameBody({ caller, pluginId, surfaceId: "panel" })).toBeNull();
  expect(await h.service.getFrameBody({ caller, pluginId, surfaceId: "no_such_surface" })).toBeNull();
  // A disabled plugin has no resident instance at all.
  await h.service.setEnabled({ caller, pluginId, enabled: false });
  expect(await h.service.getFrameBody({ caller, pluginId, surfaceId: "board" })).toBeNull();
});

test("listSurfaces NEVER projects the document bytes — the client names a surface, the server holds the frame", async () => {
  const { h, caller } = await seedFramePlugin(["ui.frame", "ui.surface"]);
  const surfaces = await h.service.listSurfaces({ caller });
  const board = surfaces.find((s) => s.id === "board");
  expect(board).toBeDefined();
  expect(board?.tier).toBe("frame");
  // The projected view is the registration META; the body hangs off the REGISTRATION. If these ever merged,
  // every frame document would ride to the client inside a routine surface list.
  expect(JSON.stringify(surfaces)).not.toContain("drawChess");
  expect(Object.keys(board ?? {})).not.toContain("frame");
});
