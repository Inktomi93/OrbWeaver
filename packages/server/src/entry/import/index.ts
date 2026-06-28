// entry/import — FRONT DOOR for the bulk-import composition driver. `app.ts`'s upload route + the future
// `import-st` job runner import `runProfileImport` (+ its deps/result types) from here, never the internal
// file (the directory-module rule). The driver is the ONE place that constructs the per-owner
// `ImportService` and wires the character/assets cross-feature ops (DECISIONS-LEDGER §7 D3).

export type {
  FailedCard,
  ImportAssetPort,
  ImportCharacterPort,
  ImportedCard,
  ImportFile,
  ProfileImportDeps,
  ProfileImportResult,
} from "./run-profile-import";
export { runProfileImport } from "./run-profile-import";
