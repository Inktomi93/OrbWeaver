// verb: invokeUiCommand — the COMMAND round-trip. The `invokeUiAction` ladder
// plus a FOURTH rung this verb has and that one does not: the CHAT SCOPE.
//
// THE FOURTH RUNG IS THE POINT OF THIS FILE. A command is a NEW way to reach a guest with a room attached, and
// if it admitted the chat itself it would be a door around the read-authority admission every other guest entry
// point passes through. So the room rides the same leak-free `resolveChatAuthority` the snippet gate uses, and a
// chat the caller cannot read is NOT_FOUND rather than an existence oracle.
//
// The other pins: the guest receives ONE `{args}` object (the ROOM is not in the bag — it is the invocation's
// scope, read through `chat.current()`'s single-mint opaque handle), and the drained UI OUTCOME comes back even
// when the handler THREW, because a handler that toasts "couldn't reach the API" and then throws should still
// reach the person who acted.

import { PLUGIN_COMPOSER_DRAFT_MAX_CHARS } from "@orb/contracts/plugin";
import { DomainConflictError, DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, Handle, PluginId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { CreateInstanceOutcome, PluginHandlerRef, PluginHostPort, PluginInstance } from "@orb/server/domain/plugin";
import { PluginActionFailedError, PluginNotFoundError } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const CHAT_ID = mintTypeId(ID_PREFIX.chat) as ChatId;

function instanceWithCommands(commands: PluginInstance["commands"]): PluginInstance {
  return { tools: [], transforms: [], events: [], pubsub: [], surfaces: [], commands, displayTransforms: [], macros: [] };
}

const DRAW: PluginInstance["commands"] = [{ name: "draw", describe: "Draw a card", onRun: castId<PluginHandlerRef>("plugin-handler-0") }];

test("a declared composer action receives only its explicit draft and returns the replacement on that invocation", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chatId: ChatId | null }[] = [];
  const commands = DRAW.map((command) => ({ ...command, composerDraft: true as const, placements: [{ target: "composer-action" as const, label: "Polish" }] }));
  const recording = recordingPort(invokes, commands);
  const h = makePluginHarness(db, {
    port: {
      ...recording,
      invoke: async (...args) => {
        await recording.invoke(...args);
        return "Polished draft";
      },
    },
  });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "polish", capabilities: ["ui.surface"] }), grant: ["ui.surface"] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const request = { caller, pluginId: installed.id, name: "draw", args: "", chatId: CHAT_ID, composerDraft: "Typed draft" };
  expect(await h.service.invokeUiCommand(request)).toEqual({ toasts: [], composerDraft: "Polished draft" });
  const first = invokes.at(0);
  if (first === undefined) {
    throw new Error("Expected the explicit draft invocation");
  }
  expect(JSON.parse(first.argsJson)).toEqual({ args: "", values: {}, draft: "Typed draft" });
});

test("unsent draft input is refused for undeclared commands, foreign owners and missing grants before any guest runs", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chatId: ChatId | null }[] = [];
  const h = makePluginHarness(db, { port: recordingPort(invokes) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const stranger = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("stranger") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "ordinary", capabilities: ["ui.surface"] }), grant: ["ui.surface"] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const request = { caller, pluginId: installed.id, name: "draw", args: "", chatId: CHAT_ID, composerDraft: "Unsent private draft" };
  await expect(h.service.invokeUiCommand(request)).rejects.toThrow(/declared invocation mode/u);
  await expect(h.service.invokeUiCommand({ ...request, caller: stranger })).rejects.toBeInstanceOf(PluginNotFoundError);
  expect(invokes).toEqual([]);

  const declared = DRAW.map((command) => ({ ...command, composerDraft: true as const }));
  const ungrantedDb = await freshDb();
  const ungranted = makePluginHarness(ungrantedDb, { port: recordingPort(invokes, declared) });
  const otherCaller = ownerPrincipalFor(await seedUser(ungrantedDb, { handle: castId<Handle>("other") }));
  const other = await ungranted.service.install({ caller: otherCaller, bundle: makeBundle({ id: "ungranted", capabilities: ["ui.surface"] }), grant: [] });
  await ungranted.service.setEnabled({ caller: otherCaller, pluginId: other.id, enabled: true });
  await expect(ungranted.service.invokeUiCommand({ ...request, caller: otherCaller, pluginId: other.id })).rejects.toThrow(/enabled, granted plugin/u);
  expect(invokes).toEqual([]);
});

