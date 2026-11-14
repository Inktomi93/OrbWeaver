// Display regex scripts through the real transcript: `MessageListSurface` renders each row through
// `useDisplayText`, which runs the viewer's scripts in the display-pass Worker under its deadlines. The
// scripts are created through `regex.createScript` on a corpus root, attached Everywhere, and reach the page through
// the room's display-set read, so each case runs what the room resolves for the viewer. The scoping cases read each row's
// target, author stamps, depth and the room's seats off the row's own data, as the transcript passes them.

import type { MessageView } from "@orb/contracts/chat";
import { CHAT_MESSAGE_LIST_MAX_LIMIT } from "@orb/contracts/chat";
import type { CharacterId, ChatId, MessageId } from "@orb/kit/ids";
import { noticeToast, routeAuthConfig, routeTrpc, serveCorpusProcedures } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { createCorpusHarness } from "@orb/testkit/node/composed";
import type { Page } from "@playwright/test";
import { MESSAGE_REASONING_NAME } from "#client/features/chat/lib/message-action-names.ts";
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
type CreateInput = Parameters<Owner["regex"]["createScript"]>[0]["input"];
type Script = Pick<CreateInput, "name" | "findRegex" | "replaceString"> & Partial<Pick<CreateInput, "targets" | "depth" | "authors">>;

/** Both of a transcript row's body targets: the leg 1 cases draw on whichever row they rewrite. */
const BODY_TARGETS: CreateInput["targets"] = ["AI_OUTPUT", "USER_INPUT"];

/** A display script runs where it is attached, so each one is made one of the owner's Everywhere scripts: the room's
 *  global tier when the owner hosts, the viewer's own tier when they do not. */
async function addDisplayScript(owner: Owner, { targets = BODY_TARGETS, ...script }: Script): Promise<void> {
  const created = await owner.regex.createScript({ input: { ...script, targets: [...targets], passes: ["display"] } });
  await owner.regex.attachGlobal({ scriptId: created.id });
}

/** A row the transcript counts toward depth: it would reach the model. */
function counted(message: MessageView): boolean {
  return message.role !== "system" && !message.excludedFromPrompt;
}

/** The newest rows the room's transcript paints on mount, newest last. */
async function tailRows(owner: Owner, chatId: ChatId): Promise<readonly MessageView[]> {
  return (await owner.chat.listMessages({ chatId, limit: CHAT_MESSAGE_LIST_MAX_LIMIT })).messages;
}

// The rows a case rewrites stay in the newest few, so the windowed transcript paints them on mount.
const ON_SCREEN_TAIL = 4;

interface ScopedRoom {
  readonly chatId: ChatId;
  readonly characterId: CharacterId;
  readonly rows: readonly MessageView[];
}

/** The first corpus room whose newest rows hold what `pick` asks for, read through the production verbs. */
async function findRoom(
  owner: Owner,
  pick: (tail: readonly MessageView[], room: Awaited<ReturnType<Owner["chat"]["getChat"]>>) => readonly MessageView[] | null,
): Promise<ScopedRoom> {
  for (const { id } of (await owner.chat.listChats({ limit: 100 })).items) {
    const room = await owner.chat.getChat({ chatId: id });
    const characterId = room.participants.find((seat) => seat.kind === "character" && seat.characterId !== null)?.characterId;
    const rows = pick((await tailRows(owner, id)).slice(-ON_SCREEN_TAIL), room);
    if (characterId !== undefined && characterId !== null && rows !== null) {
      return { chatId: id, characterId, rows };
    }
  }
  throw new Error("The corpus has no room holding the rows this case needs");
}

const rowOf = (page: Page, id: MessageId): ReturnType<Page["locator"]> => page.locator(`[data-message-id="${id}"]`);

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

// ── Scoping: each row's own target, author stamps, depth and the room's seats decide which scripts draw on it ──

/** The marker every scoped script finds; a row a script skips still shows it. */
const MARK = "SCOPEMARK";

test("a script scoped to AI replies draws on an AI reply and not on the user's message", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await findRoom(owner, (tail) => {
    const reply = tail.findLast((m) => m.role === "assistant");
    const sent = tail.findLast((m) => m.role === "user");
    return reply === undefined || sent === undefined ? null : [reply, sent];
  });
  const [reply, sent] = room.rows;
  if (reply === undefined || sent === undefined) {
    throw new Error("The room lost its rows");
  }
  await addDisplayScript(owner, { name: "Reply panel", findRegex: MARK, replaceString: "REPLY-DRAWN", targets: ["AI_OUTPUT"] });
  await owner.chat.editMessage({ chatId: room.chatId, messageId: reply.id, content: `The reply ${MARK}.`, timeZone: UTC });
  await owner.chat.editMessage({ chatId: room.chatId, messageId: sent.id, content: `The message ${MARK}.`, timeZone: UTC });
  await serveRoom(page, root, owner);
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, { chatId: room.chatId, speakerCharacterId: room.characterId, streamedText: "", streamLabel: STREAM_LABEL });

  await expect(rowOf(page, reply.id).getByText("The reply REPLY-DRAWN.", { exact: true })).toBeVisible();
  await expect(rowOf(page, sent.id).getByText(`The message ${MARK}.`, { exact: true })).toBeVisible();
});

