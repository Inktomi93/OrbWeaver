import type { CorpusDestination } from "@orb/client/lib";
import type { selectCorpusArtifact } from "@orb/client/state";
import type { CorpusDigestSource, CorpusSource, DigestSourceHit, DiscoverSegment } from "@orb/contracts/search";
import { expectTypeOf, test } from "vitest";

test("public selection retains the canonical destination payload instead of accepting reserved kinds or incomplete scenes", () => {
  expectTypeOf<Parameters<typeof selectCorpusArtifact>[0]>().toEqualTypeOf<CorpusDestination>();
  expectTypeOf<"scheme">().not.toExtend<CorpusDestination["kind"]>();
  expectTypeOf<{ readonly kind: "scene"; readonly characterId: string }>().not.toExtend<CorpusDestination>();
  expectTypeOf<Extract<CorpusDestination, { kind: "scene" }>["hit"]>().toEqualTypeOf<DiscoverSegment>();
});

test("public scene and digest producers retain their exact source row identities", () => {
  expectTypeOf<DiscoverSegment["source"]>().toEqualTypeOf<Extract<CorpusSource, { kind: "segment" }>>();
  expectTypeOf<DigestSourceHit["source"]>().toEqualTypeOf<Extract<CorpusSource, { kind: "digest" }>>();
  expectTypeOf<CorpusDigestSource["source"]>().toEqualTypeOf<DigestSourceHit["source"]>();
});
