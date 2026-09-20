// The PAGE→NODE seam validators for the reads OUTSIDE the forced-state pass — the fact walk's whole
// return object and the `__orb.shell()` bridge read. Same discipline, same reason, as ops/hover-validate.ts
// (which owns the hover pass's seams): a cast across the page boundary has no compiler behind it.
//
// WHY THIS IS NOT PARANOIA, MEASURED (2026-09-01, by renaming a key in ops/walker/returns.ts and running
// the CLI both ways). The walker is a hand-written JS STRING assembled from ~17 segments; nothing
// type-checks it against `RawSamples`, so `(await page.evaluate(COLLECT_SAMPLES_JS)) as RawSamples`
// asserted a 40-field contract on faith. Both arms of the old behaviour were wrong, in different ways:
//   • a dropped REQUIRED family did not read clean — it CRASHED, opaquely and in the wrong place:
//     `TypeError: Cannot read properties of undefined (reading 'length')` inside lib/evidence.ts
//     (`tapTargets`) or `…(reading 'filter')` inside ops/pixels.ts (`texts`). Exit 2, no mention of the
//     walk, and the stack points a reader at an innocent file.
//   • a family present at the WRONG KIND, and every OPTIONAL family, has no such tripwire at all: the
//     consumers read those as "not censused", which is the genuinely silent arm — a rule with no samples
//     files no findings, and the run reports a clean surface.
// Validated, both become the same thing: a named INSTRUMENT ERROR that ops/run.ts already renders as
// "the in-page node walk is ABSENT — this run is not a verdict". Same class as the pass's founding defect
// (`JSON.parse(raw) as number[]` over selector strings, which quietly disabled restoration withholding),
// one boundary up and with a much larger blast radius.
//
// THE FIELD TABLE CANNOT DRIFT: it is a `Record<keyof RawSamples, …>`, so adding a field to the contract
// without classifying it here is a tsc error, not a silently unchecked field. Kinds are CONTAINER-level
// (is this an array / an object / a boolean, and is it allowed to be absent) — per-row validation belongs
// to the rule that reads the row, and a deep re-spelling here would be a second copy of the contract.
import { describePageValue, instrumentRefusal, isPlainObject } from "@orb/tooling/_shared/page-validate";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { RawSamples } from "../contract/samples.ts";
import type { ShellStateSnapshot } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --design-audit");

/** `?` = optional (the field is absent from sample sets that predate its family, which every consumer
 *  already reads as "not censused"); the bare kinds are required and their absence is an instrument gap.
 *  Homed as a tuple and derived, the house string-union shape (Spine-TypeScript-and-Patterns.md §7.5). */
const SEAM_KINDS = ["array", "array?", "boolean", "object", "object?"] as const;
type SeamKind = (typeof SEAM_KINDS)[number];

const RAW_SAMPLE_SHAPE: Record<keyof RawSamples, SeamKind> = {
  accentBorders: "array",
  accessibleNames: "array",
  actionDoors: "array?",
  animatedImgHovers: "array",
  bgPatterns: "array",
  borderContrasts: "array?",
  brokenImages: "array",
  buriedRasters: "array?",
  censusCaps: "object",
  censusReach: "object?",
  clippedOverflows: "array",
  cohortAnatomies: "array?",
  controlAspects: "array?",
  documentFrame: "object",
  edgeFlushCards: "array",
  emptyStates: "array?",
  fontCensus: "object",
  gradientTexts: "array",
  headings: "array",
  headlineOverhangs: "array?",
  hoverScan: "object?",
  hoverStates: "array?",
  iconTiles: "array",
  images: "array",
  inlinePaddingLeaks: "array?",
  mainLandmarkPresent: "boolean",
  motionStatics: "array",
  nestedCards: "array",
  obscuredScan: "object?",
  obscuredTargets: "array?",
  offGridTexts: "array?",
  offGridTransforms: "array?",
  overflows: "array",
  paneInks: "array?",
  pointerCoarse: "boolean",
  promotedLayerOffsets: "array?",
  quietStates: "array?",
  radialGlows: "array",
  relationalAccounting: "object?",
  repeatedTexts: "array",
  rowVoids: "array?",
  selectionIdioms: "array?",
  shadowGlows: "array",
  subjectAccounting: "object",
  tabIndexes: "array",
  tapTargets: "array",
  unreachableHints: "array?",
  textStyles: "array",
  texts: "array",
  themeRender: "object",
  tierDrifts: "array?",
  truncatedTexts: "array?",
  zIndexes: "array",
};

// `isPlainObject` / `describePageValue` / `instrumentRefusal` come from `_shared/page-validate.ts`. This
// file used to re-derive all three (#1317 item 3) — the "second copy of the contract that drifts" its own
// header forbids one paragraph up, and the reason the shared primitives exist at all. The KIND TABLE
// below stays local: it is THIS walk's contract, not a shared primitive.
const SEAM_MATCHERS: Record<string, (value: unknown) => boolean> = {
  array: Array.isArray,
  boolean: (value) => typeof value === "boolean",
  object: isPlainObject,
};

