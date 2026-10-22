import { blobIconUrl, blobUrl } from "@orb/contracts/assets";
import { refineryScorePayloadSchema } from "@orb/contracts/refinery";
import { projectJsonSchema } from "@orb/kit/json-schema";
import { expect, test } from "@orb/testkit/node/ct-corpus.ts";
import { routeTrpc, trpcError, trpcHold } from "@orb/testkit/node/route-trpc.ts";
import type { ConsoleMessage } from "@playwright/test";
import { SchemaPreviewStory } from "./_payload-stories.tsx";

test.use({ trace: "on" });

test("schema preview retains settled expansion through rerenders and failures, then resets on successful replacement", async ({
  corpus,
  corpusMedia,
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
  const pictured = library.items.flatMap((item) => (item.avatarHash === null ? [] : [{ name: item.name, path: blobUrl(item.avatarHash) }]));
  expect(pictured.length).toBeGreaterThan(0);
  const mediaConsoleErrors: string[] = [];
  const observeConsole = (message: ConsoleMessage): void => {
    if (message.type() === "error") {
      mediaConsoleErrors.push(message.text());
    }
  };
  page.on("console", observeConsole);
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
  await routeTrpc(page, {
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
  await corpusMedia();
  await mount(<SchemaPreviewStory />);
  await page
    .getByRole("textbox", { name: "Schema (JSON — the full vocabulary)", exact: true })
    .fill(JSON.stringify(projectJsonSchema(refineryScorePayloadSchema)));
  const mediaResponses = pictured.map(({ path }) => page.waitForResponse((response) => new URL(response.url()).pathname === path));
  await page.getByRole("button", { name: "Pick a card to test on", exact: true }).click();
  expect((await Promise.all(mediaResponses)).map((response) => response.status())).toEqual(pictured.map(() => 200));
  for (const response of await Promise.all(mediaResponses)) {
    expect(response.headers()["cache-control"]).toBe("private, immutable");
    expect(response.headers()["x-content-type-options"]).toBe("nosniff");
    expect(response.headers()["set-cookie"]).toBeUndefined();
  }
  for (const image of pictured) {
    const avatar = page.getByRole("option", { name: image.name, exact: true }).locator("img[data-slot=avatar-image]");
    await expect(avatar).toHaveCount(1);
    expect(
      await avatar.evaluate(async (element: HTMLImageElement) => {
        await element.decode();
        return element.naturalWidth > 0 && element.naturalHeight > 0;
      }),
    ).toBe(true);
  }
  expect(mediaConsoleErrors).toEqual([]);
  page.off("console", observeConsole);
  const hash = library.items.find((item) => item.avatarHash !== null)?.avatarHash;
  if (hash === undefined || hash === null) {
    throw new Error("The committed corpus omitted its media query control");
  }
  const foreignUrl = `https://corpus-media.example.invalid${blobUrl(hash)}`;
  const foreignFailure = page.waitForEvent("requestfailed", { predicate: (request) => request.url() === foreignUrl });
  const mediaControls = await page.evaluate(
    async ({ variant, refusals, foreign }) => {
      const image = new Image();
      image.src = variant;
      await image.decode();
      const refused = await Promise.all(
        refusals.map(async (path) => {
          const response = await fetch(path);
          return { status: response.status, bytes: (await response.arrayBuffer()).byteLength };
        }),
      );
      let externalRefused = false;
      try {
        await fetch(foreign);
      } catch {
        externalRefused = true;
      }
      return { decoded: image.naturalWidth > 0 && image.naturalHeight > 0, refused, externalRefused };
    },
    {
      variant: blobIconUrl(hash, 64),
      refusals: [blobUrl("0".repeat(64)), `${blobUrl(hash)}?w=-1`, `${blobIconUrl(hash, 64)}&v=unsupported`],
      foreign: foreignUrl,
    },
  );
  expect(mediaControls).toEqual({
    decoded: true,
    refused: [
      { status: 404, bytes: 0 },
      { status: 404, bytes: 0 },
      { status: 404, bytes: 0 },
    ],
    externalRefused: true,
  });
  expect((await foreignFailure).failure()?.errorText).toMatch(/^net::ERR_BLOCKED_BY_CLIENT(?:\.Inspector)?$/);
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
});
