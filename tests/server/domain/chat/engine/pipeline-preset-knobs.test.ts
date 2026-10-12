// engine/pipeline — history macro resolution, the preset knobs (roleHandling, squash, params fold), the name-stamp axis, persona axes and the user-macro registry.

import type { ChatInjection } from "@orb/contracts/chat";
import type { GenerationCapability } from "@orb/contracts/inference";
import type { PromptConfig, UserIntent } from "@orb/contracts/preset";
import { DEFAULT_MAX_OUTPUT_TOKENS, DEFAULT_PROMPT_CONFIG } from "@orb/contracts/preset";
import type { Resolved } from "@orb/inference";
import type { ModelId } from "@orb/kit/ids";
import { castId, ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { DEFAULT_PERSONA_NAME } from "@orb/kit/persona";
import { makeCapability, makeResolved } from "@orb/testkit/node/factories/resolved-connection.ts";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { buildTurnUserMacros } from "#server/domain/chat/assembly/user-macros.ts";
import type { TurnRequest } from "./_pipeline-support.ts";
import {
  ARIA,
  assistantRow,
  baseArgs,
  CAPABILITY,
  CONNECTION,
  ctxOf,
  historyText,
  KAI,
  MIRA,
  macroNamesOf,
  runTurnPipeline,
  userRow,
  userRowWithPersona,
  ZARA,
} from "./_pipeline-support.ts";

type PipelineResult = Awaited<ReturnType<typeof runTurnPipeline>>;

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
    // personaId=Mira (the Chat-Macro-Resolution.md §6 3-way-distinct fixture). The stamp wins over BOTH
    // axes — the row's personaId is the macro subject now, not just attribution chrome.
    const ctx = ctxOf({
      pinnedPersona: { name: "Nyx", description: "the frozen anchor POV" },
      activePersona: { name: "Zara", description: "the live active persona" },
    });
    const { args } = baseArgs({
      assembleContext: ctx,
      canon: [userRowWithPersona("{{user}} nods", MIRA)],
      historyMacroNames: macroNamesOf([], [{ id: MIRA, name: "Mira" }]),
    });
    const result = await runTurnPipeline(args);
    const text = historyText(result.request);
    expect(text).toContain("Mira nods");
    expect(text).not.toContain("Zara nods");
    expect(text).not.toContain("Nyx nods");
  });

  test("two rows with DIFFERENT personaId stamps each resolve {{user}} to their OWN persona", async () => {
    const { args } = baseArgs({
      canon: [userRowWithPersona("{{user}} waves", ZARA), userRowWithPersona("{{user}} nods", MIRA)],
      historyMacroNames: macroNamesOf(
        [],
        [
          { id: ZARA, name: "Zara" },
          { id: MIRA, name: "Mira" },
        ],
      ),
    });
    const result = await runTurnPipeline(args);
    const text = historyText(result.request);
    expect(text).toContain("Zara waves");
    expect(text).toContain("Mira nods");
  });

  test("a null personaId stamp falls back to the chat ANCHOR (pinnedPersona), never the active persona", async () => {
    // Ruling A (Chat-Macro-Resolution.md §2/§4): a null-stamp history row's {{user}} resolves to the chat
    // ANCHOR, never the per-viewer active persona (Alex, the ctxOf default) — so a greeting / AI / legacy
    // line addresses the SAME persona for the model and every human.
    const ctx = ctxOf({ pinnedPersona: { name: "Nyx", description: "the frozen anchor" } });
    const { args } = baseArgs({ assembleContext: ctx, canon: [userRow("{{user}} nods")] });
    const result = await runTurnPipeline(args);
    const text = historyText(result.request);
    expect(text).toContain("Nyx nods");
    expect(text).not.toContain("Alex nods");
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

  // A model no tier measured runs the floor's GUESS (`turnsEstimated`): the preset's level goes out unclamped and
  // decides where a system row may sit; an unset knob still runs the fail-closed floor. A STATED floor clamps.
  const note: ChatInjection = { position: "in_chat", depth: 2, role: "system", content: "Author's note." };
  const midHistory = [userRow("u1"), assistantRow("a1", ARIA), userRow("u2"), assistantRow("a2", ARIA), userRow("u3")];
  const unmeasured: Resolved<"chat"> = {
    ...CONNECTION,
    capability: makeCapability({
      ...CAPABILITY,
      turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: false },
      turnsEstimated: ["assistantPrefill", "midConversationSystem", "historySystemRows", "roleHandlingFloor"],
    }),
  };
  const systemRows = (req: TurnRequest): TurnRequest["history"] => req.history.filter((h) => h.role === "system");
  const noteTurn = (connection: Resolved<"chat">, promptConfig?: PromptConfig): Promise<PipelineResult> =>
    runTurnPipeline(
      baseArgs({ canon: midHistory, connection, assembleContext: ctxOf({ chatInjections: [note], ...(promptConfig === undefined ? {} : { promptConfig }) }) })
        .args,
    );

  test("an unmeasured model with the preset at `none` sends the mid-history system row as a system row", async () => {
    const result = await noteTurn(unmeasured, presetWith("none"));
    expect(systemRows(result.request).map((row) => row.content.map((part) => (part.type === "text" ? part.text : "")).join(""))).toEqual(["Author's note."]);
    expect(result.request.history.at(-1)?.role).toBe("user");
  });

  test("an unmeasured model with no preset level still runs the fail-closed floor: the note folds into user text", async () => {
    expect(systemRows((await noteTurn(unmeasured)).request)).toHaveLength(0);
  });

  test("a STATED strict floor still clamps a preset `none`: the note folds", async () => {
    expect(systemRows((await noteTurn(withFloor("strict"), presetWith("none"))).request)).toHaveLength(0);
  });

  // A documented route is required: a model-family name on an unknown Custom connection is not cache admission.
  const caching = (model: string): Resolved<"chat"> =>
    makeResolved({
      providerId: "openrouter",
      factsModel: castId<ModelId>(model),
      capability: makeCapability({
        ...CAPABILITY,
        turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "strict", explicitPromptCache: true },
      }),
    });

  // Stored rows: only a row with an id is canon, and only canon rows stay apart.
  const twoStoredAssistants = [
    userRow("u1"),
    { ...assistantRow("First.", ARIA), id: mintTypeId(ID_PREFIX.message) },
    { ...assistantRow("Second.", KAI), id: mintTypeId(ID_PREFIX.message) },
  ];

  test("an Anthropic model that caches by explicit markers keeps the adjacent stored rows APART under `strict`", async () => {
    const result = await runTurnPipeline(baseArgs({ canon: twoStoredAssistants, connection: caching("claude-sonnet-5") }).args);
    expect(assistantRows(result.request)).toHaveLength(2);
  });

  test("a generic explicit flag without a documented marker protocol still MERGES them", async () => {
    const result = await runTurnPipeline(baseArgs({ canon: twoStoredAssistants, connection: caching("google/gemini-3-pro") }).args);
    expect(assistantRows(result.request)).toHaveLength(1);
  });
});

