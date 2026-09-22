// Mirror test for @orb/server/kit/serde/chat-bundle — the ONE orb-native chat-bundle serde (R6's serde half,
// the F9 fidelity arm). Pins BOTH directions plus the MANDATORY round-trip identity (spec §1: a portable
// entity is not "done" until `build(parse(build(x))) === build(x)`).
//
// The load-bearing assertions here are the two things a bundle can get wrong in a way no count catches:
//   • the ENVELOPE discriminates, not the file extension — an ST jsonl, a character card, and any other
//     orb-native family all refuse as `foreign-kind` BY NAME.
//   • POSITIONAL integrity: every rpg cross-plane reference is `messages[i].variants[j]`, and a reference
//     that points past the end of its plane must be PRUNED at parse rather than handed to a write boundary
//     that would refuse it (NOT NULL FKs) and take the whole restore down with it.

import type { PortableParse } from "@orb/contracts/portability";
import { rpgGameConfigSchema, rpgSheetSchema, rpgSnapshotStateSchema } from "@orb/contracts/rpg";
import type { PortableChat, PortableChatMessage, PortableRpgGame } from "@orb/server/kit/serde/chat-bundle";
import { buildChatBundleFile, CHAT_BUNDLE_SCHEMA_KIND, CHAT_BUNDLE_SCHEMA_VERSION, parseChatBundleFile } from "@orb/server/kit/serde/chat-bundle";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

const ENC = new TextEncoder();
const DEC = new TextDecoder();

function must<T>(result: PortableParse<T>): T {
  if (!result.ok) {
    throw new Error(`portable parse refused: ${result.reason}`);
  }
  return result.value;
}

function refusalOf<T>(result: PortableParse<T>): string {
  if (result.ok) {
    throw new Error("expected the file to be refused, but it parsed");
  }
  return result.reason;
}

function message(over: Partial<PortableChatMessage> = {}): PortableChatMessage {
  return {
    role: "assistant",
    kind: "standard",
    speakerHandle: "hero",
    personaName: null,
    createdAt: 1_700_000_000_000,
    selectedIdx: 0,
    variants: [
      {
        idx: 0,
        content: "The bridge gave way.",
        model: "gpt-4",
        provider: "openai",
        tokensIn: 120,
        tokensOut: 42,
        tokenProvenance: "measured",
        reasoning: null,
        ttftMs: 310,
        genStartedAt: 1_700_000_000_000,
        genFinishedAt: 1_700_000_001_000,
        variableDelta: [{ op: "set", key: "mood", value: "grim" }],
        metadata: null,
      },
    ],
    ...over,
  };
}

function game(over: Partial<PortableRpgGame> = {}): PortableRpgGame {
  return {
    mode: "lite",
    status: "active",
    sessionNumber: 3,
    config: rpgGameConfigSchema.parse({}),
    createdAt: 1_700_000_000_000,
    sheets: [{ characterHandle: "hero", sheet: rpgSheetSchema.parse({ className: "Wanderer", level: 4 }) }],
    snapshots: [
      {
        messageIndex: 0,
        variantIdx: 0,
        asOfMessageIndex: null,
        committed: true,
        createdAt: 1_700_000_000_000,
        state: rpgSnapshotStateSchema.parse({ location: "the broken bridge", clock: null, calendarDate: null, weather: null, fieldLocks: null }),
      },
    ],
    journal: [
      {
        type: "event",
        label: "",
        title: "The bridge fell",
        content: "The span gave way under the caravan.",
        messageIndex: 0,
        variantIdx: 0,
        sourceMessageIndex: 0,
        createdAt: 1_700_000_000_000,
      },
    ],
    turnToolCalls: [
      {
        messageIndex: 0,
        variantIdx: 0,
        calls: [{ name: "update_scene", args: '{"location":"the broken bridge"}', verdict: "applied", issues: [] }],
        createdAt: 1_700_000_000_000,
      },
    ],
    checkpoints: [{ snapshotIndex: 0, label: "before the bridge", trigger: "manual", createdAt: 1_700_000_000_000 }],
    ...over,
  };
}

function chat(over: Partial<PortableChat> = {}): PortableChat {
  return {
    title: "P8 Chat",
    createdAt: 1_699_999_000_000,
    updatedAt: 1_700_000_001_000,
    starred: true,
    archived: false,
    compactSummary: "Everything before the bridge collapse, in brief.",
    compactedAtSeq: 1,
    metadata: { roomOverrides: { scenario: "a rain-soaked frontier town" } },
    variableValues: { mood: "grim" },
    userMacroValues: { tone: { register: "wry" } },
    anchorPersonaName: "My Persona",
    characterHandles: ["hero"],
    tagNames: ["campaign"],
    injections: [{ position: "in_chat", depth: 4, role: "system", content: "Keep the tone wry.", order: 2, createdAt: 1_699_999_000_000 }],
    messages: [message()],
    rpg: game(),
    ...over,
  };
}