test("composer input and output are bounded; a draft action has no non-composer invocation", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chatId: ChatId | null }[] = [];
  const commands = DRAW.map((command) => ({ ...command, composerDraft: true as const }));
  const recording = recordingPort(invokes, commands);
  const h = makePluginHarness(db, {
    port: {
      ...recording,
      invoke: async (...args) => {
        await recording.invoke(...args);
        return "x".repeat(PLUGIN_COMPOSER_DRAFT_MAX_CHARS + 1);
      },
    },
  });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "polish", capabilities: ["ui.surface"] }), grant: ["ui.surface"] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const request = { caller, pluginId: installed.id, name: "draw", args: "", chatId: CHAT_ID };
  await expect(h.service.invokeUiCommand(request)).rejects.toThrow(/declared invocation mode/u);
  await expect(h.service.invokeUiCommand({ ...request, composerDraft: "draft", chatId: null })).rejects.toThrow(/current room/u);
  await expect(h.service.invokeUiCommand({ ...request, composerDraft: "x".repeat(PLUGIN_COMPOSER_DRAFT_MAX_CHARS + 1) })).rejects.toThrow();
  expect(invokes).toEqual([]);
  await expect(h.service.invokeUiCommand({ ...request, composerDraft: "draft" })).rejects.toBeInstanceOf(PluginActionFailedError);
  expect(invokes).toHaveLength(1);
});

test("a disable during an async draft command refuses the late replacement", async () => {
  const db = await freshDb();
  const started = Promise.withResolvers<void>();
  const result = Promise.withResolvers<string>();
  const commands = DRAW.map((command) => ({ ...command, composerDraft: true as const }));
  const port = recordingPort([], commands);
  const h = makePluginHarness(db, {
    port: {
      ...port,
      invoke: () => {
        started.resolve();
        return result.promise;
      },
    },
  });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "polish", capabilities: ["ui.surface"] }), grant: ["ui.surface"] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const pending = h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "draw", args: "", chatId: CHAT_ID, composerDraft: "draft" });
  await started.promise;
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: false });
  result.resolve("Late replacement");
  await expect(pending).rejects.toThrow(/no longer available/u);
});

test("revocation during final room authority lookup refuses the draft replacement", async () => {
  const db = await freshDb();
  const checkingRoom = Promise.withResolvers<void>();
  const roomAuthority = Promise.withResolvers<{ canRead: boolean; canWrite: boolean }>();
  let authorityCalls = 0;
  const commands = DRAW.map((command) => ({ ...command, composerDraft: true as const }));
  const port = recordingPort([], commands);
  const h = makePluginHarness(db, {
    port: { ...port, invoke: () => Promise.resolve("Late replacement") },
    resolveChatAuthority: () => {
      authorityCalls += 1;
      if (authorityCalls === 2) {
        checkingRoom.resolve();
        return roomAuthority.promise;
      }
      return Promise.resolve({ canRead: true, canWrite: true });
    },
  });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "polish", capabilities: ["ui.surface"] }), grant: ["ui.surface"] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  const pending = h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "draw", args: "", chatId: CHAT_ID, composerDraft: "draft" });
  await checkingRoom.promise;
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: false });
  roomAuthority.resolve({ canRead: true, canWrite: true });
  await expect(pending).rejects.toThrow(/no longer available/u);
  expect(authorityCalls).toBe(2);
});

/** A command that DECLARES typed args (#791): a required enum + an optional number. The verb re-validates the
 *  client's `values` against exactly these specs before the guest re-entry (the membrane trust boundary). */
const CAST: PluginInstance["commands"] = [
  {
    name: "cast",
    describe: "Cast a spell",
    args: [
      { name: "suit", type: "enum", required: true, enumValues: ["cups", "wands"] },
      { name: "count", type: "number" },
    ],
    onRun: castId<PluginHandlerRef>("plugin-handler-1"),
  },
];

const INVALID_ARGS_RE = /invalid arguments for command 'cast'/u;

const NOT_ENABLED_RE = /not enabled/u;
const NO_COMMAND_RE = /no command 'ghost'/u;

