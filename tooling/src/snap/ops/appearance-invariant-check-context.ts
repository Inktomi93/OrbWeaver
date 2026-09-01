// The browser facts consumed by the literal R1-R7 semantic checks. Kept separate so the settings/theme
// check arm can split before the tooling size cap without importing the public dispatcher back into itself.

import type { SettingsShimEvidence } from "../../_shared/appearance.ts";
import type { RuntimeMessageRegistryReceipt } from "../../_shared/appearance-matrix.ts";
import type { BrowserEnvironmentEvidence } from "../../_shared/browser-environment.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AppearanceDomSnapshot } from "./appearance-invariant-dom.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap --matrix");

export interface AppearanceMutationIsolationEvidence {
  readonly attempted: number;
  readonly exact: number;
  readonly fulfilled: number;
  readonly continued: number;
  readonly section: string | null;
  readonly density: string | null;
}

export interface AppearanceCheckContext {
  readonly current: AppearanceDomSnapshot;
  readonly before?: AppearanceDomSnapshot;
  readonly environment: BrowserEnvironmentEvidence;
  readonly settings: SettingsShimEvidence;
  readonly pixel: Readonly<Record<string, { readonly sampled: number; readonly passed: boolean; readonly actual: string }>>;
  readonly animations: { readonly total: number; readonly dirty: number; readonly properties: readonly string[] };
  readonly messageCarrier?: {
    readonly registry: RuntimeMessageRegistryReceipt;
    readonly chatStyles: readonly unknown[];
  };
  readonly mutationIsolation?: AppearanceMutationIsolationEvidence;
  readonly prepaint?: { readonly sampled: number; readonly continuous: boolean; readonly actual: string };
}
