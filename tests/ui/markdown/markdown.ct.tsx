// Seal-level CT for @orb/ui/markdown (Streamdown 2.5). The two trust policies + the capability
// surface the rebuild wired in full: the GFM singleTilde fix, the token-sourced Shiki plugin (RENDER
// proof here; the TOKENS-value proof is deterministic in shiki-plugin.test.ts), the KaTeX math plugin,
// the token-styled Mermaid (render-or-graceful-error), the trusted `<speaker>` literal passthrough,
// and the large-block guard, plus the STREAMING-mode goldens (unterminated fence / torn emphasis /
// mode diff / reduced-motion) in the second half of this file. The end-to-end torn-`<speaker>`
// hold-back (a consumer-level concern — `holdTornSpeaker` runs in the ghost row, not the seal) stays
// in tests/client/features/chat/components/ghost-message-row.ct.tsx.
import { Markdown } from "@orb/ui/markdown";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Locator } from "@playwright/test";

const ERROR_FALLBACK = "Content failed to render.";
/** Streamdown lazy-imports its highlighted code-block body; blocking that request reproduces the
 *  stale-deploy-hash chunk failure the seal's error boundary exists for. */
const LAZY_CODE_CHUNK = /highlighted-body/u;
const FENCED_TS = "```ts\nconst a = 1;\n```";
const COPY_CODE_BTN = /copy code/iu;
const DOWNLOAD_BTN = /download/iu;

test("untrusted: a <script> tag is stripped and never executes", async ({ mount, page }) => {
  let alerted = false;
  page.on("dialog", (d) => {
    alerted = true;
    void d.dismiss();
  });
  const tag = "script";
  const payload = `<${tag}>alert(1)</${tag}>`;
  const cmp = await mount(<Markdown trust="untrusted" mode="static">{`hello ${payload} world`}</Markdown>);
  await expect(cmp).toContainText("hello");
  await expect(cmp.locator("script")).toHaveCount(0);
  expect(alerted).toBe(false);
});

test("untrusted: an external image neither renders NOR prefetches (no img, no preload link)", async ({ mount, page }) => {
  const url = ["http://evil", ".test/pixel.png"].join("");
  const cmp = await mount(<Markdown trust="untrusted" mode="static">{`text ![x](${url}) more`}</Markdown>);
  await expect(cmp).toContainText("text");
  // img is dropped from the untrusted allowlist (D44 §12.3) — no <img> AND, critically, no
  // <link rel=preload as=image> exfil (Streamdown emits that for markdown images; verified).
  await expect(cmp.locator(`img[src*="evil.test"]`)).toHaveCount(0);
  await expect(page.locator(`link[href*="evil.test"]`)).toHaveCount(0);
});

test("untrusted: a javascript: link href is neutralized", async ({ mount }) => {
  const js = ["java", "script:alert(1)"].join("");
  const cmp = await mount(<Markdown trust="untrusted" mode="static">{`[click](${js})`}</Markdown>);
  await expect(cmp.locator(`a[href^="java"]`)).toHaveCount(0);
});

test("trusted: a GFM table renders", async ({ mount }) => {
  const md = "| a | b |\n| - | - |\n| 1 | 2 |";
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {md}
    </Markdown>,
  );
  await expect(cmp.locator("table")).toBeVisible();
});

test("gfm singleTilde:false — prose like 10~20°C is NOT struck through", async ({ mount }) => {
  // remark-gfm defaults singleTilde:true (a lone ~ starts strikethrough); the seal re-pins it false
  // (§11.6). The range text must survive with no <del>/line-through wrapping it.
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      The range is 10~20°C today.
    </Markdown>,
  );
  await expect(cmp).toContainText("10~20°C");
  // No strikethrough element swallowed the range (a single ~ must stay literal).
  await expect(cmp.locator("del")).toHaveCount(0);
  await expect(cmp.locator("s")).toHaveCount(0);
});

test("trusted: ~~real strikethrough~~ (double tilde) still works", async ({ mount }) => {
  // singleTilde:false disables only the LONE-tilde form; paired ~~…~~ strikethrough must remain.
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      This is ~~struck~~ text.
    </Markdown>,
  );
  await expect(cmp.getByText("struck")).toBeVisible();
  await expect.poll(() => cmp.locator('del, s, [data-streamdown="del"]').count()).toBeGreaterThan(0);
});

