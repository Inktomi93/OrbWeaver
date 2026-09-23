// engine/pipeline — the per-turn execution pipeline: assemble→shape→fit→request→reduce. Pins the stream
// reduce (deltas → final text + economics), the shaped request, the §8 fit, and ctx immutability.

import type { AssembleContext, ChatDeltaEvent, ChatInjection, ChatReasoningPart, MessageView, ToolCallRecord } from "@orb/contracts/chat";
import { CONTENT_CLASS_POLICY, contentSpansToBlocks } from "@orb/contracts/chat";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_PROMPT_CONFIG, pipelineStepKey, RECEIVE_POST_PROCESS_ORDER, REPLY_LANE_STEPS } from "@orb/contracts/preset";
import type { RegexScriptRow } from "@orb/contracts/regex";
import { regexScriptSchema } from "@orb/contracts/regex";
import type { ChatToolExecution, Resolved, ToolCallInput } from "@orb/inference";
import { rowIndexAtCacheDepth } from "@orb/inference";
import type { ContentImageRef, ContentSpan } from "@orb/kit/content";
import { tokenizeContent } from "@orb/kit/content";
import type { AssetId, CharacterId, ChatId, ChatTurnId, MessageId, ModelId, PersonaId, UserId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { executeRegexScripts } from "@orb/kit/regex";
import { getLog } from "@orb/server/foundation/observability";
import { describe, vi } from "vitest";
import { HISTORY_TRIM_CHUNK_FRACTION, historyTurnTokens } from "../../../../../packages/server/src/domain/chat/assembly/history-budget.ts";
import { BEFORE_HISTORY_DEPTH } from "../../../../../packages/server/src/domain/chat/assembly/injections.ts";
import { buildTurnUserMacros } from "../../../../../packages/server/src/domain/chat/assembly/user-macros.ts";
import type { ChatToolOps, RunChatTurnOp } from "../../../../../packages/server/src/domain/chat/contract/context.ts";
import { CHAT_OP_CODES, ChatOperationError } from "../../../../../packages/server/src/domain/chat/contract/errors.ts";
import type { HistoryMacroNames, TurnMessage, TurnRequest, TurnStreamChunk } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { runTurnPipeline } from "../../../../../packages/server/src/domain/chat/engine/pipeline.ts";
// The span→wire-part dispatch moved to `substrate/wire-history.ts` with the rest of CONVERT (#1540): the read
// verb's previews must price the SAME converted rows this pipeline prices, so the conversion is no longer an
// engine-private step. The behaviour under test is unchanged — the pipeline still runs it, in the same place.
import { __spanConvertsToNothingForTest, __spanToWirePartForTest } from "../../../../../packages/server/src/domain/chat/substrate/wire-history.ts";
import { FROZEN_AT_MS } from "../../../../support/clock.ts";
import { makeCapability, makeGenerationCapability, makeResolved } from "../../../../support/factories/resolved-connection.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import { testModelId } from "../../../../support/inference-identities.ts";
import { wireSchema } from "../../../../support/wire-ready.ts";

const CAPABILITY: GenerationCapability = makeGenerationCapability({
  output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] },
  context: { window: 200_000 },
});

const CONNECTION: Resolved<"chat"> = makeResolved({ api: "chat-completions", model: castId<ModelId>("test-model"), capability: makeCapability(CAPABILITY) });

// The fixture's ONE human — the turn's trigger AND the author of every user row below, which is what a real
// send produces (`persistUserMessage` stamps `authorUserId: principal.userId` on every user row; the import
// path stamps the owner). SHAPE's null-stamp guard reads exactly that pair, so a fixture that omits either
// side models a room nobody wrote in and would floor rows the real turn attributes.
const FIXTURE_HUMAN = castId<UserId>("user_fixture_human");

function ctxOf(over: Partial<AssembleContext> = {}): AssembleContext {
  return {
    character: { name: "Aria", description: "a bold knight" },
    promptConfig: DEFAULT_PROMPT_CONFIG,
    activePersona: { name: "Nate", description: "the user" },
    triggerUserId: FIXTURE_HUMAN,
    recentMessages: [],
    ...over,
  };
}

// CANON ROWS CARRY AN ID. `shape.ts` stamps `messageId: m.id` on every canon row it emits (both the
// assistant and the user/narrator branch), and the wire seam now reads that presence to tell stored content
// from content the assembly AUTHORED this turn (a spliced injection / the synthetic regen turn are id-less
// by construction — see `resolveFullCards`). A fixture without an id therefore models a synthetic row, not a
// canon one, and would silently opt every card in these tests out of the keep-last-X window.
let nextRowId = 0;
const rowOf = (role: "user" | "assistant", content: string): MessageView => {
  nextRowId += 1;
  // Slim MessageView double — runTurnPipeline reads only id/role/kind/content/excludedFromPrompt/
  // characterId/personaId/authorUserId off a canon row (see file header).
  // @orb-waive no-test-fabrication(unknown): same slim-double judgment as seqRow above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return {
    id: `message_fixture_${nextRowId}`,
    role,
    // A real row always DECLARES its purpose (`messages.kind`, NOT NULL default `standard`); a double that
    // omits it models a row the read seam cannot produce (D129).
    kind: "standard",
    content,
    excludedFromPrompt: false,
    characterId: null,
    personaId: null,
    authorUserId: role === "user" ? FIXTURE_HUMAN : null,
  } as unknown as MessageView;
};

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
    // The turn clock — frozen by default (nothing but the reasoning-window measurement reads it, and a
    // frozen clock is the honest "no time passed" for every other case). The #184 tests inject a stepping one.
    now: () => FROZEN_AT_MS,
    // Default = the native replace (no node:vm) — a RECEIVE-watchdog test overrides with a throwing fake.
    applyRegexReplace: (text, regex, replacer) => text.replace(regex, replacer),
    // §6.7: the fence's origin set. Empty ⇒ CLOSED — no assistant-row asset is model-visible, which is what
    // every test in this file assumes; the relaxation is proven at the substrate seam instead.
    loadInlineReplyAssetIds: () => Promise.resolve(new Map<MessageId, ReadonlySet<AssetId>>()),
    runChatTurn: scriptedTurn([
      { kind: "text", text: "Hel" },
      { kind: "text", text: "lo" },
      {
        kind: "final",
        economics: { content: "Hello", tokensIn: 3, tokensOut: 1, model: testModelId("test-model") },
      },
    ]),
    resolveImageUrl: (ref) => Promise.resolve({ url: ref.kind === "asset" ? `https://cas.test/${ref.assetId}` : ref.url, media: "image" as const }),
    // §8.8: the `conversation` carry source. Default EMPTY and THROWS if reached — every test below runs
    // the `off`/`tool-chain` rungs, where the pipeline must not perform this read at all.
    loadReasoningParts: (): Promise<ReadonlyMap<MessageId, readonly ChatReasoningPart[]>> =>
      Promise.reject(new Error("loadReasoningParts must not be reached")),
    assembleContext: ctxOf(),
    canon: [userRow("u1")],
    connection: CONNECTION,
    intent: {} satisfies UserIntent,
    kind: "send",
    // D17: the engine-derived consent verdict the pipeline stamps onto the built TurnRequest (a self-triggered
    // owner turn here — inert for the vllm CONNECTION, but the field is non-optional on the args).

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
      membership: null,
      turnId: castId<ChatTurnId>("chat_turn_a"),
    },
    ...over,
  };
  return { args, deltas };
}

type PipelineResult = Awaited<ReturnType<typeof runTurnPipeline>>;

/** The history rows a prompt cache writes on this turn: every row up to the deepest breakpoint the runner places.
 *  The runner pins depth d and d+2 (`computeCacheBreakpointPlacements`); the deeper one drops off a short history. */
function cachedHead(result: PipelineResult): TurnRequest["history"] {
  const depth = result.request.cacheBreakpointFromEnd;
  if (depth === null) {
    return [];
  }
  const rows = result.request.history;
  const at = rowIndexAtCacheDepth(rows, depth + 2) ?? rowIndexAtCacheDepth(rows, depth);
  return rows.slice(0, (at ?? -1) + 1);
}

/** Anthropic's cache is an exact prefix: turn N+1 reads turn N's history cache only when every row up to N's
 *  deepest breakpoint repeats byte for byte, so each cached block still ends where it ended. */
