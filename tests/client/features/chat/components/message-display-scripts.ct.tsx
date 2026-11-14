// Display regex scripts through the real transcript: `MessageListSurface` renders each row through
// `useDisplayText`, which runs the viewer's scripts in the display-pass Worker under its deadlines. The
// scripts are created through `regex.createScript` on a corpus root and reach the page through
// `regex.listScripts`, so each case runs what a viewer's own library would.

import type { ChatId, MessageId } from "@orb/kit/ids";
import { noticeToast, routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { displayScriptsStoppedDescription, displayScriptsStoppedTitle } from "#client/lib/display-pass-copy.ts";
import type { StreamingReplyStory } from "./_ghost-macro-stories.tsx";
import { GHOST_ROOM_PROCEDURES as PROCEDURES, soloRoom } from "./ghost-room.fixtures.ts";

const STORY = "tests/client/features/chat/components/_ghost-macro-stories/StreamingReplyStory";
const STREAM_LABEL = "Stream a reply";
const STREAM_MORE_LABEL = "Stream more";
const UTC = "UTC";
/** Backtracks exponentially on a run of `a` that does not end the line: at forty, for longer than any test runs. */
const RUNAWAY = { name: "Runaway", findRegex: "(a+)+$", replaceString: "MATCHED" } as const;
const RUNAWAY_TEXT = `${"a".repeat(40)}!`;

type Harness = Awaited<ReturnType<typeof createCorpusHarness>>;
type Owner = Awaited<ReturnType<Harness["internalCallerFor"]>>;
interface Script {
  readonly name: string;
  readonly findRegex: string;
  readonly replaceString: string;
}

async function addDisplayScript(owner: Owner, script: Script): Promise<void> {
  await owner.regex.createScript({ input: { ...script, placement: ["DISPLAY"], markdownOnly: true } });
}

/** Rewrite the room's newest message through the production edit verb, so it is the row the case reads. */
async function rewriteNewest(owner: Owner, chatId: ChatId, content: string): Promise<MessageId> {
  const { messages } = await owner.chat.listMessages({ chatId, limit: 1 });
  const newest = messages.at(-1);
  if (newest === undefined) {
    throw new Error("The corpus room has no message to rewrite");
  }
  await owner.chat.editMessage({ chatId, messageId: newest.id, content, timeZone: UTC });
  return newest.id;
}

async function serveRoom(page: Page, root: Harness, owner: Owner): Promise<void> {
  await routeAuthConfig(page, await (await root.http.request("/api/auth/config")).text());
  await routeTrpc(page, serveCorpusProcedures(owner, PROCEDURES));
}

test("a runaway display script is stopped: the row shows its own text, one notice names it, and the page keeps answering", async ({
  mount,
  page,
  corpusMedia,
}) => {
  await using root = await createCorpusHarness();
  const { chatId, characterId } = await soloRoom(root);
  const owner = await root.internalCallerFor(root.ownerId);
  await addDisplayScript(owner, RUNAWAY);
  const messageId = await rewriteNewest(owner, chatId, RUNAWAY_TEXT);
  await serveRoom(page, root, owner);
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, { chatId, speakerCharacterId: characterId, streamedText: "The room answers.", streamLabel: STREAM_LABEL });

  const row = page.locator(`[data-message-id="${messageId}"]`);
  await expect(row.getByText(RUNAWAY_TEXT, { exact: true })).toBeVisible();
  await expect(row).not.toContainText(RUNAWAY.replaceString);
  await expect(
    noticeToast(page, { title: displayScriptsStoppedTitle(1), description: displayScriptsStoppedDescription(RUNAWAY.name, "slow", 1) }),
  ).toBeVisible();
  // A second interaction completes: the main thread never ran the pattern.
  await page.getByRole("button", { name: STREAM_LABEL, exact: true }).click();
  await expect(page.locator('[data-slot="ghost-message-row"] [data-slot="ghost-stream-body"]')).toContainText("The room answers.");
});

// Every shape the browser's nested-quantifier refusal turned away, each a panel script a preset ships. The
// last two stack three quantifiers, which the kit's own stack count refuses until the guards lane removes it.
const REFUSED_SHAPES = [
  { shape: "+)?", findRegex: String.raw`<hp>(\d+)?</hp>`, replaceString: "HP $1", text: "<hp>42</hp>", drawn: "HP 42" },
  { shape: "+)*", findRegex: String.raw`<scene>((?:[^<]+)*)</scene>`, replaceString: "SCENE $1", text: "<scene>The docks</scene>", drawn: "SCENE The docks" },
  { shape: "*)*", findRegex: String.raw`<mood>((?:\w*)*)</mood>`, replaceString: "MOOD $1", text: "<mood>calm</mood>", drawn: "MOOD calm" },
  { shape: "}){", findRegex: String.raw`<code>((?:\d{2}){2})</code>`, replaceString: "CODE $1", text: "<code>1234</code>", drawn: "CODE 1234" },
  { shape: "?)+", findRegex: String.raw`<flag>((?:on|off)?)+</flag>`, replaceString: "FLAG SET", text: "<flag>on</flag>", drawn: "FLAG SET" },
  { shape: "*?)?", findRegex: String.raw`<hud>([\s\S]*?)?</hud>`, replaceString: "HUD $1", text: "<hud>Day 3</hud>", drawn: "HUD Day 3" },
  {
    shape: "three stacks: *)? +)? *)?",
    findRegex: String.raw`<stats>(?:\s*)?(\d+)?(?:\s*)?</stats>`,
    replaceString: "STATS $1",
    text: "<stats> 7 </stats>",
    drawn: "STATS 7",
  },
  {
    shape: "three stacks: *)? *? *)?",
    findRegex: String.raw`(?:\n*)?<banner>([\s\S]*?)?</banner>(?:\n*)?`,
    replaceString: "BANNER $1",
    text: "<banner>Night falls</banner>",
    drawn: "BANNER Night falls",
  },
] as const;

