// Seal-level CT for @orb/ui/markdown — quoted-speech tinting and the rendered geometry of blockquotes, inline code, lists and thematic breaks.

import { Markdown } from "@orb/ui/markdown";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";

// ── quoted-speech tinting (`colorQuotes`) ──────────────────────────────────────────────────────────

// The grammar itself is pinned deterministically in dialogue.test.ts; these prove the SEAL wiring —
// that the opt-in prop mounts the components override, that the span really resolves the scope's
// `--color-dialogue` (computed value, never the class string), and that OFF is the untouched render.
const DIALOGUE_SPAN = '[data-slot="dialogue"]';
const AVELINE_LINE = "He doesn't look up from the ledger. “You're late,” he says, turning a page.";

/** The COMPUTED color of the first tinted span vs the scope's resolved `--color-dialogue`. */
function tintVsToken(span: Locator): Promise<{ readonly tint: string; readonly token: string }> {
  return span.evaluate((el) => {
    const style = getComputedStyle(el);
    const raw = style.getPropertyValue("--color-dialogue").trim();
    // Resolve the token through the same engine the class does: paint it on a probe and read it back.
    const probe = document.createElement("span");
    probe.style.color = raw;
    el.append(probe);
    const token = getComputedStyle(probe).color;
    probe.remove();
    return { tint: style.color, token };
  });
}

test("colorQuotes ON: a quoted run renders a span painted with the resolved --color-dialogue", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static" colorQuotes={true}>
      {AVELINE_LINE}
    </Markdown>,
  );
  const span = cmp.locator(DIALOGUE_SPAN);
  await expect(span).toHaveCount(1);
  await expect(span).toHaveText("“You're late,”");
  const { tint, token } = await tintVsToken(span);
  expect(tint).toBe(token);
  // The narration around it is NOT tinted — the whole point is the contrast between the two voices.
  await expect(cmp).toContainText("turning a page.");
});

test("colorQuotes OFF (the default): the same line renders plain — no tint span at all", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {AVELINE_LINE}
    </Markdown>,
  );
  await expect(cmp.locator(DIALOGUE_SPAN)).toHaveCount(0);
  await expect(cmp).toContainText("You're late,");
});

test("colorQuotes ON: quotes inside an inline code span never tint (code is opaque to the grammar)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static" colorQuotes={true}>
      {'Type `say "hi"` and then `echo "bye"` to finish.'}
    </Markdown>,
  );
  await expect(cmp.locator("code").first()).toBeVisible();
  await expect(cmp.locator(DIALOGUE_SPAN)).toHaveCount(0);
});

test("colorQuotes ON: an emphasis run INSIDE the quotes keeps its narration tint (both voices survive)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static" colorQuotes={true}>
      {'She says "get *out* of here" and turns away.'}
    </Markdown>,
  );
  // Three tinted pieces: the text before the em, the wrapped em itself, and the text after.
  await expect(cmp.locator(DIALOGUE_SPAN)).toHaveCount(3);
  await expect(cmp.locator("em")).toHaveCount(1);
});

// ── #238: a BLOCKQUOTE must be visually distinct from narration ───────────────────────────────────

// Streamdown's blockquote carries its own utilities, and its dist is deliberately NOT a Tailwind source
// (markdown.tsx states the ruling: the vendor's raw spacing would fight `--reading-paragraph-spacing`),
// so those class names generate NOTHING and the element rendered with border-left-width 0, padding-left
// 0 — italic + muted, i.e. byte-identical to how this seal paints narration (`[&_em]:text-narration`).
// The fix keeps the ruling and pays the DIFFERENCE in COMPILED equivalents from our own source, the same
// technique the root className already uses. This pins the RENDERED result, not the class string.
const QUOTED_MARKDOWN = "> The bridge remembers every crossing.\n\n*she leans in, quiet.*\n";
const INLINE_CODE_MARKDOWN = "call `resolveRole(role)` first";

