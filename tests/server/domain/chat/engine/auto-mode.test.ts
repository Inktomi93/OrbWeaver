// engine/auto-mode — the AI→AI chaining loop (chat.md Part III §6). Pure unit tests over fake arbitrate/run
// callbacks + an INJECTED no-op delay (D46 determinism): EACH stop condition (max-turns, interrupt,
// no-eligible, locked), the re-arbitration seeding (the prior speaker feeds ban-last), the injected delay
// pacing, and the non-lock error propagation.

import type { MessageView, SpeakerRef } from "@orb/contracts/chat";
import type { CharacterId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { SpeakerCandidate } from "../../../../../packages/server/src/domain/chat/contract/arbitration.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import type { TurnOutcome } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { runAutoMode } from "../../../../../packages/server/src/domain/chat/engine/auto-mode.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });
const sp = (k: string): SpeakerCandidate => ({ ref: charRef(k), name: k });

let mintCounter = 0;
function committed(): TurnOutcome {
  mintCounter += 1;
  // @orb-waive no-test-fabrication(unknown): minimal MessageView double — runAutoMode's max-turns loop only reads `messages[].id` off outcomes. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  const view = { id: castId<MessageId>(`message_${mintCounter}`) } as unknown as MessageView;
  return { messages: [view], aborted: false, abortReason: undefined };
}

function viewDouble(): MessageView {
  mintCounter += 1;
  // @orb-waive no-test-fabrication(unknown): the loop only ever reads these views back out of `result.messages`. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return { id: castId<MessageId>(`message_${mintCounter}`) } as unknown as MessageView;
}

/** The engine's own abort shape (`engine/result.ts::abortedOutcome`) — a lifecycle OUTCOME, never a throw. */
function abortedNoRows(reason: "user" | "stale"): TurnOutcome {
  return { messages: [], aborted: true, abortReason: reason };
}

const noDelay = (): Promise<void> => Promise.resolve();

describe("runAutoMode — max-turns (the dual-bound cap)", () => {
  test("chains until the turn-count cap, then stops with max-turns", async () => {
    const runTurn = vi.fn((): Promise<TurnOutcome> => Promise.resolve(committed()));
    const result = await runAutoMode({
      maxTurns: 3,
      delayMs: 0,
      delay: noDelay,
      nextSpeaker: (): Promise<SpeakerCandidate | null> => Promise.resolve(sp("a")),
      runTurn,
    });
    expect(result.stopReason).toBe("max-turns");
    expect(result.turns).toBe(3);
    expect(result.messages).toHaveLength(3);
    expect(runTurn).toHaveBeenCalledTimes(3);
  });
});

describe("runAutoMode — no-eligible", () => {
  test("an empty arbitration on the first turn stops immediately (0 turns)", async () => {
    const runTurn = vi.fn((): Promise<TurnOutcome> => Promise.resolve(committed()));
    const result = await runAutoMode({
      maxTurns: 5,
      delayMs: 0,
      delay: noDelay,
      nextSpeaker: (): Promise<SpeakerCandidate | null> => Promise.resolve(null),
      runTurn,
    });
    expect(result.stopReason).toBe("no-eligible");
    expect(result.turns).toBe(0);
    expect(runTurn).not.toHaveBeenCalled();
  });

  test("an empty arbitration mid-chain stops after the prior turns", async () => {
    let calls = 0;
    const result = await runAutoMode({
      maxTurns: 5,
      delayMs: 0,
      delay: noDelay,
      nextSpeaker: (): Promise<SpeakerCandidate | null> => {
        calls += 1;
        return Promise.resolve(calls <= 2 ? sp("a") : null);
      },
      runTurn: (): Promise<TurnOutcome> => Promise.resolve(committed()),
    });
    expect(result.stopReason).toBe("no-eligible");
    expect(result.turns).toBe(2);
  });
});

describe("runAutoMode — interrupt (user abort)", () => {
  test("an already-aborted signal stops before the first turn", async () => {
    const controller = new AbortController();
    controller.abort();
    const runTurn = vi.fn((): Promise<TurnOutcome> => Promise.resolve(committed()));
    const result = await runAutoMode({
      maxTurns: 5,
      delayMs: 0,
      delay: noDelay,
      signal: controller.signal,
      nextSpeaker: (): Promise<SpeakerCandidate | null> => Promise.resolve(sp("a")),
      runTurn,
    });
    expect(result.stopReason).toBe("interrupt");
    expect(result.turns).toBe(0);
    expect(runTurn).not.toHaveBeenCalled();
  });

  test("an abort during a turn stops the chain after that turn commits", async () => {
    const controller = new AbortController();
    const result = await runAutoMode({
      maxTurns: 5,
      delayMs: 0,
      delay: noDelay,
      signal: controller.signal,
      nextSpeaker: (): Promise<SpeakerCandidate | null> => Promise.resolve(sp("a")),
      runTurn: (): Promise<TurnOutcome> => {
        controller.abort(); // the user interrupts mid-turn
        return Promise.resolve(committed());
      },
    });
    expect(result.stopReason).toBe("interrupt");
    expect(result.turns).toBe(1);
  });

  // `nextSpeaker` is CANCELLABLE now (the `smart` side-LLM arbitration reads this same signal), and a
  // cancelled arbitration yields no speaker. That must read as the interrupt it is, not the
  // "everyone is muted/left" story `no-eligible` tells.
  test("a null speaker from a CANCELLED arbitration reports interrupt, not no-eligible", async () => {
    const controller = new AbortController();
    const runTurn = vi.fn((): Promise<TurnOutcome> => Promise.resolve(committed()));
    const result = await runAutoMode({
      maxTurns: 5,
      delayMs: 0,
      delay: noDelay,
      signal: controller.signal,
      nextSpeaker: (): Promise<SpeakerCandidate | null> => {
        controller.abort(); // the arbitration was cut mid-flight → no speaker
        return Promise.resolve(null);
      },
      runTurn,
    });
    expect(result.stopReason).toBe("interrupt");
    expect(result.turns).toBe(0);
    expect(runTurn).not.toHaveBeenCalled();
  });
});

