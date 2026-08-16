import {
  buildCardFrameCsp,
  buildCardFrameDocument,
  CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH,
  CARD_FRAME_MAX_HEIGHT_PX,
  CARD_FRAME_SAFE_FLOOR,
} from "@orb/kit/card-frame";
import { SandboxFrame } from "@orb/ui/sandbox-frame";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";

test("the SRCDOC FLOOR is sandboxed with NO allow-scripts and NO allow-same-origin", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>card</p>" title="card" />);
  const sandbox = await cmp.getAttribute("sandbox");
  expect(sandbox).not.toBeNull();
  expect(sandbox).not.toContain("allow-scripts");
  expect(sandbox).not.toContain("allow-same-origin");
});

test("the srcdoc carries the deny-by-default CSP", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" />);
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("Content-Security-Policy");
  expect(srcdoc).toContain("default-src 'none'");
  expect(srcdoc).not.toContain("connect-src");
});

test("FAIL-CLOSED: with no external-media verdict the frame CSP allows no https: media", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" />);
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("img-src 'self'; media-src 'self';");
  expect(srcdoc).not.toContain("https:");
});

test("allowExternalMedia widens EXACTLY img-src + media-src to https: — nothing else moves", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" allowExternalMedia={true} />);
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("img-src 'self' https:");
  expect(srcdoc).toContain("media-src 'self' https:");
  // The deny-by-default base + the no-exfil posture are untouched, and http: stays barred.
  expect(srcdoc).toContain("default-src 'none'");
  expect(srcdoc).not.toContain("connect-src");
  expect(srcdoc).not.toContain("script-src");
  expect(srcdoc).toContain("font-src 'self'");
  expect(srcdoc).not.toContain("http:");
});

test("a <script> inside the untrusted html does not reach the parent (sandboxed, scripts off)", async ({ mount, page }) => {
  const payload = ["<scr", "ipt>window.parent.__pwned=1</scr", "ipt>"].join("");
  await mount(<SandboxFrame html={`<p>hi</p>${payload}`} title="c" />);
  // scripts are disabled by the empty sandbox → the injected script can never run in the parent realm.
  const pwned = await page.evaluate(() => (globalThis as unknown as { __pwned?: number }).__pwned);
  expect(pwned).toBeUndefined();
});

// ── The TWO DELIVERIES ────────────────────────────────────────────────────────────────────────────────
// `src` = the ROUTED card-frame document (its own response CSP — the only arm a per-character trust grant
// can widen). Absent = the srcdoc FLOOR. They must never both be emitted: `srcdoc` WINS over `src` in the
// HTML spec, so a frame carrying both would silently render the floor while the code claims the door.

test("the ROUTED arm emits src and NO srcdoc — a frame carrying both would silently render the floor", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" src="/api/card-frame/0123456789abcdef0123456789abcdef" />);
  await expect(cmp).toHaveAttribute("src", "/api/card-frame/0123456789abcdef0123456789abcdef");
  await expect(cmp).toHaveAttribute("data-delivery", "routed");
  await expect.poll(() => cmp.getAttribute("srcdoc")).toBeNull();
});

test("the routed arm keeps the sandbox ATTRIBUTE too — belt-and-suspenders under the response's own sandbox directive", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" src="/api/card-frame/0123456789abcdef0123456789abcdef" />);
  // The 2026-08-16 tier-B pass (#91) grants EXACTLY `allow-scripts` on this arm — the whole value, not a
  // substring, so a silently-widened grant (`allow-forms`, `allow-popups`, `allow-top-navigation`) reds
  // here. `allow-same-origin` is the one that must never appear: with scripts it lets the frame reach the
  // app origin and remove its own sandbox.
  await expect(cmp).toHaveAttribute("sandbox", "allow-scripts");
});

test("no src ⇒ the srcdoc FLOOR, marked as such", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" />);
  await expect(cmp).toHaveAttribute("data-delivery", "srcdoc");
  await expect.poll(() => cmp.getAttribute("src")).toBeNull();
});

