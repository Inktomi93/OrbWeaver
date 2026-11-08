// Post-ready movement of a checkpoint's own witnesses, sampled per frame so an engine without layout-shift entries can
// take it. It is an application measure over one settle window, never standard CLS, and never summed into one.
import type { Locator, Page } from "@playwright/test";
import type { SerializedPerformanceEntry } from "./performance-entry.ts";
import { diagnosticTarget } from "./performance-entry.ts";

/** The browser's CLS session gap: a shift this long after readiness no longer belongs to the action that declared it. */
export const STABILITY_SETTLE_MS = 1000;
// Fractional layout snapping moves a box by less than a pixel without visible movement.
const MOVEMENT_TOLERANCE_PX = 1;
// Keyframe property names (camelCase) whose animation moves or resizes a box; opacity and colour never do.
const GEOMETRY_PROPERTY =
  "^(?:transform|translate|rotate|scale|offset[A-Z]\\w*|inset\\w*|top|right|bottom|left|(?:min|max)?(?:width|Width|height|Height|blockSize|BlockSize|inlineSize|InlineSize)|margin\\w*|padding\\w*|border\\w*Width|fontSize|lineHeight|gap|rowGap|columnGap|flex\\w*|grid\\w*)$";

/** A box in the coordinate space of the document content: scroll ancestors' offsets are added back, so a scroll is not movement. */
interface Box {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

interface WitnessMovement {
  readonly witness: string;
  /** Milliseconds after `readyAt`. */
  readonly at: number;
  readonly from: Box;
  readonly to: Box;
  /**
   * A running effect on the witness or an ancestor animates a geometry property, in this frame or the one before it:
   * authored motion, not instability. The frame before covers a transition's last step, which lands after it finished.
   */
  readonly animated: boolean;
}

interface WitnessSamples {
  readonly timeOrigin: number;
  readonly readyAt: number;
  readonly settledAt: number;
  readonly frames: number;
  /** Frames in which a witness's scroll ancestors changed offset; their movement is removed from the boxes. */
  readonly scrolledFrames: number;
  readonly witnesses: readonly { readonly target: string; readonly initial: Box }[];
  readonly movements: readonly WitnessMovement[];
  readonly incomplete: string | null;
}

type NativeLayoutShift =
  | { readonly status: "measured"; readonly entries: readonly Extract<SerializedPerformanceEntry, { readonly kind: "layout-shift" }>[] }
  | { readonly status: "unsupported" | "uninstrumented"; readonly reason: string };

export interface CheckpointStability extends WitnessSamples {
  readonly measure: "post-ready-witness-movement";
  readonly status: "measured" | "incomplete";
  readonly windowMs: number;
  readonly tolerancePx: number;
  /** Movements with no geometry animation behind them; the checkpoint verdict. */
  readonly unexpected: number;
  /** The engine's own entries inside the same window, retained beside the engine-independent measure. */
  readonly nativeLayoutShift: NativeLayoutShift;
}

async function sampleWitnesses(page: Page, witnesses: readonly Locator[], windowMs: number): Promise<WitnessSamples> {
  const handles = await Promise.all(
    witnesses.map(async (witness) => ({ target: await witness.evaluate(diagnosticTarget), node: await witness.elementHandle() })),
  );
  try {
    return await page.evaluate(
      async ({ named, settleMs, tolerance, geometrySource }) => {
        const readyAt = performance.now();
        const geometry = new RegExp(geometrySource, "u");
        const scrollOffset = (node: Element): { readonly x: number; readonly y: number } => {
          let x = 0;
          let y = 0;
          for (let ancestor = node.parentElement; ancestor !== null; ancestor = ancestor.parentElement) {
            x += ancestor.scrollLeft;
            y += ancestor.scrollTop;
          }
          return { x, y };
        };
        const boxOf = (node: Element, scroll: { readonly x: number; readonly y: number }): Box => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x: x + scroll.x, y: y + scroll.y, width, height };
        };
        const scrollMoved = (from: { readonly x: number; readonly y: number }, to: { readonly x: number; readonly y: number }): boolean =>
          from.x !== to.x || from.y !== to.y;
        const moved = (from: Box, to: Box): boolean => (["x", "y", "width", "height"] as const).some((edge) => Math.abs(to[edge] - from[edge]) > tolerance);
        const movesBoxes = (effect: KeyframeEffect): boolean => effect.getKeyframes().some((frame) => Object.keys(frame).some((key) => geometry.test(key)));
        const geometryAnimating = (node: Element): boolean =>
          document
            .getAnimations()
            .some(
              ({ playState, effect }) =>
                playState === "running" &&
                effect instanceof KeyframeEffect &&
                effect.pseudoElement === null &&
                effect.target?.contains(node) === true &&
                movesBoxes(effect),
            );
        const subjects = named.map(({ node, target }) => {
          const scroll = scrollOffset(node);
          return { node, target, scroll, initial: boxOf(node, scroll), reference: boxOf(node, scroll), animatedBefore: geometryAnimating(node) };
        });
        const movements: WitnessMovement[] = [];
        let frames = 0;
        let scrolledFrames = 0;
        let incomplete: string | null = null;
        const sample = (at: number): void => {
          let scrolled = false;
          for (const subject of subjects) {
            if (!subject.node.isConnected) {
              incomplete = `${subject.target} left the document ${String(Math.round(at))}ms after readiness`;
              return;
            }
            const scroll = scrollOffset(subject.node);
            scrolled ||= scrollMoved(subject.scroll, scroll);
            subject.scroll = scroll;
            const to = boxOf(subject.node, scroll);
            const animatedNow = geometryAnimating(subject.node);
            if (moved(subject.reference, to)) {
              movements.push({ witness: subject.target, at, from: subject.reference, to, animated: animatedNow || subject.animatedBefore });
              subject.reference = to;
            }
            subject.animatedBefore = animatedNow;
          }
          scrolledFrames += scrolled ? 1 : 0;
        };
        await new Promise<void>((resolve) => {
          const tick = (): void => {
            frames += 1;
            const at = performance.now() - readyAt;
            sample(at);
            if (incomplete === null && at < settleMs) {
              requestAnimationFrame(tick);
            } else {
              resolve();
            }
          };
          requestAnimationFrame(tick);
        });
        return {
          timeOrigin: performance.timeOrigin,
          readyAt,
          settledAt: performance.now(),
          frames,
          scrolledFrames,
          witnesses: subjects.map(({ target, initial }) => ({ target, initial })),
          movements,
          incomplete,
        };
      },
      { named: handles, settleMs: windowMs, tolerance: MOVEMENT_TOLERANCE_PX, geometrySource: GEOMETRY_PROPERTY },
    );
  } finally {
    await Promise.all(handles.map(async ({ node }) => await node.dispose()));
  }
}

