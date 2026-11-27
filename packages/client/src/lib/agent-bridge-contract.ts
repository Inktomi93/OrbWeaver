// The type contract of the dev-only `globalThis.__orb` agent bridge and the plain records its readers return. The one
// `declare global` of `__orb` lives here. Snap and the browser tests type their bridge calls against it through
// `import type`, and their compiler worlds carry no DOM lib (docs/law/Spine-TypeScript-and-Patterns.md §10), so no DOM
// name may enter this file or any module it imports: a record that holds an Element or an Event stays in its DOM-side home.

import type { AppearanceMatrixContract, AppearanceMatrixContractRow, AppearanceMessageRegistryReceipt } from "@orb/kit/appearance-manifest";
import type { LongAnimationFrameTiming } from "@orb/kit/long-animation-frame";
import type { InputBorderFallback } from "@orb/ui/theme-scope/derive-vars";
import type { OrbAgentHandles, OrbCssHandle, OrbNavHandle, OrbRpgReader, OrbSeedHandle, QuerySummary, ShellSnapshot } from "./agent-bridge-handles.ts";
import type { OrbPluginLogReader, OrbPluginUiReader } from "./agent-plugin-bridge.ts";
import type { BusEventRecord } from "./bus-devlog.ts";
import type { renderHeatmap } from "./render-stats.ts";
import type { SafeErrorSource } from "./safe-error-ring.ts";

const ORB_RING_LIFETIMES = ["checkpoint", "durable", "server-runtime", "session"] as const;
type OrbRingLifetime = (typeof ORB_RING_LIFETIMES)[number];
export const ORB_RING_NAMES = [
  "bus-events",
  "flags",
  "motion",
  "renders",
  "css-merges",
  "animations",
  "perf",
  "plugin-log",
  "plugin-ui",
  "automation-fires",
  "console-errors",
  "theme-fallbacks",
] as const;
export type OrbRingName = (typeof ORB_RING_NAMES)[number];

export interface OrbRingMetadata {
  readonly name: OrbRingName;
  readonly read: string;
  readonly lifetime: OrbRingLifetime;
  readonly resettable: boolean;
  readonly description: string;
}

export type OrbRingResetResult = { readonly ok: true; readonly name: OrbRingName } | { readonly ok: false; readonly name: string; readonly reason: string };

/** One long-animation-frame script, as the LoAF ring carries it. */
interface LoafScript {
  readonly sourceURL: string;
  readonly duration: number;
  readonly forcedStyleAndLayoutDuration: number;
  readonly invoker: string;
  readonly sourceFunctionName: string;
}

export interface SelectEntranceEvidence {
  readonly id: number;
  readonly startedAt: number;
  readonly confirmedAt?: number;
  readonly endedAt?: number;
  readonly firstForTrigger: boolean;
}

export interface LoafRecord extends LongAnimationFrameTiming {
  readonly scripts: readonly LoafScript[];
  readonly selectEntrance?: SelectEntranceEvidence;
}

/** One attributed layout shift — what moved, how far, and whether the spec counts it. */
export interface ShiftRecord {
  readonly startTime: number;
  readonly value: number;
  /** true ⇒ within 500ms of real input, so the CWV metric excludes it (but the relayout still happened). */
  readonly hadRecentInput: boolean;
  /** true ⇒ caused inside the dev bridge's user-equivalent navigation window. Still measured, not warned. */
  readonly agentNavigation: boolean;
  /** true ⇒ every attributed source is an absolute row inside a known virtualizer viewport. */
  readonly virtualized: boolean;
  /** The elements whose start position moved, described + measured, worst-first as the entry reported them. */
  readonly sources: readonly string[];
}

