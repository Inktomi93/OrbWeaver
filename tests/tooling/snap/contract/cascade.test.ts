import { CSS_MERGE_TRACE_STATUSES, cssMergeTraceStatusSchema } from "../../../../tooling/src/snap/contract/cascade.ts";
import { cssMergeTraceSnapshot } from "../../../../tooling/src/snap/ops/arms/cascade.ts";
import { expect, test } from "../../../support/tool-fixtures.ts";

const INVENTED = "invented-member";

test("every UI-owned CSS merge status parses and an invented status refuses", () => {
  const base = { enabled: true, calls: 0, conflictCalls: 0, deduplicatedConflictCalls: 0, receipts: [] };
  for (const status of CSS_MERGE_TRACE_STATUSES) {
    expect(cssMergeTraceStatusSchema.parse(status)).toBe(status);
    const receipt = status === "instrument-error" ? { ...base, status, error: "planted" } : { ...base, status };
    expect(cssMergeTraceSnapshot(receipt).status).toBe(status);
  }
  expect(cssMergeTraceStatusSchema.safeParse(INVENTED).success).toBe(false);
  expect(() => cssMergeTraceSnapshot({ ...base, status: INVENTED })).toThrow("malformed trace receipt");
});
