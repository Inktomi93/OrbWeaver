// entry/compose/retrieval-degrade — the NARROWNESS pin (#2510). The degrade is the fix; a BLANKET catch here
// would be the defect wearing the fix's clothes, so the load-bearing assertions are the negative ones: a
// SearchError with any other code, and a non-SearchError, both propagate untouched.
//
// WHY THE NEGATIVE ARMS MATTER MORE THAN THE POSITIVE ONE. The turn body that wraps these ops also owns
// `strikeOutOnTurnFault` (engine.ts, #1373 chunk J) and the turn-fault path generally: swallowing an embed
// credential 401, a store failure or a malformed query here would turn a real fault into a silent empty
// recall that no surface reports. Only the owner's SPACE being unqueryable is an ordinary state.

import { SEARCH_EMPTY_QUERY, SEARCH_NO_SPACE, SEARCH_SPACE_REINDEXING, SearchError } from "@orb/server/domain/search";
import { describe } from "vitest";
import { withRetrievalDegrade } from "../../../../packages/server/src/entry/compose/retrieval-degrade.ts";
import { expect, test } from "../../../support/fixtures.ts";

const HITS: readonly string[] = ["a", "b"];

/** The reports a caller would have seen, so an arm can assert that nothing was reported. */
function recorder(): { readonly reports: number[]; readonly onIndexUnavailable: () => void } {
  const reports: number[] = [];
  return { reports, onIndexUnavailable: () => reports.push(1) };
}

describe("withRetrievalDegrade", () => {
  test("a clean run passes its result through and reports nothing", async () => {
    const seen = recorder();
    const out = await withRetrievalDegrade(() => Promise.resolve(HITS), { empty: [], onIndexUnavailable: seen.onIndexUnavailable });
    expect(out).toEqual(HITS);
    expect(seen.reports).toEqual([]);
  });

  test.each([
    ["search_space_reindexing", SEARCH_SPACE_REINDEXING],
    ["search_no_space", SEARCH_NO_SPACE],
  ])("a %s refusal resolves EMPTY and reports exactly once", async (_label, code) => {
    const seen = recorder();
    const out = await withRetrievalDegrade(() => Promise.reject(new SearchError(code, "the owner's space is not queryable")), {
      empty: [],
      onIndexUnavailable: seen.onIndexUnavailable,
    });
    expect(out).toEqual([]);
    expect(seen.reports).toHaveLength(1);
  });

  test("ANOTHER SearchError code propagates — the predicate is two codes, not the error class", async () => {
    const seen = recorder();
    const thrown = await withRetrievalDegrade(() => Promise.reject(new SearchError(SEARCH_EMPTY_QUERY, "nothing to embed")), {
      empty: [],
      onIndexUnavailable: seen.onIndexUnavailable,
    }).catch((err: unknown) => err);
    expect(thrown).toBeInstanceOf(SearchError);
    expect((thrown as SearchError).code).toBe(SEARCH_EMPTY_QUERY);
    expect(seen.reports).toEqual([]); // never reported as a degrade — it is a fault
  });

  test("a NON-SearchError propagates — an embed-credential 401 must still reach the turn-fault path", async () => {
    const seen = recorder();
    const boom = new Error("401 invalid api key");
    const thrown = await withRetrievalDegrade(() => Promise.reject(boom), { empty: [], onIndexUnavailable: seen.onIndexUnavailable }).catch(
      (err: unknown) => err,
    );
    expect(thrown).toBe(boom); // the SAME object — identity is what strikeOutOnTurnFault reasons about
    expect(seen.reports).toEqual([]);
  });

  test("an ABSENT reporter still degrades — the databank arm's empty is `null`, not an array", async () => {
    const out = await withRetrievalDegrade<{ readonly text: string } | null>(() => Promise.reject(new SearchError(SEARCH_SPACE_REINDEXING, "mid-move")), {
      empty: null,
      onIndexUnavailable: undefined,
    });
    expect(out).toBeNull();
  });
});
