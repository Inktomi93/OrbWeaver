// Seal-level CT for @orb/ui/markdown — the trust policies, the external-media gate, trusted markup passthrough and the error boundary.
// The end-to-end torn-`<speaker>` hold-back stays in tests/legacy/client/features/chat/components/ghost-message-row.ct.tsx.

import { Markdown } from "@orb/ui/markdown";
import { expect, test } from "@playwright/experimental-ct-react";
import { ERROR_FALLBACK } from "./_support.ts";

/** Streamdown lazy-imports its highlighted code-block body; blocking that request reproduces the
 *  stale-deploy-hash chunk failure the seal's error boundary exists for. */
const LAZY_CODE_CHUNK = /highlighted-body/u;

const FENCED_TS = "```ts\nconst a = 1;\n```";

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

// A trusted row that forbids external media: the app CSP admits `https:` images whenever the box allows them,
// so the seal's own gate is what keeps this row's off-origin media from loading.
const TRACKER_HOST = "tracker.test";
const TRACKER_ROUTE = `https://${TRACKER_HOST}/**`;
const PIXEL_PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const OFF_ORIGIN_MEDIA = [
  `<img src="https://${TRACKER_HOST}/raw.png">`,
  `![md](https://${TRACKER_HOST}/md.png)`,
  `<img src="//${TRACKER_HOST}/protocol-relative.png">`,
  `<img src="/\\${TRACKER_HOST}/backslash.png">`,
  `<picture><source srcset="https://${TRACKER_HOST}/source.png"><img src="/own.png" alt="own"></picture>`,
].join("\n\n");

test("trusted, external media forbidden: off-origin media is dropped and never requested; an own-origin image stays", async ({ mount, page }) => {
  const requested: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes(TRACKER_HOST)) {
      requested.push(request.url());
    }
  });
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {OFF_ORIGIN_MEDIA}
    </Markdown>,
  );
  await expect(cmp.locator('img[alt="own"]')).toHaveCount(1);
  await expect(cmp.locator(`img[src*="${TRACKER_HOST}"]`)).toHaveCount(0);
  await expect(cmp.locator("source")).toHaveCount(0);
  expect(requested).toEqual([]);
});

test("trusted, external media allowed: the same off-origin image renders (positive control)", async ({ mount, page }) => {
  await page.route(TRACKER_ROUTE, (route) => route.fulfill({ contentType: "image/png", body: PIXEL_PNG }));
  const cmp = await mount(
    <Markdown trust="trusted" mode="static" allowExternalMedia={true}>
      {OFF_ORIGIN_MEDIA}
    </Markdown>,
  );
  await expect(cmp.locator(`img[src="https://${TRACKER_HOST}/raw.png"]`)).toHaveCount(1);
});

test("trusted: revoking external media on a settled body removes the off-origin image it already rendered", async ({ mount, page }) => {
  await page.route(TRACKER_ROUTE, (route) => route.fulfill({ contentType: "image/png", body: PIXEL_PNG }));
  const cmp = await mount(
    <Markdown trust="trusted" mode="static" allowExternalMedia={true}>
      {OFF_ORIGIN_MEDIA}
    </Markdown>,
  );
  await expect(cmp.locator(`img[src="https://${TRACKER_HOST}/raw.png"]`)).toHaveCount(1);
  await cmp.update(
    <Markdown trust="trusted" mode="static" allowExternalMedia={false}>
      {OFF_ORIGIN_MEDIA}
    </Markdown>,
  );
  await expect(cmp.locator(`img[src*="${TRACKER_HOST}"]`)).toHaveCount(0);
  await expect(cmp.locator('img[alt="own"]')).toHaveCount(1);
});

test("untrusted: a javascript: link href is neutralized", async ({ mount }) => {
  const js = ["java", "script:alert(1)"].join("");
  const cmp = await mount(<Markdown trust="untrusted" mode="static">{`[click](${js})`}</Markdown>);
  await expect(cmp.locator(`a[href^="java"]`)).toHaveCount(0);
});

// ── TRUSTED IS THE DEFAULT RENDER FOR EVERY CHARACTER ────────────────────────────────────────────────────
// Interactive cards are on by default (owner ruling) and the ladder makes interactive imply trusted, so the
// trusted policy below now renders every character's messages in the MAIN DOM. These pin the three things
// that keep that safe: a link can neither run script nor navigate the app, raw markup cannot execute, and a
// mermaid fence runs no diagram engine. (External images are the app document's CSP, pinned in
// tests/legacy/server/entry/http/security-headers.test.ts, not this seal.)

