// The run shapes of ui-audit: parsed args, the pre-audit action queue, capture/pixel outcomes.
// Split from the pre-move design-audit.ts monolith (P3 of #393).
import type { AppearancePatch } from "@orb/tooling/_shared/appearance";
import type { Viewport } from "@orb/tooling/_shared/argv";
import type { NavMethod } from "@orb/tooling/_shared/nav";
import type { ThemeRequest } from "@orb/tooling/_shared/theme";
import type { Severity } from "./findings.ts";
import type { RawSamples, SubjectAccountingInput } from "./samples.ts";

/** One pre-audit action, in argv order: a DOM click, a dev-bridge navigation, or a file-input upload
 *  (#651 — a census taken against an empty dropzone is a FALSE CLEAN; `--upload` lets the walk see the
 *  surface a file actually populates, the plugin grant screen being the case that named this). */
export type AuditAction =
  | { kind: "click"; selector: string }
  | { kind: "nav"; method: NavMethod; target: string }
  | { kind: "upload"; selector: string; paths: readonly string[] };

export interface Args {
  route: string;
  base: string;
  /** Run the bounded representative Appearance matrix through the ordinary single-audit path. */
  matrix: boolean;
  actions: AuditAction[];
  waitMs: number;
  out: string | null;
  viewport: Viewport;
  /** A Playwright device descriptor name (--mobile), or null for the raw desktop viewport. */
  device: string | null;
  failOn: Severity;
  /** `--appearance`/`--appearance-preset`/`--full-motion`: the app-SETTING shim (_shared/appearance.ts) — a
   *  scan of the owner's account only ever judges HIS appearance choices; the shipped defaults, the
   *  compact/reading arms and every ornament he has off are unreachable without it. Never written. */
  appearance: AppearancePatch | null;
  /** `--theme <name|id|none>`: the ACTIVE THEME this run pretends is selected, shimmed over the same
   *  `settings.getUserSettings` response (never written — _shared/theme.ts). null = the account's own theme. */
  theme: ThemeRequest | null;
  /** True once `--base` was passed explicitly — the tell that the caller named WHERE, which conflicts with
   *  the stage flags below (two answers to one question is a lie about what was audited, never a default). */
  baseExplicit: boolean;
  /** `--isolated`/`--ref`/`--dirty`/`--fresh` (#678): audit the ISOLATED STAGE — the second, offset-port dev
   *  stack snap owns (a detached worktree at a commit, or an rsync of the working tree), instead of whatever
   *  `--base` serves. `:5173` serves MAIN (AGENTS.md §L.6), so this is the only way a LANE can audit its own
   *  branch. `--ref`/`--dirty`/`--fresh` each imply `--isolated`. Stage admin stays on snap
   *  (`--stage-status`/`--stage-down`/`--stage-sweep`) — one home for the band's lifecycle. */
  isolated: boolean;
  /** The commit the stage serves; null = HEAD of this checkout. Unresolvable ⇒ EXIT.misuse, never a
   *  fallback audit of the dev stack. */
  ref: string | null;
  /** Stage the WORKING TREE (rsync) instead of a commit — mutually exclusive with `--ref`. */
  dirty: boolean;
  /** Force a stage rebuild rather than reusing the warm one. */
  fresh: boolean;
  /** The booted stage's short sha (or the dirty key), filled by ops/stage.ts — what the RESULT line and the
   *  JSON report publish as `stage=`, so a receipt states WHICH tree it measured. null = the live base. */
  stageShortSha: string | null;
  /** CLI misuse collected without side effects; any entry means EXIT.misuse before a browser boots. */
  errors: string[];
}

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

export interface CaptureOutcome {
  navError: string | null;
  actionsFailed: number;
  /** Did the page publish `html[data-app-ready]` within the wait? False on a `file://` fixture (expected —
   *  no app runs there) and on an app origin whose app never mounted, which is an INSTRUMENT gap, not a
   *  clean surface (lib/evidence.ts `readinessGap`, #678). */
  appReady: boolean;
  samples: RawSamples | null;
  /** null when nothing was walked (a nav error, or a walk that threw) — those arms report as themselves. */
  population: DomPopulation | null;
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
 *  and the DOM-derived reader is the one home for the query itself — this file only names its shape). */
export interface ShellStateSnapshot {
  readonly section: string | null;
  readonly panels: ReadonlyArray<{ readonly side: string | null; readonly mode: string | null }>;
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
}