describe("kit/serde/chat-bundle", () => {
  test("build stamps the envelope and parse returns the canonical value unchanged", () => {
    const bytes = buildChatBundleFile(chat());
    const wire = JSON.parse(DEC.decode(bytes)) as Record<string, unknown>;
    expect(wire["schemaKind"]).toBe(CHAT_BUNDLE_SCHEMA_KIND);
    expect(wire["schemaVersion"]).toBe(CHAT_BUNDLE_SCHEMA_VERSION);
    expect(must(parseChatBundleFile(bytes))).toEqual(chat());
  });

  test("the ROUND-TRIP is byte-identical (the mandatory per-entity pin — build/parse cannot drift)", () => {
    const once = buildChatBundleFile(chat());
    const twice = buildChatBundleFile(must(parseChatBundleFile(once)));
    expect(DEC.decode(twice)).toBe(DEC.decode(once));
  });

  test("a gameless chat round-trips with rpg null (the common case is not a special case)", () => {
    const gameless = chat({ rpg: null });
    expect(must(parseChatBundleFile(buildChatBundleFile(gameless)))).toEqual(gameless);
  });

  test("rpg sheet handles are opaque wire strings: blank heals to null and over-cap text is carried", () => {
    const overCap = "h".repeat(201);
    const wire = JSON.parse(DEC.decode(buildChatBundleFile(chat()))) as {
      rpg: { sheets: { characterHandle: unknown }[] };
    };
    const sheet = wire.rpg.sheets[0];
    if (sheet === undefined) {
      throw new Error("chat fixture has no rpg sheet");
    }

    sheet.characterHandle = "";
    expect(must(parseChatBundleFile(ENC.encode(JSON.stringify(wire)))).rpg?.sheets[0]?.characterHandle).toBeNull();

    sheet.characterHandle = overCap;
    expect(must(parseChatBundleFile(ENC.encode(JSON.stringify(wire)))).rpg?.sheets[0]?.characterHandle).toBe(overCap);
  });

  test("the ENVELOPE discriminates, not the extension: an ST transcript and a foreign orb family both refuse by name", () => {
    // An ST chat `.jsonl` header line: valid JSON, no envelope — exactly what shares the `chats/` dir.
    expect(refusalOf(parseChatBundleFile(ENC.encode('{"user_name":"Nate","character_name":"Hero"}')))).toBe("foreign-kind");
    // A different orb-native family's file (the character-card `?format=json` collision the extension alone
    // cannot see).
    expect(refusalOf(parseChatBundleFile(ENC.encode(JSON.stringify({ schemaKind: "orb.databank.document", schemaVersion: 1 }))))).toBe("foreign-kind");
    expect(refusalOf(parseChatBundleFile(ENC.encode("not json at all")))).toBe("not-json");
  });

  test("a file written by a NEWER orbweaver refuses by name instead of being half-read with today's semantics", () => {
    const wire = JSON.parse(DEC.decode(buildChatBundleFile(chat()))) as Record<string, unknown>;
    wire["schemaVersion"] = CHAT_BUNDLE_SCHEMA_VERSION + 1;
    expect(refusalOf(parseChatBundleFile(ENC.encode(JSON.stringify(wire))))).toBe("newer-version");
  });

  // POLICY (moved 2026-08-21, #396): a provenance label that contradicts the token axes DEGRADES THIS
  // VARIANT to the derived label — it does not refuse the file. Refusing was unshippable: the
  // contradictory pair is a live durable row (`message_variants.token_provenance` is NOT NULL DEFAULT
  // 'unrecorded', so any writer that sets the token columns outside `canon-write::variantEconomics`
  // produces it, and an ST-imported chat SITS in it until the catch-up workload promotes it), so the
  // refusal made every un-backfilled imported chat unexportable — 5 of the 6 `export-chat-bundle.int`
  // fidelity pins went red on it. Same trade as the `variableDelta` row two fields up: degrade the
  // variant, never the chat.
  test("a token provenance that contradicts the recorded axes is RE-DERIVED, never a refusal", () => {
    const withProvenance = (tokenProvenance: "measured" | "unrecorded", tokensOut: number | null): Uint8Array => {
      const wire = JSON.parse(DEC.decode(buildChatBundleFile(chat()))) as {
        messages: { variants: Record<string, unknown>[] }[];
      };
      const variant = wire.messages[0]?.variants[0];
      if (variant === undefined) {
        throw new Error("chat fixture has no variant");
      }
      variant["tokensIn"] = null;
      variant["tokensOut"] = tokensOut;
      variant["tokenProvenance"] = tokenProvenance;
      return ENC.encode(JSON.stringify(wire));
    };

    // 'unrecorded' over REAL numbers is the legacy-import shape — promoted to `measured` with the numbers
    // untouched, exactly as `import/verbs/backfill-token-usage::plan()`'s `legacyPromoted` arm does it.
    const promoted = must(parseChatBundleFile(withProvenance("unrecorded", 17))).messages[0]?.variants[0];
    expect(promoted).toMatchObject({ tokensIn: null, tokensOut: 17, tokenProvenance: "measured" });
    // …and a label with NOTHING behind it drops to `unrecorded` rather than asserting a measurement.
    const demoted = must(parseChatBundleFile(withProvenance("measured", null))).messages[0]?.variants[0];
    expect(demoted).toMatchObject({ tokensIn: null, tokensOut: null, tokenProvenance: "unrecorded" });
    // The non-vacuity control: an AGREEING label is passed through verbatim, so the two resolutions above
    // are the contradiction path and not a reader that ignores `tokenProvenance` altogether.
    const agreeing = must(parseChatBundleFile(withProvenance("measured", 17))).messages[0]?.variants[0];
    expect(agreeing).toMatchObject({ tokensOut: 17, tokenProvenance: "measured" });

    const legacy = JSON.parse(DEC.decode(buildChatBundleFile(chat()))) as {
      messages: { variants: Record<string, unknown>[] }[];
    };
    const legacyVariant = legacy.messages[0]?.variants[0];
    if (legacyVariant === undefined) {
      throw new Error("chat fixture has no variant");
    }
    legacyVariant["tokenProvenance"] = undefined;
    expect(must(parseChatBundleFile(ENC.encode(JSON.stringify(legacy)))).messages[0]?.variants[0]?.tokenProvenance).toBe("measured");

    legacyVariant["tokensIn"] = undefined;
    legacyVariant["tokensOut"] = undefined;
    expect(must(parseChatBundleFile(ENC.encode(JSON.stringify(legacy)))).messages[0]?.variants[0]?.tokenProvenance).toBe("unrecorded");
  });

  test("a rpg reference pointing past the end of the transcript is PRUNED at parse, per the plane's own db arm", () => {
    // Every anchor names message index 9, which this file's single-message transcript does not have.
    const dangling = chat({
      rpg: game({
        snapshots: [
          {
            messageIndex: 9,
            variantIdx: 0,
            asOfMessageIndex: 9,
            committed: true,
            createdAt: 1_700_000_000_000,
            state: rpgSnapshotStateSchema.parse({ location: "nowhere", clock: null, calendarDate: null, weather: null, fieldLocks: null }),
          },
        ],
        journal: [
          {
            type: "event",
            label: "",
            title: "orphan",
            content: "…",
            messageIndex: 9,
            variantIdx: 0,
            sourceMessageIndex: 9,
            createdAt: 1_700_000_000_000,
          },
        ],
        turnToolCalls: [{ messageIndex: 9, variantIdx: 0, calls: [], createdAt: 1_700_000_000_000 }],
        checkpoints: [{ snapshotIndex: 7, label: "orphan", trigger: "manual", createdAt: 1_700_000_000_000 }],
      }),
    });
    const parsed = must(parseChatBundleFile(buildChatBundleFile(dangling)));
    // SNAPSHOT: demoted to the HAND arm — its STATE is real game history, only its position was lost. Both
    // halves of the two-arm CHECK go null together, and the unresolvable as-of stamp goes with them.
    expect(parsed.rpg?.snapshots).toHaveLength(1);
    expect(parsed.rpg?.snapshots[0]).toMatchObject({ messageIndex: null, variantIdx: null, asOfMessageIndex: null });
    expect(parsed.rpg?.snapshots[0]?.state.location).toBe("nowhere");
    // JOURNAL model entry + TOOL-CALL record: DROPPED (a dead-swipe entry is a leak, and both tool-call refs
    // are NOT NULL at the db, so writing one would abort the batch).
    expect(parsed.rpg?.journal).toEqual([]);
    expect(parsed.rpg?.turnToolCalls).toEqual([]);
    // CHECKPOINT: dropped — RESTRICT on its snapshot makes a dangling target a hard db error.
    expect(parsed.rpg?.checkpoints).toEqual([]);
  });

  test("a HAND journal entry (no variant) survives a pruned transcript — only its lost source stamp is cleared", () => {
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
            createdAt: 1_700_000_000_000,
          },
        ],
      }),
    });
    const parsed = must(parseChatBundleFile(buildChatBundleFile(handOnly)));
    expect(parsed.rpg?.journal).toHaveLength(1);
    expect(parsed.rpg?.journal[0]).toMatchObject({ title: "room truth", variantIdx: null, sourceMessageIndex: null });
  });
});
