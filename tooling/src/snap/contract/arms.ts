// THE ARM PLUG-IN CONTRACT. An "arm" is one piece of
// evidence snap can take about a page: the a11y tree, the interactive map, an in-page expression, a
// contrast reading, the cascade, dead CSS, the assertion family, the perf read, the pixels, the request
// log, a Lighthouse audit. Before this file each of them was wired BY HAND into three places —
// `ops/flags-classes.ts` (which argv class its flags belong to), `ops/flags-handlers.ts` (argv → Args),
// `contract/help.ts` (the operator row) — plus a fourth nobody remembered until a run came back missing a
// number: the RESULT pair and the failure fold in `ops/run.ts`. Four hand-edits per arm is why the last
// two arms (#1198/#1199) needed their own bespoke wiring object, and why an arm could ship with no help
// row at all (`--no-deadcss` did, for its whole life).
//
// WHAT A NEW ARM COSTS NOW: one file `ops/arms/<arm>.ts` exporting an `ArmDef`, one member on `ARMS`, and
// the `Args` fields it parses into. Everything else is DERIVED from the record — the argv classes, the
// handler table, the help block, the RESULT pairs, the failure summary members, and the launch
// provisions. `ARM_DEFS: Record<Arm, ArmDef>` (ops/arms/registry.ts) is the tsc fence: a new tuple member
// fails to compile until its row exists, and a row cannot omit its help.
//
// THE ORDER OF `ARMS` IS THE EXECUTION ORDER, and that is deliberate — §6 lists the same eleven members
// in a different (prose) order, but a second ordering list beside the roster is a second home for the same
// fact, and the pass order is load-bearing: the settled-surface reads all run BEFORE the pixels, so the
// PNG shows the page the evidence describes. One tuple, so `tsc` cannot let a new arm skip the pass.
//
// TWO LIFECYCLES, BOTH REAL (this is where §6's single `run(ctx)` had to widen — see the two worked arms).
// A PAGE arm runs inside the settled-surface pass, once per `--pages` tab, and writes its slice of that
// tab's `CaptureOutcome` (which is also the `--json` manifest's `captures` member). A RUN arm spans the
// whole run: it is minted before anything navigates (`--requests` cannot wire its listeners after
// `page.goto` — #1199), measures after the capture pass, and may print after the report block. Modelling
// both as one `run()` would have meant either losing the request log's pre-navigation attach or giving
// every page arm three empty hooks; the union is exhaustively dispatched, so neither can be forgotten.
import type { Page } from "@playwright/test";
import type { EvidenceWindowId } from "../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../_shared/artifacts.ts";
import type { ProbeSession } from "../../_shared/browser-contract.ts";
import type { DevToolsCascadeRuntime } from "../../_shared/devtools-runtime.ts";
import type { VerdictDenominator } from "../../_shared/evidence.ts";
import type { Arm } from "./arm-vocabulary.ts";
import type { SnapRatePosture } from "./rate-posture.ts";
import type { ArmFactDataByArm, ArmFactSchemaIdByArm, SnapCurrentScope } from "./run-facts.ts";
import type { Args, CaptureOutcome, ReportCtx, ShotPlan, SnapAction } from "./types.ts";
import type { SnapFailureSummary } from "./verdict.ts";

export type { Arm } from "./arm-vocabulary.ts";

/** How `ops/parse.ts`'s scanner must consume the flag's argv slot. One axis, so a new arm cannot invent a
 *  fourth consumption rule the scanner does not know about. */
const ARM_FLAG_KINDS = ["boolean", "required-value", "optional-selector", "optional-value"] as const;
export type ArmFlagKind = (typeof ARM_FLAG_KINDS)[number];

/** The parse handler's shape — identical to the `FLAG_HANDLERS` rows this replaces, so an arm's handler is
 *  the SAME function it was, moved. `page` is the `@<idx>` --pages suffix (0 when unprefixed). */
type ArmFlagHandler = (args: Args, rest: string[], page: number) => void;

export interface ArmFlagSpec {
  readonly flag: string;
  readonly kind: ArmFlagKind;
  /** Accepts a `@<page>` suffix. `ops/parse.ts` refuses the suffix on every other flag. */
  readonly pageTargetable: boolean;
  /** The `--help` section title this flag is documented under (reused verbatim from
   *  `.claude/skills/snap-driving/reference/flags.md`'s section headings — one home for the grouping). */
  readonly group: string;
  /** One line (≤160 chars, no trailing period, present tense) — the generated flag index and grammar
   *  block's ONLY source of "what it does". REQUIRED so tsc refuses a flag with no summary (#1329). */
  readonly summary: string;
  readonly handler: ArmFlagHandler;
}