// The `squashSystemMessages` PROMPT knob (`params.advanced`, ST-imported from
// `squash_system_messages`) is a live SHAPE reader — consecutive system-note runs merge into ONE note BEFORE
// the system→user fold, orthogonal to `roleHandling`. Two adjacent depth-0 system injections are the
// observable on a non-merging level: ON ⇒ ONE folded row (merge-before-convert), OFF ⇒ TWO rows (no role-squash
// merges them, so the KNOB alone decides). A broken re-thread would read a now-absent field → default OFF →
// fail the ON case.
describe("runTurnPipeline — squashSystemMessages is the PRESET knob, folded at SHAPE", () => {
  const systemNotes: ChatInjection[] = [
    { position: "in_chat", depth: 0, role: "system", content: "sys-alpha" },
    { position: "in_chat", depth: 0, role: "system", content: "sys-beta" },
  ];
  const presetSquash = (squashSystemMessages: boolean | undefined): PromptConfig => ({
    ...DEFAULT_PROMPT_CONFIG,
    params: { ...DEFAULT_PROMPT_CONFIG.params, advanced: { roleHandling: "none", ...(squashSystemMessages === undefined ? {} : { squashSystemMessages }) } },
  });
  const nonMerging: Resolved<"chat"> = {
    ...CONNECTION,
    capability: makeCapability({
      ...CAPABILITY,
      turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "none", explicitPromptCache: false },
    }),
  };
  const noteRows = (req: TurnRequest): string[] =>
    req.history.flatMap((h) => {
      const text = h.content.flatMap((p) => (p.type === "text" ? [p.text] : [])).join("");
      return text.includes("sys-") ? [text] : [];
    });

  test("preset squashSystemMessages:true ⇒ the two system notes fold into ONE row (preset value reached SHAPE)", async () => {
    const { args } = baseArgs({ connection: nonMerging, assembleContext: ctxOf({ promptConfig: presetSquash(true), chatInjections: systemNotes }) });
    const result = await runTurnPipeline(args);
    expect(noteRows(result.request)).toEqual(["sys-alpha\n\nsys-beta"]);
  });

  test("preset squashSystemMessages absent ⇒ the notes stay TWO separate rows", async () => {
    const { args } = baseArgs({ connection: nonMerging, assembleContext: ctxOf({ promptConfig: presetSquash(undefined), chatInjections: systemNotes }) });
    const result = await runTurnPipeline(args);
    expect(noteRows(result.request)).toEqual(["sys-alpha", "sys-beta"]);
  });
});