test("issue 238: a blockquote renders its rule + indent + separation, and does not read as narration", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {QUOTED_MARKDOWN}
    </Markdown>,
  );
  const quote = cmp.locator("blockquote");
  await expect(quote).toHaveCount(1);
  const box = await quote.evaluate((el) => {
    const s = getComputedStyle(el);
    return {
      borderLeft: Number.parseFloat(s.borderLeftWidth),
      paddingLeft: Number.parseFloat(s.paddingLeft),
      paddingTop: Number.parseFloat(s.paddingTop),
      borderColor: s.borderLeftColor,
      // The alpha channel parsed out so the transparent check needs no color literal (gate §13.7):
      // computed colors serialize as rgb(a b c) at alpha 1 (no alpha slot) or rgba(..., a) below it.
      borderAlpha: s.borderLeftColor.startsWith("rgba") ? Number.parseFloat(s.borderLeftColor.split(",")[3] ?? "1") : 1,
      bg: s.backgroundColor,
    };
  });
  // All three measured 0 before #238 — the whole defect.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.borderLeft).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.paddingLeft).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.paddingTop).toBeGreaterThan(0);
  // The rule is a real, visible edge — not a transparent one (a 4px transparent border still measures 4).
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.borderAlpha).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.borderColor).not.toBe(box.bg);
  // …and the narration voice beside it carries NONE of that geometry: the two are no longer the same
  // rendering (both are italic + muted by design; the quote's distinctness has to come from its box).
  const narration = cmp.locator("em").first();
  await expect.poll(async () => await narration.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderLeftWidth))).toBe(0);
});

test("issue 238: inline code renders its horizontal padding (the vendor's own utility never compiled)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {INLINE_CODE_MARKDOWN}
    </Markdown>,
  );
  const code = cmp.locator("code").first();
  await expect.poll(async () => await code.evaluate((el) => Number.parseFloat(getComputedStyle(el).paddingLeft))).toBeGreaterThan(0);
});

// #490 — the OTHER TWO declarations #238 left on the floor. The vendor spells a SIZE and a VERTICAL
// padding on the same element and neither compiled in the app bundle either, so in a real room the chip
// rendered at BODY size with zero vertical padding: a muted bar hugging the glyphs (measured live
// 2026-08-22: fontSize 15px, padding "0px 4px", an 18px box in a 23.25px line).
//
// ⚑ THE ASSERTION IS AN EQUALITY AGAINST OUR OWN TOKENS, AND THAT IS FORCED, NOT STYLISTIC. This harness
// scans `../tests` and `../packages/client/src` for class usage (playwright/index.css), so the vendor's
// `text-sm`/`py-0.5` DO compile HERE while they are dead in the app bundle — a CT can never observe the
// production defect as "unstyled". A first cut asserting `fontSize < proseFontSize` passed at pre-fix HEAD
// for exactly that reason (14px vendor `text-sm` < 15px prose) and was an un-failable fence. Pinning the
// resolved TOKEN values instead is failable in both bundles: pre-fix the element measures the vendor's
// 14px/2px, post-fix it measures `--text-code`/`--spacing-tight` — and no px literal is spelled, so a
// token retune moves the expectation with the design system.
test("issue 490: inline code renders at the CODE token size with the tight vertical padding", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {INLINE_CODE_MARKDOWN}
    </Markdown>,
  );
  const measured = await cmp
    .locator("code")
    .first()
    .evaluate((el) => {
      const own = getComputedStyle(el);
      const root = getComputedStyle(document.documentElement);
      // Resolve a belted token by making the BROWSER do the arithmetic: `--spacing-*` carries the
      // `round(up, …, 1px)` device-pixel belt (#1640) and `getPropertyValue` hands back that authored
      // token stream, which `parseFloat` reads as NaN. A throwaway probe resolves it to real px.
      const probePx = (doc: Document, name: string): number => {
        const probe = doc.createElement("div");
        probe.style.paddingTop = `var(${name})`;
        doc.body.append(probe);
        const value = Number.parseFloat(getComputedStyle(probe).paddingTop);
        probe.remove();
        return value;
      };
      return {
        fontSize: own.fontSize,
        codeToken: root.getPropertyValue("--text-code").trim(),
        paddingTop: own.paddingTop,
        paddingBottom: own.paddingBottom,
        tightPx: probePx(el.ownerDocument, "--spacing-tight"),
        // The rem base, read rather than assumed — `fontScale` moves it, and a hardcoded 16 would make
        // every equality below a lie the moment a reader scales their type.
        remPx: Number.parseFloat(root.fontSize),
        proseFontSize: Number.parseFloat(getComputedStyle(el.parentElement ?? el).fontSize),
      };
    });
  // Both tokens must actually resolve, or every equality below is a vacuous ""==="" (the same
  // positive-control discipline a planted fixture gives a gate).
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(measured.codeToken).not.toBe("");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(measured.tightPx).toBeGreaterThan(0);
  const px = (rem: string): number => Number.parseFloat(rem) * measured.remPx;
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(Number.parseFloat(measured.fontSize)).toBeCloseTo(px(measured.codeToken), 1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(Number.parseFloat(measured.paddingTop)).toBeCloseTo(measured.tightPx, 1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(Number.parseFloat(measured.paddingBottom)).toBeCloseTo(measured.tightPx, 1);
  // …and it is still SMALLER than the prose it sits in — the reader-visible half of the finding.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(Number.parseFloat(measured.fontSize)).toBeLessThan(measured.proseFontSize);
});

