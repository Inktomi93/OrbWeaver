// CT: the `[space]` half of motion-flaggers.ts (task #39/#40's dead-flagger fix). A node/jsdom test
// cannot reach this — `getComputedStyle` on a replaced element only resolves a real box in an actual
// layout engine, which is exactly the bug this file guards: `hasReservedBox` used to read the
// COMPUTED (resolved) height, which is always a real px value for anything in-layout, so the flagger
// never fired. The fix reads the AUTHORED intent (width/height attrs, aspect-ratio) instead.
//
// What is proven:
//  1. an `<img>` with no width/height attrs, no aspect-ratio, and a blocked src IS flagged `[space]`
//     (the red-first case: before the fix, this never fired — verifier's plant receipt: blocked src,
//     no dims, 8.4s churn, 0 flags);
//  2. an `<img>` with width+height attrs is NOT flagged (the false-positive guard).
//
// P8 (the instrument-proof suite) added the two planted-defect proofs the pack was missing. Each carries
// its own note above the test naming the plant and the regression it REDs on:
//  · `[css]` — escaped Tailwind-shaped selectors (`.sm\:max-w-dialog-lg`, `.w-\[2px\]`) stay silent while a
//    genuinely undefined token is still flagged. The regression is the `@orb/kit/dead-css` un-escaper: it
//    does not go quiet, it accuses every escaped utility in the app.
//  · `[drop]` — the RE-ARM. A second real stutter on the SAME surface after `__resetMotionFlags` must fire
//    again, or a driven multi-step probe reads every step after the first as clean.

import { expect, test } from "@playwright/experimental-ct-react";
import type { Page } from "@playwright/test";
import { droppedFramePct } from "../../../tooling/src/motion-audit/index.ts";
import { blockMainThread } from "../../support/node/block-main-thread.ts";
import {
  DeadClassConfirmStory,
  MotionFlaggersAuditPauseStory,
  MotionFlaggersCheckpointStory,
  MotionFlaggersCssBatchStory,
  MotionFlaggersCssEscapedTokenStory,
  MotionFlaggersCssTrailingStory,
  MotionFlaggersDropRearmStory,
  MotionFlaggersDropStory,
  MotionFlaggersExternalDevtoolsStory,
  MotionFlaggersInteractiveColourStory,
  MotionFlaggersRatifiedHeightStory,
  MotionFlaggersReducedMotionStory,
  MotionFlaggersSettleStory,
  MotionFlaggersSlowInputStory,
  MotionFlaggersSpaceStory,
  MotionFlaggersWaapiDropStory,
} from "./_ct-stories.tsx";

/** Collect every `[space]` console line the flagger emits. Attached BEFORE mount so nothing is missed. */
function captureSpaceLines(page: Page): string[] {
  const lines: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("[space]")) {
      lines.push(text);
    }
  });
  return lines;
}

test("an unreserved <img> (no dims, no aspect-ratio) is flagged [space]", async ({ mount, page }) => {
  const lines = captureSpaceLines(page);
  const component = await mount(<MotionFlaggersSpaceStory />);

  await component.getByRole("button", { name: "add image" }).click();
  // The scan is throttled (`cssScanIntervalMs`) and idle-deferred — poll generously rather than assume
  // the first tick catches it.
  await expect.poll(() => lines.length, { intervals: [200, 500, 1000, 2000], timeout: 15_000 }).toBeGreaterThan(0);

  const line = lines.join("\n");
  expect(line).toContain("<img>");
  expect(line).toContain("no reserved box");
});

