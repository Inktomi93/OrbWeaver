import {
  buildCardFrameCsp,
  buildCardFrameDocument,
  CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH,
  CARD_FRAME_MAX_HEIGHT_PX,
  CARD_FRAME_SAFE_FLOOR,
  CARD_FRAME_SANDBOX,
} from "@orb/kit/card-frame";
import { SandboxFrame } from "@orb/ui/sandbox-frame";
import { expect, test } from "@playwright/experimental-ct-react";
import type { Page, Route } from "@playwright/test";

test("the SRCDOC FLOOR is sandboxed with NO allow-scripts and NO allow-same-origin", async ({ mount }) => {
  const cmp = await mount(<SandboxFrame html="<p>card</p>" title="card" />);
  await expect.poll(async () => await cmp.getAttribute("sandbox")).not.toBeNull();
  await expect.poll(async () => await cmp.getAttribute("sandbox")).not.toContain("allow-scripts");
  await expect.poll(async () => await cmp.getAttribute("sandbox")).not.toContain("allow-same-origin");
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
  // @orb-waive no-test-fabrication(unknown): probing an untyped injection target on globalThis — not a fabricated domain value. Ends when this deliberate test boundary can be expressed without a fabricated typed value.
  await expect.poll(async () => await page.evaluate(() => (globalThis as unknown as { __pwned?: number }).__pwned)).toBeUndefined();
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

test("#799: the NON-COLOR slice reaches the document — a radius and the mono family land as resolvable vars", async ({ mount }) => {
  // The frame's injection was TWO colors + one font ("a two-color costume", stickler 2026-08-29 §1): a frame
  // could match the app's surface and its text and nothing else. These are the vars `isSafeColor` can never
  // carry, so they ride their own clamp — and the point of the pin is that they arrive RESOLVABLE inside the
  // null-origin document, where `var(--radius-base)` means nothing.
  const cmp = await mount(
    <SandboxFrame
      html="<p>x</p>"
      styleTokens={{ "--sandbox-radius": "0.5rem", "--sandbox-font-mono": "'Geist Mono', ui-monospace, monospace" }}
      themeTokens={{ "--sandbox-accent": "#f0a500", "--sandbox-border": "#333333", "--sandbox-muted": "#1a1a1a" }}
      title="x"
    />,
  );
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).toContain("--sandbox-radius: 0.5rem");
  expect(srcdoc).toContain("--sandbox-font-mono: 'Geist Mono', ui-monospace, monospace");
  // The widened COLOR slice rides the unchanged `isSafeColor` clamp — widening the slice is not widening it.
  expect(srcdoc).toContain("--sandbox-accent: #f0a500");
  expect(srcdoc).toContain("--sandbox-border: #333333");
  expect(srcdoc).toContain("--sandbox-muted: #1a1a1a");
});

test("#799: the two clamps stay DISJOINT — a hostile non-color value is dropped, and a color cannot ride the style slot", async ({ mount }) => {
  const cmp = await mount(
    <SandboxFrame
      html="<p>x</p>"
      styleTokens={{
        "--sandbox-radius": "8px} </style><script>window.__pwned=1</script>",
        "--calc": "calc(100% - 2px)",
        "--fetch": "url(//evil.test/x.png)",
        // A COLOR in the non-color slot: refused here, because the two grammars do not overlap. If a future
        // edit collapsed them into one weaker predicate, this line is what reds.
        "--sandbox-accent": "#336699",
        "--ok": "12px",
      }}
      title="x"
    />,
  );
  const srcdoc = (await cmp.getAttribute("srcdoc")) ?? "";
  expect(srcdoc).not.toContain("__pwned");
  expect(srcdoc).not.toContain("url(//evil");
  expect(srcdoc).not.toContain("calc(");
  expect(srcdoc).not.toContain("--sandbox-accent");
  // The positive control: the clamp is not simply dropping everything.
  expect(srcdoc).toContain("--ok: 12px");
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
        "content-security-policy": buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static"),
      },
      body: buildCardFrameDocument({ html, css: undefined, themeTokens: undefined, styleTokens: undefined, fontFamily: undefined }),
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

// ══ #111 LEG 2 — CAN A ROUTED CARD DOCUMENT NAVIGATE ITSELF OR THE TOP? (the tierB review's one
//    unverified control) ═══════════════════════════════════════════════════════════════════════════════
//
// The question leg 3 needs answered before it grants card-authored scripts: with `sandbox allow-scripts`
// (no `allow-top-navigation`, no `allow-popups`, no `allow-forms`, never `allow-same-origin`), the card
// document's own `default-src 'none'` policy, and the APP document's `default-src 'self'` above it — what
// navigation can a card actually perform?
//
// MEASURED, not reasoned. The setup is the real one: a PARENT document served with the app's own
// navigation-relevant directives, framing the REAL kit card document under the REAL kit policy. The frame
// is the same `sandbox` value `CARD_FRAME_SANDBOX.document` carries. Every off-origin target is routed, so
// "did it navigate" is a request that either arrives or does not — never an inference from a screenshot.
//
// The last two tests run the INTERACTIVE posture. When leg 2 measured them that policy was a lab string
// built in this file; since the leg-3 security pass it is the SHIPPED policy, so they now build it from
// `buildCardFrameCsp(…, "interactive")` and the measurement and the product are the same bytes.

const PARENT_URL = "/__leg2-card-parent";
const EXTERNAL_URL = "https://leg2-external.test/landing";
const SAME_ORIGIN_URL = "/__leg2-same-origin";
/** A routed same-origin no-op used only as the settle barrier (never counted as a navigation). */
const BARRIER_URL = "/__leg2-barrier";

/** The app document's policy, restricted to the directives that decide framing + navigation (mirrors
 *  `entry/http/security-headers.ts`'s prod arm: `default-src 'self'`, no `frame-src`, so frames fall back
 *  to `'self'`; `form-action 'self'`; `base-uri 'self'`; `object-src 'none'`). */
const APP_PARENT_CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'self'; form-action 'self'; object-src 'none'";

/** The SHIPPED interactive policy (#111 leg 3). Was a lab string built by string-replace in leg 2; it is
 *  the engine's own output now, so every navigation negative below is measured against the real bytes. */
const INTERACTIVE_CARD_CSP = buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "interactive");

/** The CONTROL parent policy: identical except that frames may navigate anywhere. If a vector lands here
 *  and not under {@link APP_PARENT_CSP}, the app's `default-src 'self'` is what stopped it — and if it
 *  lands under NEITHER, the instrument is broken and the negative means nothing. */
const OPEN_PARENT_CSP = "default-src 'self'; frame-src *; script-src 'self'; style-src 'self' 'unsafe-inline'";

interface NavProbe {
  /** Off-origin + same-origin navigation targets that were actually REQUESTED. */
  readonly hits: string[];
}

interface NavProbeSpec {
  readonly cardHtml: string;
  readonly cardCsp: string;
  /** The EMBEDDING document's policy. Defaults to the app's. */
  readonly parentCsp?: string;
}

/** Serve the parent (app-policied by default) + the card document, and record every navigation target that
 *  lands. The iframe carries exactly the sandbox value the production frame does. */
async function serveNavProbe(page: Page, spec: NavProbeSpec): Promise<NavProbe> {
  const hits: string[] = [];
  await page.route(`${PARENT_URL}*`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": spec.parentCsp ?? APP_PARENT_CSP },
      body: `<!doctype html><html><body><iframe id="card" sandbox="${CARD_FRAME_SANDBOX.document}" src="${ROUTED_URL}" style="width:300px;height:200px"></iframe></body></html>`,
    });
  });
  await page.route(ROUTED_URL, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": spec.cardCsp },
      body: buildCardFrameDocument({ html: spec.cardHtml, css: undefined, themeTokens: undefined, styleTokens: undefined, fontFamily: undefined }),
    });
  });
  const land = async (route: Route): Promise<void> => {
    hits.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "<p>landed</p>" });
  };
  await page.route("https://leg2-external.test/**", land);
  await page.route(`${SAME_ORIGIN_URL}*`, land);
  await page.route(`${BARRIER_URL}*`, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
  await page.goto(PARENT_URL);
  return { hits };
}

