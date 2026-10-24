// A Retry on the chat transcript boundary (which passes no reserveKey) must leave the transcript's scroller its
// bounded height, so the settled thread still scrolls inside the room instead of growing past it.
import type { TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { TideMediaLifetimeStory } from "./_media-lifetime-stories.tsx";

const STORY = "tests/client/features/chat/components/_media-lifetime-stories/TideMediaLifetimeStory";
const SHORT_VIEWPORT = { width: 1280, height: 300 };

test.use({ viewport: SHORT_VIEWPORT });

test("a transcript that settles after Retry keeps a bounded scroller", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const captured = corpus.reads["chat.getChat"][0]?.output;
  if (captured === undefined) {
    throw new Error("Committed corpus omitted a chat");
  }
  const chatId = (await caller.chat.getChat({ chatId: captured.id })).id;
  const settled = await caller.chat.listMessages({ chatId });
  const viewer = await caller.sessions.me();
  const settings = await caller.settings.getUserSettings();
  const detail = await caller.chat.getChat({ chatId });
  const scripts = await caller.regex.listScripts();
  const roomScripts = await caller.regex.listRoomDisplayScripts({ chatId });
  const reactions = await caller.chat.listReactions({ chatId });
  const plugins = await caller.plugin.list();
  const transforms = await caller.plugin.listDisplayTransforms();
  const surfaces: TrpcWireOutput<"plugin.listSurfaces"> = await caller.plugin.listSurfaces();
  let failing = true;
  await page.route("**/api/auth/config", (route) => route.fulfill({ json: corpus.auth.signedInConfig }));
  await routeTrpc(page, {
    "sessions.me": () => viewer,
    "settings.getUserSettings": () => settings,
    "chat.getChat": () => detail,
    "chat.listReactions": () => reactions,
    "plugin.list": () => plugins,
    "plugin.listDisplayTransforms": () => transforms,
    "plugin.listSurfaces": () => surfaces,
    "chat.listMessages": () => (failing ? trpcError({ code: "INTERNAL_SERVER_ERROR" }) : settled),
    "chat.previewContextFit": () => trpcError({ code: "BAD_REQUEST" }),
    "regex.listScripts": () => scripts,
    "regex.listRoomDisplayScripts": () => roomScripts,
  });
  await mount<typeof TideMediaLifetimeStory>(STORY, { chatId });
  const error = page.locator('[data-slot="query-error"]');
  await expect(error).toBeVisible();

  failing = false;
  await error.getByRole("button", { name: "Retry", exact: true }).click();
  const scroller = page.locator('[data-slot="message-list-scroll"]');
  await expect(scroller).toBeVisible();

  // The story stacks a one-line readout above the surface inside a viewport-high column, so the scroller owns
  // exactly the rest of the viewport: any wrapper that drops the `h-full` chain makes it grow past that.
  const readout = await page.getByRole("status", { name: "Read revision" }).boundingBox();
  const sizes = await scroller.evaluate((element) => ({ client: element.clientHeight, scroll: element.scrollHeight }));
  expect(sizes.client + (readout?.height ?? Number.NaN)).toBeCloseTo(SHORT_VIEWPORT.height, 0);
  expect(sizes.scroll).toBeGreaterThan(sizes.client);
});
