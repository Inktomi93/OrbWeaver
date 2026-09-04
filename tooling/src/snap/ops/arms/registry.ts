// THE ARM REGISTRY: one row per member of `ARMS`, and every derivation the rest of snap reads off it.
// `Record<Arm, ArmDef>` is the tsc fence — a new tuple member fails to compile until its row exists, and
// a row cannot omit its flags, its help, or its lifecycle.
//
// WHY THE RECORD LIVES IN `ops/` AND NOT IN `contract/` (a deliberate deviation from §6's sketch, which
// declared `ARM_DEFS` beside the types). The record holds RUN FUNCTIONS, so it must import all eleven arm
// modules; those modules import the arm TYPES. Putting both in one file would make `contract/arms.ts` a
// value module in a cycle with every arm — the types stay import-cycle-free where they are, and this file
// is the composition root, which is exactly the ops/contract split the tool template already draws.
import type { ArtifactRef } from "../../../_shared/artifact-scope.ts";
import type { ResultPair } from "../../../_shared/artifacts.ts";
import type { ProbeSession } from "../../../_shared/browser-contract.ts";
import { refuseDirectInvocation } from "../../../_shared/entrypoint.ts";
import type { VerdictDenominator } from "../../../_shared/evidence.ts";
import { ARMS } from "../../contract/arm-vocabulary.ts";
import type {
  Arm,
  ArmActionContext,
  ArmActionDisposition,
  ArmArgs,
  ArmDef,
  ArmFailureCounts,
  ArmFlagKind,
  ArmFlagSpec,
  ArmNavigationContext,
  ArmNeeds,
  ArmPageLifecycle,
  ArmPairInput,
  ArmRunContext,
  ArmRunInstance,
  ArmSharedContext,
  ArmTapeContext,
} from "../../contract/arms.ts";
import type { SnapArmFact } from "../../contract/run-facts.ts";
import { snapArmFact } from "../../contract/run-facts.ts";
import type { Args } from "../../contract/types.ts";
import type { SnapFailureSummary } from "../../contract/verdict.ts";
import type { SnapRatePosture, SnapRatePostureReaders } from "../../lib/rate-posture.ts";
import { sampleSnapRatePosture } from "../../lib/rate-posture.ts";
import { ARIA_ARM } from "./aria.ts";
import { ASSERT_ARM } from "./assert.ts";
import { BOOT_TRACE_ARM } from "./boot-trace.ts";
import { CASCADE_ARM } from "./cascade.ts";
import { CONTRAST_ARM } from "./contrast.ts";
import { CPU_PROFILE_ARM } from "./cpu-profile.ts";
import { DEAD_CSS_ARM } from "./dead-css.ts";
import { DESIGN_AUDIT_ARM } from "./design-audit.ts";
import { EVAL_ARM } from "./eval.ts";
import { FILMSTRIP_ARM } from "./filmstrip.ts";
import { HEAP_ARM } from "./heap.ts";
import { INTERACTION_PERF_ARM } from "./interaction-perf.ts";
import { LIGHTHOUSE_ARM } from "./lighthouse.ts";
import { MAP_ARM } from "./map.ts";
import { MOTION_ARM } from "./motion.ts";
import { APP_SNAPSHOT_ARM } from "./perf.ts";
import { PROFILE_ARM } from "./profile.ts";
import { REQUESTS_ARM } from "./requests.ts";
import { SHOT_ARM } from "./shot.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

/** `satisfies`, not an annotation: the annotation would WIDEN each row's `defaults()` back to
 *  `Partial<ArmArgs>` and `armArgDefaults` below would lose its compile-time completeness check. */
export const ARM_DEFS = {
  "dead-css": DEAD_CSS_ARM,
  aria: ARIA_ARM,
  eval: EVAL_ARM,
  contrast: CONTRAST_ARM,
  map: MAP_ARM,
  assert: ASSERT_ARM,
  "design-audit": DESIGN_AUDIT_ARM,
  "app-snapshot": APP_SNAPSHOT_ARM,
  heap: HEAP_ARM,
  filmstrip: FILMSTRIP_ARM,
  shot: SHOT_ARM,
  cascade: CASCADE_ARM,
  requests: REQUESTS_ARM,
  lighthouse: LIGHTHOUSE_ARM,
  motion: MOTION_ARM,
  "interaction-perf": INTERACTION_PERF_ARM,
  "cpu-profile": CPU_PROFILE_ARM,
  "boot-trace": BOOT_TRACE_ARM,
  "react-profile": PROFILE_ARM,
} satisfies { readonly [A in Arm]: ArmDef<A> };

