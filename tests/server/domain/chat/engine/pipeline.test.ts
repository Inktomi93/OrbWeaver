// engine/pipeline — the per-turn execution pipeline: assemble→shape→fit→request→reduce. Pins the stream
// reduce (deltas → final text + economics), the shaped request, the §8 fit, and ctx immutability.

import type { AssembleContext, ChatDeltaEvent, MessageView } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ChatId, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe, expect, test } from "vitest";
import type { RunChatTurnOp } from "../../../../../packages/server/src/domain/chat/contract/context";
import type { TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results";
import { runTurnPipeline } from "../../../../../packages/server/src/domain/chat/engine/pipeline";

const CAPABILITY = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 200_000 },
} as unknown as ModelCapability;

const CONNECTION: ResolvedConnection = {
  api: "chat-completions",
  model: castId<ModelId>("test-model"),
  credential: { source: "vllm", credentialId: null } as unknown as ResolvedCredential,
  capability: CAPABILITY,
};

function ctxOf(over: Partial<AssembleContext> = {}): AssembleContext {
  return {
    character: { name: "Aria", description: "a bold knight" },
    promptConfig: DEFAULT_PROMPT_CONFIG,
    activePersona: { name: "Nate", description: "the user" },
    recentMessages: [],
    ...over,
  };
}

const rowOf = (role: "user" | "assistant", content: string): MessageView =>
  ({ role, content, excludedFromPrompt: false, characterId: null }) as unknown as MessageView;

const userRow = (content: string): MessageView => rowOf("user", content);

function scriptedTurn(chunks: readonly TurnStreamChunk[]): RunChatTurnOp {
  return () =>
    (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      for (const c of chunks) {
        yield c;
      }
    })();
}

type PipelineArgs = Parameters<typeof runTurnPipeline>[0];

function baseArgs(over: Partial<PipelineArgs> = {}): {
  args: PipelineArgs;
  deltas: ChatDeltaEvent[];
} {
  const deltas: ChatDeltaEvent[] = [];
  const args: PipelineArgs = {
    runChatTurn: scriptedTurn([
      { kind: "text", text: "Hel" },
      { kind: "text", text: "lo" },
      {
        kind: "final",
        economics: { content: "Hello", tokensIn: 3, tokensOut: 1, model: "test-model" },
      },
    ]),
    assembleContext: ctxOf(),
    canon: [userRow("u1")],
    connection: CONNECTION,
    intent: {} satisfies UserIntent,
    kind: "send",
    chatId: castId<ChatId>("chat_a"),
    onDelta: (d: ChatDeltaEvent): void => {
      deltas.push(d);
    },
    ...over,
  };
  return { args, deltas };
}

describe("runTurnPipeline — reduce", () => {
  test("reduces text deltas + the final chunk into content + economics", async () => {
    const { args, deltas } = baseArgs();
    const result = await runTurnPipeline(args);
    // The final chunk's content is authoritative; the streamed deltas were fanned out.
    expect(result.content).toBe("Hello");
    expect(result.economics?.tokensIn).toBe(3);
    expect(deltas.map((d) => d.kind === "text" && d.text)).toEqual(["Hel", "lo"]);
  });

  test("falls back to accumulated text when the final chunk omits content", async () => {
    const { args } = baseArgs({
      runChatTurn: scriptedTurn([
        { kind: "text", text: "A" },
        { kind: "text", text: "B" },
      ]),
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("AB");
    expect(result.economics).toBeNull();
  });

  test("reasoning deltas accumulate + fan out separately", async () => {
    const { args, deltas } = baseArgs({
      runChatTurn: scriptedTurn([
        { kind: "reasoning", text: "think" },
        { kind: "text", text: "say" },
      ]),
    });
    const result = await runTurnPipeline(args);
    expect(result.reasoning).toBe("think");
    expect(deltas.some((d) => d.kind === "reasoning")).toBe(true);
  });
});

describe("runTurnPipeline — request shaping + fit", () => {
  test("builds a TurnRequest: connection, role+content history, the §8 breakpoint offset", async () => {
    const { args } = baseArgs();
    const result = await runTurnPipeline(args);
    expect(result.request.connection).toBe(CONNECTION);
    expect(result.request.kind).toBe("send");
    // Every wire row is role+content only (TurnMessage); the tail is the user turn.
    for (const m of result.request.history) {
      expect(Object.keys(m).sort()).toEqual(["content", "role"]);
    }
    expect(result.request.history.at(-1)?.role).toBe("user");
    expect(
      typeof result.cacheBreakpointFromEnd === "number" || result.cacheBreakpointFromEnd === null,
    ).toBe(true);
  });

  test("the `completion` names-behavior threads the author into the wire `name` field", async () => {
    // names.ts sets `name` only under "completion" (content untouched); the pipeline must thread it to the
    // TurnMessage wire `name`. The user row's author is the active persona ("Nate").
    const { args } = baseArgs({
      assembleContext: ctxOf({
        promptConfig: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "completion" },
      }),
    });
    const result = await runTurnPipeline(args);
    const named = result.request.history.find((m) => m.name !== undefined);
    expect(named?.name).toBe("Nate");
    // content stays clean — the author is NOT prefixed in completion mode.
    expect(named?.content).toBe("u1");
  });

  test("the §8 fit drops oldest turns under a tiny window (keeps the newest)", async () => {
    // Alternate roles so squash doesn't collapse the history into one turn (then the fit has rows to drop).
    const longCanon = Array.from({ length: 12 }, (_, i) =>
      rowOf(
        i % 2 === 0 ? "user" : "assistant",
        `turn ${i} with several words to spend tokens here`,
      ),
    );
    const tiny = {
      ...CAPABILITY,
      context: { window: 80 },
    } as unknown as ModelCapability;
    const { args } = baseArgs({
      canon: longCanon,
      connection: { ...CONNECTION, capability: tiny },
    });
    const result = await runTurnPipeline(args);
    expect(result.droppedCount).toBeGreaterThan(0);
  });
});

describe("runTurnPipeline — immutability", () => {
  test("does not mutate the immutable assemble ctx (chat.md §5)", async () => {
    const ctx = ctxOf();
    const snapshot = structuredClone(ctx);
    const { args } = baseArgs({ assembleContext: ctx });
    await runTurnPipeline(args);
    expect(ctx).toEqual(snapshot);
  });
});
