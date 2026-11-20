// @subject packages/client/src/features/chat/components/memory-view-tab.tsx
// @subject packages/client/src/features/chat/components/memory-recall-detail.tsx
// The chat's Memory tab over a real composed room whose summaries the production memory build wrote; only the
// summarizer's reply is scripted. Each case reads the tab's rendered state: the listed parts, each empty status, the
// host's strike and restore, a member's read-only rows and refused call, a stale strike, the struck marks, the
// unmatched list and the recall detail's struck rows.

import { createCharacterSchema } from "@orb/contracts/character";
import type { MemoryItemView, MemoryView } from "@orb/contracts/chat";
import { routeAuthConfig, routeTrpc, serveCorpusProcedures, trpcError } from "@orb/testkit/ct";
import { expect, test } from "@orb/testkit/ct-corpus";
import { nonEmpty, present } from "@orb/testkit/iso";
import type { ChatRoot } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createChatRoot,
  createCorpusProviderExecution,
  readRoomCanon,
  SUMMARIZE_TRANSCRIPT_MARKER,
  summaryReply,
} from "@orb/testkit/node/composed";
import type { Locator, Page } from "@playwright/test";
import { queryFailedLabel } from "#client/data/query-state-copy.ts";
import {
  MEMORY_RECALL_DETAIL_HEADING,
  MEMORY_TURN_ON_LABEL,
  MEMORY_VIEW_LOAD_SUBJECT,
  memoryRestoreName,
  memoryStrikeName,
} from "#client/features/chat/lib/memory-view-copy.ts";
import { DIALOG_VERBS } from "#client/lib/dialog-verbs.ts";
import type { MemoryViewTabStory } from "./_memory-view-stories.tsx";

const STORY = "tests/client/features/chat/components/_memory-view-stories/MemoryViewTabStory";
const BLOCK_SIZE = 2;
const SCENES = 4;
const RETOLD = "It was told again.";
// The host-off door mounts the turn-on confirm, which reads the Utility model's connection.
const PROCEDURES = [
  "sessions.me",
  "settings.getUserSettings",
  "chat.getChat",
  "connection.list",
  "connection.listBindings",
  "chat.strikeMemory",
  "chat.restoreMemory",
  "chat.previewAssembly",
] as const;

type Caller = Awaited<ReturnType<ChatRoot["root"]["internalCallerFor"]>>;
type Principal = ChatRoot["owner"];

interface RoomOptions {
  /** Seat a second character with its own summaries beside the group's shared ones. */
  readonly group?: boolean;
  readonly scenes?: number;
  /** Run the production memory sweep so the room holds summaries. */
  readonly build?: boolean;
}

/** The scene a summarize request covers: the first scene line after the transcript marker. */
function sceneIn(body: string): number {
  const tail = body.slice(body.indexOf(SUMMARIZE_TRANSCRIPT_MARKER));
  return Number(present(/scene-(\d+)\./u.exec(tail))[1]);
}

async function memoryRoom(options: RoomOptions = {}): Promise<ChatRoot & { readonly rebuild: () => Promise<void> }> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
    chatText: (body): string => {
      if (!body.includes(SUMMARIZE_TRANSCRIPT_MARKER)) {
        return "The keeper nods.";
      }
      const scene = sceneIn(body);
      const facts = `The keeper remembers scene ${scene}.${body.includes(RETOLD) ? ` ${RETOLD}` : ""}`;
      return summaryReply({ anchor: `The scene ${scene} ledger`, facts, keywords: [`ledger${scene}`] });
    },
  });
  const scenes = options.scenes ?? SCENES;
  await using construction = new AsyncDisposableStack();
  const h = construction.use(
    await createChatRoot({
      server: { startJobs: false },
      providerFetch: physical.execute,
      memoryEnabled: true,
      memoryDefaults: { mode: "mixC", blockSize: BLOCK_SIZE, verbatimWindow: 0, maxTier: 0 },
      characters: [
        createCharacterSchema.parse({ handle: "keeper", name: "Keeper", description: "The keeper of the ledger." }),
        ...(options.group === true ? [createCharacterSchema.parse({ handle: "scout", name: "Scout", description: "The scout who rides ahead." })] : []),
      ],
      ...(options.group === true ? { group: { output: "per-speaker" as const, policy: "list" as const, cardScope: "scoped" as const } } : {}),
      transcript: Array.from({ length: scenes }, (_, index) =>
        [0, 1].map(() => ({ role: "assistant" as const, content: `scene-${index + 1}. ${"orbital ledger ballast ".repeat(30)}` })),
      ).flat(),
    }),
  );
  const run = present(h.root.runAdmittedWorkload);
  const lifetime = new AbortController();
  construction.defer(() => lifetime.abort());
  const sweep = async (): Promise<void> => {
    const job = await h.caller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" });
    await run(job.id, lifetime.signal);
  };
  // A canon change reaches the store through the live pass after a turn, then the sweep.
  const rebuild = async (): Promise<void> => {
    const keeper = present(h.characters[0]);
    await h.root.services.chat.forceCharacterTurn({
      principal: h.owner,
      chatId: h.chatId,
      characterId: keeper.id,
      intent: { maxContextTokens: 8192, maxOutputTokens: 64 },
    });
    await h.root.settleBackground();
    await sweep();
  };
  if (options.build !== false) {
    await sweep();
  }
  const kept = construction.move();
  return Object.assign(h, { rebuild, [Symbol.asyncDispose]: () => kept.disposeAsync() });
}

