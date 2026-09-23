// Screenshot capture: paint-settle (#123 — two identical frames before the PNG), native stabilization
// (SHOT_BASE), element shots, volatile-region masks, and the native crop.
import type { Locator, Page } from "@playwright/test";
import { registerInstrumentArtifact } from "../../../_shared/artifact-out.ts";
import type { InstrumentCurrentScope } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import { budget } from "../../../_shared/load-budget.ts";
import type { ArmArgs, ArmDef, ArmFactEmission, ArmFailureCounts, ArmNeeds } from "../../contract/arms.ts";
import type { Args, ReportCtx } from "../../contract/types.ts";
import { captureScope } from "../../lib/capture-scope.ts";
import { CROP_RE, PNG_EXT_RE } from "../../lib/out-names.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

// Native screenshot stabilization, applied to EVERY shot (page + element):
//   animations:"disabled" — rewinds CSS animations/transitions to a consistent
//     finished state (correct way; supersedes probe-mode's injected killer CSS).
//   caret:"hide"          — no blinking text caret (also Playwright's default).
//   scale:"css"           — one image pixel per CSS pixel; on a hi-dpi context
//     this HALVES pixel count vs the "device" default → ~half the image tokens.
export const SHOT_BASE = { animations: "disabled", caret: "hide", scale: "css" } as const;

// ── Screenshot capture ──────────────────────────────────────────────────────
// One place that decides element-shot vs page-shot, applies native stabilization
// (SHOT_BASE), masks volatile regions, and does the native crop.

/** PAINT-SETTLE (#123). `settlePage` waits a fixed window, and the evidence phase (aria/eval/contrast/
 *  assertions) then runs for however long IT takes before the PNG is taken — so the primary capture can
 *  land on a frame that a late repaint has not reached yet: an image that finished decoding, a webfont
 *  swap, a virtualized list that re-measures after its first read. The artifact then shows a layout the
 *  run's own text evidence already disagrees with.
 *
 *  THE IMAGE-DECODE HOLE (#1517, re-derived on the tree 2026-09-05). The geometry loop below observes the
 *  virtualized re-measure — that one moves the document's dimensions. It is STRUCTURALLY BLIND to an image
 *  landing in RESERVED layout space (explicit width/height, or an aspect-ratio box — the normal case here):
 *  blank and painted measure identically, so two frames match immediately and the shutter fires on the
 *  blank frame. `animations:"disabled"` (SHOT_BASE) does not close it either; it rewinds CSS animations,
 *  and a decode is not one. So the settle asks the resource questions FIRST, from the platform's own
 *  completion signals, and only then runs the geometry loop — which is also the right order, because a
 *  decode or a swap can itself reflow and the loop is what catches that.
 *
 *  THE WEBFONT HALF IS PLAYWRIGHT'S, NOT OURS. #1517 also named a pre-swap webfont; `page.screenshot()`
 *  already awaits `document.fonts.ready` itself (its call log says "waiting for fonts to load..."), and
 *  Chromium settles that promise only after the document's load event — which also covers an image that is
 *  late in the INITIAL load. The `document.fonts.ready` await kept here is therefore NOT the shutter guard
 *  (Playwright's is): it is what makes the geometry loop below judge POST-swap layout instead of comparing
 *  two pre-swap frames. The live exposure this function closes is the image that starts loading AFTER the
 *  app settled — a lazy image, or content a query brings in once `data-app-ready` is up, which is what
 *  this app's surfaces are made of — and its decode window. The pin is
 *  `tests/tooling/snap/ops/arms/shot.int.test.ts`, whose plant is anchored to the run's own evidence pass
 *  because three wall-clock plants could not fail against the old code.
 *
 *  Hold until two CONSECUTIVE animation frames report the same document geometry, then shoot. Bounded
 *  three times over — the resource deadline below, a frame budget, and a per-frame timeout — because a
 *  surface that never goes quiet (a streaming turn, a looping animation, an image that never arrives) must
 *  never block the shot: on a live surface this simply spends its budget and captures, which is the
 *  pre-#123 behaviour. */