/** Give a navigation that WAS going to happen time to happen, so an empty `hits` is a REAL negative rather
 *  than a race won. Two rAFs drain the queued tasks, then a same-origin round trip from the parent forces
 *  the network stack to have processed anything the attempt queued before it — a happens-after barrier, not
 *  a sleep. */
async function settleNavigation(page: Page): Promise<void> {
  await settle(page);
  await page.evaluate(async (url: string) => {
    await fetch(url).catch(() => undefined);
  }, BARRIER_URL);
  await settle(page);
}

const STATIC_CARD_CSP = buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "document", "static");

// ── The two POSITIVE CONTROLS. Every negative below is only worth what these are worth: one proves the
//    recorder + the click path fire at all, the other proves the block is about the app's CSP and not about
//    our instrument being unable to navigate anything, ever.

test("LEG 2 control — the instrument CAN see a frame self-navigation (parent policy widened to frame-src *)", async ({ page }) => {
  const probe = await serveNavProbe(page, { cardHtml: `<a href="${EXTERNAL_URL}">go</a>`, cardCsp: STATIC_CARD_CSP, parentCsp: OPEN_PARENT_CSP });
  await page.frameLocator("#card").getByRole("link", { name: "go" }).click();
  await settleNavigation(page);
  // A sandboxed frame MAY navigate itself — the sandbox restricts TOP navigation, not self. So with the
  // embedder's frame-src open, the external request lands. This is what a negative below rules out.
  expect(probe.hits).toContain(EXTERNAL_URL);
});

