// domain/chat/memory/recall/rerank-warning — pins the header's contract: the chat bus must tell the user
// ONCE per turn/outage episode — never once per recall call. A fresh episode starts un-warned; multiple
// reportRerankUnavailable calls inside one episode still only warn once; and a NEW episode (a new gathered
// turn) resets the warned flag.

import { describe } from "vitest";
import { createMemoryRecallWarningEpisode } from "../../../../../../packages/server/src/domain/chat/memory/recall/rerank-warning.ts";
import { expect, test } from "../../../../../support/fixtures.ts";

describe("createMemoryRecallWarningEpisode", () => {
  test("no report ⇒ takeRerankUnavailable is always false", () => {
    const episode = createMemoryRecallWarningEpisode();
    expect(episode.takeRerankUnavailable()).toBe(false);
    expect(episode.takeRerankUnavailable()).toBe(false);
  });

  test("one report ⇒ the FIRST take is true, every subsequent take in the same episode is false", () => {
    const episode = createMemoryRecallWarningEpisode();
    episode.reportRerankUnavailable();
    expect(episode.takeRerankUnavailable()).toBe(true);
    expect(episode.takeRerankUnavailable()).toBe(false);
    expect(episode.takeRerankUnavailable()).toBe(false);
  });

  test("multiple reports (per-round-level and per-speaker) within ONE episode still warn only once", () => {
    const episode = createMemoryRecallWarningEpisode();
    episode.reportRerankUnavailable();
    episode.reportRerankUnavailable();
    episode.reportRerankUnavailable();
    expect(episode.takeRerankUnavailable()).toBe(true);
    expect(episode.takeRerankUnavailable()).toBe(false);
  });

  test("a NEW gathered turn constructs a NEW episode — the warned flag does not leak across episodes", () => {
    const first = createMemoryRecallWarningEpisode();
    first.reportRerankUnavailable();
    expect(first.takeRerankUnavailable()).toBe(true);

    const second = createMemoryRecallWarningEpisode();
    expect(second.takeRerankUnavailable()).toBe(false); // not warned — nothing reported on THIS episode
    second.reportRerankUnavailable();
    expect(second.takeRerankUnavailable()).toBe(true); // its own report warns independently
  });
});