const PAINT_SETTLE_MAX_FRAMES = 24;
/** THE ONE SNAP WALL CLOCK THAT IS DELIBERATELY NOT `budget()`-SCALED (owner ruling, #1266). It is a
 *  PER-FRAME SETTLE BOUND, not a tolerance: it says "one animation frame has had long enough to paint",
 *  and 50ms is already ~3x a 60Hz frame. Stretching it under load would not widen a budget — it would
 *  change what "settled" MEANS, letting a slow box call a still-animating surface quiet and shoot it. That
 *  is the third arm #1040 forbids: a rate-shaped judgement answers load by WITHHOLDING, never by widening
 *  the verdict. The run stays bounded twice over regardless (PAINT_SETTLE_MAX_FRAMES caps the whole wait),
 *  so a contended box spends its frame budget and captures — it never hangs.
 *  Named `_MS` and not `_TIMEOUT_MS` because that is what it IS; the gate's clock pattern keys on
 *  `_TIMEOUT_MS`, and the old name asserted a timeout this value has never been. Its `CLOCK_SITES` census
 *  row is deleted with the other three: the row's stated end condition (snap's budgets are scaled) is met,
 *  and an exemption row whose reason has expired is worse than the exception written here in the code. */
const PAINT_SETTLE_FRAME_MS = 50;
/** THE RESOURCE HALF's ceiling, shared by the font wait and the image-decode wait (they run against ONE
 *  deadline, not one each, so the worst case is a single named number). Unlike PAINT_SETTLE_FRAME_MS this
 *  one IS `budget()`-scaled: it is a CEILING on how long a still-arriving byte stream may hold the
 *  shutter, not a statement about what "settled" MEANS, and a contended box legitimately takes longer to
 *  fetch and decode the same bytes. A warm surface answers both questions in microseconds and pays none of
 *  it; an image that never arrives spends the deadline and the shot happens anyway (proved by the 404 arm
 *  of the pin). */
const PAINT_SETTLE_RESOURCE_BASE_MS = 5000;
const PAINT_SETTLE_RESOURCE_MS = budget(PAINT_SETTLE_RESOURCE_BASE_MS);

/** `everyImage`: `--full` shoots the whole scrollable page, so every image is IN the artifact and owes its
 *  decode; a viewport shot waits only for the images it will actually show. */
async function waitForPaintSettle(page: Page, everyImage: boolean): Promise<void> {
  // @orb-waive caught-failure-ownership(catch): documented best-effort optimisation — a torn context makes the shot one frame stale, never absent, per the trailing comment. Ends if the shot stops happening regardless of this failure.
  try {
    // RAW STRING, not a function — the tooling program is DOM-less (document/requestAnimationFrame are
    // browser names), and a serialized function body picks up toolchain name-decoration; the string
    // evaluates untransformed in the page (the same idiom as scanDeadCss/buildContrastScript).
    await page.evaluate(`(async () => {
      const maxFrames = ${PAINT_SETTLE_MAX_FRAMES};
      const frameTimeoutMs = ${PAINT_SETTLE_FRAME_MS};
      const resourceMs = ${PAINT_SETTLE_RESOURCE_MS};
      const everyImage = ${String(everyImage)};
      // ONE deadline for both resource questions, so the two waits cannot compound into an unnamed total.
      const resourceDeadline = performance.now() + resourceMs;
      const bounded = (work) =>
        Promise.race([
          Promise.resolve(work).then(() => undefined, () => undefined),
          new Promise((done) => setTimeout(done, Math.max(0, resourceDeadline - performance.now()))),
        ]);
      // A webfont that is still loading paints as fallback glyphs (font-display: swap) or as NOTHING
      // (the FOIT of font-display: block) — neither moves the geometry the loop below reads.
      await bounded(document.fonts.ready);
      // An image with reserved layout space paints blank-then-content at IDENTICAL dimensions. decode()
      // is the only signal that the bitmap the shutter will capture actually exists; it rejects for a
      // broken or never-arriving source, which the bound above turns back into "shoot anyway".
      const pending = Array.from(document.images).filter((image) => {
        // \`src\`, never \`currentSrc\`: Chromium only publishes currentSrc once the resource is SELECTED,
        // so an image still in flight — the whole case this wait exists for — reads as empty there and
        // would be skipped. An \`<img>\` with no src at all promised nothing and is not waited on.
        if (image.src === "") {
          return false;
        }
        if (everyImage) {
          return true;
        }
        const box = image.getBoundingClientRect();
        return box.width > 0 && box.height > 0 && box.bottom > 0 && box.right > 0 && box.top < innerHeight && box.left < innerWidth;
      });
      await bounded(Promise.all(pending.map((image) => image.decode())));
      const geometry = () => {
        const root = document.documentElement;
        const body = document.body;
        return [root.scrollWidth, root.scrollHeight, root.clientWidth, root.clientHeight, body ? body.scrollHeight : 0, body ? body.childElementCount : 0].join(":");
      };
      // rAF alone can hang forever on a throttled/background tab (--pages 2+), so every frame wait
      // carries its own timer and resolves on whichever comes first.
      const nextFrame = () =>
        new Promise((settled) => {
          const timer = setTimeout(settled, frameTimeoutMs);
          requestAnimationFrame(() => {
            clearTimeout(timer);
            settled(undefined);
          });
        });
      let previous = geometry();
      for (let framesLeft = maxFrames; framesLeft > 0; framesLeft -= 1) {
        await nextFrame();
        const current = geometry();
        if (current === previous) {
          return;
        }
        previous = current;
      }
    })()`);
  } catch {
    // A settle is an OPTIMISATION of the capture, never a precondition for it: if the page navigated or
    // the context went away mid-wait, the shot (and the caller's own error reporting) still has to happen.
    // Swallowing here is the difference between "the PNG is one frame stale" and "there is no PNG".
  }
}