/** Every arm flag, in `ARMS` order. The scanner classes and the handler table are both built from this. */
export function armFlags(): readonly ArmFlagSpec[] {
  // The callback's return type is SPELLED because `ARM_DEFS` is `satisfies`-typed: each row's `flags`
  // keeps its literal tuple type, and `flatMap` over the union of eleven such tuples has no common
  // element type until it is widened back to the contract's own.
  return ARMS.flatMap((arm): readonly ArmFlagSpec[] => ARM_DEFS[arm].flags);
}

export function armFlagsOfKind(kind: ArmFlagKind): readonly string[] {
  return armFlags()
    .filter((spec) => spec.kind === kind)
    .map((spec) => spec.flag);
}

export function pageTargetableArmFlags(): readonly string[] {
  return armFlags()
    .filter((spec) => spec.pageTargetable)
    .map((spec) => spec.flag);
}

/** The flags that belong to a stateful session's BOOT call, derived from each arm's declared level
 *  (design §3.3) — so an arm that becomes browser-lifetime cannot forget to say so in two places. */
export function sessionLevelArmFlags(): readonly string[] {
  return ARMS.filter((arm) => ARM_DEFS[arm].level === "session").flatMap((arm) => ARM_DEFS[arm].flags.map((spec) => spec.flag));
}

export function armFlagHandlers(): Record<string, ArmFlagSpec["handler"]> {
  return Object.fromEntries(armFlags().map((spec) => [spec.flag, spec.handler]));
}

/** THE TSC FENCE FOR `ArmArgs`. Every arm's defaults are spread by NAME and the result is annotated
 *  `ArmArgs`, so tsc refuses this file when a field of the arm-owned half of `Args` has no arm defaulting
 *  it (and when an arm defaults a field it does not own). The one-row-per-arm spread is the point: a
 *  `reduce` over `ARMS` would type as `Partial` and the compiler would have nothing to check. Called PER
 *  PARSE, never memoised — several arms default to a fresh array, and one shared literal would leak one
 *  parse's queue into the next. */
export function armArgDefaults(): ArmArgs {
  return {
    ...DEAD_CSS_ARM.defaults(),
    ...ARIA_ARM.defaults(),
    ...EVAL_ARM.defaults(),
    ...CONTRAST_ARM.defaults(),
    ...MAP_ARM.defaults(),
    ...ASSERT_ARM.defaults(),
    ...DESIGN_AUDIT_ARM.defaults(),
    ...APP_SNAPSHOT_ARM.defaults(),
    ...HEAP_ARM.defaults(),
    ...FILMSTRIP_ARM.defaults(),
    ...SHOT_ARM.defaults(),
    ...CASCADE_ARM.defaults(),
    ...REQUESTS_ARM.defaults(),
    ...LIGHTHOUSE_ARM.defaults(),
    ...MOTION_ARM.defaults(),
    ...INTERACTION_PERF_ARM.defaults(),
    ...CPU_PROFILE_ARM.defaults(),
    ...BOOT_TRACE_ARM.defaults(),
    ...PROFILE_ARM.defaults(),
  };
}

/** What the browser LAUNCH must provide for the arms this argv actually turned on. An arm's `needs` are
 *  read only when the arm is enabled, so an ordinary run launches byte-identically to one from before the
 *  registry existed. */
export function armLaunchNeeds(opts: Args): ArmNeeds {
  const needs: readonly ArmNeeds[] = ARMS.map((arm) => ARM_DEFS[arm].needs(opts));
  return {
    ...(needs.some((need) => need.debuggingPort === true) ? { debuggingPort: true as const } : {}),
    ...(needs.some((need) => need.devtoolsSdk === true) ? { devtoolsSdk: true as const } : {}),
  };
}

/** Widest enabled arm operation wins the named-session outer watchdog. A sum would double-count arms
 * that execute within the same capture phase; a fixed 5s watchdog killed valid completed heap evidence. */
export function armSessionCallBaseMs(opts: Args): number | null {
  const bases = ARMS.flatMap((arm) => {
    const value = ARM_DEFS[arm].sessionCallBaseMs(opts);
    return value === null ? [] : [value];
  });
  return bases.length === 0 ? null : Math.max(...bases);
}

