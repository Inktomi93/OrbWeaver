// Front door for the bulk-import composition driver, which is the one place that constructs the per-owner
// ImportService and wires the character/assets cross-feature ops.

// The import byte caps now live in the ONE upload cap catalog (@orb/contracts/uploads); re-exported here so
// this barrel's existing consumers (runner-env, the HTTP import edge, tests) keep their import path.
export { IMPORT_MAX_DECOMPRESSED_BYTES, IMPORT_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
export type {
  BundleImportDeps,
  BundleImportFileOutcome,
  BundleImportReport,
  StagedBundleImportDeps,
} from "#domain/import";
export {
  bundleImportMemoryChatIds,
  bundleImportNotes,
  importStagedArchive,
  runBundleImport,
} from "#domain/import";
export { createNodeFsImportPort } from "#infra/storage";
export type { ProfileDirImportDeps } from "./run-profile-dir-import.ts";
export { runProfileDirImport } from "./run-profile-dir-import.ts";
export type {
  CardLorebookRestoreDeps,
  ImportFile,
  ProfileImportDeps,
} from "./run-profile-import.ts";
export { runCardLorebookRestore, runProfileImport } from "./run-profile-import.ts";