function readsPriorCache(prior: PipelineResult, next: PipelineResult): boolean {
  const head = cachedHead(prior);
  return head.length > 0 && JSON.stringify(next.request.history.slice(0, head.length)) === JSON.stringify(head);
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

  // ── THE REASONING WINDOW (#184) ────────────────────────────────────────────────────────────────
  // `message_variants.metadata.$.reasoning_duration` had ONE producer — the SillyTavern import — while three
  // live readers rolled it into `reasoning_ms` on three stats tables. Every turn this app generated itself
  // was worth 0ms, so `owner_stats.reasoning_ms` was pure archaeology. Nothing on the wire reports the
  // figure; the engine measures it. The clock is INJECTED and the script advances it, so these pin the
  // window's SEMANTICS, not a wall-clock race.

  /** A stepping clock + a script that advances it BETWEEN chunks — a model that thinks for `ms`, then talks. */
  function steppingScript(chunks: readonly (TurnStreamChunk | { readonly advanceMs: number })[]): {
    readonly now: () => number;
    readonly runChatTurn: RunChatTurnOp;
  } {
    let t = FROZEN_AT_MS;
    return {
      now: (): number => t,
      runChatTurn: () =>
        (async function* (): AsyncGenerator<TurnStreamChunk> {
          await Promise.resolve();
          for (const c of chunks) {
            if ("advanceMs" in c) {
              t += c.advanceMs;
            } else {
              yield c;
            }
          }
        })(),
    };
  }

  test("measures the reasoning window: first reasoning delta → the first answer token", async () => {
    const thinker = steppingScript([
      { kind: "reasoning", text: "weighing" },
      { advanceMs: 400 },
      { kind: "reasoning", text: " options" },
      { advanceMs: 350 },
      { kind: "text", text: "answer" },
      // Time spent WRITING the answer is not thinking — it must not extend the window.
      { advanceMs: 5000 },
      { kind: "text", text: " continues" },
    ]);
    const { args } = baseArgs(thinker);
    const result = await runTurnPipeline(args);
    expect(result.reasoningMs).toBe(750);
  });

  test("a turn that never reasons has NO window — null, never a fabricated 0", async () => {
    const thinker = steppingScript([{ kind: "text", text: "just prose" }, { advanceMs: 900 }, { kind: "text", text: " more" }]);
    const { args } = baseArgs(thinker);
    expect((await runTurnPipeline(args)).reasoningMs).toBeNull();
  });

  test("reasoning that never turns to prose still measures its own span", async () => {
    const thinker = steppingScript([{ kind: "reasoning", text: "a" }, { advanceMs: 120 }, { kind: "reasoning", text: "b" }]);
    const { args } = baseArgs(thinker);
    expect((await runTurnPipeline(args)).reasoningMs).toBe(120);
  });

  // A backend that reports reasoning ONLY on the terminal chunk (no deltas) gives the engine no window to
  // watch. Null is the honest answer there — the alternative is inventing a duration from the turn's total.
  test("reasoning that arrives only in the final chunk yields no window", async () => {
    const { args } = baseArgs({
      runChatTurn: scriptedTurn([{ kind: "final", economics: { content: "done", reasoning: "hidden thinking" } }]),
    });
    const result = await runTurnPipeline(args);
    expect(result.reasoning).toBe("hidden thinking");
    expect(result.reasoningMs).toBeNull();
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

describe("runTurnPipeline — the D50 assembled_dynamic PromptTransform point", () => {
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
        return Promise.resolve({ aborted: false, text: `${draft}[DYN]` });
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
    const withOp = await runTurnPipeline(baseArgs({ applyPromptTransforms: (_p, _c, draft) => Promise.resolve({ aborted: false, text: draft }) }).args);
    const without = await runTurnPipeline(baseArgs().args);
    expect(withOp.request.prompt.dynamic).toBe(without.request.prompt.dynamic);
    expect(withOp.request.prompt.static).toBe(without.request.prompt.static);
  });

  test("an ABORT outcome ends the generation as the CODED chat refusal — typed, never a swallowed skip", async () => {
    // The owner's U6 test ("a transform aborts a generation typed"), at the BUILD-side call site. The D53 skip
    // is the opposite outcome and is pinned in the registry's own suite: a slow/broken transform leaves the
    // draft alone and the turn proceeds, while this one stops it and names why.
    const { args } = baseArgs({
      applyPromptTransforms: () => Promise.resolve({ aborted: true, transformId: "plugin:oracle:veto:0", reason: "the scene is closed" }),
    });
    const failure = await runTurnPipeline(args).then(
      () => null,
      (err: unknown) => err,
    );
    expect(failure).toBeInstanceOf(ChatOperationError);
    expect((failure as ChatOperationError).code).toBe(CHAT_OP_CODES.promptTransformAborted);
    // The transform's own words reach the author — that is what makes a refusal actionable.
    expect((failure as ChatOperationError).message).toContain("the scene is closed");
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
    //
    // The out-of-band field requires a NON-merging floor. Under a merging strategy (the unset floor clamps to
    // `strict`) the speaker is inlined instead, because a surviving `name` blocks `squashSameRole` and hands
    // a strict provider the adjacent same-role pair it rejects — and blocks two humans' back-to-back turns
    // from merging at all. Both arms are pinned in shape.test.ts's matrix.
    const { args } = baseArgs({
      connection: {
        ...CONNECTION,
        capability: makeCapability({
          ...CAPABILITY,
          turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "none", explicitPromptCache: false },
        }),
      },
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
      capability: makeCapability(makeGenerationCapability({ ...CAPABILITY, input: ["text", "image"] })),
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

  // ── #317: the VIDEO twin of the D45 rule — same seam, gated by `input.video`, kind decided by the resolver.
  const resolveAsVideo = (ref: ContentImageRef): Promise<{ url: string; media: "video" }> =>
    Promise.resolve({ url: ref.kind === "asset" ? `https://cas.test/${ref.assetId}` : ref.url, media: "video" });

  test("#317: a video-capable model receives a VIDEO part for a video attachment", async () => {
    const videoCapable = {
      ...CONNECTION,
      capability: makeCapability(
        makeGenerationCapability({
          input: ["text", "image", "video"],
          output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] },
          context: { window: 200_000 },
        }),
      ),
    };
    const { args } = baseArgs({
      connection: videoCapable,
      resolveImageUrl: resolveAsVideo,
      canon: [userRow("watch ![a clip](asset:ast_9) now")],
    });
    const result = await runTurnPipeline(args);
    expect(result.videoDropped).toBe(false);
    expect(result.request.history.at(-1)?.content).toEqual([
      { type: "text", text: "watch " },
      { type: "video", url: "https://cas.test/ast_9" },
      { type: "text", text: " now" },
    ]);
  });

  test("#317: a vision-only model (no input.video) DROPS the video part + flags videoDropped — never junk on the wire", async () => {
    const visionOnly = {
      ...CONNECTION,
      capability: makeCapability(
        makeGenerationCapability({
          input: ["text", "image"],
          output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] },
          context: { window: 200_000 },
        }),
      ),
    };
    const { args } = baseArgs({
      connection: visionOnly,
      resolveImageUrl: resolveAsVideo,
      canon: [userRow("watch ![a clip](asset:ast_9) now")],
    });
    const result = await runTurnPipeline(args);
    expect(result.videoDropped).toBe(true);
    expect(result.imageDropped).toBe(false);
    expect(result.request.history.at(-1)?.content).toEqual([
      { type: "text", text: "watch " },
      { type: "text", text: " now" },
    ]);
  });

  test("#317: a video-only user row whose part drops keeps the honest `[video: alt]` placeholder", async () => {
    const visionOnly = {
      ...CONNECTION,
      capability: makeCapability(
        makeGenerationCapability({
          input: ["text", "image"],
          output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] },
          context: { window: 200_000 },
        }),
      ),
    };
    const { args } = baseArgs({
      connection: visionOnly,
      resolveImageUrl: resolveAsVideo,
      canon: [rowOf("assistant", "prev reply"), userRow("![a clip](asset:ast_9)")],
    });
    const result = await runTurnPipeline(args);
    const tail = result.request.history.at(-1);
    expect(tail?.content).toEqual([{ type: "text", text: "[video: a clip]" }]);
  });

  test("#317: a media-blind model (no input at all) drops WITHOUT resolving — no asset I/O per turn", async () => {
    const resolver = vi.fn(resolveAsVideo);
    const { args } = baseArgs({
      resolveImageUrl: resolver,
      canon: [userRow("look ![a cat](asset:ast_9) here")],
    });
    const result = await runTurnPipeline(args);
    expect(result.imageDropped).toBe(true);
    expect(resolver).not.toHaveBeenCalled();
  });

  test("the §8 fit drops oldest turns under a tiny window (keeps the newest)", async () => {
    // Alternate roles so squash doesn't collapse the history into one turn (then the fit has rows to drop).
    const longCanon = Array.from({ length: 12 }, (_, i) => rowOf(i % 2 === 0 ? "user" : "assistant", `turn ${i} with several words to spend tokens here`));
    const tiny = makeGenerationCapability({
      ...CAPABILITY,
      context: { window: 80 },
    });
    const { args } = baseArgs({
      canon: longCanon,
      connection: { ...CONNECTION, capability: makeCapability(tiny) },
    });
    const result = await runTurnPipeline(args);
    expect(result.droppedCount).toBeGreaterThan(0);
  });

  const marker: ChatInjection = { position: "in_chat", depth: BEFORE_HISTORY_DEPTH, role: "user", content: "[Start a new chat]", origin: "new-chat-marker" };
  const text = (m: TurnRequest["history"][number] | undefined): string => (m?.content ?? []).map((p) => (p.type === "text" ? p.text : "")).join("");
  const slottedWithin = (window: number): typeof CONNECTION => ({
    ...CONNECTION,
    capability: makeCapability(
      makeGenerationCapability({
        ...CAPABILITY,
        context: { window },
        turns: { assistantPrefill: false, midConversationSystem: true, historySystemRows: true, roleHandlingFloor: "slotted", explicitPromptCache: true },
      }),
    ),
  });

  // The new-chat marker marks the start of whatever history is delivered. It is the oldest row, so the fit
  // trimmed it first and the delivered history opened mid-conversation with no marker.
  describe("the new-chat marker survives the window fit", () => {
    const slotted = slottedWithin(400);

    test("an over-budget chat still opens on the marker, and the breakpoint is placed", async () => {
      // Greeting-first, ends on a user row: the first kept row after the trim is an assistant row.
      const canon = Array.from({ length: 21 }, (_, i) => rowOf(i % 2 === 0 ? "assistant" : "user", `turn ${i} with several words to spend a few tokens`));
      const result = await runTurnPipeline(baseArgs({ canon, connection: slotted, assembleContext: ctxOf({ chatInjections: [marker] }) }).args);
      expect(result.droppedCount).toBeGreaterThan(0);
      expect(result.request.history[0]?.role).toBe("user");
      expect(text(result.request.history[0])).toBe("[Start a new chat]");
      expect(result.request.history.filter((m) => text(m).includes("[Start a new chat]"))).toHaveLength(1);
      expect(typeof result.request.cacheBreakpointFromEnd).toBe("number");
    });

    test("when the first kept row is a user row, the marker opens it", async () => {
      const canon = Array.from({ length: 21 }, (_, i) => rowOf(i % 2 === 0 ? "user" : "assistant", `turn ${i} with several words to spend a few tokens`));
      const result = await runTurnPipeline(baseArgs({ canon, connection: slotted, assembleContext: ctxOf({ chatInjections: [marker] }) }).args);
      expect(result.droppedCount).toBeGreaterThan(0);
      expect(result.request.history[0]?.role).toBe("user");
      // Merged into that row with SHAPE's squash separator, never a second user row above it.
      expect(text(result.request.history[0])).toMatch(/^\[Start a new chat\]\n\nturn \d+ /);
      expect(result.request.history.filter((m) => text(m).includes("[Start a new chat]"))).toHaveLength(1);
    });

    test("a depth-4 note on a 3-row chat lands below the marker, and the breakpoint is placed", async () => {
      const note: ChatInjection = { position: "in_chat", depth: 4, role: "system", content: "Author's note." };
      const canon = [rowOf("assistant", "greeting"), userRow("u1"), rowOf("assistant", "a1"), userRow("u2")];
      const result = await runTurnPipeline(
        baseArgs({ canon, connection: slottedWithin(200_000), assembleContext: ctxOf({ chatInjections: [note, marker] }) }).args,
      );
      expect(result.droppedCount).toBe(0);
      expect(text(result.request.history[0])).toBe("[Start a new chat]");
      expect(typeof result.request.cacheBreakpointFromEnd).toBe("number");
    });
  });

  // A chat at its context cap trims every turn. The cache is an exact prefix, so a head that moves every turn
  // leaves only the static block cached; the fit trims in chunks and holds the head until the next chunk.
  describe("a capped chat holds its trimmed head across turns", () => {
    const cap = 4000;
    const output = 128;
    const turns = 40;
    const first = 201;
    const filler = "several words that spend tokens on every single row here";
    const all = Array.from({ length: first + 2 * turns }, (_, i) => rowOf(i % 2 === 0 ? "user" : "assistant", `turn ${i} ${filler}`));
    const turnAt = (t: number, canon: readonly MessageView[] = all.slice(0, first + 2 * t)): Promise<PipelineResult> =>
      runTurnPipeline(
        baseArgs({
          canon: [...canon],
          connection: slottedWithin(200_000),
          intent: { maxContextTokens: cap, maxOutputTokens: output } satisfies UserIntent,
          assembleContext: ctxOf({ chatInjections: [marker] }),
        }).args,
      );

    test("the head bytes up to the deepest breakpoint repeat inside a chunk and move once per chunk, and the cap holds every turn", async () => {
      const results: PipelineResult[] = [];
      for (let t = 0; t <= turns; t += 1) {
        results.push(await turnAt(t));
      }
      const overCap = results.flatMap((result, t) =>
        result.droppedCount > 0 && result.fitUsedTokens <= cap && text(result.request.history[0]).startsWith("[Start a new chat]") ? [] : [t],
      );
      expect(overCap).toEqual([]);
      // The boundary stamp feeds the next turn's recall live-window cutoff and the managed-compaction coverage
      // point, so it must name the canon row the kept history opens on, on every turn, across each chunk move.
      const boundaryDrift = results.flatMap((result, t) => {
        const firstKept = all[result.droppedCount];
        const opening = result.request.history.find((m) => text(m) !== "[Start a new chat]");
        return result.contextBoundaryMessageId === firstKept?.id && text(opening).endsWith(firstKept.content) ? [] : [t];
      });
      expect(boundaryDrift).toEqual([]);
      const transitions = results.slice(1).map((next, i) => {
        const prior = results[i] ?? next;
        return { turn: i + 1, moved: prior.droppedCount !== next.droppedCount, readsPrior: readsPriorCache(prior, next) };
      });
      // A held head is read back from the cache; a moved head is not. Nothing else may break the prefix.
      expect(transitions.filter((step) => step.moved === step.readsPrior)).toEqual([]);
      // Each turn adds two rows; the head moves only when that growth crosses a chunk boundary.
      const chunk = Math.round(HISTORY_TRIM_CHUNK_FRACTION * (cap - output));
      const growth = turns * 2 * historyTurnTokens({ content: `turn ${first} ${filler}` });
      const moves = transitions.filter((step) => step.moved);
      expect(moves.length).toBeGreaterThan(0);
      expect(moves.length).toBeLessThanOrEqual(Math.ceil(growth / chunk));
    });

    test("a chat under its cap is left exactly as SHAPE delivered it", async () => {
      const result = await turnAt(0, all.slice(0, 5));
      expect(result.droppedCount).toBe(0);
      expect(result.request.cacheBreakpointFromEnd).toBe(1);
      expect(result.request.history).toEqual([
        { role: "user", content: [{ type: "text", text: `[Start a new chat]\n\nturn 0 ${filler}` }] },
        { role: "assistant", content: [{ type: "text", text: `turn 1 ${filler}` }] },
        { role: "user", content: [{ type: "text", text: `turn 2 ${filler}` }] },
        { role: "assistant", content: [{ type: "text", text: `turn 3 ${filler}` }] },
        { role: "user", content: [{ type: "text", text: `turn 4 ${filler}` }] },
      ]);
    });
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
    const mid = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 400 } });
    const result = await runTurnPipeline(baseArgs({ canon, connection: { ...CONNECTION, capability: makeCapability(mid) } }).args);
    expect(result.droppedCount).toBeGreaterThan(0);
    expect(result.droppedCount).toBeLessThan(11); // real rows survive → the boundary is a real id
    // The stamped boundary is the earliest KEPT id — canon index === droppedCount (drop the first N).
    expect(result.contextBoundaryMessageId).toBe(castId<MessageId>(`message_parity_${result.droppedCount}`));
  });
});

// ── The ATTACHMENT-ONLY image wire rule (owner ruling, ST parity) ────────────────────────────────────────
// A model-visible image part requires a DELIBERATE user attachment: an owned-CAS `asset:` ref on a
// user-authored row. Every other embedded image — an imported card's greeting picture (the Azarael bug: the
// card ends its greeting with `![](https://files.catbox.moe/….png)` and that rode a vision turn as a real
// image part), narrator/`/imagine` media, a pasted link — is DISPLAY-ONLY: it renders forever, and the wire
// gets a short marker instead of both the image part AND the raw URL bytes.
const VISION: Resolved<"chat"> = {
  ...CONNECTION,
  capability: makeCapability(
    makeGenerationCapability({ input: ["text", "image"], output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 200_000 } }),
  ),
};
/** The real Azarael card's greeting image target (external, empty alt) — the bug's exact shape. */
const CARD_IMAGE_URL = "https://files.catbox.moe/2dxdt9.png";
const imageParts = (req: TurnRequest): unknown[] => req.history.flatMap((h) => h.content).filter((p) => p.type === "image");