async function invite(h: ChatRoot): Promise<Principal> {
  const person = await h.root.principalFor((await h.root.actor()).id);
  const made = await h.root.services.chat.createInvite({ principal: h.owner, chatId: h.chatId, input: { invitedHandle: person.handle } });
  await h.root.services.chat.acceptInvite({ principal: person, inviteId: made.invite.id });
  return person;
}

async function editScene(h: ChatRoot, scene: number): Promise<void> {
  const line = present((await readRoomCanon(h.root, h.owner, h.chatId)).find((message) => message.content.startsWith(`scene-${scene}.`)));
  await h.root.services.chat.editMessage({ principal: h.owner, chatId: h.chatId, messageId: line.id, content: `scene-${scene}. ${RETOLD}` });
}

interface Served {
  readonly viewer: Caller;
  /** Fails or holds the view's own read. */
  readonly intercept?: () => ReturnType<typeof trpcError> | undefined;
}

/** Serve the tab's reads and writes as `viewer`; the story takes the host verdict from the viewer's own room read. */
async function serveTab(h: ChatRoot, page: Page, served: Served): Promise<Parameters<typeof MemoryViewTabStory>[0]> {
  await routeAuthConfig(page, await (await h.root.http.request("/api/auth/config")).text());
  await routeTrpc(page, {
    ...serveCorpusProcedures(served.viewer, PROCEDURES),
    ...serveCorpusProcedures(served.viewer, ["chat.memoryView"], served.intercept),
  });
  return { chatId: h.chatId };
}

function rowsOf(page: Page): Locator {
  return page.locator('[data-memory-status="ready"] > [role="listitem"]');
}

function rowFor(page: Page, item: MemoryItemView): Locator {
  return page.locator(`[data-memory-status="ready"] > [data-memory-bucket="${item.bucket}"]`).filter({ hasText: item.text });
}

function sceneItem(view: MemoryView, blockIdx: number, bucket: MemoryItemView["bucket"] = "shared"): MemoryItemView {
  return present(view.items.find((item) => item.key.tier === 0 && item.key.blockIdx === blockIdx && item.bucket === bucket));
}

test("each listed item shows its anchor, text, keywords and speakers, and says whether everyone or one character remembers it", async ({ mount, page }) => {
  await using h = await memoryRoom({ group: true });
  const view = await h.caller.chat.memoryView({ chatId: h.chatId });
  // The control on the premise: the room holds both the group's shared summaries and a character's own.
  expect(view.items.some((item) => item.bucket === "shared")).toBe(true);
  const scoped = nonEmpty(view.items.filter((item) => item.bucket === "scoped"));
  await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer: h.caller }));

  await expect(rowsOf(page)).toHaveCount(view.items.length);
  for (const item of view.items) {
    const row = rowFor(page, item).first();
    await expect(row).toContainText(present(item.topicAnchor));
    for (const keyword of item.keywords) {
      await expect(row).toContainText(keyword);
    }
    for (const id of nonEmpty(item.speakers)) {
      await expect(row).toContainText(present(h.characters.find((character) => character.id === id)).name);
    }
  }
  // A character's own summary names that character from the roster: each name shows on every scoped row it owns or
  // speaks in, and on no other scoped row.
  for (const character of h.characters) {
    const named = scoped.filter((item) => item.key.scopedCharacterId === character.id || item.speakers.includes(character.id));
    await expect(page.locator('[data-memory-status="ready"] > [data-memory-bucket="scoped"]').filter({ hasText: character.name })).toHaveCount(named.length);
  }
  expect(scoped.some((item) => !item.speakers.includes(item.key.scopedCharacterId))).toBe(true);
});

