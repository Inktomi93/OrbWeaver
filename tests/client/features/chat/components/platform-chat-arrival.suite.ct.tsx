// Arrival cases retain the production room and isolate only the first read or CAS HTTP delivery.
import { blobUrl } from "@orb/contracts/assets";
import { appearanceSettingsSchema } from "@orb/contracts/settings/appearance";
import { ID_PREFIX } from "@orb/kit/ids";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { seedShellState } from "@orb/testkit/browser/spec";
import type { ServedHold } from "@orb/testkit/ct";
import { createShellAmbientReads, holdServed, ROOM_PROCEDURES, routeTrpc, SECTION_PROCEDURES, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import type { CorpusPlayback } from "@orb/testkit/iso";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  captureCookieAuth,
  createCorpusHarness,
  createCorpusProviderExecution,
  makeAssetBytes,
  seedMessage,
} from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import sharp from "sharp";
import { CHAT_LIST_NAME, CHAT_MESSAGE_INPUT_NAME } from "#client/features/chat/lib/chat-surface-names.ts";
import { deriveChatTitle } from "#client/lib/chat-title.ts";
import type { ChatRoomShellStory } from "./_chat-room-shell-stories.tsx";

type Root = Awaited<ReturnType<typeof createCorpusHarness>>;
type Room = Awaited<ReturnType<Awaited<ReturnType<Root["internalCallerFor"]>>["chat"]["listChats"]>>["items"][number];

const STORY = "tests/client/features/chat/components/_chat-room-shell-stories/ChatRoomShellStory";
const ROOM_SURFACE = '[data-slot="chat-room-surface"]';
const MESSAGE_ROW = '[data-slot="message-row"]';
const ROSTER_PROCEDURE = "chat.getChat";
// tRPC's batch link marks a batched request with this query parameter; an unbatched request carries none.
const BATCH_PARAM = "batch";
const EXTRA_READS = ["rpg.getGame", "rpg.listTurnToolCalls", "assets.resolveChatBlobRefs"] as const;
const DRAFT = "Keep the observatory lantern burning.";
const CARET = 12;
const MEDIA_PASSWORD = "chat-arrival-synthetic-media-password";
const IMAGE_SIZE = { width: 480, height: 640 };
const READING_LINE = "The reader keeps this sentence in place while the picture arrives.";
const TRAILING_PROSE = Array.from({ length: 24 }, (_, index) => `Reading continuation ${index + 1}. Rain kept time against the observatory shutters.`).join(
  "\n\n",
);

test("the first message read preserves a typed draft, caret, focus and composer node", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  const caller = await root.internalCallerFor(root.ownerId);
  const rooms = (await caller.chat.listChats({ limit: 2 })).items;
  const first = rooms[0];
  const second = rooms[1];
  if (first === undefined || second === undefined) {
    throw new Error("The corpus needs two distinct persisted rooms");
  }
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
  const read = holdServed();
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...EXTRA_READS]),
    ...serveCorpusProcedures(caller, ["chat.listMessages"], ({ chatId }) => (chatId === first.id ? read : undefined)),
  });
  await using heldRead = new AsyncDisposableStack();
  heldRead.defer(read.release);
  const component = await mount<typeof ChatRoomShellStory>(STORY, { chatId: first.id });
  try {
    await read.requested;
    const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
    await expect(input).toBeVisible();
    await expect(page.locator('[data-slot="message-row"]')).toHaveCount(0);
    await input.pressSequentially(DRAFT);
    await input.evaluate((node: HTMLTextAreaElement, caret) => node.setSelectionRange(caret, caret, "forward"), CARET);
    const original = await input.elementHandle();
    read.release();
    await expect(page.locator('[data-slot="message-row"]').first()).toBeVisible();
    await expect(input).toHaveValue(DRAFT);
    await expect(input).toBeFocused();
    expect(await input.evaluate((node, before) => node === before, original)).toBe(true);
    expect(await input.evaluate((node: HTMLTextAreaElement) => [node.selectionStart, node.selectionEnd, node.selectionDirection])).toEqual([
      CARET,
      CARET,
      "forward",
    ]);
    await component.update({ chatId: second.id });
    await expect(input).toHaveValue("");
    expect(await original.evaluate((node) => node.isConnected)).toBe(false);
    await component.update({ chatId: first.id });
    await expect(input).toHaveValue(DRAFT);
  } finally {
    read.release();
    await component.unmount();
  }
});

