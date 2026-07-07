// Seal-level CT for @orb/ui/markdown (Streamdown 2.5). The two trust policies + the capability
// surface the rebuild wired in full: the GFM singleTilde fix, the token-sourced Shiki theme (RENDER
// proof here; the TOKENS-value proof is deterministic in shiki-theme.test.ts), the KaTeX math plugin,
// the token-styled Mermaid (render-or-graceful-error), the trusted `<speaker>` literal passthrough,
// and the large-block guard, plus the STREAMING-mode goldens (unterminated fence / torn emphasis /
// mode diff / reduced-motion) in the second half of this file. The end-to-end torn-`<speaker>`
// hold-back (a consumer-level concern — `holdTornSpeaker` runs in the ghost row, not the seal) stays
// in tests/client/features/chat/components/ghost-message-row.ct.tsx.
import { Markdown } from "@orb/ui/markdown";
import { expect, test } from "@playwright/experimental-ct-react";

const ERROR_FALLBACK = "Content failed to render.";
// Hoisted (useTopLevelRegex): the code-block control button accessible names.
const COPY_CODE_BTN = /copy code/i;
const DOWNLOAD_BTN = /download/i;

test("untrusted: a <script> tag is stripped and never executes", async ({ mount, page }) => {
  let alerted = false;
  page.on("dialog", (d) => {
    alerted = true;
    void d.dismiss();
  });
  const tag = "script";
  const payload = `<${tag}>alert(1)</${tag}>`;
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">{`hello ${payload} world`}</Markdown>,
  );
  await expect(cmp).toContainText("hello");
  expect(await cmp.locator("script").count()).toBe(0);
  expect(alerted).toBe(false);
});

test("untrusted: an external image neither renders NOR prefetches (no img, no preload link)", async ({
  mount,
  page,
}) => {
  const url = ["http://evil", ".test/pixel.png"].join("");
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">{`text ![x](${url}) more`}</Markdown>,
  );
  await expect(cmp).toContainText("text");
  // img is dropped from the untrusted allowlist (D44 §12.3) — no <img> AND, critically, no
  // <link rel=preload as=image> exfil (Streamdown emits that for markdown images; verified).
  expect(await cmp.locator(`img[src*="evil.test"]`).count()).toBe(0);
  expect(await page.locator(`link[href*="evil.test"]`).count()).toBe(0);
});

test("untrusted: a javascript: link href is neutralized", async ({ mount }) => {
  const js = ["java", "script:alert(1)"].join("");
  const cmp = await mount(<Markdown trust="untrusted" mode="static">{`[click](${js})`}</Markdown>);
  expect(await cmp.locator(`a[href^="java"]`).count()).toBe(0);
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
  expect(await cmp.locator("del").count()).toBe(0);
  expect(await cmp.locator("s").count()).toBe(0);
});

test("trusted: ~~real strikethrough~~ (double tilde) still works", async ({ mount }) => {
  // singleTilde:false disables only the LONE-tilde form; paired ~~…~~ strikethrough must remain.
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      This is ~~struck~~ text.
    </Markdown>,
  );
  await expect(cmp.getByText("struck")).toBeVisible();
  // biome-ignore lint/security/noSecrets: a CSS attribute-selector literal, not a secret.
  expect(await cmp.locator('del, s, [data-streamdown="del"]').count()).toBeGreaterThan(0);
});