type OffStatus = Extract<MemoryView["status"], { readonly kind: "off" }>;
type EmptyStatusKey = OffStatus["reason"] | Exclude<MemoryView["status"]["kind"], "off" | "ready">;

interface EmptyRoom {
  readonly options: RoomOptions;
  /** Put the room in the state and return who reads it. */
  readonly prepare: (h: ChatRoot) => Promise<Caller>;
}

const EMPTY_ROOMS: Record<EmptyStatusKey, EmptyRoom> = {
  "app-off": {
    options: {},
    prepare: async (h) => {
      await h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "off" } } });
      return h.caller;
    },
  },
  "host-off": {
    options: {},
    prepare: async (h) => {
      await h.caller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: false } });
      return h.caller;
    },
  },
  "too-short": { options: { scenes: 0, build: false }, prepare: async (h) => await Promise.resolve(h.caller) },
  pending: { options: { build: false }, prepare: async (h) => await Promise.resolve(h.caller) },
  "before-your-history": {
    options: {},
    prepare: async (h) => {
      const member = await invite(h);
      await h.root.services.chat.setMemberHistoryVisibility({ principal: h.owner, chatId: h.chatId, userId: member.userId, visibility: "from-join" });
      return await h.root.internalCallerFor(member.userId);
    },
  },
};

for (const [key, room] of Object.entries(EMPTY_ROOMS)) {
  test(`an empty view renders its own ${key} state and lists nothing`, async ({ mount, page }) => {
    await using h = await memoryRoom(room.options);
    const viewer = await room.prepare(h);
    const { status } = await viewer.chat.memoryView({ chatId: h.chatId });
    expect(status.kind === "off" ? status.reason : status.kind).toBe(key);
    await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer }));
    await expect(page.locator(`[data-memory-status="${key}"]`)).toBeVisible();
    await expect(page.locator("[data-memory-status]")).toHaveCount(1);
    await expect(page.getByRole("listitem")).toHaveCount(0);
    // Only the host's own switch is offered from the tab.
    await expect(page.getByRole("button", { name: MEMORY_TURN_ON_LABEL, exact: true })).toHaveCount(key === "host-off" ? 1 : 0);
  });
}

test("the host strikes an item, the row shows it struck with a restore, and restoring returns it", async ({ mount, page }) => {
  await using h = await memoryRoom();
  const item = sceneItem(await h.caller.chat.memoryView({ chatId: h.chatId }), 1);
  const scene = present(item.topicAnchor);
  await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer: h.caller }));
  const row = rowFor(page, item);

  await row.getByRole("button", { name: memoryStrikeName(scene), exact: true }).click();
  await expect(row.getByRole("button", { name: memoryRestoreName(scene), exact: true })).toBeVisible();
  await expect(row).toHaveAttribute("data-memory-strike", "struck");
  await expect(row.getByRole("button", { name: memoryStrikeName(scene), exact: true })).toHaveCount(0);
  // The strike landed on the server, on this scene alone.
  const struck = await h.caller.chat.memoryView({ chatId: h.chatId });
  expect(sceneItem(struck, 1).strike).not.toBeNull();
  expect(struck.items.filter((other) => other.strike !== null)).toHaveLength(1);

  await row.getByRole("button", { name: memoryRestoreName(scene), exact: true }).click();
  await expect(row.getByRole("button", { name: memoryStrikeName(scene), exact: true })).toBeVisible();
  await expect(row).toHaveAttribute("data-memory-strike", "none");
  expect(sceneItem(await h.caller.chat.memoryView({ chatId: h.chatId }), 1).strike).toBeNull();
});

