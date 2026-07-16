// engine/auto-mode — the AI→AI chaining loop (chat.md Part III §6). Pure unit tests over fake arbitrate/run
// callbacks + an INJECTED no-op delay (D46 determinism): EACH stop condition (max-turns, interrupt,
// no-eligible, locked), the re-arbitration seeding (the prior speaker feeds ban-last), the injected delay
// pacing, and the non-lock error propagation.

import type { MessageView, SpeakerRef } from "@orb/contracts/chat";
import type { CharacterId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, vi } from "vitest";
import type { CastName } from "../../../../../packages/server/src/domain/chat/contract/arbitration";
import { CHAT_OP_CODES, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors";
import type { TurnOutcome } from "../../../../../packages/server/src/domain/chat/contract/results";
import { runAutoMode } from "../../../../../packages/server/src/domain/chat/engine/auto-mode";
import { expect, test } from "../../../../support/fixtures";

const cid = (k: string): CharacterId => castId<CharacterId>(`character_${k}`);
const charRef = (k: string): SpeakerRef => ({ kind: "character", characterId: cid(k) });
const sp = (k: string): CastName => ({ ref: charRef(k), name: k });

let mintCounter = 0;
function committed(): TurnOutcome {
  mintCounter += 1;
  const view = { id: castId<MessageId>(`message_${mintCounter}`) } as unknown as MessageView;
  return { messages: [view], aborted: false, abortReason: undefined };
}

const noDelay = (): Promise<void> => Promise.resolve();

describe("runAutoMode — max-turns (the dual-bound cap)", () => {
  test("chains until the turn-count cap, then stops with max-turns", async () => {
    const runTurn = vi.fn((): Promise<TurnOutcome> => Promise.resolve(committed()));
    const result = await runAutoMode({
      maxTurns: 3,
      delayMs: 0,
      delay: noDelay,
      nextSpeaker: (): Promise<CastName | null> => Promise.resolve(sp("a")),
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
      nextSpeaker: (): Promise<CastName | null> => Promise.resolve(null),
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
      nextSpeaker: (): Promise<CastName | null> => {
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
      nextSpeaker: (): Promise<CastName | null> => Promise.resolve(sp("a")),
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
      nextSpeaker: (): Promise<CastName | null> => Promise.resolve(sp("a")),
      runTurn: (): Promise<TurnOutcome> => {
        controller.abort(); // the user interrupts mid-turn
        return Promise.resolve(committed());
      },
    });
    expect(result.stopReason).toBe("interrupt");
    expect(result.turns).toBe(1);
  });
});

describe("runAutoMode — locked (a concurrent turn holds the lock)", () => {
  test("a locked refusal stops the chain (the human send interleaved)", async () => {
    const result = await runAutoMode({
      maxTurns: 5,
      delayMs: 0,
      delay: noDelay,
      nextSpeaker: (): Promise<CastName | null> => Promise.resolve(sp("a")),
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
      nextSpeaker: (last: SpeakerRef | null): Promise<CastName | null> => {
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
      nextSpeaker: (): Promise<CastName | null> => Promise.resolve(sp("a")),
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
        nextSpeaker: (): Promise<CastName | null> => Promise.resolve(sp("a")),
        runTurn: (): Promise<TurnOutcome> => Promise.reject(new Error("model exploded")),
      }),
    ).rejects.toThrow("model exploded");
  });
});
