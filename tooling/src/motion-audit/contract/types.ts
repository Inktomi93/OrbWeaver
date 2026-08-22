// The run shapes of motion-audit: parsed args, the reach queue, the in-page motion snapshot
// (mirrors packages/client/src/lib/motion-stats.ts — the probe reads it via __orb), the CDP trace
// event shape, and the audit result. Split from the pre-move motion-audit.ts (P3 of #393).
import type { AppearancePatch } from "@orb/tooling/_shared/appearance";
import type { Viewport } from "@orb/tooling/_shared/argv";
import type { NavMethod } from "@orb/tooling/_shared/nav";
import type { ThemeRequest } from "@orb/tooling/_shared/theme";

/** One pre-trace REACH action, in argv order: a DOM click or a dev-bridge navigation. Never measured —
 *  see the header's reach-vs-measure note. */
export type ReachAction = { kind: "click"; selector: string } | { kind: "nav"; method: NavMethod; target: string };

export interface Args {
  route: string;
  url: string | null;
  base: string;
  selector: string | null;
  reach: ReachAction[];
  windowMs: number;
  viewport: Viewport;
  vnc: boolean;
  throttle: boolean;
  /** `--appearance`/`--appearance-preset`/`--full-motion`: the app-SETTING shim (_shared/appearance.ts). This
   *  probe already asks the browser for full motion (`reducedMotion:false`, the OS media query) — but the
   *  dev account STORES `appearance.reducedMotion:true`, so without this every number here described an app
   *  whose own setting had frozen the animations being measured. null = the account's real state. */
  appearance: AppearancePatch | null;
  /** `--theme <name|id|none>`: the ACTIVE THEME this run pretends is selected, shimmed over the same
   *  `settings.getUserSettings` response (never written — _shared/theme.ts). null = the account's own theme. */
  theme: ThemeRequest | null;
  /** CLI misuse collected without side effects; any entry means EXIT.misuse (3) before a browser boots. */
  errors: string[];
}

// ── The in-page motion snapshot shapes (mirror motion-stats.ts — the probe reads them via __orb) ──
export interface LoafRecord {
  readonly startTime: number;
  readonly duration: number;
  readonly blockingDuration: number;
  readonly styleAndLayoutStart: number;
  readonly scripts: ReadonlyArray<{
    sourceURL: string;
    duration: number;
    forcedStyleAndLayoutDuration?: number;
    invoker?: string;
    sourceFunctionName?: string;
  }>;
  readonly selectEntrance?: {
    readonly id: number;
    readonly startedAt: number;
    readonly confirmedAt?: number;
    readonly endedAt?: number;
    readonly firstForTrigger: boolean;
  };
}
export interface MotionSnapshot {
  readonly loafs: readonly LoafRecord[];
  readonly cls: number;
  /** The share of `cls` the in-page instrument classified as virtual-row reconciliation (issue #109).
   *  OPTIONAL because this type mirrors whatever bundle is being served: `--isolated --ref <old sha>`
   *  legitimately answers from a page that predates the split. */
  readonly virtualizedCls?: number;
  /** `cls` − `virtualizedCls` — the total this probe's budget gates on. Optional for the same reason. */
  readonly nonVirtualizedCls?: number;
  readonly worstBlocking: number;
  readonly worstShift: number;
}

export interface AnimationRecord {
  readonly target: string;
  readonly properties: readonly string[];
  readonly compositorClean: boolean;
}

export interface TraceEvent {
  readonly name?: string;
  readonly cat?: string;
  readonly ph?: string;
  readonly ts?: number;
  readonly pid?: number;
  readonly tid?: number;
  readonly id2?: { readonly local?: number | string };
  readonly args?: {
    // biome-ignore lint/style/useNamingConvention: `frame_reporter` is Chrome's own trace-event field spelling — the wire vocabulary, not an identifier.
    readonly frame_reporter?: {
      readonly state?: string;
      // biome-ignore lint/style/useNamingConvention: `affects_smoothness` is Chrome's own trace-event field spelling.
      readonly affects_smoothness?: boolean;
    };
  };
}

export interface FrameTotals {
  readonly total: number;
  readonly dropped: number;
  /** NULL ⇔ `total === 0`: an empty population has no percentage, and reporting 0% there would state a
   *  smoothness the probe never observed (#409, lib/evidence.ts owns the verdict consequence). */
  readonly pct: number | null;
}

/** lib/frames.ts's calibratedDroppedFramePct return — raw, Select-entrance-classified, budgeted. */
export interface CalibratedFrames {
  readonly raw: FrameTotals;
  readonly classified: { readonly total: number; readonly dropped: number };
  readonly budgeted: FrameTotals;
}

export interface AuditData {
  readonly motion: MotionSnapshot | null;
  readonly animations: readonly AnimationRecord[];
  readonly frames: CalibratedFrames;
  readonly pageErrors: readonly string[];
  /** Every CDP trace event the measured window delivered. Diagnostic only: it separates "the trace ran
   *  and nothing composited" from "tracing delivered nothing at all" in the absent-evidence message. */
  readonly traceEventCount: number;
  readonly stepFailed: boolean;
  /** Reach actions that did not land — the run is FAILED, because the window measured another surface. */
  readonly reachFailures: number;
}

export interface MeasuredClick {
  readonly x: number;
  readonly y: number;
}
