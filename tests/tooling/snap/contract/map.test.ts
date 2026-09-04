import {
  MAP_ACTIONABILITIES,
  MAP_INACTIVE_REASONS,
  MAP_VISIBILITIES,
  mapActionabilitySchema,
  mapInactiveReasonSchema,
  mapVisibilitySchema,
} from "../../../../tooling/src/snap/contract/map.ts";
import { rawMapEntries } from "../../../../tooling/src/snap/ops/page-validate.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const INVENTED = "invented-member";
const MAP_ROW = {
  role: "button",
  name: "Save",
  selector: "#save",
  fallback: "#save",
  semanticFallback: "#save",
  state: { disabled: false, current: null, checked: null, expanded: null },
  visibility: "visible",
  inactiveReason: null,
  actionability: "actionable",
} as const;

test("every canonical map visibility, actionability and inactive reason crosses the page parser", () => {
  for (const visibility of MAP_VISIBILITIES) {
    expect(mapVisibilitySchema.parse(visibility)).toBe(visibility);
    expect(rawMapEntries([{ ...MAP_ROW, visibility }])?.[0]?.visibility).toBe(visibility);
  }
  for (const actionability of MAP_ACTIONABILITIES) {
    expect(mapActionabilitySchema.parse(actionability)).toBe(actionability);
    expect(rawMapEntries([{ ...MAP_ROW, actionability }])?.[0]?.actionability).toBe(actionability);
  }
  for (const inactiveReason of [...MAP_INACTIVE_REASONS, null]) {
    expect(mapInactiveReasonSchema.parse(inactiveReason)).toBe(inactiveReason);
    expect(rawMapEntries([{ ...MAP_ROW, inactiveReason }])?.[0]?.inactiveReason).toBe(inactiveReason);
  }
});

test("an invented map vocabulary member refuses in both the canonical schema and page parser", () => {
  expect(mapVisibilitySchema.safeParse(INVENTED).success).toBe(false);
  expect(mapActionabilitySchema.safeParse(INVENTED).success).toBe(false);
  expect(mapInactiveReasonSchema.safeParse(INVENTED).success).toBe(false);
  expect(() => rawMapEntries([{ ...MAP_ROW, visibility: INVENTED }])).toThrow(`expected ${MAP_VISIBILITIES.join("|")}`);
  expect(() => rawMapEntries([{ ...MAP_ROW, actionability: INVENTED }])).toThrow(`expected ${MAP_ACTIONABILITIES.join("|")}`);
  expect(() => rawMapEntries([{ ...MAP_ROW, inactiveReason: INVENTED }])).toThrow(`expected ${MAP_INACTIVE_REASONS.join("|")}`);
});
