import type { ContentSpan } from "@orb/kit/content";
import {
  cardWireStub,
  contentSpanRaw,
  createHiddenSpanStreamScrubber,
  DIRECTIVE_FENCE_NAMES,
  HIDDEN_TAGS,
  projectBodyForSummary,
  scanHiddenSpans,
  stripHiddenSpans,
  tokenizeContent,
} from "@orb/kit/content";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { LIE } from "./_support.ts";

describe("tokenizeContent", () => {
  test("plain text → a single text span", () => {
    expect(tokenizeContent("hello world")).toEqual<ContentSpan[]>([{ kind: "text", text: "hello world" }]);
  });

  test("empty body → one empty text span (the byte-identical path)", () => {
    expect(tokenizeContent("")).toEqual<ContentSpan[]>([{ kind: "text", text: "" }]);
  });

  test("an embedded asset ref → text / image / text spans", () => {
    expect(tokenizeContent("before ![a cat](asset:ast_123) after")).toEqual<ContentSpan[]>([
      { kind: "text", text: "before " },
      { kind: "image", ref: { kind: "asset", assetId: castId<AssetId>("ast_123") }, alt: "a cat" },
      { kind: "text", text: " after" },
    ]);
  });

  test("an external URL → an external image ref", () => {
    expect(tokenizeContent("![](https://x.test/i.png)")).toEqual<ContentSpan[]>([
      { kind: "image", ref: { kind: "external", url: "https://x.test/i.png" }, alt: "" },
    ]);
  });

  test("adjacent images yield adjacent image spans (no empty text between)", () => {
    expect(tokenizeContent("![](asset:a)![](asset:b)")).toEqual<ContentSpan[]>([
      { kind: "image", ref: { kind: "asset", assetId: castId<AssetId>("a") }, alt: "" },
      { kind: "image", ref: { kind: "asset", assetId: castId<AssetId>("b") }, alt: "" },
    ]);
  });

  test("a malformed `![` is left as literal text", () => {
    expect(tokenizeContent("text ![broken(asset:a) end")).toEqual<ContentSpan[]>([{ kind: "text", text: "text ![broken(asset:a) end" }]);
  });

  test("a markdown title form falls through to text (strict matcher)", () => {
    expect(tokenizeContent('![a](asset:x "title")')).toEqual<ContentSpan[]>([{ kind: "text", text: '![a](asset:x "title")' }]);
  });
});

// ── The parity-plus §3.2 grammar family (hidden tags · directive fences · the §3.2.1 robustness walker) ──

