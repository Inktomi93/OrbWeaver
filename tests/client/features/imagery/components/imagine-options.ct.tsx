import { ROOM_PICTURES_NOTE } from "@orb/client/lib";
import type { ChatId } from "@orb/kit/ids";
import { ID_PREFIX, typeIdSchema } from "@orb/kit/ids";
import { resolvedLength, settledBox } from "@orb/testkit/browser/spec";
import type { TrpcRecorder } from "@orb/testkit/ct";
import { routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import { TOKENS } from "@orb/ui/tokens";
import type { Page } from "@playwright/test";
import type { ImagineOptionsStory } from "./_imagine-options-stories.tsx";

const STORY = "tests/client/features/imagery/components/_imagine-options-stories/ImagineOptionsStory";
type Caller = Awaited<ReturnType<Awaited<ReturnType<typeof createCorpusHarness>>["internalCallerFor"]>>;
const SEED_PROMPT = "A lantern over a harbour";

let root: Awaited<ReturnType<typeof createCorpusHarness>>;
test.beforeAll(async () => {
  root = await createCorpusHarness();
});
test.afterAll(async () => {
  await root[Symbol.asyncDispose]();
});

// The spend stops at the wire: these cases read the request the controls built, never a provider result.
async function routeImagine(page: Page, viewer?: Caller): Promise<TrpcRecorder> {
  const caller = viewer ?? (await root.internalCallerFor(root.ownerId));
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
  await page.getByRole("button", { name: "Generate 3 images", exact: true }).click();
  await expect.poll(() => calls.count("chat.generateImage")).toBe(1);
  expect(calls.lastInput("chat.generateImage")).toMatchObject({ chatId, n: 3, size: "portrait", negative: "extra fingers" });
});

// A room both people sit in. The host is whoever the room read says it is for each of them, never assumed from the corpus.
async function sharedRoomViewers(corpus: CorpusPlayback): Promise<{ readonly chatId: ChatId; readonly host: Caller; readonly member: Caller }> {
  const memberId = corpus.memberIdentities?.sharedMember.viewer.userId;
  const room = corpus.reads["chat.getChat"].find(({ output }) => output.participants.some((person) => person.userId === memberId))?.output;
  if (memberId === undefined || room === undefined) {
    throw new Error("The corpus has no shared human room");
  }
  await (await root.internalCallerFor(root.ownerId)).settings.updateAppSettings({ partial: { localMultiUser: true } });
  // The multi-user toggle is read when a caller is built, so both callers are made after it is set.
  const owner = await root.internalCallerFor(root.ownerId);
  const guest = await root.internalCallerFor(memberId);
  const ownerIsHost = (await owner.chat.getChat({ chatId: room.id })).viewerIsHost;
  return { chatId: typeIdSchema(ID_PREFIX.chat).parse(room.id), host: ownerIsHost ? owner : guest, member: ownerIsHost ? guest : owner };
}

async function pickCount(page: Page, count: string): Promise<void> {
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await page.getByRole("group", { name: "Number of images", exact: true }).getByRole("button", { name: count, exact: true }).click();
}

test("a room member is told the host pays, a host is told they do, and both read the room's picture sentence", async ({ corpus, mount, page }) => {
  const { chatId, host, member } = await sharedRoomViewers(corpus);
  for (const [viewer, payer] of [
    [member, /host pays/u],
    [host, /You pay/u],
  ] as const) {
    await routeImagine(page, viewer);
    const mounted = await mount<typeof ImagineOptionsStory>(STORY, { seed: { chatId, mode: "free", prompt: SEED_PROMPT } });
    await expect(page.locator('[data-slot="imagine-room-pictures-note"]')).toHaveText(ROOM_PICTURES_NOTE);
    await pickCount(page, "3");
    await expect(page.locator('[data-slot="imagine-count-spend"]')).toHaveText(payer);
    await mounted.unmount();
  }
});

test("the spend line is a live region that is mounted before it has words", async ({ corpus, mount, page }) => {
  const chatId = typeIdSchema(ID_PREFIX.chat).parse(corpus.reads["chat.listChats"][0]?.output.items[0]?.id);
  await routeImagine(page);
  await mount<typeof ImagineOptionsStory>(STORY, { seed: { chatId, mode: "free", prompt: SEED_PROMPT } });
  await page.getByRole("button", { name: "More options", exact: true }).click();
  const status = page.getByRole("status");
  await expect(status).toHaveText("");
  await page.getByRole("group", { name: "Number of images", exact: true }).getByRole("button", { name: "2", exact: true }).click();
  await expect(status).toContainText("2 images");
});

test("the count stays in the Generate label with the options collapsed", async ({ corpus, mount, page }) => {
  const chatId = typeIdSchema(ID_PREFIX.chat).parse(corpus.reads["chat.listChats"][0]?.output.items[0]?.id);
  await routeImagine(page);
  await mount<typeof ImagineOptionsStory>(STORY, { seed: { chatId, mode: "free", prompt: SEED_PROMPT } });
  await pickCount(page, "4");
  await page.getByRole("button", { name: "More options", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Negative prompt", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Generate 4 images", exact: true })).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 430, height: 740 }, isMobile: true, hasTouch: true });
  test("every count toggle meets the touch floor on both axes", async ({ corpus, mount, page }) => {
    const chatId = typeIdSchema(ID_PREFIX.chat).parse(corpus.reads["chat.listChats"][0]?.output.items[0]?.id);
    await routeImagine(page);
    await mount<typeof ImagineOptionsStory>(STORY, { seed: { chatId, mode: "free", prompt: SEED_PROMPT } });
    await page.getByRole("button", { name: "More options", exact: true }).click();
    const group = page.getByRole("group", { name: "Number of images", exact: true });
    const toggles = group.getByRole("button");
    const floor = await resolvedLength(page, TOKENS["size.touch-target"].value, group);
    for (let index = 0; index < (await toggles.count()); index += 1) {
      const box = await settledBox(toggles.nth(index));
      expect(box.width).toBeGreaterThanOrEqual(floor - 1);
      expect(box.height).toBeGreaterThanOrEqual(floor - 1);
    }
  });
});
