// Seal-level CT for @orb/ui/markdown — streaming-mode repair, the word-reveal fade, the tail-hold pre-pass and code-block birth geometry.

import { Markdown } from "@orb/ui/markdown";
import { expect, test } from "@playwright/experimental-ct-react";
import { ERROR_FALLBACK } from "./_support.ts";

// ── STREAMING-mode goldens ─────────────────────────────────────────────────────────────────────────
// Mounting the seal DIRECTLY with a raw string proves `mode="streaming"` wires Streamdown's
// incomplete-markdown repair (unterminated fence / torn emphasis), that `mode="static"` renders a
// settled string safely, and that the reveal fade + caret respect reduced-motion. Distinct from the
// CONSUMER goldens (ghost-message-row.ct.tsx) that drive the paced store + `holdTornSpeaker` end-to-end;
// holding a TORN `<speaker>` tag is the consumer's pre-pass, not a seal concern, so it lives there.

test("streaming: an unterminated code fence repairs to a code block (never flashes literal backticks)", async ({ mount }) => {
  // parseIncompleteMarkdown (on by default; its EFFECT engages only in streaming mode) closes the
  // still-open fence so the body renders as code, not raw ``` text.
  const md = "Here:\n```js\nconst x = 1;";
  const cmp = await mount(
    <Markdown trust="trusted" mode="streaming">
      {md}
    </Markdown>,
  );
  await expect(cmp.locator("pre code")).toContainText("const x = 1;");
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("streaming: unpaired **emphasis never renders the literal ** marker", async ({ mount }) => {
  const md = "This is **bold not yet closed";
  const cmp = await mount(
    <Markdown trust="trusted" mode="streaming">
      {md}
    </Markdown>,
  );
  await expect(cmp).toContainText("bold not yet closed");
  // The repair closed the run — no stray literal `**` survives in the rendered text.
  await expect(cmp.getByText("**", { exact: false })).toHaveCount(0);
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

// The mode prop is really threaded, not cosmetic: streaming engages the incomplete-markdown repair
// (a torn fence becomes a code block), static does NOT rewrite settled canon. Playwright CT allows one
// mount per test, so the two modes are asserted in sibling tests against the SAME torn-fence input.
const TORN_FENCE = "text before\n```js\nconst y = 2;";

test("streaming mode: a torn fence repairs into a code block", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="trusted" mode="streaming">
      {TORN_FENCE}
    </Markdown>,
  );
  await expect(cmp.locator("pre code")).toContainText("const y = 2;");
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("static mode: the SAME torn fence renders safely without white-screening (repair not engaged)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {TORN_FENCE}
    </Markdown>,
  );
  // Static must render the text safely and never trip the seal error boundary; it does NOT silently
  // rewrite the settled string the way streaming's repair does.
  await expect(cmp).toContainText("const y = 2;");
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

// #34: a SETTLED body's dangling/censoring asterisk must NOT be auto-closed into a stray emphasis run
// (the repair is streaming-only). The real greeting pattern: an intended narration italic, then a
// censored word mid-paragraph, then more text — the exact shape that italicized "cking diagram." live.
const GREETING_PATTERN = "*A doesn't look up.*\n\nyours can't use a f*cking diagram.\n\nSo here's the deal.";

test("static: a lone censoring asterisk stays literal — no stray emphasis run (the #34 fix)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {GREETING_PATTERN}
    </Markdown>,
  );
  // The intended narration italic survives; the lone `*` in `f*cking` does NOT italicize the rest.
  await expect(cmp.locator("em")).toHaveCount(1);
  await expect(cmp.locator("em").first()).toHaveText("A doesn't look up.");
  await expect(cmp).toContainText("f*cking diagram.");
});

// REGRESSION PIN: the EXACT resolved JFC greeting (3 asterisks — a paired narration italic + a lone
// censoring `f*cking`). The seal in `static` mode renders it as CommonMark intends: the lone `*` stays
// literal (ONE em, the paired italic). It was NOT the seal that broke this live — the client DISPLAY
// pipeline's unconditional `fixMarkdown` appended a closing `*` UPSTREAM, handing the seal
// `f*cking diagram.**` (an even count → a stray emphasis run). The fix gates that `fixMarkdown` behind
// the `autoFixMarkdown` pref (default OFF, lib/message-render); this pin guards the seal's own contract.
const JFC_GREETING =
  "*JFC doesn't look up.*\n\nLet me save us both an hour. Users are real, and yours can't use a f*cking diagram.\n\nSo here's the deal, User: tell me what you're building.";

test("static UNTRUSTED (the greeting's real tier): the censoring asterisk stays literal — ONE italic", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {JFC_GREETING}
    </Markdown>,
  );
  await expect(cmp.locator("em")).toHaveCount(1);
  await expect(cmp.locator("em").first()).toHaveText("JFC doesn't look up.");
  await expect(cmp).toContainText("f*cking diagram.");
});

