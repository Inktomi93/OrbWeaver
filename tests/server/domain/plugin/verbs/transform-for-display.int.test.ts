// verbs: listDisplayTransforms + transformForDisplay — the per-row DISPLAY-transform round-trip
// (U6, seam 14; the ST message-formatting-hook parity row).
//
// What these pins own, and why each is the load-bearing one:
//   • THE ANNOTATION — the caller's own transforms fold in order over the submitted text and the caller gets
//     the result. (This is the owner test: "a display transform annotates rendered text".)
//   • THE D53 REFUSAL POSTURE — a transform that throws or overruns is SKIPPED: the row keeps the text it had
//     and its SIBLINGS still run. A display transform can never blank a message and never blocks one.
//   • OWNER SCOPE — a stranger's transforms never run and never appear, by the `listOwned` read alone.

import type { ChatId, Handle, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { PluginHandlerRef, PluginHostPort, PluginInstance } from "@orb/server/domain/plugin";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { makeBundle, makePluginHarness, ownerPrincipalFor, seedUser } from "../_support.ts";

const CHAT = castId<ChatId>("chat_display0000000000000000");
const MESSAGE = castId<MessageId>("msg_display00000000000000000");

/** A resident carrying `names` display transforms, each keyed to its own handler ref. */
function instanceWith(names: readonly string[]): PluginInstance {
  return {
    tools: [],
    transforms: [],
    events: [],
    pubsub: [],
    surfaces: [],
    commands: [],
    macros: [],
    displayTransforms: names.map((name) => ({ name, handler: castId<PluginHandlerRef>(`handler-${name}`) })),
  };
}

/** A port whose `invoke` is SCRIPTED per handler ref — the fake harness port rejects every invoke, and this
 *  seam is precisely the one under test. Everything else is the minimum a domain activation needs. */
function scriptedPort(answers: Record<string, (text: string) => Promise<string>>): {
  readonly port: PluginHostPort;
  readonly script: (i: PluginInstance) => void;
} {
  let next: PluginInstance = instanceWith([]);
  return {
    script: (i): void => {
      next = i;
    },
    port: {
      createInstance: (): Promise<{ ok: true; instance: PluginInstance }> => Promise.resolve({ ok: true, instance: next }),
      invoke: (_instance, handler, argsJson): Promise<string> => {
        // `argsJson` is `PluginInvokeArgs` (U4: a string OR a lazy `(chatHandle) => string` for chat-scoped
        // calls). A display transform is chat-null, so it is always the string form — resolve it the way
        // `infra/plugin-host/port.ts` does before parsing.
        const json = typeof argsJson === "string" ? argsJson : argsJson(null);
        const parsed = JSON.parse(json) as { text: string; env: { chatId: ChatId; messageId: MessageId } };
        const answer = answers[handler];
        if (answer === undefined) {
          return Promise.reject(new Error(`no scripted answer for ${handler}`));
        }
        return answer(parsed.text);
      },
      runSnippet: (): Promise<{ logLines: readonly string[] }> => Promise.resolve({ logLines: [] }),
      readLog: (): [] => [],
      dispose: (): void => undefined,
    },
  };
}

test("with NO registered transforms the round-trip is an IDENTITY — the row's own text comes straight back", async () => {
  const db = await freshDb();
  const h = makePluginHarness(db);
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  expect(await h.service.transformForDisplay({ caller, chatId: CHAT, messageId: MESSAGE, text: "hello" })).toEqual({ text: "hello" });
});

test("a registered display transform ANNOTATES the rendered text", async () => {
  const db = await freshDb();
  const scripted = scriptedPort({ "handler-furigana": (text) => Promise.resolve(`${text} ✦`) });
  const h = makePluginHarness(db, { port: scripted.port });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  scripted.script(instanceWith(["furigana"]));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood", capabilities: ["chat.transform"] }), grant: ["chat.transform"] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  expect(await h.service.transformForDisplay({ caller, chatId: CHAT, messageId: MESSAGE, text: "a line" })).toEqual({ text: "a line ✦" });
});

test("transforms FOLD in registration order — each sees the prior's output", async () => {
  const db = await freshDb();
  const scripted = scriptedPort({
    "handler-one": (text) => Promise.resolve(`${text}[1]`),
    "handler-two": (text) => Promise.resolve(`${text}[2]`),
  });
  const h = makePluginHarness(db, { port: scripted.port });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  scripted.script(instanceWith(["one", "two"]));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  expect(await h.service.transformForDisplay({ caller, chatId: CHAT, messageId: MESSAGE, text: "base" })).toEqual({ text: "base[1][2]" });
});

test("the guest receives the row's identity as its `env` (a transform routinely keys off which row it annotates)", async () => {
  const db = await freshDb();
  let seen: { chatId: ChatId; messageId: MessageId } | undefined;
  const scripted = scriptedPort({ "handler-peek": (text) => Promise.resolve(text) });
  const port: PluginHostPort = {
    ...scripted.port,
    invoke: (instance, handler, argsJson, chat): Promise<string> => {
      // `argsJson` is `PluginInvokeArgs` (string | lazy fn); a display transform is chat-null, so it is the
      // string form — resolve it the way `port.ts` does before peeking.
      const json = typeof argsJson === "string" ? argsJson : argsJson(null);
      const parsed = JSON.parse(json) as { text: string; env: { chatId: ChatId; messageId: MessageId } };
      seen = parsed.env;
      // A display transform reads the text it was handed and nothing else — admitting a room would open a
      // `chat.read` window this seam has no reason to open.
      expect(chat).toBeNull();
      return scripted.port.invoke(instance, handler, argsJson, chat);
    },
  };
  const h = makePluginHarness(db, { port });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  scripted.script(instanceWith(["peek"]));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  await h.service.transformForDisplay({ caller, chatId: CHAT, messageId: MESSAGE, text: "x" });
  expect(seen).toEqual({ chatId: CHAT, messageId: MESSAGE });
});

test("a THROWING transform is SKIPPED (D53) — the row keeps its text and the SIBLING still runs", async () => {
  const db = await freshDb();
  const scripted = scriptedPort({
    "handler-boom": () => Promise.reject(new Error("guest blew up")),
    "handler-ok": (text) => Promise.resolve(`${text}[ok]`),
  });
  const h = makePluginHarness(db, { port: scripted.port });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  scripted.script(instanceWith(["boom", "ok"]));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  // The thrower contributed nothing; the row never blanks and the call never rejects.
  expect(await h.service.transformForDisplay({ caller, chatId: CHAT, messageId: MESSAGE, text: "keep" })).toEqual({ text: "keep[ok]" });
});

test("a HANGING transform is bounded by the per-message deadline — the row still renders its own text", async () => {
  const db = await freshDb();
  const scripted = scriptedPort({ "handler-hang": () => new Promise<string>(() => undefined) });
  const h = makePluginHarness(db, { port: scripted.port });
  const caller = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("owner") }));
  scripted.script(instanceWith(["hang"]));
  const installed = await h.service.install({ caller, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller, pluginId: installed.id, enabled: true });

  expect(await h.service.transformForDisplay({ caller, chatId: CHAT, messageId: MESSAGE, text: "kept" })).toEqual({ text: "kept" });
});

test("owner-scoped: another owner's display transforms never run and never list (the read IS the gate)", async () => {
  const db = await freshDb();
  const scripted = scriptedPort({ "handler-alpha": (text) => Promise.resolve(`${text}[ALPHA]`) });
  const h = makePluginHarness(db, { port: scripted.port });
  const alpha = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("alpha") }));
  const beta = ownerPrincipalFor(await seedUser(db, { handle: castId<Handle>("beta") }));
  scripted.script(instanceWith(["alpha"]));
  const alphaPlugin = await h.service.install({ caller: alpha, bundle: makeBundle({ id: "mood" }), grant: [] });
  await h.service.setEnabled({ caller: alpha, pluginId: alphaPlugin.id, enabled: true });

  // Alpha's own row is annotated…
  expect(await h.service.transformForDisplay({ caller: alpha, chatId: CHAT, messageId: MESSAGE, text: "t" })).toEqual({ text: "t[ALPHA]" });
  // …and beta, who owns nothing, gets no annotation for the identical input.
  expect(await h.service.transformForDisplay({ caller: beta, chatId: CHAT, messageId: MESSAGE, text: "t" })).toEqual({ text: "t" });
});
