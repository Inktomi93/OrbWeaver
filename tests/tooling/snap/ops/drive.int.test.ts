// Navigation keeps the first document's verdict; a later healthy document cannot erase its failure.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { FROZEN_AT_MS } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/tooling";
import { chromium, devices } from "@playwright/test";
import { MOBILE_DEVICE } from "../../../../tooling/src/floor/browser/browser-environment.ts";
import { registerStageRunBinding, takeStageOutcome } from "../../../../tooling/src/snap/lib/stage-run-binding.ts";
import { navigate } from "../../../../tooling/src/snap/ops/drive.ts";
import { driveActions } from "../../../../tooling/src/snap/ops/drive-actions.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(120_000);
const SETTLED_DOCUMENT =
  '<!doctype html><html lang="en" data-app-ready="settled"><body><main>app</main><script>globalThis.__orb={queries:()=>[{k:1}]};</script></body></html>';
const DEGRADED_DOCUMENT = '<!doctype html><html lang="en" data-app-ready="degraded"><body><main>mid-hydration</main></body></html>';

async function stageServer(
  unsettledDocuments: number,
): Promise<{ readonly base: string; readonly documents: () => number; readonly close: () => Promise<void> }> {
  let documents = 0;
  const server = createServer((_request, response) => {
    documents += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(documents > unsettledDocuments ? SETTLED_DOCUMENT : DEGRADED_DOCUMENT);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${String(address.port)}`,
    documents: (): number => documents,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    },
  };
}

async function driveOnce(argv: readonly string[], base: string): Promise<string | null> {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    return await navigate(page, parseSnapArgs([...argv, "--base", base, "--no-shot", "--no-deadcss", "--no-failure-evidence"]), base);
  } finally {
    await browser.close();
  }
}

/** Bind this process to a stage it booted, so the drive's BOOT-DEAD latch is live, exactly as `ensureStage` does. */
function bindBootedStage(): void {
  const at = new Date(FROZEN_AT_MS).toISOString();
  registerStageRunBinding({
    home: "/planted/home",
    booted: true,
    owner: "/planted",
    row: {
      band: 9,
      sha: "dirty",
      dir: "/planted/stage",
      serverPort: 1,
      vitePort: 2,
      checkout: "/planted",
      ownerPid: null,
      startedAt: at,
      lastUsedAt: at,
      sessions: [],
      dbProvenance: null,
      rsyncs: 0,
    },
  });
}

test("a settled isolated stage succeeds on its first navigation", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await stageServer(0);
  bindBootedStage();
  try {
    expect(await driveOnce(["/", "--isolated"], server.base)).toBeNull();
    expect(server.documents()).toBe(1);
    expect(takeStageOutcome()).toBeNull();
  } finally {
    await server.close();
  }
});

test("a failed first navigation stays failed even when a second document would settle", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await stageServer(1);
  bindBootedStage();
  try {
    expect(await driveOnce(["/", "--isolated"], server.base)).toContain("data-app-ready came up DEGRADED");
    expect(server.documents()).toBe(1);
    expect(takeStageOutcome()).toMatchObject({ kind: "unsettled", reason: expect.stringContaining("first navigation came back degraded") });
  } finally {
    await server.close();
  }
});

const NOT_FOUND_DOCUMENT =
  '<!doctype html><html lang="en" data-app-ready=""><body><main data-app-failure="not-found">not found</main><script>globalThis.__orb={queries:()=>[]};</script></body></html>';

async function notFoundServer(): Promise<{ readonly base: string; readonly documents: () => number; readonly close: () => Promise<void> }> {
  let documents = 0;
  const server = createServer((_request, response) => {
    documents += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(NOT_FOUND_DOCUMENT);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${String(address.port)}`,
    documents: (): number => documents,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    },
  };
}

test("a not-found render reports NOT-FOUND, never the dataless/BOOT-DEAD wording", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await notFoundServer();
  try {
    const navError = await driveOnce(["/settings"], server.base);

    expect(navError, "the app's own declare must win the classification").toContain("NOT-FOUND");
    expect(navError, "never the dataless boot-placeholder wording this shape used to trip").not.toContain("query cache is EMPTY");
    expect(navError, "never a bare 'app never mounted' reading either").not.toContain("MID-HYDRATION");
  } finally {
    await server.close();
  }
});