// PERMANENT PIN for the OUT-OF-FLOW carve-out (#516). The flagger was accusing the login backdrop —
// `[data-slot=web-weave-canvas]`, an `absolute inset-0 size-full` canvas — once per boot on `/login`
// (side-eye 2026-08-22 rail-chats, console triage). Its own accusation is "its load will shift the page",
// and an out-of-flow element cannot: nothing lays out against it. A lying instrument's fix owes a pin that
// REDs in BOTH directions, so this asserts the silence only AFTER the in-flow `<img>` on the same stage has
// flagged — that flag is the receipt that the sweep ran at all.
test("an out-of-flow <canvas> is NOT flagged [space] while an in-flow unreserved <img> beside it still is", async ({ mount, page }) => {
  const lines = captureSpaceLines(page);
  const component = await mount(<MotionFlaggersSpaceStory />);

  await component.getByRole("button", { name: "add image" }).click();
  await expect.poll(() => lines.some((line) => line.includes("<img>")), { intervals: [200, 500, 1000, 2000], timeout: 15_000 }).toBe(true);

  const flagged = lines.join("\n");
  expect(flagged, "an absolutely-positioned canvas is removed from flow — its content can shift nothing").not.toContain("out-of-flow-canvas");
  expect(flagged, "no <canvas> on this stage is in flow, so none may be accused").not.toContain("<canvas>");
});

test("the app observer ignores injected TanStack Devtools media", async ({ mount, page }) => {
  const lines = captureSpaceLines(page);
  const component = await mount(<MotionFlaggersExternalDevtoolsStory />);

  await component.getByRole("button", { name: "inject devtools" }).click();
  await expect(component.getByTestId("devtool-scan-complete")).toBeVisible();

  expect(lines.filter((line) => line.includes("tsd-main-panel"))).toEqual([]);
});

/** Collect every `[css]` console line the flagger emits. */
function captureCssLines(page: Page): string[] {
  const lines: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (text.includes("[css]")) {
      lines.push(text);
    }
  });
  return lines;
}

test("a single mutation INSIDE the throttle window is still scanned — trailing edge, not dropped", async ({ mount, page }) => {
  const lines = captureCssLines(page);
  const component = await mount(<MotionFlaggersCssTrailingStory />);

  // ONE mutation, no follow-up — a dropping throttle would leave the dead class unscanned forever.
  await component.getByRole("button", { name: "add dead class" }).click();
  await expect.poll(() => lines.length, { intervals: [500, 1000, 2000, 2000], timeout: 20_000 }).toBeGreaterThan(0);

  expect(lines.join("\n")).toContain("orb-ct-dead-class-marker");
});

// #852 — CONFIRM BEFORE YOU CRY. `defined` is a CACHE the flagger refreshes only when a slice starts and
// a stylesheet mutation was seen, so a rule that lands while a queued job drains is invisible to the
// elements already in flight. MEASURED on the shipped room (side-eye 2026-08-30): the console flagged
// `.base-ui-disable-scrollbar` on route `/` while `snap --dead-css` — a one-shot scan at SETTLE that
// shares this flagger's own tokenizer — reported `deadcss=0` on the SAME runs. Two instruments, one page,
// opposite verdicts; the class is real (Base UI's ScrollArea Root hoists its rule as a React
// `<style precedence>`), so the console was the one lying.
//
// HONESTLY LABELLED: this is a FENCE, not a defect proof. It reads the `readDefined` seam the fix added,
// so it cannot compile against the old source; the defect receipt is the two-instrument contradiction
// above. Both directions ARE planted here — a token the second read defines must go unreported, and a
// token no read ever defines must still be reported by the same harness in the same mount.
test("#852: a token the FRESH CSSOM read defines is not reported — while a never-defined token still is", async ({ mount }) => {
  const component = await mount(<DeadClassConfirmStory lateDefine={true} />);
  const reports = component.getByTestId("dead-class-reports");

  await component.getByRole("button", { name: "arm late class" }).click();
  await expect(component.getByTestId("dead-class-drain-receipt")).not.toHaveText("pending", { timeout: 10_000 });
  // The control proves the completed drain still reported a genuinely absent token.
  await expect(reports).toContainText("orb-ct-always-dead-marker");
  await expect(reports).not.toContainText("orb-ct-late-defined-marker");
});

test("#852: the same token IS reported when no read ever defines it (the negative control)", async ({ mount }) => {
  const component = await mount(<DeadClassConfirmStory lateDefine={false} />);
  const reports = component.getByTestId("dead-class-reports");

  await component.getByRole("button", { name: "arm late class" }).click();
  await expect(component.getByTestId("dead-class-drain-receipt")).not.toHaveText("pending", { timeout: 10_000 });
  await expect(reports).toContainText("orb-ct-late-defined-marker");
});

