// THE SPACE-TAG AGREEMENT PIN (inference program §10-2). The `(model[@dtype])` tag a vector row is keyed on
// is derived TWICE from two different facts, and the box is silently broken whenever they disagree:
//
//   • the WRITE side's tag is the backend's own — `local-light` folds the DEPLOYMENT's served precision
//     (`deps.localLight.embedDtype`, env `LOCAL_LIGHT_EMBED_DTYPE`) into `EmbedResult.model`, and
//     `embeddings.store` stamps the provider's answer by the issue-724 ruling (`0fed0b3ee`);
//   • the READ side's tag is derived from the CURATED capability row's `dtype` (`embedDtypeOf` →
//     `embedSpaceOf`), which is what `nearest.ts` filters on and a generation's identity is minted from.
//
// §10-2's whole ask is "read the same curated fact". They cannot literally be one value — one is a
// deployment knob and one is a shipped capability row — so this is the enforcement: a test-time pin that
// the SHIPPED defaults agree. It is deliberately at this rung rather than a write-time refusal in
// `embeddings.store`: refusing there would reverse the issue-724 ruling on the exact mid-flight-rebind race
// it was minted for (`tests/server/domain/embeddings/verbs/store.int.test.ts` pins that write SUCCEEDING
// with a declared tag that differs from the produced one).
//
// A deployment that overrides `LOCAL_LIGHT_EMBED_DTYPE` away from the curated value still splits its own
// corpus. That residual is named in the `embedSpaceOf` header and is a connection-`declared` override away
// from being expressible; this pin closes the SHIPPED path, which is the one every box runs.

import { describe } from "vitest";
import { localLightEmbedSpaceTag, resolveEmbedDtype } from "../../../../packages/inference/src/backends/local-light/model-cache.ts";
import { DEFAULT_EMBED_MODEL } from "../../../../packages/inference/src/backends/local-light/tasks.ts";
import { localLightRows } from "../../../../packages/inference/src/capability/sources/curated/local-light.ts";
import { expect, test } from "../../../support/fixtures.ts";

/** The curated embedding row for the default encoder — the fact the READ side derives its tag from. */
function curatedEncoderDtype(): string | undefined {
  const row = localLightRows.find((candidate) => candidate.kind === "embedding" && candidate.match.ids.includes(DEFAULT_EMBED_MODEL));
  expect(row, `no curated embedding row matches the default local-light encoder ${DEFAULT_EMBED_MODEL}`).toBeDefined();
  return row?.kind === "embedding" ? row.embedding.dtype : undefined;
}

describe("local-light embed space — the backend's served dtype and the curated row's dtype are one fact", () => {
  test("the shipped default precision the backend serves is the precision the curated row states", () => {
    // `undefined` = no deployment override, i.e. what every box runs unless it opts out.
    expect(resolveEmbedDtype(undefined)).toBe(curatedEncoderDtype());
  });

  test("so the tag the backend stamps is byte-identical to the tag the read side derives", () => {
    const written = localLightEmbedSpaceTag(DEFAULT_EMBED_MODEL, resolveEmbedDtype(undefined));
    // The read side's derivation, spelled through the SAME contracts function the substrates call — if the
    // two ever stop agreeing, the corpus is written into one space and searched in another, with no error
    // on any path.
    const read = localLightEmbedSpaceTag(DEFAULT_EMBED_MODEL, resolveEmbedDtype(curatedEncoderDtype()));
    expect(written).toBe(read);
    expect(written).toContain("@"); // the tag CARRIES its dtype — dropping the fold is the regression
  });
});