// A resolved not-found surface must not retire a healthy owned stage.
test("--isolated does not retry or mark the stage BOOT-DEAD for a not-found render", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await notFoundServer();
  bindBootedStage();
  try {
    const navError = await driveOnce(["/settings", "--isolated"], server.base);

    expect(navError, "still classified as not-found under --isolated").toContain("NOT-FOUND");
    expect(server.documents(), "the first not-found navigation is retained").toBe(1);
    expect(takeStageOutcome()).toBeNull();
  } finally {
    await server.close();
  }
});

// @instrument-proof: #2445 — snap could not dispatch a TOUCH tap. `--click` is a CDP MOUSE dispatch even
// under `--mobile`, so it fires pointerenter/mouseover and opens hover-only affordances a finger never can:
// a side-eye pass on a settings pane read 104/104 tap candidates clean while 15 HintTriggers were inert on
// touch, because the only verb available was the one that cannot tell the two apart. Every touch-interaction
// question was answerable from vendored source alone.
//
// @instrument-absence-proof: the tooltip arm runs BOTH ways on ONE document — `--tap` must leave the popup
// unmounted and `--click` must mount it. A one-directional assertion here would pass against a `--tap` that
// silently did nothing at all (a dropped step, a mis-typed selector, a throw swallowed into stepFailures),
// which is precisely the false clean this verb exists to end. The `--tap` arm therefore also asserts a
// REAL activation on the same page: the ordinary button's own click handler fires.
//
// THE OPENER IS BASE UI'S MECHANISM, REPRODUCED, NOT APPROXIMATED. `@base-ui/react@1.7.0`
// `tooltip/trigger/TooltipTrigger.js:147` passes `mouseOnly: true` to `useHoverReferenceInteraction`, whose
// onMouseEnter/onMouseMove (lines 147 and 284) both bail on `!isMouseLikePointerType(instance.pointerType)`
// — "mouse", "pen", the empty legacy string and undefined, never "touch". The trigger element carries
// `data-base-ui-tooltip-trigger` at REST (same file, line 244), which is what makes the population
// addressable. The fixture below opens on exactly that predicate off exactly that attribute, so the arm is a
// statement about the dispatch snap sends, with the vendor's own gate in the path. Mounting real React +
// Base UI here would need a bundler in a node-world suite; the predicate is transcribed with its receipt
// instead, and the vendored line numbers are the thing to re-derive if this ever goes quiet.
const TOUCH_DOCUMENT = `<!doctype html><html lang="en" data-app-ready="settled"><body>
<button id="hint" type="button" aria-label="More info" data-base-ui-tooltip-trigger="">i</button>
<button id="door" type="button">Do the thing</button>
<script>
  // isMouseLikePointerType(pointerType) — floating-ui-react/utils/event.js:39-45, non-strict form.
  var mouseLike = function (pointerType) {
    return pointerType === "mouse" || pointerType === "pen" || pointerType === "" || pointerType === undefined;
  };
  var hint = document.getElementById("hint");
  // The LAST POINTER EVENT decides, not the compat mouse event: useHoverReferenceInteraction.js:271-276
  // records pointerType on pointerdown/pointerenter, and onMouseEnter (line 147) reads that record. A touch
  // tap fires pointerenter{pointerType:"touch"} BEFORE Chromium's compatibility mouseenter, so the record
  // says "touch" by the time the gate runs. A rule that read the mouse event alone would see no pointerType
  // at all and open — which is exactly the shape that made --click look like a valid touch probe.
  var lastPointerType;
  var trackPointer = function (event) { lastPointerType = event.pointerType; };
  hint.addEventListener("pointerdown", trackPointer);
  hint.addEventListener("pointerenter", trackPointer);
  var open = function () {
    if (!mouseLike(lastPointerType)) { return; }
    if (document.getElementById("hint-popup") !== null) { return; }
    var popup = document.createElement("div");
    popup.id = "hint-popup";
    popup.setAttribute("role", "tooltip");
    popup.textContent = "the explanation";
    document.body.appendChild(popup);
  };
  hint.addEventListener("mouseenter", open);
  hint.addEventListener("mousemove", open);
  window.__doorActivations = 0;
  document.getElementById("door").addEventListener("click", function () { window.__doorActivations += 1; });
</script></body></html>`;

async function touchFixtureServer(): Promise<{ readonly base: string; readonly close: () => Promise<void> }> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(TOUCH_DOCUMENT);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as AddressInfo;
  return {
    base: `http://127.0.0.1:${String(address.port)}`,
    close: async (): Promise<void> => {
      server.closeAllConnections();
      await new Promise<void>((resolve, reject) => server.close((error) => (error === undefined ? resolve() : reject(error))));
    },
  };
}

