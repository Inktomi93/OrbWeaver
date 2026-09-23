import { createStrykerConfig } from "./tooling/src/_shared/stryker-config.ts";

// This exact target set and break threshold are one calibrated unit; change either only after a cold run.
export default createStrykerConfig({
  mutate: [
    "packages/server/src/domain/chat/assembly/assemble.ts",
    "packages/server/src/domain/credentials/verbs/resolve.ts",
    "packages/server/src/domain/admin/guard.ts",
    "packages/server/src/domain/chat/engine/round.ts",
    "!packages/**/*.d.ts",
  ],
  htmlReport: "reports/mutation/gate.html",
  incrementalFile: "reports/stryker-gate-incremental.json",
  breakThreshold: 82,
});