test("a later dead-class mutation is found without rescanning the whole document", async ({ mount, page }) => {
  const lines = captureCssLines(page);
  const component = await mount(<MotionFlaggersCssTrailingStory initialMarker={true} />);
  // A flagged initial marker is the receipt that the required full census has finished.
  await expect.poll(() => lines.some((line) => line.includes("orb-ct-initial-dead-class-marker")), { timeout: 10_000 }).toBe(true);
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbWildcardDocumentScans?: number };
    const original = Document.prototype.querySelectorAll;
    root.__orbWildcardDocumentScans = 0;
    Document.prototype.querySelectorAll = function (this: Document, selector: string): NodeListOf<Element> {
      if (selector === "*") {
        root.__orbWildcardDocumentScans = (root.__orbWildcardDocumentScans ?? 0) + 1;
      }
      return original.call(this, selector);
    } as typeof Document.prototype.querySelectorAll;
  });

  await component.getByRole("button", { name: "add dead class" }).click();
  await expect.poll(() => lines.some((line) => line.includes("orb-ct-dead-class-marker")), { timeout: 10_000 }).toBe(true);
  const globalScans = await page.evaluate(
    () => (document.documentElement as HTMLElement & { __orbWildcardDocumentScans?: number }).__orbWildcardDocumentScans ?? 0,
  );

  expect(globalScans, "post-census CSS checks stay scoped to the mutation subtree").toBe(0);
});

// CONTENTION BUDGET (#413). This test STARVES the instrument on purpose: `requestIdleCallback` is
// overridden to hand out an 8×5ms deadline, and that override is live for the INITIAL census too — so the
// census this test must wait for runs at a fraction of its normal slice budget. Under sibling-lane load
// (measured 2026-08-21 at `--workers=2`) that barrier blew its 10s while the tree was healthy: green in
// isolation, green on rerun, green at the HEAD baseline. The deadline shape is NOT the lever — `8 × 5ms` is
// exactly what forces the yields the final assertion counts, and scaling it up would weaken the pin into
// one that a non-yielding implementation could pass. Wall clock is the lever: `test.slow()` for the budget,
// generous barriers inside it. Nothing here waits on a timer, so a slow box costs seconds, never a verdict.
test("a drain waits across a 97-element multi-slice mutation and advances monotonically", async ({ mount, page }) => {
  test.slow();
  const lines = captureCssLines(page);
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbIdleCallbackCount?: number };
    const nativeRequestIdleCallback = globalThis.requestIdleCallback.bind(globalThis);
    root.__orbIdleCallbackCount = 0;
    globalThis.requestIdleCallback = (callback, options): number =>
      nativeRequestIdleCallback((deadline) => {
        root.__orbIdleCallbackCount = (root.__orbIdleCallbackCount ?? 0) + 1;
        let checks = 0;
        callback({
          didTimeout: deadline.didTimeout,
          timeRemaining: () => (checks++ < 8 ? 5 : 0),
        });
      }, options);
  });
  const component = await mount(<MotionFlaggersCssBatchStory />);
  await expect.poll(() => lines.some((line) => line.includes("orb-ct-initial-dead-class-marker")), { timeout: 60_000 }).toBe(true);
  const before = await page.evaluate(() => (document.documentElement as HTMLElement & { __orbIdleCallbackCount?: number }).__orbIdleCallbackCount ?? 0);

  await component.getByRole("button", { name: "add batched dead class" }).click();
  const receipts = component.getByTestId("dead-class-drain-receipts");
  await expect(receipts).not.toHaveText("pending", { timeout: 60_000 });
  expect(
    lines.some((line) => line.includes("orb-ct-batched-dead-class-marker")),
    "the completed drain includes the final descendant",
  ).toBe(true);
  await expect
    .poll(
      async () =>
        (await page.evaluate(() => (document.documentElement as HTMLElement & { __orbIdleCallbackCount?: number }).__orbIdleCallbackCount ?? 0)) - before,
    )
    .toBeGreaterThan(1);
  await expect
    .poll(
      async () =>
        JSON.parse(await receipts.innerText()) as readonly {
          readonly requestedGeneration: number;
          readonly completedGeneration: number;
        }[],
    )
    .toEqual([
      { requestedGeneration: 1, completedGeneration: 1 },
      { requestedGeneration: 2, completedGeneration: 2 },
    ]);
});

