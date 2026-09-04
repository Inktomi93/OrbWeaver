// Pure interaction-rate verdict seam shared by the retained collector and Snap's selective --perf arm.
import type { ResultPair } from "../../_shared/artifacts.ts";
import { print } from "../../_shared/artifacts.ts";
import type { BrowserAccelerationEvidence } from "../../_shared/browser-acceleration.ts";
import type { ExitCode } from "../../_shared/exit-contract.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { BoxLoadReader, MeasurementWithholding } from "../../_shared/load-budget.ts";
import { withholdRate } from "../../_shared/load-budget.ts";

export function perfRateDisposition(acceleration: BrowserAccelerationEvidence, read?: BoxLoadReader): MeasurementWithholding {
  if (acceleration.posture !== "hardware") {
    const reason =
      acceleration.posture === "software"
        ? `SOFTWARE-ACCELERATION-WITHHOLD: ${acceleration.backend} is software rendering — interaction timings describe the host, not product performance; this run is NOT a verdict`
        : `BROWSER-ACCELERATION-WITHHOLD: ${acceleration.backend} did not prove enabled GPU compositing and rasterization — interaction timings are NOT a verdict`;
    print(`WITHHELD (${reason})`);
    return { withheld: true, reason };
  }
  const load = withholdRate("Snap --perf per-step timing columns", read);
  if (load.withheld) {
    print(`WITHHELD (${load.reason})`);
  }
  return load;
}

export function perfRatePair(load: MeasurementWithholding | null): ResultPair {
  return load === null ? ["perf", "off"] : ["perf", load.withheld ? "withheld" : "measured"];
}

export function perfRateExit(load: MeasurementWithholding | null, measuredExit: ExitCode): ExitCode {
  return load?.withheld === true ? EXIT.toolError : measuredExit;
}
