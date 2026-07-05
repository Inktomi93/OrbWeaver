// engine/pipeline — the per-turn execution pipeline: assemble→shape→fit→request→reduce. Pins the stream
// reduce (deltas → final text + economics), the shaped request, the §8 fit, and ctx immutability.

import type {
  AssembleContext,
  ChatDeltaEvent,
  MessageView,
  ToolCallRecord,
} from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { CharacterId, ChatId, ModelId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type {
  ChatToolOps,
  RunChatTurnOp,
} from "../../../../../packages/server/src/domain/chat/contract/context";
import type {
  HistoryMacroNames,
  TurnRequest,
  TurnStreamChunk,
} from "../../../../../packages/server/src/domain/chat/contract/results";
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
    activePersona: { name: "Nate", description: "the user" },
    recentMessages: [],
    ...over,
  };
}

const rowOf = (role: "user" | "assistant", content: string): MessageView =>
  ({
    role,
    content,
    excludedFromPrompt: false,
    characterId: null,
    personaId: null,
  }) as unknown as MessageView;

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
    // D17: the engine-derived consent verdict the pipeline stamps onto the built TurnRequest (a self-triggered
    // owner turn here — inert for the vllm CONNECTION, but the field is non-optional on the args).
    ownerConsented: true,
    chatId: castId<ChatId>("chat_a"),
    onDelta: (d: ChatDeltaEvent): void => {
      deltas.push(d);
    },
    // The D48 axis defaults: tool-use unwired + nothing attached — the loop degenerates to one call
    // (the byte-identical no-op); the loop goldens override these.
    tools: null,
    attachedToolNames: [],
    toolRecurseLimit: 5,
    toolExecFrame: {
      runAsUserId: castId("user_host"),
      triggeredBy: castId("user_host"),
      chatId: castId<ChatId>("chat_a"),
      roster: null,
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
    // TurnMessage wire `name`. The user row's author is the active persona ("Nate").
    const { args } = baseArgs({
      assembleContext: ctxOf({
        promptConfig: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "completion" },
      }),
    });
    const result = await runTurnPipeline(args);
    const named = result.request.history.find((m) => m.name !== undefined);
    expect(named?.name).toBe("Nate");
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

// ── History macro resolution (resolve-on-READ; D26/D51 — storage stays raw, every prompt build re-resolves) ──
const ARIA = castId<CharacterId>("char_aria");
const KAI = castId<CharacterId>("char_kai");

const assistantRow = (content: string, characterId: CharacterId): MessageView =>
  ({
    role: "assistant",
    content,
    excludedFromPrompt: false,
    characterId,
    personaId: null,
  }) as unknown as MessageView;

const userRowWithPersona = (content: string, personaId: PersonaId): MessageView =>
  ({
    role: "user",
    content,
    excludedFromPrompt: false,
    characterId: null,
    personaId,
  }) as unknown as MessageView;

/** Flatten every wire history row's text parts into one string (the assembled prompt the model sees). */
const historyText = (req: TurnRequest): string =>
  req.history
    .flatMap((h) => h.content)
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n");

/** Build the {@link HistoryMacroNames} producer `args.historyMacroNames` takes — the test-local stand-in
 *  for the engine's `loadChatMacroNameProducer` + `buildCharacterNameMap`/`buildPersonaNameMap`
 *  (Chat-Macro-Resolution.md §1). */
function macroNamesOf(
  chars: readonly { id: CharacterId; name: string }[] = [],
  personas: readonly { id: PersonaId; name: string; description?: string }[] = [],
): HistoryMacroNames {
  return {
    characterNamesById: new Map(chars.map((c) => [c.id, { name: c.name }])),
    personaNamesById: new Map(
      personas.map((p) => [p.id, { name: p.name, description: p.description ?? "" }]),
    ),
  };
}

const MARA = castId<PersonaId>("persona_mara");
const ZARA = castId<PersonaId>("persona_zara");