// PLANTED-DEFECT PROOF (P8) for the `@orb/kit/dead-css` tokenizer's un-escape step. The plant is the
// class of token Tailwind v4 actually emits — an ESCAPED variant/arbitrary selector — and the regression it
// REDs on is the tokenizer losing the un-escape (or the escape-tolerant token pattern): `.sm\:max-w-dialog-lg`
// then never matches the live token `sm:max-w-dialog-lg`, and every escaped utility on the page is accused.
// The dead marker in the same stage is the positive control: without it, a scan that never ran would pass
// the silence assertion for free.
test("escaped Tailwind-shaped class selectors are NOT flagged [css] while a genuinely dead token still is", async ({ mount, page }) => {
  const lines = captureCssLines(page);
  await mount(<MotionFlaggersCssEscapedTokenStory />);

  // Barrier on the POSITIVE control: its arrival is the receipt that the census walked this stage's
  // elements and read this stage's sheet — asserting the silence before that would be vacuous.
  await expect.poll(() => lines.some((line) => line.includes("orb-ct-escaped-arm-dead-marker")), { timeout: 20_000 }).toBe(true);

  const flagged = lines.join("\n");
  expect(flagged, "an escaped variant utility that IS defined must never be called dead").not.toContain("sm:max-w-dialog-lg");
  expect(flagged, "an escaped arbitrary-value utility that IS defined must never be called dead").not.toContain("w-[2px]");
  expect(flagged, "an escaped variant+slash utility that IS defined must never be called dead").not.toContain("hover:bg-x/50");
});

test("the initial dev-instrument census exposes a checkpoint completion promise", async ({ mount, page }) => {
  await mount(<MotionFlaggersSettleStory />);
  await expect(page.getByTestId("motion-flaggers-settled")).toHaveText("settled");
});

test("one slow physical interaction emits one [input] warning, not its entire DOM event family", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[input]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersSlowInputStory />);

  await component.locator("button").click({ force: true });
  await expect.poll(() => lines.length, { timeout: 5000 }).toBe(1);
});

test("a visible non-compositor transition is flagged", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[anim]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersReducedMotionStory />);
  await component.getByRole("button", { name: "change color" }).click();
  await expect.poll(() => lines.length).toBeGreaterThan(0);
});

/** The `anim` raises as the story's own module instance holds them — the PULL half `__orb.flags()` serves. */
interface AnimFlagProbe {
  readonly tag: string;
  readonly animation?: { readonly properties: readonly string[]; readonly compositorClean: boolean };
}
function readAnimFlags(page: Page): Promise<readonly AnimFlagProbe[]> {
  return page.evaluate(() => {
    const read = (globalThis as { __motionFlagsRead?: () => readonly unknown[] }).__motionFlagsRead;
    const rows = read === undefined ? [] : (JSON.parse(JSON.stringify(read())) as { tag: string }[]);
    return rows.filter((row) => row.tag === "anim");
  }) as Promise<readonly AnimFlagProbe[]>;
}

