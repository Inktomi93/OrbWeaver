// The PAGE-level type censuses — which faces a surface paints (`off-theme-font`) and whether its type
// steps are far enough apart to read as a hierarchy (`flat-type-hierarchy`). Pure. Split out of
// checks-typography.ts when #23 gave the face census its paint evidence and the pair crossed the
// tooling-size cap: these two judge the PAGE as one subject, while everything left in that file judges
// one text element at a time. Provenance/attribution: lib/collect.ts header.
import type { Finding, RulePopulationAccounting } from "../contract/findings.ts";
import type { FontCensusInput, FontFaceInput } from "../contract/samples.ts";
import { settledPopulationAccounting } from "./population.ts";
import { RAMP_FONT_FACES } from "./ramp.ts";

const FLAT_HIERARCHY_MIN_SIZES = 3;

const FLAT_HIERARCHY_MIN_RATIO = 2.0;

// ── off-theme-font: the DECLARED face and the PAINTED face are two different questions (#23) ─────────
//
// THE LIE THIS CLOSES. The census gathers `getComputedStyle(el).fontFamily`'s first non-generic entry —
// a CASCADE fact. Font loading cannot move it, because no CSSOM surface exposes the face that actually
// painted. So the rule's original promise ("the ONLY faces a rendered page may resolve") was one the
// mechanism could not keep: measured on this tree, the app declares `Geist, ui-sans-serif, system-ui,
// sans-serif`, no `@font-face` registers Geist anywhere in the repo, Geist is not installed on the host,
// and `document.fonts` holds twenty KaTeX faces and no Geist — yet every design-audit run reported the
// font census CLEAN. A FALSE CLEAN on precisely the defect the rule names, on every surface.
//
// WHY NOT document.fonts.check. For a family with NO registered face the spec's algorithm finds nothing
// to wait on and returns TRUE — measured here: `check("16px ZzzNotAFont") === true`. A face that was
// never REGISTERED and one that failed to LOAD are different states, and check() reports the first as
// available. The walker uses glyph metrics instead (census-text.ts), with a two-sided control every run.
//
// THE FOUR ARMS, and why only one of them withholds:
//   • face OFF the token stacks → FIRES, as it always did. That the cascade names a non-token face is an
//     authored fact, true whether or not the face resolves, so it needs no environment evidence.
//   • token face, PAINTABLE → silent. The only true pass.
//   • token face, measurably NOT paintable → FIRES, naming the measurement. The surface is painting a
//     fallback nobody chose; that is the same defect as a stray face, arriving from the other side.
//   • token face, probe could not discriminate → WITHHELD (`faceProbeUnusable`). Absence of measurement
//     is never a pass. It is deliberately the ONLY withhold: a measured absence is evidence, and routing
//     it to `withheld` would turn every run in every lane into a NO VERDICT (lib/population.ts) over one
//     missing webfont, burying the signal it was supposed to raise.
type FaceOutcome = { readonly kind: "withheld"; readonly reason: string } | { readonly kind: "judged"; readonly finding: Finding | null };

const TOKEN_STACKS = (): string => `font.sans/font.mono → ${[...RAMP_FONT_FACES].join(", ")}`;

/** The measured paint state of a stray face, as prose and as the finding's `value` tag. Both arms of the
 *  probe verdict are named: a face that paints, a face that falls through, and the run where the probe
 *  itself could not answer — the last one is stated rather than rendered as a pass. */
function paintEvidence(face: FontFaceInput, probeUsable: boolean): { readonly prose: string; readonly tag: string } {
  if (!probeUsable) {
    return { prose: "whether it paints could not be measured (the face probe failed its own control)", tag: "paint unmeasured" };
  }
  return face.available
    ? { prose: "it IS available here, so it is what paints", tag: "paints" }
    : { prose: "it is NOT available here, so this text paints an unnamed fallback further down the stack", tag: "declared, not paintable" };
}

function strayFaceFinding(face: FontFaceInput, probeUsable: boolean): Finding {
  const { prose: paints, tag } = paintEvidence(face, probeUsable);
  return {
    rule: "off-theme-font",
    severity: "P2",
    selector: "page",
    value: `${face.name} (${tag})`,
    message: `font face "${face.name}" is outside the token stacks (${TOKEN_STACKS()}) — ${paints}; a stray face means a missing font-family token application`,
    origin: "impeccable",
  };
}

function unpaintableTokenFinding(face: FontFaceInput): Finding {
  return {
    rule: "off-theme-font",
    severity: "P2",
    selector: "page",
    value: `${face.name} (token face, not paintable)`,
    message: `token font face "${face.name}" is declared (${TOKEN_STACKS()}) but MEASURABLY does not paint here — no registered @font-face and no installed face answers to it, so the surface renders the next fallback in the stack and the token names a face the reader never sees; ship the face or retoken the stack to what actually paints`,
    origin: "orbweaver",
  };
}

function faceOutcome(face: FontFaceInput, probeUsable: boolean): FaceOutcome {
  if (!RAMP_FONT_FACES.has(face.name)) {
    return { kind: "judged", finding: strayFaceFinding(face, probeUsable) };
  }
  if (!probeUsable) {
    return { kind: "withheld", reason: "faceProbeUnusable" };
  }
  return { kind: "judged", finding: face.available ? null : unpaintableTokenFinding(face) };
}

/** The `off-theme-font` denominator: every censused face, settled. Withheld faces are the run's own
 *  admission that it could not measure paint — never a quietly smaller denominator. */
export function fontCensusPopulations(census: FontCensusInput): RulePopulationAccounting {
  const withheld: Record<string, number> = {};
  let judged = 0;
  let affected = 0;
  for (const face of census.faces) {
    const outcome = faceOutcome(face, census.probeUsable);
    if (outcome.kind === "withheld") {
      withheld[outcome.reason] = (withheld[outcome.reason] ?? 0) + 1;
      continue;
    }
    judged += 1;
    if (outcome.finding !== null) {
      affected += 1;
    }
  }
  return settledPopulationAccounting("off-theme-font", {
    candidates: census.faces.length,
    judged,
    affected,
    populations: affected,
    emitted: affected,
    withheld,
    excluded: {},
    collapsed: {},
  });
}

export function checkFontCensus(census: FontCensusInput): Finding[] {
  const findings: Finding[] = [];
  for (const face of census.faces) {
    const outcome = faceOutcome(face, census.probeUsable);
    if (outcome.kind === "judged" && outcome.finding !== null) {
      findings.push(outcome.finding);
    }
  }
  if (census.sizes.length >= FLAT_HIERARCHY_MIN_SIZES) {
    const sorted = [...census.sizes].sort((a, b) => a - b);
    const min = sorted[0] as number;
    const max = sorted.at(-1) as number;
    if (min > 0 && max / min < FLAT_HIERARCHY_MIN_RATIO) {
      findings.push({
        rule: "flat-type-hierarchy",
        severity: "P3",
        selector: "page",
        value: `${sorted.map((s) => `${s}px`).join(", ")} (ratio ${(max / min).toFixed(1)}:1)`,
        message:
          "page font sizes are too close together for a visible hierarchy — use fewer steps with more contrast (the ramp spans micro 10.5 → display 24 for a reason)",
        origin: "impeccable",
      });
    }
  }
  return findings;
}
