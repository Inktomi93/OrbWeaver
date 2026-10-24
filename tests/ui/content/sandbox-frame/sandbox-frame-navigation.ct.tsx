// Where a card document can navigate. The embedding page carries the policy the production security headers serve and
// the frame carries the card document the production serve route sends, so every refusal is the browser enforcing
// served bytes. Each refusal sits beside a control that proves the probe can see a navigation at all.
import { CARD_FRAME_SANDBOX } from "@orb/kit/card-frame";
import { expect } from "@orb/testkit/ct-corpus";
import type { Page, Route } from "@playwright/test";
import type { FrameRoom, ServedFrame } from "./_served-frame.ts";
import { routeServedFrame, test } from "./_served-frame.ts";

const PARENT_URL = "/__sandbox-frame-parent";
const EXTERNAL_URL = "https://navigation-external.test/landing";
const SAME_ORIGIN_URL = "/__sandbox-frame-same-origin";
const BARRIER_URL = "/__sandbox-frame-barrier";
const APP_FRAME_SOURCE = "frame-src 'self'";

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

/** A navigation that was going to happen has had time to happen: the barrier request is ordered after anything queued before it. */
async function settleNavigation(page: Page): Promise<void> {
  await settle(page);
  await page.evaluate(async (url: string) => {
    await fetch(url).catch(() => undefined);
  }, BARRIER_URL);
  await settle(page);
}

/** Serve the embedding page under `parentPolicy` around the served card, and record every navigation target requested. */
async function openProbe(page: Page, served: ServedFrame, parentPolicy: string): Promise<string[]> {
  const hits: string[] = [];
  await routeServedFrame(page, served);
  await page.route(`**${PARENT_URL}`, async (route) => {
    await route.fulfill({
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8", "content-security-policy": parentPolicy },
      body: `<!doctype html><html><body><iframe id="card" sandbox="${CARD_FRAME_SANDBOX.document}" src="${served.url}" style="width:300px;height:200px"></iframe></body></html>`,
    });
  });
  const land = async (route: Route): Promise<void> => {
    hits.push(route.request().url());
    await route.fulfill({ status: 200, contentType: "text/html", body: "<p>landed</p>" });
  };
  await page.route("https://navigation-external.test/**", land);
  await page.route(`**${SAME_ORIGIN_URL}*`, land);
  await page.route(`**${BARRIER_URL}*`, async (route) => {
    await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
  });
  await page.goto(PARENT_URL);
  return hits;
}

/** The app policy with frames allowed anywhere: the single directive that decides where a frame may navigate, widened. */
async function widenedFramePolicy(room: FrameRoom): Promise<string> {
  const policy = await room.appPolicy();
  if (!policy.includes(APP_FRAME_SOURCE)) {
    throw new Error("the served app policy no longer names frame-src 'self'");
  }
  return policy.replace(APP_FRAME_SOURCE, "frame-src *");
}

test("control: with the embedder's frame-src widened a card link navigates the frame off-origin", async ({ room, page }) => {
  const hits = await openProbe(page, await room.serve(`<a href="${EXTERNAL_URL}">go</a>`, null), await widenedFramePolicy(room));
  await page.frameLocator("#card").getByRole("link", { name: "go" }).click();
  await settleNavigation(page);
  expect(hits).toContain(EXTERNAL_URL);
});

test("control: under the served app policy a same-origin self-navigation still lands", async ({ room, page }) => {
  const hits = await openProbe(page, await room.serve(`<a href="${SAME_ORIGIN_URL}">go</a>`, null), await room.appPolicy());
  await page.frameLocator("#card").getByRole("link", { name: "go" }).click();
  await settleNavigation(page);
  expect(hits.some((url) => url.includes(SAME_ORIGIN_URL))).toBe(true);
});

test("a card link navigating the frame off-origin is blocked by the served app policy", async ({ room, page }) => {
  const hits = await openProbe(page, await room.serve(`<a href="${EXTERNAL_URL}">go</a>`, null), await room.appPolicy());
  await page.frameLocator("#card").getByRole("link", { name: "go" }).click();
  await settleNavigation(page);
  expect(hits).toEqual([]);
});

test("a card link targeting the top window is blocked and the top document stays put", async ({ room, page }) => {
  const hits = await openProbe(page, await room.serve(`<a href="${EXTERNAL_URL}" target="_top">go</a>`, null), await room.appPolicy());
  await page.frameLocator("#card").getByRole("link", { name: "go" }).click();
  await settleNavigation(page);
  expect(hits).toEqual([]);
  expect(page.url()).toContain(PARENT_URL);
});

test("a card form submission is blocked even when the embedder's frame-src is open", async ({ room, page }) => {
  const served = await room.serve(`<form action="${EXTERNAL_URL}" method="get"><button type="submit">send</button></form>`, null);
  // Under the widened embedder policy the frame may go anywhere, so the card's sandbox (no allow-forms) and its own
  // form-action are what stand in the way; the first control shows the widened policy lets a link through.
  const hits = await openProbe(page, served, await widenedFramePolicy(room));
  await page.frameLocator("#card").getByRole("button", { name: "send" }).click();
  await settleNavigation(page);
  expect(hits).toEqual([]);
});

test("a card meta refresh off-origin is blocked, with no script involved", async ({ room, page }) => {
  const served = await room.serve(`<meta http-equiv="refresh" content="0;url=${EXTERNAL_URL}"><p>refreshing</p>`, null);
  const hits = await openProbe(page, served, await room.appPolicy());
  await settleNavigation(page);
  expect(hits).toEqual([]);
});

test("an interactive card runs its script and still reaches no top or popup navigation", async ({ room, page }) => {
  const code = [
    'document.body.setAttribute("data-card-ran","1");',
    `try{top.location.href=${JSON.stringify(`${EXTERNAL_URL}?via=top`)};}catch(e){}`,
    `try{window.open(${JSON.stringify(`${EXTERNAL_URL}?via=open`)});}catch(e){}`,
  ].join("");
  const served = await room.serve(`<p>lab</p><script>${code}</script>`);
  expect(served.granted.interactive).toBe(true);
  const hits = await openProbe(page, served, await room.appPolicy());
  // The marker proves the script ran, so the empty hit list is about navigation and not a dead script.
  await expect(page.frameLocator("#card").locator("body")).toHaveAttribute("data-card-ran", "1");
  await settleNavigation(page);
  expect(hits).toEqual([]);
  expect(page.url()).toContain(PARENT_URL);
});

test("an interactive card's script-driven self navigation off-origin is refused like the link", async ({ room, page }) => {
  const served = await room.serve(`<p>lab</p><script>location.href=${JSON.stringify(`${EXTERNAL_URL}?via=self`)};</script>`);
  const hits = await openProbe(page, served, await room.appPolicy());
  await settleNavigation(page);
  expect(hits).toEqual([]);
  // Chromium leaves a CSP-refused frame navigation at an empty about:blank rather than at the card.
  await expect(page.frameLocator("#card").locator("body")).toBeEmpty();
});

test("an interactive card's meta refresh is refused exactly as under the static posture", async ({ room, page }) => {
  const served = await room.serve(`<meta http-equiv="refresh" content="0;url=${EXTERNAL_URL}"><p>refreshing</p>`);
  expect(served.granted.interactive).toBe(true);
  const hits = await openProbe(page, served, await room.appPolicy());
  await settleNavigation(page);
  expect(hits).toEqual([]);
});