test("a member sees the struck item and every other item with no strike or restore control", async ({ mount, page }) => {
  await using h = await memoryRoom();
  const view = await h.caller.chat.memoryView({ chatId: h.chatId });
  await h.caller.chat.strikeMemory({ chatId: h.chatId, item: sceneItem(view, 1).key });
  const member = await h.root.internalCallerFor((await invite(h)).userId);
  await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer: member }));

  await expect(rowsOf(page)).toHaveCount(view.items.length);
  await expect(rowFor(page, sceneItem(view, 1))).toHaveAttribute("data-memory-strike", "struck");
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("a strike by a host who handed the room off reads the refusal inline with no toast, and the controls go", async ({ mount, page }) => {
  await using h = await memoryRoom();
  const item = sceneItem(await h.caller.chat.memoryView({ chatId: h.chatId }), 1);
  const scene = present(item.topicAnchor);
  const member = await invite(h);
  // The new host's own switch runs the room's memory, so the list stays after the handoff.
  await (await h.root.internalCallerFor(member.userId)).settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer: h.caller }));
  // Found by its text alone: the handoff moves which bucket the room shares, so the row's bucket can change under it.
  const row = rowsOf(page).filter({ hasText: item.text });
  await expect(row.getByRole("button", { name: memoryStrikeName(scene), exact: true })).toBeVisible();
  // The handoff lands while the tab is open, with no bus to tell it.
  await h.root.services.chat.nominateHostHandoff({ principal: h.owner, chatId: h.chatId, userId: member.userId });
  await h.root.services.chat.acceptHostHandoff({ principal: member, chatId: h.chatId });

  await row.getByRole("button", { name: memoryStrikeName(scene), exact: true }).click();
  await expect(row.getByRole("alert")).toHaveAttribute("data-refusal", "not-host");
  await expect(page.getByRole("alert")).toHaveCount(1);
  await expect(page.getByRole("button")).toHaveCount(0);
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);
  expect(nonEmpty((await h.caller.chat.memoryView({ chatId: h.chatId })).items).every((listed) => listed.strike === null)).toBe(true);
});

test("a strike on a scene summarized again since the list was read is refused as changed and the row shows the new summary", async ({ mount, page }) => {
  await using h = await memoryRoom();
  const before = sceneItem(await h.caller.chat.memoryView({ chatId: h.chatId }), 1);
  await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer: h.caller }));
  await expect(rowFor(page, before)).toBeVisible();
  await editScene(h, 2);
  await h.rebuild();
  const after = sceneItem(await h.caller.chat.memoryView({ chatId: h.chatId }), 1);
  // The control on the premise: the scene's summary changed under the open list.
  expect(after.key.contentHash).not.toBe(before.key.contentHash);

  await rowFor(page, before)
    .getByRole("button", { name: memoryStrikeName(present(before.topicAnchor)), exact: true })
    .click();
  await expect(rowFor(page, after).getByRole("alert")).toHaveAttribute("data-refusal", "stale");
  await expect(rowFor(page, before)).toHaveCount(0);
  await expect(page.locator('[data-slot="toast-root"]')).toHaveCount(0);
  expect(sceneItem(await h.caller.chat.memoryView({ chatId: h.chatId }), 1).strike).toBeNull();
});

test("a struck scene summarized again carries the changed mark, and the copies left out with it carry no control", async ({ mount, page }) => {
  await using h = await memoryRoom({ group: true });
  await h.caller.chat.strikeMemory({ chatId: h.chatId, item: sceneItem(await h.caller.chat.memoryView({ chatId: h.chatId }), 1).key });
  await editScene(h, 2);
  await h.rebuild();
  const listed = await h.caller.chat.memoryView({ chatId: h.chatId });
  const carrier = present(listed.items.find((item) => item.strike !== null));
  const retelling = nonEmpty(listed.items.filter((item) => item.retellsStruck));
  // The control on the premise: the carried strike reads as changed.
  expect(carrier.strike?.changedSinceStrike).toBe(true);
  await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer: h.caller }));

  const carried = rowFor(page, carrier);
  await expect(carried).toHaveAttribute("data-memory-strike", "struck");
  await expect(carried.locator('[data-memory-changed="true"]')).toBeVisible();
  await expect(carried.getByRole("button", { name: memoryRestoreName(present(carrier.topicAnchor)), exact: true })).toBeVisible();
  await expect(page.locator('[data-memory-strike="retells"]')).toHaveCount(retelling.length);
  await expect(page.locator('[data-memory-strike="retells"]').getByRole("button")).toHaveCount(0);
  await expect(page.locator('[data-memory-changed="true"]')).toHaveCount(1);
});

