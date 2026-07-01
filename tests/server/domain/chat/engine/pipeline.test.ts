// engine/pipeline — the per-turn execution pipeline: assemble→shape→fit→request→reduce. Pins the stream
// reduce (deltas → final text + economics), the shaped request, the §8 fit, and ctx immutability.

import type { AssembleContext, ChatDeltaEvent, MessageView } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { ChatId, ModelId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { RunChatTurnOp } from "../../../../../packages/server/src/domain/chat/contract/context";
import type { TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results";
import { runTurnPipeline } from "../../../../../packages/server/src/domain/chat/engine/pipeline";
import { expect, test } from "../../../../support/fixtures";

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
    activePersona: { name: "Alex", description: "the user" },
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
    // Default = the native replace (no node:vm) — a RECEIVE-watchdog test overrides with a throwing fake.
    applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
    runChatTurn: scriptedTurn([
      { kind: "text", text: "Hel" },
      { kind: "text", text: "lo" },
      {
        kind: "final",
        economics: { content: "Hello", tokensIn: 3, tokensOut: 1, model: "test-model" },
      },
    ]),
    resolveImageUrl: (ref) =>
      Promise.resolve(ref.kind === "asset" ? `https://cas.test/${ref.assetId}` : ref.url),
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
    // Every wire row is role+content (TurnMessage); a text-only body → a single text content-part (D45).
    for (const m of result.request.history) {
      expect(Object.keys(m).sort()).toEqual(["content", "role"]);
    }
    expect(result.request.history.at(-1)?.role).toBe("user");
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: "u1" }]);
    expect(result.imageDropped).toBe(false);
    expect(
      typeof result.cacheBreakpointFromEnd === "number" || result.cacheBreakpointFromEnd === null,
    ).toBe(true);
  });

  test("the `completion` names-behavior threads the author into the wire `name` field", async () => {
    // names.ts sets `name` only under "completion" (content untouched); the pipeline must thread it to the
    // TurnMessage wire `name`. The user row's author is the active persona ("Alex").
    const { args } = baseArgs({
      assembleContext: ctxOf({
        promptConfig: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "completion" },
      }),
    });
    const result = await runTurnPipeline(args);
    const named = result.request.history.find((m) => m.name !== undefined);
    expect(named?.name).toBe("Alex");
    // content stays clean — the author is NOT prefixed in completion mode (one text part, no name prefix).
    expect(named?.content).toEqual([{ type: "text", text: "u1" }]);
  });

  test("D45: an embedded image ref → text+image parts, resolved via the injected op (vision model)", async () => {
    const vision = {
      ...CONNECTION,
      capability: { ...CAPABILITY, input: { vision: true } } as unknown as ModelCapability,
    };
    const { args } = baseArgs({
      connection: vision,
      canon: [userRow("look ![a cat](asset:ast_9) here")],
    });
    const result = await runTurnPipeline(args);
    expect(result.imageDropped).toBe(false);
    expect(result.request.history.at(-1)?.content).toEqual([
      { type: "text", text: "look " },
      { type: "image", url: "https://cas.test/ast_9" },
      { type: "text", text: " here" },
    ]);
  });

  test("D45: a non-vision model drops image parts (keeps text) + flags imageDropped", async () => {
    // CONNECTION has no `input.vision` → the gate strips image spans; text survives, the turn is flagged once.
    const { args } = baseArgs({ canon: [userRow("look ![a cat](asset:ast_9) here")] });
    const result = await runTurnPipeline(args);
    expect(result.imageDropped).toBe(true);
    expect(result.request.history.at(-1)?.content).toEqual([
      { type: "text", text: "look " },
      { type: "text", text: " here" },
    ]);
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

// ── RECEIVE (D53 step 2): <think>-demux → AI_OUTPUT regex → post-process → REASONING regex ─────────────────
/** A host-tier regex script (fully defaulted via the parse seam) for a single placement. */
function script(
  id: string,
  find: string,
  replace: string,
  placement: "AI_OUTPUT" | "REASONING",
): RegexScript {
  return regexScriptSchema.parse({
    id,
    name: id,
    findRegex: find,
    replaceString: replace,
    placement: [placement],
  });
}

/** A turn that emits ONLY a terminal `final` chunk carrying the given content (+ optional native reasoning). */
function finalTurn(content: string, reasoning?: string): RunChatTurnOp {
  return scriptedTurn([
    {
      kind: "final",
      economics: reasoning === undefined ? { content } : { content, reasoning },
    },
  ]);
}

const cfgWith = (over: Partial<PromptConfig>): PromptConfig => ({
  ...DEFAULT_PROMPT_CONFIG,
  ...over,
});

describe("runTurnPipeline — RECEIVE regex + post-process", () => {
  test("AI_OUTPUT regex transforms the content (host-tier scripts)", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("Hello world"),
      assembleContext: ctxOf({
        hostTierRegexScripts: [script("ai", "world", "there", "AI_OUTPUT")],
      }),
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("Hello there");
  });

  test("post-process runs AFTER the AI_OUTPUT regex (regex → dropIncompleteSentence)", async () => {
    // AI_OUTPUT rewrites the marker to "Done. tail"; dropIncompleteSentence then cuts the trailing fragment.
    const { args } = baseArgs({
      runChatTurn: finalTurn("MARK"),
      assembleContext: ctxOf({
        hostTierRegexScripts: [script("x", "MARK", "Done. tail", "AI_OUTPUT")],
        promptConfig: cfgWith({
          postProcess: {
            collapseNewlines: false,
            trimTrailingWhitespace: false,
            dropIncompleteSentence: true,
            singleLine: false,
          },
        }),
      }),
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("Done.");
  });

  test("REASONING regex transforms the reasoning channel (content untouched)", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("reply", "think hard"),
      assembleContext: ctxOf({ hostTierRegexScripts: [script("r", "hard", "soft", "REASONING")] }),
    });
    const result = await runTurnPipeline(args);
    expect(result.reasoning).toBe("think soft");
    expect(result.content).toBe("reply");
  });

  test("the AI_OUTPUT regex runs through the INJECTED watchdog (a throwing fake skips the script)", async () => {
    // A throwing applyRegexReplace → the kit executor's per-script try/catch skips it → content UNCHANGED. The
    // default native replace would have produced "X" — so the unchanged output proves the seam was used (D53).
    const { args } = baseArgs({
      applyRegexReplace: () => {
        throw new Error("timed out");
      },
      runChatTurn: finalTurn("Hello"),
      assembleContext: ctxOf({ hostTierRegexScripts: [script("evil", "Hello", "X", "AI_OUTPUT")] }),
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("Hello");
  });
});

describe("runTurnPipeline — RECEIVE <think> demux (D47 #3)", () => {
  const reasoningCfg = cfgWith({
    reasoningParse: { autoParse: true, prefix: "<think>", suffix: "</think>" },
  });

  test("splits inline reasoning when native reasoning is empty + autoParse on", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("<think>planning</think>The reply."),
      assembleContext: ctxOf({ promptConfig: reasoningCfg }),
    });
    const result = await runTurnPipeline(args);
    expect(result.reasoning).toBe("planning");
    expect(result.content).toBe("The reply.");
  });

  test("is SKIPPED when native reasoning is present (native-first — no double-count)", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("<think>x</think>visible", "native trace"),
      assembleContext: ctxOf({ promptConfig: reasoningCfg }),
    });
    const result = await runTurnPipeline(args);
    expect(result.reasoning).toBe("native trace");
    expect(result.content).toBe("<think>x</think>visible");
  });

  test("autoParse off (default config) → the <think> block stays in content", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("<think>x</think>y"),
      assembleContext: ctxOf(),
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("<think>x</think>y");
    expect(result.reasoning).toBeNull();
  });
});