test("streaming: a complete message still renders its markdown (bold + list)", async ({ mount }) => {
  const md = "**Ready.**\n\n- one\n- two";
  const cmp = await mount(
    <Markdown trust="trusted" mode="streaming">
      {md}
    </Markdown>,
  );
  await expect(cmp.getByText("Ready.")).toBeVisible();
  await expect(cmp.locator("li")).toHaveCount(2);
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("reduced motion: streaming content still renders fully (fade/caret suppressed, no lost text)", async ({ mount, page }) => {
  // Under reduced-motion the seal injects no reveal plugin at all (REMOVE, guide §3.9); the content
  // must land in full, visible, exactly as without motion (no reveal held back by a suppressed fade).
  await page.emulateMedia({ reducedMotion: "reduce" });
  const body = "The whole message is present immediately under reduced motion.";
  const cmp = await mount(
    <Markdown trust="untrusted" mode="streaming">
      {body}
    </Markdown>,
  );
  await expect(cmp.getByText(body)).toBeVisible();
  await expect(cmp.locator("[data-orb-reveal]")).toHaveCount(0);
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

// ── #42 streamed-word reveal fade ──────────────────────────────────────────────────────────────────

// The fence that would have caught the dead knob: it asserts the RESOLVED animation on a word span,
// not the attribute. Pre-#42, word spans existed (`data-sd-animate`) but no stylesheet consumed them —
// computed animation-name was "none" and every word hard-popped ("blam"). A green here requires the
// plugin to mint the span AND the ui globals to animate it.
const REVEAL_LINE = "The harbor lights flicker over the water";
const REVEAL_FENCED = "before\n\n```js\nconst x = 1;\n```\n\nafter words";
const REVEAL_SETTLED = "A settled message renders without reveal machinery.";

test("streaming untrusted: newly revealed words carry a REAL fade (computed animation-name, not just an attr)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="streaming">
      {REVEAL_LINE}
    </Markdown>,
  );
  const spans = cmp.locator("[data-orb-reveal]");
  // Whitespace runs stay bare text; every word is one span.
  await expect(spans).toHaveCount(7);
  // Compositor-only (guide §3.7): the fade is opacity-only, resolved from the keyframe.
  await expect.poll(() => spans.first().evaluate((el) => getComputedStyle(el).animationName)).toBe("orb-word-reveal");
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("streaming: code fences are never word-wrapped (reveal spans skip code/pre)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="streaming">
      {REVEAL_FENCED}
    </Markdown>,
  );
  await expect(cmp.locator("pre code")).toContainText("const x = 1;");
  await expect(cmp.locator("pre [data-orb-reveal]")).toHaveCount(0);
  // Prose around the fence still reveals word-by-word.
  await expect(cmp.locator("[data-orb-reveal]").first()).toBeVisible();
});

test("static mode: no reveal spans ever (settled canon renders span-free)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {REVEAL_SETTLED}
    </Markdown>,
  );
  await expect(cmp.locator("[data-orb-reveal]")).toHaveCount(0);
});

// ── M1 · the tail-hold pre-pass ─────────────────

// The grammar is pinned deterministically in tail-hold.test.ts; these are the RENDERED half — that the
// seal wires the pre-pass on the streaming path only, and that the withheld construct arrives as the
// right block on its FIRST paint instead of flipping type under the reader.
const M1_PIPE_PREFIX = "Intro line.\n\n| Name | Role |";
const M1_TABLE_SETTLED = "Intro line.\n\n| Name | Role |\n| --- | --- |\n| Ada | lead |\n";
const M1_BARE_MARKER = "*";

