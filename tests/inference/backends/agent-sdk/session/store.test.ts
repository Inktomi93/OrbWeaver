import type { ChatId, UserConnectionId } from "@orb/kit/ids";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { SeedTurn } from "../../../../../packages/inference/src/backends/agent-sdk/session/frames.ts";
import { GREETING_USER_STUB, sessionMatchesSeed } from "../../../../../packages/inference/src/backends/agent-sdk/session/frames.ts";
import type { SeededSessionDecision } from "../../../../../packages/inference/src/backends/agent-sdk/session/store.ts";
import { SessionCache } from "../../../../../packages/inference/src/backends/agent-sdk/session/store.ts";
import type { SessionEntryWriter } from "../../../../../packages/inference/src/contract/agent.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const log = {
  debug: (): void => undefined,
  info: (): void => undefined,
  warn: (): void => undefined,
  error: (): void => undefined,
};

test("a chat session recorded for one connection is not resumed through another connection", () => {
  const cache = new SessionCache(log);
  const chatId = mintTypeId(ID_PREFIX.chat);
  const firstConnectionId = mintTypeId(ID_PREFIX.userConnection);
  const secondConnectionId = mintTypeId(ID_PREFIX.userConnection);

  // Reflect.apply keeps this regression executable against the old two-argument cache API: before the
  // repair, the extra connection identity is ignored and the chat-wide handle leaks across connections.
  Reflect.apply(cache.record, cache, [chatId, firstConnectionId, "8f51fc80-b118-4c5f-a06a-37bcb7dd88e3"]);

  expect(Reflect.apply(cache.resolveResumeId, cache, [chatId, secondConnectionId])).toBeUndefined();
});

// ── what a resumed turn shows the model ─────────────────────────────────────────────────────────────────
// A turn resumes the session `ensureSeededSession` picks, and the runtime then appends the turn's prompt and
// reply to it. A regenerate re-runs the SAME seed, so the deterministic lineage for that seed already holds
// the rejected prompt and reply. Resuming it as-is showed the model its own rejected answer ("third time
// now", chat_01m3677f2pf689ctmc107k689n). Every turn must resume a transcript that is exactly its seed.

const text = (role: SeedTurn["role"], value: string): SeedTurn => ({ role, content: [{ type: "text", text: value }] });

interface ChatIds {
  readonly chat: ChatId;
  readonly connection: UserConnectionId;
}

/** One turn as the runtime runs it: pick the session, read what the model will see, then append the turn. */
async function runTurn(
  cache: SessionCache,
  ids: ChatIds,
  seed: readonly SeedTurn[],
  turn: { readonly prompt: string; readonly reply: string },
): Promise<{ readonly decision: SeededSessionDecision; readonly seen: Parameters<typeof sessionMatchesSeed>[0] }> {
  const decision = await cache.ensureSeededSession(ids.chat, ids.connection, seed);
  if (decision.sessionId === null) {
    throw new Error(`no session to resume (${decision.disposition})`);
  }
  const key = { projectKey: "sdk-cwd", sessionId: decision.sessionId };
  const seen = (await cache.store.load(key)) ?? [];
  await cache.store.append(key, [
    { type: "user", uuid: `${decision.sessionId}:${turn.prompt}`, message: { role: "user", content: turn.prompt } },
    { type: "assistant", uuid: `${decision.sessionId}:${turn.reply}`, message: { role: "assistant", content: [{ type: "text", text: turn.reply }] } },
  ]);
  return { decision, seen };
}

function chatIds(): ChatIds {
  return { chat: mintTypeId(ID_PREFIX.chat), connection: mintTypeId(ID_PREFIX.userConnection) };
}

test("a regenerate resumes the history before the rejected reply, never the reply itself", async () => {
  const cache = new SessionCache(log);
  const ids = chatIds();
  const greeting = [text("assistant", "Mara looks up.")];
  await runTurn(cache, ids, greeting, { prompt: "u1", reply: "a1" });
  const afterOne = [...greeting, text("user", "u1"), text("assistant", "a1")];
  await runTurn(cache, ids, afterOne, { prompt: "u2", reply: "a2" });
  const afterTwo = [...afterOne, text("user", "u2"), text("assistant", "a2")];
  await runTurn(cache, ids, afterTwo, { prompt: "u3", reply: "a3" });

  // Regenerate a3, three times: the same seed and prompt each time, a new reply each time.
  for (const reply of ["a3-swipe1", "a3-swipe2", "a3-swipe3"]) {
    const { seen, decision } = await runTurn(cache, ids, afterTwo, { prompt: "u3", reply });
    const seed = [text("user", GREETING_USER_STUB), ...afterTwo];
    expect(sessionMatchesSeed(seen, seed), `${reply} resumed "${decision.disposition}" holding a rejected turn`).toBe(true);
  }
});