/** Two persisted rooms, each served from the corpus except `first`'s roster and transcript reads, which wait on their holds. */
async function heldRoomReads(
  page: Page,
  corpus: CorpusPlayback,
  root: Root,
): Promise<{ readonly first: Room; readonly second: Room; readonly roster: ServedHold; readonly transcript: ServedHold; readonly rosterRequests: string[] }> {
  const rosterRequests: string[] = [];
  page.on("request", (request) => {
    if (new URL(request.url()).pathname.endsWith(`/${ROSTER_PROCEDURE}`) || request.url().includes(`${ROSTER_PROCEDURE},`)) {
      rosterRequests.push(request.url());
    }
  });
  const caller = await root.internalCallerFor(root.ownerId);
  const [first, second] = (await caller.chat.listChats({ limit: 2 })).items;
  if (first === undefined || second === undefined) {
    throw new Error("The corpus needs two distinct persisted rooms");
  }
  await caller.settings.updateUserSettingsSection({ section: "appearance", patch: appearanceSettingsSchema.parse({}) });
  const roster = holdServed();
  const transcript = holdServed();
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...EXTRA_READS]),
    ...serveCorpusProcedures(caller, ["chat.getChat"], ({ chatId }) => (chatId === first.id ? roster : undefined)),
    ...serveCorpusProcedures(caller, ["chat.listMessages"], ({ chatId }) => (chatId === first.id ? transcript : undefined)),
  });
  return { first, second, roster, transcript, rosterRequests };
}

/**
 * With both reads held, the room has no composer; the roster's answer alone draws it while the transcript still waits. Every roster
 * request left alone: a batch is one response, so a roster read batched beside the transcript's would wait for it whenever the two
 * leave in one tick, which the browser's scheduling decides and a hold cannot force.
 */
async function expectComposerOnRosterAlone(
  page: Page,
  holds: { readonly roster: ServedHold; readonly transcript: ServedHold; readonly rosterRequests: readonly string[] },
): Promise<void> {
  const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
  await expect(input).toHaveCount(0);
  holds.roster.release();
  await expect(input).toBeVisible();
  await expect(page.locator(MESSAGE_ROW)).toHaveCount(0);
  holds.transcript.release();
  await expect(page.locator(MESSAGE_ROW).first()).toBeVisible();
  expect(holds.rosterRequests.length).toBeGreaterThan(0);
  expect(holds.rosterRequests.filter((url) => new URL(url).searchParams.has(BATCH_PARAM))).toEqual([]);
}

test("a cold room draws its composer when its roster answers, while its transcript read is still held", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
  const reads = await heldRoomReads(page, corpus, root);
  const { first, roster, transcript } = reads;
  await using held = new AsyncDisposableStack();
  held.defer(() => {
    roster.release();
    transcript.release();
  });
  const component = await mount<typeof ChatRoomShellStory>(STORY, { chatId: first.id });
  try {
    await Promise.all([roster.requested, transcript.requested]);
    await expect(page.locator(ROOM_SURFACE)).toBeVisible();
    await expectComposerOnRosterAlone(page, reads);
  } finally {
    await component.unmount();
  }
});

test("a roster read a Chats row started on approach draws the room's composer while its transcript read is still held", async ({ corpus, mount, page }) => {
  await using root = await createCorpusHarness();
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "docked", context: "collapsed" } } });
  const reads = await heldRoomReads(page, corpus, root);
  const { first, second, roster, transcript } = reads;
  await using held = new AsyncDisposableStack();
  held.defer(() => {
    roster.release();
    transcript.release();
  });
  const component = await mount<typeof ChatRoomShellStory>(STORY, { chatId: second.id });
  try {
    await expect(page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true })).toBeVisible();
    await page.getByLabel(CHAT_LIST_NAME, { exact: true }).getByText(deriveChatTitle(first.title, first.participantNames), { exact: true }).first().hover();
    await roster.requested;
    await component.update({ chatId: first.id });
    await transcript.requested;
    await expect(page.locator(ROOM_SURFACE)).toBeVisible();
    await expectComposerOnRosterAlone(page, reads);
  } finally {
    await component.unmount();
  }
});

