// Mirror test for domain/import/verbs/import-chat-bundle (R6) — the orb-native chat bundle's import half.
//
// DRIVEN THROUGH `importChatFile`, the door that PREDATES this verb, deliberately: that is the seam both the
// `POST /api/import/chat` route and the bundle descriptor call, so these assertions are about a user-visible
// affordance (what the import report says, what the write op is handed) rather than about a new API's shape.
//
// THE OWNER-RULED REFUSAL is the load-bearing pin: *"you shouldn't be able to import a transcript without
// having a character selected"* (owner ruling 2026-08-07, question-tool — it OVERRODE the review's O-6c
// characterless-chat recommendation). A bundle naming no character this account holds must be REFUSED, with
// the handles it looked for named, and must write NOTHING.
//
// The DB-side proof (rows land, the rpg planes re-anchor to the right restored variant) is the real
// round-trip in `tests/server/entry/import/bundle-round-trip.suite.int.test.ts` — this file pins the
// mapping + the refusal, which a fresh-box round trip cannot isolate.

import type { BulkImportChatInput } from "@orb/contracts/chat";
import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import type { ImportService } from "@orb/server/domain/import";
import { createImportService } from "@orb/server/domain/import";
import type { PortableChat } from "@orb/server/kit/serde/chat-bundle";
import { buildChatBundleFile } from "@orb/server/kit/serde/chat-bundle";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";
import type { ProfileHarness } from "../_support.ts";
import { makeProfileHarness } from "../_support.ts";

const OWNER = castId<UserId>("user_bundleimport_owner");
const ARIA = castId<CharacterId>("character_aria");

function bundle(over: Partial<PortableChat> = {}): Uint8Array {
  return buildChatBundleFile({
    title: "A Long Road",
    createdAt: 1_699_999_000_000,
    updatedAt: 1_700_000_001_000,
    starred: true,
    archived: true,
    compactSummary: "the first leg",
    compactedAtSeq: 2,
    metadata: { roomOverrides: { scenario: "the frontier" } },
    variableValues: { mood: "grim" },
    userMacroValues: { tone: { register: "wry" } },
    anchorPersonaName: null,
    characterHandles: ["aria"],
    tagNames: [],
    injections: [{ position: "in_chat", depth: 4, role: "system", content: "Stay wry.", order: 1, createdAt: 1_699_999_000_000 }],
    messages: [
      {
        role: "user",
        kind: "standard",
        speakerHandle: null,
        personaName: null,
        createdAt: 1_700_000_000_000,
        selectedIdx: 0,
        variants: [
          {
            idx: 0,
            content: "How far to the pass?",
            model: null,
            provider: null,
            tokensIn: null,
            tokensOut: null,
            reasoning: null,
            ttftMs: null,
            genStartedAt: null,
            genFinishedAt: null,
            variableDelta: null,
            metadata: null,
          },
        ],
      },
      {
        role: "assistant",
        kind: "standard",
        speakerHandle: "aria",
        personaName: null,
        createdAt: 1_700_000_000_500,
        selectedIdx: 0,
        variants: [
          {
            idx: 0,
            content: "Two days, if the weather holds.",
            model: "gpt-4",
            provider: "openai",
            tokensIn: 90,
            tokensOut: 12,
            reasoning: null,
            ttftMs: 200,
            genStartedAt: null,
            genFinishedAt: null,
            variableDelta: null,
            metadata: null,
          },
        ],
      },
    ],
    rpg: null,
    ...over,
  });
}

/** The profile harness + a `findByHandle` that knows exactly the handles it is given. */
function harness(known: Record<string, CharacterId> = { aria: ARIA }): ProfileHarness & { readonly verb: ImportService["importChatFile"] } {
  const h = makeProfileHarness(OWNER);
  const ctx = {
    ...h.ctx,
    findByHandle: ({ handle }: { readonly handle: CharacterHandle }): Promise<CharacterId | null> => Promise.resolve(known[handle] ?? null),
  };
  // The REAL service, because the wiring under test is `importChatFile`'s format routing — which only
  // exists once the domain's own composition root wires the two format verbs together.
  return { ...h, verb: createImportService(ctx).importChatFile };
}

