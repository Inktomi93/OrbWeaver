// engine/pipeline — narrator round assembly and the history fit on a squashed same-role run.

import { createHash } from "node:crypto";
import type { AssembleContext, ChatInjection, MessageView } from "@orb/contracts/chat";
import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Resolved } from "@orb/inference";
import type { CharacterId, ModelId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { makeCapability, makeResolved } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import type { TurnRequest } from "./_pipeline-support.ts";
import {
  ARIA,
  BEFORE_HISTORY_DEPTH,
  baseArgs,
  CAPABILITY,
  ctxOf,
  FIXTURE_HUMAN,
  finalTurn,
  historyText,
  KAI,
  runTurnPipeline,
  script,
  userRow,
} from "./_pipeline-support.ts";
import fitGoldens from "./pipeline-fit.goldens.json" with { type: "json" };

type PipelineResult = Awaited<ReturnType<typeof runTurnPipeline>>;

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

// ── The history fit holds a hard window when SHAPE squashes a same-role run ─────────────────────────────
// A merging level on a wire that does not cache by explicit markers joins a run of stored rows into ONE row
// carrying the first row's id. That row is the newest id-bearing row, so the post-shape fit can never cut it;
// the stored rows are trimmed before SHAPE instead, and every request that already fit stays byte-identical.
describe("runTurnPipeline — the history fit on a squashed run", () => {
  const MergingLevels = ["semi-strict", "strict", "merge"] as const;
  const AllLevels = ["none", ...MergingLevels] as const;
  const Dense = "word ".repeat(300);
  const Filler = "several words that spend tokens on every single row here";
  const Authors = [ARIA, KAI] as const;

  const storedRow = (seq: number, role: "user" | "assistant", content: string, characterId: CharacterId | null = null): MessageView =>
    // @orb-waive no-test-fabrication(unknown): same slim-double judgment as seqRow/rowOf above, with the seq the compaction cut reads. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
    ({
      id: mintTypeId(ID_PREFIX.message),
      seq,
      role,
      kind: "standard",
      content,
      excludedFromPrompt: false,
      characterId,
      personaId: null,
      authorUserId: role === "user" ? FIXTURE_HUMAN : null,
    }) as unknown as MessageView;

  // `roleHandlingFloor: none` is a stated floor that lets the preset's own level through unclamped.
  const wire = (providerId: string, model: string, explicitPromptCache: boolean, window: number): Resolved<"chat"> =>
    makeResolved({
      providerId,
      model: castId<ModelId>(model),
      capability: makeCapability({
        ...CAPABILITY,
        context: { window },
        turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "none", explicitPromptCache },
      }),
    });
  const Wires = {
    local: (window: number) => wire("ollama", "qwen3:8b", false, window),
    anthropic: (window: number) => wire("anthropic", "claude-sonnet-5", true, window),
    openrouter: (window: number) => wire("openrouter", "anthropic/claude-sonnet-5", true, window),
  } as const;

  const presetAt = (roleHandling: (typeof AllLevels)[number]): PromptConfig => ({
    ...DEFAULT_PROMPT_CONFIG,
    params: { ...DEFAULT_PROMPT_CONFIG.params, advanced: { roleHandling } },
  });
  const groupCtx = (over: Partial<AssembleContext>): AssembleContext =>
    ctxOf({
      characters: [
        { name: "Aria", description: "a bold knight" },
        { name: "Kai", description: "a quiet scout" },
      ],
      characterIds: [ARIA, KAI],
      ...over,
    });

  // Greeting-first, alternating, ending on the user's row.
  const alternating = (rows: number): MessageView[] =>
    Array.from({ length: rows }, (_, i) => storedRow(i + 1, i % 2 === 0 ? "assistant" : "user", `turn ${i + 1} ${Filler}`));
  // Rounds of two or three characters answering one user row: same-role assistant runs from several authors.
  const group = (rounds: number): MessageView[] => {
    const rows: MessageView[] = [];
    for (let round = 0; round < rounds; round += 1) {
      rows.push(storedRow(rows.length + 1, "user", `round ${round} ${Filler}`));
      for (let reply = 0; reply < 2 + (round % 2); reply += 1) {
        rows.push(storedRow(rows.length + 1, "assistant", `reply ${round}.${reply} ${Filler}`, Authors[reply % 2] ?? ARIA));
      }
    }
    rows.push(storedRow(rows.length + 1, "user", `final ${Filler}`));
    return rows;
  };

  const text = (m: TurnRequest["history"][number] | undefined): string => (m?.content ?? []).map((p) => (p.type === "text" ? p.text : "")).join("");
  const fits = (result: PipelineResult): boolean => result.fitCeilingTokens !== null && result.fitUsedTokens <= result.fitCeilingTokens;

  describe("a run too large for the window is trimmed before SHAPE", () => {
    test.each(MergingLevels)("20 consecutive user rows on an 8k window keep the request inside it at `%s`", async (level) => {
      const canon = [storedRow(1, "assistant", "greeting"), ...Array.from({ length: 20 }, (_, i) => storedRow(i + 2, "user", `note ${i + 2} ${Dense}`))];
      const result = await runTurnPipeline(baseArgs({ canon, connection: Wires.local(8192), assembleContext: ctxOf({ promptConfig: presetAt(level) }) }).args);

      expect(fits(result)).toBe(true);
      expect(result.droppedCount).toBeGreaterThan(0);
      // The dropped count is in stored rows, and the boundary names the first stored row the request opens on.
      const firstKept = canon[result.droppedCount];
      expect(result.contextBoundaryMessageId).toBe(firstKept?.id);
      expect(text(result.request.history[0]).startsWith(firstKept?.content ?? "∅")).toBe(true);
      expect(historyText(result.request)).toContain("note 21 ");
    });

    test.each(MergingLevels)("a round of 20 replies from two characters on a local 8k window fits at `%s`", async (level) => {
      const canon = [
        storedRow(1, "user", "go"),
        ...Array.from({ length: 20 }, (_, i) => storedRow(i + 2, "assistant", `reply ${i + 2} ${Dense}`, Authors[i % 2] ?? ARIA)),
      ];
      const result = await runTurnPipeline(
        baseArgs({ canon, connection: Wires.local(8192), assembleContext: groupCtx({ promptConfig: presetAt(level) }) }).args,
      );

      expect(fits(result)).toBe(true);
      expect(result.droppedCount).toBeGreaterThan(0);
      expect(result.contextBoundaryMessageId).toBe(canon[result.droppedCount]?.id);
      expect(historyText(result.request)).toContain("reply 21 ");
    });
  });

  // Every case below must reach the wire exactly as before the pre-trim existed: the goldens were recorded from the
  // pipeline that had no pre-trim. The `overflow/` cases overrun the window without a squashed run (a lone oversized
  // row, an oversized newest row beside a note), which the pre-trim must leave as the old fit left them.
  describe("a request without a squashed overrun is byte-identical", () => {
    const Variants = {
      plain: {},
      marker: {
        chatInjections: [
          { position: "in_chat", depth: BEFORE_HISTORY_DEPTH, role: "user", content: "[Start a new chat]", origin: "new-chat-marker" },
        ] satisfies ChatInjection[],
      },
      compacted: { compactSummary: "the story so far", compactedThroughSeq: 3 },
    } as const;
    const Cap = { maxContextTokens: 1500, maxOutputTokens: 128 } satisfies UserIntent;

    interface FitCase {
      readonly canon: readonly MessageView[];
      readonly connection: Resolved<"chat">;
      readonly ctx: AssembleContext;
      readonly intent: UserIntent;
    }
    function cases(): Record<string, FitCase> {
      const out: Record<string, FitCase> = {};
      for (const level of AllLevels) {
        for (const [wireName, wireAt] of Object.entries(Wires)) {
          for (const [variant, over] of Object.entries(Variants)) {
            const promptConfig = presetAt(level);
            out[`alternating/${level}/${wireName}/${variant}/roomy`] = {
              canon: alternating(9),
              connection: wireAt(200_000),
              ctx: ctxOf({ promptConfig, ...over }),
              intent: {},
            };
            out[`group/${level}/${wireName}/${variant}/roomy`] = {
              canon: group(3),
              connection: wireAt(200_000),
              ctx: groupCtx({ promptConfig, ...over }),
              intent: {},
            };
            out[`alternating/${level}/${wireName}/${variant}/capped`] = {
              canon: alternating(121),
              connection: wireAt(200_000),
              ctx: ctxOf({ promptConfig, ...over }),
              intent: Cap,
            };
            out[`group/${level}/${wireName}/${variant}/capped`] = {
              canon: group(28),
              connection: wireAt(200_000),
              ctx: groupCtx({ promptConfig, ...over }),
              intent: Cap,
            };
          }
        }
      }
      return { ...out, ...overflowCases() };
    }
    function overflowCases(): Record<string, FitCase> {
      const out: Record<string, FitCase> = {};
      const note: ChatInjection = { position: "in_chat", depth: 2, role: "system", content: "Author's note." };
      for (const level of AllLevels) {
        for (const [wireName, wireAt] of Object.entries(Wires)) {
          const promptConfig = presetAt(level);
          const oversized = Dense.repeat(30);
          out[`overflow/lone/${level}/${wireName}`] = {
            canon: [storedRow(1, "user", oversized)],
            connection: wireAt(8192),
            ctx: ctxOf({ promptConfig }),
            intent: {},
          };
          const newest = [
            storedRow(1, "assistant", "greeting"),
            storedRow(2, "user", "hi there"),
            storedRow(3, "assistant", "hello back"),
            storedRow(4, "user", oversized),
          ];
          out[`overflow/oversized-newest/${level}/${wireName}/plain`] = { canon: newest, connection: wireAt(8192), ctx: ctxOf({ promptConfig }), intent: {} };
          out[`overflow/oversized-newest/${level}/${wireName}/note`] = {
            canon: newest,
            connection: wireAt(8192),
            ctx: ctxOf({ promptConfig, chatInjections: [note] }),
            intent: {},
          };
          // A squashed reply run that overruns for another reason: one oversized reply, or an oversized system prompt.
          out[`overflow/group-oversized-reply/${level}/${wireName}`] = {
            canon: [storedRow(1, "user", "go"), storedRow(2, "assistant", "small", ARIA), storedRow(3, "assistant", oversized, KAI)],
            connection: wireAt(8192),
            ctx: groupCtx({ promptConfig }),
            intent: {},
          };
          out[`overflow/group-oversized-system/${level}/${wireName}`] = {
            canon: [storedRow(1, "user", "go"), storedRow(2, "assistant", "first small", ARIA), storedRow(3, "assistant", "second small", KAI)],
            connection: wireAt(8192),
            ctx: groupCtx({ promptConfig, character: { name: "Aria", description: oversized } }),
            intent: {},
          };
        }
      }
      return out;
    }

    test("every level, wire and marker matches the goldens recorded before the pre-trim", async () => {
      const seen: Record<string, { droppedCount: number; boundaryIndex: number; sha256: string }> = {};
      const overflowing: string[] = [];
      for (const [name, c] of Object.entries(cases())) {
        const result = await runTurnPipeline(baseArgs({ canon: [...c.canon], connection: c.connection, assembleContext: c.ctx, intent: c.intent }).args);
        if (!fits(result)) {
          overflowing.push(name);
        }
        const wireBytes = JSON.stringify({
          history: result.request.history,
          breakpoint: result.request.cacheBreakpointFromEnd,
          cue: result.cue,
          fitUsedTokens: result.fitUsedTokens,
          fitCeilingTokens: result.fitCeilingTokens,
        });
        seen[name] = {
          droppedCount: result.droppedCount,
          boundaryIndex: c.canon.findIndex((m) => m.id === result.contextBoundaryMessageId),
          sha256: createHash("sha256").update(wireBytes).digest("hex"),
        };
      }
      // Only the `overflow/` cases overrun; every other case fits, so its identity covers the cut and the cache prefix.
      expect(overflowing).toEqual(Object.keys(cases()).filter((name) => name.startsWith("overflow/")));
      // The capped cases cut, so the identity includes the cut point and the chunk boundary it snaps to.
      expect(Object.entries(seen).filter(([name, s]) => name.endsWith("/capped") && s.droppedCount === 0)).toEqual([]);
      expect(seen).toEqual(fitGoldens);
    });
  });
});