export interface MotionSnapshot {
  readonly loafs: readonly LoafRecord[];
  /** The CWV metric: input-adjacent shifts excluded. Unchanged semantics — existing consumers read this. */
  readonly cls: number;
  /** EVERY shift, input-adjacent included — the number that catches an interaction-driven relayout storm. */
  readonly observedCls: number;
  /** The share of `cls` this instrument classified as virtual-row reconciliation — printed, never gated. */
  readonly virtualizedCls: number;
  /** `cls` − `virtualizedCls`: THE BUDGETED TOTAL (issue #109). The only CLS number an app fix can move. */
  readonly nonVirtualizedCls: number;
  /** The virtual-row share of `observedCls` — the #109 classification over the input-adjacent shifts too. */
  readonly observedVirtualizedCls: number;
  /** `observedCls` − `observedVirtualizedCls`: THE INTERACTION BUDGET TOTAL (#1071). What an app fix can
   *  move out of a relayout storm the CWV metric excludes because it followed a real input. */
  readonly observedNonVirtualizedCls: number;
  readonly worstBlocking: number;
  readonly worstShift: number;
  /** The recent attributed shifts — "what moved", which no CLS number carries. */
  readonly shifts: readonly ShiftRecord[];
}

const ANIMATION_OWNERS = ["base-ui", "application", "unattributed"] as const;
const ANIMATION_MECHANISMS = ["css-transition", "css-animation", "web-animation", "unknown"] as const;
const ANIMATION_PHASES = ["starting-style", "ending-style"] as const;
const LIFECYCLE_OBSERVATION_SOURCES = ["transition-run"] as const;
const ANIMATION_TIMELINES = ["document", "scroll", "view", "none"] as const;
type AnimationOwner = (typeof ANIMATION_OWNERS)[number];
type AnimationMechanism = (typeof ANIMATION_MECHANISMS)[number];
type AnimationPhase = (typeof ANIMATION_PHASES)[number];
type LifecycleObservationSource = (typeof LIFECYCLE_OBSERVATION_SOURCES)[number];
export type AnimationTimelineKind = (typeof ANIMATION_TIMELINES)[number];

export interface AnimationLifecycleState {
  readonly startingStyle: boolean;
  readonly endingStyle: boolean;
  readonly observedAt: LifecycleObservationSource;
}

export interface AnimationAttribution {
  readonly owner: AnimationOwner;
  readonly mechanism: AnimationMechanism;
  readonly phase?: AnimationPhase;
}

export interface AnimationRecord {
  readonly id?: string;
  /** Best-effort surface/component label of the animated target. */
  readonly target: string;
  /** The animated property set (from the keyframes). */
  readonly properties: readonly string[];
  /** true when every animated property stays on the compositor. */
  readonly compositorClean: boolean;
  /** The live Base UI lifecycle state on the target at the exact animation sample. */
  readonly targetState: {
    readonly startingStyle: boolean;
    readonly endingStyle: boolean;
  };
  /** State bound to this exact animation at launch; null means no Base UI lifecycle was observed. */
  readonly lifecycleState: AnimationLifecycleState | null;
  /** Owner and mechanism derived from browser constructors plus exact launch provenance. */
  readonly attribution: AnimationAttribution;
  /** The CSS animation's `animation-name` or the transition's property: the one name a record with no readable
   *  property set still carries. Absent for a script animation that set no `id`. */
  readonly name?: string;
  /** What drives the animation's time: the document clock, a scroll or view progress timeline, or nothing. */
  readonly timeline: AnimationTimelineKind;
}

/** One raised flag, as `__orb.flags()` returns it: which channel, what happened, who did it. */
export interface MotionFlagRecord {
  /** The channel tag WITHOUT brackets — `anim` · `css` · `drop` · `space`. */
  readonly tag: string;
  /** `performance.now()` at the raise. */
  readonly at: number;
  /** The stable surface marker (or token) the flag is attributed to — the dedupe identity. */
  readonly offender: string;
  /** The human sentence the console line carried. */
  readonly detail: string;
  /** true ⇒ a declared budget in `MOTION_BUDGETS` was crossed (vs. an unconditional correctness flag). */
  readonly overBudget: boolean;
  /** THE RAW BROWSER FACTS behind an `anim` raise — property set, target lifecycle state, owner/mechanism
   *  attribution — as `motion-animation-record.ts` builds them, captured at LAUNCH.
   *
   *  Why it rides the flag and not just the console line (#1070): `__orb.animations()` samples
   *  `document.getAnimations()`, so a 130–360ms house transition — the whole band this app animates in —
   *  is over before any end-of-window read, and Snap's motion-arm dirty-animation budget was in
   *  practice a continuous-LOOP detector judging a population that could not contain the transitions its
   *  allowance table exists to sanction. The ring is checkpoint-scoped and cleared by `resetEvidence`, so
   *  a driven probe reads exactly its own measured window.
   *
   *  IT CARRIES NO VERDICT. `overBudget` above is THIS channel's console verdict under guide §3.7 and is
   *  deliberately not what a consumer reads: a reader re-judges these raw facts under its own policy (for
   *  motion-audit, the #953 owner-accepted Base UI height allowance in `lib/animations.ts`, unchanged).
   *  Present only on the `anim` channel; the other three raise no animation.
   *
   *  MUST NOT SILENTLY DISAPPEAR — a consumer that receives an `anim` flag without it cannot sanction the
   *  ratified lifecycles and must treat the raise as unattributed. */
  readonly animation?: AnimationRecord;
}

