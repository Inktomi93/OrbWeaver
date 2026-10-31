// The orb-native chat bundle serde: the envelope discriminates, a built file reads back byte-identically, and a file
// whose references dangle or whose labels contradict degrades per its plane instead of failing the whole restore.

import type { PendingGenerationObservationInput } from "@orb/contracts/chat";
import { generationUsageLegSchema, generationUsageSchema } from "@orb/contracts/inference";
import type { PortableParse, PortableParseFailure } from "@orb/contracts/portability";
import { rpgSheetSchema } from "@orb/contracts/rpg";
import type { PortableChat, PortableChatMessage, PortableRpgGame } from "@orb/server/primitives/serde/chat-bundle";
import { buildChatBundleFile, CHAT_BUNDLE_SCHEMA_KIND, parseChatBundleFile } from "@orb/server/primitives/serde/chat-bundle";
import { FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import { makePortableChat, makePortableGame, makePortableMessage, makePortableTurnSnapshot } from "@orb/testkit/node/helpers";
import { describe } from "vitest";
import { DATABANK_SCHEMA_KIND } from "#server/primitives/serde/databank/index.ts";

// Typed literals: a failure name the contract renames fails `tsc` here.
const FOREIGN_KIND: PortableParseFailure = "foreign-kind";
const NOT_JSON: PortableParseFailure = "not-json";
const NEWER_VERSION: PortableParseFailure = "newer-version";
const ENC = new TextEncoder();
const DEC = new TextDecoder();
const AT = FROZEN_AT_MS;

interface Wire {
  messages: { variants: Record<string, unknown>[] }[];
  rpg: unknown;
  [key: string]: unknown;
}

function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

function refusalOf<T>(result: PortableParse<T>): PortableParseFailure {
  if (result.ok) {
    throw new Error("expected the file to be refused, but it parsed");
  }
  return result.reason;
}

const usage = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  tokensIn: null,
  tokensOut: null,
  cacheReadTokens: null,
  cacheWriteTokens: null,
  reasoningTokens: null,
  servedModel: null,
  tokenDetails: null,
  costUsd: null,
  costDetails: null,
  costProvenance: "unrecorded",
  ...over,
});

function observation(over: Partial<PendingGenerationObservationInput> = {}): PendingGenerationObservationInput {
  return {
    turnIndex: 0,
    ordinal: 0,
    sourceMessageIndex: 0,
    sourceVariantIdx: 0,
    leg: generationUsageLegSchema.parse({
      ...usage({ costUsd: 0.125, costProvenance: "measured", tokensIn: 70, tokensOut: 2048, reasoningTokens: 2048 }),
      model: "gemini-3.1-pro-preview",
      provider: "google",
      wire: "google-generative-ai",
      observedAt: AT,
      modelCalls: 1,
      contextWindow: null,
      maxOutputTokens: 2048,
      durationApiMs: 1,
      ttftMs: null,
      finishReason: "length",
      stopReason: "MAX_TOKENS",
      terminalReason: null,
      generationId: "provider-observation",
    }),
    ...over,
  };
}

function message(over: Partial<PortableChatMessage> = {}): PortableChatMessage {
  const variant = {
    idx: 0,
    content: "The bridge gave way.",
    model: "gpt-4",
    provider: "openai",
    tokensIn: 120,
    tokensOut: 42,
    tokenProvenance: "measured",
    reasoning: null,
    ttftMs: 310,
    genStartedAt: AT,
    genFinishedAt: AT + 1000,
    variableDelta: [{ op: "set", key: "mood", value: "grim" }],
    metadata: null,
  } as const;
  return makePortableMessage("assistant", variant.content, { speakerHandle: "hero", variants: [variant], ...over });
}

function game(over: Partial<PortableRpgGame> = {}): PortableRpgGame {
  return makePortableGame({
    sessionNumber: 3,
    sheets: [{ characterHandle: "hero", sheet: rpgSheetSchema.parse({ className: "Wanderer", level: 4 }) }],
    snapshots: [{ ...makePortableTurnSnapshot(0, 0, "the broken bridge"), createdAt: AT }],
    journal: [
      {
        type: "event",
        label: "",
        title: "The bridge fell",
        content: "The span gave way under the caravan.",
        messageIndex: 0,
        variantIdx: 0,
        sourceMessageIndex: 0,
        createdAt: AT,
      },
    ],
    turnToolCalls: [
      {
        messageIndex: 0,
        variantIdx: 0,
        calls: [{ name: "update_scene", args: '{"location":"the broken bridge"}', verdict: "applied", issues: [] }],
        createdAt: AT,
      },
    ],
    checkpoints: [{ snapshotIndex: 0, label: "before the bridge", trigger: "manual", createdAt: AT }],
    ...over,
  });
}