test("LEG 2 control — under the APP policy a SAME-ORIGIN self-navigation still lands ('self' is allowed)", async ({ page }) => {
  const probe = await serveNavProbe(page, { cardHtml: `<a href="${SAME_ORIGIN_URL}">go</a>`, cardCsp: STATIC_CARD_CSP });
  await page.frameLocator("#card").getByRole("link", { name: "go" }).click();
  await settleNavigation(page);
  // The frame is not frozen: it navigates, to exactly the origin `default-src 'self'` names.
  expect(probe.hits.some((url) => url.includes(SAME_ORIGIN_URL))).toBe(true);
});

// ── THE MEASUREMENT (Chromium 1.61 via playwright-ct, 2026-08-16). Recorded in `@orb/kit/card-frame`.

test("LEG 2 — a card link navigating the FRAME off-origin is BLOCKED by the app's default-src 'self'", async ({ page }) => {
  const probe = await serveNavProbe(page, { cardHtml: `<a href="${EXTERNAL_URL}">go</a>`, cardCsp: STATIC_CARD_CSP });
  await page.frameLocator("#card").getByRole("link", { name: "go" }).click();
  await settleNavigation(page);
  // The EMBEDDER's policy governs where its frame may navigate, whoever initiates the navigation: with no
  // `frame-src`, `default-src 'self'` is what the card document's own navigation is checked against.
  expect(probe.hits).toEqual([]);
});

test("LEG 2 — a card link targeting _TOP is BLOCKED (the sandbox carries no allow-top-navigation)", async ({ page }) => {
  const probe = await serveNavProbe(page, { cardHtml: `<a href="${EXTERNAL_URL}" target="_top">go</a>`, cardCsp: STATIC_CARD_CSP });
  await page.frameLocator("#card").getByRole("link", { name: "go" }).click();
  await settleNavigation(page);
  // Two independent belts: the sandbox refuses top navigation, and the app policy refuses the destination.
  expect(probe.hits).toEqual([]);
  expect(page.url()).toContain(PARENT_URL);
});