interface DriveReading {
  readonly popupMounted: boolean;
  readonly doorActivations: number;
  readonly maxTouchPoints: number;
  readonly stepFailures: number;
}

/** One drive of the fixture through snap's OWN queue (`parseSnapArgs` → `driveActions`), in a context built
 *  from the same Playwright device descriptor `--mobile` selects. Nothing here re-implements the step
 *  dispatch — a regression in ops/drive.ts reaches this test. */
async function driveTouchFixture(argv: readonly string[], base: string): Promise<DriveReading> {
  const browser = await chromium.launch({ headless: true });
  try {
    // The registry's index signature is total in Playwright's types, so an absent name cannot be guarded
    // here; the run's own `maxTouchPoints` assertion is what proves the descriptor arrived intact.
    const context = await browser.newContext(devices[MOBILE_DEVICE]);
    const page = await context.newPage();
    await page.goto(base);
    const args = parseSnapArgs([...argv, "--mobile", "--base", base, "--no-shot", "--no-deadcss", "--no-failure-evidence"]);
    expect(args.errors, "the fixture argv must parse cleanly or the drive below measures nothing").toEqual([]);
    const failures = await driveActions({ page, actions: args.actions });
    return {
      popupMounted: (await page.locator("#hint-popup").count()) > 0,
      doorActivations: Number(await page.evaluate("window.__doorActivations")),
      maxTouchPoints: Number(await page.evaluate("navigator.maxTouchPoints")),
      stepFailures: failures.stepFailures,
    };
  } finally {
    await browser.close();
  }
}

test("--tap leaves a mouse-only tooltip shut and still activates an ordinary button", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await touchFixtureServer();
  try {
    const tapped = await driveTouchFixture(["/", "--tap", "#hint", "--tap", "#door"], server.base);

    // The context the verb requires is REAL, not merely requested (#1668 composes the descriptor into the
    // context; without hasTouch `locator.tap()` throws and every arm below would be vacuous).
    expect(tapped.maxTouchPoints, "the --mobile descriptor must carry hasTouch or there is no touchscreen to tap with").toBeGreaterThan(0);
    expect(tapped.stepFailures, "both taps must have landed").toBe(0);
    // THE FINDING #2445 IS ABOUT: a finger gets no explanation.
    expect(tapped.popupMounted, "a mouseOnly tooltip must not open under a touch tap").toBe(false);
    // …and the same tap IS a real activation, so the arm above is a statement about the tooltip, not about
    // a verb that does nothing.
    expect(tapped.doorActivations, "a tap must fire an ordinary click handler").toBe(1);
  } finally {
    await server.close();
  }
});

test("--click opens the same tooltip on the same document — the other direction of the control", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await touchFixtureServer();
  try {
    // PLANTED POSITIVE CONTROL: byte-identical page, byte-identical selector, MOUSE dispatch. This is the
    // measurement that proves the tap arm above is the pointer type and not an unreachable target.
    const clicked = await driveTouchFixture(["/", "--click", "#hint"], server.base);

    expect(clicked.stepFailures, "the click must have landed").toBe(0);
    expect(clicked.popupMounted, "--click is a MOUSE dispatch even under --mobile, so the hover-only tooltip opens").toBe(true);
  } finally {
    await server.close();
  }
});

test("--tap without a touch device is refused by name rather than degraded to a mouse", () => {
  const refused = parseSnapArgs(["/", "--tap", "#hint"]);
  expect(refused.errors.join("\n")).toContain("--tap needs a touch-capable context");
  // The refusal is the DEVICE's absence, not the flag's presence: the same argv with --mobile parses.
  expect(parseSnapArgs(["/", "--tap", "#hint", "--mobile"]).errors).toEqual([]);
});

// --swipe: a dispatched touch drag (Input.dispatchTouchEvent start/move/end). Chromium's
// Input.synthesizeScrollGesture does not scroll in the headless build, so a touch-scroll probe needs this path.
const SWIPE_DOCUMENT = `<!doctype html><html lang="en" data-app-ready="settled"><body style="margin:0">
<div id="list" style="height:300px;overflow-y:auto"><div style="height:3000px;background:linear-gradient(#fff,#00f)"></div></div>
</body></html>`;

