// biome-ignore-all lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case) are the format.
// biome-ignore-all lint/security/noSecrets: ST @-date tokens in the fixtures are not secrets.
// Unit test for domain/import/verbs/importChatFile — the ONE single-transcript path (F8: this body used to
// live inline at `entry/compose/portability.ts`, outside every domain test mirror, so its refusal copy and
// its handle derivation had no coverage at all).
//
// The bundle path is `chats/<character-handle>/<leaf>.jsonl`: the DIRECTORY is the re-link key, because chat
// ids are not preserved across a box. Load-bearing: the handle resolves through the injected
// `findByHandle`; a bare filename, an unknown handle, and a non-jsonl body each refuse with the operator
// words the import report renders; and NOTHING throws.

import type { CharacterHandle, CharacterId, UserId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { ImportService } from "../../../../../packages/server/src/domain/import/contract/service.ts";
import { createImportChatFile } from "../../../../../packages/server/src/domain/import/verbs/import-chat-file.ts";
import { createImportChats } from "../../../../../packages/server/src/domain/import/verbs/import-chats.ts";
import { expect, test } from "../../../../support/fixtures";
import type { ProfileHarness } from "../_support.ts";
import { makeProfileHarness } from "../_support.ts";

const OWNER = castId<UserId>("user_owner");
const ARIA = castId<CharacterId>("character_aria");
const ENC = new TextEncoder();

/** A real_conversation transcript (a greeting + a user turn) as raw bundle bytes. */
function transcript(): Uint8Array {
  const lines = [
    JSON.stringify({ user_name: "Nate", character_name: "Aria", create_date: "2025-07-18@12h00m00s", chat_metadata: {} }),
    JSON.stringify({ is_user: false, mes: "Hello traveller.", send_date: "2025-07-18@12h00m01s" }),
    JSON.stringify({ is_user: true, mes: "Hi Aria!", send_date: "2025-07-18@12h00m02s" }),
  ].join("\n");
  return ENC.encode(lines);
}

/** The profile harness + a `findByHandle` that knows exactly one handle. */
function harness(known: Record<string, CharacterId> = { aria: ARIA }): ProfileHarness & { readonly verb: ImportService["importChatFile"] } {
  const h = makeProfileHarness(OWNER);
  const ctx = {
    ...h.ctx,
    findByHandle: ({ handle }: { readonly handle: CharacterHandle }): Promise<CharacterId | null> => Promise.resolve(known[handle] ?? null),
  };
  return { ...h, verb: createImportChatFile(ctx, createImportChats(ctx)) };
}

describe("importChatFile", () => {
  test("resolves the character from the DIRECTORY and delegates to the one chat-import path", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "aria/chat_2025.jsonl", bytes: transcript() });

    expect(outcome).toEqual({ ok: true, created: true });
    // The transcript landed against the handle's character — the directory IS the re-link key.
    expect(h.chatCalls).toHaveLength(1);
    expect(h.chatCalls[0]?.characterId).toBe(ARIA);
    expect(h.chatCalls[0]?.chats[0]?.importedFrom).toBe("aria/chat_2025.jsonl");
    // A real conversation was written ⇒ the downstream index sweep is enqueued (PD-78).
    expect(h.backfills).toEqual([{ ownerId: OWNER }]);
  });

  test("a file NOT under a handle directory refuses with words, and writes nothing", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "loose.jsonl", bytes: transcript() });

    expect(outcome).toEqual({ ok: false, error: "chat file is not under a character-handle directory" });
    expect(h.chatCalls).toEqual([]);
  });

  test("an unknown handle names the handle in the refusal — the user's actionable difference", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "stranger/chat.jsonl", bytes: transcript() });

    expect(outcome.ok).toBe(false);
    expect(outcome.ok ? "" : outcome.error).toContain('no character with handle "stranger"');
    expect(h.chatCalls).toEqual([]);
  });

  test("a body that is not a chat .jsonl refuses rather than throwing (per-file isolation)", async () => {
    const h = harness();

    const outcome = await h.verb({ filename: "aria/broken.jsonl", bytes: ENC.encode("{not json") });

    expect(outcome).toEqual({ ok: false, error: "not a valid chat .jsonl file" });
    expect(h.chatCalls).toEqual([]);
  });
});
