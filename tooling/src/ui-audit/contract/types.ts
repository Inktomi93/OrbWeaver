// The RESIDUAL run shapes of the ui-audit engine: the census's own population bracket, the pixel pass,
// the shell snapshot and the forced-state pass receipt. Split from the pre-move design-audit.ts
// monolith (P3 of #393).
//
// `Args`, `AuditAction` and `CaptureOutcome` are GONE (#1315), not moved: they described a PROGRAM —
// a parsed argv, a drive queue, a per-page capture sheet — and this dir stopped being one when the
// scan became `pnpm snap <route> --design-audit`. Snap owns all three (snap/contract/types.ts).
import type { Finding, PopulationAccounting } from "./findings.ts";
import type { RawSamples, SubjectAccountingInput } from "./samples.ts";

/** What ONE `DesignAuditRuleFamily`'s checker returns to the collect dispatcher: its findings, the
 *  number of RULE dispatches it made (a scan proves a detector actually executed — a bypassed dispatch
 *  leaves a zero), and the population rows its rules published. Homed here rather than beside the
 *  dispatcher because `lib/collect.ts` and `lib/collect-families.ts` both need it. */
export interface FamilyCheckResult {
  readonly findings: readonly Finding[];
  readonly scans: number;
  readonly populationAccounting?: PopulationAccounting;
}

export type FamilyChecker = (samples: RawSamples) => FamilyCheckResult;

/** What the page's ELEMENT POPULATION did around the walk (#808) — the census's own denominator check.
 *  `duringWalk` is the most nodes that existed while the walk could have seen them (the max of a reading
 *  taken before it and one taken after, so a virtualised list scrolled by the reveal sweep cannot
 *  masquerade as late-arriving content); `settled` is the count once it stopped changing. Growth between
 *  the two is content the census structurally MISSED. */
export interface DomPopulation {
  duringWalk: number;
  settled: number;
  /** False when the count was still moving at the ceiling — the settled figure is then a floor. */
  stabilized: boolean;
  /** Identity-level proof that every settled subject was walked or explicitly skipped. */
  accounting: SubjectAccountingInput;
}

/** A text node the pixel sampler declined to judge, and why — printed + written, never silently dropped. */
export interface BackdropRefusal {
  selector: string;
  reason: string;
}

export interface PixelPass {
  samples: RawSamples;
  sampled: number;
  refusals: BackdropRefusal[];
}

/** The wire shape `window.__orb.shell()` returns (`packages/client/src/lib/agent-bridge-handles.ts`'s
 *  `ShellSnapshot`) — mirrored here rather than imported. The probe reads the dev bridge as JSON over
 *  `page.evaluate`, never as a live cross-package import (tooling declares no `@orb/client` dependency,
 *  and the DOM-derived reader is the one home for the query itself — this file only names its shape).
 *
 *  A panel row's `available` is the ACTIVE SECTION'S declaration for that pane (`data-panel-available`,
 *  `panel-chrome.tsx`), NOT a resolved mode: an unavailable pane and a merely-collapsed one both render
 *  `data-panel-mode="collapsed"`, which is why every unvisited mode used to be WITHHELD here (#1122).
 *  `null` means the shell published no declaration at all — a broken publish, refused loudly by
 *  `ops/page-validate.ts`, never read as "unavailable". */
export interface ShellStateSnapshot {
  readonly section: string | null;
  readonly panels: ReadonlyArray<{ readonly side: string | null; readonly mode: string | null; readonly available: boolean | null }>;
  readonly chatOpen: boolean;
  readonly focus: boolean;
}

/** THE TWO NON-RUNNING ARMS ARE NOT THE SAME ARM, and collapsing them is how a broken checker reads as
 *  a clean surface (#953's ruling, applied here):
 *   • `not-applicable` — the environment cannot hover at all (`(hover: none)`), so the app's whole hover
 *     layer is behind a media query that does not match. There is no hover state in existence to judge.
 *     Green, silent, no accounting row.
 *   • `broke` — the pass was SUPPOSED to run and threw. That is a checker that failed, which is exit-2
 *     NO VERDICT class, never a quiet partial on a green run. */
export type HoverPassOutcome =
  | { readonly kind: "ran" }
  | { readonly kind: "not-applicable"; readonly reason: string }
  | { readonly kind: "broke"; readonly reason: string };

/** What the pass cost and what it could not do — printed on the RESULT line beside the accounting row,
 *  because a hover census that forced nothing is only a verdict when a reader can see why. */
export interface HoverPass {
  readonly samples: RawSamples;
  readonly wallMs: number;
  readonly outcome: HoverPassOutcome;
  readonly subjectsForced: number;
  readonly forceFailures: readonly string[];
  /** How many state GROUPS failed to force or read — complete, unlike `forceFailures`, which quotes at
   *  most three. Carried separately because a failed group's members ride `withheld.forceFailed` and a
   *  glow-only group has NO members, so the member count alone cannot see it (#1031). */
  readonly forceFailedGroups: number;
}
