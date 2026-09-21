// domain/chat/substrate/turn-retrieval-warning — pins the header's contract: the chat bus must tell the user
// ONCE per turn per outage class — never once per call. A fresh episode starts un-warned; multiple reports
// inside one episode still only warn once; a NEW episode (a new gathered turn) resets the warned flag; and the
// two classes latch INDEPENDENTLY, because a turn can lose its rerank order and its vector space at once.
// (Moved here from `memory/recall/rerank-warning` with the #2510 rename — the episode is a property of the
// turn's assembly, not of the memory subsystem.)

import { describe } from "vitest";
import { createTurnRetrievalWarningEpisode } from "../../../../../packages/server/src/domain/chat/substrate/turn-retrieval-warning.ts";
import { expect, test } from "../../../../support/fixtures.ts";

describe("createTurnRetrievalWarningEpisode", () => {
  test("no report ⇒ every take is false, on both classes", () => {
    const episode = createTurnRetrievalWarningEpisode();
    expect(episode.takeRerankUnavailable()).toBe(false);
    expect(episode.takeRerankUnavailable()).toBe(false);
    expect(episode.takeIndexUnavailable()).toBe(false);
    expect(episode.takeIndexUnavailable()).toBe(false);
  });

  test("one report ⇒ the FIRST take is true, every subsequent take in the same episode is false", () => {
    const episode = createTurnRetrievalWarningEpisode();
    episode.reportRerankUnavailable();
    expect(episode.takeRerankUnavailable()).toBe(true);
    expect(episode.takeRerankUnavailable()).toBe(false);
    expect(episode.takeRerankUnavailable()).toBe(false);
  });

  test("multiple reports (round-level, per-speaker, databank) within ONE episode still warn only once", () => {
    const episode = createTurnRetrievalWarningEpisode();
    episode.reportIndexUnavailable();
    episode.reportIndexUnavailable();
    episode.reportIndexUnavailable();
    expect(episode.takeIndexUnavailable()).toBe(true);
    expect(episode.takeIndexUnavailable()).toBe(false);
  });

  test("the two classes latch INDEPENDENTLY — taking one never consumes or arms the other", () => {
    const episode = createTurnRetrievalWarningEpisode();
    episode.reportRerankUnavailable();
    expect(episode.takeIndexUnavailable()).toBe(false); // nothing reported on THIS class
    expect(episode.takeRerankUnavailable()).toBe(true);

    episode.reportIndexUnavailable();
    expect(episode.takeIndexUnavailable()).toBe(true);
    expect(episode.takeRerankUnavailable()).toBe(false); // already taken; a sibling report does not re-arm it
  });

  test("a NEW gathered turn constructs a NEW episode — the warned flag does not leak across episodes", () => {
    const first = createTurnRetrievalWarningEpisode();
    first.reportRerankUnavailable();
    expect(first.takeRerankUnavailable()).toBe(true);

    const second = createTurnRetrievalWarningEpisode();
    expect(second.takeRerankUnavailable()).toBe(false); // not warned — nothing reported on THIS episode
    second.reportRerankUnavailable();
    expect(second.takeRerankUnavailable()).toBe(true); // its own report warns independently
  });
});
