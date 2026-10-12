import { cardWireStub, contentSpanRaw, projectBodyForSummary, projectHiddenSpans, scanHiddenSpans, stripHiddenSpans, tokenizeContent } from "@orb/kit/content";
import { expect, test } from "@orb/testkit/node/fixtures.ts";
import { describe } from "vitest";
import { LIE } from "./_support.ts";

test("hidden position projection uses the full scan, distinguishing repeated code-fenced tags and collapsing interior positions", () => {
  const shown = `\`\`\`\n${LIE}\n\`\`\`\nBefore.`;
  const body = `${shown}${LIE}After.${LIE}Done.`;
  const second = shown.length + LIE.length + 6;
  const positions = [0, shown.indexOf("truth"), shown.length, shown.length + 4, shown.length + LIE.length, second + 2, body.length];
  expect(projectHiddenSpans(body, positions)).toEqual({
    content: `${shown}After.Done.`,
    hadHidden: true,
    offsets: [0, shown.indexOf("truth"), shown.length, shown.length, shown.length, shown.length + 6, shown.length + 11],
  });
  expect(projectHiddenSpans(`${shown}<lie`, [shown.length + 2])).toEqual({ content: `${shown}<lie`, hadHidden: false, offsets: [shown.length + 2] });
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
