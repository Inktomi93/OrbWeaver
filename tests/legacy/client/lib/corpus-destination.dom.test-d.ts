import type { CORPUS_DESTINATION_KINDS, CorpusDestination } from "@orb/client/lib";
import { selectCorpusArtifact } from "@orb/client/state";
import type { CorpusDigestSource, CorpusSource, DigestSourceHit, DiscoverSegment } from "@orb/contracts/search";
import { expectTypeOf, test } from "vitest";

test("destination payloads cover the canonical kind tuple and keep scheme absent", () => {
  expectTypeOf<CorpusDestination["kind"]>().toEqualTypeOf<(typeof CORPUS_DESTINATION_KINDS)[number]>();
  // @ts-expect-error A reserved name without a producer cannot become a selected destination.
  selectCorpusArtifact({ kind: "scheme" });

  // @ts-expect-error A moment retains a complete occurrence, including its source identity.
  selectCorpusArtifact({ kind: "scene", characterId: "character" });
});

test("moment producers retain their exact source row kind", () => {
  expectTypeOf<DiscoverSegment["source"]>().toEqualTypeOf<Extract<CorpusSource, { kind: "segment" }>>();
  expectTypeOf<DigestSourceHit["source"]>().toEqualTypeOf<Extract<CorpusSource, { kind: "digest" }>>();
  expectTypeOf<CorpusDigestSource["source"]>().toEqualTypeOf<DigestSourceHit["source"]>();
});
