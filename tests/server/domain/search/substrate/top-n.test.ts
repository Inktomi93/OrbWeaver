// Unit: the ranked verbs' `topN` guard (#1467 item 6). A non-positive topN becomes a NEGATIVE `LIMIT`, which
// SQLite reads as NO limit — the refusal is what keeps a nonsense ask from turning into a full corpus scan.

import { describe } from "vitest";
import { SEARCH_INVALID_TOP_N, SearchError } from "../../../../../packages/server/src/domain/search/contract/errors.ts";
import { requirePositiveTopN } from "../../../../../packages/server/src/domain/search/substrate/top-n.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("requirePositiveTopN", () => {
  test("accepts a positive whole number", () => {
    expect(() => requirePositiveTopN(1, "knn")).not.toThrow();
    expect(() => requirePositiveTopN(200, "knn")).not.toThrow();
  });

  test.each([0, -1, -200, 1.5, Number.NaN, Number.POSITIVE_INFINITY])("refuses %s with the coded error", (topN) => {
    expect(() => requirePositiveTopN(topN, "discover")).toThrow(SearchError);
    // The message names the verb that was asked — a coded error with no subject is unactionable in a log.
    expect(() => requirePositiveTopN(topN, "discover")).toThrow(
      expect.objectContaining({ code: SEARCH_INVALID_TOP_N, message: expect.stringContaining("discover") }),
    );
  });
});