// PERMANENT PIN for the LAUNCH-RECORD ATTACHMENT (#1070). Snap's motion-arm dirty-animation budget
// reads `__orb.flags()` for the TRANSIENT population, because its other input — `__orb.animations()` — is
// a `document.getAnimations()` sample taken when the measured window closes, ~2s after a 130-360ms house
// transition ended. Without the attached record the audit cannot apply the #953 Base UI height allowance
// and must treat every raise as unattributed, so a refactor that quietly drops `animation:` re-blinds an
// instrument while leaving this file's console assertions green. Hence: the raise's FACTS, asserted.
test("an [anim] raise carries the launch-time animation record the audit re-judges (#1070)", async ({ mount, page }) => {
  const component = await mount(<MotionFlaggersReducedMotionStory />);
  await component.getByRole("button", { name: "change color" }).click();
  await expect.poll(async () => (await readAnimFlags(page)).length).toBeGreaterThan(0);

  const anim = await readAnimFlags(page);
  // The payload exists on EVERY anim raise — an absent one is unsanctionable evidence downstream.
  expect(anim.every((flag) => flag.animation !== undefined)).toBe(true);
  // …and it carries the two facts the allowance policy reads: the property set and the compositor verdict.
  expect(anim.some((flag) => flag.animation?.properties.includes("color") === true && flag.animation.compositorClean === false)).toBe(true);
});

// PERMANENT PIN for the RATIFIED-LIFECYCLE ALLOWANCE (#1069 — the console twin of #953's audit-side one,
// motion guide §4.2 item 3 + §3.7's own "Base UI ships `--collapsible-panel-height` … so you can
// transition `height`"). The `[anim]` channel printed `animating non-compositor height … OVER BUDGET` on
// the FIRST OPEN of every accordion/collapsible in the app, i.e. a live instrument accusing ratified
// behaviour — the same lying-instrument class as the #456 card-hover finding, and the reason a triager
// learns to ignore this channel. A lying instrument's fix owes a pin that REDs in BOTH directions, so the
// positive control is the identical PROPERTY with no library lifecycle behind it: the allowance sanctions
// a Base UI lifecycle, never the word "height".
test("#1069 a Base UI panel-height lifecycle is NOT over budget while an application height animation still is", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[anim]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersRatifiedHeightStory />);

  // CONTROL FIRST: an application-authored height animation. If this never fires, the allowance
  // assertions below are vacuous — a dead channel would pass them all.
  await component.getByRole("button", { name: "grow the box" }).click();
  await expect.poll(() => lines.filter((line) => line.includes("dirty-height-target")).length).toBeGreaterThan(0);
  expect(lines.join("\n"), "an application height animation has no library lifecycle to sanction").toContain("OVER BUDGET");

  // …and the ratified one, on the REAL primitive: raised (the pull side needs the facts) but NOT a verdict.
  await component.getByRole("button", { name: "Reveal the panel" }).click();
  await expect(component.getByTestId("ratified-panel")).toBeVisible();
  await expect.poll(() => lines.filter((line) => line.includes("ratified-panel")).length).toBeGreaterThan(0);

  const ratified = lines.filter((line) => line.includes("ratified-panel"));
  expect(ratified.join("\n"), "the ratified panel-height lifecycle must not be convicted").not.toContain("OVER BUDGET");
  expect(ratified.join("\n")).toContain("guide §4.2 item 3");
  // The pull side re-judges the FACTS, so the raise (and its launch record) must survive the allowance.
  const raises = await readAnimFlags(page);
  expect(
    raises.some((flag) => flag.animation?.properties.includes("height") === true),
    "the allowance silences the VERDICT, never the evidence",
  ).toBe(true);
});

/** Read the story's own transitionstart tally — the receipt that the exempted transition really ran. */
function colourTransitionStarts(page: Page): Promise<number> {
  return page.evaluate(() => (document.documentElement as HTMLElement & { __orbColourTransitionStarts?: number }).__orbColourTransitionStarts ?? 0);
}