// ── #1085: a markdown LIST must render as a list ──────────────────────────────────────────────────

// The third instance of the #238/#490 family, and the one a reader hits daily: Streamdown stamps its own
// utilities on the ul/ol/li it renders, its dist is deliberately NOT a Tailwind source, and Tailwind's
// preflight zeroes list-style/margin/padding — so every chat list rendered as FLAT, unmarked,
// unindented text (owner-observed live, 2026-09-01). The seal now OWNS those three elements
// (`list-components.tsx`) instead of paying descendant variants over the vendor's, because unlike the
// fenced-code branch there is no vendor logic to re-implement — see the ruling in markdown.tsx.
//
// ⚑ The assertions are RENDERED GEOMETRY pinned to OUR tokens, never class strings, and never a bare
// "greater than zero" where a token equality is available (#490's un-failable-fence lesson: this CT
// harness scans `tests/` + `packages/{ui,client}/src`, so a class literal spelled anywhere in that set
// compiles HERE even when it is dead in the app bundle).
const LIST_MARKDOWN = "Intro paragraph.\n\n- alpha\n- beta\n    - nested under beta\n\n1. first\n2. second\n";

test("issue 1085: an unordered list renders a marker, a hanging indent and inter-item rhythm", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {LIST_MARKDOWN}
    </Markdown>,
  );
  const list = cmp.locator("ul").first();
  await expect(list).toBeVisible();
  // The token values are READ from the document, never assumed: `fontScale` moves the rem base, so a
  // hardcoded 16 would make every equality below a lie for a reader who scales their type.
  const box = await list.evaluate((el) => {
    const own = getComputedStyle(el);
    const item = el.querySelector("li");
    // A PROBE, never `getPropertyValue` — the `--spacing-*` family is belted (`round(up, …, 1px)`, #1640)
    // and a custom property resolves to that authored token stream rather than to a length, so the
    // browser is asked to resolve it instead of the test parsing it.
    const token = (name: string): number => {
      const probe = el.ownerDocument.createElement("div");
      probe.style.paddingTop = `var(${name})`;
      el.ownerDocument.body.append(probe);
      const value = Number.parseFloat(getComputedStyle(probe).paddingTop);
      probe.remove();
      return value;
    };
    return {
      marker: own.listStyleType,
      markerPosition: own.listStylePosition,
      paddingLeft: Number.parseFloat(own.paddingLeft),
      paddingTop: Number.parseFloat(own.paddingTop),
      itemPaddingTop: item === null ? -1 : Number.parseFloat(getComputedStyle(item).paddingTop),
      itemDisplay: item === null ? "" : getComputedStyle(item).display,
      fontSize: Number.parseFloat(own.fontSize),
      tokens: { tight: token("--spacing-tight"), row: token("--spacing-row"), section: token("--spacing-section") },
    };
  });
  const tokens = box.tokens;
  // The tokens must actually resolve, or every equality below is a vacuous NaN comparison (the same
  // positive-control discipline a planted fixture gives a gate).
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(tokens.section).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(tokens.tight).toBeGreaterThan(0);
  // Preflight's `list-style: none` was the whole defect — a bullet, not bare text.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.marker).not.toBe("none");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.itemDisplay).toBe("list-item");
  // A HANGING indent: the marker sits outside the text column (so a wrapped line aligns under the text,
  // not under the bullet) and the list's own padding is what keeps that marker inside the bubble.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.markerPosition).toBe("outside");
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.paddingLeft).toBeCloseTo(tokens.section, 1);
  // …and that indent is wide enough to HOLD an outside marker at any list length — a two-digit ordered
  // marker is about 1.3× the prose font, so a padding under 1.5em would spill it past the list's own
  // left edge once a list reaches ten items. A point measurement on a three-item list cannot see that.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.paddingLeft).toBeGreaterThanOrEqual(box.fontSize * 1.5);
  // Vertical rhythm: separation from the surrounding prose (padding, not margin — the seal root's own
  // trim out-specifies any sibling margin a descendant could set, the #238 mechanism) and between items.
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.paddingTop).toBeCloseTo(tokens.row, 1);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.itemPaddingTop).toBeCloseTo(tokens.tight, 1);
});