describe("runTurnPipeline — the preset params fold into the wire request", () => {
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
    // Active persona is Alex; the row is authored under Mira (a since-switched persona). The wire `name` must
    // be Mira — the row's own author — not the current active (which would misattribute Mira's line to Alex).
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
      canon: [userRowWithPersona("hi there", MIRA)],
      historyMacroNames: macroNamesOf([], [{ id: MIRA, name: "Mira" }]),
    });
    const result = await runTurnPipeline(args);
    const named = result.request.history.find((m) => m.name !== undefined);
    expect(named?.name).toBe("Mira");
  });

  test('"default" mode prefixes a user row authored under a since-switched persona (disambiguation is now LIVE)', async () => {
    // author (Mira) ≠ the active persona (Alex) → "default" prefixes the row. Before F4 every user row was
    // stamped with the active persona, so author always equalled speakers.user and this NEVER fired.
    const { args } = baseArgs({
      canon: [userRowWithPersona("hi there", MIRA)],
      historyMacroNames: macroNamesOf([], [{ id: MIRA, name: "Mira" }]),
    });
    const result = await runTurnPipeline(args);
    expect(historyText(result.request)).toContain("Mira: hi there");
  });

  // Still true, and now for a STATED reason: the row is the active persona owner's (`authorUserId === activePersonaUserId`),
  // which is the only case SHAPE's null-stamp guard lets borrow `speakers.user`. A null-stamp row authored by
  // someone else takes the unresolvable floor instead — pinned in `assembly/shape-wire-matrix.test.ts`.
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
    expect(result.request.history.find((m) => m.name !== undefined)?.name).toBe("Alex");
  });

  // A persona-less voice human's own rows must carry the same floor every other unresolved human row carries
  // (`assembly/shape` and the macro layer both floor to it), or one prompt names the same kind of human twice.
  test("a persona-less voice human's speakers.user is the unresolved-persona floor, not a second spelling", async () => {
    const { args } = baseArgs({
      connection: {
        ...CONNECTION,
        capability: makeCapability({
          ...CAPABILITY,
          turns: { assistantPrefill: false, midConversationSystem: false, historySystemRows: false, roleHandlingFloor: "none", explicitPromptCache: false },
        }),
      },
      assembleContext: ctxOf({ activePersona: null, promptConfig: { ...DEFAULT_PROMPT_CONFIG, namesBehavior: "completion" } }),
      canon: [userRow("u1")],
    });
    const result = await runTurnPipeline(args);
    expect(result.request.history.find((m) => m.name !== undefined)?.name).toBe(DEFAULT_PERSONA_NAME);
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