/** A port that records every invoke's args + the invocation chat scope it was handed. */
function recordingPort(invokes: { argsJson: string; chatId: ChatId | null }[], commands: PluginInstance["commands"] = DRAW): PluginHostPort {
  return {
    createInstance: (): Promise<CreateInstanceOutcome> => Promise.resolve({ ok: true, instance: instanceWithCommands(commands) }),
    invoke: (_instance, _handler, argsJson, chat): Promise<string> => {
      // `argsJson` is `PluginInvokeArgs` (U4: string | lazy `(chatHandle) => string`). A command passes the
      // STRING form (the room is reached via `chat.current()`, never an arg), so resolve it the way
      // `infra/plugin-host/port.ts` does before recording.
      const json = typeof argsJson === "string" ? argsJson : argsJson(null);
      invokes.push({ argsJson: json, chatId: chat === null ? null : chat.chatId });
      return Promise.resolve("");
    },
    runSnippet: () => Promise.reject(new Error("runSnippet is not exercised here")),
    readLog: () => [],
    dispose: () => undefined,
  };
}

test("re-enters onRun with ONE {args} object, and the room rides as the invocation SCOPE (not in the bag)", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chatId: ChatId | null }[] = [];
  const h = makePluginHarness(db, { port: recordingPort(invokes) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "draw", args: "two of cups", chatId: CHAT_ID });

  expect(invokes).toHaveLength(1);
  const first = invokes[0];
  if (first === undefined) {
    throw new Error("expected exactly one invoke");
  }
  // The args bag carries the guest's own grammar VERBATIM plus the #791 typed `values` (empty for a command that
  // declared no args) — one mint, one accessor for the opaque chat handle.
  expect(JSON.parse(first.argsJson)).toEqual({ args: "two of cups", values: {} });
  expect(first.chatId).toBe(CHAT_ID);
});

test("#791: a command's DECLARED typed args reach the guest COERCED (enum string, number as a number)", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chatId: ChatId | null }[] = [];
  const h = makePluginHarness(db, { port: recordingPort(invokes, CAST) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "cast", args: "", values: { suit: "cups", count: 3 }, chatId: null });

  expect(invokes).toHaveLength(1);
  const first = invokes[0];
  if (first === undefined) {
    throw new Error("expected exactly one invoke");
  }
  // The guest receives the TYPED bag — `count` is a number, not the string a wire naively carries.
  expect(JSON.parse(first.argsJson)).toEqual({ args: "", values: { suit: "cups", count: 3 } });
});

test("#791: a MISSING required arg is refused at the membrane BEFORE any guest re-entry (red-first)", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chatId: ChatId | null }[] = [];
  const h = makePluginHarness(db, { port: recordingPort(invokes, CAST) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  // No `suit` (required). The guest must never run with a required arg absent.
  await expect(h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "cast", args: "", values: { count: 1 }, chatId: null })).rejects.toThrow(
    INVALID_ARGS_RE,
  );
  expect(invokes).toHaveLength(0);
});

test("#791: an OFF-ENUM value and a MISTYPED value are both refused before re-entry", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chatId: ChatId | null }[] = [];
  const h = makePluginHarness(db, { port: recordingPort(invokes, CAST) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  // `suit: "swords"` is not one of the declared enum values.
  await expect(h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "cast", args: "", values: { suit: "swords" }, chatId: null })).rejects.toThrow(
    INVALID_ARGS_RE,
  );
  // `count` declared `number`, but the client sent a string — the wire union permits the shape, the membrane refuses the value.
  await expect(
    h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "cast", args: "", values: { suit: "cups", count: "lots" }, chatId: null }),
  ).rejects.toThrow(INVALID_ARGS_RE);
  expect(invokes).toHaveLength(0);
});

test("a command run OUTSIDE a room carries no scope — `chat.current()` throws in the guest, honestly", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chatId: ChatId | null }[] = [];
  const h = makePluginHarness(db, { port: recordingPort(invokes) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "draw", args: "", chatId: null });
  expect(invokes[0]?.chatId).toBeNull();
});

