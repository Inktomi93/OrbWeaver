// The per-page capture plan — beside types.ts so the shot-plan family reads as one unit.
import type { SettingsShimEvidence } from "../../_shared/appearance.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import type { ShotPlan } from "./types.ts";

/** What one capture pass needs to know about the SESSION: the two evidence rings it scopes a checkpoint
 *  over, the environment contract the pass restores after its shot, plus (optionally) the settings-shim
 *  evidence for THIS page's context, which is what the `--theme` readiness gate reads (#1227). A
 *  `ProbeContext` satisfies it as-is; the session paths spread their context 0 in. */
export type CaptureEvidence = Pick<
  ProbeSession,
  "consoleMessages" | "pageErrors" | "diagnostics" | "diagnosticCompleteness" | "diagnosticWindow" | "evidence" | "environmentContract"
> & {
  readonly settingsEvidence?: SettingsShimEvidence | undefined;
};

// One page's full capture pass. Nav actions + steps + captures are FILTERED to this page's index, so a
// flat argv list drives N tabs. On single-page (totalPages 1) every filter is a no-op and the flow is
// byte-identical to the original. `unit` picks the shot suffix: "p" (--pages, the default) or "u"
// (--contexts) — the two modes are mutually exclusive so only one is ever requested per run.
export type PagePlan = ShotPlan & { pageIndex: number; totalPages: number; unit?: "p" | "u"; navigatePage?: boolean };