test("--swipe scrolls a touch scroller by dispatched touch events, and refuses without a touch device", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(SWIPE_DOCUMENT);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext(devices[MOBILE_DEVICE])).newPage();
    await page.goto(base);
    const args = parseSnapArgs(["/", "--swipe", "#list=400", "--mobile", "--base", base, "--no-shot", "--no-deadcss", "--no-failure-evidence"]);
    expect(args.errors).toEqual([]);
    const failures = await driveActions({ page, actions: args.actions });
    expect(failures.stepFailures).toBe(0);
    expect(Number(await page.evaluate("document.getElementById('list').scrollTop"))).toBeGreaterThan(100);
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
  expect(parseSnapArgs(["/", "--swipe", "#list=400"]).errors.join("\n")).toContain("--swipe needs a touch-capable context");
});

// --swipe-x / --long-press / --tap-at ride the same touch path as --swipe, so the fixture records what a
// finger would produce: the strip's scrollLeft, the hold between touchstart and touchend, and the click a
// coordinate tap lands on a button that is positioned at known pixels.
const GESTURE_DOCUMENT = `<!doctype html><html lang="en" data-app-ready="settled"><body style="margin:0">
<div id="strip" style="width:300px;height:80px;overflow-x:auto;overflow-y:hidden"><div style="width:3000px;height:60px;background:linear-gradient(90deg,#fff,#00f)"></div></div>
<div id="held" style="position:absolute;left:0;top:120px;width:200px;height:80px"></div>
<button id="spot" style="position:absolute;left:50px;top:240px;width:100px;height:60px">spot</button>
<script>
  window.__hold = null;
  window.__spotTaps = 0;
  var startedAt = 0;
  var held = document.getElementById("held");
  held.addEventListener("touchstart", function (event) { startedAt = event.timeStamp; });
  held.addEventListener("touchend", function (event) { window.__hold = event.timeStamp - startedAt; });
  document.getElementById("spot").addEventListener("click", function () { window.__spotTaps += 1; });
</script></body></html>`;

interface GestureReading {
  readonly stepFailures: number;
  readonly scrollLeft: number;
  readonly holdMs: number | null;
  readonly spotTaps: number;
}

async function driveGestureFixture(argv: readonly string[]): Promise<GestureReading> {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(GESTURE_DOCUMENT);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext(devices[MOBILE_DEVICE])).newPage();
    await page.goto(base);
    const args = parseSnapArgs([...argv, "--mobile", "--base", base, "--no-shot", "--no-deadcss", "--no-failure-evidence"]);
    expect(args.errors, "the fixture argv must parse cleanly or the drive below measures nothing").toEqual([]);
    const failures = await driveActions({ page, actions: args.actions });
    return {
      stepFailures: failures.stepFailures,
      scrollLeft: Number(await page.evaluate("document.getElementById('strip').scrollLeft")),
      holdMs: (await page.evaluate("window.__hold")) as number | null,
      spotTaps: Number(await page.evaluate("window.__spotTaps")),
    };
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
}

test("--swipe-x drags a horizontal scroller sideways, and refuses without a touch device", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const reading = await driveGestureFixture(["/", "--swipe-x", "#strip=400"]);
  expect(reading.stepFailures).toBe(0);
  expect(reading.scrollLeft, "a positive dx drags the finger left, so the content scrolls right").toBeGreaterThan(100);
  expect(parseSnapArgs(["/", "--swipe-x", "#strip=400"]).errors.join("\n")).toContain("--swipe-x needs a touch-capable context");
  expect(parseSnapArgs(["/", "--swipe-x", "#strip", "--mobile"]).errors.join("\n")).toContain("--swipe-x expects selector=dx");
});

test("--long-press holds the finger down for the asked duration, and refuses without a touch device", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const reading = await driveGestureFixture(["/", "--long-press", "#held=700"]);
  expect(reading.stepFailures).toBe(0);
  expect(reading.holdMs, "touchstart and touchend must both fire on the target").not.toBeNull();
  expect(reading.holdMs ?? 0).toBeGreaterThanOrEqual(650);
  expect(parseSnapArgs(["/", "--long-press", "#held=700"]).errors.join("\n")).toContain("--long-press needs a touch-capable context");
  expect(parseSnapArgs(["/", "--long-press", "#held=0", "--mobile"]).errors.join("\n")).toContain("--long-press expects selector=ms");
});

