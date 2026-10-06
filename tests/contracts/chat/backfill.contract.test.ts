import {
  backfillPassResultSchema,
  importWindowSchema,
  memoryBackfillResultSchema,
  memoryBackfillWorkloadParams,
  mergeImportWindows,
  storedImportWindowSchema,
} from "../../../packages/contracts/src/chat/backfill.ts";
import { expect, test } from "../../support/fixtures.ts";

test("input import windows refuse reversed, fractional and negative boundaries; stored windows retain shape", () => {
  expect(importWindowSchema.parse({ from: 0, to: 0 })).toEqual({ from: 0, to: 0 });
  for (const value of [
    { from: 2, to: 1 },
    { from: -1, to: 1 },
    { from: 0.5, to: 1 },
  ]) {
    expect(importWindowSchema.safeParse(value).success).toBe(false);
  }
  expect(storedImportWindowSchema.parse({ from: 2, to: 1 })).toEqual({ from: 2, to: 1 });
  expect(mergeImportWindows({ from: 5, to: 8 }, { from: 2, to: 6 })).toEqual({ from: 2, to: 8 });
});

test("backfill scope and independent failure counts survive serialization", () => {
  const params = { importWindow: { from: 1, to: 2 }, segmentsOnly: true, embedderChanged: false };
  expect(memoryBackfillWorkloadParams.parse(JSON.parse(JSON.stringify(params)))).toEqual(params);
  const result = { segments: { scanned: 4, changed: 3 }, digests: { scanned: 2, changed: 0 }, segmentsSkippedOverWindow: 1, failed: 2 };
  expect(memoryBackfillResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
  expect(backfillPassResultSchema.safeParse({ scanned: 0, changed: "0" }).success).toBe(false);
});
