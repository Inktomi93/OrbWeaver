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
import { rpgGameConfigSchema } from "@orb/contracts/rpg";
import type { CharacterHandle, CharacterId, ChatId, MessageId, MessageVariantId, UserId } from "@orb/kit/ids";
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
            tokenProvenance: "unrecorded",
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
            tokenProvenance: "measured",
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

    expect(outcome).toEqual({ ok: true, created: true, skippedOverlays: [] });
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

    expect(outcome).toEqual({ ok: true, created: true, skippedOverlays: [] });
    expect(h.chatCalls[0]?.characterId).toBe(ARIA);
  });

  test("only canonical carried handles reach the library lookup", async () => {
    const h = makeProfileHarness(OWNER);
    const lookedUp: string[] = [];
    const verb = createImportService({
      ...h.ctx,
      findByHandle: ({ handle }: { readonly handle: CharacterHandle }): Promise<CharacterId | null> => {
        lookedUp.push(handle);
        return Promise.resolve(handle === "aria" ? ARIA : null);
      },
    }).importChatFile;

    const outcome = await verb({
      filename: "chat_x.orb.json",
      bytes: bundle({ characterHandles: ["x".repeat(201), "aria"] }),
    });

    expect(outcome).toEqual({ ok: true, created: true, skippedOverlays: [] });
    expect(lookedUp).toEqual(["aria"]);
    expect(h.chatCalls[0]?.characterId).toBe(ARIA);
  });

  test("#723 retry resolves deduplicated canon and completes an interrupted tag overlay", async () => {
    const h = makeProfileHarness(OWNER);
    const identity = {
      chatId: castId<ChatId>("chat_bundle_recovery"),
      messageIds: [castId<MessageId>("message_bundle_recovery_0"), castId<MessageId>("message_bundle_recovery_1")],
      variantIds: [[castId<MessageVariantId>("message_variant_bundle_recovery_0")], [castId<MessageVariantId>("message_variant_bundle_recovery_1")]],
    };
    let imports = 0;
    let interrupt = true;
    const attached = new Set<string>();
    const profile = {
      ...h.profile,
      bulkImportChats: (): ReturnType<ProfileHarness["profile"]["bulkImportChats"]> => {
        imports += 1;
        return Promise.resolve({
          identities: [identity],
          written: imports === 1 ? [identity] : [],
          chatsImported: imports === 1 ? 1 : 0,
          chatsSkipped: imports === 1 ? 0 : 1,
          messagesImported: imports === 1 ? 2 : 0,
          variantsImported: imports === 1 ? 2 : 0,
          branchesLinked: 0,
          realConversationWritten: imports === 1,
          chatsPersonaHealed: 0,
        });
      },
      attachChatTagByName: ({ tagName }: { readonly tagName: string }): Promise<boolean> => {
        if (tagName === "second" && interrupt) {
          interrupt = false;
          return Promise.reject(new Error("injected overlay interruption"));
        }
        const before = attached.size;
        attached.add(tagName);
        return Promise.resolve(attached.size !== before);
      },
    };
    const verb = createImportService({
      ...h.ctx,
      profile,
      findByHandle: ({ handle }: { readonly handle: CharacterHandle }): Promise<CharacterId | null> => Promise.resolve(handle === "aria" ? ARIA : null),
    }).importChatFile;
    const bytes = bundle({ tagNames: ["first", "second"] });

    await expect(verb({ filename: "aria/chat_recovery.orb.json", bytes })).rejects.toThrow("injected overlay interruption");
    expect(attached).toEqual(new Set(["first"]));

    await expect(verb({ filename: "aria/chat_recovery.orb.json", bytes })).resolves.toEqual({ ok: true, created: false, skippedOverlays: [] });
    expect(attached).toEqual(new Set(["first", "second"]));
    expect(imports).toBe(2);
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
    const jsonl = new TextEncoder().encode('{"user_name":"Nate","character_name":"Aria"}\n{"mes":"hi","is_user":true}\n');

    const outcome = await h.verb({ filename: "aria/chat_2025.jsonl", bytes: jsonl });

    expect(outcome).toEqual({ ok: true, created: true, skippedOverlays: [] });
    // The interchange arm's shape: the single migrated note field exists, the orb-only list does not.
    const input = onlyChatInput(h);
    expect(input.injections).toBeUndefined();
    expect(input.starred).toBeUndefined();
  });

  // #1469 item 3 — the routing test was case-SENSITIVE (`filename.endsWith(".jsonl")`), while the profile
  // collector has always matched `/\.jsonl$/i`. An ST box that wrote `chat.JSONL` (or any user who renamed
  // one) therefore fed a valid transcript to the ORB-NATIVE parser, which refuses it by envelope — a
  // readable chat reported as a foreign file.
  test("an UPPERCASE `.JSONL` still routes to the ST interchange arm, never to the orb-native parser", async () => {
    const h = harness();
    const jsonl = new TextEncoder().encode('{"user_name":"Nate","character_name":"Aria"}\n{"mes":"hi","is_user":true}\n');

    const outcome = await h.verb({ filename: "aria/CHAT_2025.JSONL", bytes: jsonl });

    expect(outcome).toEqual({ ok: true, created: true, skippedOverlays: [] });
    expect(onlyChatInput(h).importedFrom).toBe("aria/CHAT_2025.JSONL");
  });
});

