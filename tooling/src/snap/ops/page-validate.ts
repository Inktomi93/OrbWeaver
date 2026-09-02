// snap's PAGE→NODE seam validators (#1004) — every in-page read settled at the boundary instead of cast.
//
// The primitives and the argument live in `_shared/page-validate.ts`; this file declares WHAT each of
// snap's page scripts must have returned. One file rather than a validator per ops module because three
// of the hosts (`contrast.ts` 433, `materialize-devtools.ts` 422, `appearance-invariant-runtime.ts` 434)
// sit within twenty lines of the 450-line tooling cap, and because collecting them makes the shared
// discipline visible in one place.
//
// EACH ARM NAMES THE LIE IT PREVENTS — none of these is hypothetical:
//   • contrast facts     — a union whose arms are told apart by the PRESENCE of a key (`offscreen`,
//                          `occluded`). A malformed object satisfies none of them and falls through to
//                          the measured arm, where `undefined` color/box produce a fabricated verdict.
//   • map entries        — each row is handed to a per-row selector validator that immediately reads
//                          `.selector`/`.role`/`.name`; a non-row throws deep inside that walk with no
//                          mention of the page read that produced it.
//   • dead-css census    — every number here is printed as evidence and compared against a budget.
//   • dead-css drain     — `null` is a REAL answer (a `--file` fixture has no bridge) and must stay
//                          distinguishable from "the drain returned something we could not read".
//   • perf evidence      — read inside a `catch → null` (optional-read-as-absent), so a malformed
//                          payload must throw HERE to reach that arm rather than land as fake numbers.
//   • devtools proof     — the attach proof for the whole DevTools materialisation.
//   • reset/animation    — the appearance-invariant row's own preconditions; each already has an
//                          `instrumentError` arm for a FALSE answer, and none had one for a wrong SHAPE.
import { pageArray, pageBoolean, pageNumber, pageNumberFields, pageObject, pageString } from "@orb/tooling/_shared/page-validate";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { ContrastFacts } from "../contract/contrast.ts";
import type { DeadCssEvidence } from "../contract/dead-css.ts";
import type { PerfEvidence, RawMapEntry } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap");

/** The `--contrast` script's raw facts. `null` (no match) is a real answer; the three non-null arms are
 *  discriminated by key presence, so the arm test happens HERE rather than by falling through. */
export function contrastFacts(value: unknown): ContrastFacts {
  if (value === null || value === undefined) {
    return null;
  }
  const label = "the contrast read";
  const record = pageObject(value, label);
  if (record["offscreen"] === true) {
    pageNumber(record["total"], `${label} field "total"`);
    return record as unknown as ContrastFacts;
  }
  if (record["occluded"] === true) {
    pageNumberFields(record, ["total", "inViewport"], label);
    return record as unknown as ContrastFacts;
  }
  pageString(record["color"], `${label} field "color"`);
  pageNumberFields(record, ["fontSizePx", "fontWeight", "foregroundOpacity", "matchIndex", "total"], label);
  pageObject(record["backdrop"], `${label} field "backdrop"`);
  pageObject(record["box"], `${label} field "box"`);
  pageBoolean(record["hasText"], `${label} field "hasText"`);
  pageBoolean(record["hasIconInk"], `${label} field "hasIconInk"`);
  pageObject(record["radii"], `${label} field "radii"`);
  pageBoolean(record["inactive"], `${label} field "inactive"`);
  return record as unknown as ContrastFacts;
}

/** `--map`'s raw rows. `null` means "no element matches", which the caller renders as its own message. */
export function rawMapEntries(value: unknown): RawMapEntry[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  const label = "the map read";
  const rows = pageArray(value, label);
  for (const [index, row] of rows.entries()) {
    const record = pageObject(row, `${label} row ${String(index)}`);
    for (const field of ["role", "name", "selector", "fallback", "semanticFallback"]) {
      pageString(record[field], `${label} row ${String(index)} field "${field}"`);
    }
  }
  return rows as RawMapEntry[];
}

export function deadCssDrain(value: unknown): DeadCssEvidence["drain"] {
  if (value === null || value === undefined) {
    return null;
  }
  const label = "the motion-flagger drain receipt";
  const record = pageObject(value, label);
  pageNumberFields(record, ["requestedGeneration", "completedGeneration"], label);
  return record as unknown as DeadCssEvidence["drain"];
}

export function deadCssCensus(value: unknown): Omit<DeadCssEvidence, "drain"> {
  const label = "the dead-css census";
  const record = pageObject(value, label);
  pageNumberFields(record, ["sheets", "readableSheets", "rules", "defined", "used"], label);
  pageArray(record["unreadable"], `${label} field "unreadable"`);
  pageArray(record["dead"], `${label} field "dead"`);
  pageArray(record["empty"], `${label} field "empty"`);
  return record as unknown as Omit<DeadCssEvidence, "drain">;
}

export function perfEvidence(value: unknown): PerfEvidence {
  const label = "the perf evidence read";
  const record = pageObject(value, label);
  if (record["navigation"] !== null && record["navigation"] !== undefined) {
    pageNumberFields(pageObject(record["navigation"], `${label} field "navigation"`), ["domContentLoadedMs", "loadMs", "responseMs"], `${label}.navigation`);
  }
  return record as unknown as PerfEvidence;
}

export interface DevToolsDiscoveryProof {
  readonly inspectedUrl: string;
  readonly fixture: boolean;
  readonly rows: readonly unknown[];
}

export function devToolsDiscoveryProof(value: unknown): DevToolsDiscoveryProof {
  const label = "the DevTools discovery bridge";
  const record = pageObject(value, label);
  return {
    inspectedUrl: pageString(record["inspectedUrl"], `${label} field "inspectedUrl"`),
    fixture: pageBoolean(record["fixture"], `${label} field "fixture"`),
    rows: pageArray(record["rows"], `${label} field "rows"`),
  };
}

/** The appearance row's checkpoint reset. `false` is a real answer the caller already turns into an
 *  INSTRUMENT ERROR; a non-boolean is a different failure and must not read as truthy. */
export function checkpointReset(value: unknown): boolean {
  return pageBoolean(value, "the checkpoint-evidence reset");
}

/** The measured-evidence reset returns the list of ring failures — empty means every ring reset. */
export function resetFailures(value: unknown): readonly string[] {
  const label = "the measured-evidence reset";
  const rows = pageArray(value, label);
  for (const [index, row] of rows.entries()) {
    pageString(row, `${label} row ${String(index)}`);
  }
  return rows as readonly string[];
}

export interface AnimationEvidence {
  readonly total: number;
  readonly dirty: number;
  readonly properties: readonly string[];
}

/** `null` is a real answer (no `__orb.animations`), which the caller turns into an INSTRUMENT ERROR. */
export function animationEvidence(value: unknown): AnimationEvidence | null {
  if (value === null || value === undefined) {
    return null;
  }
  const label = "the active-animation evidence read";
  const record = pageObject(value, label);
  const properties = pageArray(record["properties"], `${label} field "properties"`);
  for (const [index, entry] of properties.entries()) {
    pageString(entry, `${label} property ${String(index)}`);
  }
  return {
    total: pageNumber(record["total"], `${label} field "total"`),
    dirty: pageNumber(record["dirty"], `${label} field "dirty"`),
    properties: properties as readonly string[],
  };
}