test("a send after a regenerate still resumes the regenerated lineage", async () => {
  const cache = new SessionCache(log);
  const ids = chatIds();
  const greeting = [text("assistant", "Mara looks up.")];
  await runTurn(cache, ids, greeting, { prompt: "u1", reply: "a1" });
  const afterOne = [...greeting, text("user", "u1"), text("assistant", "a1")];
  await runTurn(cache, ids, afterOne, { prompt: "u2", reply: "a2" });
  await runTurn(cache, ids, afterOne, { prompt: "u2", reply: "a2-swipe" });

  const { decision } = await runTurn(cache, ids, [...afterOne, text("user", "u2"), text("assistant", "a2-swipe")], { prompt: "u3", reply: "a3" });
  expect(decision.disposition).toBe("resumed");
});

// ── two funders in one room ─────────────────────────────────────────────────────────────────────────────
// A shared room can bill alternate turns to two subscription connections. Each connection runs its own
// lineage, and the `session_entries` primary seat for `(chat, connection)` follows the lineage it runs on.

interface WriterCall {
  readonly op: "insert" | "update";
  readonly connectionId: UserConnectionId;
  readonly sdkSessionId: string;
}

function recordingWriter(calls: WriterCall[]): SessionEntryWriter {
  return {
    insert: (entry): Promise<void> => {
      calls.push({ op: "insert", connectionId: entry.connectionId, sdkSessionId: entry.sdkSessionId });
      return Promise.resolve();
    },
    update: (entry): Promise<void> => {
      calls.push({ op: "update", connectionId: entry.connectionId, sdkSessionId: entry.sdkSessionId });
      return Promise.resolve();
    },
  };
}

test("two connections alternating in one chat each resume their own warm session", async () => {
  const calls: WriterCall[] = [];
  const cache = new SessionCache(log, undefined, recordingWriter(calls));
  const chat = mintTypeId(ID_PREFIX.chat);
  const funderA = { chat, connection: mintTypeId(ID_PREFIX.userConnection) };
  const funderB = { chat, connection: mintTypeId(ID_PREFIX.userConnection) };
  const greeting = [text("assistant", "Mara looks up.")];

  const a1 = await runTurn(cache, funderA, greeting, { prompt: "u1", reply: "a1" });
  const b1 = await runTurn(cache, funderB, greeting, { prompt: "u1", reply: "a1" });
  const afterOne = [...greeting, text("user", "u1"), text("assistant", "a1")];
  const a2 = await runTurn(cache, funderA, afterOne, { prompt: "u2", reply: "a2" });
  const b2 = await runTurn(cache, funderB, afterOne, { prompt: "u2", reply: "a2" });

  expect(a1.decision.sessionId).not.toBe(b1.decision.sessionId);
  expect([a2.decision, b2.decision]).toEqual([
    { sessionId: a1.decision.sessionId, disposition: "resumed" },
    { sessionId: b1.decision.sessionId, disposition: "resumed" },
  ]);
  expect(calls).toEqual([
    { op: "insert", connectionId: funderA.connection, sdkSessionId: a1.decision.sessionId },
    { op: "insert", connectionId: funderB.connection, sdkSessionId: b1.decision.sessionId },
  ]);
});

test("a swipe back onto an earlier lineage persists it, so the primary seat follows the live lineage", async () => {
  const calls: WriterCall[] = [];
  const cache = new SessionCache(log, undefined, recordingWriter(calls));
  const ids = chatIds();
  const greeting = [text("assistant", "Mara looks up.")];
  const branchA = [...greeting, text("user", "u1"), text("assistant", "a1")];
  const branchB = [...greeting, text("user", "u1"), text("assistant", "a1-swipe")];

  const first = await cache.ensureSeededSession(ids.chat, ids.connection, branchA);
  const forked = await cache.ensureSeededSession(ids.chat, ids.connection, branchB);
  const back = await cache.ensureSeededSession(ids.chat, ids.connection, branchA);

  expect([first.disposition, forked.disposition, back]).toEqual(["seeded", "forked", { sessionId: first.sessionId, disposition: "readopted" }]);
  expect(calls.at(-1)).toEqual({ op: "update", connectionId: ids.connection, sdkSessionId: first.sessionId });
});