test("LEG 2 — a card FORM submission is BLOCKED (form-action 'none' on the card's own policy)", async ({ page }) => {
  const probe = await serveNavProbe(page, {
    cardHtml: `<form action="${EXTERNAL_URL}" method="get"><button type="submit">send</button></form>`,
    cardCsp: STATIC_CARD_CSP,
  });
  await page.frameLocator("#card").getByRole("button", { name: "send" }).click();
  await settleNavigation(page);
  expect(probe.hits).toEqual([]);
});

test("LEG 2 — a card META REFRESH off-origin is BLOCKED (and it needs no script, so it is a TODAY vector)", async ({ page }) => {
  const probe = await serveNavProbe(page, {
    cardHtml: `<meta http-equiv="refresh" content="0;url=${EXTERNAL_URL}"><p>refreshing</p>`,
    cardCsp: STATIC_CARD_CSP,
  });
  await settleNavigation(page);
  // Reachable with scripts OFF, so it is the same under both postures — the leg-3 grant enables nothing here.
  expect(probe.hits).toEqual([]);
});

// ── THE INTERACTIVE POSTURE, re-run against the SHIPPED policy (#111 leg 3). Split in two on purpose: a
//    script-driven SELF navigation blanks the frame to `about:blank` when Chromium refuses it, which would
//    race any in-document marker.

test("LEG 3 — the granted posture really RUNS card code, and its top/popup navigation is still refused", async ({ page }) => {
  const script = [
    "<scr",
    'ipt>document.body.setAttribute("data-lab-ran","1");',
    `try{top.location.href=${JSON.stringify(`${EXTERNAL_URL}?via=top`)};}catch(e){}`,
    `try{window.open(${JSON.stringify(`${EXTERNAL_URL}?via=open`)});}catch(e){}</scr`,
    "ipt>",
  ].join("");
  const probe = await serveNavProbe(page, { cardHtml: `<p>lab</p>${script}`, cardCsp: INTERACTIVE_CARD_CSP });
  // POSITIVE CONTROL: card-authored code executed under the lab grant (it cannot under today's policy — the
  // sibling hash test proves that), so the empty `hits` is about navigation, not about a dead script.
  await expect(page.frameLocator("#card").locator("body")).toHaveAttribute("data-lab-ran", "1");
  await settleNavigation(page);
  // `top` and `window.open` die on the sandbox: no `allow-top-navigation`, no `allow-popups`.
  expect(probe.hits).toEqual([]);
  expect(page.url()).toContain(PARENT_URL);
});

test("LEG 3 — a script-driven SELF navigation off-origin is refused exactly like the link is", async ({ page }) => {
  const script = ["<scr", `ipt>location.href=${JSON.stringify(`${EXTERNAL_URL}?via=self`)};</scr`, "ipt>"].join("");
  const probe = await serveNavProbe(page, { cardHtml: `<p>lab</p>${script}`, cardCsp: INTERACTIVE_CARD_CSP });
  await settleNavigation(page);
  // Nothing was fetched, and the refusal is visible in the frame: Chromium leaves a CSP-blocked frame
  // navigation at an empty `about:blank` document rather than at the card it was showing.
  expect(probe.hits).toEqual([]);
  await expect(page.frameLocator("#card").locator("body")).toBeEmpty();
  // SO: granting card scripts adds NO navigation reach a card does not already have with a plain link — the
  // embedder's `default-src 'self'` is the belt in both cases. That is the control #110 asked leg 3 for.
});

// ══ #111 LEG 3 — THE GRANT ITSELF, PER POSTURE ═════════════════════════════════════════════════════════
//
// The string assertions live in `tests/kit/card-frame/index.test.ts`; these are the BROWSER receipts, which
// are the only ones that can prove a policy does what its bytes say. Three things get proven here, each
// against the REAL engine output rather than a hand-written policy:
//   1. an INTERACTIVE card's own script RUNS (a DOM effect inside the frame, not an inference);
//   2. a TRUSTED (static-posture) card's script is REFUSED, with Chromium's own CSP line as the receipt
//      (the sibling "refused by the hash" test above, which is the static arm's proof and did not move);
//   3. the grant buys the card NOTHING else — no eval, no network, no worker, no nested frame, no remote
//      script — and the height channel it CAN now forge is still clamped.