describe("runTurnPipeline — display-only images (the attachment-only wire rule)", () => {
  test("a character greeting's inline external image never becomes an image part — the marker rides instead", async () => {
    const { args } = baseArgs({
      connection: VISION,
      canon: [rowOf("assistant", `"D-do you have more...?"\n\n![](${CARD_IMAGE_URL})`), userRow("hi")],
    });
    const result = await runTurnPipeline(args);
    expect(imageParts(result.request)).toEqual([]);
    // ...and the URL is not riding as TEXT bytes either — the wire carries the compact marker in its place.
    const text = historyText(result.request);
    expect(text).toContain('"D-do you have more...?"\n\n[image]');
    expect(text).not.toContain(CARD_IMAGE_URL);
    // Not a capability drop: the `image_dropped` warning must not fire every turn of this chat.
    expect(result.imageDropped).toBe(false);
  });

  test("the alt text survives into the marker when the card wrote one", async () => {
    const { args } = baseArgs({
      connection: VISION,
      canon: [rowOf("assistant", `she grins ![a throne room](${CARD_IMAGE_URL}) and waits`), userRow("hi")],
    });
    const result = await runTurnPipeline(args);
    expect(imageParts(result.request)).toEqual([]);
    expect(historyText(result.request)).toContain("she grins [image: a throne room] and waits");
  });

  test("narrator/imagery media (an ASSET ref on an assistant row) is display-only too", async () => {
    const { args } = baseArgs({
      connection: VISION,
      canon: [rowOf("assistant", "![narrator media](asset:ast_5)"), userRow("hi")],
    });
    const result = await runTurnPipeline(args);
    expect(imageParts(result.request)).toEqual([]);
    expect(historyText(result.request)).toContain("[image: narrator media]");
  });

  test("a user's PASTED link is display-only, but their real ATTACHMENT still rides (the vision path lives)", async () => {
    const { args } = baseArgs({
      connection: VISION,
      canon: [userRow(`see ![](${CARD_IMAGE_URL}) and ![attachment](asset:ast_9)`)],
    });
    const result = await runTurnPipeline(args);
    expect(result.request.history.at(-1)?.content).toEqual([
      { type: "text", text: "see [image] and " },
      { type: "image", url: "https://cas.test/ast_9" },
    ]);
    expect(result.imageDropped).toBe(false);
  });

  test("the scoped fold's demoted assistant row stays display-only (the delivered `user` role alone would leak it)", async () => {
    // `cardScope: "scoped"` re-roles another character's assistant line to a `Name: …` USER row — its
    // narrator asset image is still character-authored, so it must not become an image part.
    const other = castId<CharacterId>("char_other");
    const target = castId<CharacterId>("char_target");
    const foldedRow: MessageView = { ...assistantRow("![narrator media](asset:ast_5)", other), id: castId<MessageId>("message_folded") };
    const { args } = baseArgs({
      connection: VISION,
      canon: [foldedRow, userRow("hi")],
      shape: {
        output: "per-speaker",
        cardScope: "scoped",
        scopedTargetId: target,
        speakerName: "Target",
        speakerRef: { kind: "character", characterId: target },
      },
    });
    const result = await runTurnPipeline(args);
    // The fold landed (the row is delivered as `user`), and the image still did not ride.
    const folded = result.request.history.find((h) => h.content.some((p) => p.type === "text" && p.text.includes("[image: narrator media]")));
    expect(folded?.role).toBe("user");
    expect(imageParts(result.request)).toEqual([]);
  });

  test("a non-vision model raises NO image_dropped warning for a card's greeting image (it was never eligible)", async () => {
    // Contrast with the D45 drop test above: a USER attachment on a non-vision model still flags the warning.
    const { args } = baseArgs({ canon: [rowOf("assistant", `hi ![](${CARD_IMAGE_URL})`), userRow("hi")] });
    const result = await runTurnPipeline(args);
    expect(result.imageDropped).toBe(false);
    expect(historyText(result.request)).toContain("hi [image]");
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
    // @orb-waive no-test-fabrication(unknown): slim MessageView double — toShapeCanon reads only role/content/seq/excludedFromPrompt/id. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    ({
      role,
      kind: "standard",
      content,
      seq,
      excludedFromPrompt: false,
      characterId: null,
      personaId: null,
      id: castId<MessageId>(`m${seq}`),
    }) as unknown as MessageView;
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

// ── Narrator `<speaker>` markers are DISPLAY canon, never prompt bytes (§12.4) ─────────────────────
// A narrator row keeps its inline markers in stored canon precisely so the renderer can color by them.
// Re-feeding that XML into every later prompt burns tokens AND teaches the model to parrot the syntax, so
// the shaped history converts them to the plain `NAME: ` attribution the transcript already speaks. The
// conversion lives in `toShapeCanon` — the ONE funnel the turn pipeline and the host shape-trace share.
//
// AMENDED 2026-08-07 (D129): the conversion is gated on the row's DECLARED `kind:"narrator"`, not run blind
// over every assistant row. These fixtures therefore declare what they are — which is also what they always
// depicted (the describe block's own subject is narrator rows).
describe("runTurnPipeline — <speaker> markers convert to plain attribution in the prompt history", () => {
  const markerRow = (seq: number, content: string, kind: MessageView["kind"] = "narrator"): MessageView =>
    // @orb-waive no-test-fabrication(unknown): slim MessageView double — toShapeCanon reads only role/kind/content/seq/excludedFromPrompt/id. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    ({
      role: "assistant",
      kind,
      content,
      seq,
      excludedFromPrompt: false,
      characterId: null,
      personaId: null,
      id: castId<MessageId>(`m${seq}`),
    }) as unknown as MessageView;

  test("a narrator row's markers become `NAME: ` and the raw tags never reach the wire", async () => {
    const canon = [markerRow(1, "<speaker>Aria</speaker>Hold the line.<speaker>Bran</speaker>Already moving.")];
    const { args } = baseArgs({ canon });
    const text = historyText((await runTurnPipeline(args)).request);
    expect(text).not.toContain("<speaker>");
    expect(text).not.toContain("</speaker>");
    expect(text).toContain("Aria: Hold the line.");
    expect(text).toContain("Bran: Already moving.");
  });

  test("a body with no markers is byte-identical (every per-speaker / solo row)", async () => {
    const canon = [markerRow(1, "Hold the line.")];
    const { args } = baseArgs({ canon });
    expect(historyText((await runTurnPipeline(args)).request)).toContain("Hold the line.");
  });

  test("a STANDARD row's identical bytes ride the wire untouched — the strip is the narrator's, not everyone's", async () => {
    // Tag-ABSENCE used to stand in for "not a narrator row", so this transform ran on every assistant row and
    // silently rewrote an author's own `<speaker>` prose. Purpose is declared now, so the blind pass is gone.
    const canon = [markerRow(1, "<speaker>Aria</speaker>Hold the line.", "standard")];
    const { args } = baseArgs({ canon });
    expect(historyText((await runTurnPipeline(args)).request)).toContain("<speaker>Aria</speaker>Hold the line.");
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
  const vllmShape = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 32_768 }, modalities: ["text"] }, context: { window: 32_768 } });
  const vllmConnection: Resolved<"chat"> = { ...CONNECTION, capability: makeCapability(vllmShape) };

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
    const wideConnection: Resolved<"chat"> = {
      ...CONNECTION,
      capability: makeCapability(
        makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 1_000_000 } }),
      ),
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

// Slim MessageView doubles — the history-macro resolver reads only role/kind/content/excludedFromPrompt/
// characterId/personaId(/authorUserId) off a canon row (see file header).
const assistantRow = (content: string, characterId: CharacterId): MessageView =>
  // @orb-waive no-test-fabrication(unknown): same slim-double judgment as seqRow/rowOf above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  ({
    role: "assistant",
    kind: "standard",
    content,
    excludedFromPrompt: false,
    characterId,
    personaId: null,
  }) as unknown as MessageView;

const userRowWithPersona = (content: string, personaId: PersonaId): MessageView =>
  // @orb-waive no-test-fabrication(unknown): same slim-double judgment as seqRow/rowOf/assistantRow above. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  ({
    role: "user",
    kind: "standard",
    content,
    excludedFromPrompt: false,
    characterId: null,
    personaId,
    authorUserId: FIXTURE_HUMAN,
  }) as unknown as MessageView;

/** Flatten every wire history row's text parts into one string (the assembled prompt the model sees). */
const historyText = (req: TurnRequest): string =>
  req.history
    .flatMap((h) => h.content)
    .flatMap((p) => (p.type === "text" ? [p.text] : []))
    .join("\n");

/** Build the {@link HistoryMacroNames} producer `args.historyMacroNames` takes — the test-local stand-in
 *  for the engine's `loadChatIdentityProducer` + `buildIdentityNameContext` (Chat-Macro-Resolution.md §1 / D137). */
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
    // the producer's Aria — the row's own stamp, never the ctx's current speaker (`characters`/`characterIds`
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
  const withFloor = (floor: "none" | "merge" | "strict"): Resolved<"chat"> => {
    const capability: GenerationCapability = {
      ...CAPABILITY,
      turns: {
        assistantPrefill: false,
        midConversationSystem: false,
        historySystemRows: false,
        roleHandlingFloor: floor,
        explicitPromptCache: false,
      },
    };
    return { ...CONNECTION, capability: makeCapability(capability) };
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

// The `squashSystemMessages` PROMPT knob (`params.advanced`, ST-imported from
// `squash_system_messages`) is now a live SHAPE reader — consecutive system-note runs merge into ONE
// `[Take the following into special consideration: …]` bracket BEFORE the system→user framing, orthogonal to `roleHandling`. Two
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
  const systemBrackets = (req: TurnRequest): number => (historyText(req).match(/\[Take the following into special consideration:/g) ?? []).length;

  test("preset squashSystemMessages:true ⇒ the two system notes fold into ONE bracket (preset value reached SHAPE)", async () => {
    const { args } = baseArgs({
      assembleContext: ctxOf({ promptConfig: presetSquash(true), chatInjections: systemNotes }),
    });
    const result = await runTurnPipeline(args);
    expect(systemBrackets(result.request)).toBe(1);
    expect(historyText(result.request)).toContain("[Take the following into special consideration: sys-alpha\n\nsys-beta]");
  });

  test("preset squashSystemMessages absent ⇒ the notes stay as TWO separate brackets (byte-identical to today)", async () => {
    const { args } = baseArgs({
      assembleContext: ctxOf({ promptConfig: DEFAULT_PROMPT_CONFIG, chatInjections: systemNotes }),
    });
    const result = await runTurnPipeline(args);
    expect(systemBrackets(result.request)).toBe(2);
  });
});

