// Front door for the bulk-import composition driver, which is the one place that constructs the per-owner
// ImportService and wires the character/assets cross-feature ops.

// The import byte caps now live in the ONE upload cap catalog (@orb/contracts/uploads); re-exported here so
// this barrel's existing consumers (runner-env, the HTTP import edge, tests) keep their import path.
export { IMPORT_MAX_DECOMPRESSED_BYTES, IMPORT_MAX_TOTAL_BYTES } from "@orb/contracts/uploads";
export type {
  ImportAssetPort,
  ImportCharacterPort,
  ImportContextWiring,
  ImportTagPort,
  ImportWorldInfoPort,
} from "./build-import-context.ts";
export { buildImportContext } from "./build-import-context.ts";
export type {
  BundleImportDeps,
  BundleImportFileOutcome,
  BundleImportReport,
  StagedBundleImportDeps,
} from "./run-bundle-import.ts";
export {
  importStagedArchive,
  runBundleImport,
} from "./run-bundle-import.ts";
export type {
  ProfileDirImportDeps,
  ProfileDirImportResult,
} from "./run-profile-dir-import.ts";
export {
  createNodeFsImportPort,
  runProfileDirImport,
} from "./run-profile-dir-import.ts";
export type {
  FailedCard,
  ImportedCard,
  ImportFile,
  ProfileImportDeps,
  ProfileImportResult,
} from "./run-profile-import.ts";
export { runProfileImport } from "./run-profile-import.ts";
export { sniffTreeLayout } from "./sniff-tree-layout.ts";