/** One recorded browser-side failure, as `__orb.consoleErrors()` returns it. */
export interface ConsoleErrorRecord {
  /** Which surface reported it: a `console.error` call, an uncaught error event, or a rejected promise. */
  readonly source: SafeErrorSource;
  /** Wall-clock epoch ms at the record. */
  readonly at: number;
  /** The formatted message — every argument stringified and joined, capped. */
  readonly text: string;
  /** The stack, where the reported value carried one. */
  readonly stack?: string;
  /** `globalThis.location.pathname` at the record — which surface was mounted. */
  readonly route: string;
}

export interface ConsoleErrorRing {
  readonly records: readonly ConsoleErrorRecord[];
  /** Records evicted by the cap since the last reset. `0` ⇒ `records` is every error of this session. */
  readonly dropped: number;
  readonly cap: number;
}

export interface ThemeFallbackRing {
  readonly inputBorder: readonly InputBorderFallback[];
  /** Entries evicted at the cap since load, so a full ring never reads as a complete history. */
  readonly dropped: number;
  readonly cap: number;
}

export interface MotionFlaggerDrainReceipt {
  readonly requestedGeneration: number;
  readonly completedGeneration: number;
}

export interface AppearanceMatrixBridgeContract extends Omit<AppearanceMatrixContract, "rows"> {
  readonly rows: readonly (AppearanceMatrixContractRow & { readonly reached: number; readonly samples: readonly unknown[] })[];
  readonly messageRegistry: AppearanceMessageRegistryReceipt;
}