export function pageArms(): readonly (readonly [Arm, ArmPageLifecycle])[] {
  return ARMS.flatMap((arm): readonly (readonly [Arm, ArmPageLifecycle])[] => {
    const { lifecycle } = ARM_DEFS[arm] as ArmDef;
    if (lifecycle.at !== "page") {
      return [];
    }
    assertPageArmLifecycle(arm, lifecycle);
    return [[arm, lifecycle]];
  });
}

/** Runtime twin of ArmPageLifecycle's required total members. A future cast/JS row cannot quietly skip
 * the refusal fold merely because TypeScript normally checks the registry. */
export function assertPageArmLifecycle(arm: Arm, candidate: unknown): asserts candidate is ArmPageLifecycle {
  if (typeof candidate !== "object" || candidate === null || Reflect.get(candidate, "at") !== "page") {
    throw new Error(`INSTRUMENT ERROR: page arm "${arm}" produced no page lifecycle`);
  }
  for (const member of ["enabled", "run", "pairs", "evidence", "facts", "failures", "exit"] as const) {
    if (typeof Reflect.get(candidate, member) !== "function") {
      throw new Error(`INSTRUMENT ERROR: page arm "${arm}" omitted required lifecycle member "${member}"`);
    }
  }
}

/** Every arm's contribution to the ONE verdict summary, merged by field. Distinct arms never share a
 *  field (the one that would — `css` — is folded in ops/verdict.ts instead), so a later key can never
 *  silently overwrite an earlier one; a collision is an INSTRUMENT ERROR rather than a lost count. */
function mergeArmFailures(parts: readonly (readonly [Arm, ArmFailureCounts])[]): ArmFailureCounts {
  const merged = new Map<keyof SnapFailureSummary, number>();
  for (const [arm, counts] of parts) {
    for (const [field, count] of Object.entries(counts) as [keyof SnapFailureSummary, number][]) {
      if (merged.has(field)) {
        throw new Error(
          `INSTRUMENT ERROR: two arms claim the verdict member "${field}" (${arm} is the second) — one field, one owner (tooling/src/snap/contract/arms.ts)`,
        );
      }
      merged.set(field, count);
    }
  }
  return Object.fromEntries(merged) as ArmFailureCounts;
}

/** THE RUN ARMS AS ONE SURFACE. `ops/run.ts` gains no branch per arm: every member below is total and
 *  folds each live instance in `ARMS` order. */
export interface RunArms {
  readonly ratePosture: () => Promise<SnapRatePosture>;
  readonly prepare: () => Promise<void>;
  readonly afterNavigation: (ctx: ArmNavigationContext) => Promise<void>;
  readonly beforeAction: (ctx: ArmActionContext) => Promise<ArmActionDisposition>;
  readonly afterAction: (ctx: ArmActionContext & { readonly failed: boolean; readonly handled: boolean }) => Promise<void>;
  readonly afterActions: (ctx: ArmTapeContext) => Promise<void>;
  readonly afterSettle: (ctx: ArmTapeContext) => Promise<void>;
  readonly measure: (ctx: ArmRunContext) => Promise<void>;
  readonly report: (ctx: ArmRunContext) => Promise<void>;
  readonly failures: () => ArmFailureCounts;
  readonly denominators: () => Readonly<Record<string, VerdictDenominator>>;
  readonly pairs: () => ReadonlyMap<Arm, readonly ResultPair[]>;
  readonly facts: (artifacts: Readonly<Partial<Record<Arm, readonly ArtifactRef[]>>>) => readonly SnapArmFact[];
  readonly exit: (code: number) => number;
}

/** Runtime twin of the required TypeScript members. The registry is callable from transpiled JS and test
 * casts, so the pre-navigation guarantee cannot depend on static types alone. */
export function assertRunArmInstance(arm: Arm, candidate: unknown): asserts candidate is ArmRunInstance {
  if (typeof candidate !== "object" || candidate === null) {
    throw new Error(`INSTRUMENT ERROR: run arm "${arm}" produced no lifecycle instance`);
  }
  for (const member of [
    "prepare",
    "afterNavigation",
    "beforeAction",
    "afterAction",
    "afterActions",
    "afterSettle",
    "measure",
    "report",
    "failures",
    "denominators",
    "pairs",
    "facts",
    "exit",
  ] as const) {
    if (typeof Reflect.get(candidate, member) !== "function") {
      throw new Error(`INSTRUMENT ERROR: run arm "${arm}" omitted required lifecycle member "${member}"`);
    }
  }
}

