// biome-ignore-all lint/style/useNamingConvention: ST chat-JSONL wire field names (snake_case) appear
// verbatim in these fixtures — they ARE the format.
// biome-ignore-all lint/security/noSecrets: ST @-date tokens + epoch-ms literals in the fixtures are not secrets.
// Mirror test for @orb/server/kit/serde/chat — the ONE chat-JSONL serde core (W0a). Pins BOTH directions:
// the parser esoterica (filename-date-wins, empty-swipe drop + active-index remap, the 4-bucket classifier,
// branch ref, null-on-unparseable-header), the builder esoterica (human UTC date, the >1-variant swipe gate,
// header branch/note omission, TXT = active-only + per-message speaker), and the build→parse→build ROUND-TRIP
// identity (the structural drift guard against the two halves diverging).

import type { ParsedChat, ParsedChatMessage } from "@orb/server/kit/serde/chat";
import { buildChatJsonl, buildChatTxt, formatStDate, parseChatJsonl, parseStDate } from "@orb/server/kit/serde/chat";
import { describe } from "vitest";
import { expect, test } from "../../../../support/fixtures.ts";

// ── parse ────────────────────────────────────────────────────────────────────────────────────────────────

const MIGRATION_MS = Date.UTC(2025, 6, 18, 12, 0, 0); // 2025-07-18 — the re-save clobber date

