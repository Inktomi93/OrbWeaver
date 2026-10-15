import { refineryScorePayloadSchema } from "@orb/contracts/refinery";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/ct-corpus.ts";
import { routeTrpc, trpcError, trpcHold } from "@orb/testkit/node/route-trpc.ts";
import { SchemaPreviewStory } from "./_payload-stories.tsx";

test.use({ trace: "on" });

test("schema preview retains settled expansion through rerenders and failures, then resets on successful replacement", async ({
  corpus,
  mount,
  page,
}, testInfo) => {
  const library = corpus.reads["character.list"][0]?.output;
  const settings = corpus.reads["settings.getUserSettings"][0]?.output;
  const viewer = corpus.reads["sessions.me"][0]?.output;
  const character = library?.items.find((item) => item.avatarHash === null);
  if (library === undefined || settings === undefined || viewer === undefined || character === undefined) {
    throw new Error("The committed corpus omitted the schema preview's owner and character library");
  }
  const first = refineryScorePayloadSchema.parse({
    fieldScores: [{ field: "description", score: 7, strengths: "Recognizable voice", weaknesses: "Missing context", suggestions: "Add a scene anchor" }],
    overallScore: 7,
    priorityImprovements: [],
    summary: "A readable card",
  });
  const second = refineryScorePayloadSchema.parse({
    ...first,
    fieldScores: [{ ...first.fieldScores[0], field: "description", score: 8, strengths: "A distinct successful assessment" }],
  });
  const failed = trpcHold<"refinery.testSchema">();
  const replaced = trpcHold<"refinery.testSchema">();
  let attempt = 0;
  const trpc = await routeTrpc(page, {
    "settings.getUserSettings": () => settings,
    "sessions.me": () => viewer,
    "character.list": () => library,
    "refinery.schemaPlan": () => null,
    "refinery.testSchema": () => {
      attempt += 1;
      if (attempt === 1) {
        return first;
      }
      return attempt === 2 ? failed : replaced;
    },
  });
  await mount(<SchemaPreviewStory />);
  await page
    .getByRole("textbox", { name: "Schema (JSON — the full vocabulary)", exact: true })
    .fill(JSON.stringify(projectJsonSchema(refineryScorePayloadSchema)));
  await page.getByRole("button", { name: "Pick a card to test on", exact: true }).click();
  await page.getByRole("option", { name: character.name, exact: true }).click();
  await page.getByRole("button", { name: "Test on this card", exact: true }).click();
  const assay = page.getByRole("button", { name: "description — 7", exact: true });
  await assay.click();
  await expect(assay).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Recognizable voice", { exact: true })).toBeVisible();

  await page.getByRole("textbox", { name: "Describe the structure", exact: true }).fill("Explain the score without changing the schema.");
  await expect(assay).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("button", { name: "Test on this card", exact: true }).click();
  await failed.requested;
  await expect(page.getByRole("button", { name: "Running…", exact: true })).toBeDisabled();
  await expect(assay).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Recognizable voice", { exact: true })).toBeVisible();
  await assay.scrollIntoViewIfNeeded();
  const pendingScreenshot = testInfo.outputPath("preview-pending.png");
  await page.screenshot({ path: pendingScreenshot });
  await testInfo.attach("settled-preview-during-pending", { path: pendingScreenshot });

  failed.release(trpcError());
  await expect(page.getByRole("button", { name: "Test on this card", exact: true })).toBeEnabled();
  await expect(assay).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByText("Recognizable voice", { exact: true })).toBeVisible();
  const failedScreenshot = testInfo.outputPath("preview-after-error.png");
  await page.screenshot({ path: failedScreenshot });
  await testInfo.attach("settled-preview-after-error", { path: failedScreenshot });
  await page.getByRole("button", { name: "Test on this card", exact: true }).click();
  await replaced.requested;
  await expect(assay).toHaveAttribute("aria-expanded", "true");
  replaced.release(second);
  const nextAssay = page.getByRole("button", { name: "description — 8", exact: true });
  await expect(nextAssay).toHaveAttribute("aria-expanded", "false");
  await expect(page.getByText("Recognizable voice", { exact: true })).toHaveCount(0);
  await nextAssay.scrollIntoViewIfNeeded();
  const replacementScreenshot = testInfo.outputPath("preview-replacement-collapsed.png");
  await page.screenshot({ path: replacementScreenshot });
  await testInfo.attach("replacement-preview-collapsed", { path: replacementScreenshot });
  await nextAssay.click();
  await expect(page.getByText("A distinct successful assessment", { exact: true })).toBeVisible();
  const reopenedScreenshot = testInfo.outputPath("preview-replacement-reopened.png");
  await page.screenshot({ path: reopenedScreenshot });
  await testInfo.attach("replacement-preview-reopened", { path: reopenedScreenshot });
  expect(trpc.unstubbed()).toEqual([]);
});
