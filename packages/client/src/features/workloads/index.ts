// workloads/ front door (UI-Arch §2.1) — the ONLY entry into the workloads slice (dep-cruiser
// client-feature-front-door). Owns the Workloads AND Backup config groups (client-architecture-lockdown.md
// §8/O3: backup has no standalone feature — it IS the workloads + portability export/import system,
// M6.2 de-god move), both `sections` skimmers over the contributions below
// — a real feature imports no other feature; cross-domain reads ride trpc.*.

export { backupExportSection } from "./lib/backup-export-section.tsx";
export { backupGroup } from "./lib/backup-group.tsx";
export { backupImportSection } from "./lib/backup-import-section.tsx";
export { workloadsGroup } from "./lib/workloads-group.tsx";
export { workloadsJobsSection } from "./lib/workloads-jobs-section.tsx";
export { WORKLOAD_KIND_LABELS } from "./lib/workloads-model.ts";
export { workloadsSchedulesSection } from "./lib/workloads-schedules-section.tsx";
export { workloadsTuningSection } from "./lib/workloads-tuning-section.tsx";
