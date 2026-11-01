import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import type { ImagineOptionsStory } from "./_imagine-options-stories.tsx";

const STORY = "tests/client/features/imagery/components/_imagine-options-stories/ImagineOptionsStory";
const SEED_PROMPT = "A lantern over a harbour";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});
test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

// The spend stops at the wire: these cases read the request the controls built, never a provider result.
async function routeImagine(page: Page): Promise<TrpcRecorder> {
  const caller = await root.internalCallerFor(root.ownerId);
  return await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["sessions.me", "settings.getUserSettings", "chat.getChat"]),
    ...serveCorpusProcedures(caller, ["chat.generateImage"], () => trpcError({ message: "no image provider in this case" })),
  });
}

test("the options stay collapsed until asked for, and an untouched form sends one picture with no size or negative", async ({ corpus, mount, page }) => {
  const chatId = typeIdSchema(ID_PREFIX.chat).parse(corpus.reads["chat.listChats"][0]?.output.items[0]?.id);
  const calls = await routeImagine(page);
  await mount<typeof ImagineOptionsStory>(STORY, { seed: { chatId, mode: "free", prompt: SEED_PROMPT } });
  await expect(page.getByRole("textbox", { name: "Image prompt", exact: true })).toHaveValue(SEED_PROMPT);
  await expect(page.getByRole("textbox", { name: "Negative prompt", exact: true })).toBeHidden();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect.poll(() => calls.count("chat.generateImage")).toBe(1);
  const input = calls.lastInput("chat.generateImage");
  expect(input).toMatchObject({ chatId, mode: "free", prompt: SEED_PROMPT, n: 1 });
  expect(input).not.toHaveProperty("size");
  expect(input).not.toHaveProperty("negative");
});

test("count, size and negative chosen in the options travel on the mutation input", async ({ corpus, mount, page }) => {
  const chatId = typeIdSchema(ID_PREFIX.chat).parse(corpus.reads["chat.listChats"][0]?.output.items[0]?.id);
  const calls = await routeImagine(page);
  await mount<typeof ImagineOptionsStory>(STORY, { seed: { chatId, mode: "free", prompt: SEED_PROMPT } });
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("group", { name: "Number of images", exact: true }).getByRole("button", { name: "3", exact: true }).click();
  await page.getByRole("group", { name: "Image size", exact: true }).getByRole("button", { name: "Portrait", exact: true }).click();
  await page.getByRole("textbox", { name: "Negative prompt", exact: true }).fill("  extra fingers  ");
  await expect(page.locator('[data-slot="imagine-count-spend"]')).toBeVisible();
  await page.getByRole("button", { name: "Generate", exact: true }).click();
  await expect.poll(() => calls.count("chat.generateImage")).toBe(1);
  expect(calls.lastInput("chat.generateImage")).toMatchObject({ chatId, n: 3, size: "portrait", negative: "extra fingers" });
});