test("trusted: a javascript: link is blocked, and a raw link is a confirm-gated button that cannot navigate the app", async ({ mount, page }) => {
  const js = ["java", "script:alert(1)"].join("");
  const raw = '<a href="https://example.test/elsewhere" target="_self" rel="opener">raw link</a>';
  const cmp = await mount(<Markdown trust="trusted" mode="static">{`[click](${js}) and ${raw}`}</Markdown>);
  // No anchor of either link reaches the DOM: the script URL is blocked outright, and Streamdown's link
  // safety renders the raw link as a BUTTON, so its `target`/`rel` and its href never become a navigation.
  await expect(cmp.locator(`[href^="java"]`)).toHaveCount(0);
  await expect(cmp.locator('a[href="https://example.test/elsewhere"]')).toHaveCount(0);
  const link = cmp.getByRole("button", { name: "raw link" });
  await expect(link).toBeVisible();
  // A click opens the confirm and nothing else: the app does not navigate, and no tab opens until the reader
  // confirms.
  const before = page.url();
  let popups = 0;
  page.context().on("page", () => {
    popups += 1;
  });
  await link.click();
  await expect(page.locator('[data-streamdown="link-safety-modal"]')).toBeVisible();
  await expect(page.getByRole("button", { name: "Open link", exact: true })).toBeVisible();
  expect(page.url()).toBe(before);
  expect(popups).toBe(0);
});

test("trusted: raw markup cannot execute — no script, no inline handler, no inline style", async ({ mount, page }) => {
  let alerted = false;
  page.on("dialog", (d) => {
    alerted = true;
    void d.dismiss();
  });
  const tag = "script";
  const md = `<img src="/none.png" onerror="alert(1)"> <${tag}>alert(2)</${tag}> <div style="position:fixed;inset:0" onclick="alert(3)">cover</div>`;
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {md}
    </Markdown>,
  );
  await expect(cmp).toContainText("cover");
  await expect(cmp.locator("script")).toHaveCount(0);
  await expect(cmp.locator("[onerror], [onclick]")).toHaveCount(0);
  await expect(cmp.locator('div[style*="fixed"]')).toHaveCount(0);
  await cmp.getByText("cover").click();
  expect(alerted).toBe(false);
});

test("trusted: a mermaid fence runs no diagram engine — it renders as inert code", async ({ mount }) => {
  // The seal passes `plugins` with `code` and `math` only, and Streamdown mounts a diagram only through a
  // `plugins.mermaid` renderer, so the fence takes the code-block arm under BOTH policies. A future change
  // that wires a diagram engine reds here and owes a review of what that engine executes.
  const md = "```mermaid\ngraph TD; A-->B;\n```";
  const cmp = await mount(
    <Markdown trust="trusted" mode="static">
      {md}
    </Markdown>,
  );
  await expect(cmp).toContainText("graph TD");
  await expect(cmp.locator('[data-streamdown="mermaid"]')).toHaveCount(0);
  await expect(cmp.locator('[data-streamdown="mermaid-block"]')).toHaveCount(0);
  await expect(cmp.getByText(ERROR_FALLBACK)).toHaveCount(0);
});

test("GUARDRAIL #54 — untrusted: a mermaid fence does NOT render a diagram (renders inert code)", async ({ mount }) => {
  // D44 §12.2 / #54: a diagram engine renders arbitrary DSL through a heavy lazy chunk, so an UNTRUSTED
  // ```mermaid fence must NOT become a diagram. The seal supplies no `plugins.mermaid`, so the fence
  // degrades to an inert Shiki code block: no rendered <svg> diagram, and the diagram DSL survives as
  // literal code text (proving it was NOT interpreted). With no diagram plugin there is NO code path that
  // can mount a diagram, so the absence assertions are stable (nothing renders late).
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
  // / `"mermaid-block"`). (A plain code block still has its own copy/download ICON svgs — so we assert on
  // the diagram container, not a blanket `svg` count.)
  await expect(cmp.locator('[data-streamdown="mermaid"]')).toHaveCount(0);
  await expect(cmp.locator('[data-streamdown="mermaid-block"]')).toHaveCount(0);
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
