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
  /** WHERE THE READER FOUND THE INPUT, or why it could not (#2448). `section=null density=null` used to be
   *  the ONLY trace of a body the reader had mis-shaped, and it reads exactly like "the client posted
   *  nothing" — which is what it was diagnosed as. A tRPC `httpBatchLink` POST body is a DICT keyed by the
   *  procedure's position in the comma-joined path (`arrayToDict`, the trpc client 11.18.0
   *  dist/httpUtils-BNq9QC3d.mjs:24-38), never an array, so the shape word names the door that was taken:
   *  `batch[<i>]` for the dict, `bare` for a single-procedure body, or `unreadable:<why>`. */
  readonly bodyShape: string | null;
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
