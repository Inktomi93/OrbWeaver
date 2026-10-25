// The jump-to-latest pill follows where the transcript's scroll actually ends: away from the tail it counts what landed
// below, and a jump to the tail clears it.
import { ID_PREFIX, mintTypeId } from "@orb/kit/ids";
import type { TrpcWireOutput } from "@orb/testkit/ct";
import { routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createSeededIds } from "@orb/testkit/iso";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { JumpToLatestStory } from "./_jump-to-latest-stories.tsx";

const STORY = "tests/client/features/chat/components/_jump-to-latest-stories/JumpToLatestStory";
const ROWS = 14;
const TAIL_SLACK_PX = 80;

type MessagesWire = TrpcWireOutput<"chat.listMessages">;

test("the pill counts a message that lands while the reader is away, and clears once the jump reaches the tail", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const captured = corpus.reads["chat.getChat"][0]?.output;
  if (captured === undefined) {
    throw new Error("Committed corpus omitted a chat");
  }
  const chatId = (await caller.chat.getChat({ chatId: captured.id })).id;
  const real = await caller.chat.listMessages({ chatId });
  const source = real.messages.at(-1);
  if (source === undefined) {
    throw new Error("Committed chat omitted its messages");
  }
  // The transcript is the real one, repeated at the network edge until it overflows the viewport; each row is a fresh id.
  const ids = createSeededIds();
  const rows = (count: number, from: number): MessagesWire["messages"] =>
    Array.from({ length: count }, (_, index) => ({ ...source, id: mintTypeId(ID_PREFIX.message, ids.next), seq: from + index }));
  let messages: MessagesWire = { ...real, messages: rows(ROWS, source.seq + 1) };
  const viewer = await caller.sessions.me();
  const settings = await caller.settings.getUserSettings();
  const detail = await caller.chat.getChat({ chatId });
  const reactions = await caller.chat.listReactions({ chatId });
  const scripts = await caller.regex.listScripts();
  const roomScripts = await caller.regex.listRoomDisplayScripts({ chatId });
  const plugins = await caller.plugin.list();
  const transforms = await caller.plugin.listDisplayTransforms();
  const surfaces: TrpcWireOutput<"plugin.listSurfaces"> = await caller.plugin.listSurfaces();
  await routeTrpc(page, {
    ...serveCorpusProcedures(caller, ["character.get"]),
    "sessions.me": () => viewer,
    "settings.getUserSettings": () => settings,
    "chat.getChat": () => detail,
    "chat.listReactions": () => reactions,
    "plugin.list": () => plugins,
    "plugin.listDisplayTransforms": () => transforms,
    "plugin.listSurfaces": () => surfaces,
    "chat.listMessages": () => messages,
    "chat.previewContextFit": () => trpcError({ code: "BAD_REQUEST" }),
    "regex.listScripts": () => scripts,
    "regex.listRoomDisplayScripts": () => roomScripts,
  });
  await page.setViewportSize({ width: 900, height: 420 });
  const component = await mount<typeof JumpToLatestStory>(STORY, { chatId });
  const scroller = page.locator('[data-slot="message-list-scroll"]');
  const distanceFromTail = (): Promise<number> => scroller.evaluate((element) => element.scrollHeight - element.scrollTop - element.clientHeight);
  await expect.poll(() => scroller.evaluate((element) => element.scrollHeight > element.clientHeight)).toBe(true);
  await expect.poll(distanceFromTail).toBeLessThan(TAIL_SLACK_PX);
  const pill = page.getByRole("button", { name: /^Jump to latest/u });
  await expect(pill).toHaveCount(0);

  await scroller.evaluate((element) => {
    element.scrollTop = 0;
  });
  messages = { ...messages, messages: [...messages.messages, ...rows(1, source.seq + ROWS + 1)] };
  await component.update({ chatId, revision: 1 });
  await expect(page.locator('output[aria-label="Read revision"]')).toHaveText("1");
  await expect(page.getByRole("button", { name: "Jump to latest, 1 new message", exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Jump to latest, 1 new message", exact: true }).click();
  await expect.poll(distanceFromTail).toBeLessThan(TAIL_SLACK_PX);
  await expect(pill).toHaveCount(0);
});