for (const { shape, findRegex, replaceString, text, drawn } of REFUSED_SHAPES) {
  test(`a display script shaped ${shape} draws on the settled row`, async ({ mount, page, corpusMedia }) => {
    await using root = await createCorpusHarness();
    const { chatId, characterId } = await soloRoom(root);
    const owner = await root.internalCallerFor(root.ownerId);
    await addDisplayScript(owner, { name: `Panel ${shape}`, findRegex, replaceString });
    const messageId = await rewriteNewest(owner, chatId, `Before the panel.\n\n${text}`);
    await serveRoom(page, root, owner);
    await corpusMedia();
    await mount<typeof StreamingReplyStory>(STORY, { chatId, speakerCharacterId: characterId, streamedText: "", streamLabel: STREAM_LABEL });

    await expect(page.locator(`[data-message-id="${messageId}"]`).getByText(drawn, { exact: true })).toBeVisible();
  });
}

test("a streaming reply draws through a display script, and a runaway one leaves the stream readable and the page answering", async ({
  mount,
  page,
  corpusMedia,
}) => {
  await using root = await createCorpusHarness();
  const { chatId, characterId } = await soloRoom(root);
  const owner = await root.internalCallerFor(root.ownerId);
  await addDisplayScript(owner, { name: "Hit points", findRegex: String.raw`<hp>(\d+)?</hp>`, replaceString: "HP $1" });
  await addDisplayScript(owner, RUNAWAY);
  await serveRoom(page, root, owner);
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, {
    chatId,
    speakerCharacterId: characterId,
    streamedText: `<hp>9</hp> ${RUNAWAY_TEXT}`,
    streamLabel: STREAM_LABEL,
    nextText: " She steadies herself.",
  });

  await page.getByRole("button", { name: STREAM_LABEL, exact: true }).click();
  const body = page.locator('[data-slot="ghost-message-row"] [data-slot="ghost-stream-body"]');
  await expect(body).toContainText(`HP 9 ${RUNAWAY_TEXT}`);
  await expect(body).not.toContainText("<hp>");
  await page.getByRole("button", { name: STREAM_MORE_LABEL, exact: true }).click();
  await expect(body).toContainText("She steadies herself.");
});

test("a settled row is held unseen until its display pass lands, and the transcript stays pinned to it as it grows", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const { chatId, characterId } = await soloRoom(root);
  const owner = await root.internalCallerFor(root.ownerId);
  const tall = Array.from({ length: 40 }, (_, line) => `Panel line ${line + 1}.`).join("\n\n");
  await addDisplayScript(owner, { name: "Tall panel", findRegex: "<panel/>", replaceString: `${tall}\n\nPanel end.` });
  const messageId = await rewriteNewest(owner, chatId, "The newest reply.\n\n<panel/>");
  await serveRoom(page, root, owner);
  // The Worker's script is held at the network edge, so the pass lands only after the list has settled.
  const { promise: released, resolve: release } = Promise.withResolvers<void>();
  await page.route(/display-pass\.worker/u, async (route) => {
    await released;
    await route.continue();
  });
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, { chatId, speakerCharacterId: characterId, streamedText: "", streamLabel: STREAM_LABEL });

  const scroller = page.locator('[data-slot="message-list-scroll"]');
  const gapToTail = (): Promise<number> => scroller.evaluate((element) => element.scrollHeight - element.clientHeight - element.scrollTop);
  const held = page.locator(`[data-message-id="${messageId}"] [data-display-pending]`);
  await expect(held).toBeAttached();
  await expect(held).toBeHidden();
  expect((await held.boundingBox())?.height ?? 0).toBeGreaterThan(0);
  await expect.poll(gapToTail).toBeLessThanOrEqual(1);
  release();

  // The story's transcript host is taller than the page, so the pin is read off the scroller's own box.
  const lastLine = page.locator(`[data-message-id="${messageId}"]`).getByText("Panel end.", { exact: true });
  await expect(lastLine).toBeVisible();
  await expect.poll(gapToTail).toBeLessThanOrEqual(1);
  const [lineBox, portBox] = await Promise.all([lastLine.boundingBox(), scroller.boundingBox()]);
  expect((lineBox?.y ?? Number.NaN) + (lineBox?.height ?? Number.NaN)).toBeLessThanOrEqual((portBox?.y ?? Number.NaN) + (portBox?.height ?? Number.NaN) + 1);
});
