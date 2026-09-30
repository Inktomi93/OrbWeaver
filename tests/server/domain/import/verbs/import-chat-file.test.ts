// Unit test for domain/import/verbs/importChatFile, the one single-transcript path. A bundle path is
// `chats/<character-handle>/<leaf>.jsonl`; the directory handle re-links first, then the transcript's own
// display name, because an ST transcript names its character the way the user sees it.

import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { ImportService } from "../../../../../packages/server/src/domain/import/contract/service.ts";
import { createImportChatBundle } from "../../../../../packages/server/src/domain/import/verbs/import-chat-bundle.ts";
import { createImportChatFile } from "../../../../../packages/server/src/domain/import/verbs/import-chat-file.ts";
import { createImportChats } from "../../../../../packages/server/src/domain/import/verbs/import-chats.ts";
import { expect, test } from "../../../../support/fixtures.ts";
import type { ProfileHarness } from "../_support.ts";
import { makeProfileHarness } from "../_support.ts";

const OWNER = castId<UserId>("user_owner");
const ARIA = castId<CharacterId>("character_aria");
const ELIAS = castId<CharacterId>("character_elias");
const ELIAS_TWIN = castId<CharacterId>("character_elias_twin");
const ENC = new TextEncoder();

/** A real_conversation transcript (a greeting + a user turn) as raw bundle bytes, naming `characterName`. */
function transcript(characterName = "Aria"): Uint8Array {
  const lines = [
    // biome-ignore-start lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case) are the format.
    JSON.stringify({ user_name: "Alex", character_name: characterName, create_date: "2025-07-18@12h00m00s", chat_metadata: {} }),
    JSON.stringify({ is_user: false, mes: "Hello traveller.", send_date: "2025-07-18@12h00m01s" }),
    JSON.stringify({ is_user: true, mes: "Hi Aria!", send_date: "2025-07-18@12h00m02s" }),
    // biome-ignore-end lint/style/useNamingConvention: end of the block above
  ].join("\n");
  return ENC.encode(lines);
}

/** The profile harness + a `findByHandle` over `known` handles and a `findByName` over `named` display names. */
function harness(
  known: Record<string, CharacterId> = { aria: ARIA },
  named: Record<string, readonly CharacterId[]> = {},
): ProfileHarness & { readonly verb: ImportService["importChatFile"] } {
  const h = makeProfileHarness(OWNER);
  const ctx = {
    ...h.ctx,
    findByHandle: ({ handle }: { readonly handle: CharacterHandle }): Promise<CharacterId | null> => Promise.resolve(known[handle] ?? null),
    findByName: ({ name }: { readonly name: string }): Promise<readonly CharacterId[]> => Promise.resolve(named[name] ?? []),
  };
  return { ...h, verb: createImportChatFile(ctx, createImportChats(ctx), createImportChatBundle(ctx)) };
}

describe("importChatFile", () => {
  test("resolves the character from the DIRECTORY and delegates to the one chat-import path", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "aria/chat_2025.jsonl", bytes: transcript() });

    expect(outcome).toEqual({ ok: true, created: true, skippedOverlays: [] });
    // The transcript landed against the handle's character — the directory IS the re-link key.
    expect(h.chatCalls).toHaveLength(1);
    expect(h.chatCalls[0]?.characterId).toBe(ARIA);
    expect(h.chatCalls[0]?.chats[0]?.importedFrom).toBe("aria/chat_2025.jsonl");
    // A real conversation was written ⇒ the downstream index sweep is enqueued.
    expect(h.backfills).toEqual([{ ownerId: OWNER }]);
  });

  // The seeded character is named "Elias Thorn" with handle `elias`; the bare upload door routes the
  // transcript under `slugifyHandle("Elias Thorn")`, a handle the user never sees.
  test("a directory handle that misses resolves the character by the display name the transcript carries", async () => {
    const h = harness({ elias: ELIAS }, { "Elias Thorn": [ELIAS] });

    const outcome = await h.verb({ filename: "elias-thorn/chat.jsonl", bytes: transcript("Elias Thorn") });

    expect(outcome).toEqual({ ok: true, created: true, skippedOverlays: [] });
    expect(h.chatCalls.map((call) => call.characterId)).toEqual([ELIAS]);
  });

  test("a file with no handle directory resolves by the display name", async () => {
    const h = harness({}, { "Elias Thorn": [ELIAS] });

    const outcome = await h.verb({ filename: "loose.jsonl", bytes: transcript("Elias Thorn") });

    expect(outcome.ok).toBe(true);
    expect(h.chatCalls.map((call) => call.characterId)).toEqual([ELIAS]);
  });

  test("a true miss names the display name the user sees, never the handle", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "elias-thorn/chat.jsonl", bytes: transcript("Elias Thorn") });

    const error = outcome.ok ? "" : outcome.error;
    expect(error).toContain('"Elias Thorn"');
    expect(error).not.toContain("elias-thorn");
    expect(h.chatCalls).toEqual([]);
  });

  test("two characters sharing the display name refuse instead of picking one", async () => {
    const h = harness({}, { "Elias Thorn": [ELIAS, ELIAS_TWIN] });

    const outcome = await h.verb({ filename: "elias-thorn/chat.jsonl", bytes: transcript("Elias Thorn") });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.error).toContain('"Elias Thorn"');
    expect(h.chatCalls).toEqual([]);
  });

  test("a transcript that names no character and has no handle directory refuses with words", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "loose.jsonl", bytes: transcript("unused") });

    expect(outcome.ok).toBe(false);
    expect(h.chatCalls).toEqual([]);
  });

  test("a body that is not a chat .jsonl refuses rather than throwing (per-file isolation)", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "aria/broken.jsonl", bytes: ENC.encode("{not json") });

    expect(outcome).toEqual({ ok: false, error: "not a valid chat .jsonl file" });
    expect(h.chatCalls).toEqual([]);
  });
});
