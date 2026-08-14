import type { ContentSpan } from "@orb/kit/content";
import {
  cardWireStub,
  contentSpanRaw,
  createHiddenSpanStreamScrubber,
  DIRECTIVE_FENCE_NAMES,
  HIDDEN_TAGS,
  PREVIEW_MAX_CHARS,
  projectBodyForPreview,
  projectBodyForSummary,
  scanGhostContent,
  scanHiddenSpans,
  stripHiddenSpans,
  tokenizeContent,
} from "@orb/kit/content";
import type { AssetId } from "@orb/kit/ids";
import { castId } from "@orb/kit/ids";
import { describe } from "vitest";
import { expect, test } from "../../support/fixtures.ts";

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

const LIE = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="protecting the heist"/>';

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

    // The LIVE repro (chat_01kym4aq7…): the model opened a card, wrote prose, then opened `:::choices`
    // INSIDE it and spent the single closer on the inner fence — the outer card never closed, so the whole
    // message degraded to raw fence text in the transcript with nothing in the archive.
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

describe("strip / re-emit primitives", () => {
  test("contentSpanRaw round-trips: join(raw) over any body's spans reproduces the body byte-identically", () => {
    for (const body of [
      `prose ${LIE} more ![a](asset:ast_1) tail`,
      ':::card title="t"\n<p>x</p>\n:::\nafter',
      "plain",
      "",
      '```\n<lie a="1"/>\n```',
      '<gmnote note="n"/> and :::choices\n1. one\n:::',
    ]) {
      expect(tokenizeContent(body).map(contentSpanRaw).join("")).toBe(body);
    }
  });

  test("stripHiddenSpans removes ONLY hidden spans, byte-preserving everything else; identity when nothing is hidden", () => {
    const cardBlock = ":::card\n<p>x</p>\n:::";
    const body = `open ${LIE} mid ![a](asset:ast_1) ${cardBlock} end`;
    const stripped = stripHiddenSpans(body);
    expect(stripped.hadHidden).toBe(true);
    expect(stripped.content).toBe(`open  mid ![a](asset:ast_1) ${cardBlock} end`);
    expect(stripped.content).not.toContain("crypt");
    const clean = stripHiddenSpans("no secrets here");
    expect(clean.hadHidden).toBe(false);
    expect(clean.content).toBe("no secrets here");
  });

  test("a malformed (degraded-to-text) hidden tag is NOT stripped — visible model bug, never a silent leak", () => {
    const truncated = '<lie truth="half';
    expect(stripHiddenSpans(truncated)).toEqual({ content: truncated, hadHidden: false });
  });

  test("§4h did NOT move the §3.6 trust boundary: stripHiddenSpans is byte-identical around a tolerated open", () => {
    // The member strip runs STRICT (never `committed`) and touches only `hidden` spans. A card whose opener
    // carries the reflex is now a card span instead of literal text — its bytes must still re-emit verbatim,
    // and a lie beside it must still vanish. Fail-closed posture unchanged.
    const cardBlock = ':::card title="Terminal">\n<p>x</p>\n:::';
    const body = `open ${LIE} mid ${cardBlock} end`;
    expect(stripHiddenSpans(body)).toEqual({ content: `open  mid ${cardBlock} end`, hadHidden: true });
    // Identity when nothing is hidden — the tolerated open never rewrites a byte of the body.
    expect(stripHiddenSpans(cardBlock)).toEqual({ content: cardBlock, hadHidden: false });
    // REVERSED 2026-08-14 (the card-fence-gate lane's finding). This pin previously asserted the OPPOSITE —
    // that a `<lie …/>` inside a card body rides the card's `raw` through the strip untouched — and called it
    // a "NAMED CONSEQUENCE (not a new class)" on the reasoning that a card body is HTML and the teach never
    // puts a lie there. That classification is SUPERSEDED: model output is not the teach, the strip is the
    // §3.6 trust boundary, and an in-card lie is the WORST leak shape (a card body renders as HTML, so the
    // truth is invisible on the member's screen and present in their payload). Both fence forms — the §4h
    // tolerated open and the well-formed one — now strip identically, which remains the arm's whole point.
    const inner = (open: string): string => `${open}\n${LIE}\n:::`;
    for (const open of [':::card title="T">', ':::card title="T"']) {
      const stripped = stripHiddenSpans(inner(open));
      expect(stripped).toEqual({ content: `${open}\n\n:::`, hadHidden: true });
      expect(stripped.content).not.toContain("crypt");
    }
  });

  test("THE STRIP IS TOTAL OVER FENCE BODIES (§3.6): no hidden span survives inside card / choices / unregistered fences", () => {
    // The 2026-08-14 hole: the tokenizer is strict, so a CLOSED fence swallows its whole body into one span's
    // `raw` and the strict-fence strip re-emitted it VERBATIM — a member's committed view carried the GM's
    // truth while the mid-stream scrubber (fence-blind by construction) had already shown them a clean live
    // view. Clean while streaming, leaking on reload. The strip now runs FENCE-BLIND: it recognizes a hidden
    // tag everywhere the tokenizer would recognize one, so fence context cannot hide a secret.
    for (const body of [
      `:::card title="Ledger"\n<p>All accounted for.</p>\n${LIE}\n:::`,
      `:::choices\n1. Go north\n${LIE}\n2. Go south\n:::`,
      `:::teleport dest="x"\n${LIE}\n:::`, // an UNREGISTERED command-shaped fence
      `:::card title="Outer"\n:::card title="Inner"\n${LIE}\n:::\n:::`, // nested fences
    ]) {
      const stripped = stripHiddenSpans(body);
      expect(stripped.hadHidden).toBe(true);
      expect(stripped.content).not.toContain("crypt");
      expect(stripped.content).not.toContain("<lie");
      // Byte-preserving otherwise: removing the tag leaves the fence lines and prose exactly as stored.
      expect(stripped.content).toBe(body.replace(LIE, ""));
    }
  });

  test("the ``` code-fence exclusion is the ONE named hole in the strip's totality (§3.2.1 #3 + the D51 visible-tag posture)", () => {
    // A hidden tag inside a markdown code fence is the author SHOWING markup: the member READS it on screen,
    // so it is a visible model bug, never a silent truth-leak — the already-ruled class. Stripping here would
    // silently rewrite an authored code sample for members only. Pinned so the exclusion stays DELIBERATE.
    const fenced = `\`\`\`\n${LIE}\n\`\`\``;
    expect(stripHiddenSpans(fenced)).toEqual({ content: fenced, hadHidden: false });
    // …and the exclusion does not extend to a code fence nested in a CARD (the card wrapper is not a licence).
    expect(stripHiddenSpans(`:::card title="T"\n<p>x</p>\n${LIE}\n:::`).content).not.toContain("crypt");
  });

  test("scanHiddenSpans is the strip's twin: it finds EXACTLY the spans stripHiddenSpans removes (the reveal↔strip invariant)", () => {
    // `domain/rpg/substrate/reveal` shows the host what the member strip removed. One fence-blind pass feeds
    // both, so the two can never drift: whatever the strip drops, the reveal lists — in-card lies included.
    for (const body of [
      `prose ${LIE} tail`,
      `:::card title="Ledger"\n${LIE}\n:::`,
      `:::choices\n1. one\n${LIE}\n:::`,
      `\`\`\`\n${LIE}\n\`\`\``, // the named exclusion: neither strips NOR reveals
      "no hidden content at all",
    ]) {
      const found = scanHiddenSpans(body);
      expect(found.length > 0).toBe(stripHiddenSpans(body).hadHidden);
      for (const span of found) {
        expect(stripHiddenSpans(body).content).not.toContain(span.raw);
      }
    }
    expect(scanHiddenSpans(`:::card title="L"\n${LIE}\n:::`)[0]?.attrs["truth"]).toBe("He is in the crypt");
  });

  test("the fence-blind strip pass round-trips: dropping nothing reproduces the body byte-identically", () => {
    // The strip's re-emit invariant under the fence-blind pass — a body with no hidden span is returned by
    // IDENTITY, so this pins the layer beneath that fast path (every non-hidden span re-emits its exact bytes).
    for (const body of [
      ':::card title="t"\n<p>x</p>\n:::\nafter',
      '<gmnote note="n"/> and :::choices\n1. one\n:::',
      "plain ![a](asset:ast_1) tail",
      '```\n<lie a="1"/>\n```',
      "",
    ]) {
      expect(stripHiddenSpans(body)).toEqual({ content: body, hadHidden: false });
    }
  });

  test("cardWireStub is deterministic + honest: `[card: title]` / `[card]`", () => {
    expect(cardWireStub("Zandik's letter")).toBe("[card: Zandik's letter]");
    expect(cardWireStub(null)).toBe("[card]");
    expect(cardWireStub("   ")).toBe("[card]");
  });
});