/** Serve the routed card under an ARBITRARY policy, so a test can name the posture it is measuring. The
 *  document bytes are always the engine's (`buildCardFrameDocument`), so the height script is real. */
async function serveRoutedCardUnder(page: Page, html: string, csp: string): Promise<void> {
  await page.route(ROUTED_URL, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": csp },
      body: buildCardFrameDocument({ html, css: undefined, themeTokens: undefined, styleTokens: undefined, fontFamily: undefined }),
    });
  });
}

/** A card script that stamps the body — the positive control every negative in this block leans on. */
const CARD_MARK = ["<scr", 'ipt>document.body.setAttribute("data-card-ran","1");', "</scr", "ipt>"].join("");

test("LEG 3 GRANT — an INTERACTIVE card's own script RUNS: the DOM effect lands inside the frame", async ({ mount, page }) => {
  await serveRoutedCardUnder(page, `<div style="height:100px">card</div>${CARD_MARK}`, INTERACTIVE_CARD_CSP);
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="interactive card" src={ROUTED_URL} />);
  const frame = await (await cmp.elementHandle())?.contentFrame();
  if (frame === null || frame === undefined) {
    throw new Error("routed iframe has no content frame — the navigation never completed");
  }
  // THE grant receipt. Under the static posture this exact assertion fails (proven by the hash test above),
  // so the pair of them is the capability delta stated from both sides.
  await expect(frame.locator("body")).toHaveAttribute("data-card-ran", "1");
});

test("LEG 3 GRANT — our height script still measures under the grant, with no second allowance", async ({ mount, page }) => {
  // `'unsafe-inline'` REPLACES the hash, so the measurement script rides the grant rather than needing its
  // own source. If it ever stopped running here, an interactive card would silently regress to the 320px
  // slab #91 exists to kill — and no string assertion in the kit suite could see that.
  await serveRoutedCardUnder(page, '<div style="height:120px">short</div>', INTERACTIVE_CARD_CSP);
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="short interactive card" src={ROUTED_URL} />);
  await expect.poll(async () => frameHeight(cmp)).toBe(120);
});

test("LEG 3 — 'unsafe-inline' BESIDE the hash grants NOTHING: Chromium ignores it when a hash is present", async ({ mount, page }) => {
  // The measurement that decided the grant's SHAPE. CSP3: the keyword is skipped whenever the source list
  // carries a nonce- or hash-source. So `script-src 'unsafe-inline' 'sha256-…'` — the obvious "keep our
  // script AND allow theirs" spelling — refuses the card outright, and would have shipped a grant that read
  // live and did nothing. This is the fixture for that whole dead-opt-in class; it is built HERE precisely
  // because the engine must never emit it.
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  const bothCsp = STATIC_CARD_CSP.replace(`script-src ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`, `script-src 'unsafe-inline' ${CARD_FRAME_HEIGHT_SCRIPT_CSP_HASH}`);
  await serveRoutedCardUnder(page, `<div style="height:100px">card</div>${CARD_MARK}`, bothCsp);
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="both-sources card" src={ROUTED_URL} />);
  const frame = await (await cmp.elementHandle())?.contentFrame();
  if (frame === null || frame === undefined) {
    throw new Error("routed iframe has no content frame — the navigation never completed");
  }
  // The card body parsed (so this is about EXECUTION, not a document that never loaded)…
  await expect(frame.locator("div")).toHaveText("card");
  // …and the script did not run, even though 'unsafe-inline' is right there in the policy.
  await expect(frame.locator("body")).not.toHaveAttribute("data-card-ran", "1");
  // Chromium says why, in as many words. Quoting the browser is what makes this a measurement.
  const refusal = errors.find((line) => line.includes("violates the following Content Security Policy directive"));
  expect(refusal).toContain("'unsafe-inline' is ignored if either a hash or nonce value is present");
});

