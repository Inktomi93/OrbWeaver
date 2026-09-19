// @instrument-proof: #1142 — `--isolated` promised the reader ONE re-run and needed TWO. A cold stage's
// first navigation builds the route on demand and the app misses the readiness ceiling; the run refused with
// "re-run against the now-warm stage", the re-run refused identically, and only the THIRD invocation
// measured (reproduced at four shas by cb-row-anatomy). The count is pinned HERE, as the number of
// NAVIGATIONS a caller has to pay for: on a stage the warm-up navigation is inside the run.
//
// @instrument-absence-proof: the second arm is the control in the other direction — the same never-mounting
// page WITHOUT `--isolated` (a dev stack, a `--base` origin) must refuse on the first pass. Retrying there
// would turn a real app defect into a slower app defect, so the retry is proven to be stage-scoped rather
// than unconditional.
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { chromium, devices } from "@playwright/test";
import { MOBILE_DEVICE } from "../../../../tooling/src/_shared/browser-environment.ts";
import { driveActions, navigate } from "../../../../tooling/src/snap/ops/drive.ts";
import { parseSnapArgs } from "../../../../tooling/src/snap/ops/parse.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";
import { scaledBudget } from "../../_load-budget.ts";

const BROWSER_TIMEOUT_MS = scaledBudget(120_000);

/** A page that mounts only once the origin has served the document ONCE — the cold-vite shape: the first
 *  navigation gets a document whose app never publishes `data-app-ready`, and the next one gets the app. */
const COLD_DOCUMENT = '<!doctype html><html lang="en"><body><main>cold vite: route chunk still building</main></body></html>';
const WARM_DOCUMENT =
  '<!doctype html><html lang="en" data-app-ready="settled"><body><main>app</main><script>globalThis.__orb={queries:()=>[{k:1}]};</script></body></html>';

async function coldStageServer(warmAfter: number): Promise<{ readonly base: string; readonly documents: () => number; readonly close: () => Promise<void> }> {
  let documents = 0;
  const server = createServer((_request, response) => {
    documents += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(documents > warmAfter ? WARM_DOCUMENT : COLD_DOCUMENT);
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
    // A short readiness ceiling: the cold document NEVER publishes the flag, so this arm is otherwise
    // buying nothing but the ceiling twice. The count under test is navigations, not milliseconds.
    page.setDefaultTimeout(2000);
    return await navigate(page, parseSnapArgs([...argv, "--base", base, "--no-shot", "--no-deadcss", "--no-failure-evidence"]), base);
  } finally {
    await browser.close();
  }
}

test("an --isolated run pays the cold stage's warm-up navigation itself", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await coldStageServer(1);
  try {
    const navError = await driveOnce(["/", "--isolated"], server.base);

    // ONE CLI invocation measured, which is what the refusal text has always promised the reader.
    expect(navError, "the stage's second navigation reached a mounted app, so this run has a verdict").toBeNull();
    // …and it did so by navigating TWICE inside the one run — the count the row is about.
    expect(server.documents()).toBe(2);
  } finally {
    await server.close();
  }
});

test("a non-stage origin that never mounts still refuses on the first navigation", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  // PLANTED CONTROL: the same never-mounting document, served forever, without --isolated.
  const server = await coldStageServer(Number.MAX_SAFE_INTEGER);
  try {
    const navError = await driveOnce(["/"], server.base);

    expect(navError, "an app that never mounts on a dev stack is a finding, not a warm-up").toContain("app never signalled data-app-ready");
    expect(server.documents(), "no retry outside a stage").toBe(1);
  } finally {
    await server.close();
  }
});

// @instrument-proof: #1837 — scoping #1142's warm-up to the `absent` arm left uncovered the arm a cold stage
// ACTUALLY produces. The client's readiness signal has its OWN hard 20s ceiling that stamps
// `data-app-ready="degraded"` one-shot (packages/client/src/lib/app-ready-signal.ts), well inside snap's 60s
// STAGE_READY budget — so a cold stage never reaches `absent`, it reaches `degraded`, and every isolated boot
// at d5adb9103 refused on a QUIET box (load 3.8/24): 1375 HAR entries, ~1370 of them vite source-module
// transforms over 28.7s, ONE api call (`/api/auth/me`, 19ms, 200), zero page errors. The same stage re-run
// warm came back `nav=OK` in 8s — a fresh document gets a fresh one-shot signal, which is the whole retry.
const DEGRADED_DOCUMENT = '<!doctype html><html lang="en" data-app-ready="degraded"><body><main>mid-hydration</main></body></html>';

/** The cold-stage shape the CLIENT actually produces: the first document's app hits its own readiness
 *  ceiling and stamps `degraded`; the next one, against a now-warm module graph, settles. */
async function degradedThenWarmServer(
  warmAfter: number,
): Promise<{ readonly base: string; readonly documents: () => number; readonly close: () => Promise<void> }> {
  let documents = 0;
  const server = createServer((_request, response) => {
    documents += 1;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(documents > warmAfter ? WARM_DOCUMENT : DEGRADED_DOCUMENT);
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

test("an --isolated run pays the warm-up navigation for a DEGRADED first readiness too", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await degradedThenWarmServer(1);
  try {
    const navError = await driveOnce(["/", "--isolated"], server.base);

    expect(navError, "the stage's second, warm navigation settled, so this run has a verdict").toBeNull();
    expect(server.documents(), "the warm-up navigation is inside the run, exactly as for the `absent` arm").toBe(2);
  } finally {
    await server.close();
  }
});

// @instrument-absence-proof: the retry is ONE, and a stage that still cannot settle refuses LOUDLY. A third
// navigation would be the same under-instruction #1142 was minted to kill, one hop further out.
test("a stage whose warm navigation is still degraded refuses after exactly one retry", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await degradedThenWarmServer(Number.MAX_SAFE_INTEGER);
  try {
    const navError = await driveOnce(["/", "--isolated"], server.base);

    expect(navError, "a stage that never settles is a finding, stated as one").toContain("data-app-ready came up DEGRADED");
    expect(navError, "and the refusal must not send the reader back for a re-run the code already paid").not.toContain("re-run against the now-warm stage");
    expect(server.documents(), "one warm-up, never two").toBe(2);
  } finally {
    await server.close();
  }
});

// @instrument-absence-proof: the widened retry stays STAGE-scoped. A degraded dev stack is a real app finding
// on the first pass — retrying there would turn a finding into a slower finding.
test("a non-stage origin that comes up degraded still refuses on the first navigation", { timeout: BROWSER_TIMEOUT_MS }, async () => {
  const server = await degradedThenWarmServer(Number.MAX_SAFE_INTEGER);
  try {
    const navError = await driveOnce(["/"], server.base);

    expect(navError, "a degraded dev stack is the app's finding to answer").toContain("data-app-ready came up DEGRADED");
    expect(server.documents(), "no retry outside a stage").toBe(1);
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