/** A room whose struck scene's messages were deleted, so the strike names nothing stored. */
async function unmatchedRoom(): Promise<ChatRoot & { readonly rebuild: () => Promise<void> }> {
  await using construction = new AsyncDisposableStack();
  const h = construction.use(await memoryRoom());
  await h.caller.chat.strikeMemory({ chatId: h.chatId, item: sceneItem(await h.caller.chat.memoryView({ chatId: h.chatId }), 1).key });
  const lines = (await readRoomCanon(h.root, h.owner, h.chatId)).filter((message) => message.content.startsWith("scene-2."));
  await h.caller.chat.deleteMessages({ chatId: h.chatId, messageIds: lines.map((message) => message.id) });
  await h.rebuild();
  expect((await h.caller.chat.memoryView({ chatId: h.chatId })).unmatchedStrikes).toHaveLength(1);
  construction.move();
  return h;
}

test("the host restores a strike that names nothing stored from the unmatched list", async ({ mount, page }) => {
  await using h = await unmatchedRoom();
  const strike = present((await h.caller.chat.memoryView({ chatId: h.chatId })).unmatchedStrikes[0]);
  await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer: h.caller }));
  const unmatched = page.locator('[data-memory-unmatched="true"] > [role="listitem"]');

  await expect(unmatched).toHaveCount(1);
  await unmatched.getByRole("button", { name: memoryRestoreName(present(strike.topicAnchor)), exact: true }).click();
  await expect(unmatched).toHaveCount(0);
  await expect(rowsOf(page).first()).toBeVisible();
  expect((await h.caller.chat.memoryView({ chatId: h.chatId })).unmatchedStrikes).toEqual([]);
});

test("a member sees the unmatched list without a restore", async ({ mount, page }) => {
  await using h = await unmatchedRoom();
  const member = await h.root.internalCallerFor((await invite(h)).userId);
  await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer: member }));

  await expect(page.locator('[data-memory-unmatched="true"] > [role="listitem"]')).toHaveCount(1);
  await expect(page.getByRole("button")).toHaveCount(0);
});

test("the host's recall detail marks the struck scene's rows as struck", async ({ mount, page }) => {
  await using h = await memoryRoom();
  await h.caller.chat.strikeMemory({ chatId: h.chatId, item: sceneItem(await h.caller.chat.memoryView({ chatId: h.chatId }), 1).key });
  const recall = present((await h.caller.chat.previewAssembly({ chatId: h.chatId, timeZone: "UTC" })).trace.memoryRecall);
  const struck = nonEmpty(recall.candidates.filter((candidate) => candidate.verdict === "struck"));
  await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer: h.caller }));

  await page.getByRole("button", { name: MEMORY_RECALL_DETAIL_HEADING, exact: true }).click();
  await expect(page.locator('[data-slot="memory-recall-candidate"][data-verdict="struck"]')).toHaveCount(struck.length);
  await expect(page.locator('[data-slot="memory-recall-candidate"]')).toHaveCount(recall.candidates.length);
});

test("a view that fails to load offers a retry that lists the items", async ({ mount, page }) => {
  await using h = await memoryRoom();
  const view = await h.caller.chat.memoryView({ chatId: h.chatId });
  let failing = true;
  const intercept = (): ReturnType<typeof trpcError> | undefined => (failing ? trpcError() : undefined);
  await mount<typeof MemoryViewTabStory>(STORY, await serveTab(h, page, { viewer: h.caller, intercept }));

  await expect(page.getByText(queryFailedLabel(MEMORY_VIEW_LOAD_SUBJECT), { exact: true })).toBeVisible();
  await expect(rowsOf(page)).toHaveCount(0);
  failing = false;
  await page.getByRole("button", { name: DIALOG_VERBS.retry, exact: true }).click();
  await expect(rowsOf(page)).toHaveCount(view.items.length);
});
