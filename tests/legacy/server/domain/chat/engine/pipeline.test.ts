// engine/pipeline — the per-turn execution pipeline: assemble→shape→fit→request→reduce. Pins the stream
// reduce (deltas → final text + economics), the shaped request, the §8 fit, and ctx immutability.

import type { ChatInjection, MessageView } from "@orb/contracts/chat";
import type { UserIntent } from "@orb/contracts/preset";
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { ContentImageRef } from "@orb/kit/content";
import type { ChatId, MessageId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImageRefAssets } from "@orb/server/domain/chat";
import { resolveImageRefToUrl } from "@orb/server/domain/chat";
import { FROZEN_AT_MS } from "@orb/testkit/iso/clock.ts";
import { makeCapability, makeGenerationCapability, makeResolved } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe, vi } from "vitest";
import { HISTORY_TRIM_CHUNK_FRACTION, historyTurnTokens } from "#server/domain/chat/assembly/history-budget.ts";
import { CHAT_OP_CODES, ChatOperationError } from "#server/domain/chat/contract/errors.ts";
import type { RunChatTurnOp, TurnRequest, TurnStreamChunk } from "./_pipeline-support.ts";
import {
  BEFORE_HISTORY_DEPTH,
  baseArgs,
  CAPABILITY,
  CONNECTION,
  ctxOf,
  readsPriorCache,
  rowOf,
  runTurnPipeline,
  scriptedTurn,
  userRow,
} from "./_pipeline-support.ts";

type PipelineResult = Awaited<ReturnType<typeof runTurnPipeline>>;

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
    // @orb-waive no-test-fabrication(ChatOperationError): baselined when the gate widened to value casts; burn-down item 906.
    expect((failure as ChatOperationError).code).toBe(CHAT_OP_CODES.promptTransformAborted);
    // The transform's own words reach the author — that is what makes a refusal actionable.
    // @orb-waive no-test-fabrication(ChatOperationError): baselined when the gate widened to value casts; burn-down item 906.
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

  test("the host's custom stopping strings fold into the request intent's stop set (dedup, intent-first)", async () => {
    const { args } = baseArgs({ intent: { stop: ["<END>"] } satisfies UserIntent, extraStopSequences: ["<END>", "\nUser:"] });
    const result = await runTurnPipeline(args);
    // resolveSampling reads request.intent.stop — the preset/intent stops come first, then the host's, Set-deduped.
    expect(result.request.intent.stop).toEqual(["<END>", "\nUser:"]);
  });

  test("no custom stops leaves the request intent untouched but for the materialized maxOutputTokens", async () => {
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
    // TurnMessage wire `name`. The user row's author is the active persona ("Alex").
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
    expect(named?.name).toBe("Alex");
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

  for (const example of [
    { name: "unsupported MP4", mime: "video/mp4", frames: 1, videoOk: false, media: "video" },
    { name: "unsupported animated GIF", mime: "image/gif", frames: 2, videoOk: false, media: "video" },
    { name: "static GIF", mime: "image/gif", frames: 1, videoOk: false, media: "image" },
    { name: "supported MP4", mime: "video/mp4", frames: 1, videoOk: true, media: "video" },
    { name: "supported animated GIF", mime: "image/gif", frames: 2, videoOk: true, media: "video" },
  ] as const) {
    const bytes = Uint8Array.from(example.mime === "image/gif" ? [0x47, 0x49, 0x46, 0x38, 0x39, 0x61] : [7, 8, 9]);
    const prepared = Uint8Array.from([1, 2, 3]);
    const motionPrepared = example.media === "video" && example.videoOk;
    const videoDropped = example.media === "video" && !example.videoOk;
    const output = example.media === "video" ? prepared : bytes;
    const expectedContent = videoDropped
      ? [{ type: "text", text: "[video: a clip]" }]
      : [{ type: example.media, url: `data:${example.media === "video" ? "video/mp4" : "image/gif"};base64,${Buffer.from(output).toString("base64")}` }];
    test(`the actual media resolver keeps preparation behind the pipeline capability gate: ${example.name}`, async () => {
      const host = castId<UserId>("user_host");
      const chatId = castId<ChatId>("chat_a");
      const quality = { imageDetail: "high", videoMaxResolution: "480" } as const;
      const signal = new AbortController().signal;
      const prepareVideo = vi.fn<ImageRefAssets["prepareVideo"]>(() =>
        example.videoOk ? Promise.resolve(prepared) : Promise.reject(new Error("Unsupported motion must never reach the decoder")),
      );
      const frameCount = vi.fn(() => Promise.resolve(example.frames));
      const assets: ImageRefAssets = {
        assetCasRefById: () => Promise.resolve({ ownerId: host, mime: example.mime }),
        loadAssetBytes: () => Promise.resolve(bytes),
        frameCount,
        prepareVideo,
      };
      const memberGate = vi.fn(() => Promise.reject(new Error("The frozen host's asset must not need a membership lookup")));
      const connection = makeResolved({
        generation: makeGenerationCapability({ ...CAPABILITY, input: example.videoOk ? ["text", "image", "video"] : ["text", "image"] }),
      });
      const result = await runTurnPipeline(
        baseArgs({
          connection,
          attachmentQuality: quality,
          chatId,
          signal,
          resolveImageUrl: (ref) => resolveImageRefToUrl(assets, memberGate, false, { ownerId: host, chatId, ref, quality, signal }),
          canon: [rowOf("assistant", "previous reply"), userRow("![a clip](asset:ast_9)")],
        }).args,
      );
      expect(memberGate).not.toHaveBeenCalled();
      expect(frameCount).toHaveBeenCalledTimes(example.mime === "image/gif" ? 1 : 0);
      expect(result.imageDropped).toBe(false);
      expect(prepareVideo.mock.calls).toEqual(motionPrepared ? [[bytes, example.mime, "480", { signal }]] : []);
      expect(result.videoDropped).toBe(videoDropped);
      expect(result.request.history.at(-1)?.content).toEqual(expectedContent);
    });
  }

  test("an admitted video's preparation failure remains a real turn failure", async () => {
    const failure = new Error("Video preparation failed");
    const prepareVideo = vi.fn<ImageRefAssets["prepareVideo"]>(() => Promise.reject(failure));
    const host = castId<UserId>("user_host");
    const chatId = castId<ChatId>("chat_a");
    const assets: ImageRefAssets = {
      assetCasRefById: () => Promise.resolve({ ownerId: host, mime: "video/mp4" }),
      loadAssetBytes: () => Promise.resolve(Uint8Array.from([7, 8, 9])),
      frameCount: () => Promise.resolve(1),
      prepareVideo,
    };
    const { args } = baseArgs({
      connection: makeResolved({ generation: makeGenerationCapability({ ...CAPABILITY, input: ["text", "image", "video"] }) }),
      resolveImageUrl: (ref) => resolveImageRefToUrl(assets, () => Promise.resolve(false), false, { ownerId: host, chatId, ref }),
      canon: [userRow("![a clip](asset:ast_9)")],
    });
    await expect(runTurnPipeline(args)).rejects.toBe(failure);
    expect(prepareVideo).toHaveBeenCalledOnce();
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