describe("hidden-class tags (§3.2a — registry-driven)", () => {
  test("a registered `<lie …/>` tag → a hidden span with parsed attrs (+ surrounding text preserved)", () => {
    expect(tokenizeContent(`He nods. ${LIE} "Nothing," he says.`)).toEqual<ContentSpan[]>([
      { kind: "text", text: "He nods. " },
      {
        kind: "hidden",
        tag: "lie",
        attrs: { character: "Zandik", type: "location", truth: "He is in the crypt", reason: "protecting the heist" },
        raw: LIE,
      },
      { kind: "text", text: ' "Nothing," he says.' },
    ]);
  });

  test("registry OPENNESS: every HIDDEN_TAGS registrant is recognized by the ONE generic path (a new row registers, never builds)", () => {
    for (const def of HIDDEN_TAGS) {
      const raw = `<${def.tag} a="1"/>`;
      expect(tokenizeContent(raw)).toEqual<ContentSpan[]>([{ kind: "hidden", tag: def.tag, attrs: { a: "1" }, raw }]);
    }
  });

  test("§3.2.1 #1: JSON-in-attributes and a quoted `/>` never false-close (quote/escape-aware walker)", () => {
    const raw = '<lie truth="{\\"dc\\": 15, \\"note\\": \\"a/>b\\"}" reason="x"/>';
    const spans = tokenizeContent(raw);
    expect(spans).toHaveLength(1);
    expect(spans[0]).toMatchObject({ kind: "hidden", tag: "lie", attrs: { truth: '{"dc": 15, "note": "a/>b"}', reason: "x" } });
  });

  test("§3.2.1 #2: an unclosed / stream-truncated tag degrades to literal text in place", () => {
    for (const truncated of ['<lie character="Zandik" truth="the cr', "<lie character=", '<lie truth="x">']) {
      expect(tokenizeContent(truncated)).toEqual<ContentSpan[]>([{ kind: "text", text: truncated }]);
    }
  });

  test("allowlist-strip class: an UNREGISTERED attr-carrying self-closing tag → unknown-directive; bare `<br/>` / non-self-closing HTML stay literal", () => {
    const gm = '<gmnote note="the ambush is ready"/>';
    expect(tokenizeContent(`a ${gm} b`)).toEqual<ContentSpan[]>([
      { kind: "text", text: "a " },
      { kind: "unknown-directive", raw: gm },
      { kind: "text", text: " b" },
    ]);
    expect(tokenizeContent("line one<br/>line two")).toEqual<ContentSpan[]>([{ kind: "text", text: "line one<br/>line two" }]);
    expect(tokenizeContent('<div class="x">prose</div>')).toEqual<ContentSpan[]>([{ kind: "text", text: '<div class="x">prose</div>' }]);
  });

  test("a newline BETWEEN attrs bails to literal; a newline INSIDE a quoted value is legal", () => {
    expect(tokenizeContent('<lie character="a"\ntruth="b"/>')).toEqual<ContentSpan[]>([{ kind: "text", text: '<lie character="a"\ntruth="b"/>' }]);
    const multiline = '<lie truth="line one\nline two"/>';
    expect(tokenizeContent(multiline)).toEqual<ContentSpan[]>([{ kind: "hidden", tag: "lie", attrs: { truth: "line one\nline two" }, raw: multiline }]);
  });

  test("§3.2.1 #3: a `<lie …/>` inside a markdown code fence is the author SHOWING code → literal", () => {
    const body = `\`\`\`\n${LIE}\n\`\`\``;
    expect(tokenizeContent(body)).toEqual<ContentSpan[]>([{ kind: "text", text: body }]);
  });

  // #1352 — the tokenizer's general 4096-byte walk bound used to decide CONFIDENTIALITY by accident: a
  // registered hidden tag longer than it was not recognized as a tag anywhere, so its `truth` attr sat in
  // committed canon as literal text and `hadHidden` said there had been nothing to hide.
  test("SECURITY: a hidden tag whose secret runs PAST the general scan bound is still a hidden span (4096- and 4097-char `truth`)", () => {
    for (const secretLen of [4096, 4097]) {
      const secret = `S${"x".repeat(secretLen - 2)}E`;
      const raw = `<lie character="A" truth="${secret}" reason="r"/>`;
      expect(tokenizeContent(`before ${raw} after`)).toEqual<ContentSpan[]>([
        { kind: "text", text: "before " },
        { kind: "hidden", tag: "lie", attrs: { character: "A", truth: secret, reason: "r" }, raw },
        { kind: "text", text: " after" },
      ]);
      const stripped = stripHiddenSpans(`before ${raw} after`);
      expect(stripped.content).toBe("before  after");
      expect(stripped.hadHidden).toBe(true);
      expect(scanHiddenSpans(`before ${raw} after`)).toHaveLength(1);
    }
  });

  test("SECURITY: a hidden open too long to parse even at the hidden bound CONCEALS to the end of the run (fail-closed, never literal)", () => {
    // 20 KiB with no close: past `MAX_HIDDEN_TAG_SCAN` (16 KiB), so there is no parse — and an unparsed
    // hidden open must not degrade to literal text, which is what handed the member the attr verbatim.
    const body = `before <lie truth="${"S".repeat(20 * 1024)} and the tail`;
    const spans = tokenizeContent(body);
    expect(spans).toEqual<ContentSpan[]>([
      { kind: "text", text: "before " },
      { kind: "hidden", tag: "lie", attrs: {}, raw: body.slice("before ".length) },
    ]);
    const stripped = stripHiddenSpans(body);
    expect(stripped.content).toBe("before ");
    expect(stripped.hadHidden).toBe(true);
    expect(stripped.content).not.toContain("SSS");
    expect(scanHiddenSpans(body)).toHaveLength(1);
  });

  // #1524 — a hidden tag whose ATTR VALUE opens a markdown fence. No size involved: the fence-blind stream
  // walker saw one complete tag, while the line-anchored strip let the ``` toggle code state and cut the tag
  // into unscannable pieces, so it was never classified and the whole `truth` reached the member verbatim on
  // BOTH planes with `hadHidden=false`. The tag begins OUTSIDE any fence — it opens one from inside itself —
  // so this is not the ratified §3.2.1 #3 hole, whose control is the next test.
  test("SECURITY: a ``` INSIDE a hidden tag's attr value does not split the tag out of the strip's reach", () => {
    const fence = "`".repeat(3);
    const raw = `<lie truth="SECRET\n${fence}\nmore"/>`;
    const body = `before ${raw} after`;
    const stripped = stripHiddenSpans(body);
    expect(stripped.content).toBe("before  after");
    expect(stripped.hadHidden).toBe(true);
    expect(stripped.content).not.toContain("SECRET");
    // The host reveal sees the WHOLE tag, fence bytes and all — the two twins agree on one span.
    expect(scanHiddenSpans(body)).toEqual([{ kind: "hidden", tag: "lie", attrs: { truth: `SECRET\n${fence}\nmore` }, raw }]);
    // …and the same for a second fence-opening attr later in the body (the runs are a set, not a first match).
    const two = `a ${raw} b ${raw} c`;
    expect(stripHiddenSpans(two).content).toBe("a  b  c");
    expect(scanHiddenSpans(two)).toHaveLength(2);
  });

  // FENCE (not a red-first proof): both assertions below hold byte-identically on the pre-#1524 source. They
  // are non-regression guards for the ratified hole, and they are labelled so no reader mistakes them for
  // evidence that the fix works — the pin that IS red-first is the one after them.
  test("FENCE — the RATIFIED §3.2.1 #3 hole is untouched: a tag the AUTHOR fenced stays literal", () => {
    const fence = "`".repeat(3);
    // The author is SHOWING the tag — the reader sees it, so it is a visible model bug, never a silent leak.
    const shown = `${fence}\n<lie truth="SHOWN"/>\n${fence}`;
    expect(stripHiddenSpans(shown)).toEqual({ content: shown, hadHidden: false });
    expect(scanHiddenSpans(shown)).toHaveLength(0);
    // A fenced tag whose attr swallows the CLOSING fence line, with prose after and NO later tag: nothing
    // leaks and — the half this guards — nothing is over-concealed either.
    const spansClose = `${fence}\n<lie truth="x\n${fence}\ny"/>\ntail`;
    expect(stripHiddenSpans(spansClose)).toEqual({ content: spansClose, hadHidden: false });
    expect(stripHiddenSpans(`${fence}\n<lie truth="SHOWN"/>\nmore`).hadHidden).toBe(false); // fence never closed
  });

  // #1524 SECOND PASS — the leak the first fix INTRODUCED, caught by review. A run computed fence-blind
  // covers an author-fenced tag through the author's own CLOSING ``` line; suppressing that close left
  // `inCode` true to end of body, so every LATER hidden tag was emitted `allowTags:false` and never
  // classified. Only an OPENING toggle may be suppressed.
  test("SECURITY: an author-fenced tag that swallows its own closing fence does not blind the strip to LATER tags", () => {
    const fence = "`".repeat(3);
    const fenced = `<lie truth="x\n${fence}\ny"/>`;
    const body = `${fence}\n${fenced}\ntail\n<lie truth="SECRET"/>\nbye`;
    const stripped = stripHiddenSpans(body);
    expect(stripped.content).not.toContain("SECRET");
    expect(stripped.hadHidden).toBe(true);
    // The author's own fenced tag is still LITERAL — this narrows what leaks, it does not widen what hides.
    expect(stripped.content).toBe(`${fence}\n${fenced}\ntail\n\nbye`);
    // The host reveal sees exactly the ONE real hidden span, not the shown one and not zero.
    expect(scanHiddenSpans(body).map((span) => span.attrs["truth"])).toEqual(["SECRET"]);
    // The stream plane is fence-BLIND by design (the ratified hole is a commit-plane concession), so it drops
    // the shown tag too — more conservative, never less. What it must never do is carry the real secret.
    const scrubber = createHiddenSpanStreamScrubber();
    let observed = "";
    for (const ch of body) {
      observed += scrubber.push(ch);
      expect(observed).not.toContain("SECRET");
    }
    observed += scrubber.flush();
    expect(observed).not.toContain("SECRET");
  });

  test("SECURITY: a suppressed fence OPEN inside an attr value does not blind the strip to later tags either", () => {
    const fence = "`".repeat(3);
    const body = `<lie truth="a\n${fence}\nb"/>\n<lie truth="SECRET"/>\nx`;
    const stripped = stripHiddenSpans(body);
    expect(stripped.content).toBe("\n\nx");
    expect(stripped.hadHidden).toBe(true);
    expect(scanHiddenSpans(body)).toHaveLength(2);
  });

  test("the over-cap arm is HIDDEN-ONLY: an oversized UNREGISTERED tag keeps its literal / unknown-directive verdict", () => {
    const unregistered = `<gmnote note="${"n".repeat(6000)}"/>`;
    expect(tokenizeContent(unregistered)).toEqual<ContentSpan[]>([{ kind: "text", text: unregistered }]);
    const unclosed = `<div class="${"n".repeat(20 * 1024)}`;
    expect(tokenizeContent(unclosed)).toEqual<ContentSpan[]>([{ kind: "text", text: unclosed }]);
  });
});