export interface OrbDebugHandle {
  /** Resolves when `data-app-ready` is set (initial reads settled). */
  readonly ready: Promise<void>;
  readonly isReady: () => boolean;
  /** The full query cache as plain rows (key · status · fetchStatus · stale · updatedAt). */
  readonly queries: () => readonly QuerySummary[];
  /** The chat-bus: live subscription count + the recent canon-event ring (bus-devlog). */
  readonly bus: () => { readonly live: number; readonly events: readonly BusEventRecord[] };
  /** DOM-derived shell state (active section · panel modes · whether a chat room is open). */
  readonly shell: () => ShellSnapshot;
  /** The recorded `orb:*` User Timing measures (name → ms): app-ready, turn latency/TTFT, etc. */
  readonly perf: () => ReadonlyArray<{ name: string; ms: number }>;
  /** The render heatmap: which <Profiler>-wrapped surfaces re-render, how often, how expensive. */
  readonly renders: () => ReturnType<typeof renderHeatmap>;
  /** LoAF ring + CLS/worst-blocking/worst-shift — the "what blocks the frame / instability" signals. */
  readonly motion: () => MotionSnapshot;
  /** Active animations, each classified compositor-clean (transform/opacity/filter) or a jank risk. */
  readonly animations: () => readonly AnimationRecord[];
  /** The motion FLAGGER ring — every [anim]/[css]/[drop]/[space] defect raised this session, deduped
   *  per offender. The pull half of the push channels in `motion-flaggers.ts`: a harness that cannot
   *  read the console still gets the offender list. */
  readonly flags: () => readonly MotionFlagRecord[];
  /** Every browser-side FAILURE this session: `console.error` calls, uncaught errors, unhandled rejections —
   *  wall-clock stamped, capped, and counting its own evictions (`dropped`). The one signal this client held
   *  nowhere before #1095: a caught RENDER error reaches the server's log ring, a bare console.error did not. */
  readonly consoleErrors: () => ConsoleErrorRing;
  /** Every ThemeScope fallback the app shell's reporter received this session: D159 form-control edge fallbacks,
   *  capped and counting their evictions (`dropped`). */
  readonly themeFallbacks: () => ThemeFallbackRing;
  /** Clear the flag ring + its per-offender dedupe. Call between the STEPS of a driven flow: without
   *  it, step 1's offenders suppress the identical ones in step 2 and the later steps read clean. */
  readonly resetFlags: () => void;
  /** Clear checkpoint-scoped flags, motion, and render evidence without disturbing app/query state. */
  readonly resetEvidence: () => void;
  /** Wait for the one initial full dev-instrument census before opening a measured interaction window. */
  readonly motionFlaggersSettled: () => Promise<void>;
  /** Wait for late class/style mutations and return the caller's monotonic drain generation. */
  readonly motionFlaggersDrain: () => Promise<MotionFlaggerDrainReceipt>;
  /** The live Appearance carrier roster, its two-arm values, and reached DOM populations. */
  readonly appearanceMatrixContract: () => AppearanceMatrixBridgeContract;
  /** Suspend only duplicate in-page [drop] tracking while motion-audit's CDP trace owns that verdict. */
  readonly setMotionAuditDropTrackingPaused: (paused: boolean) => void;
  /** One-call overview for a quick `preview_eval("__orb.snap()")`. */
  readonly snap: () => Record<string, unknown>;
  /** Dev-only SPA-navigation actions (see OrbNavHandle) — reach any surface without a click chain. */
  readonly nav: OrbNavHandle;
  /** Dev-only rpg game seeder (see OrbSeedHandle) — spin up a fully-populated game in one call. */
  readonly seed: OrbSeedHandle;
  /** Active-game state, journal, and recorded folded calls through the production read APIs. */
  readonly rpg: OrbRpgReader;
  /** The installed-plugin roster (no ref) or one plugin's RUNTIME host.log ring (ref = slug or id) through
   *  the production `plugin.list` / `plugin.getLog` reads — the lines a floated hub-search continuation
   *  logs included (#806). Loud refusal on no match / ambiguity. */
  readonly pluginLog: OrbPluginLogReader;
  /** Runtime-listed plugin UI registrations and current publication/host observations. */
  readonly pluginUi: OrbPluginUiReader;
  /** Ordered configured-merge conflicts since the last checkpoint (#949). */
  readonly css: OrbCssHandle;
  /** The durable AUTOMATION FIRE LOG (`automation_fires`: every dispatch terminal with its per-arm `detail`),
   *  newest-first across the deployment, via a same-origin read of `/api/_debug/automation/fires` —
   *  `{chatId?, ruleId?, limit?}` narrow. The debug gate admits the dev admin session (or `x-debug-token`);
   *  a refused read answers `{ok:false, reason}` with the HTTP status, never a throw. */
  readonly automationFires: OrbAgentHandles["automationFires"];
  /** The durable-local namespace's bound identity (`state/durable-local.ts`) — `null` before the viewer
   *  read binds it (the pre-adoption legacy world). The lens a test or this bridge asserts the
   *  per-user localStorage scoping through, without reaching into `localStorage` by hand. */
  readonly durableLocalUserId: OrbAgentHandles["durableLocalUserId"];
  /** Exhaustive, typed inventory of this top-level handle. */
  readonly capabilities: () => Readonly<Record<keyof OrbDebugHandle, string>>;
  /** Evidence-source index: read surface, lifetime, and whether this client owns a safe reset. */
  readonly rings: () => readonly OrbRingMetadata[];
  /** Reset one checkpoint-safe client ring; unsafe or unknown names refuse loudly. */
  readonly resetRing: (name: string) => OrbRingResetResult;
}

declare global {
  // `var` is required: ambient global augmentation must use var to attach to globalThis.
  var __orb: OrbDebugHandle | undefined;
}