function chat(over: Partial<PortableChat> = {}): PortableChat {
  return makePortableChat({
    title: "P8 Chat",
    createdAt: AT - 1000,
    updatedAt: AT + 1000,
    starred: true,
    compactSummary: "Everything before the bridge collapse, in brief.",
    compactedAtSeq: 1,
    metadata: { roomOverrides: { scenario: "a rain-soaked frontier town" } },
    variableValues: { mood: "grim" },
    userMacroValues: { tone: { register: "wry" } },
    anchorPersonaName: "My Persona",
    characterHandles: ["hero"],
    tagNames: ["campaign"],
    injections: [{ position: "in_chat", depth: 4, role: "system", content: "Keep the tone wry.", order: 2, createdAt: AT - 1000 }],
    messages: [message()],
    rpg: game(),
    ...over,
  });
}

/** The built file as a mutable wire object, for a case that edits what a real file could carry. */
const wireOf = (value: PortableChat = chat()): Wire => JSON.parse(DEC.decode(buildChatBundleFile(value))) as Wire;
const bytesOf = (wire: unknown): Uint8Array => ENC.encode(JSON.stringify(wire));

function variantOf(wire: Wire): Record<string, unknown> {
  const variant = wire.messages[0]?.variants[0];
  if (variant === undefined) {
    throw new Error("the built bundle carries no variant");
  }
  return variant;
}

describe("the envelope", () => {
  test("a built file is stamped with the bundle kind and version and reads back as the canonical chat", () => {
    const bytes = buildChatBundleFile(chat());
    const wire = JSON.parse(DEC.decode(bytes)) as Record<string, unknown>;
    expect(wire["schemaKind"]).toBe(CHAT_BUNDLE_SCHEMA_KIND);
    expect(wire["schemaVersion"]).toEqual(expect.any(Number));
    expect(must(parseChatBundleFile(bytes))).toEqual(chat());
    const gameless = chat({ rpg: null });
    expect(must(parseChatBundleFile(buildChatBundleFile(gameless)))).toEqual(gameless);
  });

  test("build, parse and build again is byte-identical", () => {
    const once = buildChatBundleFile(chat());
    expect(DEC.decode(buildChatBundleFile(must(parseChatBundleFile(once))))).toBe(DEC.decode(once));
  });

  test("the envelope discriminates, not the extension: foreign kinds and non-JSON refuse by name", () => {
    // An ST chat `.jsonl` header line is valid JSON with no envelope; a sibling orb family's file has the wrong kind.
    expect(refusalOf(parseChatBundleFile(ENC.encode('{"user_name":"Alex","character_name":"Hero"}')))).toBe(FOREIGN_KIND);
    expect(refusalOf(parseChatBundleFile(bytesOf({ schemaKind: DATABANK_SCHEMA_KIND, schemaVersion: 1 })))).toBe(FOREIGN_KIND);
    expect(refusalOf(parseChatBundleFile(ENC.encode("not json at all")))).toBe(NOT_JSON);
  });

  test("a file from a newer build refuses by name, and the current version parses", () => {
    const wire = wireOf();
    expect(must(parseChatBundleFile(bytesOf(wire))).title).toBe("P8 Chat");
    wire["schemaVersion"] = Number(wire["schemaVersion"]) + 1;
    expect(refusalOf(parseChatBundleFile(bytesOf(wire)))).toBe(NEWER_VERSION);
  });
});

