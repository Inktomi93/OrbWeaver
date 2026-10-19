// engine/pipeline — display-only images (the attachment-only wire rule), compaction shrinkage, narrator <speaker> markers and the token-budget reserve.

import type { MessageView } from "@orb/contracts/chat";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { UserIntent } from "@orb/contracts/preset";
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Resolved } from "@orb/inference";
import type { CharacterId, MessageId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { testModelId } from "@orb/testkit/iso/inference-identities.ts";
import { makeCapability, makeGenerationCapability } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import type { RunChatTurnOp, TurnRequest } from "./_pipeline-support.ts";
import { assistantRow, baseArgs, CONNECTION, ctxOf, historyText, rowOf, runTurnPipeline, scriptedTurn, userRow } from "./_pipeline-support.ts";

// ── The ATTACHMENT-ONLY image wire rule (owner ruling, ST parity) ────────────────────────────────────────
// A model-visible image part requires a DELIBERATE user attachment: an owned-CAS `asset:` ref on a
// user-authored row. Every other embedded image — an imported card's greeting picture (the Aveline bug: the
// card ends its greeting with `![](https://files.catbox.moe/….png)` and that rode a vision turn as a real
// image part), narrator/`/imagine` media, a pasted link — is DISPLAY-ONLY: it renders forever, and the wire
// gets a short marker instead of both the image part AND the raw URL bytes.
const VISION: Resolved<"chat"> = {
  ...CONNECTION,
  capability: makeCapability(
    makeGenerationCapability({ input: ["text", "image"], output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context: { window: 200_000 } }),
  ),
};
/** The real Aveline card's greeting image target (external, empty alt) — the bug's exact shape. */
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

  test("an ask above the model's output cap reserves the cap the wire clamps to, so the fit keeps that history", async () => {
    // Same window and chat as the large-reserve case above; this model's cap sits far below the ask, so the runner
    // sends at most the cap and the fit must reserve no more than that.
    const cappedConnection: Resolved<"chat"> = {
      ...CONNECTION,
      capability: makeCapability(makeGenerationCapability({ output: { maxTokens: { min: 1, max: 256 }, modalities: ["text"] }, context: { window: 32_768 } })),
    };
    const chat = Array.from({ length: 10 }, (_, i) => rowOf(i % 2 === 0 ? "user" : "assistant", `turn ${i} carrying several words to burn a few tokens here`));
    const result = await runTurnPipeline(
      baseArgs({ intent: { maxOutputTokens: 32_700 } satisfies UserIntent, connection: cappedConnection, canon: chat }).args,
    );
    expect(result.droppedCount).toBe(0);
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

  // Ollama's native route sends the window as `num_ctx`: the turn sends and budgets ONE window, the preset's.
  test("on a route whose window the request sets, maxContextTokens is the window the turn sends and fits", async () => {
    const generation = (context: GenerationCapability["context"]): Resolved<"chat"> => ({
      ...CONNECTION,
      capability: makeCapability(makeGenerationCapability({ output: { maxTokens: { min: 1, max: 8192 }, modalities: ["text"] }, context })),
    });
    const ollama = generation({ window: 4096, windowEstimated: true, settable: { max: 32_768 } });
    const sent: TurnRequest[] = [];
    const recording: RunChatTurnOp = (req) => {
      sent.push(req);
      return scriptedTurn([{ kind: "final", economics: { content: "ok", tokensIn: 1, tokensOut: 1, model: testModelId("test-model") } }])(req);
    };
    const intent = { maxOutputTokens: 100, maxContextTokens: 16_384 } satisfies UserIntent;

    const result = await runTurnPipeline(baseArgs({ intent, connection: ollama, runChatTurn: recording }).args);
    const control = await runTurnPipeline(baseArgs({ intent, connection: generation({ window: 16_384 }) }).args);

    expect(sent[0]?.connection.capability).toMatchObject({ generation: { context: { window: 16_384 } } });
    expect(result.fitCeilingTokens).toBe(control.fitCeilingTokens);
    const unset = await runTurnPipeline(baseArgs({ intent: { maxOutputTokens: 100 }, connection: ollama, runChatTurn: recording }).args);
    expect(sent[1]?.connection).toBe(ollama);
    expect(unset.fitCeilingTokens).toBeLessThanOrEqual(4096);
  });
});
