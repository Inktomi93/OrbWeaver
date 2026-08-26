// The --json manifest: the lossless machine record beside the pixels (schemaVersion 1).
import { writeFile } from "node:fs/promises";
import type { AppearancePatch } from "../../_shared/appearance.ts";
import type { Viewport } from "../../_shared/argv.ts";
import { artifactFile } from "../../_shared/artifacts.ts";
import type { CapturedConsole, CapturedRequest } from "../../_shared/browser.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ThemeRequest } from "../../_shared/theme.ts";
import type { Args, CaptureOutcome, SnapFailureSummary, WatchTick } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route>");

interface SnapManifest {
  readonly schemaVersion: 1;
  readonly status: "pass" | "fail";
  readonly target: { readonly url: string; readonly name: string };
  readonly environment: {
    readonly viewport: Viewport;
    readonly device: string | null;
    readonly colorScheme: string | null;
    /** The OS media query (--reduced-motion/--probe). */
    readonly reducedMotion: boolean;
    /** The APP-setting shim actually applied to this run (--appearance/--appearance-preset/--full-motion),
     *  null when the run drove the account's real state — so a manifest never leaves which arm it measured
     *  to be inferred from the command line. */
    readonly appearance: AppearancePatch | null;
    /** Whether the requested appearance patch reached at least one real settings envelope in every context. */
    readonly appearanceApplied: boolean | null;
    /** The ACTIVE-THEME arm this run asked for (--theme), null when it drove the account's own theme. A
     *  request that failed to resolve printed a THEME SHIM WARNING and rendered the account's theme. */
    readonly theme: ThemeRequest | null;
    /** Whether the requested theme selection resolved and reached a settings envelope in every context. */
    readonly themeApplied: boolean | null;
  };
  readonly failures: SnapFailureSummary;
  readonly traces: readonly string[];
  readonly hars: readonly string[];
  readonly console: readonly CapturedConsole[];
  readonly pageErrors: readonly string[];
  /** Interaction-scoped diagnostics when --checkpoint is active; console/pageErrors above remain the
   *  lossless browser-lifetime record. */
  readonly evidence?: {
    readonly scope: "checkpoint";
    readonly console: readonly CapturedConsole[];
    readonly pageErrors: readonly string[];
  };
  readonly failedRequests: CapturedRequest[];
  /** Vite dep-optimizer aborts, kept for the record and excluded from the verdict (isViteDepChurn).
   *  Absent when there were none — a warm stage never produces any. */
  readonly viteDepChurn?: readonly CapturedRequest[];
  readonly captures: readonly CaptureOutcome[];
  /** Watch-only timeline. Present when --watch ran; ticks remain durable even when terminal output dedupes them. */
  readonly watch?: {
    readonly totalMs: number;
    readonly intervalMs: number;
    readonly ticks: readonly WatchTick[];
  };
  /** Scenario-only attribution. `captures[index]` and `scenario.checkpoints[index]` describe one checkpoint. */
  readonly scenario?: {
    readonly checkpoints: ReadonlyArray<{
      readonly name: string;
      /** Null when this checkpoint deliberately ran with --no-shot. */
      readonly screenshot: string | null;
      readonly console: readonly CapturedConsole[];
      readonly pageErrors: readonly string[];
    }>;
  };
}

// The manifest is the SHOT'S sibling: for a bare `--out home` that is reports/snaps/home.json exactly as
// before; for a path-shaped `--out /tmp/x.png` it is /tmp/x.json, next to the pixels it describes.
async function writeManifest(name: string, manifest: SnapManifest): Promise<string> {
  const path = await artifactFile("snaps", name, ".json");
  await writeFile(path, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  return path;
}

type ManifestInput = Omit<SnapManifest, "schemaVersion">;

export function appliedAcrossContexts(requested: boolean, values: readonly (boolean | null)[]): boolean | null {
  return requested ? values.every((value) => value === true) : null;
}

export async function writeManifestIfRequested(opts: Args, name: string, input: ManifestInput): Promise<string | null> {
  return opts.json ? await writeManifest(name, { schemaVersion: 1, ...input }) : null;
}