describe("runTurnPipeline — history macro resolution", () => {
  test("a stored {{char}} in a history row resolves via the PRODUCER to that row's own speaker, not the current turn's", async () => {
    // Current turn speaker is Kai; a past assistant row STAMPED characterId=ARIA must resolve {{char}} to
    // the producer's Aria — the row's own stamp, never the ctx's current speaker (`cast`/`castCharacterIds`
    // no longer drive this resolution; only the producer does).
    const ctx = ctxOf({ character: { name: "Kai", description: "the rogue" } });
    const { args } = baseArgs({
      assembleContext: ctx,
      canon: [assistantRow("{{char}} waves", ARIA)],
      historyMacroNames: macroNamesOf([
        { id: KAI, name: "Kai" },
        { id: ARIA, name: "Aria" },
      ]),
    });
    const result = await runTurnPipeline(args);
    const text = historyText(result.request);
    expect(text).toContain("Aria waves");
    expect(text).not.toContain("Kai waves");
  });

  test("a stored {{user}} in a history row resolves via the PRODUCER to THAT row's own stamped persona — never the active NOR the pinned anchor", async () => {
    // Chat anchored to Nyx (pinned); the current speaker's active persona is Zara; the row is stamped
    // personaId=Mara (the Chat-Macro-Resolution.md §6 3-way-distinct fixture). The stamp wins over BOTH
    // axes — PD-100: the row's personaId is the macro subject now, not just attribution chrome.
    const ctx = ctxOf({
      pinnedPersona: { name: "Nyx", description: "the frozen anchor POV" },
      activePersona: { name: "Zara", description: "the live active persona" },
    });
    const { args } = baseArgs({
      assembleContext: ctx,
      canon: [userRowWithPersona("{{user}} nods", MARA)],
      historyMacroNames: macroNamesOf([], [{ id: MARA, name: "Mara" }]),
    });
    const result = await runTurnPipeline(args);
    const text = historyText(result.request);
    expect(text).toContain("Mara nods");
    expect(text).not.toContain("Zara nods");
    expect(text).not.toContain("Nyx nods");
  });

  test("two rows with DIFFERENT personaId stamps each resolve {{user}} to their OWN persona", async () => {
    const { args } = baseArgs({
      canon: [
        userRowWithPersona("{{user}} waves", ZARA),
        userRowWithPersona("{{user}} nods", MARA),
      ],
      historyMacroNames: macroNamesOf(
        [],
        [
          { id: ZARA, name: "Zara" },
          { id: MARA, name: "Mara" },
        ],
      ),
    });
    const result = await runTurnPipeline(args);
    const text = historyText(result.request);
    expect(text).toContain("Zara waves");
    expect(text).toContain("Mara nods");
  });

  test("a null personaId stamp falls back to the ACTIVE persona (the ctx default, no producer entry needed)", async () => {
    const { args } = baseArgs({ canon: [userRow("{{user}} nods")] });
    const result = await runTurnPipeline(args);
    // `baseArgs`' ctxOf sets `activePersona: { name: "Nate", ... }` — the null-stamp floor.
    expect(historyText(result.request)).toContain("Nate nods");
  });

  test("a plain-text history row (no macros) passes through unchanged — inert for the common case", async () => {
    const { args } = baseArgs({ canon: [userRow("just an ordinary line, no braces")] });
    const result = await runTurnPipeline(args);
    expect(historyText(result.request)).toContain("just an ordinary line, no braces");
  });
});