describe("generation observations and usage", () => {
  test("pending completed facts round-trip with positional parents, byte-identically", () => {
    const wire = wireOf();
    const pending = [observation(), observation({ turnIndex: 1, sourceMessageIndex: null, sourceVariantIdx: null })];
    wire["pendingGenerationObservations"] = pending;
    const parsed = must(parseChatBundleFile(bytesOf(wire)));
    expect(parsed).toHaveProperty("pendingGenerationObservations", pending);
    const bytes = buildChatBundleFile(parsed);
    expect(must(parseChatBundleFile(bytes))).toHaveProperty("pendingGenerationObservations", pending);
    expect(buildChatBundleFile(must(parseChatBundleFile(bytes)))).toEqual(bytes);
  });

  test("a pending fact whose source message or variant is not in the transcript is dropped, and its sibling stays", () => {
    const wire = wireOf();
    const kept = observation();
    wire["pendingGenerationObservations"] = [kept, observation({ turnIndex: 1, sourceMessageIndex: 9 }), observation({ turnIndex: 2, sourceVariantIdx: 5 })];
    expect(must(parseChatBundleFile(bytesOf(wire))).pendingGenerationObservations).toEqual([kept]);
  });

  test("duplicate pending logical ordinals refuse instead of collapsing two completed facts at restore", () => {
    const wire = wireOf();
    wire["pendingGenerationObservations"] = [observation(), observation()];
    expect(parseChatBundleFile(bytesOf(wire))).toMatchObject({ ok: false });
    wire["pendingGenerationObservations"] = [observation(), observation({ ordinal: 1 })];
    expect(parseChatBundleFile(bytesOf(wire))).toMatchObject({ ok: true });
  });

  test("native usage keeps an actual zero, unknown axes, the served model, partial modalities and the configured price provenance", () => {
    const native = generationUsageSchema.parse(
      usage({
        tokensIn: 120,
        tokensOut: 42,
        cacheWriteTokens: 0,
        servedModel: "served-model-version",
        tokenDetails: { input: [{ modality: "file", tokens: 12 }], output: [{ modality: "text", tokens: 8 }] },
        costUsd: 0,
        costProvenance: "estimated",
        costDetails: { totalUsd: 0, pricing: { inputPerMTok: 0, outputPerMTok: 0, cacheWritePerMTok: 0 } },
      }),
    );
    const wire = wireOf();
    variantOf(wire)["usage"] = native;
    const parsed = must(parseChatBundleFile(bytesOf(wire)));
    expect(parsed.messages[0]?.variants[0]).toHaveProperty("usage", native);
    const bytes = buildChatBundleFile(parsed);
    expect(must(parseChatBundleFile(bytes)).messages[0]?.variants[0]).toHaveProperty("usage", native);
    expect(buildChatBundleFile(must(parseChatBundleFile(bytes)))).toEqual(bytes);
  });

  test("native usage refuses a contradictory legacy token copy rather than choosing one", () => {
    const wire = wireOf();
    variantOf(wire)["usage"] = generationUsageSchema.parse(usage({ tokensIn: 120, tokensOut: 41 }));
    expect(parseChatBundleFile(bytesOf(wire))).toMatchObject({ ok: false });
    // Positive control: the agreeing copy (the fixture's own 120 in, 42 out) is accepted.
    variantOf(wire)["usage"] = generationUsageSchema.parse(usage({ tokensIn: 120, tokensOut: 42 }));
    expect(parseChatBundleFile(bytesOf(wire))).toMatchObject({ ok: true });
  });

  test("a provenance label that contradicts the recorded axes is re-derived for that variant, never a refusal", () => {
    const withProvenance = (tokenProvenance: string, tokensOut: number | null): Uint8Array => {
      const wire = wireOf();
      Object.assign(variantOf(wire), { tokensIn: null, tokensOut, tokenProvenance });
      return bytesOf(wire);
    };
    const variantOfBytes = (bytes: Uint8Array): PortableChat["messages"][number]["variants"][number] | undefined =>
      must(parseChatBundleFile(bytes)).messages[0]?.variants[0];
    // 'unrecorded' over real numbers is the legacy-import shape; the numbers stay and the label is promoted.
    expect(variantOfBytes(withProvenance("unrecorded", 17))).toMatchObject({ tokensIn: null, tokensOut: 17, tokenProvenance: "measured" });
    // A label with nothing behind it drops to 'unrecorded' rather than asserting a measurement.
    expect(variantOfBytes(withProvenance("measured", null))).toMatchObject({ tokensIn: null, tokensOut: null, tokenProvenance: "unrecorded" });
    // Control: an agreeing label passes through, so the two resolutions above are the contradiction path.
    expect(variantOfBytes(withProvenance("measured", 17))).toMatchObject({ tokensOut: 17, tokenProvenance: "measured" });

    const legacy = wireOf();
    Object.assign(variantOf(legacy), { tokenProvenance: undefined });
    expect(variantOfBytes(bytesOf(legacy))?.tokenProvenance).toBe("measured");
    Object.assign(variantOf(legacy), { tokensIn: undefined, tokensOut: undefined });
    expect(variantOfBytes(bytesOf(legacy))?.tokenProvenance).toBe("unrecorded");
  });
});