describe("directive fences (§3.2b — registry-driven)", () => {
  const cardRaw = ':::card title="Zandik\'s letter"\n<div style="color:red">a letter</div>\n:::';

  test("a `:::card` fence → a card span (title, body, raw)", () => {
    expect(tokenizeContent(`before\n${cardRaw}\nafter`)).toEqual<ContentSpan[]>([
      { kind: "text", text: "before\n" },
      { kind: "card", title: "Zandik's letter", body: '<div style="color:red">a letter</div>', origin: "fence", raw: cardRaw },
      { kind: "text", text: "\nafter" },
    ]);
  });

  test("a title-less card → title null; UNKNOWN fence attrs are ignored, never fatal (version tolerance, #V4)", () => {
    const raw = ':::card theme="dark" size="tall"\n<p>x</p>\n:::';
    expect(tokenizeContent(raw)).toEqual<ContentSpan[]>([{ kind: "card", title: null, body: "<p>x</p>", origin: "fence", raw }]);
  });

  test("§3.2.1 #2: an unclosed fence (stream truncation / abort) stays literal text forever", () => {
    const truncated = ':::card title="half"\n<div>partial';
    expect(tokenizeContent(truncated)).toEqual<ContentSpan[]>([{ kind: "text", text: truncated }]);
  });

  test("§3.2.1 #1: a nested `:::name` open inside the body does NOT false-close the outer fence (balance-aware)", () => {
    const raw = ":::card\nouter\n:::inner\nnested\n:::\nstill outer\n:::";
    expect(tokenizeContent(raw)).toEqual<ContentSpan[]>([
      { kind: "card", title: null, body: "outer\n:::inner\nnested\n:::\nstill outer", origin: "fence", raw },
    ]);
  });

  test("a `:::choices` fence → options parsed from `N. text` lines", () => {
    const raw = ":::choices\n1. Draw your blade.\n2. Play along.\n3) Slip out quietly.\n:::";
    expect(tokenizeContent(raw)).toEqual<ContentSpan[]>([{ kind: "choices", options: ["Draw your blade.", "Play along.", "Slip out quietly."], raw }]);
  });

  test("a `:::choices` with NO parseable option lines is model noise → unknown-directive (allowlist-strip)", () => {
    const raw = ":::choices\njust prose, no numbers\n:::";
    expect(tokenizeContent(raw)).toEqual<ContentSpan[]>([{ kind: "unknown-directive", raw }]);
  });

  test("an UNREGISTERED command-shaped fence (`:::teleport`) → unknown-directive; a mid-line `:::card` stays literal", () => {
    const raw = ':::teleport to="the crypt"\nnow\n:::';
    expect(tokenizeContent(raw)).toEqual<ContentSpan[]>([{ kind: "unknown-directive", raw }]);
    expect(tokenizeContent("see :::card inline")).toEqual<ContentSpan[]>([{ kind: "text", text: "see :::card inline" }]);
  });

  test("registry OPENNESS: every DIRECTIVE_FENCE_NAMES registrant is recognized by the ONE fence recognizer", () => {
    for (const name of DIRECTIVE_FENCE_NAMES) {
      const spans = tokenizeContent(`:::${name}\n1. body line\n:::`);
      expect(spans).toHaveLength(1);
      expect(spans[0]?.kind === "card" || spans[0]?.kind === "choices").toBe(true);
    }
  });

  // The `committed` EOF-close arm (the RV-2 root cause): a FINAL body's unterminated registered fence
  // closes at EOF, so a truncated or nested-closer card still renders + still stubs on the wire. A live
  // stream never opts in, so mid-stream behavior is byte-identical to before.
  describe("committed: an unterminated fence closes at EOF (degrade PRESERVING value)", () => {
    const truncated = ':::card title="Ashfell Night Market"\n\n<div style="font-family: \'Courier New';

    test("truncated card + committed → a card span whose body is the surviving tail; streaming → unchanged literal", () => {
      expect(tokenizeContent(truncated, { committed: true })).toEqual<ContentSpan[]>([
        { kind: "card", title: "Ashfell Night Market", body: "\n<div style=\"font-family: 'Courier New", origin: "fence", raw: truncated },
      ]);
      expect(tokenizeContent(truncated)).toEqual<ContentSpan[]>([{ kind: "text", text: truncated }]);
    });

    // A nested choices fence can consume the only closer while its outer card remains unclosed. The repair
    // must preserve prose and archive content instead of degrading the whole message to raw fence text.
    test("nested-closer repro + committed → ONE card at EOF; the swallowed choices ride the card body as text", () => {
      const body = ':::card title="The Blade’s Whisper"\n\nA flicker of steel.\n\n:::choices\n1. Demand answers\n2. Walk away\n:::';
      const spans = tokenizeContent(body, { committed: true });
      expect(spans).toHaveLength(1);
      expect(spans[0]).toMatchObject({ kind: "card", title: "The Blade’s Whisper", origin: "fence" });
      // HONEST rendering of the model's mistake: the card owns the tail, so the nested block is card content
      // (flat text inside the sandboxed body), NOT a second interactive choices block outside it.
      expect(spans[0]).toMatchObject({ body: expect.stringContaining(":::choices") });
      // Untouched without the flag: the inner fence parses and the card open line stays literal prose.
      expect(tokenizeContent(body).map((s) => s.kind)).toEqual(["text", "choices"]);
    });

    test("the re-emit invariant survives the EOF close (raw joins back to the exact body)", () => {
      for (const body of [truncated, ':::card title="t"\n<p>x</p>', "prose then\n:::choices\n1. one"]) {
        expect(tokenizeContent(body, { committed: true }).map(contentSpanRaw).join("")).toBe(body);
      }
    });

    test("an UNREGISTERED unterminated fence stays literal even when committed — closing it would HIDE the tail", () => {
      // `unknown-directive` is the allowlist-STRIP class: EOF-closing `:::teleport` would erase the rest of
      // the message from the reading surface. Only registered names get the EOF close.
      const body = ':::teleport to="the crypt"\nthe tail the reader must still see';
      expect(tokenizeContent(body, { committed: true })).toEqual<ContentSpan[]>([{ kind: "text", text: body }]);
    });

    test("WIRE PLANE (D110 §3): an EOF-closed card STUBS exactly like a terminated one — no raw blob on the wire", () => {
      // The security/cost-relevant half: the same body that now renders must ALSO collapse to `[card: …]`
      // in the summary/wire projection, never ride the prompt verbatim.
      expect(projectBodyForSummary(truncated)).toBe(cardWireStub("Ashfell Night Market"));
      expect(projectBodyForSummary(`before\n${truncated}`)).toBe(`before\n${cardWireStub("Ashfell Night Market")}`);
    });
  });

  // The §4h OPEN-LINE reflex arm: hosted Sonnet closes the opener like an HTML tag (`:::card title="…">`),
  // which used to reject the line and HIDE the card as an `unknown-directive` span (114/120 emitted, 87/120
  // rendered). The specimens below are the literal strings mined from the card-teach probe transcripts.
  describe("§4h: the trailing HTML-tag-close reflex on a REGISTERED open line is tolerated", () => {
    test('the §4h specimen `:::card title="The Bench">` renders a card with the EXACT title', () => {
      const raw = ':::card title="The Bench">\n<div>a bench</div>\n:::';
      expect(tokenizeContent(raw)).toEqual<ContentSpan[]>([{ kind: "card", title: "The Bench", body: "<div>a bench</div>", origin: "fence", raw }]);
    });

    test("the tolerated shapes: `>`, a space before it, trailing space after it, and a title-less open", () => {
      for (const openLine of [':::card title="Sign">', ':::card title="Sign" >', ':::card title="Sign">  ', ":::card>"]) {
        const spans = tokenizeContent(`${openLine}\n<p>x</p>\n:::`);
        expect(spans).toHaveLength(1);
        expect(spans[0]?.kind).toBe("card");
      }
    });

    test("the IMITATION CASCADE: a history carrying malformed openers renders EVERY subsequent card (the 8-turn loss)", () => {
      // One slip lands in the assistant history and the model imitates itself for the rest of the session;
      // pre-fix this body rendered ONE card (the well-formed turn) and hid the other three.
      const body = [
        'The sign is bolted to the rail.\n:::card title="Ward 7 District Sign">\n<div>WARD 7</div>\n:::',
        'A receipt, water-stained.\n:::card title="Crumpled Receipt">\n<div>4.20 CR</div>\n:::',
        'The badge is still warm.\n:::card title="Arcology Resident ID">\n<div>ID 0447-C</div>\n:::',
        'The terminal wakes.\n:::card title="Maintenance Terminal — Login"\n<div>LOGIN</div>\n:::',
      ].join("\n\n");
      const cards = tokenizeContent(body).filter((s) => s.kind === "card");
      expect(cards.map((c) => (c.kind === "card" ? c.title : null))).toEqual([
        "Ward 7 District Sign",
        "Crumpled Receipt",
        "Arcology Resident ID",
        "Maintenance Terminal — Login",
      ]);
      expect(tokenizeContent(body).some((s) => s.kind === "unknown-directive")).toBe(false);
    });

    test("`:::choices` shares the ONE recognizer, so the same reflex is tolerated there (registry-driven, not a second arm)", () => {
      const raw = ":::choices>\n1. Draw your blade.\n2. Walk away.\n:::";
      expect(tokenizeContent(raw)).toEqual<ContentSpan[]>([{ kind: "choices", options: ["Draw your blade.", "Walk away."], raw }]);
    });

    test("ATTR PARSING NEVER LOOSENS: a `>` INSIDE the quoted title stays exact bytes, with or without the reflex", () => {
      const inQuotes = tokenizeContent(':::card title="A > B"\n<p>x</p>\n:::');
      expect(inQuotes[0]).toMatchObject({ kind: "card", title: "A > B" });
      const both = tokenizeContent(':::card title="A > B">\n<p>x</p>\n:::');
      expect(both[0]).toMatchObject({ kind: "card", title: "A > B" });
    });

    test("the REJECTING arm survives: genuinely unparseable opens still degrade loudly (literal text)", () => {
      for (const openLine of [
        ":::card title='Sign'", // single quotes — UNMEASURED (0/203), never tolerated
        ' :::card title="Sign"', // a leading-space open — UNMEASURED (0/203); the line anchor stays strict
        ":::card title=broken", // an unquoted value
        ':::card title="Sign"> extra="attr"', // junk that is not ONLY the reflex
        ':::card title="Sign"/>', // the `/>` sibling reflex — UNMEASURED (0/203), deliberately excluded
      ]) {
        const body = `${openLine}\n<p>x</p>\n:::`;
        expect(tokenizeContent(body).every((s) => s.kind === "text")).toBe(true);
      }
    });

    test("the leniency is ALLOWLISTED: an UNREGISTERED `:::teleport …>` stays literal (never a hidden span)", () => {
      const body = ':::teleport to="the crypt">\nthe tail the reader must still see\n:::';
      expect(tokenizeContent(body).every((s) => s.kind === "text")).toBe(true);
    });

    test("the re-emit + wire invariants hold on a tolerated open (raw byte-identical; the card still STUBS)", () => {
      const body = 'before\n:::card title="Terminal">\n<div>blob</div>\n:::\nafter';
      expect(tokenizeContent(body).map(contentSpanRaw).join("")).toBe(body);
      expect(projectBodyForSummary(body)).toBe(`before\n${cardWireStub("Terminal")}\nafter`);
    });

    test("`committed` still closes a tolerated-open fence at EOF (the two leniency arms compose)", () => {
      const truncated = ':::card title="Terminal">\n<div>half';
      expect(tokenizeContent(truncated, { committed: true })).toEqual<ContentSpan[]>([
        { kind: "card", title: "Terminal", body: "<div>half", origin: "fence", raw: truncated },
      ]);
      expect(tokenizeContent(truncated)).toEqual<ContentSpan[]>([{ kind: "text", text: truncated }]);
    });
  });

  test("§3.2.1 #3: a fence inside a markdown code fence stays literal", () => {
    const body = "```\n:::card\n<div>x</div>\n:::\n```";
    expect(tokenizeContent(body)).toEqual<ContentSpan[]>([{ kind: "text", text: body }]);
  });

  test("squash parity (§3.7): spans survive the shape-phase `\\n\\n` body join", () => {
    const joined = `body A ${LIE}\n\n${":::card\n<p>x</p>\n:::"}\nbody B`;
    const kinds = tokenizeContent(joined).map((s) => s.kind);
    expect(kinds).toEqual(["text", "hidden", "text", "card", "text"]);
  });
});

