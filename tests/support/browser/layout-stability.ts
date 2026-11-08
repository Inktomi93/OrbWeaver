// Post-ready movement of a checkpoint's own witnesses, sampled per frame so an engine without layout-shift entries can
// take it. It is an application measure over one settle window, never standard CLS, and never summed into one.
import type { Locator, Page } from "@playwright/test";
import type { SerializedPerformanceEntry } from "./performance-entry.ts";
import { diagnosticTarget } from "./performance-entry.ts";

/** The browser's CLS session gap: a shift this long after readiness no longer belongs to the action that declared it. */
export const STABILITY_SETTLE_MS = 1000;
// Fractional layout snapping moves a box by less than a pixel without visible movement.
const MOVEMENT_TOLERANCE_PX = 1;

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
  /** A running Web Animation or CSS transition targeted the witness or an ancestor: authored motion, not instability. */
  readonly animated: boolean;
}

interface WitnessSamples {
  readonly timeOrigin: number;
  readonly readyAt: number;
  readonly settledAt: number;
  readonly frames: number;
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
  /** Movements with no running animation behind them; the checkpoint verdict. */
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
      async ({ named, settleMs, tolerance }) => {
        const readyAt = performance.now();
        const boxOf = (node: Element): Box => {
          const { x, y, width, height } = node.getBoundingClientRect();
          return { x, y, width, height };
        };
        const moved = (from: Box, to: Box): boolean => (["x", "y", "width", "height"] as const).some((edge) => Math.abs(to[edge] - from[edge]) > tolerance);
        const animating = (node: Element): boolean =>
          document
            .getAnimations()
            .some(({ playState, effect }) => playState === "running" && effect instanceof KeyframeEffect && effect.target?.contains(node) === true);
        const subjects = named.map(({ node, target }) => ({ node, target, initial: boxOf(node), reference: boxOf(node) }));
        const movements: WitnessMovement[] = [];
        let frames = 0;
        let incomplete: string | null = null;
        const sample = (at: number): void => {
          for (const subject of subjects) {
            if (!subject.node.isConnected) {
              incomplete = `${subject.target} left the document ${String(Math.round(at))}ms after readiness`;
              return;
            }
            const to = boxOf(subject.node);
            if (moved(subject.reference, to)) {
              movements.push({ witness: subject.target, at, from: subject.reference, to, animated: animating(subject.node) });
              subject.reference = to;
            }
          }
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
          witnesses: subjects.map(({ target, initial }) => ({ target, initial })),
          movements,
          incomplete,
        };
      },
      { named: handles, settleMs: windowMs, tolerance: MOVEMENT_TOLERANCE_PX },
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
