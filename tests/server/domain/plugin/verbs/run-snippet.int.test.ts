// verb: runSnippet — the inline mode (03 §1). Invokes the verb factory directly over a harness whose
// `resolveChatAuthority` is scripted (the compose-injected leak-free gate). Pins the verb's OWN logic: the
// effective grant set is the fixed profile ∩ the caller's chat authority (chat.read + global_vars always,
// chat.variables.write only for a HOST caller), and a chat the caller cannot READ is refused NOT_FOUND (no
// existence oracle) — the port is never reached. The end-to-end sandbox run lives in port.test.ts + the
// composed-real transport int; this is the domain-tree behavioral mirror (test-presence + contract-verb-presence).

import type { InvocationChat, PluginCapability } from "@orb/contracts/plugin";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId, Handle } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { PluginHostPort } from "../../../../../packages/server/src/domain/plugin/contract/service.ts";
import { createRunSnippet } from "../../../../../packages/server/src/domain/plugin/verbs/run-snippet.ts";
import { freshDb } from "../../../../support/db.ts";
import { expect, test } from "../../../../support/fixtures";
import { makePluginHarness, principalFor, seedUser } from "../_support.ts";

const CHAT = castId<ChatId>("chat_test0000000000000000000");

/** A port that records the runSnippet input (the effective grants + admitted chat) and returns a fixed log. */
function recordingPort(): { port: PluginHostPort; calls: { grants: readonly PluginCapability[]; chat: InvocationChat }[] } {
  const calls: { grants: readonly PluginCapability[]; chat: InvocationChat }[] = [];
  const notUsed = (): Promise<never> => Promise.reject(new Error("not exercised by the runSnippet verb"));
  const port: PluginHostPort = {
    createInstance: notUsed,
    invoke: notUsed,
    runSnippet: (input) => {
      calls.push({ grants: input.grants, chat: input.chat });
      return Promise.resolve({ logLines: ["ran"] });
    },
    readLog: () => [],
    dispose: () => undefined,
  };
  return { port, calls };
}

describe("runSnippet verb", () => {
  test("a MEMBER caller (read, no host) gets chat.read + global_vars, no write grant", async () => {
    const db = await freshDb();
    const rec = recordingPort();
    const h = makePluginHarness(db, { port: rec.port, resolveChatAuthority: () => Promise.resolve({ canRead: true, canWrite: false }) });
    const owner = await seedUser(db, { handle: castId<Handle>("a") });

    const result = await createRunSnippet(h.ctx)({ caller: principalFor(owner), chatId: CHAT, code: "1 + 1" });

    expect(result.logLines).toEqual(["ran"]);
    expect(rec.calls[0]?.grants).toEqual(["chat.read", "global_vars"]);
    expect(rec.calls[0]?.chat).toEqual({ chatId: CHAT, canWrite: false, automationDepth: 0 });
  });

  test("a HOST caller (read + write) additionally gets chat.variables.write", async () => {
    const db = await freshDb();
    const rec = recordingPort();
    const h = makePluginHarness(db, { port: rec.port, resolveChatAuthority: () => Promise.resolve({ canRead: true, canWrite: true }) });
    const owner = await seedUser(db, { handle: castId<Handle>("a") });

    await createRunSnippet(h.ctx)({ caller: principalFor(owner), chatId: CHAT, code: "1 + 1" });

    expect(rec.calls[0]?.grants).toEqual(["chat.read", "global_vars", "chat.variables.write"]);
    expect(rec.calls[0]?.chat).toEqual({ chatId: CHAT, canWrite: true, automationDepth: 0 });
  });

  test("a chat the caller cannot READ is refused NOT_FOUND — the port is never reached (no existence oracle)", async () => {
    const db = await freshDb();
    const rec = recordingPort();
    const h = makePluginHarness(db, { port: rec.port, resolveChatAuthority: () => Promise.resolve({ canRead: false, canWrite: false }) });
    const owner = await seedUser(db, { handle: castId<Handle>("a") });

    await expect(createRunSnippet(h.ctx)({ caller: principalFor(owner), chatId: CHAT, code: "1 + 1" })).rejects.toBeInstanceOf(DomainNotFoundError);
    expect(rec.calls).toEqual([]);
  });
});