// Reuses the document's installed web-vitals observers rather than registering a second layout-shift observer.
async function nativeShifts(page: Page, { timeOrigin, readyAt, settledAt }: WitnessSamples): Promise<NativeLayoutShift> {
  return await page.evaluate(
    (window): NativeLayoutShift => {
      const store = globalThis.__surfaceVitals;
      if (store === undefined || store.timeOrigin !== window.timeOrigin) {
        return { status: "uninstrumented", reason: "The sampled document's web-vitals observers were not installed before navigation" };
      }
      if (!store.supportedEntryTypes.includes("layout-shift")) {
        return { status: "unsupported", reason: "This engine publishes no layout-shift entries" };
      }
      for (const observer of store.observers) {
        store.entries.push(...observer.takeRecords());
      }
      return {
        status: "measured",
        entries: store.entries
          .filter(({ entryType, startTime }) => entryType === "layout-shift" && startTime >= window.readyAt && startTime <= window.settledAt)
          .map(store.serializeEntry)
          .filter((entry) => entry.kind === "layout-shift"),
      };
    },
    { timeOrigin, readyAt, settledAt },
  );
}

/** Freeze `readyAt` now, then sample every witness's box once per frame across the settle window. */
export async function readCheckpointStability(witnesses: readonly [Locator, ...Locator[]], windowMs = STABILITY_SETTLE_MS): Promise<CheckpointStability> {
  const page = witnesses[0].page();
  const samples = await sampleWitnesses(page, witnesses, windowMs);
  return {
    measure: "post-ready-witness-movement",
    status: samples.incomplete === null ? "measured" : "incomplete",
    windowMs,
    tolerancePx: MOVEMENT_TOLERANCE_PX,
    ...samples,
    unexpected: samples.movements.filter(({ animated }) => !animated).length,
    nativeLayoutShift: await nativeShifts(page, samples),
  };
}