export function beginRunArms(session: ProbeSession, opts: Args, readers: SnapRatePostureReaders = {}): RunArms {
  const ratePosture = sampleSnapRatePosture(session.browser, readers);
  const shared: ArmSharedContext = { ratePosture };
  const live = ARMS.flatMap((arm): readonly (readonly [Arm, ArmRunInstance, (artifacts: readonly ArtifactRef[]) => readonly SnapArmFact[]])[] => {
    const def: ArmDef = ARM_DEFS[arm];
    const { lifecycle } = def;
    if (lifecycle.at !== "run") {
      return [];
    }
    const instance = lifecycle.begin(session, opts, shared);
    assertRunArmInstance(arm, instance);
    return [
      [
        arm,
        instance,
        (artifacts): readonly SnapArmFact[] =>
          instance.facts().map((emission) =>
            snapArmFact({
              arm,
              schema: def.result.schema,
              source: def.result.source,
              lifetime: def.result.lifetime,
              scope: emission.scope,
              data: emission.data,
              artifacts,
            }),
          ),
      ],
    ];
  });
  return {
    ratePosture: async (): Promise<SnapRatePosture> => await ratePosture,
    prepare: async (): Promise<void> => {
      for (const [, instance] of live) {
        await instance.prepare();
      }
    },
    afterNavigation: async (ctx): Promise<void> => {
      for (const [, instance] of live) {
        await instance.afterNavigation(ctx);
      }
    },
    beforeAction: async (ctx): Promise<ArmActionDisposition> => {
      let handled = false;
      let failures = 0;
      for (const [arm, instance] of live) {
        const disposition = await instance.beforeAction(ctx);
        if (disposition === null) {
          continue;
        }
        if (disposition.handled && handled) {
          throw new Error(`INSTRUMENT ERROR: more than one arm handled tape action ${String(ctx.actionIndex)} (${arm} is the second)`);
        }
        handled ||= disposition.handled;
        failures += disposition.failures;
      }
      return { handled, failures };
    },
    afterAction: async (ctx): Promise<void> => {
      for (const [, instance] of live) {
        await instance.afterAction(ctx);
      }
    },
    afterActions: async (ctx): Promise<void> => {
      for (const [, instance] of live) {
        await instance.afterActions(ctx);
      }
    },
    afterSettle: async (ctx): Promise<void> => {
      for (const [, instance] of live) {
        await instance.afterSettle(ctx);
      }
    },
    measure: async (ctx): Promise<void> => {
      for (const [, instance] of live) {
        await instance.measure(ctx);
      }
    },
    report: async (ctx): Promise<void> => {
      for (const [, instance] of live) {
        await instance.report(ctx);
      }
    },
    failures: (): ArmFailureCounts => mergeArmFailures(live.map(([arm, instance]) => [arm, instance.failures()] as const)),
    denominators: () => Object.assign({}, ...live.map(([, instance]) => instance.denominators())) as Readonly<Record<string, VerdictDenominator>>,
    pairs: () => new Map(live.map(([arm, instance]) => [arm, instance.pairs()])),
    facts: (artifacts) => live.flatMap(([arm, , facts]) => facts(artifacts[arm] ?? [])),
    exit: (code: number): number => live.reduce((current, [, instance]) => instance.exit(current), code),
  };
}

/** Every page arm files what it printed, in `ARMS` order, BEFORE the facts are registered (#1342) — the
 *  index binds each artifact to its producer arm's fact, so a run whose values never reached disk is a
 *  receipt with nothing behind it. One call per run (or per scenario checkpoint, via `slug`). */
export async function writePageArmEvidence(input: ArmPairInput, slug = ""): Promise<void> {
  for (const [, lifecycle] of pageArms()) {
    await lifecycle.evidence(input, slug);
  }
}

export function pageArmFacts(input: ArmPairInput, artifacts: Readonly<Partial<Record<Arm, readonly ArtifactRef[]>>>): readonly SnapArmFact[] {
  return pageArms().flatMap(([arm, lifecycle]) => {
    const result = ARM_DEFS[arm].result;
    return lifecycle.facts(input).map((emission) =>
      snapArmFact({
        arm,
        schema: result.schema,
        source: result.source,
        lifetime: result.lifetime,
        scope: emission.scope,
        data: emission.data,
        artifacts: artifacts[arm] ?? [],
      }),
    );
  });
}