function checkField(field: string, kind: SeamKind, value: unknown, label: string): void {
  if (value === undefined && kind.endsWith("?")) {
    return;
  }
  const want = kind.replace("?", "");
  if (SEAM_MATCHERS[want]?.(value) !== true) {
    const article = want === "array" ? "an" : "a";
    instrumentRefusal(`${label} returned ${describePageValue(value)} for "${field}", not ${article} ${want} — the walk did not produce the sample contract`);
  }
}

/** The fact walk's whole return object, settled at the seam. A malformed family is a NO VERDICT for the
 *  entire run (drive.ts renders the throw as `sample collection: …`, which ops/run.ts already classes as
 *  an INSTRUMENT failure), never a family that quietly censuses nothing. */
export function rawSamples(parsed: unknown, label = "the in-page fact walk"): RawSamples {
  if (!isPlainObject(parsed)) {
    instrumentRefusal(`${label} returned ${describePageValue(parsed)}, not a sample object`);
  }
  const record: Record<string, unknown> = parsed;
  for (const [field, kind] of Object.entries(RAW_SAMPLE_SHAPE)) {
    checkField(field, kind, record[field], label);
  }
  // Every field in the table above was just classified; this is the ONE assertion the seam exists to
  // make, and it is made after the checks rather than instead of them.
  return record as unknown as RawSamples;
}

/** THE FAILURE-SURFACE READ (#1081) — `[data-app-failure]`'s value, or `null` for "the app is not declaring
 *  a failure surface", which is the healthy case and the one every audit expects. Same seam discipline as
 *  the reads above: the evaluate returns `unknown`, and a non-string non-null here would mean the page
 *  answered something the declare's contract does not allow, which is an instrument error rather than a
 *  quiet "no failure" — that quiet arm is exactly the false clean the declare exists to close. The VALUE is
 *  not matched against a known list: a kind this instrument has not heard of is still the app saying this is
 *  not a surface, and printing the unknown word is more useful than folding it into a verdict. */
export function appFailureSurface(parsed: unknown, label = "the [data-app-failure] declare read"): string | null {
  if (parsed === null || parsed === undefined) {
    return null;
  }
  if (typeof parsed !== "string") {
    instrumentRefusal(`${label} returned ${describePageValue(parsed)}, not a failure-surface kind or null`);
  }
  return parsed;
}

/** One `.shell-panel` row of the bridge read. `side`/`mode` are the rendered facts; `available` is the
 *  ACTIVE SECTION'S DECLARATION and is REQUIRED, because its absence is exit-2 rather than a default
 *  (#1122): it is the only thing that lets the SURFACE-AXIS census say EXCLUDED instead of WITHHELD on a
 *  pane a section structurally does not have, so a build that does not publish `data-panel-available`
 *  (`panel-chrome.tsx`) must STOP the run instead of silently falling back to the old guess. `null` is the
 *  same class as absent — the pane rendered and declared nothing. */
function checkPanelRow(panel: unknown, label: string): void {
  if (!isPlainObject(panel)) {
    instrumentRefusal(`${label} returned ${describePageValue(panel)} as a panel row, not a { side, mode, available } row`);
  }
  const row: Record<string, unknown> = panel;
  const side = row["side"];
  const mode = row["mode"];
  if ((typeof side !== "string" && side !== null) || (typeof mode !== "string" && mode !== null)) {
    instrumentRefusal(`${label} returned a panel row whose side/mode is not a string or null`);
  }
  if (typeof row["available"] !== "boolean") {
    instrumentRefusal(
      `${label} returned a panel row (side=${String(side)}) with no boolean "available" declaration — this build does not publish data-panel-available (panel-chrome.tsx), so the surface-axis census cannot tell an UNAVAILABLE pane from a collapsed one and this run is not a verdict`,
    );
  }
}

/** The shell bridge read (`window.__orb.shell()`). `null` is a REAL answer — the bridge is absent on a
 *  non-app page — so it is passed through; anything else must be the snapshot the panel-axis declare
 *  reads, because a malformed one degrades that declare into a silently wrong surface-state accounting. */
export function shellStateSnapshot(parsed: unknown, label = "the __orb.shell() bridge read"): ShellStateSnapshot | null {
  if (parsed === null || parsed === undefined) {
    return null;
  }
  if (!isPlainObject(parsed)) {
    instrumentRefusal(`${label} returned ${describePageValue(parsed)}, not a shell snapshot`);
  }
  const shell: Record<string, unknown> = parsed;
  const section = shell["section"];
  if (typeof section !== "string" && section !== null) {
    instrumentRefusal(`${label} returned ${describePageValue(section)} for "section", not a string or null`);
  }
  checkField("chatOpen", "boolean", shell["chatOpen"], label);
  checkField("focus", "boolean", shell["focus"], label);
  checkField("panels", "array", shell["panels"], label);
  for (const panel of shell["panels"] as readonly unknown[]) {
    checkPanelRow(panel, label);
  }
  // Same posture as `rawSamples` above: asserted once, after the container and every read field passed.
  return shell as unknown as ShellStateSnapshot;
}