test("--tap-at taps a viewport coordinate, and refuses without a touch device", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const reading = await driveGestureFixture(["/", "--tap-at", "100,270"]);
  expect(reading.stepFailures).toBe(0);
  expect(reading.spotTaps, "a touch at the button's pixels must click it").toBe(1);
  expect(parseSnapArgs(["/", "--tap-at", "100,270"]).errors.join("\n")).toContain("--tap-at needs a touch-capable context");
  expect(parseSnapArgs(["/", "--tap-at", "100", "--mobile"]).errors.join("\n")).toContain("--tap-at expects x,y");
});

// --soft-keyboard: headless Chromium never raises an on-screen keyboard, so a --mobile drive that focused the
// composer read visualViewport.height === innerHeight and the app's keyboard inset stayed 0 (measured on a
// staged chat room). The page below records what visualViewport resize AND scroll listeners see, the two
// events `keyboard-inset.ts` subscribes to, and the inset by its own arithmetic (innerHeight - offsetTop -
// height), so the assertions are about what the app would compute.
const KEYBOARD_DOCUMENT = `<!doctype html><html lang="en" data-app-ready="settled"><head>
<meta name="viewport" content="width=device-width, initial-scale=1"></head><body>
<textarea id="field"></textarea>
<script>
  window.__seen = [];
  var record = function (event) {
    window.__seen.push({ type: event.type, inner: innerHeight, inset: Math.round(innerHeight - visualViewport.offsetTop - visualViewport.height) });
  };
  visualViewport.addEventListener("resize", record);
  visualViewport.addEventListener("scroll", record);
</script></body></html>`;

test("--soft-keyboard shrinks the visual viewport iOS-style, fires resize and scroll, and closes at 0", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(KEYBOARD_DOCUMENT);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const base = `http://127.0.0.1:${String((server.address() as AddressInfo).port)}`;
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await (await browser.newContext(devices[MOBILE_DEVICE])).newPage();
    await page.goto(base);
    const fullHeight = Number(await page.evaluate("innerHeight"));
    const restingInset = Number(await page.evaluate("Math.round(innerHeight - visualViewport.offsetTop - visualViewport.height)"));
    // Chromium fires its own resize as the mobile viewport settles after load; only the drive's count.
    await page.evaluate("window.__seen = []");
    const args = parseSnapArgs([
      "/",
      "--soft-keyboard",
      "340",
      "--soft-keyboard",
      "0",
      "--mobile",
      "--base",
      base,
      "--no-shot",
      "--no-deadcss",
      "--no-failure-evidence",
    ]);
    expect(args.errors).toEqual([]);
    const failures = await driveActions({ page, actions: args.actions });
    expect(failures.stepFailures).toBe(0);
    const seen = (await page.evaluate("window.__seen")) as readonly { readonly type: string; readonly inner: number; readonly inset: number }[];
    // Open: the layout viewport keeps its height (WebKit) and the inset is the keyboard band. Close: the
    // inset returns to rest. Each state reached BOTH listeners; a listener may hear a state more than once,
    // as on a real phone, so the distinct readings per event type are what is asserted.
    for (const type of ["resize", "scroll"]) {
      const ofType = seen.filter((reading) => reading.type === type);
      const states = ofType.filter((reading, index) => index === 0 || reading.inset !== ofType[index - 1]?.inset);
      expect(states, type).toEqual([
        { type, inner: fullHeight, inset: restingInset + 340 },
        { type, inner: fullHeight, inset: restingInset },
      ]);
    }
  } finally {
    await browser.close();
    server.closeAllConnections();
    server.close();
  }
  expect(parseSnapArgs(["/", "--soft-keyboard", "340"]).errors.join("\n")).toContain("--soft-keyboard needs a phone context");
  expect(parseSnapArgs(["/", "--soft-keyboard", "tall", "--mobile"]).errors.join("\n")).toContain("--soft-keyboard expects a keyboard height");
});

test("explicit cold bootstrap waits on the actual capture document beyond ordinary readiness", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    let documents = 0;
    await page.route("http://cold-capture.test/", (route) => {
      documents++;
      return route.fulfill({
        contentType: "text/html",
        body: '<html><body><main>loading</main><script>globalThis.__orb={queries:()=>[{}]}; setTimeout(() => { document.querySelector("main").textContent="ready capture"; document.documentElement.setAttribute("data-app-ready", ""); }, 11000);</script></body></html>',
      });
    });
    const args = parseSnapArgs(["--cold-start", "--base", "http://cold-capture.test"]);
    expect(await navigate(page, args, "http://cold-capture.test/")).toBeNull();
    expect(await page.getByRole("main").textContent()).toBe("ready capture");
    expect(documents).toBe(1);
  } finally {
    await browser.close();
  }
});