/** THE RESULT-LINE LEDGER. Every arm's pairs go in; `ops/run.ts` CLAIMS the ones whose position on the
 *  line is HISTORICAL (which is most of them — the line's field order is a contract with every script and
 *  agent that greps it) and appends whatever is left. So a new arm's pairs land at the tail with no edit
 *  in run.ts, while nothing that already prints can move. A claim for a pair the owning arm did not
 *  produce is an INSTRUMENT ERROR, never a silently absent field. */
export interface ArmPairLedger {
  /** All of this arm's pairs, in the arm's own order. */
  readonly arm: (arm: Arm) => readonly ResultPair[];
  /** Just these keys of this arm's pairs — for the one arm whose members print in two separate places. */
  readonly some: (arm: Arm, ...keys: readonly string[]) => readonly ResultPair[];
  /** Everything not claimed above, in `ARMS` order. */
  readonly rest: () => readonly ResultPair[];
}

export function armPairLedger(input: ArmPairInput, runPairs: ReadonlyMap<Arm, readonly ResultPair[]>): ArmPairLedger {
  const byArm = new Map<Arm, readonly ResultPair[]>(runPairs);
  for (const [arm, lifecycle] of pageArms()) {
    byArm.set(arm, lifecycle.pairs(input));
  }
  const claimed = new Set<string>();
  /** ONE builder for the claim key, used by both the claim and the leftover sweep. It is a function
   *  rather than an inline template at each site because two hand-written spellings of the same key is
   *  exactly how the ledger silently stopped matching: the first version minted the two keys in two
   *  separate template literals, they disagreed by one byte, and EVERY arm's pairs printed twice at the
   *  tail of the RESULT line while the spine above them looked perfect. */
  const claimKey = (arm: Arm, key: ResultPair[0]): string => `${arm}\u0000${String(key)}`;
  const take = (arm: Arm, pairs: readonly ResultPair[]): readonly ResultPair[] => {
    for (const [key] of pairs) {
      claimed.add(claimKey(arm, key));
    }
    return pairs;
  };
  const named = (arm: Arm, key: string): ResultPair => {
    const found = (byArm.get(arm) ?? []).find(([name]) => String(name) === key);
    if (found === undefined) {
      throw new Error(`INSTRUMENT ERROR: the RESULT line claims "${key}" from the ${arm} arm, which did not produce it (tooling/src/snap/ops/arms/${arm}.ts)`);
    }
    return found;
  };
  return {
    arm: (arm): readonly ResultPair[] => take(arm, byArm.get(arm) ?? []),
    some: (arm, ...keys): readonly ResultPair[] =>
      take(
        arm,
        keys.map((key) => named(arm, key)),
      ),
    rest: (): readonly ResultPair[] => ARMS.flatMap((arm) => (byArm.get(arm) ?? []).filter(([key]) => !claimed.has(claimKey(arm, key)))),
  };
}

/** Every page arm's verdict members. The run arms' are on the `RunArms` instance, because theirs depend on
 *  what the measurement actually did rather than on the outcomes alone. */
export function pageArmFailures(input: ArmPairInput): ArmFailureCounts {
  return mergeArmFailures(pageArms().map(([arm, lifecycle]) => [arm, lifecycle.failures(input)] as const));
}

/** A host that deliberately runs page arms only must prove every run arm is disabled, then initialize
 * their declared summary fields to zero. This is neither an absent pair nor a parsed transcript fact. */
export function disabledRunArmFailures(opts: Args, hosted: readonly Arm[] = []): ArmFailureCounts {
  const failures: Partial<Record<keyof SnapFailureSummary, number>> = {};
  for (const arm of ARMS) {
    const def: ArmDef = ARM_DEFS[arm];
    if (def.lifecycle.at !== "run") {
      continue;
    }
    if (def.result.enabled(opts) && !hosted.includes(arm)) {
      throw new Error(`INSTRUMENT ERROR: page-only host cannot skip enabled run arm ${arm}`);
    }
    for (const field of def.result.failureFields ?? []) {
      failures[field] = 0;
    }
  }
  return failures;
}

/** Every page arm receives the terminal code in roster order; ordinary arms are identity functions. */
export function pageArmExit(input: ArmPairInput, code: number): number {
  return pageArms().reduce((current, [, lifecycle]) => lifecycle.exit(input, current), code);
}
