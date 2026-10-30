import type { WorkloadRef } from "@orb/contracts/workloads";
import type { StartWorkloadParams } from "./params.ts";

/** The workloads front door verb, shared by the service surface and the schedule tick that enqueues through it. */
export type StartWorkload = (params: StartWorkloadParams) => Promise<WorkloadRef>;