describe("the rpg plane", () => {
  test("a recorded tool call with no issues list reads back with an empty one", () => {
    const wire = wireOf();
    const call = (wire.rpg as { turnToolCalls: { calls: Record<string, unknown>[] }[] }).turnToolCalls[0]?.calls[0];
    if (call === undefined) {
      throw new Error("the built bundle carries no recorded tool call");
    }
    call["issues"] = undefined;
    expect(must(parseChatBundleFile(bytesOf(wire))).rpg?.turnToolCalls[0]?.calls[0]?.issues).toEqual([]);
  });

  test("a bookmark snapshot round-trips as one, and a snapshot from a file without the flag reads as a beat", () => {
    const marked = chat({
      rpg: game({
        snapshots: [
          {
            messageIndex: null,
            variantIdx: null,
            asOfMessageIndex: null,
            bookmark: true,
            committed: true,
            createdAt: AT,
            state: makePortableTurnSnapshot(0, 0, "the saved bridge").state,
          },
        ],
      }),
    });
    expect(must(parseChatBundleFile(buildChatBundleFile(marked))).rpg?.snapshots[0]?.bookmark).toBe(true);
    const wire = wireOf();
    const snapshot = (wire.rpg as { snapshots: Record<string, unknown>[] }).snapshots[0];
    if (snapshot === undefined) {
      throw new Error("the built bundle carries no rpg snapshot");
    }
    snapshot["bookmark"] = undefined;
    expect(must(parseChatBundleFile(bytesOf(wire))).rpg?.snapshots[0]?.bookmark).toBe(false);
  });

  test("sheet handles are opaque wire strings: blank heals to null and an over-cap string is carried", () => {
    const wire = wireOf();
    const sheet = (wire.rpg as { sheets: { characterHandle: unknown }[] }).sheets[0];
    if (sheet === undefined) {
      throw new Error("the built bundle carries no rpg sheet");
    }
    const overCap = "h".repeat(201);
    sheet.characterHandle = "";
    expect(must(parseChatBundleFile(bytesOf(wire))).rpg?.sheets[0]?.characterHandle).toBeNull();
    sheet.characterHandle = overCap;
    expect(must(parseChatBundleFile(bytesOf(wire))).rpg?.sheets[0]?.characterHandle).toBe(overCap);
  });

  test("a reference past the end of the transcript is pruned per its plane, and a hand-authored plane survives", () => {
    const dangling = chat({
      rpg: game({
        snapshots: [
          {
            messageIndex: 9,
            variantIdx: 0,
            asOfMessageIndex: 9,
            bookmark: false,
            committed: true,
            createdAt: AT,
            state: makePortableTurnSnapshot(0, 0, "nowhere").state,
          },
        ],
        journal: [{ type: "event", label: "", title: "orphan", content: "…", messageIndex: 9, variantIdx: 0, sourceMessageIndex: 9, createdAt: AT }],
        turnToolCalls: [{ messageIndex: 9, variantIdx: 0, calls: [], createdAt: AT }],
        checkpoints: [{ snapshotIndex: 7, label: "orphan", trigger: "manual", createdAt: AT }],
      }),
    });
    const parsed = must(parseChatBundleFile(buildChatBundleFile(dangling)));
    // A snapshot's state is real history: it is demoted to the hand arm, both position halves and the as-of stamp going together.
    expect(parsed.rpg?.snapshots).toHaveLength(1);
    expect(parsed.rpg?.snapshots[0]).toMatchObject({ messageIndex: null, variantIdx: null, asOfMessageIndex: null });
    expect(parsed.rpg?.snapshots[0]?.state.location).toBe("nowhere");
    // A model journal entry and a tool-call record are dropped (their anchors are NOT NULL), as is a checkpoint on a missing snapshot.
    expect(parsed.rpg?.journal).toEqual([]);
    expect(parsed.rpg?.turnToolCalls).toEqual([]);
    expect(parsed.rpg?.checkpoints).toEqual([]);
    // Control: the same planes with in-range anchors survive whole.
    const intact = must(parseChatBundleFile(buildChatBundleFile(chat())));
    expect(intact.rpg).toMatchObject({ journal: [{ title: "The bridge fell" }], turnToolCalls: [{ messageIndex: 0 }], checkpoints: [{ snapshotIndex: 0 }] });
    expect(intact.rpg?.snapshots[0]).toMatchObject({ messageIndex: 0, variantIdx: 0 });
  });

  test("a hand journal entry with no variant survives an empty transcript, with only its lost source stamp cleared", () => {
    const handOnly = chat({
      messages: [],
      rpg: game({
        snapshots: [],
        checkpoints: [],
        turnToolCalls: [],
        journal: [
          {
            type: "event",
            label: "",
            title: "room truth",
            content: "The host wrote this by hand.",
            messageIndex: null,
            variantIdx: null,
            sourceMessageIndex: 4,
            createdAt: AT,
          },
        ],
      }),
    });
    const parsed = must(parseChatBundleFile(buildChatBundleFile(handOnly)));
    expect(parsed.rpg?.journal).toHaveLength(1);
    expect(parsed.rpg?.journal[0]).toMatchObject({ title: "room truth", variantIdx: null, sourceMessageIndex: null });
  });
});
