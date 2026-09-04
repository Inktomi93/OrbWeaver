// Typed, process-local handoff from the stage owner to the terminal run-index writer. Named-session calls
// cross the process boundary through SessionRunProvenance instead; neither path reconstructs a stage from
// argv or a mutable band table after measurement.
import type { SnapStageProvenance } from "../contract/run-index.ts";
import type { Args } from "../contract/types.ts";

let terminalStageProvenance: SnapStageProvenance | null = null;

export function registerSnapStageProvenance(provenance: SnapStageProvenance): void {
  terminalStageProvenance = provenance;
}

export function currentSnapStageProvenance(): SnapStageProvenance | null {
  return terminalStageProvenance;
}

function defaultSnapStageProvenance(opts: Args): SnapStageProvenance {
  if (opts.session !== null || opts.sessionExport !== null) {
    return {
      mode: "session",
      state: "unavailable",
      ownerCheckout: null,
      band: null,
      ref: null,
      binding: null,
      failure: "the session daemon did not return typed stage provenance",
    };
  }
  if (opts.isolated) {
    return {
      mode: "isolated",
      state: "unavailable",
      ownerCheckout: null,
      band: null,
      ref: opts.dirty ? "dirty-working-tree" : (opts.ref ?? "HEAD"),
      binding: null,
      failure: "the isolated-stage owner did not publish a bound StageRow",
    };
  }
  return {
    mode: "live",
    state: "not-applicable",
    ownerCheckout: null,
    band: null,
    ref: null,
    binding: opts.file === null ? { kind: "base", url: opts.base } : { kind: "file", url: opts.file },
    failure: null,
  };
}

export function takeSnapStageProvenance(opts: Args): SnapStageProvenance {
  const provenance = terminalStageProvenance ?? defaultSnapStageProvenance(opts);
  terminalStageProvenance = null;
  return provenance;
}
