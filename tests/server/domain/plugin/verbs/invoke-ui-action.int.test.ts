// verb: invokeUiAction — the Tier-S guest-action round-trip. The AUTHORITY
// GATE is the whole story (it takes a foreign pluginId): owner-scope → residence → surface+handler. The
// success arm re-enters the surface's `onAction` through the resident's crash-policy'd invoke with one
// `{actionId, values, chat}` object; the fakePort rejects invoke (that path is the composed-real runtime), so
// the re-entry ARGS are proven with a recording port and the GATES with the default fake.

import type { InvocationChat } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, Handle, PluginId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { CreateInstanceOutcome, PluginHandlerRef, PluginHostPort, PluginInstance } from "@orb/server/domain/plugin";
import { PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

function instanceWith(surfaces: PluginInstance["surfaces"]): PluginInstance {
  return { tools: [], transforms: [], events: [], pubsub: [], surfaces, commands: [], displayTransforms: [], macros: [] };
}

const ROOM = castId<ChatId>("chat_0000000000000000000001");
const NOT_ENABLED_RE = /not enabled/u;
const NO_ACTIONABLE_SURFACE_RE = /no actionable UI surface/u;

const PANEL_WITH_ACTION: PluginInstance["surfaces"] = [
  { id: "panel", anchor: "settings", title: "Panel", tier: "static", onAction: castId<PluginHandlerRef>("plugin-handler-0") },
];

/** A recording port: scripts a resident carrying an actionable surface + captures every invoke's ARGS and chat
 *  scope. The args arm is `PluginInvokeArgs` now (row 777) — a string OR a builder over the invocation's opaque
 *  chat handle — so the recorder APPLIES the builder exactly as the runtime does, with a stand-in token. That
 *  substitution is the point of the seam and is what these tests are able to observe. */
function makeRecordingPort(recorded: { argsJson: string; chat: InvocationChat | null }[], chatToken: string): PluginHostPort {
  return {
    createInstance: (): Promise<CreateInstanceOutcome> => Promise.resolve({ ok: true, instance: instanceWith(PANEL_WITH_ACTION) }),
    invoke: (_instance, _handler, args, chat): Promise<string> => {
      recorded.push({ argsJson: typeof args === "string" ? args : args(chat === null || chat === undefined ? null : chatToken), chat: chat ?? null });
      return Promise.resolve("");
    },
    runSnippet: () => Promise.reject(new Error("runSnippet is not exercised here")),
    readLog: () => [],
    dispose: () => undefined,
  };
}

test("re-enters the surface's onAction with one {actionId, values, chat:null} object", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chat: InvocationChat | null }[] = [];
  const h = makePluginHarness(db, { port: makeRecordingPort(invokes, "TOKEN") });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "panel", actionId: "save", values: { name: "Nate" } });

  expect(invokes).toHaveLength(1);
  const first = invokes[0];
  if (first === undefined) {
    throw new Error("expected exactly one invoke");
  }
  expect(JSON.parse(first.argsJson)).toEqual({ actionId: "save", values: { name: "Nate" }, chat: null });
  // No chatId on the call ⇒ NO invocation scope at all, so `host.chat.current()` throws inside the guest. That
  // is the U1 settings-panel shape and it must stay exactly this after row 777.
  expect(first.chat).toBeNull();
});

test("row 777: a chatId scopes the invocation and the guest receives that room's HANDLE, not null", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chat: InvocationChat | null }[] = [];
  // canWrite TRUE — the caller HOSTS this room, so the write ceiling the guest runs under is the host ceiling.
  const h = makePluginHarness(db, {
    port: makeRecordingPort(invokes, "TOKEN"),
    resolveChatAuthority: () => Promise.resolve({ canRead: true, canWrite: true }),
  });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "panel", actionId: "save", values: {}, chatId: ROOM });

  const first = invokes[0];
  if (first === undefined) {
    throw new Error("expected exactly one invoke");
  }
  // The ARGS carry the handle — this is the whole reason `PluginInvokeArgs` grew its builder arm. A `chat: null`
  // here would hand a room-anchored action a lie it cannot detect.
  expect(JSON.parse(first.argsJson)).toEqual({ actionId: "save", values: {}, chat: "TOKEN" });
  // …and the invocation SCOPE is the claimed room, at the caller's own authority, rooted at depth 0 (a UI
  // action is a human act, so a turn it triggers stamps 1 — not an unbounded cascade).
  expect(first.chat).toEqual({ chatId: ROOM, canWrite: true, automationDepth: 0 });
});

test("row 777: a MEMBER (not host) gets canWrite:false — the write ceiling is resolved, never assumed", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chat: InvocationChat | null }[] = [];
  const h = makePluginHarness(db, {
    port: makeRecordingPort(invokes, "TOKEN"),
    resolveChatAuthority: () => Promise.resolve({ canRead: true, canWrite: false }),
  });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "panel", actionId: "save", values: {}, chatId: ROOM });

  expect(invokes[0]?.chat).toEqual({ chatId: ROOM, canWrite: false, automationDepth: 0 });
});

test("row 777: a chatId the caller cannot READ is refused BEFORE any guest re-entry", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chat: InvocationChat | null }[] = [];
  const h = makePluginHarness(db, {
    port: makeRecordingPort(invokes, "TOKEN"),
    resolveChatAuthority: () => Promise.resolve({ canRead: false, canWrite: false }),
  });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await expect(
    h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "panel", actionId: "save", values: {}, chatId: ROOM }),
  ).rejects.toBeInstanceOf(DomainNotFoundError);
  // NOTHING ran. The gate is before the re-entry, not after it — a guest that had already been handed the room
  // and then had its result discarded would still have read the room.
  expect(invokes).toHaveLength(0);
});

test("a missing/foreign plugin is a leak-free NotFound BEFORE any guest re-entry", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
  const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
  const alphaPlugin = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "mood" }), grant: [] });
  // Beta holding alpha's REAL pluginId is refused NOT_FOUND — never re-enters alpha's guest under beta.
  await expect(h.service.invokeUiAction({ caller: beta, pluginId: alphaPlugin.id, surfaceId: "panel", actionId: "save", values: {} })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );
  await expect(
    h.service.invokeUiAction({ caller: alpha, pluginId: castId<PluginId>("plugin_missing"), surfaceId: "panel", actionId: "save", values: {} }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
});

test("a DISABLED plugin (no resident) is refused — no surface to act on", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  // Installed but never enabled ⇒ no resident.
  await expect(h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "panel", actionId: "save", values: {} })).rejects.toThrow(NOT_ENABLED_RE);
});

test("an unknown surface id (or a surface with no onAction) is refused", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  // A resident carrying a DISPLAY-ONLY surface (no onAction) and none named "ghost".
  h.port.script({ ok: true, instance: instanceWith([{ id: "readout", anchor: "settings", title: "Readout", tier: "static" }]) });
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await expect(h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "ghost", actionId: "x", values: {} })).rejects.toThrow(
    NO_ACTIONABLE_SURFACE_RE,
  );
  await expect(h.service.invokeUiAction({ caller, pluginId: installed.id, surfaceId: "readout", actionId: "x", values: {} })).rejects.toThrow(
    NO_ACTIONABLE_SURFACE_RE,
  );
});