describe("the §4.8 lenient-HTML detector (opt-in; OFF by default)", () => {
  const nakedHtml = '<div class="page">\n<h2>The Exploit</h2>\n<p>payload</p>\n</div>';

  test("OFF by default: naked HTML stays literal text (today's behavior, byte-identical)", () => {
    expect(tokenizeContent(nakedHtml)).toEqual<ContentSpan[]>([{ kind: "text", text: nakedHtml }]);
  });

  test("ON: a ≥3-line element-majority block → an implicit lenient card with a DERIVED title", () => {
    expect(tokenizeContent(nakedHtml, { lenientHtml: true })).toEqual<ContentSpan[]>([
      { kind: "card", title: "The Exploit", body: nakedHtml, origin: "lenient", raw: nakedHtml },
    ]);
  });

  test("ON: the negative corpus never wraps — short blocks, inline `<b>`, prose-majority, generic ``` fences", () => {
    for (const body of [
      "<div>\n</div>", // under the 3-line floor
      "a single <b>bold</b> word in prose", // inline markup, no block open
      "<p>one tag line</p>\nplain prose line two\nplain prose line three", // prose-majority
      "```\n<div>\n<p>x</p>\n<p>y</p>\n</div>\n```", // generic code fence = code display, period
      "```js\nconst x = 1;\nconst y = 2;\nconst z = 3;\n```", // non-markup language tag
    ]) {
      expect(tokenizeContent(body, { lenientHtml: true }).every((s) => s.kind === "text")).toBe(true);
    }
  });

  test("ON: a ```html fence with element-majority body → an implicit lenient card; with prose body → stays a code block", () => {
    const fence = "```html\n<section>\n<h1>Terminal</h1>\n</section>\n```";
    expect(tokenizeContent(fence, { lenientHtml: true })).toEqual<ContentSpan[]>([
      { kind: "card", title: "Terminal", body: "<section>\n<h1>Terminal</h1>\n</section>", origin: "lenient", raw: fence },
    ]);
    const prose = "```html\njust prose in a mislabelled fence\n```";
    expect(tokenizeContent(prose, { lenientHtml: true })).toEqual<ContentSpan[]>([{ kind: "text", text: prose }]);
  });
});

test("dice stamps become display spans while code, escaped and malformed stamps stay literal", () => {
  const body = "Before [dice: Strength d20+2 → 16] after [dice: d6 → -1].";
  const spans = tokenizeContent(body);
  expect(spans).toContainEqual({ kind: "dice", label: "Strength d20+2", total: 16, raw: "[dice: Strength d20+2 → 16]" });
  expect(spans.map(contentSpanRaw).join("")).toBe(body);
  for (const literal of [
    "```\n[dice: d20 → 16]\n```",
    "`[dice: d20 → 16]`",
    "\\[dice: d20 → 16]",
    "[dice: d20 → many]",
    "[dice: d20 → 99999999999999999999]",
  ]) {
    expect(tokenizeContent(literal)).toEqual([{ kind: "text", text: literal }]);
  }
});