test("render-on-complete: incomplete shows a skeleton, not the frame", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" complete={false} />);
  await expect(cmp).toHaveAttribute("data-slot", "sandbox-frame-skeleton");
  await expect.poll(() => cmp.evaluate((el) => el.tagName.toLowerCase())).not.toBe("iframe");
});

test("an unstyled card lands in the theme: the srcdoc carries a token-driven base body rule", async ({ mount }) => {
  const cmp = await mount(
    <SandboxFrame html="<p>bare</p>" title="bare" themeTokens={{ "--sandbox-bg": "#101010", "--sandbox-fg": "#eeeeee" }} fontFamily="Geist, sans-serif" />,
  );
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  // The body USES the injected surface/text vars (not browser-default white/serif) and the UI font list.
  expect(srcdoc).toContain("--sandbox-bg: #101010");
  expect(srcdoc).toContain("background: var(--sandbox-bg)");
  expect(srcdoc).toContain("color: var(--sandbox-fg)");
  expect(srcdoc).toContain("font-family: Geist, sans-serif");
});

test("a hostile fontFamily is dropped at the boundary; the base body falls back to sans-serif", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="x" fontFamily="Geist; } body { background: url(//evil) } /*" />);
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).not.toContain("url(//evil");
  expect(srcdoc).toContain("font-family: sans-serif");
});

// ── THE HEIGHT CHANNEL (2026-08-16 tier-B pass, #91) ─────────────────────────────────────────────────────
// Every card frame used to be a fixed 320px slab, so a short card left a ~195px void mid-transcript. The fix
// is the one capability `allow-scripts` was granted for: the ROUTED document runs ONE hash-pinned script
// that posts its content height, and this side clamps it. These tests serve the REAL kit bytes under the
// REAL kit policy, so they prove the hash actually matches in a browser — a thing no string assertion can.

const ROUTED_URL = "/api/card-frame/0123456789abcdef0123456789abcdef";
const PRE_MEASUREMENT_PX = 320;

/** Serve the routed card the way `entry/http/card-frame.ts` does: kit's document under kit's policy. */
async function serveRoutedCard(page: Page, html: string): Promise<void> {
  await page.route(ROUTED_URL, async (route) => {
    await route.fulfill({
      status: 200,
      headers: {
        "content-type": "text/html; charset=utf-8",
        "content-security-policy": buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document"),
      },
      body: buildCardFrameDocument({ html, css: undefined, themeTokens: undefined, fontFamily: undefined }),
    });
  });
}

const frameHeight = async (cmp: { boundingBox: () => Promise<{ height: number } | null> }): Promise<number> => (await cmp.boundingBox())?.height ?? 0;

/** Flush anything already queued (a `postMessage` task, the React re-render it triggers, the paint) without
 *  a timer: two animation frames are ordered after every task queued before them, so an assertion that
 *  NOTHING moved is deterministic rather than a race against a sleep. */
async function settle(page: Page): Promise<void> {
  await page.evaluate(
    async () =>
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            resolve();
          });
        });
      }),
  );
}

test("#91: a SHORT routed card measures itself and the frame drops BELOW the pre-measurement height", async ({ mount, page }) => {
  await serveRoutedCard(page, '<div style="height:120px">short</div>');
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="short card" src={ROUTED_URL} />);
  // The void is gone: the frame is the card's own height, not the 320px slab it was born at.
  await expect.poll(async () => frameHeight(cmp)).toBe(120);
});

test("an OVERSIZE self-report CLAMPS to the cap — unbounded growth is what the clamp exists for", async ({ mount, page }) => {
  await serveRoutedCard(page, '<div style="height:5000px">tall</div>');
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="tall card" src={ROUTED_URL} />);
  await expect.poll(async () => frameHeight(cmp)).toBe(CARD_FRAME_MAX_HEIGHT_PX);
});

