// Pure interaction-rate verdict seam shared by the retained collector and Snap's selective --perf arm.
import type { ResultPair } from "../../_shared/artifacts.ts";
import { print } from "../../_shared/artifacts.ts";
import type { BrowserAccelerationEvidence } from "../../_shared/browser-acceleration.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { BoxLoadReader, MeasurementVerdict } from "../../_shared/load-budget.ts";
import { judgeRateLoad } from "../../_shared/load-budget.ts";

export function perfRateDisposition(acceleration: BrowserAccelerationEvidence, read?: BoxLoadReader): MeasurementVerdict {
  if (acceleration.posture !== "hardware") {
    const reason =
      acceleration.posture === "software"
        ? `SOFTWARE-ACCELERATION-WITHHOLD: ${acceleration.backend} is software rendering — interaction timings describe the host, not product performance; this run is NOT a verdict`
        : `BROWSER-ACCELERATION-WITHHOLD: ${acceleration.backend} did not prove enabled GPU compositing and rasterization — interaction timings are NOT a verdict`;
    print(`WITHHELD (${reason})`);
    return { disposition: "withheld", reason };
  }
  const load = judgeRateLoad("Snap --perf per-step timing columns", read);
  if (load.disposition === "load-suspect") {
    // MEASURED AND ANNOUNCED, never skipped (#1616): the columns below are printed and the reader is told
    // in the same breath that they are a reading about a loaded box.
    print(`LOAD-SUSPECT (${load.reason})`);
  }
  return load;
}

/** The arm's RESULT member IS the disposition — one closed vocabulary from the verdict to the transcript. */
export function perfRatePair(load: MeasurementVerdict | null): ResultPair {
  return load === null ? ["perf", "off"] : ["perf", load.disposition === "complete" ? "measured" : load.disposition];
}

/** THE NO-PROMOTION RULE, in the one place the arm can change an exit code (#1616 done-criterion 2): only
 *  a `withheld` rate — a run with NO number, i.e. an unproven browser — is exit-2 class. A `load-suspect`
 *  number exists and is printed, so it must not move the exit in EITHER direction: the run exits on
 *  whatever the other members decided. */
export function perfRateExit(load: MeasurementVerdict | null, measuredExit: ExitCode): ExitCode {
  return load?.disposition === "withheld" ? EXIT.toolError : measuredExit;
}