test("LEG 3 — the granted card can reach NOTHING new: no network, no eval, no worker, no nested frame, no remote script", async ({ mount, page }) => {
  // Every arm runs INSIDE the grant (the positive control below proves the script executed), so each `false`
  // is a real refusal rather than dead code. `default-src 'none'` is what closes the network family — there
  // is no `connect-src` in the policy on either posture, deliberately — and `script-src 'unsafe-inline'`
  // matches no URL, which is what refuses a remote script and a blob worker via the worker-src fallback.
  const probe = [
    "<scr",
    "ipt>window.__reach={};",
    'const t=(k,f)=>{try{f();window.__reach[k]="allowed";}catch(e){window.__reach[k]="refused:"+e.name;}};',
    't("eval",()=>{eval("1+1");});',
    't("newFunction",()=>{new Function("return 1")();});',
    't("blobWorker",()=>{new Worker(URL.createObjectURL(new Blob(["1"],{type:"text/javascript"})));});',
    't("cookie",()=>{void document.cookie;});',
    't("localStorage",()=>{void localStorage.length;});',
    't("parentDom",()=>{void parent.document.title;});',
    'fetch("https://leg3-exfil.test/x").then(()=>{window.__reach.fetch="allowed";},(e)=>{window.__reach.fetch="refused:"+e.name;});',
    'document.body.setAttribute("data-card-ran","1");</scr',
    "ipt>",
  ].join("");
  await serveRoutedCardUnder(page, `<p>reach</p>${probe}`, INTERACTIVE_CARD_CSP);
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="reach card" src={ROUTED_URL} />);
  const frame = await (await cmp.elementHandle())?.contentFrame();
  if (frame === null || frame === undefined) {
    throw new Error("routed iframe has no content frame — the navigation never completed");
  }
  await expect(frame.locator("body")).toHaveAttribute("data-card-ran", "1"); // the positive control
  await expect
    .poll(async () => await frame.evaluate(() => (globalThis as { __reach?: Record<string, string> }).__reach ?? {}))
    .toMatchObject({
      // No runtime code generation: the grant lets a card SHIP code, never BUILD it.
      eval: "refused:EvalError",
      newFunction: "refused:EvalError",
      // The opaque origin, which is what `sandbox` without `allow-same-origin` buys.
      cookie: "refused:SecurityError",
      localStorage: "refused:SecurityError",
      parentDom: "refused:SecurityError",
      // The exfil belt.
      fetch: "refused:TypeError",
    });
});

test("LEG 3 — an interactive card CAN forge the height message, and the clamp is what holds", async ({ mount, page }) => {
  // Under the static posture the hash refuses the forgery outright (the sibling test proves that). Under the
  // grant the card really does get to `postMessage`, so the clamp stops being defence-in-depth and becomes
  // THE defence: the worst a card buys itself is the cap, which it could already occupy with tall content.
  const forge = ["<scr", 'ipt>parent.postMessage({orbCardFrameHeight:99999},"*");</scr', "ipt>"].join("");
  await serveRoutedCardUnder(page, `<div style="height:100px">card</div>${forge}`, INTERACTIVE_CARD_CSP);
  const cmp = await mount(<SandboxFrame html="<p>x</p>" title="forging card" src={ROUTED_URL} />);
  await expect.poll(async () => frameHeight(cmp)).toBe(CARD_FRAME_MAX_HEIGHT_PX);
  await settle(page);
  expect(await frameHeight(cmp)).toBe(CARD_FRAME_MAX_HEIGHT_PX);
});

test("LEG 3 — meta refresh is unchanged by the grant: still refused, and it never needed a script", async ({ page }) => {
  // Re-run of the leg-2 today-vector under the GRANTED policy, because "the grant changes nothing here" is
  // a claim about the interactive posture and leg 2 only measured the static one.
  const probe = await serveNavProbe(page, {
    cardHtml: `<meta http-equiv="refresh" content="0;url=${EXTERNAL_URL}"><p>refreshing</p>`,
    cardCsp: INTERACTIVE_CARD_CSP,
  });
  await settleNavigation(page);
  expect(probe.hits).toEqual([]);
});