test("a delayed owned image reserves its frame and preserves the real room's reading anchor", async ({ corpus, mount, page }) => {
  const provider = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "",
    structuredReplies: new Map(),
    images: [],
  });
  await using root = await createCorpusHarness(undefined, { providerFetch: provider.execute });
  const caller = await root.internalCallerFor(root.ownerId);
  const room = (await caller.chat.listChats({ limit: 1 })).items[0];
  if (room === undefined) {
    throw new Error("The corpus needs a persisted room");
  }
  const principal = await root.principalFor(root.ownerId);
  const bytes = await sharp(Buffer.from(makeAssetBytes(root.idSource.typeId(ID_PREFIX.asset))))
    .resize(IMAGE_SIZE)
    .png()
    .toBuffer();
  const asset = await root.app.assets.store({ principal, bytes, kind: "attachment", mime: "image/png", enforceMagic: true });
  const message = await seedMessage(root, {
    principal,
    chatId: room.id,
    content: `A picture from the observatory.\n\n![Observatory picture](asset:${asset.assetId})\n\n${READING_LINE}\n\n${TRAILING_PROSE}`,
    attachmentAssetIds: [asset.assetId],
    timeZone: UTC_TIME_ZONE,
  });
  await caller.settings.updateUserSettingsSection({
    section: "appearance",
    patch: appearanceSettingsSchema.parse({ chatStyle: "flat", backgroundImageKind: "none" }),
  });
  await caller.settings.updateUserSettingsSection({ section: "theme", patch: { selectedThemeId: null } });
  const auth = await captureCookieAuth(root, principal, MEDIA_PASSWORD);
  await page.setViewportSize({ width: 390, height: 844 });
  await seedShellState(page, { activeSection: "chats", panelOverrides: { chats: { list: "collapsed", context: "collapsed" } } });
  await routeTrpc(page, {
    ...createShellAmbientReads(corpus, root.ownerId),
    ...serveCorpusProcedures(caller, [...SECTION_PROCEDURES, ...ROOM_PROCEDURES, ...EXTRA_READS]),
  });
  const requested = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  const completed: Promise<void>[] = [];
  const path = blobUrl(asset.hash);
  await page.route(`**${path}`, async (route) => {
    const joined = Promise.withResolvers<void>();
    completed.push(joined.promise);
    requested.resolve();
    try {
      await release.promise;
      const response = await root.http.request(path, { headers: { cookie: auth.cookie, forwarded: "" } });
      expect(response.status).toBe(200);
      await route.fulfill({ status: response.status, contentType: "image/png", body: Buffer.from(await response.arrayBuffer()) });
    } finally {
      joined.resolve();
    }
  });
  await using heldMedia = new AsyncDisposableStack();
  heldMedia.defer(() => release.resolve());
  const component = await mount<typeof ChatRoomShellStory>(STORY, { chatId: room.id });
  try {
    const port = page.locator('[data-slot="message-list-scroll"]');
    const row = page.locator(`[data-slot="message-row"][data-message-id="${message.id}"]`);
    const image = row.getByRole("img", { name: "Observatory picture", exact: true });
    const witness = row.getByText(READING_LINE, { exact: true });
    await expect(row).toBeVisible();
    await row.locator('[data-slot="message-name-row"] button[aria-haspopup="menu"]').focus();
    await Promise.all([
      port.evaluate((node) => new Promise<void>((resolve) => node.addEventListener("scrollend", () => resolve(), { once: true }))),
      page.keyboard.press("PageUp"),
    ]);
    await witness.evaluate((node) => {
      const scroll = node.closest('[data-slot="message-list-scroll"]');
      if (scroll === null) {
        throw new Error("The reading witness lost its production scrollport");
      }
      scroll.scrollTop += node.getBoundingClientRect().top - scroll.getBoundingClientRect().top - scroll.clientHeight / 3;
    });
    await requested.promise;
    await expect(witness).toBeInViewport();
    await expect(row.locator('[data-slot="message-name-row"]')).toHaveAttribute("data-pinned", "");
    await expect(image).toHaveAttribute("width", String(IMAGE_SIZE.width));
    await expect(image).toHaveAttribute("height", String(IMAGE_SIZE.height));
    expect(await image.evaluate((node: HTMLImageElement) => node.complete)).toBe(false);
    const before = await image.boundingBox();
    const anchor = await witness.boundingBox();
    if (before === null || anchor === null) {
      throw new Error("The pending picture and reading witness need rendered boxes");
    }
    expect(before.width).toBeGreaterThan(0);
    expect(before.height).toBeGreaterThan(0);
    expect(before.width / before.height).toBeCloseTo(IMAGE_SIZE.width / IMAGE_SIZE.height, 2);
    release.resolve();
    await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.complete && node.naturalWidth > 0)).toBe(true);
    await image.evaluate((node: HTMLImageElement) => node.decode());
    await expect
      .poll(async () => {
        const after = await image.boundingBox();
        const reading = await witness.boundingBox();
        return (
          after !== null &&
          reading !== null &&
          Math.max(Math.abs(after.width - before.width), Math.abs(after.height - before.height), Math.abs(reading.y - anchor.y))
        );
      })
      .toBeLessThanOrEqual(1);
    await expect(row.locator('[data-slot="message-name-row"]')).toHaveAttribute("data-pinned", "");
    expect(await port.evaluate((node) => node.scrollHeight - node.scrollTop - node.clientHeight)).toBeGreaterThan(
      await port.evaluate((node) => node.clientHeight),
    );
    const input = page.getByRole("textbox", { name: CHAT_MESSAGE_INPUT_NAME, exact: true });
    await expect(input).toBeVisible();
    await input.fill(DRAFT);
    await expect(input).toHaveValue(DRAFT);
  } finally {
    release.resolve();
    await component.unmount();
    await Promise.all(completed);
  }
});
