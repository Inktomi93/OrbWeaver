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

  // ── the 2026-08-08 import-fidelity audit: ST's zone-less forms are a LOCAL wall clock ──
  // Defect proof (each of these read 6-7h early before the fix, which is exactly the owner-reported
  // "times come out wrong"): both human forms resolve in the CALLER'S zone, and the ABSOLUTE encodings
  // must stay immovable by it.
  const DENVER = "America/Denver";

  test("both wall-clock forms resolve in the supplied zone, not UTC", () => {
    // MST (UTC-7) — the winter arm; 231 corpus files measured at exactly +7h.
    expect(parseStDate("2025-11-30@11h47m20s989ms", DENVER)).toBe(Date.UTC(2025, 10, 30, 18, 47, 20));
    expect(parseStDate("December 28, 2025 12:55pm", DENVER)).toBe(Date.UTC(2025, 11, 28, 19, 55));
    // MDT (UTC-6) — the summer arm, resolved PER INSTANT (a fixed offset could not express both).
    expect(parseStDate("August 27, 2025 6:36pm", DENVER)).toBe(Date.UTC(2025, 7, 28, 0, 36));
  });

  test("absolute encodings ignore the zone (epoch + ISO are already instants)", () => {
    expect(parseStDate(1_690_000_000, DENVER)).toBe(1_690_000_000_000);
    expect(parseStDate("2025-11-30T18:47:20.993Z", DENVER)).toBe(Date.parse("2025-11-30T18:47:20.993Z"));
  });

  test("formatStDate is the exact inverse in the same zone (round trip cannot drift)", () => {
    const ms = Date.UTC(2025, 11, 28, 19, 55);
    expect(formatStDate(ms, DENVER)).toBe("December 28, 2025 12:55pm");
    expect(parseStDate(formatStDate(ms, DENVER), DENVER)).toBe(ms);
  });

  test("ST's spaced / single-digit @-date spellings parse (76 of 1097 corpus files carry one)", () => {
    // SOURCE-PINNED to ST's own `utils.js parseTimestamp` patterns; a miss here silently degraded a chat's
    // createdAt to the import clock.
    expect(parseStDate("2025-5-7 @22h 52m 11s 856ms")).toBe(Date.UTC(2025, 4, 7, 22, 52, 11));
    expect(parseStDate("2024-3-3@14h33m22s")).toBe(Date.UTC(2024, 2, 3, 14, 33, 22));
  });
});

