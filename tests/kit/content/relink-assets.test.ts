// Re-pointing a body's inline asset images: only an image ref the relink names moves, and every other byte of
// the body, including `asset:` text the image grammar does not read as a ref, stays as it was.
// @subject packages/kit/src/content/index.ts

import { ASSET_SCHEME, assetIdsInContent, relinkContentAssets } from "@orb/kit/content";
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";

test("an image ref the relink names moves to its new id and nothing else in the body changes", ({ ids }) => {
  const [carried, held, untouched] = [mintTypeId(ID_PREFIX.asset, ids.next), mintTypeId(ID_PREFIX.asset, ids.next), mintTypeId(ID_PREFIX.asset, ids.next)];
  const body = (id: string): string =>
    [
      `Dusk over the ledger: ![plate](${ASSET_SCHEME}${id}) and ![other](${ASSET_SCHEME}${untouched})`,
      `A titled image is prose: ![t](${ASSET_SCHEME}${carried} "title"), and so is ${ASSET_SCHEME}${carried} on its own.`,
    ].join("\n");
  const relink = new Map([[carried, held]]);
  const relinked = relinkContentAssets(body(carried), relink);

  expect({ relinked, refs: assetIdsInContent(relinked), unnamed: relinkContentAssets(body(untouched), relink) }).toEqual({
    relinked: body(held),
    refs: [held, untouched],
    unnamed: body(untouched),
  });
});