describe("runTurnPipeline — PD-148: the preset params fold into the wire request", () => {
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

  test("a DEFAULT preset with an untouched `params` folds only the materialized maxOutputTokens", async () => {
    const intent: UserIntent = { temperature: 0.8 };
    const result = await runTurnPipeline(baseArgs({ intent }).args);
    // DEFAULT_PROMPT_CONFIG.params is `{}` and carries no customParameters ⇒ the fold is a no-op EXCEPT the
    // single-source maxOutputTokens materialization (the caller's fields survive verbatim), and the request
    // carries no customParameters field.
    expect(result.request.intent).toEqual({ temperature: 0.8, maxOutputTokens: DEFAULT_MAX_OUTPUT_TOKENS });
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
      connection: {
        ...CONNECTION,
        capability: makeCapability({
          ...CAPABILITY,
          turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "none", explicitPromptCache: false },
        }),
      },
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

  // Still true, and now for a STATED reason: the row is the TRIGGER'S OWN (`authorUserId === triggerUserId`),
  // which is the only case SHAPE's null-stamp guard lets borrow `speakers.user`. A null-stamp row authored by
  // someone else takes the unresolvable floor instead — pinned in `assembly/shape.test.ts`.
  test("a null-stamp user row still falls back to the active persona (byte-identical to pre-F4)", async () => {
    const { args } = baseArgs({
      connection: {
        ...CONNECTION,
        capability: makeCapability({
          ...CAPABILITY,
          turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "none", explicitPromptCache: false },
        }),
      },
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
    const turn = buildTurnUserMacros({ preset: { id: "preset-1", defs: moodConfig.userMacros }, values: {}, prng: () => 0 });
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
  test("does not mutate the immutable assemble ctx (the chat design doc §5)", async () => {
    const ctx = ctxOf();
    const snapshot = structuredClone(ctx);
    const { args } = baseArgs({ assembleContext: ctx });
    await runTurnPipeline(args);
    expect(ctx).toEqual(snapshot);
  });
});

// ── RECEIVE (D53 step 2): <think>-demux → AI_OUTPUT regex → post-process → REASONING regex ─────────────────
/** A host-tier regex script (fully defaulted via the parse seam) for a single placement. */
function script(label: string, find: string, replace: string, placement: "AI_OUTPUT" | "DISPLAY" | "REASONING" | "PROMPT_HISTORY"): RegexScriptRow {
  return regexScriptSchema.parse({
    // D121-E: a row id is a real `regex_script_…` TypeID; the readable label rides on `name`.
    id: mintTypeId(ID_PREFIX.regexScript),
    name: label,
    // X-16: `updatedAt` is REQUIRED on the row (the edited stamp) — a fixed instant keeps the double honest.
    updatedAt: 1_700_000_000_000,
    findRegex: find,
    replaceString: replace,
    placement: [placement],
    // `historyDepth` is REQUIRED on (and only on) a PROMPT_HISTORY script — the schema's total pairing check.
    // Unbounded (`max: null`) = every row, which is what a placement-comparison probe wants.
    ...(placement === "PROMPT_HISTORY" ? { historyDepth: { min: 0, max: null } } : {}),
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

  // ── THE RECEIVE ORDER PIN (D121-E's order table) ──────────────────────────────────────────────────
  // The law: think-demux → AI_OUTPUT regex → postProcess → per-speaker clean → REASONING regex. The tests
  // around this one pin adjacent PAIRS; this one pins the whole CHAIN in a single turn, so a reorder
  // anywhere along it breaks here even when every neighbouring pair still looks locally right.
  //
  // Order-as-prose rots — that is exactly how the Transforms readout came to print REASONING before
  // AI_OUTPUT while the engine ran the reverse. This is the executable version of the table.
  test("RECEIVE ORDER: think-demux → AI_OUTPUT regex → postProcess → REASONING regex, in that order", async () => {
    const { args } = baseArgs({
      // The model emits an INLINE <think> block plus a content marker; the reasoning channel is inline, so
      // the demux must run FIRST or the AI_OUTPUT script would see (and rewrite) the reasoning text too.
      runChatTurn: finalTurn("<think>ponder RAW</think>SEED"),
      assembleContext: ctxOf({
        hostTierRegexScripts: [
          // AI_OUTPUT turns the marker into a two-sentence string whose tail is a fragment …
          script("ai", "SEED", "Kept. frag", "AI_OUTPUT"),
          // … and REASONING rewrites a token that ONLY exists inside the demuxed reasoning channel.
          script("re", "RAW", "refined", "REASONING"),
        ],
        promptConfig: cfgWith({
          postProcess: { collapseNewlines: false, trimTrailingWhitespace: false, dropIncompleteSentence: true, singleLine: false },
          reasoningParse: { autoParse: true, prefix: "<think>", suffix: "</think>" },
        }),
      }),
    });

    const result = await runTurnPipeline(args);

    // CONTENT proves demux-before-regex AND regex-before-postProcess: the reasoning text never reached the
    // AI_OUTPUT pass, the marker WAS rewritten, and the fragment the rewrite created was then dropped.
    expect(result.content).toBe("Kept.");
    // REASONING proves the reasoning pass ran on the DEMUXED channel — a token only present in it.
    expect(result.reasoning).toBe("ponder refined");
  });

  // ── THE DECLARATION vs THE ENGINE ────────────────────────────────────────────────────────────────
  // `REPLY_LANE_STEPS` (@orb/contracts/preset) is what the preset editor's Transforms readout RENDERS —
  // it replaced nine hand-numbered rows that had drifted into four untruths at once. A declaration of
  // someone else's order is worth exactly as much as the test that binds it to that order, so this one
  // OBSERVES the engine and compares the observation to the declaration; neither side is hardcoded here.
  //
  // WHAT IS OBSERVABLE, and what is not: the regex passes are observable through the INJECTED watchdog
  // (`applyRegexReplace` sees every compiled pattern, in call order), and post-process-after-AI_OUTPUT is
  // observable in the content (the test above). The post-process block's position relative to the
  // REASONING pass is NOT observable by construction — they operate on different channels and can never
  // interact — so it is held by the source order plus the contracts-side lane pins, and this test says so
  // rather than faking a proof of it.
  test("DECLARATION vs ENGINE: the declared reply lane's server-side legs fire in the declared order", async () => {
    const fired: string[] = [];
    const { args } = baseArgs({
      // A patterned watchdog: it records which leg is running (by the script's own pattern) and then does
      // the real replace, so the turn's output stays honest while the ORDER is captured.
      applyRegexReplace: (text, regex, replacer) => {
        fired.push(regex.source);
        return text.replace(regex, replacer);
      },
      runChatTurn: finalTurn("<think>ponder RAW</think>SEED"),
      assembleContext: ctxOf({
        hostTierRegexScripts: [
          script("ai", "SEED", "Kept. frag", "AI_OUTPUT"),
          script("re", "RAW", "refined", "REASONING"),
          // A DISPLAY script is attached too: the reply-side lane declares it LAST and CLIENT-side, so the
          // server must never fire it. A leg that ran here would be the readout's claim made false the
          // other way round — "never touches the wire" is the whole point of that row.
          script("disp", "Kept", "SHOWN", "DISPLAY"),
        ],
        promptConfig: cfgWith({
          postProcess: { collapseNewlines: false, trimTrailingWhitespace: false, dropIncompleteSentence: true, singleLine: false },
          reasoningParse: { autoParse: true, prefix: "<think>", suffix: "</think>" },
        }),
      }),
    });

    const result = await runTurnPipeline(args);

    // The DECLARED order of the server-side regex legs — read off the tuple, never spelled here.
    const declaredLegs = REPLY_LANE_STEPS.filter((step) => step.kind === "regex" && step.placement !== "DISPLAY").map(pipelineStepKey);
    // The OBSERVED order, named by the pattern each leg's script carries (a Map — the keys are regex
    // sources, not identifiers, and an object literal of them is a naming-convention violation).
    const legOfPattern = new Map([
      ["SEED", "regex:AI_OUTPUT"],
      ["RAW", "regex:REASONING"],
    ]);
    expect(fired.map((source) => legOfPattern.get(source) ?? `regex:UNKNOWN(${source})`)).toEqual(declaredLegs);
    // The DISPLAY leg is declared last AND client-side: it must not have fired, and the content proves it.
    expect(fired).not.toContain("Kept");
    expect(result.content).toBe("Kept.");
    // post-process ran AFTER the AI_OUTPUT pass (the fragment its rewrite created is gone), which is the
    // one ordering the declaration asserts between a regex leg and the switch block that IS observable.
    const declaredReply = REPLY_LANE_STEPS.map(pipelineStepKey);
    for (const flag of RECEIVE_POST_PROCESS_ORDER) {
      expect(declaredReply.indexOf(`post-process:${flag}`)).toBeGreaterThan(declaredReply.indexOf("regex:AI_OUTPUT"));
    }
    expect(result.reasoning).toBe("ponder refined");
  });

  test("the AI_OUTPUT pass does NOT reach the reasoning channel (the demux boundary holds)", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("<think>SHARED</think>SHARED"),
      // ONE token present in BOTH channels, rewritten by an AI_OUTPUT script only.
      assembleContext: ctxOf({
        hostTierRegexScripts: [script("ai", "SHARED", "content-only", "AI_OUTPUT")],
        promptConfig: cfgWith({ reasoningParse: { autoParse: true, prefix: "<think>", suffix: "</think>" } }),
      }),
    });

    const result = await runTurnPipeline(args);

    expect(result.content).toBe("content-only");
    // If the pass ran before the demux (or on the whole envelope), the reasoning would read "content-only".
    expect(result.reasoning).toBe("SHARED");
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
      characters: [
        { name: "Kai", description: "a rogue" },
        { name: "Aria", description: "a knight" },
      ],
      speakerRefs: [
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
      runChatTurn: finalTurn("I attack the goblin.\nAria: I characters a shield."),
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
      runChatTurn: finalTurn("I attack the goblin.\nAria: I characters a shield."),
      assembleContext: groupCtx(),
      shape: { ...perSpeaker, output: "narrator", speakerName: "Kai & Aria" },
    });
    const result = await runTurnPipeline(args);
    expect(result.content).toBe("I attack the goblin.\nAria: I characters a shield.");
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

  // Owner ruling (the stable merged layout): every speaker of a merged room sends the SAME system block, so the
  // room writes one cache entry instead of one per speaker, and the round cue is the only place the speaker is
  // named — so a turn whose round sent no cue (one speaker, a regenerate) still carries one.
  test("merged: Kai's and Aria's turns send byte-identical system blocks, and each cue names its own speaker", async () => {
    const run = async (speakerName: string, characterId: CharacterId): Promise<TurnRequest> => {
      const { args } = baseArgs({
        runChatTurn: finalTurn("ok"),
        assembleContext: groupCtx(),
        shape: { ...perSpeaker, speakerName, speakerRef: { kind: "character", characterId } },
      });
      return (await runTurnPipeline(args)).request;
    };
    const kai = await run("Kai", KAI);
    const aria = await run("Aria", ARIA);
    expect(aria.prompt.static).toBe(kai.prompt.static);
    expect(kai.prompt.static).toContain("[Character — Aria]");
    expect(kai.prompt.static).not.toContain("[Also present");
    expect(historyText(kai)).toContain("[Write the next reply only as Kai.");
    expect(historyText(aria)).toContain("[Write the next reply only as Aria.");
  });

  // IMP-1 layer 2b — an impersonate draft is the USER's line, so "self" is the PERSONA and EVERY CHARACTER is
  // foreign. An impersonate turn carries no `shape`, which is exactly why the pre-IMP-1 fallback (self = the
  // character) ran the inverted configuration on it.
  describe("impersonate — self is the persona, every character is foreign", () => {
    test("a leading CHARACTER label is NOT stripped — the composer must SEE the bleed, not receive it laundered", async () => {
      const { args } = baseArgs({
        runChatTurn: finalTurn('Kai: "You are paying, or you sleep outside."'),
        assembleContext: groupCtx(),
        kind: "impersonate",
      });
      const result = await runTurnPipeline(args);
      expect(result.content).toBe('Kai: "You are paying, or you sleep outside."');
    });

    test("a draft that rolls on into ANY other character's line is truncated — including the primary character", async () => {
      const { args } = baseArgs({
        runChatTurn: finalTurn("I drop the satchel by the fire.\nKai: I watch her do it."),
        assembleContext: groupCtx(),
        kind: "impersonate",
      });
      const result = await runTurnPipeline(args);
      expect(result.content).toBe("I drop the satchel by the fire.");
    });

    test("the drafter's OWN persona label is stripped (the user never types their own name)", async () => {
      const { args } = baseArgs({
        runChatTurn: finalTurn("Nate: I drop the satchel by the fire."),
        assembleContext: groupCtx(),
        kind: "impersonate",
      });
      const result = await runTurnPipeline(args);
      expect(result.content).toBe("I drop the satchel by the fire.");
    });

    test("a clean first-person draft is untouched", async () => {
      const { args } = baseArgs({
        runChatTurn: finalTurn("I shake the rain off my coat and ask Kai about the ford."),
        assembleContext: groupCtx(),
        kind: "impersonate",
      });
      const result = await runTurnPipeline(args);
      expect(result.content).toBe("I shake the rain off my coat and ask Kai about the ford.");
    });
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

// ── The D48 recurse loop (the goldens) ────────────────────────────────────────────
// A REAL resolved descriptor for a tool-capable OpenRouter model (§U0 checkpoint: the loop's capability
// gate keys on the real synthesis output, not a synthetic literal). The OR arm sets `tools.parallel:true`;
// the loop gate reads only the PRESENCE of `capability.tools`, so the parallel flag is inert here.
const TOOL_CAPABILITY: GenerationCapability = makeGenerationCapability({ ...CAPABILITY, tools: { parallel: true } });

const TOOL_CONNECTION: Resolved<"chat"> = { ...CONNECTION, capability: makeCapability(TOOL_CAPABILITY) };

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

/** Every tool NAME a request offers, in the order an array wire declares them — the executable offer first, the
 *  terminal set after (`toChatRequest`'s projection, pinned in tests/inference/roles/chat-request.test.ts). */
function offeredNames(req: TurnRequest | undefined): readonly string[] | undefined {
  const tools = req?.tools;
  if (tools === undefined) {
    return;
  }
  return [...(tools.offer?.definitions ?? []), ...(tools.terminal ?? [])].map((t) => t.name);
}

/** A fake ChatToolOps: echoes executions as records; `failWith` makes every call errors-as-data. `drivers`
 *  records who each attach-time resolve was scoped to (#677). */
function fakeToolOps(executed: string[][], failWith?: string, drivers: UserId[] = []): ChatToolOps {
  return {
    resolveTools: (driverUserId, names): { marker: string; names: readonly string[] } => {
      drivers.push(driverUserId);
      return { marker: "resolved-set", names };
    },
    toToolDefinitions: () => [{ name: "tick_clock", description: "d", parameters: { type: "object" }, inputShape: {} }],
    prepareExecution: () =>
      Promise.resolve((calls): Promise<ToolCallRecord[]> => {
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
      }),
  };
}

describe("runTurnPipeline — the D48 recurse loop", () => {
  test("#677: the attach-time resolve is scoped to the TURN HOST, never the triggering member", async () => {
    // The attach union comes from the host's own contributor tools (`tctx.runAsUserId`), so the resolve that
    // turns those names into entries has to be keyed the same way — otherwise a name that exists once per
    // installing user resolves to whoever registered first. `runAsUserId` and `triggeredBy` differ in the
    // fixture precisely so a pipeline reaching for the wrong one is visible.
    const drivers: UserId[] = [];
    const host = castId<UserId>("user_room_host");
    const member = castId<UserId>("user_room_member");
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps([], undefined, drivers),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths([[doneFinal("ok")]], []),
      toolExecFrame: {
        runAsUserId: host,
        triggeredBy: member,
        chatId: castId<ChatId>("chat_a"),
        membership: null,
        turnId: castId<ChatTurnId>("chat_turn_a"),
      },
    });
    await runTurnPipeline(args);
    expect(drivers).toEqual([host]);
  });

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

    // Two role calls; the first carried the neutral offer (the wire's `tools[]` + `auto` are inference's
    // projection of it — tests/inference/roles/chat-request.test.ts).
    expect(requests).toHaveLength(2);
    expect(requests[0]?.tools?.offer?.definitions.map((t) => t.name)).toEqual(["tick_clock"]);
    expect(requests[0]?.tools?.offer?.turnLimit).toBe(5);
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
const RESPONSE_FORMAT = { name: "narrative", schema: wireSchema({ type: "object", properties: {}, additionalProperties: false }) } as const;
const STRUCTURED_CONNECTION: Resolved<"chat"> = {
  ...CONNECTION,
  capability: makeCapability(makeGenerationCapability({ ...CAPABILITY, output: { ...CAPABILITY.output, structured: true } })),
};

describe("runTurnPipeline — §8.8 reasoning CARRY across a tool chain", () => {
  // A model that reasons AND round-trips its own signed thinking — the only shape where the carry knob has
  // anything to do. `replay: "signed"` is the capability cell; `effort` is what turns reasoning ON.
  const carryCapability: GenerationCapability = makeGenerationCapability({
    ...CAPABILITY,
    tools: { parallel: true },
    reasoning: { mode: "adaptive", enabled: true, effortLevels: ["low", "medium", "high"], replay: "signed" },
  });
  const carryConnection: Resolved<"chat"> = { ...CONNECTION, capability: makeCapability(carryCapability) };

  const signedPart: ChatReasoningPart = { type: "reasoning", text: "I should tick the clock.", meta: { anthropic: { signature: "SIG-1" } } };

  /** Leg 1 emits a signed thinking block + a tool call; leg 2 answers. The parts ride the FINAL chunk, which
   *  is how a real wire hands them over (`ChatResult.reasoningParts` → `finalTurnChunk`). */
  const legs = (requests: TurnRequest[]): RunChatTurnOp =>
    scriptedDepths(
      [
        [
          {
            kind: "final",
            economics: {
              content: "Let me check. ",
              finishReason: "tool",
              toolCalls: [{ toolCallId: "c1", name: "tick_clock", arguments: "{}" }],
              reasoningParts: [signedPart],
            },
          },
        ],
        [doneFinal("Half an hour passes.")],
      ],
      requests,
    );

  const carryArgs = (carryReasoning: UserIntent["carryReasoning"], requests: TurnRequest[]): PipelineArgs =>
    baseArgs({
      connection: carryConnection,
      tools: fakeToolOps([]),
      attachedToolNames: ["tick_clock"],
      intent: { effort: "high", ...(carryReasoning === undefined ? {} : { carryReasoning }) } satisfies UserIntent,
      runChatTurn: legs(requests),
    }).args;

  /** The assistant row the loop appended for the next leg — the one the converter turns into wire blocks. */
  const appendedAssistantRow = (requests: readonly TurnRequest[]): TurnMessage | undefined => {
    const second = requests[1]?.history ?? [];
    return second.slice((requests[0]?.history ?? []).length).at(0);
  };

  test("`tool-chain`: leg 2's assistant row carries the signed thinking FIRST, ahead of the prose and the tool call", async () => {
    const requests: TurnRequest[] = [];
    await runTurnPipeline(carryArgs("tool-chain", requests));

    const row = appendedAssistantRow(requests);
    expect(row?.role).toBe("assistant");
    // ORDER IS THE PIN: Anthropic requires the thinking block at the head of an assistant turn, and the
    // converter emits parts in array order — a signature behind the tool_use is not the turn the model signed.
    expect(row?.content.map((part) => part.type)).toEqual(["reasoning", "text", "tool-call"]);
    expect(row?.content[0]).toEqual(signedPart);
  });

  test("`off` (the default): the same loop hands leg 2 NO thinking — the model sees an amnesiac chain", async () => {
    const requests: TurnRequest[] = [];
    await runTurnPipeline(carryArgs(undefined, requests));

    const row = appendedAssistantRow(requests);
    expect(row?.content.map((part) => part.type)).toEqual(["text", "tool-call"]);
  });

  test("the COHERENCE rule: a carry knob on a turn with reasoning OFF drops back to `off`", async () => {
    const requests: TurnRequest[] = [];
    // Same capability, but `effort: "none"` turns reasoning off for the turn — so there is nothing to carry
    // and the rung collapses, exactly as §8.8 states (the funnel raises the drop warning on the wire side).
    const { args } = baseArgs({
      connection: carryConnection,
      tools: fakeToolOps([]),
      attachedToolNames: ["tick_clock"],
      intent: { effort: "none", carryReasoning: "tool-chain" } satisfies UserIntent,
      runChatTurn: legs(requests),
    });
    await runTurnPipeline(args);

    expect(appendedAssistantRow(requests)?.content.map((part) => part.type)).toEqual(["text", "tool-call"]);
  });

  test("the CAPABILITY gate: a model that accepts no replayed thinking (`replay` absent ⇒ the `none` floor) drops it", async () => {
    const requests: TurnRequest[] = [];
    const noReplay: GenerationCapability = makeGenerationCapability({
      ...CAPABILITY,
      tools: { parallel: true },
      reasoning: { mode: "adaptive", enabled: true, effortLevels: ["high"] },
    });
    const { args } = baseArgs({
      connection: { ...CONNECTION, capability: makeCapability(noReplay) },
      tools: fakeToolOps([]),
      attachedToolNames: ["tick_clock"],
      intent: { effort: "high", carryReasoning: "tool-chain" } satisfies UserIntent,
      runChatTurn: legs(requests),
    });
    await runTurnPipeline(args);

    expect(appendedAssistantRow(requests)?.content.map((part) => part.type)).toEqual(["text", "tool-call"]);
  });
});

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

describe("runTurnPipeline — the backend-neutral tool offer (a backend-owned loop drives `execute`)", () => {
  const agentConnection: Resolved<"chat"> = { ...TOOL_CONNECTION, api: "agent-sdk" };

  /** A role that plays a backend OWNING the tool loop: mid-turn it invokes the offer's `execute` once per call
   *  (as the Agent SDK's mounted MCP handlers do) and records what came back, then finishes with no tool pivot. */
  function backendLoop(calls: readonly ToolCallInput[], sink: TurnRequest[], outcomes: ChatToolExecution[]): RunChatTurnOp {
    return (req) => {
      sink.push(req);
      return (async function* (): AsyncGenerator<TurnStreamChunk> {
        for (const call of calls) {
          const offer = req.tools?.offer;
          if (offer === undefined) {
            throw new Error("no tool offer rode the request");
          }
          outcomes.push(await offer.execute(call));
        }
        yield doneFinal("done");
      })();
    };
  }

  test("the SAME neutral offer rides whichever wire the connection speaks — the pipeline never branches on it", async () => {
    const offersFor = async (connection: Resolved<"chat">): Promise<TurnRequest["tools"]> => {
      const requests: TurnRequest[] = [];
      const { args } = baseArgs({
        connection,
        tools: fakeToolOps([]),
        attachedToolNames: ["tick_clock"],
        toolRecurseLimit: 3,
        runChatTurn: scriptedDepths([[doneFinal("x")]], requests),
      });
      await runTurnPipeline(args);
      return requests[0]?.tools;
    };
    const onAgent = await offersFor(agentConnection);
    const onArray = await offersFor(TOOL_CONNECTION);
    expect(onAgent?.offer?.definitions).toEqual(onArray?.offer?.definitions);
    expect(onAgent?.offer?.turnLimit).toBe(3);
    expect(onArray?.offer?.turnLimit).toBe(3);
    expect(onAgent?.terminal).toBeUndefined();
  });

  test("a backend-driven call runs the ONE execute path and its record is persisted with the turn", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const outcomes: ChatToolExecution[] = [];
    const call: ToolCallInput = { toolCallId: "mcp_tick_clock_1", name: "tick_clock", arguments: '{"m":30}' };
    const { args } = baseArgs({
      connection: agentConnection,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      runChatTurn: backendLoop([call], requests, outcomes),
    });
    const result = await runTurnPipeline(args);
    // One role call: the backend owned the loop, so there is no `finishReason: "tool"` pivot to recurse on.
    expect(requests).toHaveLength(1);
    // Single call in, single call executed — the batch path is the same one the recurse loop uses.
    expect(executed).toEqual([["tick_clock"]]);
    // The record the backend's call produced is the one the turn persists, byte-for-byte (D48 parity)…
    expect(result.toolRecords).toEqual([
      {
        toolCallId: "mcp_tick_clock_1",
        name: "tick_clock",
        arguments: '{"m":30}',
        result: JSON.stringify({ ok: "tick_clock" }),
        isError: false,
        durationMs: 1,
      },
    ]);
    // …and the backend is handed exactly the record's serialized result.
    expect(outcomes).toEqual([{ text: JSON.stringify({ ok: "tick_clock" }), isError: false }]);
    expect(result.toolsUnsupported).toBe(false);
    expect(result.content).toBe("done");
  });

  test("an errors-as-data execution reaches the backend as an error, and is still recorded", async () => {
    const outcomes: ChatToolExecution[] = [];
    const call: ToolCallInput = { toolCallId: "mcp_tick_clock_1", name: "tick_clock", arguments: "{}" };
    const { args } = baseArgs({
      connection: agentConnection,
      tools: fakeToolOps([], "not permitted: tick_clock"),
      attachedToolNames: ["tick_clock"],
      runChatTurn: backendLoop([call], [], outcomes),
    });
    const result = await runTurnPipeline(args);
    expect(outcomes).toEqual([{ text: JSON.stringify({ error: "not permitted: tick_clock" }), isError: true }]);
    expect(result.toolRecords.map((r) => r.isError)).toEqual([true]);
  });

  test("an execute path that returns NO record fails the call loudly — never a silent empty result", async () => {
    const ops: ChatToolOps = { ...fakeToolOps([]), prepareExecution: () => Promise.resolve(() => Promise.resolve([])) };
    const call: ToolCallInput = { toolCallId: "mcp_tick_clock_1", name: "tick_clock", arguments: "{}" };
    const { args } = baseArgs({
      connection: agentConnection,
      tools: ops,
      attachedToolNames: ["tick_clock"],
      runChatTurn: backendLoop([call], [], []),
    });
    await expect(runTurnPipeline(args)).rejects.toThrow("tool-use: executeToolCalls returned no record for tick_clock");
  });

  test("the turn's authority is bound ONCE, before the first model call, and every recursion depth reuses it", async () => {
    const order: string[] = [];
    const base = fakeToolOps([]);
    const depths = scriptedDepths([[toolFinal("", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("x")]], []);
    const ops: ChatToolOps = {
      ...base,
      prepareExecution: (set, frame) => {
        order.push("bind");
        return base.prepareExecution(set, frame);
      },
    };
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: ops,
      attachedToolNames: ["tick_clock"],
      runChatTurn: (req) => {
        order.push("model");
        return depths(req);
      },
    });
    await runTurnPipeline(args);
    expect(order).toEqual(["bind", "model", "model"]);
  });

  test("an array wire's calls run through the recurse loop — the offer's execute is never the pipeline's to call", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      runChatTurn: scriptedDepths([[toolFinal("", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("x")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(requests).toHaveLength(2);
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.toolRecords.map((r) => r.toolCallId)).toEqual(["c1"]);
  });
});

// ── The parity-plus §3.5 WIRE plane (hidden verbatim · card stub · M2 keep-last-X · §3.9 ordering) ──────
// These pins hold for ALL six connection modes by construction: they assert on `request.history`
// (`TurnMessage[]`), the ONE seam every backend consumes — the collapse happens BEFORE any per-backend
// wire vocabulary exists (`[[per-backend-wire-vocab-differs]]`: the COLLAPSE is wire-agnostic).

describe("runTurnPipeline — the §3 content-class wire plane", () => {
  // `cardKeepLastX: 0` is now stated EXPLICITLY on every stub assertion below. It used to be implicit: the
  // pipeline read `args.cardKeepLastX ?? 0`, so an absent value (a chat with no rpg game — the ONLY producer
  // of the field) silently became the window's strictest setting. That gave every non-rpg chat permanently
  // stubbed cards with no knob to change it. Absent now means NO window; `0` means keep none, and these
  // tests are about the `0` behaviour, so they say so.
  const stub0 = { cardKeepLastX: 0 } as const;
  const lieTag = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';
  const cardFence = ':::card title="Terminal"\n<div style="color:red">multi-KB html blob</div>\n:::';

  // #1434 — CONVERT runs before FIT. The conversion is LOSSY on purpose, so pricing the pre-conversion
  // bytes charged the budget for content the provider never receives: a stored card's multi-KB body cost
  // the fit thousands of tokens and then collapsed to `[card: title]` on the way out, evicting real turns
  // to make room for something already deleted — and `fitUsedTokens` (the managed-compaction trigger)
  // reported the phantom weight. The existing card tests prove the collapse; none of them ever combined it
  // with a constrained window, which is the only place the ordering is observable.
  test("#1434: a stubbed card is priced by its STUB, so a tight window keeps the older turns it used to evict", async () => {
    const huge = ':::card title="c1"\n<div>'.concat("x".repeat(200_000), "</div>\n:::");
    const canon = [userRow(huge), rowOf("assistant", "the reply that matters"), userRow("and the follow-up"), rowOf("assistant", "the newest beat")];
    // A window that comfortably fits four short turns and could never fit 200KB of html.
    const capability = makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 8192 } });
    const result = await runTurnPipeline(
      baseArgs({
        canon,
        ...stub0,
        connection: { ...CONNECTION, capability: makeCapability(capability) },
        intent: { maxOutputTokens: 128 } satisfies UserIntent,
      }).args,
    );
    // Nothing was evicted, and the card is on the wire as its stub — the two halves of the same claim.
    expect(result.droppedCount).toBe(0);
    expect(result.request.history).toHaveLength(canon.length + 1); // + SHAPE's trailing continuation synthetic
    expect(result.request.history[0]?.content).toEqual([{ type: "text", text: "[card: c1]" }]);
    // …and the boundary the fit reports is the honest one: nothing fell out of context.
    expect(result.contextBoundaryMessageId).toBeNull();
    // `fitUsedTokens` describes the ACTUAL request: it must not carry the 200KB the wire never saw.
    expect(result.fitUsedTokens).toBeLessThan(8192);
  });

  // #1438 — every span in the row is a `choices` span, the handler drops all of them, and with no dropped
  // MEDIA to placeholder the row fell through to `{type:"text", text:""}`. Providers reject empty messages,
  // and shipping one also contradicts the fence's own intent to remove the block. The existing choices tests
  // all wrap the fence in prose, so the all-choices row was uncovered.
  test("#1438: a CHOICES-ONLY row does not reach the provider as an empty text message", async () => {
    const choicesOnly = ":::choices\n1. Enter the crypt\n2. Flee\n:::";
    const canon = [rowOf("assistant", choicesOnly), userRow("I flee."), rowOf("assistant", "You run.")];
    const result = await runTurnPipeline(baseArgs({ canon }).args);
    expect(result.request.history.map((m) => m.content)).not.toContainEqual([{ type: "text", text: "" }]);
    // 3 canon rows − the emptied one + SHAPE's trailing continuation synthetic (the tail is never dropped).
    expect(result.request.history).toHaveLength(3);
    // The surrounding turns are untouched — this drops the empty row, never the conversation around it.
    expect(result.request.history.map((m) => m.content)).toContainEqual([{ type: "text", text: "You run." }]);
  });

  // SHAPE judges a system row's slot by its neighbours; a neighbour that converts to nothing on the wire is not
  // one. The choices-only assistant row is dropped after SHAPE, so a note kept between it and a user row would
  // reach the direct wire as `[user, system, user]`.
  test("a system note is judged against the rows the wire delivers — a choices-only neighbour does not count", async () => {
    const choicesOnly = ":::choices\n1. Enter the crypt\n2. Flee\n:::";
    const canon = [rowOf("assistant", "You stand at the gate."), userRow("I look around."), rowOf("assistant", choicesOnly), userRow("I flee.")];
    const note: ChatInjection = { position: "in_chat", depth: 2, role: "system", content: "Author's note: keep it tense." };
    const { args } = baseArgs({
      canon,
      connection: {
        ...CONNECTION,
        capability: makeCapability({
          ...CAPABILITY,
          turns: { assistantPrefill: false, midConversationSystem: true, historySystemRows: true, roleHandlingFloor: "slotted", explicitPromptCache: false },
        }),
      },
      assembleContext: ctxOf({ chatInjections: [note] }),
    });
    const history = (await runTurnPipeline(args)).request.history;
    const text = (m: TurnRequest["history"][number]): string => m.content.map((p) => (p.type === "text" ? p.text : "")).join("");
    const slots = history.flatMap((m, i) => (m.role === "system" ? [`${history[i - 1]?.role}>${history[i + 1]?.role}`] : []));
    expect(slots.filter((slot) => slot !== "user>assistant")).toEqual([]);
    expect(history.some((m) => text(m).includes("Author's note: keep it tense."))).toBe(true);
  });

  // #1543 — GREEN BEFORE THE FIX, and the label is the finding. The §8 breakpoint is an OFFSET FROM THE
  // END, so a mid-array drop CAN in principle move it off the row SHAPE measured. On this path it cannot:
  // `computeHistoryBreakpoint` sets `stableCount = withTail.length - 1`, so the stable prefix is everything
  // but the turn's tail — and the empty-row drop never removes the tail, so every row it can remove is
  // INSIDE the prefix and shortens the array and the prefix by the same one. The offset commutes.
  // `shiftBreakpoint` is kept because that argument is a property of ONE branch: the `merges:false` arm
  // counts the prefix by filtering blank-content rows, which can push `offsetFromEnd` above 1 and put a
  // droppable row in the tail region. So this is a FENCE on the commuting property, not a defect proof —
  // if a future SHAPE change raises the offset, this is the test that starts to matter.
  test("#1543 FENCE: dropping an empty choices row leaves the cache breakpoint addressing the same boundary", async () => {
    const choicesOnly = ":::choices\n1. Enter the crypt\n2. Flee\n:::";
    const withEmpty = [rowOf("assistant", "the settled past"), userRow("a beat"), rowOf("assistant", choicesOnly), userRow("I flee.")];
    // The SAME conversation with the choices row's body replaced by prose — same row count, same roles, so
    // SHAPE measures the same stable prefix and the only difference is whether a row converts to nothing.
    const withProse = [rowOf("assistant", "the settled past"), userRow("a beat"), rowOf("assistant", "she waits"), userRow("I flee.")];
    const run = async (canon: MessageView[]): Promise<{ offset: number | null; length: number; history: TurnRequest["history"] }> => {
      const result = await runTurnPipeline(baseArgs({ canon }).args);
      return { offset: result.cacheBreakpointFromEnd, length: result.request.history.length, history: result.request.history };
    };
    const dropped = await run(withEmpty);
    const intact = await run(withProse);

    // The control: the prose run keeps every row, so its offset is SHAPE's own number, untouched.
    // (A canon ending on a USER row needs no continuation nudge, so the wire array is the canon exactly.)
    expect(intact.length).toBe(withProse.length);
    // The dropped run is exactly one row shorter…
    expect(dropped.length).toBe(intact.length - 1);
    // The control must be a REAL placement, or this pin would compare two nulls and prove nothing.
    expect(typeof intact.offset).toBe("number");
    // The dropped row came out of the stable PREFIX, so the array and the prefix shrank together and the
    // offset is unchanged — and it still addresses the same LOGICAL boundary (the turn's tail).
    expect(dropped.offset).toBe(intact.offset);
    // The receipt that the offset means what it says: it addresses a row that exists, and that row is the
    // one after the stable prefix — the last row, which is the turn's own tail on both runs.
    expect(dropped.offset ?? 0).toBeLessThanOrEqual(dropped.length);
    expect(dropped.history.at(-(dropped.offset ?? 1))?.content).toEqual([{ type: "text", text: "I flee." }]);
  });

  test("a hidden tag rides the wire VERBATIM ({wire: full} — the model keeps its own lie), byte-identical single text part", async () => {
    const body = `He nods. ${lieTag} "Nothing," he says.`;
    const { args } = baseArgs({ canon: [userRow(body)] });
    const result = await runTurnPipeline(args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: body }]);
  });

  test("a card collapses to the deterministic stub ({wire: stub}) — zero html bytes on the wire, same bytes across assemblies", async () => {
    const body = `Look at this:\n${cardFence}\ndone.`;
    const first = await runTurnPipeline(baseArgs({ canon: [userRow(body)], ...stub0 }).args);
    const second = await runTurnPipeline(baseArgs({ canon: [userRow(body)], ...stub0 }).args);
    const part = first.request.history.at(-1)?.content;
    expect(part).toEqual([{ type: "text", text: "Look at this:\n[card: Terminal]\ndone." }]);
    expect(JSON.stringify(first.request.history)).not.toContain("multi-KB");
    // Cache-stability: the collapse is byte-deterministic across assemblies (§3.7).
    expect(second.request.history).toEqual(first.request.history);
  });

  test("an UNTERMINATED card in committed canon stubs like any other — a truncated blob never rides the wire raw", async () => {
    // The wire build tokenizes with `committed: true` (the fitted history is stored canon, not the live
    // stream), so the RV-2 truncated-generation class — a card the model never closed — collapses to the
    // same deterministic stub instead of shipping its half-written markup on every subsequent turn.
    const truncated = ':::card title="Ashfell Night Market"\n<div style="font-family: multi-KB html blob';
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(`Look:\n${truncated}`)], ...stub0 }).args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: "Look:\n[card: Ashfell Night Market]" }]);
    expect(JSON.stringify(result.request.history)).not.toContain("multi-KB");
  });

  test("NO rpg game (cardKeepLastX absent) ⇒ NO window: every card rides the wire WHOLE", async () => {
    // The regression pin for a real defect: `cardKeepLastX` is contributed ONLY by an rpg game's gather, and
    // the pipeline read it as `?? 0` — so an ordinary chat, which supplies nothing, silently inherited the
    // window's STRICTEST setting. Every card in its history collapsed to `[card: title]` on every turn,
    // permanently, with no knob anywhere to change it. A budget/cache tradeoff nobody opted into.
    const body = `Look at this:\n${cardFence}\ndone.`;
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(body)] }).args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: body }]);
    // The html really is on the wire — the stub is absent, not merely relabelled.
    expect(JSON.stringify(result.request.history)).toContain("multi-KB");
  });

  test("M2 keep-last-X: X=0 stubs every card; X=1 keeps only the NEWEST full; X=2 holds a third card until two can stub", async () => {
    const cardBody = (n: number): string => `:::card title="c${n}"\n<p>blob${n}</p>\n:::`;
    // Alternating roles so SHAPE keeps three separate rows (same-role runs squash into one body).
    const canon = [userRow(cardBody(1)), rowOf("assistant", cardBody(2)), userRow(cardBody(3))];
    const textsOf = (history: readonly TurnRequest["history"][number][]): string[] =>
      history.map((m) => m.content.map((p) => (p.type === "text" ? p.text : "")).join(""));

    const x0 = await runTurnPipeline(baseArgs({ canon, ...stub0 }).args);
    expect(textsOf(x0.request.history)).toEqual(["[card: c1]", "[card: c2]", "[card: c3]"]);

    const x1 = await runTurnPipeline(baseArgs({ canon, cardKeepLastX: 1 }).args);
    expect(textsOf(x1.request.history)).toEqual(["[card: c1]", "[card: c2]", cardBody(3)]);

    // The window stubs whole chunks of X, so one card past X stays full until a second one joins it.
    const x2 = await runTurnPipeline(baseArgs({ canon, cardKeepLastX: 2 }).args);
    expect(textsOf(x2.request.history)).toEqual([cardBody(1), cardBody(2), cardBody(3)]);
  });

  // A stored card that leaves the keep-last-X window rewrites its row, and that row sits above the cache
  // breakpoint. The window stubs whole chunks of X cards, so the rewrite lands once per X card-bearing turns.
  describe("the keep-last-X window across card-bearing turns", () => {
    const turns = 8;
    const cardBody = (n: number): string => `:::card title="c${n}"\n<p>blob${n}</p>\n:::`;
    const all = Array.from({ length: turns }, (_, k) => [userRow(`u${k}`), rowOf("assistant", cardBody(k))]).flat();
    const runTurns = async (cardKeepLastX: number): Promise<PipelineResult[]> => {
      const results: PipelineResult[] = [];
      for (let t = 1; t <= turns; t += 1) {
        results.push(await runTurnPipeline(baseArgs({ canon: [...all.slice(0, 2 * t), userRow(`u${t}`)], cardKeepLastX }).args));
      }
      return results;
    };
    const fullCards = (result: PipelineResult): number[] =>
      Array.from({ length: turns }, (_, n) => n).filter((n) => historyText(result.request).includes(`<p>blob${n}</p>`));
    const prefixBreaks = (results: readonly PipelineResult[]): number[] =>
      results.slice(1).flatMap((next, i) => (readsPriorCache(results[i] ?? next, next) ? [] : [i + 2]));

    test("X=2 keeps the newest two cards whole and stubs older cards two at a time", async () => {
      const results = await runTurns(2);
      // Turns 4, 6 and 8 each stub two cards; no other turn rewrites the cached prefix.
      expect({ full: results.map(fullCards), breaks: prefixBreaks(results) }).toEqual({
        full: [[0], [0, 1], [0, 1, 2], [2, 3], [2, 3, 4], [4, 5], [4, 5, 6], [6, 7]],
        breaks: [4, 6, 8],
      });
    });

    test("X=0 stubs every stored card and never rewrites the cached prefix", async () => {
      const results = await runTurns(0);
      expect(results.map(fullCards)).toEqual(Array.from({ length: turns }, () => []));
      expect(prefixBreaks(results)).toEqual([]);
    });
  });

  // A card the ASSEMBLY authored this turn is INSTRUCTION, not stored content: it must reach the model
  // whole at every keep value, and must not consume the window. The live defect this pins: the rpg
  // card-teach block embeds a literal `:::card` worked example, so at the default `cardKeepLastX = 0` the
  // wire seam collapsed the model's own teaching example to `[card: …]` before sending it — deleting the
  // one measured intervention that pins the opener's exact bytes, on every game. At keepLastX >= 1 it
  // failed the other way: the example rides the tail, so it WON the window and stubbed the real cards.
  test("a card in an INJECTED (id-less) row never stubs and never consumes the keep-last-X window", async () => {
    const cardBody = (n: number): string => `:::card title="c${n}"\n<p>blob${n}</p>\n:::`;
    const teach = `render one like this:\n${cardBody(9)}`;
    const canon = [userRow(cardBody(1)), rowOf("assistant", cardBody(2))];
    const injections: ChatInjection[] = [{ position: "in_chat", depth: 0, role: "system", content: teach }];
    const textOf = (req: TurnRequest): string => historyText(req);

    // X=0 — every STORED card stubs, and the authored example still rides whole.
    const x0 = await runTurnPipeline(baseArgs({ canon, assembleContext: ctxOf({ chatInjections: injections }), ...stub0 }).args);
    expect(textOf(x0.request)).toContain(cardBody(9));
    expect(textOf(x0.request)).toContain("[card: c1]");
    expect(textOf(x0.request)).toContain("[card: c2]");

    // X=1 — the authored example does NOT eat the slot: the newest STORED card still rides whole.
    const x1 = await runTurnPipeline(baseArgs({ canon, cardKeepLastX: 1, assembleContext: ctxOf({ chatInjections: injections }) }).args);
    expect(textOf(x1.request)).toContain(cardBody(9));
    expect(textOf(x1.request)).toContain(cardBody(2));
    expect(textOf(x1.request)).toContain("[card: c1]");
  });

  test("an unknown-directive rides VERBATIM ({wire: full} — the transcript is honest)", async () => {
    const body = ':::teleport to="crypt"\nnow\n:::';
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(body)] }).args);
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: body }]);
  });

  test("P5: a `:::choices` fence in a PRIOR message is STRIPPED from the model wire ({wire: drop}) — unselected options stop piling up on later turns, but the surrounding prose survives", async () => {
    // The assistant offered a CYOA menu last turn; the reader picked one (which became a real user turn).
    // On this turn's assembly the fence must be gone from the model wire — only the prose around it rides.
    const choicesFence = ":::choices\n1. Enter the crypt\n2. Flee\n:::";
    const body = `You reach the door.\n\n${choicesFence}\n\nWhat now?`;
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(body)] }).args);
    const wire = JSON.stringify(result.request.history);
    expect(wire).not.toContain("Enter the crypt");
    expect(wire).not.toContain(":::choices");
    // The prose on either side of the dropped fence survives (collapsed, the empty fence-neighbours join).
    expect(wire).toContain("You reach the door.");
    expect(wire).toContain("What now?");

    // The reading-surface projection is UNCHANGED (reading:"show") — the reader still gets the choice block.
    const blocks = contentSpansToBlocks(tokenizeContent(body));
    expect(blocks.some((b) => b.kind === "choices")).toBe(true);
  });

  test("squash parity (§3.7): a `\\n\\n`-joined multi-body string tokenizes whole — the tag/fence survive the join", async () => {
    // SHAPE's squash joins bodies with `\n\n` BEFORE tokenization; emulate the joined body directly.
    const joined = `first reply ${lieTag}\n\n${cardFence}`;
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(joined)], ...stub0 }).args);
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
          id: mintTypeId(ID_PREFIX.regexScript),
          name: "s",
          updatedAt: 1_700_000_000_000,
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
    const result = await runTurnPipeline(baseArgs({ canon: [userRow(processed)], ...stub0 }).args);
    // Downstream, the wire stubs the card and keeps the regex's effect on the surrounding prose.
    expect(result.request.history.at(-1)?.content).toEqual([{ type: "text", text: "beta prose\n[card: Terminal]" }]);
  });
});

