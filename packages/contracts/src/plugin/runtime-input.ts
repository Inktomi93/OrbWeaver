import type { InvocationChat } from "./bridge.ts";
import type { PluginCapability } from "./manifest.ts";

/** Data limits shared by the domain and sandbox; operation callbacks remain in their consuming contracts. */
export interface PluginBudgets {
  readonly cpuDeadlineMs: number;
  readonly memoryLimitBytes: number;
  readonly settleGraceMs: number;
}

/** Already-authorized instance data; the app-owned bridge and cold-wake reader are separate operations. */
export interface PluginInstanceCreateData {
  readonly mainJs: string;
  readonly grants: readonly PluginCapability[];
  readonly chat: InvocationChat | null;
  readonly netHosts?: readonly string[];
  readonly budgets?: PluginBudgets;
  readonly label?: string;
}