async function captureShot(page: Page, opts: Args, out: string, mask: Locator[]): Promise<void> {
  await waitForPaintSettle(page, opts.fullPage);
  // `--scale` reaches the pixels HERE, at SHOT_BASE's CONSUMER — the shared const is never mutated
  // (#915), so an invocation that does not ask for a scale is byte-identical to every pre-#915 run.
  const base = { ...SHOT_BASE, scale: opts.scale.mode };
  if (opts.shotOf !== null) {
    // Just the element — Playwright auto-crops to its bounding box. The
    // no-pixel-math crop: the cheapest pixels that still show the thing.
    await page
      .locator(opts.shotOf)
      .first()
      .screenshot({ path: out, ...base, mask });
    return;
  }
  await page.screenshot({ path: out, fullPage: opts.fullPage, ...base, mask });
  // Native crop via clip (WxH+X+Y) → <out>-crop.png. No ffmpeg, and the cropped
  // PNG is itself a smaller (cheaper) image to read than the full viewport.
  if (opts.crop !== null) {
    const m = CROP_RE.exec(opts.crop);
    const g = m?.groups;
    if (g?.["w"] !== undefined && g["h"] !== undefined) {
      await page.screenshot({
        path: out.replace(PNG_EXT_RE, "-crop.png"),
        clip: {
          x: Number(g["x"] ?? 0),
          y: Number(g["y"] ?? 0),
          width: Number(g["w"]),
          height: Number(g["h"]),
        },
        ...base,
        mask,
      });
    }
  }
}

async function registerShot(path: string, scope: InstrumentCurrentScope): Promise<void> {
  await registerInstrumentArtifact("snaps", path, {
    producer: "snap",
    producerArm: "shot",
    channel: "screenshot",
    mediaType: "image/png",
    schema: null,
    role: "primary",
    completeness: "complete",
    completenessDetail: "complete screenshot bytes for the settled rendered surface",
    scope,
    records: 1,
    limits: [],
  });
}

/** What the RESULT line's `crop=` says. Every refusal here is IGNORED-with-a-reason rather than silence:
 *  a crop that could not be taken must not read as a crop that was not asked for. */
export function cropOutcome(opts: Args, ctx: ReportCtx): string | null {
  if (opts.crop === null) {
    return null;
  }
  if (!CROP_RE.test(opts.crop)) {
    return `IGNORED — expected WxH+X+Y, got "${opts.crop}"`;
  }
  if (!ctx.produceShot) {
    return "IGNORED — needs a shot (drop --no-shot/--text)";
  }
  if (opts.shotOf !== null) {
    return "IGNORED — mutually exclusive with --shot-of";
  }
  return ctx.out.replace(PNG_EXT_RE, "-crop.png");
}

/** THE PIXEL ARM. It owns the flags that turn the primary capture off (`--no-shot`) or SCOPE it
 *  (`--shot-of`, `--mask`, `--full`, `--crop`). Deliberately NOT its flags: `--scale` (a browser CONTEXT
 *  property — it raises the context's DPR and is a session-level launch fact, not a capture instruction)
 *  and `--baseline`/`--diff` (a separate capability with its own op and its own RESULT pairs, which is
 *  why §6's roster has no `diff` member). Both would otherwise drag launch and comparison concerns into a
 *  capture arm.
 *
 *  It runs LAST in the page pass, which is why `ARMS` is ordered by the pass: the PNG must show the page
 *  the run's own text evidence describes, so every settled-surface read happens before the shutter. */