test("SECURITY: a CARD-AUTHORED script is refused by the hash — it cannot execute, and it cannot drive the height", async ({ mount, page }) => {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  // The card tries both halves of the abuse: run code in the frame, and forge the height message.
  const cardScript = 'ipt>document.body.setAttribute("data-card-pwned","1");parent.postMessage({orbCardFrameHeight:5000},"*");</scr';
  const hostile = ['<div style="height:100px">card</div><scr', cardScript, "ipt>"].join("");
  await serveRoutedCard(page, hostile);
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="hostile card" src={ROUTED_URL} />);

  // OUR script's honest measurement lands; the forged 5000 never does (it would have clamped to the cap).
  // Ordering makes this deterministic rather than a race: a card's inline script would run during PARSE,
  // ours only at DOMContentLoaded — so a 5000 that was ever going to arrive arrives FIRST, and the
  // grow-only fold would make it permanent. Seeing 100 at all is the proof.
  await expect.poll(async () => frameHeight(cmp)).toBe(100);
  await settle(page);
  expect(await frameHeight(cmp)).toBe(100);

  // The CSP-block receipt, verbatim from Chromium: "Executing inline script violates the following Content
  // Security Policy directive 'script-src 'sha256-<ours>''" — and the card's own digest is offered as the
  // hash that WOULD be required, which is exactly the allowance we did not give it.
  const refusal = errors.find((line) => line.includes("violates the following Content Security Policy directive"));
  expect(refusal).toBeDefined();
  expect(refusal).toContain(CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH.replaceAll("'", ""));
  expect(refusal).toContain("The action has been blocked.");
  const contentFrame = await (await cmp.elementHandle())?.contentFrame();
  if (contentFrame === null || contentFrame === undefined) {
    throw new Error("routed iframe has no content frame — the navigation never completed");
  }
  // Inside the frame's own realm: the card body PARSED (so the absence below is about execution, not about
  // a document that never loaded) and the card script's DOM side effect never happened.
  await expect(contentFrame.locator("div")).toHaveText("card");
  await expect(contentFrame.locator("body")).not.toHaveAttribute("data-card-pwned", "1");
});

test("SECURITY: a height message from ANOTHER window is ignored — the sender is authenticated by window identity", async ({ mount, page }) => {
  await serveRoutedCard(page, '<div style="height:100px">card</div>');
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="card" src={ROUTED_URL} />);
  await expect.poll(async () => frameHeight(cmp)).toBe(100);

  // Same payload, same shape, different sender (the top window — an extension, another frame, our own app
  // code). `event.origin` cannot tell these apart from the frame: every sandboxed sender reports "null".
  await page.evaluate(() => {
    window.postMessage({ orbCardFrameHeight: 700 }, "*");
  });
  await settle(page);
  expect(await frameHeight(cmp)).toBe(100);
});

test("the SRCDOC FLOOR does not self-measure — it is script-dead, so the caller's height stands", async ({ mount, page }) => {
  const cmp = await mount(<SandboxFrame html='<div style="height:60px">short</div>' title="floor" />);
  await settle(page);
  expect(await frameHeight(cmp)).toBe(PRE_MEASUREMENT_PX);
});

// An iframe is focusable, so it sits in the tab order and its `title` IS the accessible name announced
// there — the card's own title, and never nothing.

test("the frame is NAMED in the tab order — the card's title is the iframe's accessible name", async ({ mount }) => {
  await expect(await mount(<SandboxFrame html="<p>x</p>" title="The Watcher" />)).toHaveAttribute("title", "The Watcher");
});

test("a caller that hands us an EMPTY title still ships a named frame, not an anonymous one", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="" />);
  expect(((await cmp.getAttribute("title")) ?? "").length).toBeGreaterThan(0);
});

test("hostile themeTokens are dropped at the boundary, not smuggled into the srcdoc", async ({ mount }) => {
  const cmp = await mount(
    <SandboxFrame
      html="<p>x</p>"
      title="x"
      themeTokens={{
        "--accent": "url(//evil.test/x.png)",
        "--evil": "red; } </style><script>window.__pwned=1</script>",
        "not-a-custom-prop": "#336699",
        "--safe": "#336699",
      }}
    />,
  );
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).not.toContain("url(//evil");
  expect(srcdoc).not.toContain("<script>");
  expect(srcdoc).not.toContain("not-a-custom-prop");
  expect(srcdoc).toContain("--safe: #336699");
});
