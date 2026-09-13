// domain/chat/substrate/rpg-transcript — pure canon → transcript projection. Pins: the name-stamp
// resolution per role (assistant → character name, user → persona name, system → null), and the
// oldest-to-newest window slice that ALWAYS keeps at least one message (a single huge beat degrades to one
// message rather than truncating to nothing).

import type { MessageView } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId, MessageVariantId, PersonaId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import type { HistoryMacroNames } from "../../../../../packages/server/src/domain/chat/contract/results.ts";
import { projectRpgTranscript, sliceCanonWindow } from "../../../../../packages/server/src/domain/chat/substrate/rpg-transcript.ts";
import { expect, test } from "../../../../support/fixtures.ts";

const CHAR_A = castId<CharacterId>("character_a");
const PERSONA_A = castId<PersonaId>("persona_a");

function names(): HistoryMacroNames {
  return {
    characterNamesById: new Map([[CHAR_A, { name: "Aria" }]]),
    personaNamesById: new Map([[PERSONA_A, { name: "You", description: "" }]]),
  };
}

function row(overrides: Partial<MessageView>): MessageView {
  // @orb-waive no-test-fabrication(MessageView): a minimal MessageView double — projectRpgTranscript/sliceCanonWindow read only the fields below; the remaining MessageView columns are irrelevant to this pure projection. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  return {
    id: castId<MessageId>("message_x"),
    variantId: castId<MessageVariantId>("variant_x"),
    chatId: castId<ChatId>("chat_x"),
    seq: 1,
    role: "assistant",
    characterId: null,
    personaId: null,
    content: "text",
    createdAt: 0,
    ...overrides,
  } as MessageView;
}

describe("projectRpgTranscript", () => {
  test("assistant rows resolve the stamped CHARACTER name; user rows resolve the stamped PERSONA name", () => {
    const rows = [row({ role: "assistant", characterId: CHAR_A, content: "I draw my sword." }), row({ role: "user", personaId: PERSONA_A, content: "I run." })];
    const out = projectRpgTranscript(rows, names());
    expect(out[0]).toMatchObject({ role: "assistant", speakerName: "Aria", content: "I draw my sword." });
    expect(out[1]).toMatchObject({ role: "user", speakerName: "You", content: "I run." });
  });

  test("system rows never resolve a speaker name (no speaker)", () => {
    const out = projectRpgTranscript([row({ role: "system", content: "The scene shifts." })], names());
    expect(out[0]?.speakerName).toBeNull();
  });

  test("an unresolvable stamp (id not in the name maps, or null id) yields null, not a throw", () => {
    const out = projectRpgTranscript(
      [row({ role: "assistant", characterId: castId<CharacterId>("character_ghost") }), row({ role: "assistant", characterId: null })],
      names(),
    );
    expect(out[0]?.speakerName).toBeNull();
    expect(out[1]?.speakerName).toBeNull();
  });

  test("each row is token-measured", () => {
    const out = projectRpgTranscript([row({ content: "hello world" })], names());
    expect(out[0]?.tokens).toBeGreaterThan(0);
  });
});

describe("sliceCanonWindow", () => {
  const transcript = projectRpgTranscript(
    [row({ seq: 1, content: "a".repeat(40) }), row({ seq: 2, content: "b".repeat(40) }), row({ seq: 3, content: "c".repeat(40) })],
    names(),
  );

  test("a generous budget keeps everything, in original oldest→newest order", () => {
    const out = sliceCanonWindow(transcript, 10_000);
    expect(out.map((r) => r.content)).toEqual(transcript.map((r) => r.content));
  });

  test("a tight budget keeps the NEWEST messages, restored to oldest→newest order", () => {
    const firstMessage = transcript[0];
    if (firstMessage === undefined) {
      throw new Error("fixture transcript is empty");
    }
    const out = sliceCanonWindow(transcript, firstMessage.tokens + 1); // room for one message only
    expect(out).toHaveLength(1);
    expect(out[0]?.content).toBe(transcript[2]?.content); // the newest survives
  });

  test("a budget smaller than a single message still keeps AT LEAST ONE — never truncates to empty", () => {
    const out = sliceCanonWindow(transcript, 1);
    expect(out).toHaveLength(1);
    expect(out[0]?.content).toBe(transcript[2]?.content);
  });

  test("an empty transcript slices to empty", () => {
    expect(sliceCanonWindow([], 1000)).toEqual([]);
  });
});
