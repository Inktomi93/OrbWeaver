// The committed waiver budget per final policy and part: waived plus granted findings inside the application
// subjects, and those in the rest of the declared population (docs/law/gate-runtime-standardization.md §5). An
// absent row is zero. Lower a row when its count falls; never raise one to admit a finding.
import type { WaiverBudget } from "../contract/gate-authority.ts";

const APPLICATION = Object.freeze({
  "assets-single-writer": 6,
  "audit-client-tests": 1,
  "caught-failure-ownership": 680,
  "chat-viewer-plane-canon-reads": 3,
  "contract-structural-copy": 87,
  "contract-verb-presence": 3,
  "css-family-direct-client-mechanism": 3,
  "css-length-tokens": 3,
  "css-length-tokens-grants": 26,
  "css-var-defined-grants": 19,
  "density-tier": 49,
  "detached-work-traced": 4,
  "duplicate-action-doors": 10,
  "integer-line-boxes": 4,
  "json-column-write-parity": 6,
  "knob-wire-coverage": 4,
  "membership-enforcer": 6,
  "no-await-db-in-loop": 13,
  "no-inline-package-interface": 206,
  "no-inline-types": 5,
  "no-inline-wire-interface": 31,
  "no-loose-id-cast": 6,
  "no-manual-memo": 3,
  "no-raw-egress": 1,
  "no-raw-id": 37,
  "no-vanity-alias": 91,
  "nullable-column-inequality": 1,
  "one-principal-mint-population": 2,
  "over-art-plate-arm": 1,
  "owner-scoped-reads": 56,
  "owner-scoped-writes": 29,
  "persistence-boundary": 4,
  "persistence-no-in-memory-state": 55,
  "query-freshness-coverage": 31,
  "render-error-via-battery": 4,
  "scrubber-home": 1,
  "seed-theme-ink-contrast": 9,
  "single-stream-transport": 2,
  "sole-env-reader": 10,
  suppressions: 57,
  "test-reach": 112,
  "tooling-argv-front-door": 1,
  "tooling-artifact-path-home": 1,
  "tooling-browser-door": 2,
  "tooling-child-process-door": 8,
  "tooling-process-exit-home": 1,
  "tooling-project-home": 5,
  "two-class-role-authority": 2,
  "zod-error-issues-home": 8,
});

const IMPLEMENTATION = Object.freeze({
  "caught-failure-ownership": 21,
  "no-inline-types": 1,
  "no-loose-id-cast": 15,
  "no-vanity-alias": 1,
  suppressions: 5,
  "test-determinism": 32,
  "tests-raw-package-reach": 3,
  "tooling-argv-front-door": 2,
  "tooling-child-process-door": 1,
  "tooling-project-home": 1,
});

export const WAIVER_BUDGET: WaiverBudget = Object.freeze({ application: APPLICATION, implementation: IMPLEMENTATION });

/** Names the budget a spawned structure run judges against, as JSON in this environment variable. Unset means
 *  `WAIVER_BUDGET`; the corpus suite sets it so a planted tree is judged against what it plants. */
export const WAIVER_BUDGET_ENV = "ORB_WAIVER_BUDGET";
