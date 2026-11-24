// The run shapes of motion-audit: parsed args, the reach queue, the in-page motion records (derived from
// packages/client/src/lib/agent-bridge-contract.ts, the type the probe reads through __orb), the CDP trace event shape,
// and the audit result.
//
// REACH VOCABULARY LIMITATION (#1072): the audit's reach vocabulary is `click` (a measured
// `page.mouse.click`) and `nav` (a dev-bridge navigation). Gesture-driven motion — drag, swipe,
// pinch (guide §3 rule 6: "springs for gesture-driven/interruptible") — is architecturally outside
// this tool's measurement window. The audit observes a DISCRETE click→settle interval via CDP
// tracing; a gesture is a CONTINUOUS input sequence whose frame budget, settle behavior (spring
// physics vs. tween) and interruptibility properties require a fundamentally different driver and
// verdict shape. Playwright supports `page.locator.dragTo()` but not multi-touch/pinch, and the
// tool's single-click→window architecture would need a gesture driver that emits input events over
// time and measures frames DURING the interaction, not after a settle. Coverage of gesture-driven
// surfaces (drawer swipe, drag-reorder release) therefore requires live manual measurement or a
// purpose-built gesture-audit instrument — it cannot be bolted onto this tool's reach queue.
import type {
  AnimationRecord as BridgeAnimationRecord,
  LoafRecord as BridgeLoafRecord,
  MotionFlagRecord as BridgeMotionFlagRecord,
  MotionSnapshot as BridgeMotionSnapshot,
  ShiftRecord as BridgeShiftRecord,
} from "@orb/client/agent-bridge-contract";
import type { AppearancePatch } from "@orb/tooling/floor/appearance/appearance";
import type { ThemeRequest } from "@orb/tooling/floor/appearance/theme";
import type { BrowserEnvironmentEvidence } from "@orb/tooling/floor/browser/browser-environment";
import type { Viewport } from "@orb/tooling/floor/instrument/argv";
import type { NavMethod } from "@orb/tooling/floor/instrument/nav";

/** One pre-trace REACH action, in argv order: a DOM click or a dev-bridge navigation. Never measured —
 *  see the header's reach-vs-measure note. */
type ReachAction = { kind: "click"; selector: string } | { kind: "nav"; method: NavMethod; target: string };

export interface Args {
  /** `--help`/`-h` (HELP_FLAGS, `floor/instrument/instrument-argv.ts`): print `MOTION_AUDIT_HELP` and exit 0 —
   *  before this family, `--help` was an unknown flag and exited 3 (measured 8 hits, design §1 P5). */
  help: boolean;
  route: string;
  url: string | null;
  base: string;
  /** True once `--base` was passed explicitly — a `--session` attach without it falls back to the
   *  session's own bound URL instead of `DEFAULT_BASE` (#1289, design §3.6 "sibling instruments inherit
   *  the binding from the session"); an explicit `--base` still overrides (#1285's composing rule). */
  baseExplicit: boolean;
  isolated: boolean;
  ref: string | null;
  dirty: boolean;
  fresh: boolean;
  stageShortSha: string | null;
  /** Run the six-cell scenario/application-motion/OS-motion/device representative matrix. */
  matrix: boolean;
  selector: string | null;
  reach: ReachAction[];
  windowMs: number;
  viewport: Viewport;
  /** null = raw desktop viewport; a name selects the shared full Playwright device descriptor. */
  device: string | null;
  colorScheme: "light" | "dark" | null;
  /** The OS media-query arm, independent of the app's persisted Appearance reducedMotion setting. */
  osReducedMotion: boolean;
  out: string | null;
  json: boolean;
  vnc: boolean;
  throttle: boolean;
  /** `--appearance`/`--appearance-preset`/`--full-motion`: the app-SETTING shim (floor/appearance/appearance.ts).
   *  This is independent of `osReducedMotion`: the former owns the app carrier, while the latter owns the
   *  browser media query. null = the account's real app state. */
  appearance: AppearancePatch | null;
  /** `--theme <name|id|none>`: the ACTIVE THEME this run pretends is selected, shimmed over the same
   *  `settings.getUserSettings` response (never written — floor/appearance/theme.ts). null = the account's own theme. */
  theme: ThemeRequest | null;
  /** `--session <name>` (#1285, WHERE_FLAGS `floor/instrument/instrument-argv.ts`): attach to a live snap
   *  session's browser instead of launching a fresh one — null = launch (today's behaviour, unchanged). */
  session: string | null;
  /** CLI misuse collected without side effects; any entry means EXIT.misuse (3) before a browser boots. */
  errors: string[];
}

// ── The in-page motion records, as the bridge declares them. `--isolated --ref <old sha>` serves a bundle that predates
// some members, so the ones that postdate an older bundle are optional here and the validators in `ops/page-validate.ts`
// accept their absence. Each derivation names its members, so a client rename or removal fails the typecheck. ──
type BridgeLoafScript = BridgeLoafRecord["scripts"][number];

export interface LoafRecord extends Omit<BridgeLoafRecord, "scripts"> {
  readonly scripts: ReadonlyArray<
    Pick<BridgeLoafScript, "sourceURL" | "duration"> & Partial<Pick<BridgeLoafScript, "forcedStyleAndLayoutDuration" | "invoker" | "sourceFunctionName">>
  >;
}

/** One attributed layout shift as the collector's ring publishes it. Diagnostic passthrough: the report names the
 *  waves, no budget arm reads it — the ring is CAPPED, so deriving a total from it would silently under-count. */
