// substrate/cue-replay: only the `conversation` carry on a prefix-bound model replays stored cues, the stored cues are
// read only then, and a cue after a user row goes turn-scoped only where the model takes every system row it needs.
import type { GenerationCapability, TurnsCapability } from "@orb/contracts/inference";
import type { CarryReasoning } from "@orb/contracts/preset";
import type { MessageId } from "@orb/kit/ids";
import { mintTypeId } from "@orb/kit/ids";
import type { DeliveredCue } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { cueReplayFor } from "../../../../../packages/server/src/domain/chat/substrate/cue-replay.ts";
import { makeGenerationCapability } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const TURNS: TurnsCapability = {
  assistantPrefill: false,
  midConversationSystem: true,
  historySystemRows: true,
  roleHandlingFloor: "slotted",
  explicitPromptCache: false,
  clearAt: true,
};
const REASONING = { mode: "adaptive", enabled: true, replay: "signed" } as const;
const REPLY = mintTypeId("message");
const STORED = new Map<MessageId, DeliveredCue>([[REPLY, { text: "the cue", role: "user" }]]);

function capability(prefixBound: boolean, turns: Partial<TurnsCapability> = {}): GenerationCapability {
  return makeGenerationCapability({ reasoning: { ...REASONING, prefixBound }, turns: { ...TURNS, ...turns } });
}

/** The replay plus how many times the stored cues were read. */
async function replayOf(generation: GenerationCapability, carry: CarryReasoning): Promise<{ replay: Awaited<ReturnType<typeof cueReplayFor>>; reads: number }> {
  let reads = 0;
  const replay = await cueReplayFor(generation, carry, () => {
    reads += 1;
    return Promise.resolve(STORED);
  });
  return { replay, reads };
}

test("the conversation carry on a prefix-bound model replays the stored cues", async () => {
  const { replay, reads } = await replayOf(capability(true), "conversation");
  expect(replay).toEqual({ cues: STORED, turnScoped: true });
  expect(reads).toBe(1);
});

test("no replay, and no read, below the conversation carry or on a model that accepts an edited prefix", async () => {
  for (const [generation, carry] of [
    [capability(true), "off"],
    [capability(true), "tool-chain"],
    [capability(false), "conversation"],
  ] as const) {
    expect(await replayOf(generation, carry)).toEqual({ replay: undefined, reads: 0 });
  }
});

test("a cue goes turn-scoped only where the model takes a clear-at row, a tail system row and a history system row", async () => {
  for (const missing of [{ clearAt: false }, { midConversationSystem: false }, { historySystemRows: false }] as const) {
    const { replay } = await replayOf(capability(true, missing), "conversation");
    expect(replay?.turnScoped, JSON.stringify(missing)).toBe(false);
  }
});