// ── R1: TERMINAL tools (the folded state extraction) ──────────────────────────────────────────────
// The whole point of the seam: these tools reach the wire, the model may call them, and NOTHING executes,
// recurses, or is recorded. The calls come back on `terminalToolCalls` and go to the rpg flush instead of a
// second model call. The `null` vs `[]` distinction is TOTAL and load-bearing — `null` tells the consumer
// "the fold did not happen, run your own round", `[]` tells it "the fold happened and the beat was quiet".

const RPG_TERMINAL_TOOLS = [
  { name: "update_scene", description: "the scene", parameters: { type: "object" as const } },
  { name: "no_changes", description: "nothing changed", parameters: { type: "object" as const } },
];

describe("runTurnPipeline — terminal tools (R1 fold)", () => {
  test("attaches the tools with tool_choice auto, executes NOTHING, and returns the co-emitted calls", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      // Tool-use IS wired and would happily execute — proving the terminal path bypasses it BY SHAPE, not by
      // the ops being absent.
      tools: fakeToolOps(executed),
      attachedToolNames: [],
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths(
        [[toolFinal("She draws her blade and steps into the rain.", [{ id: "c1", name: "update_scene", args: '{"weather":"rain"}' }])]],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);

    // ONE model call — the recurse loop never pivoted, so no second call was paid (the entire R1 win).
    expect(requests).toHaveLength(1);
    expect(requests[0]?.tools?.terminal?.map((t) => t.name)).toEqual(["update_scene", "no_changes"]);
    // Nothing executable rode: the terminal set is the whole offer. (The wire's `auto`, NEVER `required` — which
    // measurably kills the prose, 0/6 narratives in the spike — is the projection's; see chat-request.test.ts.)
    expect(requests[0]?.tools?.offer).toBeUndefined();
    // The narrative survived intact alongside the state call.
    expect(result.content).toBe("She draws her blade and steps into the rain.");
    // Nothing executed, nothing recorded — the tool traffic stays server-internal, exactly as the separate
    // round's did (it must never reach a member-visible payload via the variant's toolCalls).
    expect(executed).toEqual([]);
    expect(result.toolRecords).toEqual([]);
    expect(result.terminalToolCalls?.map((c) => c.name)).toEqual(["update_scene"]);
    expect(result.terminalToolCalls?.[0]?.arguments).toBe('{"weather":"rain"}');
  });

  test("NO terminal economics (a stream with no final chunk) reports a NULL channel, never a false quiet beat", async () => {
    // The dangerous collapse: `economics === null` means the wire never delivered a completion, so we know
    // NOTHING about what the model called. Reporting `[]` there would tell the consumer "it chose to record
    // nothing", suppress its fallback, and drop the turn's state behind a cheerful log.
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      terminalTools: RPG_TERMINAL_TOOLS,
      // Text deltas only — no `final` chunk, so `reduceStream` returns economics: null.
      runChatTurn: scriptedTurn([{ kind: "text", text: "She fords the river." }]),
    });
    const result = await runTurnPipeline(args);
    expect(result.economics).toBeNull();
    expect(result.terminalToolCalls).toBeNull();
    // The prose still reduced off the deltas — the narrative is unaffected by the missing state channel.
    expect(result.content).toBe("She fords the river.");
  });

  test("a turn that calls no terminal tool yields an EMPTY array (a quiet beat), never null", async () => {
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths([[doneFinal("Nothing much happens.")]], []),
    });
    const result = await runTurnPipeline(args);
    expect(result.terminalToolCalls).toEqual([]);
    expect(result.content).toBe("Nothing much happens.");
  });

  test("no terminal tools requested ⇒ a byte-identical tool-less request and a NULL channel", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({ connection: TOOL_CONNECTION, runChatTurn: scriptedDepths([[doneFinal("hi")]], requests) });
    const result = await runTurnPipeline(args);
    expect(requests[0]?.tools).toBeUndefined();
    expect(result.terminalToolCalls).toBeNull();
  });

  test("a model with no tools capability drops them and reports a NULL channel (the consumer falls back)", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      // CONNECTION's capability has no `tools` key at all.
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths([[doneFinal("hi")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(requests[0]?.tools).toBeUndefined();
    expect(result.terminalToolCalls).toBeNull();
  });

  test("an agent-sdk connection gets the SAME neutral terminal declarations — one call, a LIVE channel", async () => {
    // Eligibility is a CAPABILITY question (this connection co-emits), never a wire one — the fold must NOT be
    // pushed onto its fallback round here. The DELIVERY (a deny-on-use MCP server on this wire) is inference's
    // projection of the same `tools.terminal`, so the request the pipeline builds is the array wire's, verbatim.
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      connection: { ...TOOL_CONNECTION, api: "agent-sdk" },
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths(
        [[toolFinal("She draws her blade and steps into the rain.", [{ id: "c1", name: "update_scene", args: '{"weather":"rain"}' }])]],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);
    expect(requests).toHaveLength(1); // one model call — the fallback round is deleted on this wire too
    expect(requests[0]?.tools?.terminal?.map((t) => t.name)).toEqual(["update_scene", "no_changes"]);
    // Nothing was resolved into an executable offer.
    expect(requests[0]?.tools?.offer).toBeUndefined();
    expect(result.terminalToolCalls?.map((c) => c.name)).toEqual(["update_scene"]);
    expect(result.toolRecords).toEqual([]);
  });

  test("a wire that SILENCES prose under tool attachment gets none — the narrative call is tool-less (D112 fold guard)", async () => {
    const requests: TurnRequest[] = [];
    // The REAL local-engine descriptor, not a synthetic literal: the vLLM arm declares `tools.silencesProse`
    // (measured — `content:null` on 36/36 tool-attached turns), so terminal tools must never reach this wire.
    // It IS tools-capable, which is exactly why the `capability.tools !== undefined` gate alone is not enough.
    const local = makeGenerationCapability({ ...CAPABILITY, tools: { parallel: true, silencesProse: true } });
    expect(local.tools).toBeDefined();
    const { args } = baseArgs({
      connection: { ...CONNECTION, capability: makeCapability(local) },
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths([[doneFinal("She fords the river, and the water takes her boots.")]], requests),
    });
    const result = await runTurnPipeline(args);
    // The silencing cause is ABSENT from the request — the prose is never traded for the passenger.
    expect(requests[0]?.tools).toBeUndefined();
    expect(result.content).toBe("She fords the river, and the water takes her boots.");
    // …and the contributor is TOLD (null channel ⇒ it runs its own post-commit round), never silently dropped.
    expect(result.terminalToolCalls).toBeNull();
  });

  test("terminal tools ride ALONGSIDE registry tools without stealing their loop", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths([[toolFinal("tick... ", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("done.")]], requests),
    });
    const result = await runTurnPipeline(args);
    // Both sets reached the wire; the REGISTRY tool still executed + recursed exactly as before.
    expect(offeredNames(requests[0])).toEqual(["tick_clock", "update_scene", "no_changes"]);
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.toolRecords.map((r) => r.name)).toEqual(["tick_clock"]);
    // The terminal channel reports the terminal-partitioned calls across every depth — none were emitted here.
    expect(result.terminalToolCalls).toEqual([]);
  });

  // ── #1404: the MIXED case. Both classes ride the one `tools` array on the array wires, so "which executor
  // owns this call" was answered by "did a registry set resolve", never by the call's own identity. The
  // partition below is by TOOL NAME (the one mint), computed where the declarations are attached and handed to
  // BOTH readers — so the registry executor structurally cannot receive a terminal call and the terminal
  // channel structurally cannot report a registry one.

  test("MIXED attach: a TERMINAL call is never handed to the registry executor (#1404)", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      terminalTools: RPG_TERMINAL_TOOLS,
      // Both classes are attached and the model picks the TERMINAL one.
      runChatTurn: scriptedDepths([[toolFinal("She draws her blade.", [{ id: "c1", name: "update_scene", args: '{"weather":"rain"}' }])]], requests),
    });
    const result = await runTurnPipeline(args);
    // Nothing executed, nothing recorded, and NO second model call was paid — the terminal contract holds
    // whether or not registry tools happen to ride the same turn.
    expect(executed).toEqual([]);
    expect(result.toolRecords).toEqual([]);
    expect(requests).toHaveLength(1);
    // …and the call comes back on the channel that owns it, with the narrative intact.
    expect(result.terminalToolCalls?.map((c) => c.name)).toEqual(["update_scene"]);
    expect(result.terminalToolCalls?.[0]?.arguments).toBe('{"weather":"rain"}');
    expect(result.content).toBe("She draws her blade.");
  });

  test("MIXED attach: ONE completion carrying BOTH classes splits — the registry half executes, the terminal half reports (#1404)", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths(
        [
          [
            toolFinal("tick... ", [
              { id: "c1", name: "tick_clock", args: "{}" },
              { id: "c2", name: "update_scene", args: '{"weather":"rain"}' },
            ]),
          ],
          [doneFinal("done.")],
        ],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);
    // Only the registry half recursed — the terminal passenger never became a second paid call.
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.toolRecords.map((r) => r.name)).toEqual(["tick_clock"]);
    // …and the terminal half survives the recursion: the calls are collected AT THE DEPTH THEY WERE EMITTED,
    // never re-read off the final aggregate economics (whose `toolCalls` are the LAST depth's alone).
    expect(result.terminalToolCalls?.map((c) => c.name)).toEqual(["update_scene"]);
  });

  // #1617 AMENDS THIS PIN, and the #1404 ruling it encodes SURVIVES: the registry still keeps the name (it is
  // the class that EXECUTES; a mis-executed passenger runs an unowned side effect). What changed is the OTHER
  // half of the drop. Riding the SURVIVING declarations looked graceful and was the one arm with no honest
  // report — `attached:true` flowed back, the fold took its folded path with one plane missing, and nothing
  // outside the server log said so. Now ANY collision withholds the whole channel for the turn and NAMES what
  // it refused, so the consumer's fallback round captures every plane.
  test("a terminal declaration COLLIDING with a registry tool name withholds the WHOLE channel, named (#1404, #1617)", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      // A contributor that re-spells a registry name would otherwise ship the wire TWO declarations of one
      // name (malformed) and make the partition unanswerable. The passenger yields — all of it.
      terminalTools: [{ name: "tick_clock", description: "the terminal twin", parameters: { type: "object" as const } }, ...RPG_TERMINAL_TOOLS],
      runChatTurn: scriptedDepths([[toolFinal("tick... ", [{ id: "c1", name: "tick_clock", args: "{}" }])], [doneFinal("done.")]], requests),
    });
    const result = await runTurnPipeline(args);
    // NOT the surviving subset: the wire carries the registry declarations alone.
    expect(offeredNames(requests[0])).toEqual(["tick_clock"]);
    // The name stays the REGISTRY's: it executes and recurses, and the terminal channel never claims it.
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.toolRecords.map((r) => r.name)).toEqual(["tick_clock"]);
    // `null`, not `[]`: `[]` would tell the consumer "they rode and the model recorded nothing" — a quiet
    // beat that never happened — and suppress the fallback that still has to write this turn's state.
    expect(result.terminalToolCalls).toBeNull();
    // …and the reason that `null` is not the wire's fault.
    expect(result.terminalToolsCollided).toEqual(["tick_clock"]);
  });

  test("#1617 a TOTAL collision reports the same named outcome (it used to read as an ineligible wire)", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["update_scene"],
      // Every declaration collides, which used to leave `wanted` empty — indistinguishable from "none
      // requested", so the consumer was told the wire could not carry terminal tools. It could.
      terminalTools: [{ name: "update_scene", description: "the terminal twin", parameters: { type: "object" as const } }],
      runChatTurn: scriptedDepths([[doneFinal("done.")]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(result.terminalToolCalls).toBeNull();
    expect(result.terminalToolsCollided).toEqual(["update_scene"]);
  });

  test("#1617 an ORDINARY turn reports NO collisions (the planted control for the field)", async () => {
    const requests: TurnRequest[] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths([[toolFinal("", [{ id: "c1", name: "update_scene", args: '{"weather":"rain"}' }])]], requests),
    });
    const result = await runTurnPipeline(args);
    expect(result.terminalToolsCollided).toEqual([]);
    expect(result.terminalToolCalls?.map((c) => c.name)).toEqual(["update_scene"]);
  });

  // #1604 — after #1404 the terminal half is collected AT THE DEPTH IT WAS EMITTED and accumulated across the
  // whole recurse loop. A folded game that ALSO attaches registry tools can therefore hand the fold several
  // depths' calls; nothing pinned that, and the fold's contract did not state it. Both depths' calls survive,
  // in EMISSION ORDER — which is what makes the fold's last-wins `scene` plane read correctly (a later depth
  // saw the earlier depth's tool results).
  test("#1604 terminal calls from SEVERAL recursion depths all reach the channel, in emission order", async () => {
    const requests: TurnRequest[] = [];
    const executed: string[][] = [];
    const { args } = baseArgs({
      connection: TOOL_CONNECTION,
      tools: fakeToolOps(executed),
      attachedToolNames: ["tick_clock"],
      terminalTools: RPG_TERMINAL_TOOLS,
      runChatTurn: scriptedDepths(
        [
          // Depth 0: a terminal call co-emitted with the registry call that triggers the recursion. The
          // aggregate economics keep only the LAST depth's `toolCalls`, so a re-read here would erase it.
          [
            toolFinal("tick... ", [
              { id: "c1", name: "tick_clock", args: "{}" },
              { id: "c2", name: "update_scene", args: '{"weather":"rain"}' },
            ]),
          ],
          // Depth 1: a second terminal call, emitted after the registry tool's result came back.
          [toolFinal("done.", [{ id: "c3", name: "update_scene", args: '{"weather":"clearing"}' }])],
        ],
        requests,
      ),
    });
    const result = await runTurnPipeline(args);
    // Only the registry half ever recursed — two depths, one execution.
    expect(executed).toEqual([["tick_clock"]]);
    expect(result.terminalToolCalls?.map((c) => c.toolCallId)).toEqual(["c2", "c3"]);
    // Emission order, so the fold's single-valued `scene` plane lands on the LATER depth's view of the world.
    expect(result.terminalToolCalls?.map((c) => c.arguments)).toEqual(['{"weather":"rain"}', '{"weather":"clearing"}']);
  });
});