test("trusted: a fenced code block renders with the language header + copy/download controls", async ({ mount }) => {
  // The code block renders (text present) and the `controls` default (copy + download) is wired.
  const md = "```js\nconst answer = 42;\n```";
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {md}
    </Markdown>,
  );
  await expect(cmp.locator("pre code")).toContainText("const answer = 42;");
  await expect(cmp.getByRole("button", { name: COPY_CODE_BTN })).toBeVisible();
  await expect(cmp.getByRole("button", { name: DOWNLOAD_BTN })).toBeVisible();
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("trusted: a fenced code block is REAL Shiki-highlighted, not inert (D44 §12/UI-Gates §11.6)", async ({ mount }) => {
  // The regression this plugin fixes: Streamdown 2.5 dropped bundled Shiki, so an unwired `plugins.code`
  // renders every token at `--sdm-c:inherit` (no color ever written, verified empirically pre-fix — every
  // span shared one `text-[var(--sdm-c,inherit)]` with no inline `--sdm-c`). Assert the OPPOSITE — the
  // rendered token spans carry REAL per-token `--sdm-c`/`--shiki-dark` inline custom properties resolved
  // from `MARKDOWN_SHIKI_PLUGIN.highlight()` (the JS-regex engine + lazy grammar load complete well
  // inside the CT mount), not the single shared `inherit` fallback the un-highlighted state produces.
  const md = "```ts\nconst answer: number = 42;\n```";
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {md}
    </Markdown>,
  );
  const codeSpans = cmp.locator("pre code span");
  await expect(codeSpans.first()).toBeVisible();
  // Poll on the FINAL assertion directly (distinct real colors across tokens) rather than a two-step
  // "some color present" then "read colors" — `highlight()`'s callback re-render can land in more than
  // one paint, so reading colors in a separate step after only the FIRST non-empty poll can race a
  // still-settling render. The "keyword" token (`const`) and identifiers (`answer`) must land on
  // DIFFERENT colors — real scope-aware highlighting, not every token painted the same single hue.
  await expect
    .poll(
      async () =>
        codeSpans.evaluateAll((spans) => {
          const colors = spans.map((s) => s.style.getPropertyValue("--sdm-c").trim()).filter(Boolean);
          return new Set(colors).size;
        }),
      { timeout: 5000 },
    )
    .toBeGreaterThan(1);
});

test("trusted: inline math ($…$) renders a KaTeX element", async ({ mount }) => {
  // The KaTeX plugin (remark-math → rehype-katex) is wired via plugins.math. A rendered equation
  // produces a `.katex` container.
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {"Euler: $e^{i\\pi} + 1 = 0$ is neat."}
    </Markdown>,
  );
  await expect(cmp.locator(".katex").first()).toBeVisible();
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("trusted: a mermaid diagram renders OR degrades to the graceful token-styled error (never white-screens)", async ({ mount }) => {
  const md = "```mermaid\ngraph TD; A-->B;\n```";
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {md}
    </Markdown>,
  );
  // Either outcome is graceful: a rendered <svg> diagram, or the seal's <MermaidError> fallback.
  // What must NEVER happen is the seal-level error boundary (white-screen guard) firing.
  await expect(cmp.locator('svg, [data-slot="markdown-mermaid-error"]').first()).toBeVisible({
    timeout: 15_000,
  });
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("GUARDRAIL #54 — untrusted: a mermaid fence does NOT render a diagram (renders inert code)", async ({ mount }) => {
  // D44 §12.2 / #54: Mermaid renders arbitrary diagram DSL through a heavy lazy engine — an UNTRUSTED
  // ```mermaid fence must NOT become a diagram. The seal withholds the `mermaid` option under untrusted,
  // so the fence degrades to an inert Shiki code block: no rendered <svg> diagram, and the diagram DSL
  // survives as literal code text (proving it was NOT interpreted). Because the `mermaid` option is
  // withheld entirely, there is NO code path that can mount a diagram — so the absence assertions are
  // stable (nothing renders late).
  const md = "```mermaid\ngraph TD; A-->B;\n```";
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {md}
    </Markdown>,
  );
  // The literal DSL is present as code text (not consumed into a diagram) — the positive signal that the
  // fence rendered as a code block.
  await expect(cmp).toContainText("graph TD");
  // No mermaid DIAGRAM container is mounted (Streamdown tags a rendered diagram `data-streamdown="mermaid"`
  // / `"mermaid-block"`), and the seal's Mermaid error surface never fires. (A plain code block still has
  // its own copy/download ICON svgs — so we assert on the diagram container, not a blanket `svg` count.)
  await expect(cmp.locator('[data-streamdown="mermaid"]')).toHaveCount(0);
  await expect(cmp.locator('[data-streamdown="mermaid-block"]')).toHaveCount(0);
  await expect(cmp.locator('[data-slot="markdown-mermaid-error"]')).toHaveCount(0);
});

test("trusted: a complete <speaker> tag renders its NAME as literal text (allowedTags passthrough)", async ({ mount }) => {
  // allowedTags {speaker:[]} + literalTagContent lets a raw <speaker>NAME</speaker> that reaches the
  // renderer survive as a real element carrying literal NAME text (the streaming-path fallback; the
  // settled path consumes tags upstream in message-content.tsx).
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {"<speaker>Alice</speaker> waves."}
    </Markdown>,
  );
  await expect(cmp).toContainText("Alice");
  await expect(cmp).toContainText("waves");
  // The tag passed through as a real element (proving allowedTags, not just sanitize unwrapping).
  await expect.poll(() => cmp.locator("speaker").count()).toBeGreaterThan(0);
});