describe("parseChatJsonl — the 2026-08-08 import-fidelity pins", () => {
  test("the filename date survives ST's spaced/single-digit spelling instead of degrading to null", () => {
    const parsed = parseChatJsonl(`${header({ create_date: undefined })}\n${line({ send_date: undefined })}`, {
      fileName: "Emily Singleton - 2025-5-7 @22h 52m 11s 856ms.jsonl",
      charDirName: "Emily Singleton",
    });
    expect(parsed?.createDate).toBe(Date.UTC(2025, 4, 7, 22, 52, 11));
  });

  test("token_count routes by ROLE: user/system inbound, assistant outbound", () => {
    const jsonl = [
      header(),
      line({ is_user: true, mes: "a long user turn", extra: { token_count: 409 } }),
      line({ is_user: false, mes: "the reply", extra: { token_count: 657 } }),
      line({ is_system: true, mes: "a system note", extra: { token_count: 3299 } }),
    ].join("\n");
    const parsed = parseChatJsonl(jsonl, { fileName: "m.jsonl", charDirName: "Aria" });
    // ST's ONE field is the count of the row's OWN text, so a user's typed tokens are INBOUND. Crediting
    // them to tokensOut put 1,247,278 corpus tokens of typed text into every "model output" rollup.
    expect(parsed?.messages[0]).toMatchObject({ role: "user", tokensIn: 409, tokensOut: null });
    expect(parsed?.messages[1]).toMatchObject({ role: "assistant", tokensIn: null, tokensOut: 657 });
    expect(parsed?.messages[2]).toMatchObject({ role: "system", tokensIn: 3299, tokensOut: null });
  });

  test("the whole file's wall-clock dates resolve in the declared zone", () => {
    const parsed = parseChatJsonl(`${header()}\n${line({ send_date: "November 3, 2025 6:43am" })}`, {
      fileName: "Aria - 2025-11-30@11h47m20s989ms.jsonl",
      charDirName: "Aria",
      wallClockZone: "America/Denver",
    });
    expect(parsed?.createDate).toBe(Date.UTC(2025, 10, 30, 18, 47, 20));
    expect(parsed?.messages[0]?.sendDate).toBe(Date.UTC(2025, 10, 3, 13, 43));
  });

  test("§5.1 — a swipe's metadata is the FLAT extra shape, whatever the take's path", () => {
    const swiped = line({
      is_user: false,
      mes: "take two",
      extra: { model: "m", reasoning_duration: 900 },
      swipes: ["take one", "take two"],
      swipe_id: 1,
      swipe_info: [
        { send_date: "2025-07-18@11h00m00s", gen_started: 1, gen_finished: 2, extra: { model: "m1", reasoning_duration: 1200, bias: "x" } },
        { send_date: "2025-07-18@12h00m00s", gen_started: 3, gen_finished: 4, extra: { model: "m2", reasoning_duration: 900 } },
      ],
    });
    const parsed = parseChatJsonl(`${header()}\n${swiped}`, { fileName: "m.jsonl", charDirName: "Aria" });
    const pool = parsed?.messages[0]?.variants ?? [];
    // `reasoning_duration` sits at the TOP level — the only shape `json_extract(metadata,'$.reasoning_duration')`
    // (domain/stats' rebuild + the live stats-delta twin) can resolve. The nested `{extra:{…}}` shape this
    // stored until 2026-08-08 read NULL for all 12,718 swipe-bearing corpus rows.
    expect(pool.map((v) => v.metadata?.["reasoning_duration"])).toEqual([1200, 900]);
    expect(pool[0]?.metadata?.["bias"]).toBe("x");
    // The swipe entry's non-sidecar residue rides along: flattening is not a drop (78,407 corpus send_dates).
    expect(pool[0]?.metadata?.["send_date"]).toBe("2025-07-18@11h00m00s");
    // …and the two timings are NOT duplicated into the blob — they are columns, exactly as a single-take
    // row's line-level gen_started/gen_finished are.
    expect(pool[0]?.metadata?.["gen_started"]).toBeUndefined();
    expect(pool[0]?.genStarted).not.toBeNull();
    // A single-take row's blob is unchanged — this IS the canonical shape both paths now write.
    const single = parseChatJsonl(`${header()}\n${line({ extra: { model: "m", reasoning_duration: 42 } })}`, { fileName: "s.jsonl", charDirName: "Aria" });
    expect(single?.messages[0]?.metadata).toEqual({ model: "m", reasoning_duration: 42 });
  });

  test("§5.6 — chat_metadata.variables parses to a flat string map; non-strings drop; empty ⇒ null", () => {
    const withVars = parseChatJsonl(`${header({ chat_metadata: { variables: { questGiver: "Marla", coins: "37", tally: 5, blob: { a: 1 } } } })}\n${line()}`, {
      fileName: "v.jsonl",
      charDirName: "Aria",
    });
    // orb's seat is a flat `Record<string,string>`; a non-string from a foreign writer is dropped rather than
    // stringified into a shape no reader could interpret.
    expect(withVars?.variables).toEqual({ questGiver: "Marla", coins: "37" });
    expect(parseChatJsonl(`${header({ chat_metadata: { variables: {} } })}\n${line()}`, { fileName: "v.jsonl", charDirName: "Aria" })?.variables).toBeNull();
    expect(parseChatJsonl(`${header()}\n${line()}`, { fileName: "v.jsonl", charDirName: "Aria" })?.variables).toBeNull();
  });

  test("§5.5 — the author's-note placement knobs parse in ST's own numeric vocabulary", () => {
    const meta = { note_prompt: "Keep it tense.", note_depth: 2, note_position: 0, note_role: 1, note_interval: 1 };
    const parsed = parseChatJsonl(`${header({ chat_metadata: meta })}\n${line()}`, { fileName: "n.jsonl", charDirName: "Aria" });
    // UNTRANSLATED here by design — the serde owns ST's grammar; the import mapper owns the conversion.
    expect(parsed?.notePlacement).toEqual({ depth: 2, position: 0, role: 1, interval: 1 });
    // Knobs are parsed INDEPENDENTLY of the note text: 1,070 of the 1,097 corpus chats record the knobs and
    // ZERO carry note text, so a text-gated read would have found nothing to convert.
    const knobsOnly = parseChatJsonl(`${header({ chat_metadata: { note_prompt: "", note_depth: 4 } })}\n${line()}`, { fileName: "n.jsonl", charDirName: "A" });
    expect(knobsOnly?.notePrompt).toBeNull();
    expect(knobsOnly?.notePlacement).toEqual({ depth: 4, position: null, role: null, interval: null });
    // No knob at all ⇒ null, which is what tells the mapper to use orb's house register.
    expect(parseChatJsonl(`${header()}\n${line()}`, { fileName: "n.jsonl", charDirName: "A" })?.notePlacement).toBeNull();
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

  test("a blank `mes` with ONE real swipe promotes the lone take to the primary — never dropped text", () => {
    const text = `${header()}\n${line({ mes: "", swipes: ["", "the lone take"] })}`;
    const parsed = parseChatJsonl(text, { fileName: "m.jsonl", charDirName: "A" });
    expect(parsed?.messages).toHaveLength(1);
    expect(parsed?.messages[0]?.content).toBe("the lone take");
    expect(parsed?.messages[0]?.variants).toHaveLength(0);
  });

  test("a text-empty row carrying a media attachment is KEPT — the attachment is the message (any era's spelling)", () => {
    const modern = `${header()}\n${line({ mes: "", extra: { media: [{ type: "image", url: "user/images/a.png" }] } })}`;
    const legacy = `${header()}\n${line({ mes: "", extra: { image: "user/images/b.png" } })}`;
    for (const text of [modern, legacy]) {
      const parsed = parseChatJsonl(text, { fileName: "m.jsonl", charDirName: "A" });
      expect(parsed?.messages).toHaveLength(1);
      expect(parsed?.messages[0]?.content).toBe("");
      expect(parsed?.messages[0]?.metadata).not.toBeNull();
    }
  });

  test("a blank `mes` with a real swipe pool promotes the ACTIVE surviving swipe — never an empty canon row", () => {
    const text = `${header()}\n${line({ mes: "", swipes: ["take one", "take two"], swipe_id: 1 })}`;
    const parsed = parseChatJsonl(text, { fileName: "m.jsonl", charDirName: "A" });
    expect(parsed?.messages).toHaveLength(1);
    expect(parsed?.messages[0]?.content).toBe("take two");
    expect(parsed?.messages[0]?.variants).toHaveLength(2);
    expect(parsed?.messages[0]?.activeVariantIdx).toBe(1);
  });
});

// ── build ────────────────────────────────────────────────────────────────────────────────────────────────

const BUILD_DATE = Date.UTC(2025, 7, 27, 18, 36); // August 27, 2025 6:36pm UTC (minute-aligned)

function pmsg(over: Partial<ParsedChatMessage> = {}): ParsedChatMessage {
  return {
    role: "assistant",
    kind: "standard",
    speakerName: "Aria",
    content: "hello",
    sendDate: BUILD_DATE,
    model: "m1",
    provider: "p1",
    tokensIn: null,
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
        tokensIn: null,
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
    userName: "Alex",
    createDate: BUILD_DATE,
    isBranch: false,
    parentRef: null,
    notePrompt: null,
    notePlacement: null,
    variables: null,
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
    expect(h["user_name"]).toBe("Alex");
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
                tokensIn: null,
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
                tokensIn: null,
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

// D129: a row's PURPOSE is a declared fact, so it has to survive the interchange — otherwise an export/import
// round trip silently re-classifies a narrator row as an ordinary card turn (which is what the pack the seeder
// ships used to rely on a NAME match to avoid).
describe("message KIND rides the interchange as ST's own `extra.type`", () => {
  test("a narrator row emits `extra.type: narrator`; a standard row's line is byte-identical to before the axis", () => {
    const narratorLine = JSON.parse(buildChatJsonl(pchat([pmsg({ kind: "narrator" })])).split("\n")[1] ?? "") as { extra: Record<string, unknown> };
    expect(narratorLine.extra["type"]).toBe("narrator");
    const standardLine = JSON.parse(buildChatJsonl(pchat([pmsg()])).split("\n")[1] ?? "") as { extra: Record<string, unknown> };
    expect(standardLine.extra["type"]).toBeUndefined();
  });

  test("round-trips: build → parse → build carries the declared kind intact", () => {
    const source = pchat([pmsg({ kind: "narrator" })]);
    const reparsed = parseChatJsonl(buildChatJsonl(source), { fileName: "x.jsonl", charDirName: "Aria" });
    expect(reparsed?.messages[0]?.kind).toBe("narrator");
    expect(buildChatJsonl(reparsed as ParsedChat)).toBe(buildChatJsonl(source));
  });

  test("a plain ST transcript declares nothing and parses as `standard` — the explicit default", () => {
    const rawLine = JSON.stringify({ is_user: false, mes: "hi", extra: { model: "m1" } });
    const parsed = parseChatJsonl(`${header()}\n${rawLine}`, { fileName: "x.jsonl", charDirName: "Aria" });
    expect(parsed?.messages[0]?.kind).toBe("standard");
  });

  test("the marker on a NON-assistant line degrades to the default (the db CHECKs narrator ⇒ assistant)", () => {
    // A hand-edited or foreign export could carry it anywhere; landing an illegal pair would abort the whole
    // import at the write, so the parse floors it and keeps the row.
    const rawLine = JSON.stringify({ is_user: true, mes: "hi", extra: { type: "narrator" } });
    const parsed = parseChatJsonl(`${header()}\n${rawLine}`, { fileName: "x.jsonl", charDirName: "Aria" });
    expect(parsed?.messages[0]?.role).toBe("user");
    expect(parsed?.messages[0]?.kind).toBe("standard");
  });
});

describe("buildChatTxt", () => {
  test("Author-labeled blocks per the PER-MESSAGE speaker; system stays 'System'", () => {
    const out = buildChatTxt(
      pchat([
        pmsg({ role: "user", content: "hi there", speakerName: "Alex" }),
        pmsg({ role: "assistant", content: "greetings", speakerName: "Aria" }),
        pmsg({ role: "system", content: "scene shift", speakerName: "ignored" }),
      ]),
    );
    expect(out).toBe("Alex: hi there\n\nAria: greetings\n\nSystem: scene shift\n");
  });

  test("group fidelity: each turn serializes under ITS OWN speaker (JSONL name + TXT author)", () => {
    const rows = [
      pmsg({ role: "user", content: "hello all", speakerName: "Alex" }),
      pmsg({ role: "assistant", content: "Bran here", speakerName: "Bran" }),
      pmsg({ role: "assistant", content: "Cara here", speakerName: "Cara" }),
    ];
    const jsonl = buildChatJsonl(pchat(rows)).split("\n");
    expect((JSON.parse(jsonl[1] ?? "") as Record<string, unknown>)["name"]).toBe("Alex");
    expect((JSON.parse(jsonl[2] ?? "") as Record<string, unknown>)["name"]).toBe("Bran");
    expect((JSON.parse(jsonl[3] ?? "") as Record<string, unknown>)["name"]).toBe("Cara");
    expect(buildChatTxt(pchat(rows))).toBe("Alex: hello all\n\nBran: Bran here\n\nCara: Cara here\n");
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
          speakerName: "Alex",
          activeVariantIdx: 1,
          variants: [
            {
              idx: 0,
              content: "take one",
              model: "m1",
              provider: "p1",
              tokensIn: null,
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
              tokensIn: null,
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

  test("the note PLACEMENT knobs + the variable store round-trip; a chat carrying neither is byte-identical", () => {
    const bare = buildChatJsonl(pchat([pmsg({ content: "hi" })]));
    const source = pchat([pmsg({ content: "hi" })], {
      notePrompt: "keep it noir",
      notePlacement: { depth: 2, position: 0, role: 1, interval: 3 },
      variables: { questGiver: "Marla" },
    });
    const jsonl1 = buildChatJsonl(source);
    const reparsed = parseChatJsonl(jsonl1, { fileName: "chat.jsonl", charDirName: "Aria" });
    if (reparsed === null) {
      throw new Error("reparse failed");
    }
    expect(reparsed.notePlacement).toEqual({ depth: 2, position: 0, role: 1, interval: 3 });
    expect(reparsed.variables).toEqual({ questGiver: "Marla" });
    expect(buildChatJsonl(reparsed)).toBe(jsonl1);
    // The absent arm emits NO new key, so every orb-authored fixture (the demo seeder, this drift guard)
    // stays exactly the bytes it was before the two fields existed.
    const bareHeader = JSON.parse(bare.split("\n")[0] ?? "") as Record<string, Record<string, unknown>>;
    expect(Object.keys(bareHeader["chat_metadata"] ?? {})).toEqual([]);
  });
});