test("a reasoning-scoped script draws on the reasoning block and not on the reply's body", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await findRoom(owner, (tail) => {
    const reply = tail.findLast((m) => m.role === "assistant");
    return reply === undefined ? null : [reply];
  });
  const [reply] = room.rows;
  if (reply === undefined) {
    throw new Error("The room lost its reply");
  }
  await addDisplayScript(owner, { name: "Thought panel", findRegex: MARK, replaceString: "THOUGHT-DRAWN", targets: ["REASONING"] });
  await owner.chat.editMessage({ chatId: room.chatId, messageId: reply.id, content: `The body ${MARK}.`, timeZone: UTC });
  await owner.chat.editReasoning({ chatId: room.chatId, messageId: reply.id, reasoning: `The thought ${MARK}.` });
  await serveRoom(page, root, owner);
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, { chatId: room.chatId, speakerCharacterId: room.characterId, streamedText: "", streamLabel: STREAM_LABEL });

  const row = rowOf(page, reply.id);
  await row.getByRole("button", { name: MESSAGE_REASONING_NAME, exact: true }).click();
  await expect(row.locator('[data-slot="message-reasoning"]').getByText("The thought THOUGHT-DRAWN.", { exact: true })).toBeVisible();
  await expect(row.getByText(`The body ${MARK}.`, { exact: true })).toBeVisible();
});

test("a depth-limited script draws only within its depth", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await findRoom(owner, (tail) => {
    const rows = tail.filter(counted);
    const newest = rows.at(-1);
    const next = rows.at(-2);
    // The newest painted row must be the newest counted one, or depth 0 is a row this case does not rewrite.
    return newest === undefined || next === undefined || tail.at(-1)?.id !== newest.id ? null : [newest, next];
  });
  const [newest, next] = room.rows;
  if (newest === undefined || next === undefined) {
    throw new Error("The room lost its rows");
  }
  await addDisplayScript(owner, { name: "Newest only", findRegex: MARK, replaceString: "DEPTH-DRAWN", depth: { min: 0, max: 0 } });
  await owner.chat.editMessage({ chatId: room.chatId, messageId: newest.id, content: `The newest ${MARK}.`, timeZone: UTC });
  await owner.chat.editMessage({ chatId: room.chatId, messageId: next.id, content: `The one before ${MARK}.`, timeZone: UTC });
  await serveRoom(page, root, owner);
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, { chatId: room.chatId, speakerCharacterId: room.characterId, streamedText: "", streamLabel: STREAM_LABEL });

  await expect(rowOf(page, newest.id).getByText("The newest DEPTH-DRAWN.", { exact: true })).toBeVisible();
  await expect(rowOf(page, next.id).getByText(`The one before ${MARK}.`, { exact: true })).toBeVisible();
});

test("a narrator row is AI output: an AI-scoped script draws on it, and one excluding the narrator kind does not", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await findRoom(owner, (tail) => {
    const narration = tail.findLast((m) => m.kind === "narrator");
    return narration === undefined ? null : [narration];
  });
  const [narration] = room.rows;
  if (narration === undefined) {
    throw new Error("The room lost its narration");
  }
  await addDisplayScript(owner, { name: "AI panel", findRegex: "AIMARK", replaceString: "AI-DRAWN", targets: ["AI_OUTPUT"] });
  await addDisplayScript(owner, {
    name: "Not the narrator",
    findRegex: MARK,
    replaceString: "NOT-NARRATOR-DRAWN",
    targets: ["AI_OUTPUT"],
    authors: { include: [], exclude: [{ by: "kind", kind: "narrator" }] },
  });
  await owner.chat.editMessage({ chatId: room.chatId, messageId: narration.id, content: `The narration AIMARK ${MARK}.`, timeZone: UTC });
  await serveRoom(page, root, owner);
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, { chatId: room.chatId, speakerCharacterId: room.characterId, streamedText: "", streamLabel: STREAM_LABEL });

  await expect(rowOf(page, narration.id).getByText(`The narration AI-DRAWN ${MARK}.`, { exact: true })).toBeVisible();
});

test("a script scoped to the host draws on the host's message and not on another member's", async ({ mount, page, corpusMedia }) => {
  await using root = await createCorpusHarness();
  const owner = await root.internalCallerFor(root.ownerId);
  const room = await findRoom(owner, (tail, detail) => {
    if (!detail.viewerIsHost) {
      return null;
    }
    const members = new Set(
      detail.participants.flatMap((seat) => (seat.userId !== null && seat.leftSeq === null && seat.role === "member" ? [seat.userId] : [])),
    );
    const hosts = tail.findLast((m) => m.role === "user" && m.authorUserId === detail.viewerUserId);
    const theirs = tail.findLast((m) => m.role === "user" && m.authorUserId !== null && members.has(m.authorUserId));
    return hosts === undefined || theirs === undefined ? null : [hosts, theirs];
  });
  const [hosts, theirs] = room.rows;
  if (hosts === undefined || theirs === undefined) {
    throw new Error("The room lost its rows");
  }
  await addDisplayScript(owner, {
    name: "Host badge",
    findRegex: MARK,
    replaceString: "HOST-DRAWN",
    targets: ["USER_INPUT"],
    authors: { include: [{ by: "standing", standing: "host" }], exclude: [] },
  });
  await owner.chat.editMessage({ chatId: room.chatId, messageId: hosts.id, content: `The host's line ${MARK}.`, timeZone: UTC });
  await owner.chat.editMessage({ chatId: room.chatId, messageId: theirs.id, content: `The member's line ${MARK}.`, timeZone: UTC });
  await serveRoom(page, root, owner);
  await corpusMedia();
  await mount<typeof StreamingReplyStory>(STORY, { chatId: room.chatId, speakerCharacterId: room.characterId, streamedText: "", streamLabel: STREAM_LABEL });

  await expect(rowOf(page, hosts.id).getByText("The host's line HOST-DRAWN.", { exact: true })).toBeVisible();
  await expect(rowOf(page, theirs.id).getByText(`The member's line ${MARK}.`, { exact: true })).toBeVisible();
});
