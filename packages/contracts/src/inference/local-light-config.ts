import { z } from "zod";

export const LOCAL_LIGHT_CPU_PERCENT_FULL = 100;
const DEFAULT_CPU_PERCENT = 50;

/** Percentage of allocated CPUs used to derive a native thread budget, not a CPU-time quota. */
export const localLightCpuPercentSchema = z.number().int().min(1).max(LOCAL_LIGHT_CPU_PERCENT_FULL).default(DEFAULT_CPU_PERCENT);