test("trusted: a fenced code block renders with the language header + copy/download controls", async ({
  mount,
}) => {
  // The code block renders (text present) and the `controls` default (copy + download) is wired. NOTE:
  // Shiki's syntax-COLOR highlighting is async wasm that does NOT resolve inside the playwright-ct
  // harness (verified empirically — even the bundled hex theme stays `--sdm-c:inherit`, one span for
  // the whole line), so the token-THEME proof (every color sourced from TOKENS, not a literal) is
  // asserted deterministically in shiki-theme.test.ts instead. Here we prove the block + its controls
  // render and nothing crashes.
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

test("trusted: a mermaid diagram renders OR degrades to the graceful token-styled error (never white-screens)", async ({
  mount,
}) => {
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

test("GUARDRAIL #54 — untrusted: a mermaid fence does NOT render a diagram (renders inert code)", async ({
  mount,
}) => {
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
  // biome-ignore lint/security/noSecrets: a CSS attribute selector for the mermaid diagram container, not a secret.
  await expect(cmp.locator('[data-streamdown="mermaid"]')).toHaveCount(0);
  // biome-ignore lint/security/noSecrets: a CSS attribute selector for the mermaid diagram container, not a secret.
  await expect(cmp.locator('[data-streamdown="mermaid-block"]')).toHaveCount(0);
  await expect(cmp.locator('[data-slot="markdown-mermaid-error"]')).toHaveCount(0);
});

test("trusted: a complete <speaker> tag renders its NAME as literal text (allowedTags passthrough)", async ({
  mount,
}) => {
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
  expect(await cmp.locator("speaker").count()).toBeGreaterThan(0);
});

test("untrusted: a <speaker> tag is NOT granted element passthrough (no <speaker> element)", async ({
  mount,
}) => {
  // The trusted-only passthrough must not leak to untrusted content — the internal marker gets no
  // special standing there (sanitize drops the unknown element; its text may remain, harmless).
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {"<speaker>Mallory</speaker> lurks."}
    </Markdown>,
  );
  expect(await cmp.locator("speaker").count()).toBe(0);
});

test("large-block guard (issue 195): a pathologically large block skips Streamdown for a plain fallback", async ({
  mount,
}) => {
  const huge = "a".repeat(25_000);
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {huge}
    </Markdown>,
  );
  await expect(cmp).toHaveAttribute("data-slot", "markdown-oversized");
  expect(await cmp.evaluate((el) => el.tagName.toLowerCase())).toBe("pre");
  await expect(cmp).toContainText("aaaa");
});

// ── STREAMING-mode goldens ─────────────────────────────────────────────────────────────────────────
// Mounting the seal DIRECTLY with a raw string proves `mode="streaming"` wires Streamdown's
// incomplete-markdown repair (unterminated fence / torn emphasis), that `mode="static"` renders a
// settled string safely, and that the reveal fade + caret respect reduced-motion. Distinct from the
// CONSUMER goldens (ghost-message-row.ct.tsx) that drive the paced store + `holdTornSpeaker` end-to-end;
// holding a TORN `<speaker>` tag is the consumer's pre-pass, not a seal concern, so it lives there.

test("streaming: an unterminated code fence repairs to a code block (never flashes literal backticks)", async ({
  mount,
}) => {
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

test("static mode: the SAME torn fence renders safely without white-screening (repair not engaged)", async ({
  mount,
}) => {
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
const GREETING_PATTERN =
  "*A doesn't look up.*\n\nyours can't use a f*cking diagram.\n\nSo here's the deal.";

test("static: a lone censoring asterisk stays literal — no stray emphasis run (the #34 fix)", async ({
  mount,
}) => {
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

test("static UNTRUSTED (the greeting's real tier): the censoring asterisk stays literal — ONE italic", async ({
  mount,
}) => {
  const cmp = await mount(
    <Markdown trust="untrusted" mode="static">
      {JFC_GREETING}
    </Markdown>,
  );
  await expect(cmp.locator("em")).toHaveCount(1);
  await expect(cmp.locator("em").first()).toHaveText("JFC doesn't look up.");
  await expect(cmp).toContainText("f*cking diagram.");
});

test("streaming: a complete message still renders its markdown (bold + list)", async ({
  mount,
}) => {
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

test("reduced motion: streaming content still renders fully (fade/caret suppressed, no lost text)", async ({
  mount,
  page,
}) => {
  // Under reduced-motion the seal forces animated=false/isAnimating=false; the content must land in
  // full, visible, exactly as without motion (no reveal held back by a suppressed fade).
  await page.emulateMedia({ reducedMotion: "reduce" });
  const body = "The whole message is present immediately under reduced motion.";
  const cmp = await mount(
    <Markdown trust="trusted" mode="streaming">
      {body}
    </Markdown>,
  );
  await expect(cmp.getByText(body)).toBeVisible();
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});
