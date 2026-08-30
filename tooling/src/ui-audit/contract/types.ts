// The run shapes of ui-audit: parsed args, the pre-audit action queue, capture/pixel outcomes.
// Split from the pre-move design-audit.ts monolith (P3 of #393).
import type { AppearancePatch } from "@orb/tooling/_shared/appearance";
import type { Viewport } from "@orb/tooling/_shared/argv";
import type { NavMethod } from "@orb/tooling/_shared/nav";
import type { ThemeRequest } from "@orb/tooling/_shared/theme";
import type { Severity } from "./findings.ts";
import type { RawSamples } from "./samples.ts";

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