// ── The CONTENT_CLASS_POLICY ↔ spanToWirePart binding (content-class wire memory: table + hardcoded
// dispatch, edit BOTH — this reds if a policy row's `wire` plane and the dispatch disagree). `image` is
// exempted: its policy row (`wire:"drop"`) covers only the deliberate-user-attachment arm; every other
// embedded image is DISPLAY-ONLY and never rides the wire plane at all (see `WIRE_PART_HANDLERS`'s `image`
// comment in `pipeline.ts`).
describe("spanToWirePart — CONTENT_CLASS_POLICY binding", () => {
  // Empty inline-reply set = §6.7's fence CLOSED: no assistant-row asset rides. The relaxation's own
  // both-directions proof lives in `tests/server/domain/chat/substrate/wire-history.test.ts`.
  const wireEnv = {
    visionOk: true,
    videoOk: false,
    resolveImageUrl: async () => null,
    fullCards: new Set<ContentSpan>(),
    inlineReply: new Map<MessageId, ReadonlySet<AssetId>>(),
  };
  const wireRow = { role: "assistant" as const, userAuthored: false, messageId: undefined };

  test('wire:"full" classes (text/hidden/unknown-directive) ride VERBATIM', async () => {
    expect(CONTENT_CLASS_POLICY.text.wire).toBe("full");
    expect(CONTENT_CLASS_POLICY.hidden.wire).toBe("full");
    expect(CONTENT_CLASS_POLICY["unknown-directive"].wire).toBe("full");

    const textPart = await __spanToWirePartForTest({ kind: "text", text: "hello" }, wireEnv, wireRow);
    expect(textPart).toEqual({ type: "text", text: "hello" });

    const hiddenSpan = { kind: "hidden" as const, tag: "lie", attrs: {}, raw: "<lie>the truth</lie>" };
    const hiddenPart = await __spanToWirePartForTest(hiddenSpan, wireEnv, wireRow);
    expect(hiddenPart).toEqual({ type: "text", text: hiddenSpan.raw });

    const directiveSpan = { kind: "unknown-directive" as const, raw: "<gmnote>note</gmnote>" };
    const directivePart = await __spanToWirePartForTest(directiveSpan, wireEnv, wireRow);
    expect(directivePart).toEqual({ type: "text", text: directiveSpan.raw });
  });

  test('wire:"drop" (choices) strips the span entirely from the wire', async () => {
    expect(CONTENT_CLASS_POLICY.choices.wire).toBe("drop");
    const part = await __spanToWirePartForTest(
      { kind: "choices", options: ["Go north", "Go south"], raw: ":::choices\nGo north\nGo south\n:::" },
      wireEnv,
      wireRow,
    );
    expect(part).toBeNull();
  });

  test("the empty-conversion table SHAPE reads agrees with the dispatch, span kind by span kind", async () => {
    const spans: ContentSpan[] = [
      { kind: "text", text: "hello" },
      { kind: "text", text: "" },
      { kind: "choices", options: ["Go north"], raw: ":::choices\nGo north\n:::" },
      { kind: "hidden", tag: "lie", attrs: {}, raw: "<lie>x</lie>" },
      { kind: "unknown-directive", raw: "<gmnote>n</gmnote>" },
      { kind: "card", title: "T", body: "…", origin: "fence", raw: ':::card title="T"\n…\n:::' },
      { kind: "image", alt: "a cat", ref: { kind: "external", url: "https://example.test/cat.png" } },
    ];
    for (const span of spans) {
      const part = await __spanToWirePartForTest(span, wireEnv, wireRow);
      expect({ kind: span.kind, empty: __spanConvertsToNothingForTest(span) }).toEqual({ kind: span.kind, empty: part === null });
    }
  });

  test('wire:"stub" (card) collapses OUTSIDE the keep-last-X window', async () => {
    expect(CONTENT_CLASS_POLICY.card.wire).toBe("stub");
    const cardSpan = { kind: "card" as const, title: "The Ledger", body: "…", origin: "fence" as const, raw: ':::card title="The Ledger"\n…\n:::' };
    const part = await __spanToWirePartForTest(cardSpan, wireEnv, wireRow);
    expect(part).toEqual({ type: "text", text: "[card: The Ledger]" });
    // Inside the keep-last-X window the card rides full, byte-identical to its raw bytes — the wire=stub
    // plane's declared exception, not a disagreement with the table.
    const fullPart = await __spanToWirePartForTest(cardSpan, { ...wireEnv, fullCards: new Set([cardSpan]) }, wireRow);
    expect(fullPart).toEqual({ type: "text", text: cardSpan.raw });
  });
});

