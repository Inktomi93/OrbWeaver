// @subject packages/server/src/domain/chat/verbs/turn.ts
// Stop must reach physical native HTTP and prevent tool, retry, completion and chained-generation effects.
// Without Stop, a provider that never answers must still end the turn as a visible failure at the idle bound.
import type { MessageView } from "@orb/contracts/chat";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon } from "@orb/testkit/node/composed";
import { registerCancellationRoom } from "./turn-cancellation-physical.ts";

const withPeer = registerCancellationRoom();

async function roles(h: ChatRoot): Promise<MessageView["role"][]> {
  return (await readRoomCanon(h.root, h.owner, h.chatId)).map(({ role }) => role);
}

test("completed wire tool calls execute and complete the turn in the same fixture", async () => {
  await withPeer("complete", async (f) => {
    const outcome = await f.start();
    expect(outcome.aborted).toBe(false);
    await f.h.root.settleBackground();
    expect(f.peer.requests).toEqual([f.chatPath, f.chatPath]);
    const reply = outcome.messages.find(({ role }) => role === "assistant");
    expect(reply?.toolCalls).toEqual([expect.objectContaining({ name: f.toolName, result: "done", isError: false })]);
    expect(await f.toolWrites()).toEqual(["yes"]);
    expect(f.events.map(({ type }) => type)).toContain("turnCompleted");
    expect(await roles(f.h)).toEqual(["user", "assistant"]);
  });
});

test("Stop while resolving word bias closes the actual tokenize request before generation", async () => {
  await withPeer(
    "headers",
    async (f) => {
      const pending = f.start();
      await f.peer.arrived;
      expect(f.peer.requests).toEqual(["/tokenize"]);
      await f.h.root.services.chat.abort({ principal: f.h.owner, chatId: f.h.chatId });
      await expect.poll(f.peer.stopped).toBe(true);
      expect(await pending).toMatchObject({ aborted: true, abortReason: "user" });
      expect(f.peer.requests).toEqual(["/tokenize"]);
      expect(await roles(f.h)).toEqual(["user"]);
    },
    true,
  );
});

for (const phase of ["stream", "headers"] as const) {
  test(`Stop during ${phase} cancels actual OpenRouter HTTP work without retry or chained generation`, async () => {
    await withPeer(phase, async (f) => {
      const pending = f.start();
      await f.peer.arrived;
      await expect.poll(() => phase === "headers" || f.events.some(({ type }) => type === "delta")).toBe(true);
      await f.h.root.services.chat.abort({ principal: f.h.owner, chatId: f.h.chatId });
      await expect.poll(f.peer.stopped).toBe(true);
      await f.peer.disconnected;
      expect(f.peer.destroyed()).toBe(true);
      expect(f.peer.writeLate()).toBe(false);
      expect(await pending).toMatchObject({ aborted: true, abortReason: "user" });
      expect(f.peer.requests).toEqual([f.chatPath]);
      expect(f.retries()).toEqual([]);
      expect(f.pendingTurnTimeouts()).toEqual([]);
      expect(await roles(f.h)).toEqual(["user"]);
      expect(f.events.map(({ type }) => type)).toContain("turnAborted");
      expect(f.events.map(({ type }) => type)).not.toContain("turnCompleted");
      expect(await f.toolWrites()).toEqual([]);
      await expect(f.h.root.services.chat.abort({ principal: f.h.owner, chatId: f.h.chatId })).resolves.toBeUndefined();
    });
  });
}

test("a provider that accepts the turn and never sends a byte fails the turn visibly once its idle windows run out", async () => {
  await withPeer("headers", async (f) => {
    const run = { settled: false };
    const settle = <T>(value: T): T => {
      run.settled = true;
      return value;
    };
    const outcome = f.start().then(() => settle(null), settle);
    // Read through a call: the settle above runs between awaits, where a narrowed property read would go stale.
    const settled = (): boolean => run.settled;
    // While the peer holds an attempt, the turn's only bound is the window armed for it. Firing that window, then
    // the backoff it schedules, walks the product's own bound to its end; a stall with no armed bound fails a poll.
    const idleWindows: number[] = [];
    const armed = (): boolean => f.pendingTurnTimeouts().length > 0;
    const heldAndBounded = (): boolean => settled() || (f.peer.requests.length > idleWindows.length && armed());
    const backoffArmed = (): boolean => settled() || armed();
    while (!settled()) {
      await expect.poll(heldAndBounded).toBe(true);
      if (settled()) {
        break;
      }
      const idleMs = Math.max(...f.pendingTurnTimeouts());
      idleWindows.push(idleMs);
      f.h.root.timers.advance(idleMs);
      await expect.poll(backoffArmed).toBe(true);
      if (!settled()) {
        f.h.root.timers.advance(Math.min(...f.pendingTurnTimeouts()));
      }
    }
    expect(await outcome).toMatchObject({ kind: "server", retryable: true });
    expect(idleWindows.length).toBeGreaterThan(1);
    expect(new Set(idleWindows).size).toBe(1);
    expect(f.peer.requests).toEqual(idleWindows.map(() => f.chatPath));
    expect(f.events).toContainEqual(expect.objectContaining({ type: "turnAborted", reason: "error" }));
    expect(f.events.map(({ type }) => type)).not.toContain("turnCompleted");
    expect(await roles(f.h)).toEqual(["user"]);
  });
});

test("Stop during an actual HTTP 503 backoff prevents the queued retry and chained generation", async () => {
  await withPeer("retry", async (f) => {
    const pending = f.start();
    const delay = await f.retryScheduled;
    expect(delay).toBeGreaterThan(0);
    expect(f.retries()).toEqual([delay]);
    await f.h.root.services.chat.abort({ principal: f.h.owner, chatId: f.h.chatId });
    expect(await pending).toMatchObject({ aborted: true, abortReason: "user" });
    f.h.root.timers.advance(delay);
    await f.h.root.settleBackground();
    expect(f.peer.requests).toEqual([f.chatPath]);
    expect(f.retries()).toEqual([delay]);
    expect(await roles(f.h)).toEqual(["user"]);
    expect(f.events.map(({ type }) => type)).not.toContain("turnCompleted");
    expect(await f.toolWrites()).toEqual([]);
  });
});

test("an already-cancelled public impersonation subscription dispatches no native OpenRouter HTTP work", async () => {
  await withPeer("stream", async (f) => {
    const controller = new AbortController();
    controller.abort();
    const deltas: string[] = [];
    // The public subscription signal is cancellation, so the draft drains cleanly without dispatch or canon.
    for await (const { delta } of f.h.root.services.chat.impersonateStream({ principal: f.h.owner, chatId: f.h.chatId, signal: controller.signal })) {
      deltas.push(delta);
    }
    expect(deltas).toEqual([]);
    expect(f.peer.requests).toEqual([]);
    expect(f.retries()).toEqual([]);
    expect(await roles(f.h)).toEqual([]);
    expect(await f.toolWrites()).toEqual([]);
  });
});
