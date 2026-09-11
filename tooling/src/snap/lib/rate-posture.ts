// One immutable host/browser posture per Snap run. Rate analyzers consume this value; none may reread the
// box or browser and thereby publish contradictory dispositions inside one evidence bundle.
import { createHash } from "node:crypto";
import type { Browser } from "@playwright/test";
import type { ResultPair } from "../../_shared/artifacts.ts";
import type { BrowserAccelerationEvidence } from "../../_shared/browser-acceleration.ts";
import { readBrowserAcceleration } from "../../_shared/browser-acceleration.ts";
import type { BoxLoad, MeasurementVerdict } from "../../_shared/load-budget.ts";
import { judgeMeasurementLoad, loadResultPairs, readBoxLoad } from "../../_shared/load-budget.ts";
import type { SnapRatePosture } from "../contract/rate-posture.ts";
import { snapRatePostureIdSchema } from "../contract/rate-posture.ts";

export type { SnapRatePosture } from "../contract/rate-posture.ts";

const UNKNOWN_ACCELERATION: BrowserAccelerationEvidence = {
  backend: "unknown",
  posture: "unknown",
  gpuCompositing: "unknown",
  rasterization: "unknown",
  webgl: "unknown",
  webgpu: "unknown",
};

export interface SnapRatePostureReaders {
  readonly readAcceleration?: (browser: Browser) => Promise<BrowserAccelerationEvidence>;
  readonly readLoad?: () => BoxLoad;
}

function postureId(acceleration: BrowserAccelerationEvidence, accelerationError: string | null, load: BoxLoad): SnapRatePosture["id"] {
  const canonical = JSON.stringify({ acceleration, accelerationError, load });
  return snapRatePostureIdSchema.parse(`sha256:${createHash("sha256").update(canonical).digest("hex")}`);
}

/** Starts both authoritative reads exactly once and freezes the value handed to every arm. */
export async function sampleSnapRatePosture(browser: Browser, readers: SnapRatePostureReaders = {}): Promise<SnapRatePosture> {
  const readAcceleration = readers.readAcceleration ?? readBrowserAcceleration;
  const readLoad = readers.readLoad ?? readBoxLoad;
  const load = Object.freeze({ ...readLoad() });
  let acceleration = UNKNOWN_ACCELERATION;
  let accelerationError: string | null = null;
  // @orb-waive caught-failure-ownership(error): this one acceleration-read failure is preserved in accelerationError; ratePostureDisposition reads it first and withholds every rate verdict with the original message. Ends if accelerationError stops feeding that withholding branch or any rate consumer can publish a verdict after this catch.
  try {
    acceleration = await readAcceleration(browser);
  } catch (error) {
    accelerationError = error instanceof Error ? error.message : String(error);
  }
  const frozenAcceleration = Object.freeze({ ...acceleration });
  return Object.freeze({
    id: postureId(frozenAcceleration, accelerationError, load),
    acceleration: frozenAcceleration,
    accelerationError,
    load,
  });
}

/** Pure arm-specific wording over one run-owned receipt. */
export function ratePostureDisposition(receipt: SnapRatePosture, what: string): MeasurementVerdict & { readonly postureId: SnapRatePosture["id"] } {
  const acceleration = receipt.acceleration;
  if (receipt.accelerationError !== null) {
    return {
      // STILL `withheld`, and this is that member's remaining occupant (#1616): an unproven browser leaves
      // NO number worth labelling — a rate read off a software rasteriser is not a suspect reading of the
      // product, it is a reading of something else. LOAD never lands here any more.
      disposition: "withheld",
      reason: `BROWSER-ACCELERATION-WITHHOLD: acceleration could not be proven (${receipt.accelerationError}) — ${what} is NOT a verdict`,
      postureId: receipt.id,
    };
  }
  if (acceleration.posture !== "hardware") {
    const detail =
      acceleration.posture === "software"
        ? `${acceleration.backend} is software rendering`
        : `${acceleration.backend} did not prove enabled GPU compositing and rasterization`;
    return {
      disposition: "withheld",
      reason: `${acceleration.posture === "software" ? "SOFTWARE" : "BROWSER"}-ACCELERATION-WITHHOLD: ${detail} — ${what} is NOT a verdict`,
      postureId: receipt.id,
    };
  }
  return { ...judgeMeasurementLoad(receipt.load, what), postureId: receipt.id };
}

/** DELEGATED, never re-spelled (#1651): the `load=`/`budget-factor=` pair is `_shared/load-budget`'s to
 *  format. This function used to build both strings itself, so when that module started stamping a PLANTED
 *  reading (`load=0.2/24(planted)`) snap's own RESULT line silently kept the un-stamped spelling — the
 *  second-home rot the one-home rule exists to prevent, caught by an assertion on the receipt rather than
 *  by review. The posture already HOLDS its reading, so the reader here is that value, not a fresh
 *  `os.loadavg()` call: one run, one box reading, every line agreeing. */
export function ratePostureResultPairs(receipt: SnapRatePosture): readonly ResultPair[] {
  return [...loadResultPairs(() => receipt.load), ["rate-posture", receipt.id]];
}