function header(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    user_name: "Nate",
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

  test("reads the per-line `name` into speakerName", () => {
    const parsed = parseChatJsonl(`${header()}\n${line({ name: "Bran", mes: "hi" })}`, {
      fileName: "m.jsonl",
      charDirName: "Aria",
    });
    expect(parsed?.messages[0]?.speakerName).toBe("Bran");
  });

  test("esoterica 3 — empty swipe slots dropped + active index remapped; <2 survivors ⇒ no pool", () => {
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

    const single = line({ mes: "only", swipes: ["only", ""], swipe_id: 0 });
    const p2 = parseChatJsonl(`${header()}\n${single}`, { fileName: "m.jsonl", charDirName: "A" });
    expect(p2?.messages[0]?.variants).toEqual([]);
    expect(p2?.messages[0]?.activeVariantIdx).toBeNull();
  });

  test("bucket classifier — header_only / greeting_only / real_conversation", () => {
    expect(parseChatJsonl(header(), { fileName: "m.jsonl", charDirName: "A" })?.bucket).toBe("header_only");
    expect(
      parseChatJsonl(`${header()}\n${line({ is_user: false, mes: "greeting" })}`, {
        fileName: "m.jsonl",
        charDirName: "A",
      })?.bucket,
    ).toBe("greeting_only");
    const convo = `${header()}\n${line({ is_user: false, mes: "hi" })}\n${line({ is_user: true, mes: "hello" })}`;
    expect(parseChatJsonl(convo, { fileName: "m.jsonl", charDirName: "A" })?.bucket).toBe("real_conversation");
  });

  test("branch ref — main_chat wins; falls back to the filename lineage; isBranch on 'Branch #'", () => {
    const withMain = parseChatJsonl(`${header({ chat_metadata: { main_chat: "Aria - 2023-11-11@09h41m32s538ms" } })}\n${line()}`, {
      fileName: "Aria - date - Branch #1.jsonl",
      charDirName: "Aria",
    });
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

  test("a blank `mes` with no surviving swipe (pre-D124 debris) is stripped, not minted as an empty row", () => {
    const text = `${header()}\n${line({ mes: "" })}\n${line({ mes: "survived" })}`;
    const parsed = parseChatJsonl(text, { fileName: "m.jsonl", charDirName: "A" });
    expect(parsed?.messages).toHaveLength(1);
    expect(parsed?.messages[0]?.content).toBe("survived");
  });
});

// ── build ────────────────────────────────────────────────────────────────────────────────────────────────

const BUILD_DATE = Date.UTC(2025, 7, 27, 18, 36); // August 27, 2025 6:36pm UTC (minute-aligned)

function pmsg(over: Partial<ParsedChatMessage> = {}): ParsedChatMessage {
  return {
    role: "assistant",
    speakerName: "Aria",
    content: "hello",
    sendDate: BUILD_DATE,
    model: "m1",
    provider: "p1",
    tokensOut: 5,
    reasoning: null,
    genStarted: null,
    genFinished: null,
    ttftMs: null,
    metadata: null,
    activeVariantIdx: 0,
    variants: [
      {
        idx: 0,
        content: "hello",
        model: "m1",
        provider: "p1",
        tokensOut: 5,
        reasoning: null,
        genStarted: null,
        genFinished: null,
        metadata: null,
      },
    ],
    ...over,
  };
}

function pchat(messages: readonly ParsedChatMessage[], over: Partial<ParsedChat> = {}): ParsedChat {
  return {
    characterName: "Aria",
    userName: "Nate",
    createDate: BUILD_DATE,
    isBranch: false,
    parentRef: null,
    notePrompt: null,
    bucket: "real_conversation",
    sourceMetadata: null,
    messages,
    ...over,
  };
}

describe("formatStDate", () => {
  test("emits the ST human form, UTC (noon/midnight 12-hour edges hold)", () => {
    expect(formatStDate(Date.UTC(2025, 7, 27, 18, 36))).toBe("August 27, 2025 6:36pm");
    expect(formatStDate(Date.UTC(2025, 0, 1, 0, 5))).toBe("January 1, 2025 12:05am");
    expect(formatStDate(Date.UTC(2025, 0, 1, 12, 0))).toBe("January 1, 2025 12:00pm");
    expect(formatStDate(null)).toBeNull();
  });
});

describe("buildChatJsonl", () => {
  test("header line + one line per message; single-variant turns emit NO swipe arrays", () => {
    const out = buildChatJsonl(pchat([pmsg()]));
    const [header0, line0, tail] = out.split("\n");
    expect(tail).toBe(""); // trailing newline
    const h = JSON.parse(header0 ?? "") as Record<string, unknown>;
    expect(h["user_name"]).toBe("Nate");
    expect(h["character_name"]).toBe("Aria");
    expect(h["create_date"]).toBe("August 27, 2025 6:36pm");
    expect(h["chat_metadata"]).toEqual({}); // no branch/note keys when absent
    const m = JSON.parse(line0 ?? "") as Record<string, unknown>;
    expect(m["name"]).toBe("Aria");
    expect(m["is_user"]).toBe(false);
    expect(m["mes"]).toBe("hello");
    expect(m["swipes"]).toBeUndefined();
    expect(m["swipe_id"]).toBeUndefined();
  });

  test(">1 variant emits swipes/swipe_id/swipe_info; the branch/note round-trip keys carry", () => {
    const out = buildChatJsonl(
      pchat(
        [
          pmsg({
            activeVariantIdx: 1,
            content: "take two",
            variants: [
              {
                idx: 0,
                content: "take one",
                model: "m1",
                provider: "p1",
                tokensOut: 4,
                reasoning: "hmm",
                genStarted: null,
                genFinished: null,
                metadata: null,
              },
              {
                idx: 1,
                content: "take two",
                model: "m2",
                provider: "p2",
                tokensOut: 6,
                reasoning: null,
                genStarted: null,
                genFinished: null,
                metadata: null,
              },
            ],
          }),
        ],
        { parentRef: "parent.jsonl", notePrompt: "keep it noir" },
      ),
    );
    const [header0, line0] = out.split("\n");
    const h = JSON.parse(header0 ?? "") as Record<string, Record<string, unknown>>;
    expect(h["chat_metadata"]?.["main_chat"]).toBe("parent.jsonl");
    expect(h["chat_metadata"]?.["note_prompt"]).toBe("keep it noir");
    const m = JSON.parse(line0 ?? "") as Record<string, unknown>;
    expect(m["swipes"]).toEqual(["take one", "take two"]);
    expect(m["swipe_id"]).toBe(1);
    const info = m["swipe_info"] as { extra: Record<string, unknown> }[];
    expect(info).toHaveLength(2);
    expect(info[0]?.extra["reasoning"]).toBe("hmm"); // present only when non-null
    expect(info[1]?.extra["reasoning"]).toBeUndefined();
  });
});

describe("agent_author provenance (PD-17)", () => {
  test("emitted ONLY when agentAuthor is present; absent turns carry no key", () => {
    const withAgent = JSON.parse(buildChatJsonl(pchat([pmsg({ agentAuthor: { name: "Pip", sourceKind: "buddy" } })])).split("\n")[1] ?? "") as Record<
      string,
      unknown
    >;
    expect(withAgent["agent_author"]).toEqual({ name: "Pip", source_kind: "buddy" });
    const without = JSON.parse(buildChatJsonl(pchat([pmsg()])).split("\n")[1] ?? "") as Record<string, unknown>;
    expect(without["agent_author"]).toBeUndefined();
  });

  test("round-trips: build → parse → build carries agentAuthor intact (the drift guard covers the sidecar)", () => {
    const source = pchat([pmsg({ agentAuthor: { name: "Pip", sourceKind: "buddy" } })]);
    const reparsed = parseChatJsonl(buildChatJsonl(source), { fileName: "x.jsonl", charDirName: "Aria" });
    expect(reparsed).not.toBeNull();
    expect(reparsed?.messages[0]?.agentAuthor).toEqual({ name: "Pip", sourceKind: "buddy" });
    expect(buildChatJsonl(reparsed as ParsedChat)).toBe(buildChatJsonl(source));
  });

  test("a blank/partial agent_author on the wire degrades to absent (no fabricated half-identity)", () => {
    const badLine = JSON.stringify({ is_user: false, mes: "hi", agent_author: { name: "", source_kind: "buddy" } });
    const parsed = parseChatJsonl(`${header()}\n${badLine}`, { fileName: "x.jsonl", charDirName: "Aria" });
    expect(parsed?.messages[0]?.agentAuthor).toBeUndefined();
  });
});

describe("buildChatTxt", () => {
  test("Author-labeled blocks per the PER-MESSAGE speaker; system stays 'System'", () => {
    const out = buildChatTxt(
      pchat([
        pmsg({ role: "user", content: "hi there", speakerName: "Nate" }),
        pmsg({ role: "assistant", content: "greetings", speakerName: "Aria" }),
        pmsg({ role: "system", content: "scene shift", speakerName: "ignored" }),
      ]),
    );
    expect(out).toBe("Nate: hi there\n\nAria: greetings\n\nSystem: scene shift\n");
  });

  test("group fidelity: each turn serializes under ITS OWN speaker (JSONL name + TXT author)", () => {
    const rows = [
      pmsg({ role: "user", content: "hello all", speakerName: "Nate" }),
      pmsg({ role: "assistant", content: "Bran here", speakerName: "Bran" }),
      pmsg({ role: "assistant", content: "Cara here", speakerName: "Cara" }),
    ];
    const jsonl = buildChatJsonl(pchat(rows)).split("\n");
    expect((JSON.parse(jsonl[1] ?? "") as Record<string, unknown>)["name"]).toBe("Nate");
    expect((JSON.parse(jsonl[2] ?? "") as Record<string, unknown>)["name"]).toBe("Bran");
    expect((JSON.parse(jsonl[3] ?? "") as Record<string, unknown>)["name"]).toBe("Cara");
    expect(buildChatTxt(pchat(rows))).toBe("Nate: hello all\n\nBran: Bran here\n\nCara: Cara here\n");
  });
});

// ── round-trip (the drift guard) ─────────────────────────────────────────────────────────────────────────

describe("build → parse → build identity", () => {
  test("the serialized JSONL is the stable fixed point (single + multi-variant, branch, note)", () => {
    const source = pchat(
      [
        pmsg({ role: "assistant", content: "hello", speakerName: "Aria" }),
        pmsg({
          role: "user",
          content: "take two",
          speakerName: "Nate",
          activeVariantIdx: 1,
          variants: [
            {
              idx: 0,
              content: "take one",
              model: "m1",
              provider: "p1",
              tokensOut: 4,
              reasoning: "hmm",
              genStarted: null,
              genFinished: null,
              metadata: null,
            },
            {
              idx: 1,
              content: "take two",
              model: "m2",
              provider: "p2",
              tokensOut: 6,
              reasoning: null,
              genStarted: null,
              genFinished: null,
              metadata: null,
            },
          ],
        }),
      ],
      { parentRef: "parent.jsonl", notePrompt: "keep it noir" },
    );

    const jsonl1 = buildChatJsonl(source);
    // fileName carries NO date token → the header create_date wins the round-trip.
    const reparsed = parseChatJsonl(jsonl1, { fileName: "chat.jsonl", charDirName: "Aria" });
    if (reparsed === null) {
      throw new Error("reparse failed");
    }
    const jsonl2 = buildChatJsonl(reparsed);
    expect(jsonl2).toBe(jsonl1);
  });
});
