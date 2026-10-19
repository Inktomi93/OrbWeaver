// The prompt-assembly seams where model-facing prose is authored only in a prose catalog (PROSE-1 §7, D132).
// `orb/no-hardcoded-model-prose` in eslint.config.js judges these paths; repo-relative, no leading slash.

/** Directories whose every source file assembles prompt bytes. */
export const MODEL_PROSE_SEAM_PREFIXES = [
  "packages/server/src/domain/rpg/substrate/",
  "packages/server/src/domain/rpg/tools/",
  "packages/server/src/domain/chat/assembly/",
  "packages/server/src/domain/chat/memory/generate/substrate/",
  "packages/server/src/domain/imagery/substrate/",
  "packages/server/src/domain/imagery/tool/",
] as const;

/** Single files outside those directories that assemble prompt bytes. */
export const MODEL_PROSE_SEAM_FILES = [
  "packages/server/src/domain/chat/engine/smart-arbitrate.ts",
  "packages/server/src/domain/chat/verbs/compaction.ts",
  "packages/server/src/domain/automation/engine/arm-executors.ts",
  "packages/server/src/domain/automation/engine/analysis-arm.ts",
  "packages/contracts/src/rpg/extraction-prompt.ts",
] as const;
