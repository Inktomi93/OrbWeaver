// biome-ignore-all lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case) appear
// verbatim in these fixtures — they ARE the format.
// biome-ignore-all lint/security/noSecrets: ST @-date tokens + epoch-ms literals in the fixtures are not secrets.
// Mirror test for domain/import/substrate/chat — the ST chat-JSONL parser. Pins the load-bearing esoterica:
// the filename-date-wins rule, the empty-swipe drop + active-index remap, the 4-bucket classifier, branch
// ref derivation, and the null-on-unparseable-header contract.

import { describe } from "vitest";
// The parser is a substrate-internal module (not a front-door export) — this mirror test reaches it directly.
import {
  parseChatJsonl,
  parseStDate,
} from "../../../../../packages/server/src/domain/import/substrate/chat.ts";
import { expect, test } from "../../../../support/fixtures";

// The migration date every re-saved header/message date collapses onto (the filename must beat this).
const MIGRATION_MS = Date.UTC(2025, 6, 18, 12, 0, 0); // 2025-07-18

function header(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    user_name: "Alex",
    character_name: "Aria",
    create_date: "2025-07-18@12h00m00s",
    chat_metadata: {},
    ...over,
  });
}

function line(over: Record<string, unknown> = {}): string {
  return JSON.stringify({ is_user: false, mes: "hi", send_date: "2025-07-18@12h00m00s", ...over });
}

describe("parseStDate", () => {
  test("numeric epoch seconds and ms both normalize to ms UTC", () => {
    expect(parseStDate(1_690_000_000)).toBe(1_690_000_000_000); // seconds → ms
    expect(parseStDate(1_690_000_000_000)).toBe(1_690_000_000_000); // already ms
  });

  test("ST @-date parses as UTC", () => {
    expect(parseStDate("2023-11-11@09h41m32s538ms")).toBe(Date.UTC(2023, 10, 11, 9, 41, 32));
  });

  test("human date with am/pm parses as UTC (12h→24h)", () => {
    expect(parseStDate("August 27, 2025 6:36pm")).toBe(Date.UTC(2025, 7, 27, 18, 36));
    expect(parseStDate("August 27, 2025 12:00am")).toBe(Date.UTC(2025, 7, 27, 0, 0));
  });

  test("empty / non-date / bare year → null", () => {
    expect(parseStDate("")).toBeNull();
    expect(parseStDate(null)).toBeNull();
    expect(parseStDate("2025")).toBeNull();
    expect(parseStDate("not a date")).toBeNull();
  });
});

describe("parseChatJsonl", () => {
  test("null when the header line is unparseable", () => {
    expect(parseChatJsonl("{not json", { fileName: "x.jsonl", charDirName: "Aria" })).toBeNull();
    expect(parseChatJsonl("", { fileName: "x.jsonl", charDirName: "Aria" })).toBeNull();
  });

  test("esoterica 1 — the FILENAME date beats the (re-save-clobbered) header create_date", () => {
    const text = `${header()}\n${line()}`;
    const parsed = parseChatJsonl(text, {
      fileName: "Aria - 2023-11-11@09h41m32s538ms.jsonl",
      charDirName: "Aria",
    });
    expect(parsed?.createDate).toBe(Date.UTC(2023, 10, 11, 9, 41, 32));
    expect(parsed?.createDate).not.toBe(MIGRATION_MS);
  });

  test("falls back to the header create_date when the filename has no date token", () => {
    const parsed = parseChatJsonl(`${header()}\n${line()}`, {
      fileName: "main.jsonl",
      charDirName: "Aria",
    });
    expect(parsed?.createDate).toBe(MIGRATION_MS);
  });

  test("'unused'/empty character_name falls back to the chat dir name", () => {
    const parsed = parseChatJsonl(`${header({ character_name: "unused" })}\n${line()}`, {
      fileName: "main.jsonl",
      charDirName: "Block of Cheese",
    });
    expect(parsed?.characterName).toBe("Block of Cheese");
  });

  test("esoterica 3 — empty swipe slots dropped + active index remapped; <2 survivors ⇒ no pool", () => {
    // Pool: ["A", "", "B"] with swipe_id=2 (the ORIGINAL index of "B"). After dropping the empty mid-slot,
    // "B" lands at filtered index 1.
    const withSwipes = line({
      is_user: false,
      mes: "B",
      swipes: ["A", "", "B"],
      swipe_id: 2,
      swipe_info: [{}, {}, { extra: { model: "m", token_count: 7 } }],
    });
    const parsed = parseChatJsonl(`${header()}\n${withSwipes}`, {
      fileName: "main.jsonl",
      charDirName: "Aria",
    });
    if (parsed === null) {
      throw new Error("expected a parsed chat");
    }
    const [msg] = parsed.messages;
    if (msg === undefined) {
      throw new Error("expected a parsed message");
    }
    expect(msg.variants.map((v) => v.content)).toEqual(["A", "B"]);
    expect(msg.activeVariantIdx).toBe(1);
    expect(msg.variants[1]?.tokensOut).toBe(7);

    // A single real generation (one non-empty swipe) yields NO variant pool.
    const single = line({ mes: "only", swipes: ["only", ""], swipe_id: 0 });
    const p2 = parseChatJsonl(`${header()}\n${single}`, { fileName: "m.jsonl", charDirName: "A" });
    expect(p2?.messages[0]?.variants).toEqual([]);
    expect(p2?.messages[0]?.activeVariantIdx).toBeNull();
  });

  test("bucket classifier — header_only / greeting_only / real_conversation", () => {
    expect(parseChatJsonl(header(), { fileName: "m.jsonl", charDirName: "A" })?.bucket).toBe(
      "header_only",
    );
    expect(
      parseChatJsonl(`${header()}\n${line({ is_user: false, mes: "greeting" })}`, {
        fileName: "m.jsonl",
        charDirName: "A",
      })?.bucket,
    ).toBe("greeting_only");
    const convo = `${header()}\n${line({ is_user: false, mes: "hi" })}\n${line({ is_user: true, mes: "hello" })}`;
    expect(parseChatJsonl(convo, { fileName: "m.jsonl", charDirName: "A" })?.bucket).toBe(
      "real_conversation",
    );
  });

  test("branch ref — main_chat wins; falls back to the filename lineage; isBranch on 'Branch #'", () => {
    const withMain = parseChatJsonl(
      `${header({ chat_metadata: { main_chat: "Aria - 2023-11-11@09h41m32s538ms" } })}\n${line()}`,
      { fileName: "Aria - date - Branch #1.jsonl", charDirName: "Aria" },
    );
    expect(withMain?.parentRef).toBe("Aria - 2023-11-11@09h41m32s538ms.jsonl");
    expect(withMain?.isBranch).toBe(true);

    const derived = parseChatJsonl(`${header()}\n${line()}`, {
      fileName: "Aria - 2023-11-11@09h41m32s538ms - Branch #1.jsonl",
      charDirName: "Aria",
    });
    expect(derived?.parentRef).toBe("Aria - 2023-11-11@09h41m32s538ms.jsonl");
  });

  test("a corrupt message line is skipped, not fatal", () => {
    const text = `${header()}\n{bad json\n${line({ mes: "survived" })}`;
    const parsed = parseChatJsonl(text, { fileName: "m.jsonl", charDirName: "A" });
    expect(parsed?.messages).toHaveLength(1);
    expect(parsed?.messages[0]?.content).toBe("survived");
  });
});
