// THE `--theme` READINESS GATE (#1227) — the second half of "is this capture of the app I asked for?".
//
// THE LIE IT ENDS (measured): `data-app-ready` goes up when the initial reads settle, but the ACTIVE
// THEME lands one hop later — `use-selected-theme.ts` reads `config.theme.selectedThemeId` out of the
// (shimmed) settings response and only THEN fetches the theme row, after which app-shell stamps
// `<html data-theme=…>`. Under `--theme Light` the first post-readiness `--eval` read `(none)`, the
// post-`--goto` eval STILL read `(none)`, and only a third checkpoint read `light`. Everything a run
// samples in that window — a shot, a contrast verdict, an eval — describes the DEFAULT palette while the
// RESULT line says the run was themed. It cost a CTA census 24 false "theme-frozen" rows.
//
// SO: when the run asked for a theme whose stamp is PREDICTABLE, readiness is not readiness until the
// stamp matches, and a stamp that never lands is an INSTRUMENT ERROR (exit 2) naming what is missing —
// never a default-palette measurement wearing a theme label.
//
// WHAT IS PREDICTABLE, AND WHY THE OTHER ARMS ARE NAMED RATHER THAN GATED (source: _shared/theme.ts):
// app-shell derives `data-theme` from a SEED theme's own name (lowercased) — but ONLY for a seed that
// owns a generated `[data-theme]` block; Hearth is the base ramp and stamps nothing. A CUSTOM theme paints
// through <ThemeScope> and stamps no html attribute at all (D71), and `--theme none` selects "whatever
// the app defaults to", which is not a value this instrument may assert. Gating those on `[data-theme]`
// would manufacture refusals on exactly the cells `--matrix` is built from (its required rows are rated
// CUSTOM themes). They are reported as UNGATED with the reason, so a reader knows which half of the
// receipt is proven — silence would be the same defect in the other direction.

import { SEED_THEME_VALUE_SETS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { SettingsShimEvidence } from "../../_shared/appearance.ts";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { EvidenceGap } from "../../_shared/evidence.ts";
import { printEvidenceGaps } from "../../_shared/evidence.ts";
import { EXIT } from "../../_shared/exit-contract.ts";
import type { ThemeStampExpectation, ThemeStampReceipt } from "../contract/theme-stamp.ts";
import type { CaptureOutcome } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --theme <name>");

const STAMP_ATTRIBUTE = "data-theme";
/** Poll budget for the stamp. It follows the settings read the readiness flag already waited for, so this
 *  is a short tail, not a second boot wait — and it is a REFUSAL when it expires, never a shrug. */
const STAMP_TIMEOUT_MS = 15_000;
const STAMP_POLL_MS = 100;

/** PURE — the decision, so both arms are unit-provable without a browser. */
export function themeStampExpectation(evidence: SettingsShimEvidence | undefined): ThemeStampExpectation {
  const resolution = evidence?.themeResolution ?? null;
  if (resolution === null) {
    return { kind: "ungated", reason: "no --theme was applied to this run" };
  }
  const seedName = resolution.source === "seed" ? resolution.name : null;
  if (seedName !== null) {
    const stamp = seedName.toLowerCase();
    // A SEED THEME THAT OWNS NO BLOCK STAMPS NOTHING, and that is CORRECT, not a miss: Hearth IS the base
    // `@theme` ramp, `dataThemeOf` (packages/client/src/lib/resolve-theme-scope-tokens.ts) answers null
    // for it, and the shell paints it by stamping nothing at the root. Gating on `isSeed` alone would
    // have refused every `--theme Hearth` run as though the palette never applied — so the predicate
    // reads the SAME generated source the `[data-theme]` blocks are emitted from, never a name list of
    // its own (a second home for the seed vocabulary is how the two would drift).
    return Object.hasOwn(SEED_THEME_VALUE_SETS, stamp)
      ? { kind: "gated", stamp, themeName: seedName }
      : {
          kind: "ungated",
          reason: `--theme resolved to the seed theme ${JSON.stringify(seedName)}, which owns no generated [data-theme] block (it IS the base @theme ramp) and stamps nothing — the stamp cannot gate this run`,
        };
  }
  if (resolution.source === "custom") {
    return {
      kind: "ungated",
      reason: `--theme resolved to the CUSTOM theme ${JSON.stringify(resolution.name ?? resolution.request)}, which paints through <ThemeScope> and stamps no html[data-theme] (D71) — the stamp cannot gate this run`,
    };
  }
  return {
    kind: "ungated",
    reason: `--theme ${JSON.stringify(resolution.request)} resolved to source "${resolution.source}", whose html[data-theme] value is not derivable — the stamp cannot gate this run`,
  };
}

/** PURE — the refusal text for a stamp that never matched. `observed` is what `<html>` actually carried
 *  (null = the attribute was absent for the whole window). */
export function themeStampGap(expectation: { readonly stamp: string; readonly themeName: string }, observed: string | null): EvidenceGap {
  return {
    evidence: `the ${STAMP_ATTRIBUTE} stamp for --theme ${expectation.themeName}`,
    detail:
      `<html ${STAMP_ATTRIBUTE}> ${observed === null ? "was ABSENT" : `read ${JSON.stringify(observed)}`} after ${STAMP_TIMEOUT_MS}ms, but the run asked for ` +
      `${JSON.stringify(expectation.stamp)} — everything this run would have sampled (pixels, contrast, evals) describes the DEFAULT palette, not the theme on the RESULT line (#1227). ` +
      "A chat room whose CARD carries its own theme legitimately has no html stamp (D71): take theme arms on a non-carried surface. The mechanism is tooling/src/_shared/theme.ts.",
  };
}

/** The verdict door, total: print every page's missing-stamp gap and downgrade the run to
 *  `EXIT.toolError`, or hand the code back untouched. One call, no branch at the call site — the run
 *  paths wrap their `printVerdict` result in it. */
export function themeStampExit(outcomes: readonly Pick<CaptureOutcome, "themeStampGap">[], code: number): number {
  const gaps = outcomes.flatMap((outcome) => (outcome.themeStampGap === null ? [] : [outcome.themeStampGap]));
  if (gaps.length === 0) {
    return code;
  }
  printEvidenceGaps(gaps);
  return EXIT.toolError;
}

/** Wait for the stamp. Polls rather than using a locator wait so the OBSERVED value is available for the
 *  refusal — "absent" and "the wrong theme" are different findings and the operator needs to be told which
 *  one happened. Returns a RECEIPT rather than a bare verdict: `polls` is how many times the attribute was
 *  actually read, so "the ungated arm never touched the page" is a fact the instrument REPORTS instead of
 *  something a caller has to infer by timing the call (#1252). */
export async function awaitThemeStamp(page: Page, evidence: SettingsShimEvidence | undefined): Promise<ThemeStampReceipt> {
  const expectation = themeStampExpectation(evidence);
  if (expectation.kind === "ungated") {
    return { gap: null, polls: 0 };
  }
  const deadline = Date.now() + STAMP_TIMEOUT_MS;
  let observed: string | null = null;
  let polls = 0;
  while (Date.now() < deadline) {
    polls += 1;
    observed = await page.locator("html").first().getAttribute(STAMP_ATTRIBUTE);
    if (observed === expectation.stamp) {
      return { gap: null, polls };
    }
    await new Promise((resolve) => setTimeout(resolve, STAMP_POLL_MS));
  }
  return { gap: themeStampGap(expectation, observed), polls };
}
