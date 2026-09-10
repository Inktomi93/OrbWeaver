import { createStrykerConfig } from "./tooling/src/_shared/stryker-config.ts";

// Exploratory targets stay explicit here; the gate profile has a separately calibrated frozen set.
export default createStrykerConfig({
  mutate: [
    "packages/kit/src/macro/**/*.ts",
    "packages/kit/src/regex/**/*.ts",
    "packages/server/src/domain/chat/assembly/assemble.ts",
    "packages/server/src/domain/chat/persistence/lock.ts",
    "packages/server/src/domain/credentials/**/*.ts",
    "packages/server/src/foundation/observability/audit.ts",
    "packages/server/src/infra/providers/backends/openrouter/**/*.ts",
    "packages/server/src/domain/chat/substrate/stats-delta.ts",
    "packages/server/src/domain/stats/write/rebuild-from-canon.ts",
    "packages/server/src/domain/chat/persistence/canon-write.ts",
    "packages/server/src/domain/chat/memory/recall/recall.ts",
    "packages/server/src/entry/lifecycle.ts",
    "packages/server/src/domain/discovery/substrate/pca.ts",
    "packages/server/src/domain/discovery/substrate/kmeans.ts",
    "packages/server/src/infra/extraction/loaders/epub.ts",
    "packages/server/src/domain/export/verbs/export-chat-bundle.ts",
    "packages/server/src/domain/import/verbs/import-chat-bundle.ts",
    "!packages/**/*.d.ts",
  ],
  htmlReport: "reports/mutation/mutation.html",
  incrementalFile: "reports/stryker-incremental.json",
  breakThreshold: null,
});
