// engine/pipeline — the per-turn execution pipeline: assemble→shape→fit→request→reduce. Pins the stream
// reduce (deltas → final text + economics), the shaped request, the §8 fit, and ctx immutability.

import type { AssembleContext, ChatDeltaEvent, ChatInjection, MessageView, ToolCallRecord } from "@orb/contracts/chat";
import type { ModelCapability, ResolvedConnection } from "@orb/contracts/connection";
import type { ResolvedCredential } from "@orb/contracts/credentials";
import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { RegexScript } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { CharacterId, ChatId, ChatTurnId, MessageId, ModelId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { executeRegexScripts } from "@orb/kit/regex";
import { getLog } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { buildTurnUserMacros } from "../../../../../packages/server/src/domain/chat/assembly/user-macros";
import type { ChatToolOps, RunChatTurnOp } from "../../../../../packages/server/src/domain/chat/contract/context";
import type { HistoryMacroNames, TurnRequest, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results";
import { runTurnPipeline } from "../../../../../packages/server/src/domain/chat/engine/pipeline";
import { resolveModelCapability } from "../../../../../packages/server/src/domain/connection/catalog/resolve-model-capability";
import { makeModelCapability } from "../../../../support/factories/resolved-connection.ts";
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
    resolveImageUrl: (ref) => Promise.resolve(ref.kind === "asset" ? `https://cas.test/${ref.assetId}` : ref.url),
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
      turnId: castId<ChatTurnId>("chat_turn_a"),
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

describe("runTurnPipeline — the D50 assembled_dynamic PromptTransform point (automation-design/04 §6)", () => {
  test("transforms the DYNAMIC half only; the static (cache-stable) half stays byte-identical", async () => {
    // Baseline: no transform → the built halves.
    const baseline = await runTurnPipeline(baseArgs().args);
    const staticBefore = baseline.request.prompt.static;
    const dynamicBefore = baseline.request.prompt.dynamic;

    let seenPoint: string | undefined;
    let seenDraft: string | undefined;
    const { args } = baseArgs({
      applyPromptTransforms: (point, _chatId, draft) => {
        seenPoint = point;
        seenDraft = draft;
        return Promise.resolve(`${draft}[DYN]`);
      },
    });
    const result = await runTurnPipeline(args);

    // The op fires at exactly the assembled_dynamic point, over exactly the built dynamic half.
    expect(seenPoint).toBe("assembled_dynamic");
    expect(seenDraft).toBe(dynamicBefore);
    expect(result.request.prompt.dynamic).toBe(`${dynamicBefore}[DYN]`);
    // The static half is untransformable (03 §1.2's per-turn-cache-bill argument) — byte-identical.
    expect(result.request.prompt.static).toBe(staticBefore);
  });

  test("an absent op leaves the assembled prompt byte-identical (the null-op no-op)", async () => {
    const withOp = await runTurnPipeline(baseArgs({ applyPromptTransforms: (_p, _c, draft) => Promise.resolve(draft) }).args);
    const without = await runTurnPipeline(baseArgs().args);
    expect(withOp.request.prompt.dynamic).toBe(without.request.prompt.dynamic);
    expect(withOp.request.prompt.static).toBe(without.request.prompt.static);
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
    expect(typeof result.cacheBreakpointFromEnd === "number" || result.cacheBreakpointFromEnd === null).toBe(true);
  });

  test("PD-146: the host's custom stopping strings fold into the request intent's stop set (dedup, intent-first)", async () => {
    const { args } = baseArgs({ intent: { stop: ["<END>"] } satisfies UserIntent, extraStopSequences: ["<END>", "\nUser:"] });
    const result = await runTurnPipeline(args);
    // resolveSampling reads request.intent.stop — the preset/intent stops come first, then the host's, Set-deduped.
    expect(result.request.intent.stop).toEqual(["<END>", "\nUser:"]);
  });

  test("PD-146: no custom stops leaves the request intent untouched but for the materialized maxOutputTokens", async () => {
    const intent: UserIntent = { stop: ["<END>"] };
    const withEmpty = await runTurnPipeline(baseArgs({ intent, extraStopSequences: [] }).args);
    const withNone = await runTurnPipeline(baseArgs({ intent }).args);
    // Empty/absent extras leave the caller's fields verbatim; the ONLY addition is the single-source
    // maxOutputTokens materialization (the reserve == runner max_tokens coupling).
    const expected = { stop: ["<END>"], maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS };
    expect(withEmpty.request.intent).toEqual(expected);
    expect(withNone.request.intent).toEqual(expected);
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

  test("F7b: an image-only user row whose every part drops keeps a NON-empty alt placeholder", async () => {
    // Non-vision model + an image-only trailing user message → every part drops. Without a placeholder the
    // wire row would be `[{type:"text",text:""}]`, which the runner's empty-row filter DELETES → the
    // delivered history ends on the prior assistant row (Anthropic-with-thinking then 400s). The alt text
    // keeps the trailing-user invariant alive.
    const { args } = baseArgs({
      canon: [rowOf("assistant", "prev reply"), userRow("![a cat](asset:ast_9)")],
    });
    const result = await runTurnPipeline(args);
    expect(result.imageDropped).toBe(true);
    const tail = result.request.history.at(-1);
    expect(tail?.role).toBe("user");
    expect(tail?.content).toEqual([{ type: "text", text: "[image: a cat]" }]);
  });

  test("F7b: an image-only row with no alt text falls back to the neutral `[image omitted]` placeholder", async () => {
    const { args } = baseArgs({
      canon: [rowOf("assistant", "prev reply"), userRow("![](asset:ast_9)")],
    });
    const result = await runTurnPipeline(args);
    const tail = result.request.history.at(-1);
    expect(tail?.content).toEqual([{ type: "text", text: "[image omitted]" }]);
  });

  test("the §8 fit drops oldest turns under a tiny window (keeps the newest)", async () => {
    // Alternate roles so squash doesn't collapse the history into one turn (then the fit has rows to drop).
    const longCanon = Array.from({ length: 12 }, (_, i) => rowOf(i % 2 === 0 ? "user" : "assistant", `turn ${i} with several words to spend tokens here`));
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

  test("the fit stamps contextBoundaryMessageId at the earliest KEPT id-bearing turn (previewFit parity anchor)", async () => {
    // Id-bearing rows so the boundary is a concrete message id (not null) — the SAME stamp previewFit must
    // reproduce over the same canon+capability. `toShapeCanon` reads the MessageView's `id` onto the shaped
    // row (that's what fitHistory keys the boundary on). An END-ON-USER canon (odd length) avoids the
    // continuation nudge (an id-less trailing row); a mid-size window drops SOME rows but keeps id-bearing ones.
    const idRowOf = (i: number): MessageView => ({
      ...rowOf(i % 2 === 0 ? "user" : "assistant", `turn ${i} with several words to spend a few tokens`),
      id: castId<MessageId>(`message_parity_${i}`),
    });
    const canon = Array.from({ length: 11 }, (_, i) => idRowOf(i)); // 0..10, last (10) is a USER row
    const mid = makeModelCapability({ output: { maxTokens: { min: 1, max: 8192 } }, context: { window: 400 } });
    const result = await runTurnPipeline(baseArgs({ canon, connection: { ...CONNECTION, capability: mid } }).args);
    expect(result.droppedCount).toBeGreaterThan(0);
    expect(result.droppedCount).toBeLessThan(11); // real rows survive → the boundary is a real id
    // The stamped boundary is the earliest KEPT id — canon index === droppedCount (drop the first N).
    expect(result.contextBoundaryMessageId).toBe(castId<MessageId>(`message_parity_${result.droppedCount}`));
  });
});

// SHRINKAGE — the full-reset compaction exclusion (#9 verifier fix): covered turns (seq <= compactedThroughSeq)
// FALL OUT of the shaped prompt history when a marker is present. Api-agnostic (the exclusion is at the domain
// assembly seam, so it holds on EVERY source — the pipeline path here proves the shared home). The marker itself
// rides the system prompt (a separate section), so the history genuinely SHRINKS.
describe("runTurnPipeline — compaction shrinkage (covered turns fall out of history)", () => {
  // A slim MessageView double for the shrinkage-exclusion pin — only role/content/seq/excluded/id are read by
  // toShapeCanon; a full factory would carry irrelevant canon fields.
  const seqRow = (seq: number, role: "user" | "assistant", content: string): MessageView =>
    // FABRICATION-OK: slim MessageView double — toShapeCanon reads only role/content/seq/excludedFromPrompt/id.
    ({ role, content, seq, excludedFromPrompt: false, characterId: null, personaId: null, id: castId<MessageId>(`m${seq}`) }) as unknown as MessageView;
  const canonRows = [
    seqRow(1, "user", "COVERED-USER-ONE"),
    seqRow(2, "assistant", "COVERED-ASSISTANT-TWO"),
    seqRow(3, "user", "LIVE-USER-THREE"),
    seqRow(4, "assistant", "LIVE-ASSISTANT-FOUR"),
  ];

  test("a marker covering through seq 2 drops seq 1-2 from the shaped history, keeps 3-4", async () => {
    const ctx = ctxOf({ compactSummary: "the story so far", compactedThroughSeq: 2 });
    const { args } = baseArgs({ assembleContext: ctx, canon: canonRows });
    const result = await runTurnPipeline(args);
    const text = historyText(result.request);
    expect(text).not.toContain("COVERED-USER-ONE"); // seq 1 ≤ coverage → excluded
    expect(text).not.toContain("COVERED-ASSISTANT-TWO"); // seq 2 ≤ coverage → excluded
    expect(text).toContain("LIVE-USER-THREE"); // seq 3 > coverage → kept
    expect(text).toContain("LIVE-ASSISTANT-FOUR"); // seq 4 > coverage → kept
  });

  test("NO exclusion when there is no summary (a stale coverage seq alone never trims)", async () => {
    const ctx = ctxOf({ compactSummary: null, compactedThroughSeq: 2 });
    const { args } = baseArgs({ assembleContext: ctx, canon: canonRows });
    const text = historyText((await runTurnPipeline(args)).request);
    expect(text).toContain("COVERED-USER-ONE"); // no marker ⇒ full history
    expect(text).toContain("LIVE-ASSISTANT-FOUR");
  });

  test("coverage 0 (no compaction) keeps the whole history even with a summary present", async () => {
    const ctx = ctxOf({ compactSummary: "irrelevant", compactedThroughSeq: 0 });
    const { args } = baseArgs({ assembleContext: ctx, canon: canonRows });
    const text = historyText((await runTurnPipeline(args)).request);
    expect(text).toContain("COVERED-USER-ONE");
  });
});

// ── The token-budget reserve: one source of truth for the effective output length ───────────────────
// The amnesia regression: when a model's `output.maxTokens.max ≈ context.window` (a self-hosted vLLM
// caps output at the whole window), the OLD reserve `intent.maxOutputTokens ?? capability.output.maxTokens.max`
// reserved the ENTIRE window → promptBudget went negative → the fit dropped ALL prior history every turn.
// The fix materializes `effectiveIntent.maxOutputTokens` ONCE, so the fit's reserve and the runner's wire
// `max_tokens` (both read `request.intent.maxOutputTokens`) are the SAME value and default to a sane
// response length, NOT the window.
describe("runTurnPipeline — token-budget reserve (single source of truth)", () => {
  // A vLLM-shaped descriptor: the output cap equals the window (the exact condition that caused amnesia).
  const vllmShape = makeModelCapability({ output: { maxTokens: { min: 1, max: 32_768 } }, context: { window: 32_768 } });
  const vllmConnection: ResolvedConnection = { ...CONNECTION, capability: vllmShape };

  // A handful of short alternating turns — comfortably inside the window once the reserve is a response
  // length rather than the whole window.
  const shortChat = Array.from({ length: 6 }, (_, i) => rowOf(i % 2 === 0 ? "user" : "assistant", `short turn ${i}`));

  test("unset maxOutputTokens ⇒ the request intent carries the shared DEFAULT (the value the runner sends as max_tokens)", async () => {
    // `request.intent` is exactly what compose forwards to the runner as `ChatRequest.params`, so asserting
    // it pins the runner's wire `max_tokens` == the budget's reserve (both read this one field).
    const { args } = baseArgs({ intent: {} satisfies UserIntent, connection: vllmConnection });
    const result = await runTurnPipeline(args);
    expect(result.request.intent.maxOutputTokens).toBe(DEFAULT_MAX_OUTPUT_TOKENS);
  });

  test("amnesia killed: a vLLM chat (output.max == window) keeps ALL short history — no context_boundary", async () => {
    const { args } = baseArgs({ intent: {} satisfies UserIntent, connection: vllmConnection, canon: shortChat });
    const result = await runTurnPipeline(args);
    expect(result.droppedCount).toBe(0);
    expect(result.contextBoundaryMessageId).toBeNull();
  });

  test("an explicit maxOutputTokens passes through to the request intent (not overwritten by the default)", async () => {
    const { args } = baseArgs({ intent: { maxOutputTokens: 500 } satisfies UserIntent, connection: vllmConnection });
    const result = await runTurnPipeline(args);
    expect(result.request.intent.maxOutputTokens).toBe(500);
  });

  test("a preset's maxOutputTokens (no per-turn override) is the effective reserve — reaches the request intent", async () => {
    const { args } = baseArgs({
      intent: {} satisfies UserIntent,
      connection: vllmConnection,
      assembleContext: ctxOf({ promptConfig: { ...DEFAULT_PROMPT_CONFIG, params: { maxOutputTokens: 700 } } }),
    });
    const result = await runTurnPipeline(args);
    expect(result.request.intent.maxOutputTokens).toBe(700);
  });

  test("a large maxOutputTokens reserve DOES trim history (the reserve genuinely drives the fit)", async () => {
    // Same chat + window; the ONLY difference is the reserve. A tiny reserve fits everything, a
    // near-window reserve leaves no prompt budget → the fit drops oldest turns. Proves the intent's
    // maxOutputTokens is the LIVE reserve (not an inert field) AND that it's the amnesia lever.
    const chat = Array.from({ length: 10 }, (_, i) => rowOf(i % 2 === 0 ? "user" : "assistant", `turn ${i} carrying several words to burn a few tokens here`));
    const small = await runTurnPipeline(baseArgs({ intent: { maxOutputTokens: 256 } satisfies UserIntent, connection: vllmConnection, canon: chat }).args);
    const large = await runTurnPipeline(baseArgs({ intent: { maxOutputTokens: 32_700 } satisfies UserIntent, connection: vllmConnection, canon: chat }).args);
    expect(small.droppedCount).toBe(0);
    expect(large.droppedCount).toBeGreaterThan(0);
  });

  test("maxContextTokens lowers the fit ceiling below the window (the soft cap is settable)", async () => {
    // A wide window but a small user context cap → the fit trims to the cap. Uses a real chat with enough
    // rows that a ~200-token ceiling can't hold them all.
    const wideConnection: ResolvedConnection = {
      ...CONNECTION,
      capability: makeModelCapability({ output: { maxTokens: { min: 1, max: 8192 } }, context: { window: 1_000_000 } }),
    };
    const chat = Array.from({ length: 12 }, (_, i) => rowOf(i % 2 === 0 ? "user" : "assistant", `turn ${i} carrying several words to burn some tokens`));
    const uncapped = await runTurnPipeline(baseArgs({ intent: { maxOutputTokens: 100 } satisfies UserIntent, connection: wideConnection, canon: chat }).args);
    const capped = await runTurnPipeline(
      baseArgs({ intent: { maxOutputTokens: 100, maxContextTokens: 200 } satisfies UserIntent, connection: wideConnection, canon: chat }).args,
    );
    expect(uncapped.droppedCount).toBe(0);
    expect(capped.droppedCount).toBeGreaterThan(0);
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
    personaNamesById: new Map(personas.map((p) => [p.id, { name: p.name, description: p.description ?? "" }])),
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
      canon: [userRowWithPersona("{{user}} waves", ZARA), userRowWithPersona("{{user}} nods", MARA)],
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

  test("a null personaId stamp falls back to the chat ANCHOR (pinnedPersona), never the active persona", async () => {
    // Ruling A (Chat-Macro-Resolution.md §2/§4): a null-stamp history row's {{user}} resolves to the chat
    // ANCHOR, never the per-viewer active persona (Nate, the ctxOf default) — so a greeting / AI / legacy
    // line addresses the SAME persona for the model and every human.
    const ctx = ctxOf({ pinnedPersona: { name: "Nyx", description: "the frozen anchor" } });
    const { args } = baseArgs({ assembleContext: ctx, canon: [userRow("{{user}} nods")] });
    const result = await runTurnPipeline(args);
    const text = historyText(result.request);
    expect(text).toContain("Nyx nods");
    expect(text).not.toContain("Nate nods");
  });

  test("a plain-text history row (no macros) passes through unchanged — inert for the common case", async () => {
    const { args } = baseArgs({ canon: [userRow("just an ordinary line, no braces")] });
    const result = await runTurnPipeline(args);
    expect(historyText(result.request)).toContain("just an ordinary line, no braces");
  });
});

// ── D66-C (W6 REVERSED): the adjacent-same-role knob is now sourced from the PRESET
// (`params.advanced.roleHandling`), NOT the connection — the pipeline hands the preset value to SHAPE, which
// clamps it against the model's `capability.turns.roleHandlingFloor` (`max(floor, knob)`). Two adjacent
// assistant rows are the observable: `merge`/stricter collapses them into ONE assistant wire row; `none`
// keeps them SEPARATE. These tests prove the PRESET value reached the clamp (a broken re-thread would read a
// now-absent connection field → fall to the `strict` floor → always merge, failing case 1).
describe("runTurnPipeline — roleHandling is the PRESET knob, clamped at SHAPE", () => {
  const twoAssistants = [userRow("u1"), assistantRow("First.", ARIA), assistantRow("Second.", KAI)];
  const withFloor = (floor: "none" | "merge" | "strict"): ResolvedConnection => {
    const capability: ModelCapability = {
      ...CAPABILITY,
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        roleHandlingFloor: floor,
        explicitPromptCache: false,
      },
    };
    return { ...CONNECTION, capability };
  };
  const presetWith = (roleHandling: "none" | "strict"): PromptConfig => ({
    ...DEFAULT_PROMPT_CONFIG,
    params: { ...DEFAULT_PROMPT_CONFIG.params, advanced: { roleHandling } },
  });
  const assistantRows = (req: TurnRequest): TurnRequest["history"] => req.history.filter((h) => h.role === "assistant");

  test("preset `none`, floor `none` ⇒ the adjacent assistant rows stay SEPARATE (preset value reached SHAPE)", async () => {
    const { args } = baseArgs({
      canon: twoAssistants,
      connection: withFloor("none"),
      assembleContext: ctxOf({ promptConfig: presetWith("none") }),
    });
    const result = await runTurnPipeline(args);
    expect(assistantRows(result.request)).toHaveLength(2);
  });

  test("preset `none`, floor `strict` ⇒ MERGED (the stricter floor wins the clamp `max(strict, none)`)", async () => {
    const { args } = baseArgs({
      canon: twoAssistants,
      connection: withFloor("strict"),
      assembleContext: ctxOf({ promptConfig: presetWith("none") }),
    });
    const result = await runTurnPipeline(args);
    expect(assistantRows(result.request)).toHaveLength(1);
  });

  test("preset `strict`, floor `none` ⇒ MERGED (the stricter preset intent wins the clamp `max(none, strict)`)", async () => {
    const { args } = baseArgs({
      canon: twoAssistants,
      connection: withFloor("none"),
      assembleContext: ctxOf({ promptConfig: presetWith("strict") }),
    });
    const result = await runTurnPipeline(args);
    expect(assistantRows(result.request)).toHaveLength(1);
  });
});

// BUILD-QUEUE #3: the `squashSystemMessages` PROMPT knob (`params.advanced`, ST-imported from
// `squash_system_messages`) is now a live SHAPE reader — consecutive system-note runs merge into ONE
// `[Note from system: …]` bracket BEFORE the system→user framing, orthogonal to `roleHandling`. Two
// adjacent depth-0 system injections are the observable: ON ⇒ ONE bracket (merge-before-convert), OFF ⇒
// TWO brackets even though the strict floor still row-merges them (the distinction proves the KNOB, not
// the role-squash, drove the fold). A broken re-thread would read a now-absent field → default OFF →
// fail the ON case.
describe("runTurnPipeline — squashSystemMessages is the PRESET knob, folded at SHAPE", () => {
  const systemNotes: ChatInjection[] = [
    { position: "in_chat", depth: 0, role: "system", content: "sys-alpha" },
    { position: "in_chat", depth: 0, role: "system", content: "sys-beta" },
  ];
  const presetSquash = (squashSystemMessages: boolean): PromptConfig => ({
    ...DEFAULT_PROMPT_CONFIG,
    params: { ...DEFAULT_PROMPT_CONFIG.params, advanced: { squashSystemMessages } },
  });
  const systemBrackets = (req: TurnRequest): number => (historyText(req).match(/\[Note from system:/g) ?? []).length;

  test("preset squashSystemMessages:true ⇒ the two system notes fold into ONE bracket (preset value reached SHAPE)", async () => {
    const { args } = baseArgs({
      assembleContext: ctxOf({ promptConfig: presetSquash(true), chatInjections: systemNotes }),
    });
    const result = await runTurnPipeline(args);
    expect(systemBrackets(result.request)).toBe(1);
    expect(historyText(result.request)).toContain("[Note from system: sys-alpha\n\nsys-beta]");
  });

  test("preset squashSystemMessages absent ⇒ the notes stay as TWO separate brackets (byte-identical to today)", async () => {
    const { args } = baseArgs({
      assembleContext: ctxOf({ promptConfig: DEFAULT_PROMPT_CONFIG, chatInjections: systemNotes }),
    });
    const result = await runTurnPipeline(args);
    expect(systemBrackets(result.request)).toBe(2);
  });
});

describe("runTurnPipeline — PD-148: the preset params + customParameters fold into the wire request", () => {
  const presetParams = (params: UserIntent): PromptConfig => ({ ...DEFAULT_PROMPT_CONFIG, params });

  test("preset `params` are the BASE — a preset's sampling knobs reach the wire intent with no per-turn override", async () => {
    const { args } = baseArgs({
      intent: {} satisfies UserIntent,
      assembleContext: ctxOf({ promptConfig: presetParams({ temperature: 0.7, topP: 0.9, seed: 42 }) }),
    });
    const result = await runTurnPipeline(args);
    expect(result.request.intent.temperature).toBe(0.7);
    expect(result.request.intent.topP).toBe(0.9);
    expect(result.request.intent.seed).toBe(42);
  });

  test("per-turn `UserIntent` OVERRIDES the preset field-wise; preset-only fields survive", async () => {
    const { args } = baseArgs({
      intent: { temperature: 1.4 } satisfies UserIntent,
      assembleContext: ctxOf({ promptConfig: presetParams({ temperature: 0.7, topP: 0.9 }) }),
    });
    const result = await runTurnPipeline(args);
    expect(result.request.intent.temperature).toBe(1.4); // per-turn wins
    expect(result.request.intent.topP).toBe(0.9); // preset-only survives
  });

  test("the stop set is the UNION of preset stop + per-turn stop + the host's custom stops, Set-deduped", async () => {
    const { args } = baseArgs({
      intent: { stop: ["B"] } satisfies UserIntent,
      extraStopSequences: ["A", "C"],
      assembleContext: ctxOf({ promptConfig: presetParams({ stop: ["A"] }) }),
    });
    const result = await runTurnPipeline(args);
    // preset stop first, then per-turn, then the host's — deduped ("A" appears in preset + extras).
    expect(result.request.intent.stop).toEqual(["A", "B", "C"]);
  });

  test("the preset `advanced` block merges field-wise — a per-turn sub-field overrides, siblings survive", async () => {
    const { args } = baseArgs({
      intent: { advanced: { roleHandling: "none" } } satisfies UserIntent,
      assembleContext: ctxOf({ promptConfig: presetParams({ advanced: { roleHandling: "strict", squashSystemMessages: true } }) }),
    });
    const result = await runTurnPipeline(args);
    expect(result.request.intent.advanced?.roleHandling).toBe("none"); // per-turn wins
    expect(result.request.intent.advanced?.squashSystemMessages).toBe(true); // preset sibling survives
  });

  test("the preset's `customParameters` blob reaches the wire request", async () => {
    const customParameters = { provider: { order: ["deepinfra"] }, mirostat: 2 };
    const { args } = baseArgs({
      assembleContext: ctxOf({ promptConfig: { ...DEFAULT_PROMPT_CONFIG, customParameters } }),
    });
    const result = await runTurnPipeline(args);
    expect(result.request.customParameters).toEqual(customParameters);
  });

  test("a DEFAULT preset with an untouched `params` folds only the materialized maxOutputTokens (no customParameters)", async () => {
    const intent: UserIntent = { temperature: 0.8 };
    const result = await runTurnPipeline(baseArgs({ intent }).args);
    // DEFAULT_PROMPT_CONFIG.params is `{}` and carries no customParameters ⇒ the fold is a no-op EXCEPT the
    // single-source maxOutputTokens materialization (the caller's fields survive verbatim), and the request
    // carries no customParameters field.
    expect(result.request.intent).toEqual({ temperature: 0.8, maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS });
    expect(result.request.customParameters).toBeUndefined();
  });
});

// ── F4: the wire NAME-STAMP axis (SHAPE's authorName) is distinct from the {{user}} MACRO axis above — it
// must ALSO derive from the row's OWN personaId, not the current active persona (else multi-human rooms
// misattribute + "default" disambiguation is dead). Production now supplies the per-row name the unit
// (names.test.ts) previously hand-fed.
describe("runTurnPipeline — the wire name-stamp axis (F4)", () => {
  test("completion mode stamps each user row's wire `name` from ITS OWN personaId, not the active persona", async () => {
    // Active persona is Nate; the row is authored under Mara (a since-switched persona). The wire `name` must
    // be Mara — the row's own author — not the current active (which would misattribute Mara's line to Nate).
    const { args } = baseArgs({
      assembleContext: ctxOf({
        promptConfig: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "completion" },
      }),
      canon: [userRowWithPersona("hi there", MARA)],
      historyMacroNames: macroNamesOf([], [{ id: MARA, name: "Mara" }]),
    });
    const result = await runTurnPipeline(args);
    const named = result.request.history.find((m) => m.name !== undefined);
    expect(named?.name).toBe("Mara");
  });

  test('"default" mode prefixes a user row authored under a since-switched persona (disambiguation is now LIVE)', async () => {
    // author (Mara) ≠ the active persona (Nate) → "default" prefixes the row. Before F4 every user row was
    // stamped with the active persona, so author always equalled speakers.user and this NEVER fired.
    const { args } = baseArgs({
      canon: [userRowWithPersona("hi there", MARA)],
      historyMacroNames: macroNamesOf([], [{ id: MARA, name: "Mara" }]),
    });
    const result = await runTurnPipeline(args);
    expect(historyText(result.request)).toContain("Mara: hi there");
  });

  test("a null-stamp user row still falls back to the active persona (byte-identical to pre-F4)", async () => {
    const { args } = baseArgs({
      assembleContext: ctxOf({
        promptConfig: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "completion" },
      }),
      canon: [userRow("u1")],
    });
    const result = await runTurnPipeline(args);
    expect(result.request.history.find((m) => m.name !== undefined)?.name).toBe("Nate");
  });
});

// ── task #59 S2: the two persona axes stay distinct WITHIN one real pipeline call (BUILD's card-derived
// section vs SHAPE's history-row resolution) — not just as separate unit fixtures on assemble.ts/macros.ts.
describe("runTurnPipeline — persona axes stay distinct (card pin + history anchor vs active)", () => {
  test("a CARD section's {{user}} AND a null-stamp history row's {{user}} both resolve to the PINNED anchor, never the active persona", async () => {
    // The card's own systemPrompt overrides the (empty-by-default) main_prompt marker — a CARD-derived
    // section (assemble.ts's dual-persona rule: CARD sections bind {{user}} to ctx.pinnedPersona, the FROZEN
    // anchor). Ruling A (Chat-Macro-Resolution.md §2/§4): the canon row's {{user}} has a NULL personaId
    // stamp, so it ALSO falls back to the chat ANCHOR (a chat invariant) — never ctx.activePersona (Zara),
    // which drives only prompt-config sections + the triggering turn and must appear NOWHERE here.
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
    // SHAPE half: the null-stamp history row ALSO resolved {{user}} against the anchor (ruling A), never active.
    expect(historyText(result.request)).toContain("Nyx nods");
    expect(historyText(result.request)).not.toContain("Zara nods");
  });
});

// ── WAVE MU: the per-turn user-macro registry reaches BUILD (buildPrompt) through the pipeline ──────────
describe("runTurnPipeline — user-macro registry threading (WAVE MU)", () => {
  /** A preset with a user macro `{{mood}}` referenced from an enabled literal SYSTEM section. */
  const moodConfig: PromptConfig = {
    ...DEFAULT_PROMPT_CONFIG,
    userMacros: [{ name: "mood", description: "tone", args: [], body: "grim", strict: false, inputs: [] }],
    sections: [
      { type: "literal", id: "mood-line", name: "mood", role: "system", content: "Tone: {{mood}}.", enabled: true },
      ...DEFAULT_PROMPT_CONFIG.sections,
    ],
  };

  test("a threaded macroRegistry renders the user macro in BUILD; absent ⇒ byte-identical (the token passes through)", async () => {
    const turn = buildTurnUserMacros({ defs: moodConfig.userMacros, sourceId: "preset-1", values: {}, prng: () => 0 });
    if (turn === null) {
      throw new Error("expected a built registry");
    }
    const withReg = await runTurnPipeline(baseArgs({ assembleContext: ctxOf({ promptConfig: moodConfig }), macroRegistry: turn.registry }).args);
    // The registry reached `buildPrompt` → the macro resolved into the assembled static half.
    expect(withReg.request.prompt.static).toContain("Tone: grim.");

    // Absent registry: the pipeline's `globalMacroRegistry` default leaves the unknown user macro VERBATIM
    // (the byte-identical regression pin — no user-macro turn is unaffected).
    const without = await runTurnPipeline(baseArgs({ assembleContext: ctxOf({ promptConfig: moodConfig }) }).args);
    expect(without.request.prompt.static).toContain("Tone: {{mood}}.");
    expect(without.request.prompt.static).not.toContain("Tone: grim.");
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
function script(id: string, find: string, replace: string, placement: "AI_OUTPUT" | "REASONING"): RegexScript {
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

  test("F9: a watchdog trip is OBSERVABLE — the swallowed throw is logged with the placement + pattern", async () => {
    // Fail-open (content unchanged) is by design; F9 adds the missing OBSERVABILITY — the D53 watchdog's
    // deliberate throw must reach the operator log, not the kit executor's `onScriptFailure?.()` no-op.
    const warnSpy = vi.spyOn(getLog(), "warn").mockImplementation(() => undefined);
    try {
      const { args } = baseArgs({
        applyRegexReplace: () => {
          throw new Error("timed out");
        },
        runChatTurn: finalTurn("Hello"),
        assembleContext: ctxOf({
          hostTierRegexScripts: [script("evil", "Hello", "X", "AI_OUTPUT")],
        }),
      });
      await runTurnPipeline(args);
      expect(warnSpy).toHaveBeenCalled();
      const [payload] = warnSpy.mock.calls[0] ?? [];
      expect(payload).toMatchObject({ placement: "AI_OUTPUT", findRegex: "Hello" });
    } finally {
      warnSpy.mockRestore();
    }
  });
});

describe("runTurnPipeline — RECEIVE per-speaker canon clean (F1)", () => {
  const groupCtx = (): AssembleContext =>
    ctxOf({
      character: { name: "Kai", description: "a rogue" },
      cast: [
        { name: "Kai", description: "a rogue" },
        { name: "Aria", description: "a knight" },
      ],
      castMembers: [
        { kind: "character", characterId: KAI },
        { kind: "character", characterId: ARIA },
      ],
    });
  const perSpeaker = {
    output: "per-speaker",
    cardScope: "merged",
    scopedTargetId: null,
    speakerName: "Kai",
    speakerRef: { kind: "character", characterId: KAI },
  } as const;

  test("a per-speaker turn that drifts into a castmate's line persists ONLY the own speaker's content", async () => {
    // The exact failure cleanPerSpeakerReply exists to fix: the model rolls Kai's turn on into Aria's line.
    const { args } = baseArgs({
      runChatTurn: finalTurn("I attack the goblin.\nAria: I cast a shield."),
      assembleContext: groupCtx(),
      shape: perSpeaker,
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("I attack the goblin.");
  });

  test("a per-speaker turn that echoes its OWN leading label has it stripped from canon", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("Kai: I attack the goblin."),
      assembleContext: groupCtx(),
      shape: perSpeaker,
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("I attack the goblin.");
  });

  test("a mid-word self-tag splice never persists to canon (the dumJFC word-boundary case)", async () => {
    // P1 corruption regression, fixture message_01kyctjmg6e4e88m0vg5dwr8cd (seq 5): a speakerTags group
    // turn trained the model to echo its own `Kai:` tag, and it spat one MID-WORD at a token boundary
    // (`dum` + `Kai: —` + `b`). The `^`-anchored leading strip can't reach it — RED before the inline scrub.
    const { args } = baseArgs({
      runChatTurn: finalTurn("ship the dumKai: —b version by Friday"),
      assembleContext: groupCtx(),
      shape: perSpeaker,
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("ship the dumb version by Friday");
    expect(result.content).not.toContain("Kai:");
  });

  test("merged/narrator output is NOT cleaned — foreign labels are the intended transcript", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("I attack the goblin.\nAria: I cast a shield."),
      assembleContext: groupCtx(),
      shape: { ...perSpeaker, output: "narrator", speakerName: "Kai & Aria" },
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("I attack the goblin.\nAria: I cast a shield.");
  });

  test("a legitimate single-speaker reply with no drift is untouched", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("I attack the goblin and take cover."),
      assembleContext: groupCtx(),
      shape: perSpeaker,
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("I attack the goblin and take cover.");
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
// A REAL resolved descriptor for a tool-capable OpenRouter model (§U0 checkpoint: the loop's capability
// gate keys on the real synthesis output, not a synthetic literal). The OR arm sets `tools.parallel:true`;
// the loop gate reads only the PRESENCE of `capability.tools`, so the parallel flag is inert here.
const TOOL_CAPABILITY: ModelCapability = resolveModelCapability("openai/gpt-5", "openrouter", "chat-completions", {
  orEntry: { contextLength: 200_000, supportedParameters: ["tools"], inputModalities: ["text"] },
});

const TOOL_CONNECTION: ResolvedConnection = { ...CONNECTION, capability: TOOL_CAPABILITY };

/** A scripted role returning one chunk-set PER INVOCATION (depth k gets script[k]); captures requests. */
function scriptedDepths(scripts: readonly (readonly TurnStreamChunk[])[], sink: TurnRequest[]): RunChatTurnOp {
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

const toolFinal = (content: string, calls: readonly { id: string; name: string; args: string }[]): TurnStreamChunk => ({
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
    toAgentToolServer: () => Promise.resolve({ marker: "mcp-server" }),
    executeToolCalls: (_set, calls): Promise<ToolCallRecord[]> => {
      executed.push(calls.map((c) => c.name));
      return Promise.resolve(
        calls.map((c) => ({
          toolCallId: c.toolCallId,
          name: c.name,
          arguments: c.arguments,
          result: failWith === undefined ? JSON.stringify({ ok: c.name }) : JSON.stringify({ error: failWith }),
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
        [[toolFinal("The clock ticks... ", [{ id: "c1", name: "tick_clock", args: '{"m":30}' }])], [doneFinal("Half an hour passes.")]],
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
    expect(appended[0]?.content.some((p) => p.type === "tool-call" && p.name === "tick_clock")).toBe(true);
    expect(appended[1]?.content.some((p) => p.type === "tool-result" && p.toolCallId === "c1")).toBe(true);
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
      runChatTurn: scriptedDepths([[toolFinal("", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("I cannot do that right now.")]], requests),
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

// A structured-output payload the request-builder gate either keeps (when supported) or drops (when not).
const RESPONSE_FORMAT = { name: "narrative", schema: { type: "object", properties: {}, additionalProperties: false } } as const;
const STRUCTURED_CONNECTION: ResolvedConnection = {
  ...CONNECTION,
  capability: { ...CAPABILITY, output: { ...CAPABILITY.output, structured: true } } as unknown as ModelCapability,
};

describe("runTurnPipeline — the D79 structured-output gate (04 §7)", () => {
  test("responseFormat requested but capability.output.structured absent → dropped + flagged; free-text proceeds", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      responseFormat: RESPONSE_FORMAT,
      runChatTurn: scriptedDepths([[doneFinal("plain reply")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(requests).toHaveLength(1);
    expect(requests[0]).not.toHaveProperty("responseFormat");
    expect(result.structuredOutputUnsupported).toBe(true);
    // The turn still produced its free-text reply (interactive-axis degrade, not a dead turn).
    expect(result.content).toBe("plain reply");
  });

  test("responseFormat requested + capability.output.structured true → rides the request, not flagged", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      connection: STRUCTURED_CONNECTION,
      responseFormat: RESPONSE_FORMAT,
      runChatTurn: scriptedDepths([[doneFinal("ok")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(requests[0]?.responseFormat).toEqual(RESPONSE_FORMAT);
    expect(result.structuredOutputUnsupported).toBe(false);
  });

  test("no responseFormat requested → byte-identical no-op (no field, not flagged)", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({ runChatTurn: scriptedDepths([[doneFinal("hi")]], requests) });
    const result = await runTurnPipeline(args);
    expect(requests[0]).not.toHaveProperty("responseFormat");
    expect(result.structuredOutputUnsupported).toBe(false);
  });
});

describe("runTurnPipeline — the STATEFUL (agent-sdk) tool channel (MCP toolServer)", () => {
  const agentConnection: ResolvedConnection = { ...TOOL_CONNECTION, api: "agent-sdk" };

  test("tools mount as the MCP toolServer (no wire tools[]); records ride the onRecord side-channel", async () => {
    const requests: TurnRequest[] = [];
    let onRecord: ((r: ToolCallRecord) => void) | undefined;
    const server = { marker: "mcp-server" };
    const ops: ChatToolOps = {
      ...fakeToolOps([]),
      toAgentToolServer: (_set, _frame, cb): Promise<unknown> => {
        onRecord = cb;
        return Promise.resolve(server);
      },
    };
    const { args } = baseArgs({
      connection: agentConnection,
      tools: ops,
      attachedToolNames: ["tick_clock"],
      toolRecurseLimit: 3,
      runChatTurn: (req): AsyncIterable<TurnStreamChunk> => {
        requests.push(req);
        // Simulate the SDK invoking a wrapped MCP handler mid-turn: the record lands via the side-channel.
        onRecord?.({ toolCallId: "mcp_tick_clock_1", name: "tick_clock", arguments: "{}", result: "{}", isError: false, durationMs: 1 });
        return scriptedTurn([doneFinal("done")])(req);
      },
    });
    const result = await runTurnPipeline(args);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.agentToolServer).toBe(server);
    expect(requests[0]?.agentToolTurnLimit).toBe(3);
    expect(requests[0]).not.toHaveProperty("tools");
    expect(requests[0]).not.toHaveProperty("toolChoice");
    expect(result.toolRecords.map((r) => r.name)).toEqual(["tick_clock"]);
    expect(result.toolsUnsupported).toBe(false);
    expect(result.content).toBe("done");
  });

  test("array wires are untouched: chat-completions gets wire tools, never a toolServer", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps([]),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths([[doneFinal("x")]], requests),
    });
    await runTurnPipeline(args);
    expect(requests[0]?.tools?.map((t) => t.name)).toEqual(["tick_clock"]);
    expect(requests[0]).not.toHaveProperty("agentToolServer");
  });
});

// ── The parity-plus §3.5 WIRE plane (hidden verbatim · card stub · M2 keep-last-X · §3.9 ordering) ──────
// These pins hold for ALL six connection modes by construction: they assert on `request.history`
// (`TurnMessage[]`), the ONE seam every backend consumes — the collapse happens BEFORE any per-backend
// wire vocabulary exists (`[[per-backend-wire-vocab-differs]]`: the COLLAPSE is wire-agnostic).

describe("runTurnPipeline — the §3 content-class wire plane", () => {
  const lieTag = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';
  const cardFence = ':::card title="Terminal"\n<div style="color:red">multi-KB html blob</div>\n:::';

  test("a hidden tag rides the wire VERBATIM ({wire: full} — the model keeps its own lie), byte-identical single text part", async () => {
    const body = `He nods. ${lieTag} "Nothing," he says.`;
    const { args } = baseArgs({ canon: [userRow(body)] });
    const result = await runTurnPipeline(args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: body }]);
  });

  test("a card collapses to the deterministic stub ({wire: stub}) — zero html bytes on the wire, same bytes across assemblies", async () => {
    const body = `Look at this:\n${cardFence}\ndone.`;
    const first = await runTurnPipeline(baseArgs({ canon: [userRow(body)] }).args);
    const second = await runTurnPipeline(baseArgs({ canon: [userRow(body)] }).args);
    const part = first.request.history.at(-1)?.content;
    expect(part).toEqual([{ type: "text", text: "Look at this:\n[card: Terminal]\ndone." }]);
    expect(JSON.stringify(first.request.history)).not.toContain("multi-KB");
    // Cache-stability: the collapse is byte-deterministic across assemblies (§3.7).
    expect(second.request.history).toEqual(first.request.history);
  });

  test("M2 keep-last-X: X=0 stubs every card; X=1 keeps only the NEWEST full; X=2 the newest two (counted from the tail)", async () => {
    const cardBody = (n: number): string => `:::card title="c${n}"\n<p>blob${n}</p>\n:::`;
    // Alternating roles so SHAPE keeps three separate rows (same-role runs squash into one body).
    const canon = [userRow(cardBody(1)), rowOf("assistant", cardBody(2)), userRow(cardBody(3))];
    const textsOf = (history: readonly TurnRequest["history"][number][]): string[] =>
      history.map((m) => m.content.map((p) => (p.type === "text" ? p.text : "")).join(""));

    const x0 = await runTurnPipeline(baseArgs({ canon }).args);
    expect(textsOf(x0.request.history)).toEqual(["[card: c1]", "[card: c2]", "[card: c3]"]);

    const x1 = await runTurnPipeline(baseArgs({ canon, cardKeepLastX: 1 }).args);
    expect(textsOf(x1.request.history)).toEqual(["[card: c1]", "[card: c2]", cardBody(3)]);

    const x2 = await runTurnPipeline(baseArgs({ canon, cardKeepLastX: 2 }).args);
    expect(textsOf(x2.request.history)).toEqual(["[card: c1]", cardBody(2), cardBody(3)]);
  });

  test("an unknown-directive and a choices fence ride VERBATIM ({wire: full} — the transcript is honest)", async () => {
    const body = ':::teleport to="crypt"\nnow\n:::\n\n:::choices\n1. one\n2. two\n:::';
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(body)] }).args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: body }]);
  });

  test("squash parity (§3.7): a `\\n\\n`-joined multi-body string tokenizes whole — the tag/fence survive the join", async () => {
    // SHAPE's squash joins bodies with `\n\n` BEFORE tokenization; emulate the joined body directly.
    const joined = `first reply ${lieTag}\n\n${cardFence}`;
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(joined)] }).args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: `first reply ${lieTag}\n\n[card: Terminal]` }]);
  });

  test("§3.9 ordering pin: a prompt-side regex runs on the FULL card bytes upstream; the stub replaces them at the wire seam below it", async () => {
    // The string-body regex passes (AI_OUTPUT etc.) run in assembly, UPSTREAM of toContentParts — a
    // promptOnly script sees the full card body (its contract), and the stub is the wire-transport
    // collapse below it. Emulate the upstream pass exactly as assembly composes it.
    const body = `alpha prose\n${cardFence}`;
    const processed = executeRegexScripts({
      text: body,
      scripts: [
        regexScriptSchema.parse({
          id: "rs_1",
          name: "s",
          enabled: true,
          placement: ["AI_OUTPUT"],
          findRegex: "alpha",
          replaceString: "beta",
          promptOnly: true,
        }),
      ],
      placement: "AI_OUTPUT",
      ctx: { char: "Aria", user: "Nate", persona: "", scenario: "", env: {} },
    });
    // The regex saw + rewrote the non-card text; the card bytes were visible to it (no pre-collapse).
    expect(processed).toContain("beta prose");
    expect(processed).toContain("multi-KB");
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(processed)] }).args);
    // Downstream, the wire stubs the card and keeps the regex's effect on the surrounding prose.
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: "beta prose\n[card: Terminal]" }]);
  });
});