test("projectBodyForSummary: cards stub, hidden spans STRIP (member-peekable summary plane), everything else byte-preserves", () => {
  const body = `open ${LIE} then\n:::card title="Terminal"\n<div>blob</div>\n:::\nand ![a](asset:ast_1) end`;
  const projected = projectBodyForSummary(body);
  expect(projected).toBe("open  then\n[card: Terminal]\nand ![a](asset:ast_1) end");
  expect(projected).not.toContain("crypt");
  expect(projectBodyForSummary("plain")).toBe("plain");
});

test("projectBodyForSummary: a lie inside a FENCE body never reaches the member-peekable digest (the 2026-08-14 sibling hole)", () => {
  // The summary plane's own contract says a lie's truth must not be folded into a durable, member-peekable
  // artifact. A `card` was already safe (it collapses to the stub, discarding its raw) — but `choices` and
  // `unknown-directive` spans re-emit their raw VERBATIM, so a lie inside either rode straight into the
  // digest. Same defect class as the member strip's fence hole, same fix: re-strip a fence span's raw.
  for (const body of [`:::choices\n1. Go north\n${LIE}\n2. Go south\n:::`, `:::teleport dest="x"\n${LIE}\n:::`]) {
    const projected = projectBodyForSummary(body);
    expect(projected).not.toContain("crypt");
    expect(projected).not.toContain("<lie");
    expect(projected).toBe(body.replace(LIE, ""));
  }
  // The card arm is unchanged (stub, not raw) — an in-card lie never had a path here, and still does not.
  expect(projectBodyForSummary(`:::card title="Ledger"\n${LIE}\n:::`)).toBe("[card: Ledger]");
});