test("issue 1085: an ordered list numbers, and a nested list indents past its parent item", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {LIST_MARKDOWN}
    </Markdown>,
  );
  const ordered = cmp.locator("ol").first();
  await expect(ordered).toBeVisible();
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(await ordered.evaluate((el) => getComputedStyle(el).listStyleType)).toBe("decimal");
  const nested = cmp.locator("ul ul").first();
  await expect(nested).toBeVisible();
  // Geometry, not a class: the nested item's text must start strictly to the RIGHT of its parent item's
  // text, which is the whole reader-visible point of a sub-list.
  const lefts = await cmp.evaluate(() => {
    const inner = document.querySelector("ul ul > li");
    const outer = document.querySelector("ul > li");
    return {
      inner: inner === null ? 0 : inner.getBoundingClientRect().left,
      outer: outer === null ? 0 : outer.getBoundingClientRect().left,
    };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(lefts.inner).toBeGreaterThan(lefts.outer);
});

// ── H19 (side-eye HOME 2026-09-02): the THEMATIC BREAK — the family's fourth case ──────────────────

// Measured live in a chat room: `[css] dead class — no rule defines it, so the style never applied ·
// .my-6`. Streamdown's `hr` is `cn("my-6 border-border", …)`, its dist is not a Tailwind source (#238's
// ruling), and preflight zeroes margins — so a `---` in a message drew a rule flush against the prose on
// both sides AND left a class in the DOM that no rule defines. The element is OWNED now
// (`rule-component.tsx`), which is #1085's arm: the vendor class leaves the DOM rather than being
// out-painted. Both halves are asserted through what RENDERS — the gap as geometry, the dead class as an
// absence from the class attribute, which is exactly what the live flagger reads.
const RULED_MARKDOWN = "Before the break.\n\n---\n\nAfter the break.\n";

test("H19: a thematic break renders a real gap either side, and carries no uncompiled vendor class", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {RULED_MARKDOWN}
    </Markdown>,
  );
  const rule = cmp.locator("hr");
  await expect(rule).toHaveCount(1);

  // THE DEAD CLASS IS GONE FROM THE DOM — not merely out-painted. `my-6` is what the live flagger named.
  await expect.poll(async () => await rule.evaluate((el) => el.className)).not.toContain("my-6");
  // …and it is still a visible rule.
  await expect.poll(async () => await rule.evaluate((el) => Number.parseFloat(getComputedStyle(el).borderTopWidth))).toBeGreaterThan(0);

  // THE GAP, as geometry: the rule sits between its two paragraphs with real space on BOTH sides.
  // Measured 0/0 before this landed — the whole defect.
  const gaps = await cmp.evaluate(() => {
    const paragraphs = [...document.querySelectorAll("p")];
    const line = document.querySelector("hr");
    const before = paragraphs[0]?.getBoundingClientRect();
    const after = paragraphs[1]?.getBoundingClientRect();
    const box = line?.getBoundingClientRect();
    return { above: (box?.top ?? 0) - (before?.bottom ?? 0), below: (after?.top ?? 0) - (box?.bottom ?? 0) };
  });
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(gaps.above).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(gaps.below).toBeGreaterThan(0);
});