export const SHOT_ARM = {
  flags: [
    {
      flag: "--no-shot",
      kind: "boolean",
      pageTargetable: false,
      group: "Pixels",
      summary: "skip the primary PNG (the cheap evidence path with --text/--eval/--watch)",
      handler: (a): void => {
        a.shot = false;
      },
    },
    {
      flag: "--shot-of",
      kind: "required-value",
      pageTargetable: false,
      group: "Pixels",
      summary: "capture one element, auto-cropped — the cheapest pixel case",
      handler: (a, rest): void => {
        a.shotOf = rest.shift() ?? null;
      },
    },
    {
      flag: "--mask",
      kind: "required-value",
      pageTargetable: false,
      group: "Pixels",
      summary: "pink-overlay a volatile region so it cannot churn --diff (repeatable)",
      handler: (a, rest): void => {
        const selector = rest.shift();
        if (selector !== undefined && selector !== "") {
          a.mask.push(selector);
        }
      },
    },
    {
      flag: "--full",
      kind: "boolean",
      pageTargetable: false,
      group: "Pixels",
      summary: "the whole scrollable page, not just the viewport",
      handler: (a): void => {
        a.fullPage = true;
      },
    },
    {
      flag: "--crop",
      kind: "required-value",
      pageTargetable: false,
      group: "Pixels",
      summary: "a bounded region (its path prints as crop= on the RESULT line — not a no-op)",
      handler: (a, rest): void => {
        a.crop = rest.shift() ?? null;
      },
    },
  ],
  level: "call",
  needs: (): ArmNeeds => ({}),
  sessionCallBaseMs: (): null => null,
  defaults: (): Pick<ArmArgs, "shot" | "shotOf" | "mask" | "fullPage" | "crop"> => ({ shot: true, shotOf: null, mask: [], fullPage: false, crop: null }),
  help: `  --no-shot               skip the primary PNG
  --shot-of <selector>    capture one element
  --full                  capture the whole scrollable page, not just the viewport
  --mask <selector>       pink-overlay a volatile region so it cannot churn the pixels (repeatable)
  --crop <WxH+X+Y>        capture a bounded region`,
  result: {
    schema: "snap-arm-shot-v1",
    source: "Playwright screenshot",
    lifetime: "settled rendered surface",
    enabled: (opts): boolean => opts.shot || opts.baseline || opts.diff,
  },
  lifecycle: {
    at: "page",
    enabled: ({ plan }): boolean => plan.produceShot,
    run: async ({ page, opts, pageIndex, plan }): Promise<void> => {
      const scope = captureScope(opts, pageIndex, "settled-capture");
      await captureShot(
        page,
        opts,
        plan.out,
        opts.mask.map((selector) => page.locator(selector)),
      );
      await registerShot(plan.out, scope);
      if (opts.crop !== null && CROP_RE.test(opts.crop) && opts.shotOf === null) {
        await registerShot(plan.out.replace(PNG_EXT_RE, "-crop.png"), scope);
      }
    },
    pairs: ({ opts, ctx }): readonly ResultPair[] => [
      ["out", ctx.produceShot ? ctx.out : "(none)"],
      ["crop", cropOutcome(opts, ctx) ?? "none"],
    ],
    // The pixels ARE this arm's evidence and `registerShot` already declares each PNG under `shot` (#1342
    // audit): the fact's `artifacts` list is bound from those declarations. There is nothing this arm
    // prints that is not either the file itself or a RESULT pair.
    evidence: (): Promise<void> => Promise.resolve(),
    facts: (input): readonly ArmFactEmission<"shot">[] =>
      input.outcomes.map((outcome) => ({
        scope: captureScope(input.opts, outcome.pageIndex, "settled-capture"),
        data: {
          state: input.ctx.produceShot ? "passed" : "off",
          detail: null,
          requested: input.ctx.produceShot ? 1 : 0,
          produced: input.ctx.produceShot ? 1 : 0,
        },
      })),
    // A missing or unwritable PNG surfaces as the nav/step failure that caused it; there is no separate
    // "the shot failed" count today and inventing one would change the verdict this phase must not touch.
    failures: (): ArmFailureCounts => ({}),
    exit: (_input, code): number => code,
  },
} satisfies ArmDef<"shot">;