/** What an arm needs the BROWSER LAUNCH to provide. Every member here has exactly one twin field on
 *  `ArmProvisions` below and exactly one live consumer at the launch site — a `needs` member nothing
 *  reads would be a declaration with no enforcement, which is the shape this registry exists to delete.
 *  §6 also sketched `trace`/`requestRing`/`quietBox`; none is an OPTIONAL arm provision on this tree (the
 *  request ring is the universal ProbeSession substrate installed by `launchSnapSession` before callers
 *  can navigate, and the load withhold is per INSTRUMENT in `_shared/load-budget.ts`). */
export interface ArmNeeds {
  /** A Chrome `--remote-debugging-port` endpoint on THIS run's browser (the Lighthouse attach). */
  readonly debuggingPort?: true;
  /** The official DevTools SDK cascade runtime, which brings its own persistent profile. */
  readonly devtoolsSdk?: true;
}

/** The resolved twin of `ArmNeeds`: what the launch actually provided, handed to the arm through its run
 *  context. Null means "this run's browser published none" — which every arm must treat as a REFUSAL, not
 *  as a clean zero (the Lighthouse arm's absence proof). */
interface ArmProvisions {
  readonly debuggingPort: number | null;
  readonly cascadeRuntime: DevToolsCascadeRuntime | null;
}

/** Failure counts an arm contributes to the ONE verdict summary, keyed by the `SnapFailureSummary` field
 *  each lands in. A map rather than §6's single `number` because a real arm owns more than one member:
 *  `dead-css` reports dead tokens AND empty rules, which are two independent findings with two RESULT
 *  pairs and two summary fields. `ops/verdict.ts` reads each key by name and THROWS when the owning arm
 *  did not produce it, so a dropped fold is loud rather than a silent zero. */
export type ArmFailureCounts = Readonly<Partial<Record<keyof SnapFailureSummary, number>>>;

/** Everything a PAGE arm sees. `outcome` is the tab's mutable evidence sheet — an arm writes its own
 *  fields on it and reads nobody else's. */
export interface ArmPageContext {
  readonly page: Page;
  readonly opts: Args;
  readonly pageIndex: number;
  readonly plan: ShotPlan;
  readonly outcome: CaptureOutcome;
  /** `--eval`s written AFTER the last drive action, split back out so they observe the SETTLED surface. */
  readonly trailingEvals: readonly string[];
  /** The one run-owned acceleration/load sample. Page arms may derive wording, never reread the host. */
  readonly ratePosture: SnapRatePosture;
}

/** What a page arm's totals are computed over. `ctx` carries the run's artifact naming + failed-request
 *  set, which the pixel arm's `out=`/`crop=` pairs read. */
export interface ArmPairInput {
  readonly opts: Args;
  readonly outcomes: readonly CaptureOutcome[];
  readonly ctx: ReportCtx;
}

export interface ArmFactEmission<A extends Arm> {
  readonly scope: SnapCurrentScope;
  readonly data: ArmFactDataByArm[A];
}

interface ArmResultMetadata<A extends Arm> {
  readonly schema: ArmFactSchemaIdByArm[A];
  readonly source: string;
  readonly lifetime: string;
  /** Run-level enablement. Per-page targeting remains on the lifecycle. */
  readonly enabled: (opts: Args) => boolean;
  /** Summary members an unhosted path must still initialize to zero after proving this arm is disabled. */
  readonly failureFields?: readonly (keyof SnapFailureSummary)[];
}