// #1469 item 6 — `restoreOverlays` applied `tagNames` only when `attachChatTagByName` was wired and
// `bundle.rpg` only when `importRpgGame` was, with NO else arm and no field on the outcome to carry the
// loss. A composition missing either op therefore answered `{ok:true, created:true}` having discarded the
// room's labels or an entire rpg campaign. The overlays STILL never un-write the room (the header's ruling
// survives) — they are now NAMED in the outcome the calling door renders.
describe("importChatBundle — a dropped overlay is REPORTED, never silent (#1469 item 6)", () => {
  /** A campaign that carries no rows — the PLANE's presence is what this pins, not its remap (the remap has
   *  its own db-side proof in `bundle-round-trip.suite.int.test.ts`). */
  const campaign = {
    mode: "lite",
    status: "active",
    sessionNumber: 3,
    config: rpgGameConfigSchema.parse({}),
    createdAt: 1_699_999_000_000,
    sheets: [],
    snapshots: [],
    journal: [],
    turnToolCalls: [],
    checkpoints: [],
  } as const satisfies PortableChat["rpg"];

  /** The harness with the two OPTIONAL overlay ops wired exactly as asked — the base profile harness wires
   *  NEITHER, which is itself the unwired-composition arm. */
  function harnessWith(wired: { readonly tags?: true; readonly rpg?: true }): ProfileHarness & { readonly verb: ImportService["importChatFile"] } {
    const h = harness();
    const profile = {
      ...h.profile,
      ...(wired.tags === true ? { attachChatTagByName: (): Promise<boolean> => Promise.resolve(true) } : {}),
      ...(wired.rpg === true ? { importRpgGame: (): Promise<void> => Promise.resolve() } : {}),
    };
    return {
      ...h,
      verb: createImportService({
        ...h.ctx,
        profile,
        findByHandle: ({ handle }: { readonly handle: CharacterHandle }): Promise<CharacterId | null> => Promise.resolve(handle === "aria" ? ARIA : null),
      }).importChatFile,
    };
  }

  test("carried tag names with NO tag op wired: the chat imports and the outcome names the dropped labels", async () => {
    const h = harnessWith({ rpg: true });

    const outcome = await h.verb({ filename: "aria/chat_x.orb.json", bytes: bundle({ tagNames: ["road", "grim"] }) });

    expect(outcome.ok).toBe(true);
    expect(outcome.ok ? outcome.skippedOverlays : []).toEqual([
      "2 chat tag(s) not restored (road, grim) — the chat-tag attach is not wired into this composition",
    ]);
    // The room itself still landed: an overlay is never allowed to un-write restored canon.
    expect(h.chatCalls).toHaveLength(1);
  });

  test("a carried RPG campaign with NO rpg op wired: the chat imports and the outcome names the dropped campaign", async () => {
    const h = harnessWith({ tags: true });

    const outcome = await h.verb({ filename: "aria/chat_x.orb.json", bytes: bundle({ rpg: campaign }) });

    expect(outcome.ok).toBe(true);
    expect(outcome.ok ? outcome.skippedOverlays : []).toEqual(["the carried RPG campaign was not restored — rpg import is not wired into this composition"]);
    expect(h.chatCalls).toHaveLength(1);
  });

  test("a fully-wired composition reports an EMPTY list — `landed whole` is distinguishable from `never looked at`", async () => {
    const h = harnessWith({ tags: true, rpg: true });

    const outcome = await h.verb({ filename: "aria/chat_x.orb.json", bytes: bundle({ tagNames: ["road"], rpg: campaign }) });

    expect(outcome).toEqual({ ok: true, created: true, skippedOverlays: [] });
  });

  test("a tag-LESS, campaign-less bundle skips nothing even with both ops unwired — only a CARRIED plane can be lost", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "aria/chat_x.orb.json", bytes: bundle() });

    expect(outcome).toEqual({ ok: true, created: true, skippedOverlays: [] });
  });
});