describe("runAutoMode — locked (a concurrent turn holds the lock)", () => {
  test("a locked refusal stops the chain (the human send interleaved)", async () => {
    const result = await runAutoMode({
      maxTurns: 5,
      delayMs: 0,
      delay: noDelay,
      nextSpeaker: (): Promise<SpeakerCandidate | null> => Promise.resolve(sp("a")),
      runTurn: (): Promise<TurnOutcome> => Promise.reject(new ChatOperationError(CHAT_OP_CODES.locked, "in flight")),
    });
    expect(result.stopReason).toBe("locked");
    expect(result.turns).toBe(0);
  });
});

describe("runAutoMode — re-arbitration + delay + error propagation", () => {
  test("each turn re-arbitrates off the PRIOR speaker (ban-last seeding)", async () => {
    const seen: (SpeakerRef | null)[] = [];
    let calls = 0;
    await runAutoMode({
      maxTurns: 3,
      delayMs: 0,
      delay: noDelay,
      initialLastSpeaker: charRef("seed"),
      nextSpeaker: (last: SpeakerRef | null): Promise<SpeakerCandidate | null> => {
        seen.push(last);
        calls += 1;
        return Promise.resolve(sp(`spk${calls}`));
      },
      runTurn: (): Promise<TurnOutcome> => Promise.resolve(committed()),
    });
    expect(seen).toEqual([charRef("seed"), charRef("spk1"), charRef("spk2")]);
  });

  test("the injected delay runs BETWEEN turns, not after the last", async () => {
    const delay = vi.fn((): Promise<void> => Promise.resolve());
    await runAutoMode({
      maxTurns: 3,
      delayMs: 1500,
      delay,
      nextSpeaker: (): Promise<SpeakerCandidate | null> => Promise.resolve(sp("a")),
      runTurn: (): Promise<TurnOutcome> => Promise.resolve(committed()),
    });
    expect(delay).toHaveBeenCalledTimes(2);
    expect(delay).toHaveBeenCalledWith(1500);
  });

  test("a non-lock turn error propagates (the engine already emitted turnAborted)", async () => {
    await expect(
      runAutoMode({
        maxTurns: 5,
        delayMs: 0,
        delay: noDelay,
        nextSpeaker: (): Promise<SpeakerCandidate | null> => Promise.resolve(sp("a")),
        runTurn: (): Promise<TurnOutcome> => Promise.reject(new Error("model exploded")),
      }),
    ).rejects.toThrow("model exploded");
  });
});

describe("runAutoMode — an aborted turn stops the chain (#1453)", () => {
  test("a resolved-abort outcome stops with interrupt instead of generating the next speaker", async () => {
    const nextSpeaker = vi.fn((): Promise<SpeakerCandidate | null> => Promise.resolve(sp("a")));
    const runTurn = vi.fn((): Promise<TurnOutcome> => Promise.resolve(abortedNoRows("user")));
    const result = await runAutoMode({
      maxTurns: 5,
      delayMs: 0,
      delay: noDelay,
      nextSpeaker,
      runTurn,
    });
    // The engine represents an abort through the RESULT channel, not a throw, and the chain's own signal
    // never fired — so nothing but `outcome.aborted` can stop the loop here.
    expect(result.stopReason).toBe("interrupt");
    expect(result.turns).toBe(0);
    expect(result.messages).toEqual([]);
    expect(runTurn).toHaveBeenCalledTimes(1);
    expect(nextSpeaker).toHaveBeenCalledTimes(1);
  });

  test("a stale-lock abort that DID commit rows keeps them and still stops", async () => {
    const view = viewDouble();
    const runTurn = vi.fn((): Promise<TurnOutcome> => Promise.resolve({ messages: [view], aborted: true, abortReason: "stale" }));
    const result = await runAutoMode({
      maxTurns: 4,
      delayMs: 0,
      delay: noDelay,
      nextSpeaker: (): Promise<SpeakerCandidate | null> => Promise.resolve(sp("a")),
      runTurn,
    });
    expect(result.stopReason).toBe("interrupt");
    expect(result.messages).toEqual([view]);
    expect(runTurn).toHaveBeenCalledTimes(1);
  });

  test("an un-aborted outcome still chains (the fix does not stop a healthy round)", async () => {
    const runTurn = vi.fn((): Promise<TurnOutcome> => Promise.resolve(committed()));
    const result = await runAutoMode({
      maxTurns: 2,
      delayMs: 0,
      delay: noDelay,
      nextSpeaker: (): Promise<SpeakerCandidate | null> => Promise.resolve(sp("a")),
      runTurn,
    });
    expect(result.stopReason).toBe("max-turns");
    expect(result.turns).toBe(2);
  });
});
