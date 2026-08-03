// workloads/ front door (UI-Arch §2.1) — the ONLY entry into the workloads slice (dep-cruiser
// client-feature-front-door). Owns the Workloads AND Backup settings panes (client-architecture-lockdown.md
// §8/O3: backup has no standalone feature — it IS the workloads + portability export/import system,
// M6.2 de-god move) — a real feature imports no other feature; cross-domain reads ride trpc.*.

export { backupPane } from "./lib/backup-pane.tsx";
export { workloadsJobsSection } from "./lib/workloads-jobs-section.tsx";
export { workloadsPane } from "./lib/workloads-pane.tsx";
export { workloadsSchedulesSection } from "./lib/workloads-schedules-section.tsx";
export { workloadsTuningSection } from "./lib/workloads-tuning-section.tsx";