function onlyChatInput(h: ProfileHarness): BulkImportChatInput {
  expect(h.chatCalls).toHaveLength(1);
  const input = h.chatCalls[0]?.chats[0];
  if (input === undefined) {
    throw new Error("the write op was called with no chat");
  }
  return input;
}

describe("importChatBundle (routed through the importChatFile door)", () => {
  test("an orb-native bundle carries the planes the ST jsonl arm cannot: injections, room blob, variable + macro picks, starred/archive/compaction", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "aria/chat_x.orb.json", bytes: bundle() });

    expect(outcome).toEqual({ ok: true, created: true });
    const input = onlyChatInput(h);
    expect(input.injections).toEqual([{ position: "in_chat", depth: 4, role: "system", content: "Stay wry.", order: 1, createdAt: 1_699_999_000_000 }]);
    expect(input.metadata).toEqual({ roomOverrides: { scenario: "the frontier" } });
    expect(input.variableValues).toEqual({ mood: "grim" });
    expect(input.userMacroValues).toEqual({ tone: { register: "wry" } });
    expect(input.starred).toBe(true);
    expect(input.archived).toBe(true);
    expect(input.compactSummary).toBe("the first leg");
    expect(input.compactedAtSeq).toBe(2);
    // The assistant turn's voice re-links BY HANDLE, per turn (not the room's primary blanket-stamped).
    expect(input.messages[1]?.characterId).toBe(ARIA);
    // The orb-only variant economics ride too (`tokensIn` has no ST spelling at all).
    expect(input.messages[1]?.variants[0]?.tokensIn).toBe(90);
    // PD-78: a user turn + an assistant turn with text IS a real conversation → the backfill enqueues.
    expect(input.isRealConversation).toBe(true);
    expect(h.backfills).toEqual([{ ownerId: OWNER }]);
  });

  test("OWNER RULING — a bundle naming no character this account holds is REFUSED, names the handles it looked for, and writes nothing", async () => {
    const h = harness({}); // the account holds no characters at all

    const outcome = await h.verb({ filename: "aria/chat_x.orb.json", bytes: bundle() });

    expect(outcome.ok).toBe(false);
    // The message must be actionable: which handle to import first. A bare "not found" would leave the
    // operator guessing which card this room wanted.
    expect(outcome.ok === false ? outcome.error : "").toContain("aria");
    expect(outcome.ok === false ? outcome.error : "").toContain("import the character first");
    // NOTHING was written — not a characterless room, not a placeholder card.
    expect(h.chatCalls).toEqual([]);
    expect(h.backfills).toEqual([]);
  });

  test("the DIRECTORY handle is the fallback when the carried seat list did not survive", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "aria/chat_x.orb.json", bytes: bundle({ characterHandles: [] }) });

    expect(outcome).toEqual({ ok: true, created: true });
    expect(h.chatCalls[0]?.characterId).toBe(ARIA);
  });

  test("the ENVELOPE decides, not the extension: a foreign orb-native file under chats/ refuses BY NAME and writes nothing", async () => {
    const h = harness();

    const outcome = await h.verb({
      filename: "aria/card.json",
      bytes: new TextEncoder().encode(JSON.stringify({ schemaKind: "orb.databank.document", schemaVersion: 1 })),
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok === false ? outcome.error : "").toContain("orb.chat.bundle");
    expect(h.chatCalls).toEqual([]);
  });

  test("an ST `.jsonl` under the same dir still routes to the interchange arm (the orb bundle did not take the door over)", async () => {
    const h = harness();
    // Raw ST wire text (snake_case by spec) rather than object literals — the format IS the fixture.
    const jsonl = new TextEncoder().encode('{"user_name":"Alex","character_name":"Aria"}\n{"mes":"hi","is_user":true}\n');

    const outcome = await h.verb({ filename: "aria/chat_2025.jsonl", bytes: jsonl });

    expect(outcome).toEqual({ ok: true, created: true });
    // The interchange arm's shape: the single migrated note field exists, the orb-only list does not.
    const input = onlyChatInput(h);
    expect(input.injections).toBeUndefined();
    expect(input.starred).toBeUndefined();
  });
});
