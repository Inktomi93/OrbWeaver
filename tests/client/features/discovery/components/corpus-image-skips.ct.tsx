// @subject packages/client/src/features/discovery/components/corpus-visuals-tab.tsx
// An image the indexer refused appears on the Corpus Visuals tab with its reason and the size it measured. The skip is the
// real indexer's own record: a stored avatar under the admission floor, read through the production `discovery.imageSkips`.

import { contextToggleLabel } from "@orb/client/lib";
import { ID_PREFIX } from "@orb/kit/ids";
import type { ShellAmbientStory } from "@orb/testkit/browser";
import { seedShellState } from "@orb/testkit/browser/spec";
import { routeTrpc, SECTION_PROCEDURES, SHELL_MOUNT_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusHarness,
  createCorpusProviderExecution,
  makeAssetBytes,
  seedCorpusConnections,
} from "@orb/testkit/node/composed";
import { CORPUS_CONTEXT_TAB_LABELS } from "#client/features/discovery/lib/corpus-control-names.ts";

const SHELL_STORY = "tests/support/browser/ct-shell-reads-stories/ShellAmbientStory";
const SERVED = [...SECTION_PROCEDURES, ...SHELL_MOUNT_PROCEDURES, "discovery.imageFacets", "discovery.portraitAlignment", "discovery.imageSkips"] as const;
const SKIPS = '[data-testid="corpus-image-skips"]';

test.use({ hasTouch: false, isMobile: false, viewport: { width: 1440, height: 900 } });

test("a stored image below the indexer's floor is listed on the Visuals tab with its reason and measured size", async ({ mount, page }) => {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  await using root = await createCorpusHarness(undefined, { providerFetch: physical.execute });
  const owner = await root.principalFor(root.ownerId);
  const stored = await root.app.assets.store({
    principal: owner,
    bytes: makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset)),
    mime: "image/png",
    kind: "avatar",
  });
  await root.settleBackground();
  await seedCorpusConnections(root, owner);
  expect(await root.app.embeddings.indexAsset(stored.assetId, { signal: new AbortController().signal })).toBeNull();
  const caller = await root.internalCallerFor(root.ownerId);
  // The corpus's own tiny avatars were refused the same way, so the stored image is one skip among the owner's.
  const skips = await caller.discovery.imageSkips();
  const skip = skips.find((each) => each.assetId === stored.assetId);
  if (skip === undefined) {
    throw new Error("The indexer must have recorded the sub-floor avatar as skipped");
  }

  await routeTrpc(page, serveCorpusProcedures(caller, SERVED));
  await seedShellState(page, { activeSection: "corpus" });
  await mount<typeof ShellAmbientStory>(SHELL_STORY, {});
  await page.getByRole("button", { name: contextToggleLabel(true), exact: true }).click();
  const context = page.locator('.shell-panel[data-panel-side="context"]');
  await context.getByRole("tab", { name: CORPUS_CONTEXT_TAB_LABELS.visuals, exact: true }).click();

  const rows = context.locator(`${SKIPS} [data-asset-id]`);
  await expect(rows).toHaveCount(skips.length);
  const row = rows.and(page.locator(`[data-asset-id="${stored.assetId}"]`));
  await expect(row).toHaveAttribute("data-reason", skip.reason);
  // The measured size is data, not copy: the row prints exactly the width and height the indexer recorded.
  await expect(row).toContainText(`${skip.width} × ${skip.height}`);
});