test("THE FOURTH RUNG: a room the caller cannot READ is NOT_FOUND, and no guest re-entry happens", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chatId: ChatId | null }[] = [];
  const h = makePluginHarness(db, {
    port: recordingPort(invokes),
    // The leak-free authority seam: an unknown/foreign chat resolves `{false,false}`, indistinguishable from a
    // no-access one — the snippet gate's exact posture, reused so a command is not a second door.
    resolveChatAuthority: () => Promise.resolve({ canRead: false, canWrite: false }),
  });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await expect(h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "draw", args: "", chatId: CHAT_ID })).rejects.toBeInstanceOf(
    DomainNotFoundError,
  );
  expect(invokes).toHaveLength(0);
});

test("a missing/foreign plugin is a leak-free NotFound BEFORE any guest re-entry", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
  const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
  const alphaPlugin = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });

  await expect(h.service.invokeUiCommand({ caller: beta, pluginId: alphaPlugin.id, name: "draw", args: "", chatId: null })).rejects.toBeInstanceOf(
    PluginNotFoundError,
  );
  await expect(
    h.service.invokeUiCommand({ caller: alpha, pluginId: castId<PluginId>("plugin_missing"), name: "draw", args: "", chatId: null }),
  ).rejects.toBeInstanceOf(PluginNotFoundError);
});

test("a DISABLED plugin, and an unknown command name, are both refused", async () => {
  const db = await freshDb();
  const invokes: { argsJson: string; chatId: ChatId | null }[] = [];
  const h = makePluginHarness(db, { port: recordingPort(invokes) });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck" }), grant: [] });

  await expect(h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "draw", args: "", chatId: null })).rejects.toThrow(NOT_ENABLED_RE);

  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  await expect(h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "ghost", args: "", chatId: null })).rejects.toThrow(NO_COMMAND_RE);
});

test("the UI OUTCOME is drained onto the result — and still drains when the handler THREW", async () => {
  const db = await freshDb();
  const failing: PluginHostPort = {
    createInstance: (): Promise<CreateInstanceOutcome> => Promise.resolve({ ok: true, instance: instanceWithCommands(DRAW) }),
    invoke: () => Promise.reject(new Error("the guest threw")),
    runSnippet: () => Promise.reject(new Error("runSnippet is not exercised here")),
    readLog: () => [],
    dispose: () => undefined,
  };
  const h = makePluginHarness(db, { port: failing });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck", name: "Oracle Deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  // A toast queued BEFORE the throw (the guest raised it, then failed) — the real outbox is shared with the ctx.
  h.ctx.uiOutbox.pushToast({ id: installed.id, name: "Oracle Deck", slug: "oracle-deck" }, "warn", "couldn't reach the API");
  await expect(h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "draw", args: "", chatId: null })).rejects.toThrow(/the guest threw/u);

  // The rejection propagated (a crash must not read as a success with a sad toast) AND the outbox was drained,
  // so the queued notice never leaks into a LATER, unrelated round-trip.
  expect(h.ctx.uiOutbox.drain(installed.id)).toEqual({ toasts: [] });
});

async function runCommandThatRejects(reason: unknown): Promise<{ result: Promise<unknown>; drainedAfter: () => unknown }> {
  const db = await freshDb();
  const failing: PluginHostPort = {
    createInstance: (): Promise<CreateInstanceOutcome> => Promise.resolve({ ok: true, instance: instanceWithCommands(DRAW) }),
    invoke: () => Promise.reject(reason),
    runSnippet: () => Promise.reject(new Error("runSnippet is not exercised here")),
    readLog: () => [],
    dispose: () => undefined,
  };
  const h = makePluginHarness(db, { port: failing });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "oracle-deck", name: "Oracle Deck" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });
  h.ctx.uiOutbox.pushToast({ id: installed.id, name: "Oracle Deck", slug: "oracle-deck" }, "warn", "queued before the throw");
  const result = h.service.invokeUiCommand({ caller, pluginId: installed.id, name: "draw", args: "", chatId: null });
  return { result, drainedAfter: () => h.ctx.uiOutbox.drain(installed.id) };
}

test("a guest throw in a command is a typed plugin error, and the outbox still drains", async () => {
  const run = await runCommandThatRejects(new Error("the guest threw"));

  await expect(run.result).rejects.toBeInstanceOf(PluginActionFailedError);
  expect(run.drainedAfter()).toEqual({ toasts: [] });
});

test("a host DomainError from a command passes through unchanged", async () => {
  const refusal = new DomainConflictError("turn budget spent");
  const run = await runCommandThatRejects(refusal);

  await expect(run.result).rejects.toBe(refusal);
});