// ── task #59 S2: the two persona axes stay distinct WITHIN one real pipeline call (BUILD's card-derived
// section vs SHAPE's history-row resolution) — not just as separate unit fixtures on assemble.ts/macros.ts.
describe("runTurnPipeline — persona axes stay distinct (card pin vs history active-fallback)", () => {
  test("a CARD-derived section's {{user}} resolves to the PINNED anchor while a null-stamp history row resolves to the ACTIVE persona", async () => {
    // The card's own systemPrompt overrides the (empty-by-default) main_prompt marker — a CARD-derived
    // section (assemble.ts's dual-persona rule: CARD sections bind {{user}} to ctx.pinnedPersona, the
    // FROZEN anchor). The canon row's {{user}} has a NULL personaId stamp, so it falls through to
    // ctx.activePersona — never the pinned anchor (Chat-Macro-Resolution.md §4/§6).
    const ctx = ctxOf({
      character: { name: "Aria", description: "a bold knight", systemPrompt: "Dear {{user}}," },
      pinnedPersona: { name: "Nyx", description: "the frozen anchor" },
      activePersona: { name: "Zara", description: "the live active persona" },
    });
    const { args } = baseArgs({ assembleContext: ctx, canon: [userRow("{{user}} nods")] });
    const result = await runTurnPipeline(args);

    // BUILD half: the card-derived section resolved {{user}} against the PINNED anchor.
    expect(result.request.prompt.static).toContain("Dear Nyx,");
    expect(result.request.prompt.static).not.toContain("Dear Zara,");
    // SHAPE half: the null-stamp history row resolved {{user}} against the ACTIVE persona, never the pin.
    expect(historyText(result.request)).toContain("Zara nods");
    expect(historyText(result.request)).not.toContain("Nyx nods");
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

// ── The D48 recurse loop (tool-use-design/03 §2 — the 05 §T4 goldens) ────────────────────────────
const TOOL_CAPABILITY = {
  reasoning: { mode: "none", enabled: false },
  sampling: {},
  output: { maxTokens: { min: 1, max: 8192 } },
  context: { window: 200_000 },
  tools: { parallel: false },
} as unknown as ModelCapability;

const TOOL_CONNECTION: ResolvedConnection = { ...CONNECTION, capability: TOOL_CAPABILITY };

/** A scripted role returning one chunk-set PER INVOCATION (depth k gets script[k]); captures requests. */
function scriptedDepths(
  scripts: readonly (readonly TurnStreamChunk[])[],
  sink: TurnRequest[],
): RunChatTurnOp {
  let call = 0;
  return (req) => {
    sink.push(req);
    const chunks = scripts[Math.min(call, scripts.length - 1)] ?? [];
    call += 1;
    return (async function* (): AsyncGenerator<TurnStreamChunk> {
      await Promise.resolve();
      for (const c of chunks) {
        yield c;
      }
    })();
  };
}

const toolFinal = (
  content: string,
  calls: readonly { id: string; name: string; args: string }[],
): TurnStreamChunk => ({
  kind: "final",
  economics: {
    content,
    tokensIn: 10,
    tokensOut: 5,
    costUsd: 0.01,
    finishReason: "tool",
    toolCalls: calls.map((c) => ({ toolCallId: c.id, name: c.name, arguments: c.args })),
  },
});

const doneFinal = (content: string): TurnStreamChunk => ({
  kind: "final",
  economics: { content, tokensIn: 7, tokensOut: 3, costUsd: 0.02, finishReason: "stop" },
});

/** A fake ChatToolOps: echoes executions as records; `failWith` makes every call errors-as-data. */
function fakeToolOps(executed: string[][], failWith?: string): ChatToolOps {
  return {
    resolveTools: (names) => ({ marker: "resolved-set", names }),
    toWireTools: () => [{ name: "tick_clock", description: "d", parameters: { type: "object" } }],
    executeToolCalls: (_set, calls): Promise<ToolCallRecord[]> => {
      executed.push(calls.map((c) => c.name));
      return Promise.resolve(
        calls.map((c) => ({
          toolCallId: c.toolCallId,
          name: c.name,
          arguments: c.arguments,
          result:
            failWith === undefined
              ? JSON.stringify({ ok: c.name })
              : JSON.stringify({ error: failWith }),
          isError: failWith !== undefined,
          durationMs: 1,
        })),
      );
    },
  };
}

describe("runTurnPipeline — the D48 recurse loop", () => {
  test("loop golden: emits calls → executes → recurses with the exchange → finishes; content + usage aggregate", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths(
        [
          [toolFinal("The clock ticks... ", [{ id: "c1", name: "tick_clock", args: '{"m":30}' }])],
          [doneFinal("Half an hour passes.")],
        ],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);

    // Two role calls; the first carried the wire tools + the LOOP's auto default.
    expect(requests).toHaveLength(2);
    expect(requests[0]?.tools?.map((t) => t.name)).toEqual(["tick_clock"]);
    expect(requests[0]?.toolChoice).toEqual({ mode: "auto" });
    // The recursed request's history grew by the materialized exchange: assistant(tool-call) + tool(result).
    const secondHistory = requests[1]?.history ?? [];
    const appended = secondHistory.slice((requests[0]?.history ?? []).length);
    expect(appended.map((m) => m.role)).toEqual(["assistant", "tool"]);
    expect(
      appended[0]?.content.some((p) => p.type === "tool-call" && p.name === "tick_clock"),
    ).toBe(true);
    expect(
      appended[1]?.content.some((p) => p.type === "tool-result" && p.toolCallId === "c1"),
    ).toBe(true);
    // Executed once, in order; records land on the result in execution order.
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.toolRecords.map((r) => r.name)).toEqual(["tick_clock"]);
    expect(result.toolRecords[0]?.isError).toBe(false);
    // Prose flows across depths into ONE variant; usage sums into one economics row.
    expect(result.content).toBe("The clock ticks... Half an hour passes.");
    expect(result.economics?.tokensIn).toBe(17);
    expect(result.economics?.tokensOut).toBe(8);
    expect(result.economics?.costUsd).toBeCloseTo(0.03);
    expect(result.toolsUnsupported).toBe(false);
  });

  test("limit boundary: the limit-th depth RECORDS the pending calls unexecuted (result:null) and stops", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const always = toolFinal("more... ", [{ id: "cX", name: "tick_clock", args: "{}" }]);
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      toolRecurseLimit: 2,
      runChatTurn: scriptedDepths([[always]], requests),
    });
    const result = await runTurnPipeline(args);
    // Depths 0 and 1 execute; the limit hit at depth 2 records-without-executing and ends the turn.
    expect(requests).toHaveLength(3);
    expect(executed).toHaveLength(2);
    expect(result.toolRecords).toHaveLength(3);
    const last = result.toolRecords.at(-1);
    expect(last?.result).toBeNull();
    expect(last?.isError).toBe(false);
    expect(last?.durationMs).toBeNull();
  });

  test("errors-as-data feedback is VISIBLE to the recursed model (the tool message carries the error document)", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps([], "party is mid-combat"),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths(
        [
          [toolFinal("", [{ id: "c1", name: "tick_clock", args: "{}" }])],
          [doneFinal("I cannot do that right now.")],
        ],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);
    const toolRow = requests[1]?.history.at(-1);
    const resultPart = toolRow?.content.find((p) => p.type === "tool-result");
    const narrowed = resultPart?.type === "tool-result" ? resultPart : null;
    expect(JSON.parse(narrowed?.content ?? "{}")).toEqual({ error: "party is mid-combat" });
    expect(narrowed?.isError).toBe(true);
    expect(result.toolRecords[0]?.isError).toBe(true);
  });

  test("byte-identity pin (05 §T4): tools null vs wired-but-unattached — the request is deep-equal, no tools field", async () => {
    const reqA: TurnRequest[] = [];
    const reqB: TurnRequest[] = [];
    const depthScript = [[doneFinal("hi")]];
    const { args: a } = baseArgs({ tools: null, runChatTurn: scriptedDepths(depthScript, reqA) });
    const { args: b } = baseArgs({
      tools: fakeToolOps([]),
      attachedToolNames: [],
      runChatTurn: scriptedDepths(depthScript, reqB),
    });
    await runTurnPipeline(a);
    await runTurnPipeline(b);
    expect(reqA[0]).not.toHaveProperty("tools");
    expect(reqB[0]).not.toHaveProperty("tools");
    expect(JSON.stringify(reqA[0])).toBe(JSON.stringify(reqB[0]));
  });

  test("the capability gate: attached but capability.tools absent → dropped + flagged; ONE call, no tools field", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      // CONNECTION (no tools capability) — the gate drops the attachment.
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths([[doneFinal("plain reply")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty("tools");
    expect(executed).toHaveLength(0);
    expect(result.toolsUnsupported).toBe(true);
    expect(result.toolRecords).toEqual([]);
  });
});
