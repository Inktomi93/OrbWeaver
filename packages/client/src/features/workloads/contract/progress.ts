// Client-owned projections derive their production wire/input homes; computed presentation data stays local.

import type { WorkloadProgress } from "@orb/contracts/workloads";

export type WorkloadProgressView = Readonly<{ pct: NonNullable<WorkloadProgress["pct"]> | null; label: NonNullable<WorkloadProgress["message"]> | null }>;