// PERMANENT PIN for the §3.7 interactive-state colour carve-out (owner ruling 2026-08-22, #456). The
// flagger was accusing RATIFIED behaviour — the core Card primitive's `hover:bg-accent` printed
// `[anim] … backgroundColor … OVER BUDGET` on every interactive-card hover, app-wide
// (docs/history/reviews/side-eye/2026-08-22-rail-home.md P3-2). A lying instrument's fix owes a pin that REDs
// forever in BOTH directions, so this test carries its own positive control: the identical `:hover`
// driving `width` must still fire. Silence alone would pass on a channel that had simply gone dead.
test("a :hover colour transition is NOT flagged while the same :hover driving width still is (§3.7 carve-out)", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[anim]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersInteractiveColourStory />);

  // CONTROL FIRST: geometry under the exact trigger the carve-out names. If this does not fire, every
  // assertion below is vacuous.
  await component.getByTestId("carve-out-geometry-card").hover();
  await expect.poll(() => lines.length).toBeGreaterThan(0);
  expect(lines.join("\n"), "an interactive state never exempts a property that moves geometry").toContain("width");
  const afterControl = lines.length;

  // Count the exempted transition's OWN start events: the carve-out must be a deliberate silence on a
  // transition that ran, never the absence of a transition.
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbColourTransitionStarts?: number };
    root.__orbColourTransitionStarts = 0;
    document.addEventListener(
      "transitionstart",
      (event) => {
        const target = event.target;
        if (target instanceof Element && target.matches('[data-testid="carve-out-colour-card"]')) {
          root.__orbColourTransitionStarts = (root.__orbColourTransitionStarts ?? 0) + 1;
        }
      },
      { capture: true },
    );
  });

  await component.getByTestId("carve-out-colour-card").hover();
  await expect.poll(() => colourTransitionStarts(page)).toBeGreaterThan(0);
  // …and the EXIT leg: the pointer has already left when the hover-out transition starts, so a bare
  // state read would flag every unhover. The latch is what makes this half silent too.
  // Well clear of both 120×40 cards — (0,0) is INSIDE the first one (the mount root sits at the
  // viewport origin), so it leaves the hover-out leg unfired and the exit assertion vacuous.
  await page.mouse.move(500, 400);
  await expect.poll(() => colourTransitionStarts(page), "the hover-out colour transition must also run").toBeGreaterThan(1);

  expect(lines.length, "neither the hover-in nor the hover-out colour leg may raise [anim]").toBe(afterControl);
  expect(lines.join("\n")).not.toContain("carve-out-colour-card");
});

test("the reduced-motion floor does not raise dirty-animation or dropped-frame flags", async ({ mount, page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[anim]") || message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersReducedMotionStory />);
  await component.getByRole("button", { name: "change color" }).click();
  await expect(component.getByTestId("dirty-color-transition")).toHaveCSS("color", "rgb(255, 0, 0)");
  await component.evaluate(
    () =>
      new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      }),
  );
  expect(lines).toEqual([]);
});

test("a blocked animation frame is flagged without a document-wide animation-tree read", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersDropStory />);
  const trigger = component.getByRole("button", { name: "start blocked animation" });
  await expect.poll(async () => await trigger.boundingBox()).not.toBeNull();
  const box = await trigger.boundingBox();
  if (box === null) {
    return;
  }
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbDocumentAnimationReads?: number; __orbInstrumentAnimationFrames?: number };
    const original = document.getAnimations.bind(document);
    const nativeRequestAnimationFrame = globalThis.requestAnimationFrame.bind(globalThis);
    root.__orbDocumentAnimationReads = 0;
    root.__orbInstrumentAnimationFrames = 0;
    document.getAnimations = (...args): Animation[] => {
      root.__orbDocumentAnimationReads = (root.__orbDocumentAnimationReads ?? 0) + 1;
      return original(...args);
    };
    globalThis.requestAnimationFrame = (callback): number => {
      root.__orbInstrumentAnimationFrames = (root.__orbInstrumentAnimationFrames ?? 0) + 1;
      return nativeRequestAnimationFrame(callback);
    };
  });

  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => lines.length).toBeGreaterThan(0);
  const instrument = await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbDocumentAnimationReads?: number; __orbInstrumentAnimationFrames?: number };
    return { animationReads: root.__orbDocumentAnimationReads ?? 0, animationFrames: root.__orbInstrumentAnimationFrames ?? 0 };
  });

  expect(instrument.animationReads, "the drop instrument does not force global animation/style resolution").toBe(0);
  expect(instrument.animationFrames, "the drop instrument consumes the existing LoAF clock instead of scheduling a second frame loop").toBe(0);
});