test("M1 streaming: a lone pipe row never paints as prose (the P→TABLE flip's first half)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="streaming">
      {M1_PIPE_PREFIX}
    </Markdown>,
  );
  await expect(cmp).toContainText("Intro line.");
  // The raw row text must not be on screen at all — pre-fix it rendered as a paragraph reading
  // "| Name | Role |", which is what then got replaced by a <table> 300-365ms later.
  await expect(cmp).not.toContainText("Name");
  await expect(cmp.locator("table")).toHaveCount(0);
});

test("M1 streaming: once the delimiter row lands, the table paints as a TABLE (the hold releases)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="streaming">
      {M1_TABLE_SETTLED}
    </Markdown>,
  );
  await expect(cmp.locator("table")).toBeVisible();
  await expect(cmp.locator("th").first()).toHaveText("Name");
  await expect(cmp.locator("td").first()).toHaveText("Ada");
});

test("M1 static: the SAME pipe prefix renders as authored (the pre-pass is streaming-only)", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {M1_PIPE_PREFIX}
    </Markdown>,
  );
  await expect(cmp).toContainText("Name");
});

test("M1 streaming: a message that is ONLY an ambiguous marker still paints (never a blank body)", async ({ mount }) => {
  // The floor that keeps the ghost bubble from collapsing and the caret from stranding: holding here
  // would leave the seal with an empty string, so the pre-pass stands down and a LEAF BLOCK still
  // mounts. (The marker's own glyph is consumed by Streamdown's emphasis repair, which is upstream of
  // this seal and unchanged — what this pins is that a block box survives for the caret to attach to.)
  const cmp = await mount(
    <Markdown trust="untrusted" mode="streaming">
      {M1_BARE_MARKER}
    </Markdown>,
  );
  await expect.poll(() => cmp.locator("p, ul, ol, h1, h2, h3, blockquote, pre").count()).toBeGreaterThan(0);
});

// ── M5 · code-block birth geometry ───────────────────────

const CODE_BLOCK = '[data-streamdown="code-block"]';
const M5_FENCE = "Intro line.\n\n```js\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```";
const M5_OFFSCREEN = `${"Filler paragraph.\n\n".repeat(120)}\`\`\`js\nconst a = 1;\nconst b = 2;\nconst c = 3;\n\`\`\``;

/** The in-page sampler's handle. An INTERSECTION with `typeof globalThis` so reading it back is one
 * assertion, not the `as unknown as` double-cast the no-test-fabrication gate (rightly) reds. */
type HeightProbe = typeof globalThis & { __csHeights: number[] };

test("M5: a mounting code block never overshoots its settled height", async ({ mount, page }) => {
  // page.evaluate, NOT addInitScript: the CT `page` fixture has already navigated to the harness by the
  // time a test body runs, so an init script never fires. The sampler must be installed before `mount`.
  await page.evaluate(() => {
    const heights: number[] = [];
    (globalThis as HeightProbe).__csHeights = heights;
    const tick = (): void => {
      const el = document.querySelector('[data-streamdown="code-block"]');
      if (el !== null) {
        heights.push(Math.round(el.getBoundingClientRect().height));
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
  const cmp = await mount(
    <Markdown trust="untrusted" mode="streaming">
      {M5_FENCE}
    </Markdown>,
  );
  await expect(cmp.locator("pre code")).toContainText("const c = 3;");
  await expect.poll(() => page.evaluate(() => (globalThis as HeightProbe).__csHeights.length)).toBeGreaterThan(20);
  const heights = await page.evaluate(() => (globalThis as HeightProbe).__csHeights);
  const settled = heights.at(-1) ?? 0;
  expect(settled).toBeGreaterThan(0);
  expect(Math.max(...heights) - settled).toBeLessThanOrEqual(4);
});

test("M5: an OFF-SCREEN code block is laid out at its content height, not a 200px placeholder", async ({ mount }) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="streaming">
      {M5_OFFSCREEN}
    </Markdown>,
  );
  const block = cmp.locator(CODE_BLOCK);
  await expect(block).toHaveCount(1);
  const box = await block.evaluate((el) => ({
    own: Math.round(el.getBoundingClientRect().height),
    children: Math.round([...el.children].reduce((sum, c) => sum + c.getBoundingClientRect().height, 0)),
  }));
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.children).toBeGreaterThan(0);
  // @orb-waive ct-no-oneshot-live-read-assert(expect): the preceding mount/action completed and this assertion intentionally compares one atomic rendered snapshot.
  expect(box.own).toBeLessThan(200);
});
