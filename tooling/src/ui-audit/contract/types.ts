// The run shapes of ui-audit: parsed args, the pre-audit action queue, capture/pixel outcomes.
// Split from the pre-move design-audit.ts monolith (P3 of #393).
import type { AppearancePatch } from "@orb/tooling/_shared/appearance";
import type { Viewport } from "@orb/tooling/_shared/argv";
import type { NavMethod } from "@orb/tooling/_shared/nav";
import type { ThemeRequest } from "@orb/tooling/_shared/theme";
import type { Severity } from "./findings.ts";
import type { RawSamples } from "./samples.ts";

/** One pre-audit action, in argv order: a DOM click or a dev-bridge navigation. */
export type AuditAction = { kind: "click"; selector: string } | { kind: "nav"; method: NavMethod; target: string };

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
  /** CLI misuse collected without side effects; any entry means EXIT.misuse before a browser boots. */
  errors: string[];
}

export interface CaptureOutcome {
  navError: string | null;
  actionsFailed: number;
  samples: RawSamples | null;
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