describe("createHiddenSpanStreamScrubber — the §3.6 MID-STREAM member scrubber", () => {
  const hidden = '<lie character="Zandik" type="location" truth="He is in the crypt" reason="the heist"/>';

  /** Drive a full body through the scrubber one CHAR at a time (the adversarial worst case: every prefix
   *  boundary is observed) and return the member's full observed stream. */
  function scrubCharByChar(body: string): { readonly observed: string; readonly prefixes: readonly string[] } {
    const scrubber = createHiddenSpanStreamScrubber();
    let observed = "";
    const prefixes: string[] = [];
    for (const ch of body) {
      observed += scrubber.push(ch);
      prefixes.push(observed);
    }
    observed += scrubber.flush();
    prefixes.push(observed);
    return { observed, prefixes };
  }

  test("a member's observed DELTA stream never contains hidden bytes at ANY prefix point (char-by-char)", () => {
    const { observed, prefixes } = scrubCharByChar(`He nods. ${hidden} "Nothing," he says.`);
    // The final observed stream equals the at-commit strip — one verdict for the whole body.
    expect(observed).toBe(stripHiddenSpans(`He nods. ${hidden} "Nothing," he says.`).content);
    expect(observed).toBe('He nods.  "Nothing," he says.');
    // EVERY intermediate prefix is leak-free — not just the final frame.
    for (const p of prefixes) {
      expect(p).not.toContain("crypt");
      expect(p).not.toContain("<lie");
      expect(p).not.toContain("truth=");
    }
  });

  test("chunk-boundary invariance: an arbitrary split of the same body yields the SAME leak-free stream", () => {
    const body = `A ${hidden} B`;
    // A pathological split straddling the tag open, name, and close.
    for (const size of [1, 2, 3, 5, 7, 13]) {
      const scrubber = createHiddenSpanStreamScrubber();
      let observed = "";
      for (let i = 0; i < body.length; i += size) {
        observed += scrubber.push(body.slice(i, i + size));
        expect(observed).not.toContain("crypt");
      }
      observed += scrubber.flush();
      expect(observed).toBe("A  B");
    }
  });

  test("the HOST stream is unchanged — a host never constructs a scrubber (verbatim); assert the plain-text passthrough is byte-identical", () => {
    // The scrubber is member-only; a plain body with no hidden spans round-trips byte-identically.
    const { observed } = scrubCharByChar("plain prose with a <div>tag</div> and ![a](asset:x)");
    expect(observed).toBe("plain prose with a <div>tag</div> and ![a](asset:x)");
  });

  test("a TRUNCATED/aborted hidden span is DROPPED, never wedges the stream (fail-closed at flush)", () => {
    const scrubber = createHiddenSpanStreamScrubber();
    let observed = scrubber.push("The truth is ");
    observed += scrubber.push('<lie character="Z" truth="the cryp'); // stream aborts mid-attr
    // Nothing hidden emitted mid-stream…
    expect(observed).toBe("The truth is ");
    // …and the held in-progress open is DROPPED at flush (the member keeps the at-commit-stripped view).
    observed += scrubber.flush();
    expect(observed).toBe("The truth is ");
    expect(observed).not.toContain("cryp");
  });

  test("a non-hidden tag whose name PREFIXES a hidden tag is held then RELEASED (`<li>`/`<link>` are not `<lie>`)", () => {
    // `<li` is a live prefix of `<lie` and is held until the next char disqualifies it.
    const { observed } = scrubCharByChar("item <li>one</li> and <link/> done");
    expect(observed).toBe("item <li>one</li> and <link/> done");
  });

  test("two hidden tags in one stream both vanish; interleaved prose survives", () => {
    const l1 = '<lie character="A" truth="secretOne"/>';
    const l2 = '<ofilter event="secretTwo" reason="r"/>';
    const { observed, prefixes } = scrubCharByChar(`start ${l1} mid ${l2} end`);
    expect(observed).toBe("start  mid  end");
    for (const p of prefixes) {
      expect(p).not.toContain("secretOne");
      expect(p).not.toContain("secretTwo");
    }
  });

  test("a lone trailing `<` at stream end is DROPPED (fail-closed: it could have opened a hidden tag); the safe prefix already emitted", () => {
    const scrubber = createHiddenSpanStreamScrubber();
    // The `<` is held (it could still begin `<lie`); nothing after it arrives, so flush drops it. The one lost
    // byte is cosmetic — the committed view is authoritative — and never a leak.
    expect(scrubber.push("done <")).toBe("done ");
    expect(scrubber.flush()).toBe("");
  });

  test("a real `<` followed by a non-tag char is RELEASED, not dropped (only a stream-final bare `<` is lost)", () => {
    // `5 < 3` — the space after `<` disqualifies a hidden-tag open, so the `<` streams through.
    const { observed } = scrubCharByChar("the count is 5 < 3 today");
    expect(observed).toBe("the count is 5 < 3 today");
  });

  test("SECURITY: a `<` INSIDE a hidden tag's attr value never releases the enclosing open's prefix (D106 mid-stream leak)", () => {
    // The `<lie truth="<ofilter …"/>` attr value carries a literal `<`. The rightmost-cut logic used to split
    // the tag at that inner `<`, releasing the `<lie truth="` prefix AND, once the outer `/>` arrived, the whole
    // secret as literal — a byte the commit strip drops. The quote-aware hold must keep the ENTIRE run held.
    const body = '<lie truth="<ofilter event=xyz secret"/> visible';
    const { observed, prefixes } = scrubCharByChar(body);
    expect(observed).toBe(stripHiddenSpans(body).content); // == " visible" (the whole hidden tag dropped)
    for (const p of prefixes) {
      expect(p).not.toContain("secret");
      expect(p).not.toContain("<lie");
      expect(p).not.toContain("ofilter");
    }
  });

  test("SECURITY: a hidden tag whose attr value contains an unclosed `<` and NEVER closes is dropped at flush (not leaked)", () => {
    const scrubber = createHiddenSpanStreamScrubber();
    let observed = scrubber.push('<lie truth="a<b secret and more'); // a `<` mid-attr, stream aborts
    observed += scrubber.flush();
    expect(observed).toBe("");
    expect(observed).not.toContain("secret");
  });

  test("SECURITY: a `/>` INSIDE a quoted attr value does not false-close and leak the tag (quote-aware completion)", () => {
    const body = '<lie truth="path a/>b secret"/> tail';
    const { observed, prefixes } = scrubCharByChar(body);
    expect(observed).toBe(stripHiddenSpans(body).content); // == " tail"
    for (const p of prefixes) {
      expect(p).not.toContain("secret");
    }
  });
});

