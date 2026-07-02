// substrate/chat-jsonl — the pure chat transcript builders (PD-42). Pins the ST-compat esoterics: the
// human UTC date, the >1-variant swipe gate, the header branch/note omission, and TXT = active-only.

import type {
  ExportChatMeta,
  ExportMessage,
} from "../../../../../packages/server/src/domain/export/contract/params.ts";
import {
  buildChatJsonl,
  buildChatTxt,
  formatStDate,
} from "../../../../../packages/server/src/domain/export/substrate/chat-jsonl.ts";
import { expect, test } from "../../../../support/fixtures";

const META: ExportChatMeta = {
  characterName: "Aria",
  userName: "Nate",
  createDate: Date.UTC(2025, 7, 27, 18, 36), // August 27, 2025 6:36pm UTC
};

function msg(over: Partial<ExportMessage> = {}): ExportMessage {
  return {
    role: "assistant",
    content: "hello",
    sendDate: META.createDate,
    model: "m1",
    provider: "p1",
    tokensOut: 5,
    reasoning: null,
    genStarted: null,
    genFinished: null,
    activeVariantIdx: 0,
    variants: [
      {
        content: "hello",
        model: "m1",
        provider: "p1",
        tokensOut: 5,
        reasoning: null,
        genStarted: null,
        genFinished: null,
      },
    ],
    ...over,
  };
}

test("formatStDate emits the ST human form, UTC (noon/midnight 12-hour edges hold)", () => {
  expect(formatStDate(Date.UTC(2025, 7, 27, 18, 36))).toBe("August 27, 2025 6:36pm");
  expect(formatStDate(Date.UTC(2025, 0, 1, 0, 5))).toBe("January 1, 2025 12:05am");
  expect(formatStDate(Date.UTC(2025, 0, 1, 12, 0))).toBe("January 1, 2025 12:00pm");
  expect(formatStDate(null)).toBeNull();
});

test("JSONL: header line + one line per message; single-variant turns emit NO swipe arrays", () => {
  const out = buildChatJsonl(META, [msg()]);
  const [header, line, tail] = out.split("\n");
  expect(tail).toBe(""); // trailing newline
  const h = JSON.parse(header ?? "") as Record<string, unknown>;
  expect(h["user_name"]).toBe("Nate");
  expect(h["character_name"]).toBe("Aria");
  expect(h["create_date"]).toBe("August 27, 2025 6:36pm");
  // No branch/note keys when absent — a clean chat stays clean.
  expect(h["chat_metadata"]).toEqual({});
  const m = JSON.parse(line ?? "") as Record<string, unknown>;
  expect(m["name"]).toBe("Aria");
  expect(m["is_user"]).toBe(false);
  expect(m["mes"]).toBe("hello");
  expect(m["swipes"]).toBeUndefined();
  expect(m["swipe_id"]).toBeUndefined();
});

test("JSONL: >1 variant emits swipes/swipe_id/swipe_info; the branch/note round-trip keys carry", () => {
  const meta: ExportChatMeta = { ...META, parentRef: "parent.jsonl", notePrompt: "keep it noir" };
  const out = buildChatJsonl(meta, [
    msg({
      activeVariantIdx: 1,
      content: "take two",
      variants: [
        {
          content: "take one",
          model: "m1",
          provider: "p1",
          tokensOut: 4,
          reasoning: "hmm",
          genStarted: 1,
          genFinished: 2,
        },
        {
          content: "take two",
          model: "m2",
          provider: "p2",
          tokensOut: 6,
          reasoning: null,
          genStarted: 3,
          genFinished: 4,
        },
      ],
    }),
  ]);
  const [header, line] = out.split("\n");
  const h = JSON.parse(header ?? "") as Record<string, Record<string, unknown>>;
  expect(h["chat_metadata"]?.["main_chat"]).toBe("parent.jsonl");
  expect(h["chat_metadata"]?.["note_prompt"]).toBe("keep it noir");
  const m = JSON.parse(line ?? "") as Record<string, unknown>;
  expect(m["swipes"]).toEqual(["take one", "take two"]);
  expect(m["swipe_id"]).toBe(1);
  const info = m["swipe_info"] as { extra: Record<string, unknown> }[];
  expect(info).toHaveLength(2);
  expect(info[0]?.extra["reasoning"]).toBe("hmm"); // present only when non-null
  expect(info[1]?.extra["reasoning"]).toBeUndefined();
});

test("TXT: Author-labeled blocks, ACTIVE variant only; user falls back to 'You' without a persona", () => {
  const noPersona: ExportChatMeta = { ...META, userName: null };
  const out = buildChatTxt(noPersona, [
    msg({ role: "user", content: "hi there" }),
    msg({ role: "assistant", content: "greetings" }),
    msg({ role: "system", content: "scene shift" }),
  ]);
  expect(out).toBe("You: hi there\n\nAria: greetings\n\nSystem: scene shift\n");
});
