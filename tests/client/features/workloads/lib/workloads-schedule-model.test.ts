// Unit: the Workloads pane's SCHEDULES vocabulary (features/workloads/lib/workloads-schedule-model). Pure, no
// DOM — the node lane. Guards the bulk-schedulability partition (a create-kind that needs a mint target is NOT
// bulk-schedulable — a schedule carries no target), the mode resolution (maintenance bulk-by-force, owner
// toggle, non-owner floored to singular), and the params↔form round-trip that seeds the edit dialog.

import {
  resolveScheduleMode,
  scheduleFormValuesFromRow,
  scheduleParamsToRunValues,
  workloadKindBulkSchedulable,
} from "../../../../../packages/client/src/features/workloads/lib/workloads-schedule-model.ts";
import { expect, test } from "../../../../support/fixtures.ts";

test("workloadKindBulkSchedulable: sweep kinds yes; create-kinds (needs target) and maintenance kinds no", () => {
  // A singular+bulk SWEEP kind is bulk-schedulable (a recurring all-owners sweep, no target needed).
  expect(workloadKindBulkSchedulable("index")).toBe(true);
  expect(workloadKindBulkSchedulable("distill-characters")).toBe(true);
  // import-st is bulk-CAPABLE but needs a mint target the schedule verbs can't carry → NOT bulk-schedulable.
  expect(workloadKindBulkSchedulable("import-st")).toBe(false);
  // Maintenance kinds are bulk-only (not in the runnable set) → handled as bulk-by-force, not a toggle.
  expect(workloadKindBulkSchedulable("refresh-model-catalog")).toBe(false);
  // A stub is never bulk-schedulable.
  expect(workloadKindBulkSchedulable("crew-director")).toBe(false);
});

test("resolveScheduleMode: maintenance forces bulk; owner toggle rides sweep kinds; non-owner stays singular", () => {
  // A maintenance (bulk-only built) kind is bulk BY FORCE regardless of the toggle or the viewer.
  expect(resolveScheduleMode("refresh-model-catalog", false, true)).toBe("bulk");
  expect(resolveScheduleMode("refresh-model-catalog", false, false)).toBe("bulk");
  // A sweep kind: owner + toggle on → bulk; toggle off → singular.
  expect(resolveScheduleMode("index", true, true)).toBe("bulk");
  expect(resolveScheduleMode("index", false, true)).toBe("singular");
  // A non-owner never reaches bulk even with the toggle set (the field never renders for them).
  expect(resolveScheduleMode("index", true, false)).toBe("singular");
  // A create-kind's toggle can't reach bulk (no target in a schedule) — stays singular.
  expect(resolveScheduleMode("import-st", true, true)).toBe("singular");
});

test("scheduleParamsToRunValues: extracts the run slots from a stored params blob, defaulting the absent", () => {
  expect(scheduleParamsToRunValues({ source: "image", force: true })).toEqual({
    force: true,
    dryRun: false,
    k: null,
    source: "image",
  });
  expect(scheduleParamsToRunValues({ k: 8 })).toEqual({
    force: false,
    dryRun: false,
    k: 8,
    source: "all",
  });
  // A foreign/absent source falls back to `all`; a non-number k falls back to null.
  expect(scheduleParamsToRunValues({ source: "bogus", k: "nope" })).toEqual({
    force: false,
    dryRun: false,
    k: null,
    source: "all",
  });
});

test("scheduleFormValuesFromRow: seeds the edit form (kind/cadence/bulk + param slots) from a row", () => {
  expect(
    scheduleFormValuesFromRow({
      kind: "index",
      cadence: "weekly",
      mode: "bulk",
      params: { source: "text", force: true },
    }),
  ).toEqual({
    kind: "index",
    cadence: "weekly",
    bulk: true,
    force: true,
    dryRun: false,
    k: null,
    source: "text",
  });
  // A singular row seeds bulk:false; a bare params blob seeds the defaults.
  expect(
    scheduleFormValuesFromRow({
      kind: "distill-characters",
      cadence: "daily",
      mode: "singular",
      params: {},
    }),
  ).toEqual({
    kind: "distill-characters",
    cadence: "daily",
    bulk: false,
    force: false,
    dryRun: false,
    k: null,
    source: "all",
  });
});