describe("scanGhostContent — the §4.5 forming-card ghost scan (P4)", () => {
  test("no card open → one byte-identical text segment", () => {
    expect(scanGhostContent("hello **world**")).toEqual([{ kind: "text", text: "hello **world**" }]);
    expect(scanGhostContent("")).toEqual([{ kind: "text", text: "" }]);
  });

  test("an INCOMPLETE open line (no newline yet) stays text — recognition waits for the completed line", () => {
    expect(scanGhostContent('prose\n:::card title="Zan')).toEqual([{ kind: "text", text: 'prose\n:::card title="Zan' }]);
  });

  test("a completed open line suppresses the accumulating body behind a forming-card segment", () => {
    const segments = scanGhostContent('The letter reads:\n:::card title="Zandik\'s letter"\n<div>half-streamed HT');
    expect(segments).toEqual([
      { kind: "text", text: "The letter reads:\n" },
      { kind: "forming-card", title: "Zandik's letter" },
    ]);
  });

  test("a FORMING card exposes NO body bytes — a renderer structurally cannot paint partial HTML", () => {
    const [segment] = scanGhostContent(':::card title="Terminal"\n<div>half-streamed <img src="https://evil.test/p.png">');
    expect(segment).toEqual({ kind: "forming-card", title: "Terminal" });
    expect(JSON.stringify(segment)).not.toContain("evil.test");
  });

  test("a title-less open forms with title null", () => {
    expect(scanGhostContent(":::card\n<div>")).toEqual([{ kind: "forming-card", title: null }]);
  });

  test("a CLOSED fence mid-stream becomes a real card segment carrying its FINAL body; prose resumes after", () => {
    const segments = scanGhostContent(':::card title="Poster"\n<div>done</div>\n:::\nAnd the crowd gasps');
    expect(segments).toEqual([
      { kind: "card", title: "Poster", body: "<div>done</div>" },
      { kind: "text", text: "And the crowd gasps" },
    ]);
  });

  test("SECURITY: an UNTERMINATED close line is NOT a close — the next token can still revoke it", () => {
    // A trailing `:::` with no newline matches FENCE_CLOSE_RE, so without the termination requirement the
    // ghost would mount a card whose body is not final — and `:::x` on the next token would revoke it,
    // flipping the card back to a chip. A model that types a close-looking line cannot spoof a close.
    expect(scanGhostContent(':::card title="Poster"\n<div>done</div>\n:::')).toEqual([{ kind: "forming-card", title: "Poster" }]);
    // The very next token proves the revocation was real: it was never a close line at all.
    expect(scanGhostContent(':::card title="Poster"\n<div>done</div>\n:::x\n')).toEqual([{ kind: "forming-card", title: "Poster" }]);
    // The newline is what makes it final.
    expect(scanGhostContent(':::card title="Poster"\n<div>done</div>\n:::\n')).toEqual([{ kind: "card", title: "Poster", body: "<div>done</div>" }]);
  });

  test("a closed card's segment is IMMUTABLE under every later token (the one-mount invariant)", () => {
    const closed = ':::card title="Poster"\n<div>done</div>\n:::\n';
    const [first] = scanGhostContent(closed);
    for (const tail of ["A", "And the crowd ", "And the crowd gasps.\n\nThen silence.", '\n:::card title="Second"\n<p>x</p>\n:::\n']) {
      expect(scanGhostContent(closed + tail)[0]).toEqual(first);
    }
  });

  test("the ghost card body is the SAME projection the committed grammar produces (one card, not two)", () => {
    const body = ':::card title="Poster"\n<div>a</div>\n<p>b</p>\n:::\n';
    const ghost = scanGhostContent(body)[0];
    const committed = tokenizeContent(body).find((s) => s.kind === "card");
    expect(ghost).toMatchObject({ kind: "card", title: "Poster" });
    expect(ghost?.kind === "card" ? ghost.body : null).toBe(committed?.kind === "card" ? committed.body : undefined);
  });

  test("a nested `:::` inside the body does not close the card early (balance-aware, same as committed)", () => {
    const segments = scanGhostContent(':::card title="Outer"\n:::choices\n1. a\n:::\n<p>still mine</p>\n:::\ntail');
    expect(segments).toEqual([
      { kind: "card", title: "Outer", body: ":::choices\n1. a\n:::\n<p>still mine</p>" },
      { kind: "text", text: "tail" },
    ]);
  });

  test("a markdown code-fence region never forms a card (the author is SHOWING the syntax)", () => {
    const text = '```\n:::card title="shown"\n```\nprose';
    expect(scanGhostContent(text)).toEqual([{ kind: "text", text }]);
  });

  test("§4h: a tolerated open forms the chip too — the ghost never disagrees with the committed parse", () => {
    // Otherwise a malformed opener would stream as raw HTML and then SNAP into a card at commit.
    expect(scanGhostContent(':::card title="Maintenance Terminal — Login">\n<div>LOG')).toEqual([
      { kind: "forming-card", title: "Maintenance Terminal — Login" },
    ]);
    // …and a genuinely unparseable open still streams as text in both planes.
    const broken = ":::card title='Login'\n<div>LOG";
    expect(scanGhostContent(broken)).toEqual([{ kind: "text", text: broken }]);
  });

  test("a non-card directive open (:::choices) stays text in the ghost", () => {
    const text = ":::choices\n1. Run.\n";
    expect(scanGhostContent(text)).toEqual([{ kind: "text", text }]);
  });
});

