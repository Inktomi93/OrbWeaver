// @subject packages/client/src/features/preset/components/params-deck.tsx
// The Params deck's model-fed clusters read the chat capability through the shared boundary: a held read shows the gate's skeleton,
// a routing refusal the gate's failure band with a Retry, and Retry shows the sampling knobs. The Quality cluster never waits on it.

import { presetDetailSchema } from "@orb/contracts/preset";
import { holdServed, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { PRESET_EDITOR_VIEW_LABELS, PRESET_QUALITY_LABEL } from "#client/features/preset/lib/preset-names.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { PresetListLifetimeStory } from "./_list-lifetime-stories.tsx";

const STORY = "tests/client/features/preset/components/_list-lifetime-stories/PresetListLifetimeStory";
const READS = [
  "settings.getUserSettings",
  "sessions.me",
  "preset.get",
  "preset.update",
  "preset.list",
  "preset.resolveEffective",
  "connection.providersAvailable",
  "connection.list",
] as const;
const REFUSAL = "incoherent routing for the chat role";

test.use({ viewport: { width: 1280, height: 900 } });

test("a held capability read shows the gate's skeleton, a routing refusal its band with Retry, and Retry shows the sampling knobs", async ({
  corpus,
  mount,
  page,
}) => {
  const library = corpus.libraryRelations;
  if (library === undefined) {
    throw new Error("The committed corpus omitted the preset library");
  }
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const presetId = presetDetailSchema.shape.id.parse(library.reads.presetDetail.output.id);
  const hold = holdServed();
  let phase: "hold" | "refuse" | "serve" = "hold";
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, READS),
    ...serveCorpusProcedures(caller, ["connection.resolveChatCapability"], () => {
      if (phase === "hold") {
        phase = "refuse";
        return hold;
      }
      return phase === "refuse" ? trpcError({ code: "BAD_REQUEST", message: REFUSAL }) : undefined;
    }),
  });
  await mount<typeof PresetListLifetimeStory>(STORY, { presetId });
  await page.getByRole("tab", { name: PRESET_EDITOR_VIEW_LABELS.params, exact: true }).click();
  await hold.requested;
  await expect(page.locator('[aria-busy="true"]').first()).toBeVisible();
  await expect(page.getByText(PRESET_QUALITY_LABEL, { exact: true }).first()).toBeVisible();
  hold.fail();
  await expect(page.getByText(REFUSAL, { exact: true })).toBeVisible();
  phase = "serve";
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(page.getByText(REFUSAL, { exact: true })).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Temperature value", exact: true })).toBeVisible();
});