export interface ArmPageLifecycle<A extends Arm = Arm> {
  readonly at: "page";
  /** Runs this arm on this tab. Total: "the argv did not ask for me" is an answer here. */
  readonly enabled: (ctx: ArmPageContext) => boolean;
  readonly run: (ctx: ArmPageContext) => Promise<void>;
  /** The arm's RESULT members, ALWAYS — an arm that did not run still says so (`aria=no`, `map=no`,
   *  `deadcss=0`). A reader must never have to guess whether an absent pair means clean or never-ran. */
  readonly pairs: (input: ArmPairInput) => readonly ResultPair[];
  /** FILE what this arm PRINTED into the run slot, once per run, before the facts are registered (#1342).
   *  REQUIRED — an arm whose values exist only on the terminal makes the `EVIDENCE <run.json>` path a
   *  receipt nobody else can read, and that is exactly how a cited P1 became unverifiable. An arm with
   *  nothing of its own to file (its bytes are written at another seam) says so and returns. `slug`
   *  prefixes the basename so a scenario's checkpoints never overwrite each other. The refs need no
   *  hand-off: `ops/run-bundle.ts` binds an artifact to its `producerArm`'s fact. */
  readonly evidence: (input: ArmPairInput, slug: string) => Promise<void>;
  readonly facts: (input: ArmPairInput) => readonly ArmFactEmission<A>[];
  readonly failures: (input: ArmPairInput) => ArmFailureCounts;
  /** The run's exit after settled page evidence is complete. Required on every page arm so an
   *  instrument refusal cannot be trapped inside a finding-only failure fold. */
  readonly exit: (input: ArmPairInput, code: number) => number;
}

export interface ArmRunContext {
  readonly session: ProbeSession;
  readonly opts: Args;
  readonly outcomes: readonly CaptureOutcome[];
  /** The run's artifact key — the base every arm files its own artifacts under. */
  readonly name: string;
  readonly provisions: ArmProvisions;
  /** Same frozen object every rate analyzer and the terminal RESULT receipt consumes. */
  readonly ratePosture: SnapRatePosture;
}

export interface ArmSharedContext {
  readonly ratePosture: Promise<SnapRatePosture>;
}

export interface ArmNavigationContext {
  readonly page: Page;
  readonly opts: Args;
  readonly pageIndex: number;
  readonly url: string;
  readonly navError: string | null;
  /** Host-minted identity for this exact navigation/action/settle window. */
  readonly evidenceWindow: EvidenceWindowId;
}

export interface ArmActionContext {
  readonly page: Page;
  readonly opts: Args;
  readonly pageIndex: number;
  readonly actionIndex: number;
  readonly action: SnapAction;
  readonly navFailuresBefore: number;
  readonly stepFailuresBefore: number;
}

export interface ArmActionDisposition {
  /** The arm dispatched this action itself inside its measured window. The shared tape must not repeat it. */
  readonly handled: boolean;
  readonly failures: number;
}

export interface ArmTapeContext {
  readonly page: Page;
  readonly opts: Args;
  readonly pageIndex: number;
}

/** One run's instance of a RUN arm. Every member is total, so `ops/run.ts` gains no branch per arm. */
export interface ArmRunInstance<A extends Arm = Arm> {
  /** Async work that MUST finish before the first navigation. Required even when it is a no-op so an arm
   *  which needs a pre-mount hook cannot accidentally fall through to the post-capture measurement. */
  readonly prepare: () => Promise<void>;
  /** Immediately after this page's navigation/readiness gate and before the first tape action. */
  readonly afterNavigation: (ctx: ArmNavigationContext) => Promise<void>;
  /** Around each entry of the ONE argv-ordered tape. A measurement arm may handle exactly one tagged
   *  action itself; two handlers are an instrument error, never silent double-dispatch. */
  readonly beforeAction: (ctx: ArmActionContext) => Promise<ArmActionDisposition | null>;
  readonly afterAction: (ctx: ArmActionContext & { readonly failed: boolean; readonly handled: boolean }) => Promise<void>;
  /** Immediately after this page's complete argv-ordered tape and before settle/page arms. Measurement
   *  windows that cover interactions end here rather than silently including unrelated capture work. */
  readonly afterActions: (ctx: ArmTapeContext) => Promise<void>;
  /** After the shared bounded settle on this exact page and before settled page arms. */
  readonly afterSettle: (ctx: ArmTapeContext) => Promise<void>;
  /** After the settled-surface capture pass over every page. */
  readonly measure: (ctx: ArmRunContext) => Promise<void>;
  /** After the run's report block has printed — where a log block belongs, in reading order. */
  readonly report: (ctx: ArmRunContext) => Promise<void>;
  readonly failures: () => ArmFailureCounts;
  /** The population this arm's accounting is over; `refuseWhen: "zero"` turns a blind read into an
   *  exit-2 refusal (_shared/evidence.ts). */
  readonly denominators: () => Readonly<Record<string, VerdictDenominator>>;
  readonly pairs: () => readonly ResultPair[];
  readonly facts: () => readonly ArmFactEmission<A>[];
  /** The run's exit code after this arm has its say — a REFUSED measurement is not a verdict about the
   *  app at all and exits 2 whatever else the run found. */
  readonly exit: (code: number) => number;
}