// PLANTED-DEFECT PROOF (P8) for the `[drop]` channel's RE-ARM. The first plant is the ordinary stutter;
// the SECOND — same surface, after a checkpoint — is the one a driven multi-step probe depends on, and it
// REDs if either half of the re-arm regresses: `raise`'s per-`tag|offender` dedupe surviving the reset
// (the offender label is identical by construction), or `resetFrameDropFlagger` clearing the lifetime map
// without the still-live/restarted animation re-registering.
test("a SECOND planted stutter on the same surface after a checkpoint fires [drop] again", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersDropRearmStory />);

  await component.getByRole("button", { name: "plant stutter" }).click();
  await expect.poll(() => lines.length).toBeGreaterThan(0);
  const afterFirst = lines.length;

  await component.getByRole("button", { name: "reset evidence" }).click();
  await component.getByRole("button", { name: "plant stutter" }).click();
  await expect.poll(() => lines.length, "the checkpoint must re-arm BOTH the dedupe identity and the lifetime accounting").toBeGreaterThan(afterFirst);
  expect(lines.at(-1)).toContain("[data-testid=rearm-animation]");
});

test("motion-audit pause skips duplicate CSS/WAAPI lifetime work and ordinary [drop] resumes", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersAuditPauseStory />);
  await expect(component.getByTestId("audit-pause-flaggers-settled")).toHaveText("settled");
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbDropTargetInspections?: number; __orbDropTimingReads?: number };
    const nativeClosest = Element.prototype.closest;
    const nativeTiming = AnimationEffect.prototype.getComputedTiming;
    root.__orbDropTargetInspections = 0;
    root.__orbDropTimingReads = 0;
    Element.prototype.closest = function (this: Element, selector: string): Element | null {
      if (selector.includes("tsd-") && selector.includes("TanStack Devtools")) {
        root.__orbDropTargetInspections = (root.__orbDropTargetInspections ?? 0) + 1;
      }
      return nativeClosest.call(this, selector);
    };
    AnimationEffect.prototype.getComputedTiming = function (this: AnimationEffect): ComputedEffectTiming {
      root.__orbDropTimingReads = (root.__orbDropTimingReads ?? 0) + 1;
      return nativeTiming.call(this);
    };
  });

  await component.getByRole("button", { name: "pause audit drop tracking" }).click();
  await component.getByRole("button", { name: "plant CSS drop" }).click();
  await component.getByRole("button", { name: "plant WAAPI drop" }).click();
  // @orb-waive test-determinism(.waitForTimeout): the SUBJECT of this negative control IS elapsed wall time — it proves observer work does NOT happen during a fixed real-time window while tracking is paused, which no DOM condition can stand in for. Ends if the pause proof gains a deterministic (non-time-based) signal.
  // biome-ignore lint/nursery/noPlaywrightWaitForTimeout: this negative control must leave enough wall time for forbidden observer work to occur.
  await page.waitForTimeout(250);
  const paused = await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbDropTargetInspections?: number; __orbDropTimingReads?: number };
    return { targets: root.__orbDropTargetInspections ?? 0, timings: root.__orbDropTimingReads ?? 0 };
  });
  expect(paused, "the audit pause returns before target/timing inspection, not merely before console output").toEqual({ targets: 0, timings: 0 });
  expect(lines).toEqual([]);

  await component.getByRole("button", { name: "resume audit drop tracking" }).click();
  await component.getByRole("button", { name: "plant CSS drop" }).click();
  await expect.poll(() => lines.length).toBeGreaterThan(0);
});

