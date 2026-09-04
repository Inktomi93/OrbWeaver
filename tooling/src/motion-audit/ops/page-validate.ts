// motion-audit's PAGE→NODE seam validators (#1004) — the `__orb` bridge reads, settled instead of cast.
//
// THE SILENT ARM IS THIS TOOL'S WHOLE PROBLEM. Every read here feeds a BUDGET comparison, and a budget
// answers "pass" to missing evidence by arithmetic: an absent `cls` compares `undefined > budget` →
// false → clean; a NaN does the same; an `animations()` that came back as an object instead of a list
// yields zero records → "no compositor-dirty animations" → clean. `ops/drive.ts`'s own header already
// says the bridge-presence check exists because "without it every `__orb` read below answers null/[] and
// each budget arm reads that as a clean zero (#409)" — these validators are that same defence one level
// down, for the case where the bridge IS present and answers the wrong shape.
//
// Container-level plus the fields the node side reads; the optional members of the contract stay
// optional on purpose (`--isolated --ref <old sha>` legitimately measures a bundle that predates them,
// which the contract's own comments state).
import { pageArray, pageBoolean, pageNumber, pageNumberFields, pageObject, pageString } from "@orb/tooling/_shared/page-validate";
import { refuseDirectInvocation } from "../../_shared/entrypoint.ts";
import type { AnimationRecord, MotionFlagRecord, MotionSnapshot } from "../contract/types.ts";

refuseDirectInvocation(import.meta.url, "pnpm snap <route> --motion");

/** Is the app's in-page instrument present at all? A non-boolean here would be read as truthy and let
 *  every downstream read proceed against a bridge that is not there. */
export function bridgePresence(value: unknown): boolean {
  return pageBoolean(value, "the __orb bridge presence probe");
}

/** `null` is a REAL answer (no bridge / an older bundle) and is passed through; anything else must carry
 *  the four required budget inputs as finite numbers. */
export function motionSnapshot(value: unknown): MotionSnapshot | null {
  if (value === null || value === undefined) {
    return null;
  }
  const label = "the __orb.motion() read";
  const record = pageObject(value, label);
  pageArray(record["loafs"], `${label} field "loafs"`);
  pageNumberFields(record, ["cls", "worstBlocking", "worstShift"], label);
  // The optional split members — #109's three-way and #1071's observed twin. Optional because a `--ref`
  // bundle legitimately predates either; validated the moment a value IS present, because a NaN or a
  // string here reaches a `>` comparison and answers it `false`, i.e. clean.
  for (const field of ["virtualizedCls", "nonVirtualizedCls", "observedCls", "observedVirtualizedCls", "observedNonVirtualizedCls"]) {
    if (record[field] !== undefined) {
      pageNumber(record[field], `${label} field "${field}"`);
    }
  }
  if (record["shifts"] !== undefined) {
    pageArray(record["shifts"], `${label} field "shifts"`);
  }
  return record as unknown as MotionSnapshot;
}

/** The animation census. An empty list is a legitimate answer; a non-list is not, and the difference is
 *  invisible once it has been folded into "zero compositor-dirty animations". */
export function animationRecords(value: unknown): readonly AnimationRecord[] {
  const label = "the __orb.animations() read";
  const rows = pageArray(value, label);
  for (const [index, row] of rows.entries()) {
    const record = pageObject(row, `${label} row ${String(index)}`);
    pageString(record["target"], `${label} row ${String(index)} field "target"`);
    pageArray(record["properties"], `${label} row ${String(index)} field "properties"`);
    pageBoolean(record["compositorClean"], `${label} row ${String(index)} field "compositorClean"`);
  }
  return rows as readonly AnimationRecord[];
}

/** The motion-flag ring. An empty list is a legitimate answer (a clean window raises nothing); a non-list
 *  is not, and once folded into "zero transient dirty animations" the difference is invisible — the same
 *  argument as `animationRecords` above, one channel over. The optional `animation` payload is validated
 *  the moment it is present: a wrong-shaped record would flow into the sanctioning policy, and a policy
 *  that cannot read `properties` sanctions nothing while looking like it judged. */
export function flagRecords(value: unknown): readonly MotionFlagRecord[] | null {
  if (value === null || value === undefined) {
    return null;
  }
  const label = "the __orb.flags() read";
  const rows = pageArray(value, label);
  for (const [index, row] of rows.entries()) {
    const record = pageObject(row, `${label} row ${String(index)}`);
    pageString(record["tag"], `${label} row ${String(index)} field "tag"`);
    pageString(record["offender"], `${label} row ${String(index)} field "offender"`);
    pageBoolean(record["overBudget"], `${label} row ${String(index)} field "overBudget"`);
    pageNumber(record["at"], `${label} row ${String(index)} field "at"`);
    if (record["animation"] !== undefined) {
      const animation = pageObject(record["animation"], `${label} row ${String(index)} field "animation"`);
      pageString(animation["target"], `${label} row ${String(index)} animation field "target"`);
      pageArray(animation["properties"], `${label} row ${String(index)} animation field "properties"`);
      pageBoolean(animation["compositorClean"], `${label} row ${String(index)} animation field "compositorClean"`);
    }
  }
  return rows as readonly MotionFlagRecord[];
}