interface ArmRunLifecycle<A extends Arm = Arm> {
  readonly at: "run";
  /** Minted BEFORE anything navigates: a listener wired after `page.goto` starts mid-stream (#1199). */
  readonly begin: (session: ProbeSession, opts: Args, shared: ArmSharedContext) => ArmRunInstance<A>;
}

type ArmLifecycle<A extends Arm = Arm> = ArmPageLifecycle<A> | ArmRunLifecycle<A>;

export interface ArmDef<A extends Arm = Arm> {
  /** The argv this arm owns. `ops/flags-classes.ts` derives every scanner class from the union of these,
   *  and `ops/flags-handlers.ts` spreads their handlers — so a new flag needs no edit in either file. */
  readonly flags: readonly ArmFlagSpec[];
  /** Where the flags may appear on a stateful session (design §3.3): a `session` arm's flags belong to
   *  the BOOT call and are refused later; a `call` arm's may ride any call. */
  readonly level: "session" | "call";
  /** What THIS argv makes the arm need of the browser launch. A function, not a constant, because the
   *  need only exists when the arm is on — an ordinary run must launch byte-identically to one from
   *  before the registry existed, and the arm is the only thing that knows whether it was asked for. */
  readonly needs: (opts: Args) => ArmNeeds;
  /** Quiet-box outer watchdog base for a non-navigating named-session call when this arm is enabled.
   * Null means the arm adds no time beyond the daemon's ordinary call floor. The registry takes the
   * widest enabled declaration, and the daemon applies the shared load scaler exactly once. */
  readonly sessionCallBaseMs: (opts: Args) => number | null;
  /** The arm's own slice of the parsed `Args`, as a FACTORY — several arms default to a fresh array, and
   *  a shared literal would leak one parse's queue into the next. */
  readonly defaults: () => Partial<ArmArgs>;
  /** The operator block, verbatim. REQUIRED, which is the point: `SNAP_HELP` is assembled from these, so
   *  an arm cannot ship without its row and a row cannot drift away from the flags beside it. */
  readonly help: string;
  readonly result: ArmResultMetadata<A>;
  readonly lifecycle: ArmLifecycle<A>;
}

/** THE ARM-OWNED HALF OF `Args`. Every field here is parsed,
 *  defaulted and read by exactly one `ArmDef` under ops/arms/; every field NOT here belongs to the run
 *  itself (the target, the browser, the stage, the session, the artifacts).
 *
 *  It is a `Pick` rather than a second interface so the field DOCS above stay in one place — this list is
 *  the ownership statement, not a re-declaration. `ops/parse.ts` builds the initial `Args` as a non-arm
 *  literal plus `armArgDefaults()`, so tsc REFUSES the parse when an arm stops defaulting a field it
 *  owns: adding an arm is a contract edit plus one file, and never an edit to the parser. */
export type ArmArgs = Pick<
  Args,
  | "deadCss"
  | "crop"
  | "aria"
  | "ariaSelector"
  | "ariaDepth"
  | "ariaBoxes"
  | "ariaPage"
  | "shot"
  | "shotOf"
  | "mask"
  | "fullPage"
  | "eval"
  | "cascade"
  | "contrast"
  | "contrastPixel"
  | "contrastEdge"
  | "assertions"
  | "designAudit"
  | "failOn"
  | "map"
  | "mapSelector"
  | "mapPage"
  | "atlas"
  | "lighthouse"
  | "lighthouseMode"
  | "requests"
  | "requestsFilter"
  | "requestBody"
  | "heapCaptures"
  | "heapComparisons"
  | "heapRetainers"
  | "filmstrip"
  | "reactProfile"
  | "motion"
  | "motionWindowMs"
  | "motionThrottle"
  | "interactionPerf"
  | "perfCycles"
  | "cpuProfile"
  | "bootTrace"
>;

/** The complement — what `ops/parse.ts` still spells out by hand. */
export type NonArmArgs = Omit<Args, keyof ArmArgs>;