test("the audit CDP rail still sees a real dropped-frame plant while in-page [drop] is paused", async ({ mount, page }) => {
  const component = await mount(<MotionFlaggersAuditPauseStory />);
  const cdp = await page.context().newCDPSession(page);
  const events: Parameters<typeof droppedFramePct>[0][number][] = [];
  cdp.on("Tracing.dataCollected", (event: { value: typeof events }) => events.push(...event.value));
  await cdp.send("Tracing.start", {
    categories: "benchmark,disabled-by-default-devtools.timeline.frame,disabled-by-default-devtools.timeline",
    transferMode: "ReportEvents",
  });
  await component.getByRole("button", { name: "pause audit drop tracking" }).click();
  await component.getByRole("button", { name: "plant CDP drop" }).click();
  // @orb-waive test-determinism(.waitForTimeout): Chrome tracing has no DOM condition to poll — the SUBJECT is a fixed 250ms real-time block inside this capture interval, which only elapsed wall time can express. Ends if CDP tracing gains a completion signal this capture can await instead.
  // biome-ignore lint/nursery/noPlaywrightWaitForTimeout: Chrome tracing has no DOM condition; the plant owns a fixed 250ms block inside this capture interval.
  await page.waitForTimeout(500);
  const completed = new Promise<void>((resolve) => cdp.once("Tracing.tracingComplete", () => resolve()));
  await cdp.send("Tracing.end");
  await completed;

  const frames = droppedFramePct(events);
  expect(frames.total, "the real trace must contain PipelineReporter frames").toBeGreaterThan(0);
  const pipelineStates = events.reduce<Record<string, number>>((counts, event) => {
    const report = event.args?.frame_reporter;
    if (event.name !== "PipelineReporter" || report === undefined) {
      return counts;
    }
    const key = `${report.state ?? "unknown"}/${report.affects_smoothness === true ? "smoothness" : "ordinary"}`;
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
  expect(
    frames.pct,
    `the blocked transition must breach motion-audit's unchanged 5% dropped-frame budget; ${JSON.stringify({ frames, pipelineStates })}`,
  ).toBeGreaterThan(5);
});

test("WAAPI finish/cancel retire targets while a blocked live effect still raises [drop]", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersWaapiDropStory />);
  await page.evaluate(() => {
    const root = document.documentElement as HTMLElement & { __orbDocumentAnimationReads?: number };
    const original = document.getAnimations.bind(document);
    root.__orbDocumentAnimationReads = 0;
    document.getAnimations = (...args): Animation[] => {
      root.__orbDocumentAnimationReads = (root.__orbDocumentAnimationReads ?? 0) + 1;
      return original(...args);
    };
  });

  await component.getByRole("button", { name: "retire WAAPI effects" }).click();
  await expect(component.getByTestId("waapi-effects-retired")).toBeVisible();
  // THE SETTLE BARRIER (#422). `[drop]` is raised from the LoAF observer, whose delivery is async — so
  // reading `lines` off the click alone passed vacuously (proved: a planted overlap went green here
  // while the console carried the accusing line). This waits for the blocked frame to be OBSERVED and
  // classified, and its value is the premise the next assertion needs: `motion-animation-state.ts`
  // attributes an ended lifetime by exact interval overlap, so only a frame STARTING after a boundary
  // sampled after retirement is a retired-target test at all. "overlap" ⇒ the staging drifted, not the
  // flagger.
  await expect(
    component.getByTestId("waapi-blocked-frame-order"),
    "the blocked frame must start after the post-retirement boundary, or a [drop] on it would be an honest overlap",
  ).toHaveText("after");
  expect(lines, "finished/canceled WAAPI targets cannot flag a later blocked idle frame").toEqual([]);

  await component.getByRole("button", { name: "start blocked WAAPI" }).click();
  await expect.poll(() => lines.length).toBeGreaterThan(0);
  const reads = await page.evaluate(
    () => (document.documentElement as HTMLElement & { __orbDocumentAnimationReads?: number }).__orbDocumentAnimationReads ?? 0,
  );
  expect(reads, "WAAPI accounting never reintroduces a document animation-tree read").toBe(0);
});

test("a checkpoint retires the lifetime of a pre-checkpoint animation", async ({ mount, page }) => {
  const lines: string[] = [];
  page.on("console", (message) => {
    if (message.text().includes("[drop]")) {
      lines.push(message.text());
    }
  });
  const component = await mount(<MotionFlaggersCheckpointStory />);
  await component.getByRole("button", { name: "start animation" }).click();
  await component.getByRole("button", { name: "reset evidence" }).click();
  await page.evaluate(blockMainThread, 80);
  await component.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())));
  expect(lines).toEqual([]);
});