export type ShiftRecord = BridgeShiftRecord;

/** WHICH CLS total a run's budget is entitled to judge — reported on the RESULT line, never inferred by
 *  a reader. `non-virtualized` is the #109 spec total (an ENTRY/navigation window, where no trusted input
 *  happened and the spec metric excluded nothing); `observed-non-virtualized` is the #1071 total an
 *  INTERACTION window is judged on, because Chrome empties `cls` of everything within 500ms of the
 *  measured click. `lib/verdicts.ts` `clsBudgetBasis` is the ONE selector. */
const CLS_BUDGET_BASES = ["non-virtualized", "observed-non-virtualized"] as const;
export type ClsBudgetBasis = (typeof CLS_BUDGET_BASES)[number];

/** The members a bundle older than the virtualized split, the observed twin or the shift ring lacks. Absence of
 *  an observed member CANNOT fall back to `cls`: that reinstates the false PASS the observed total exists to close, so
 *  `lib/verdicts.ts` raises an evidence gap instead (`lib/evidence.ts` `observedClsGap`). */
const OLDER_BUNDLE_MOTION_MEMBERS = [
  "virtualizedCls",
  "nonVirtualizedCls",
  "observedCls",
  "observedVirtualizedCls",
  "observedNonVirtualizedCls",
  "shifts",
] as const;
type OlderBundleMotionMember = (typeof OLDER_BUNDLE_MOTION_MEMBERS)[number];

export type MotionSnapshot = Omit<BridgeMotionSnapshot, OlderBundleMotionMember | "loafs"> &
  Partial<Pick<BridgeMotionSnapshot, OlderBundleMotionMember>> & { readonly loafs: readonly LoafRecord[] };

/** The members an older bundle lacks. Absence is unattributed evidence, never clean. */
const OLDER_BUNDLE_ANIMATION_MEMBERS = ["targetState", "lifecycleState", "attribution", "timeline"] as const;
type OlderBundleAnimationMember = (typeof OLDER_BUNDLE_ANIMATION_MEMBERS)[number];

export type AnimationRecord = Omit<BridgeAnimationRecord, OlderBundleAnimationMember> & Partial<Pick<BridgeAnimationRecord, OlderBundleAnimationMember>>;

/** One `__orb.flags()` raise. motion-audit consumes the `anim` channel ONLY, and consumes the raw `animation` FACTS —
 *  never the channel's own `overBudget` verdict, which is guide §3.7's console policy and not this tool's.
 *  `animation` is present on `anim` raises from a bundle that postdates the animation payload; absent, the raise cannot
 *  be sanctioned and counts as an ordinary unattributed dirty animation. */
export type MotionFlagRecord = Omit<BridgeMotionFlagRecord, "animation"> & { readonly animation?: AnimationRecord };

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

/** Requested/shimmed/live app reduced-motion identity. Matrix STATIC-EXPECTED is invalid unless all
 * three agree; an argv boolean or a successful interception alone is not evidence of the rendered arm. */
export interface ApplicationMotionEvidence {
  readonly requested: boolean | null;
  readonly applied: boolean | null;
  readonly reached: number;
  readonly samples: readonly unknown[];
}

export interface AuditData {
  readonly environment: BrowserEnvironmentEvidence;
  /** Null for a bundle that predates the live Appearance carrier bridge. Ordinary single-run budgets do
   * not consume it; the rated matrix's STATIC-EXPECTED arm refuses when it is absent. */
  readonly applicationMotion: ApplicationMotionEvidence | null;
  readonly motion: MotionSnapshot | null;
  /** The END-OF-WINDOW `document.getAnimations()` sample: what is STILL RUNNING when the window closes.
   *  A sampler answers "continuous loops", never "did a 130ms transition fire" — `flags` is that half. */
  readonly animations: readonly AnimationRecord[];
  /** The checkpoint-scoped `__orb.flags()` ring for the measured window — the TRANSIENT population
   *  (#1070): every dirty animation that STARTED inside the window, including the whole 130–360ms house
   *  band that is over before the sample above is taken.
   *
   *  `null` ⇔ the page exposes no `flags` member at all. That is NOT an empty ring: it means the
   *  transient population could not be observed, which restores the exact blindness #1070 removed — so
   *  `lib/evidence.ts` raises a gap and the run is not a verdict, the same posture a missing
   *  `resetEvidence`/`motionFlaggersSettled` already gets. An empty ARRAY is the honest "nothing fired". */
  readonly flags: readonly MotionFlagRecord[] | null;
  readonly frames: CalibratedFrames;
  readonly pageErrors: readonly string[];
  /** Every CDP trace event the measured window delivered. Diagnostic only: it separates "the trace ran
   *  and nothing composited" from "tracing delivered nothing at all" in the absent-evidence message. */
  readonly traceEventCount: number;
  readonly stepFailed: boolean;
  /** Reach actions that did not land — the run is FAILED, because the window measured another surface. */
  readonly reachFailures: number;
  /** TRUE ⇔ a real trusted CDP input was dispatched INTO the measured window (the prepared click landed).
   *  This is the fact that decides which CLS total the budget may judge (#1071): Chrome excludes every
   *  shift within 500ms of trusted input from the spec metric, so on a true here `cls` describes a
   *  different window than the one the operator watched. Derived at the dispatch site (`ops/trace.ts`),
   *  never from `opts.selector`: a selector that failed to prepare produces no input at all. */
  readonly measuredInput: boolean;
}

export interface MeasuredClick {
  readonly x: number;
  readonly y: number;
}