test("untrusted: a <speaker> tag is NOT granted element passthrough (no <speaker> element)", async ({ mount }) => {
  // The trusted-only passthrough must not leak to untrusted content — the internal marker gets no
  // special standing there (sanitize drops the unknown element; its text may remain, harmless).
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {"<speaker>Mallory</speaker> lurks."}
    </Markdown>,
  );
  await expect(cmp.locator("speaker")).toHaveCount(0);
});

test("large-block guard (issue 195): a pathologically large block skips Streamdown for a plain fallback", async ({ mount }) => {
  const huge = "a".repeat(25_000);
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {huge}
    </Markdown>,
  );
  await expect(cmp).toHaveAttribute("data-slot", "markdown-oversized");
  await expect.poll(() => cmp.evaluate((el) => el.tagName.toLowerCase())).toBe("pre");
  await expect(cmp).toContainText("aaaa");
});

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

// ── quoted-speech tinting (`colorQuotes`) ──────────────────────────────────────────────────────────
// The grammar itself is pinned deterministically in dialogue.test.ts; these prove the SEAL wiring —
// that the opt-in prop mounts the components override, that the span really resolves the scope's
// `--color-dialogue` (computed value, never the class string), and that OFF is the untouched render.
const DIALOGUE_SPAN = '[data-slot="dialogue"]';
const AZARAEL_LINE = "He doesn't look up from the ledger. “You're late,” he says, turning a page.";

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
      {AZARAEL_LINE}
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
      {AZARAEL_LINE}
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

// ── M1 · the tail-hold pre-pass (docs/design/streaming-shape-churn.md §2/§3 arm 1) ─────────────────
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

// ── M5 · code-block birth geometry (docs/design/streaming-shape-churn.md §5) ───────────────────────
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

// #1498 — THE ERROR BOUNDARY RETRIES. It wraps ONE message's `<Streamdown>` for that message's whole
// life, so a latched `failed` turned a single transient throw — the stale-hash lazy-chunk failure the
// boundary was built for — into a permanently dead message: "Content failed to render." for the rest of
// the session, over prose that renders fine. Blocking the lazy code-block chunk IS that failure.
test("a transient render failure does NOT kill the message: the next content retries", async ({ mount, page }) => {
  // `"aborted"`, never the default `"failed"`: chromium swaps in an error page for a failed request and
  // every later assertion would pass over a destroyed DOM.
  await page.route(LAZY_CODE_CHUNK, async (route) => await route.abort("aborted"));
  const cmp = await mount(
    <Markdown trust="untrusted" mode="streaming">
      {FENCED_TS}
    </Markdown>,
  );
  await expect(cmp.getByText(ERROR_FALLBACK)).toBeVisible();

  // The stream carries on, and the next delta must RENDER.
  await page.unroute(LAZY_CODE_CHUNK);
  await cmp.update(
    <Markdown trust="untrusted" mode="streaming">
      the stream carried on
    </Markdown>,
  );
  await expect(cmp.getByText("the stream carried on")).toBeVisible();
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});