// NARRATOR ASSEMBLY — what an `output:"narrator"` round actually SENDS. A narrator round is ONE call voicing
// every seated character, authored by the synthetic group character, which by construction is NOT in `speakerRefs`.
// These pin the two facts a live drive (2026-08-07, 2026-08-07)
// found MISSING from the wire: the co-speakers' CARDS never reached the model (the system row named the
// primary 7x and the co-speaker 0x), and `{{char}}` bound to the primary alone, so the shipped main-prompt
// framing opened "write <primary>'s perspective only" on a turn voicing everybody. Asserted on
// `request.prompt.static` — the bytes the model receives — never on the shaping API, so the pin is a defect
// proof and not a signature check.
describe("runTurnPipeline — narrator round assembly", () => {
  const groupChar = castId<CharacterId>("char_group_synthetic");
  // BOTH descriptions carry `{{char}}` — ordinary card authoring, and the ONLY shape that catches the
  // card-binding defect. A macro-free description renders identically whichever ctx it is bound against, so
  // the first version of these pins was blind to a live regression: the primary's own card resolved `{{char}}`
  // to the JOINED CHARACTER NAMES ("Charlotte, JFC is a tired archivist") while co-speakers' cards resolved correctly,
  // because only co-speakers were rebound to a single-character sub-ctx.
  const charlotte = { name: "Charlotte", description: "{{char}} is a tired archivist" };
  const jfc = { name: "JFC", description: "{{char}} is a foul-mouthed mechanic" };

  /** The one immutable round ctx a narrator turn is built off: both present members, primary first. */
  function narratorCtx(): AssembleContext {
    return ctxOf({
      character: charlotte,
      characters: [charlotte, jfc],
      speakerRefs: [
        { kind: "character", characterId: castId<CharacterId>("char_charlotte") },
        { kind: "character", characterId: castId<CharacterId>("char_jfc") },
      ],
    });
  }

  /** The prep `engine/round.ts` builds for a narrator round: the SYNTHETIC group character speaks, the
   *  joined character name is the label, and the scope is merged (narrator has no scoped arm). */
  const narratorShape = {
    output: "narrator",
    cardScope: "merged",
    scopedTargetId: null,
    speakerName: "Charlotte, JFC",
    speakerRef: { kind: "character", characterId: groupChar },
  } as const;

  test("every present member's CARD reaches the model, not just the primary's", async () => {
    const { args } = baseArgs({ assembleContext: narratorCtx(), shape: narratorShape });
    const result = await runTurnPipeline(args);
    const system = result.request.prompt.static;
    // The defect: the co-speaker's card was never assembled, so the model was asked to voice a character
    // it had never been shown.
    expect(system).toContain("JFC is a foul-mouthed mechanic");
    // …under the NARRATOR frame, not the per-speaker bystander frame: this call is voicing JFC, so calling
    // them "also present" would contradict the round's own nudge (PROSE slot `chat.group.characterHeading`).
    expect(system).toContain("[Character — JFC]");
    expect(system).not.toContain("[Also present — JFC]");
  });

  test("EVERY member's card resolves `{{char}}` to ITSELF — the primary's no differently from a co-speaker's", async () => {
    // The card-binding regression, at the seam it shipped through. A card's description is written ABOUT its
    // own character, so `{{char}}` in it means "me" — for the PRIMARY exactly as much as for a co-speaker.
    const { args } = baseArgs({ assembleContext: narratorCtx(), shape: narratorShape });
    const system = (await runTurnPipeline(args)).request.prompt.static;
    expect(system).toContain("Charlotte is a tired archivist");
    expect(system).toContain("JFC is a foul-mouthed mechanic");
    // The precise failure the first pass shipped: the joined character names leaking into the primary's own card.
    expect(system).not.toContain("Charlotte, JFC is a tired archivist");
  });

  test("`{{char}}` binds to the WHOLE character set in the PRESET framing, which is the one place it should", async () => {
    const { args } = baseArgs({ assembleContext: narratorCtx(), shape: narratorShape });
    const result = await runTurnPipeline(args);
    // The narrator arm resolves NARRATOR_MAIN_PROMPT_TEMPLATE ("…voicing {{char}} and the world around
    // them", `assembly/assemble` templateFor) — preset-authored framing, not card-derived text, so it keeps
    // the TURN's speaker arm and `{{char}}` is the joined character names (the split `cardOwnerCtx` draws).
    expect(result.request.prompt.static).toContain("voicing Charlotte, JFC and the world around them");
    // …and it never carries the per-speaker default's single-perspective clause on a round voicing both.
    expect(result.request.prompt.static).not.toContain("perspective only");
  });

  test("an EMPTY-but-defined character set floors `{{char}}` to the primary instead of shipping an empty name", async () => {
    // Reachable: `getCard` returning falsy for every seated id leaves `characters: []`/`speakerRefs: []` (both
    // DEFINED, so the absent-characters early return does not fire) while a narrator round still runs. An unfloored
    // members list joins to "" — the narrator framing would ship "voicing  and the world around them".
    const { args } = baseArgs({
      assembleContext: ctxOf({ character: charlotte, characters: [], speakerRefs: [] }),
      shape: narratorShape,
    });
    const system = (await runTurnPipeline(args)).request.prompt.static;
    expect(system).toContain("voicing Charlotte and the world around them");
    expect(system).not.toContain("voicing  and the world");
  });

  // THE ROUND-SCOPED REGEX PLACEMENTS AGREE ON `{{char}}`. `PROMPT_HISTORY` and `AI_OUTPUT`/`REASONING` are
  // both transforms OF ONE ROUND — the prompt it sends and the reply it gets back — so a host script that
  // writes `{{char}}` must mean the same character in both or the same library contradicts itself inside one
  // turn. (`USER_INPUT` is the deliberate exception: it runs at SEND, before arbitration exists — see
  // `assembly/context` runSendAuthorTransforms.) Driven on a PER-SPEAKER round whose speaker is NOT the
  // primary, because that is the only shape where the two ctxs could disagree.
  test("PROMPT_HISTORY and AI_OUTPUT resolve `{{char}}` to the SAME character (this round's voice)", async () => {
    const { args } = baseArgs({
      runChatTurn: finalTurn("OUT"),
      canon: [userRow("TOKEN")],
      assembleContext: ctxOf({
        ...narratorCtx(),
        hostTierRegexScripts: [script("h", "TOKEN", "<<{{char}}>>", "PROMPT_HISTORY"), script("a", "OUT", "<<{{char}}>>", "AI_OUTPUT")],
      }),
      shape: {
        output: "per-speaker",
        cardScope: "merged",
        scopedTargetId: null,
        speakerName: "JFC",
        speakerRef: { kind: "character", characterId: castId<CharacterId>("char_jfc") },
      },
    });
    const result = await runTurnPipeline(args);
    const history = historyText(result.request);
    expect(history).toContain("<<JFC>>");
    expect(result.content).toBe("<<JFC>>");
  });

  test("a PER-SPEAKER merged round renders the roster layout — the joined {{char}}, every card, no speaker named", async () => {
    const { args } = baseArgs({
      assembleContext: narratorCtx(),
      shape: {
        output: "per-speaker",
        cardScope: "merged",
        scopedTargetId: null,
        speakerName: "JFC",
        speakerRef: { kind: "character", characterId: castId<CharacterId>("char_jfc") },
      },
    });
    const system = (await runTurnPipeline(args)).request.prompt.static;
    expect(system).toContain("You are Charlotte, JFC in an immersive");
    expect(system).toContain("[Character — JFC]");
    // Card binding is unchanged on this arm: each card still says "me", and always did.
    expect(system).toContain("JFC is a foul-mouthed mechanic");
    expect(system).toContain("Charlotte is a tired archivist");
  });
});