// The PREVIEW plane (`ChatSummary.lastMessagePreview`): one line of plain prose, hidden-safe, capped.
describe("projectBodyForPreview", () => {
  test("markdown is FLATTENED to one line — headings, emphasis, lists, quotes, fences, links", () => {
    const body = "# The Gate\n\n> The door **gives way**.\n- `iron` hinges\n\n```ts\nconst x = 1;\n```\nAsh on the [wind](https://example.test/ash).";
    expect(projectBodyForPreview(body)).toBe("The Gate The door gives way. iron hinges const x = 1; Ash on the wind.");
  });

  test("HIDDEN-class spans are dropped — a preview is a durable, member-reachable artifact", () => {
    const body = 'She smiles. <lie character="Aria" type="claim" truth="she has the key" reason="cover"/> The room waits.';
    const preview = projectBodyForPreview(body);
    expect(preview).toBe("She smiles. The room waits.");
    expect(preview).not.toContain("she has the key");
  });

  test("structured spans carry no glanceable prose — card / choices / image / unknown-directive drop out", () => {
    expect(projectBodyForPreview(':::card title="Ashfell Night Market"\n<div>stalls</div>\n:::\nYou step out.')).toBe("You step out.");
    expect(projectBodyForPreview("Pick one.\n:::choices\n1. Run.\n:::")).toBe("Pick one.");
    expect(projectBodyForPreview("![a portrait](asset:asset_1)\nShe waits.")).toBe("She waits.");
    expect(projectBodyForPreview('<gmnote to="self" text="not prose"/>\nShe waits.')).toBe("She waits.");
  });

  test("a NARRATOR row's <speaker> markers flatten to plain NAME: attribution — never raw markup in the scent line", () => {
    // The chat-list subtitle is exactly this projection (`ChatSummary.lastMessagePreview`). A group narrator
    // body carries inline `<speaker>NAME</speaker>` markers that the message-list renderer splits + tints; the
    // one-line preview must read as prose, not leak the tag. Reuses the kit speaker engine (`speakerTagsToPlain`).
    const body = "<speaker>Aldric</speaker>The gate holds. <speaker>Sabine</speaker>For now.";
    const preview = projectBodyForPreview(body);
    expect(preview).not.toContain("<speaker>");
    expect(preview).not.toContain("</speaker>");
    expect(preview).toBe("Aldric: The gate holds. Sabine: For now.");
  });

  test("a NON-narrator body carries NO <speaker> markers, so the strip is a byte-for-byte no-op (the fence)", () => {
    // The speaker flatten must touch ONLY narrator rows. A per-speaker / solo / human body has no `<speaker>`
    // tags, so `speakerTagsToPlain` is a no-op and the preview is exactly the pre-change projection. A prose
    // line that merely mentions the word "speaker" (never as a tag) is likewise untouched.
    expect(projectBodyForPreview("She lowers her voice to a whisper. The room stills.")).toBe("She lowers her voice to a whisper. The room stills.");
    expect(projectBodyForPreview("The speaker at the lectern cleared his throat.")).toBe("The speaker at the lectern cleared his throat.");
  });

  test("truncation lands on the FLATTENED string — a long narrator preview caps to the budget, not the raw markup", () => {
    // The cap runs AFTER the speaker flatten, so the budget is spent on readable prose, never on `<speaker>` bytes.
    const body = `<speaker>Aldric</speaker>${"a".repeat(300)}`;
    const preview = projectBodyForPreview(body);
    expect(preview).toHaveLength(PREVIEW_MAX_CHARS);
    expect(preview.startsWith("Aldric: ")).toBe(true);
    expect(preview.endsWith("…")).toBe(true);
  });

  test("an all-structure or empty body previews as the EMPTY string (the caller decides what that means)", () => {
    expect(projectBodyForPreview("")).toBe("");
    expect(projectBodyForPreview('<lie character="Aria" truth="x"/>')).toBe("");
    // The rpg state-anchor slot: an empty body that must never read as a beat.
    expect(projectBodyForPreview("   \n\n  ")).toBe("");
  });

  test("the cap is a CHARACTER budget including the ellipsis — never a longer string than asked for", () => {
    const long = "a".repeat(300);
    expect(projectBodyForPreview(long)).toHaveLength(PREVIEW_MAX_CHARS);
    expect(projectBodyForPreview(long).endsWith("…")).toBe(true);
    // At/below the cap nothing is appended (the common short line is byte-identical).
    expect(projectBodyForPreview("a".repeat(PREVIEW_MAX_CHARS))).toBe("a".repeat(PREVIEW_MAX_CHARS));
    expect(projectBodyForPreview("one two three", 8)).toBe("one two…");
  });
});
