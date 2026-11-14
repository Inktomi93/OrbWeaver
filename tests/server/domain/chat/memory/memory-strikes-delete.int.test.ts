// A member deleting their own messages cannot lift the host's strike, through the composed root: when a member deletes
// their message at the start of a struck span, at its end, or at both ends with a struck turn between, the struck
// turn stays out of the next forced turn's prompt and the strike stays listed as matched, with its id for the present
// host only; the same holds after the host reorders messages across the scene before the delete; and a backup taken
// after the delete restores the strike into a library that never held the room.
// Digests come from the production memory build; only the provider edges are scripted (`recall-world.ts`).
// @subject packages/server/src/domain/chat/memory/persistence/strikes.ts
// @subject packages/server/src/domain/export/verbs/export-chat-bundle.ts

import type { MemoryView } from "@orb/contracts/chat";
import type { PortableFile } from "@orb/contracts/portability";
import type { ChatMemoryStrikeId, MessageId } from "@orb/kit/ids";
import { CHAT_BUNDLE_EXT } from "@orb/server/primitives/serde/chat-bundle";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { readRoomCanon, SUMMARIZE_TRANSCRIPT_MARKER, summaryReply } from "@orb/testkit/node/composed";
import { failOnExportNote } from "@orb/testkit/node/helpers";
import { invitePerson } from "../persona-cache-physical.ts";
import { wireOf } from "../scenario-physical.ts";
import { BLOCK_SIZE, fillerLine, redigest, TURN_INTENT, world } from "./recall-world.ts";

/** The struck turn's marker: the keeper's reply carries it, and the scripted summarizer retells any block holding it. */
const OATH_LINE = "line-oath.";
const OATH_FACTS = "arc-oath.";
const FILLER_AFTER = 10;
const MEMBER_LINE = "The member nods.";

type RecallWorld = Awaited<ReturnType<typeof world.build>>;
type Person = ChatRoot["owner"];

interface OathWorld {
  readonly w: RecallWorld;
  /** The keeper's next reply carries the oath. */
  readonly swearNext: () => void;
}

async function oathWorld(): Promise<OathWorld> {
  let swear = false;
  const w = await world.build({
    mode: "mixA",
    maxTier: 0,
    replyFor: (body) => {
      if (body.includes(SUMMARIZE_TRANSCRIPT_MARKER)) {
        return body.includes(OATH_LINE) ? summaryReply({ anchor: "Arc oath", facts: `${OATH_FACTS} The oath was sworn.`, keywords: ["oath"] }) : undefined;
      }
      if (!swear) {
        return;
      }
      swear = false;
      return `${OATH_LINE} The keeper swore the oath.`;
    },
  });
  return {
    w,
    swearNext: (): void => {
      swear = true;
    },
  };
}

async function keeperTurn(h: ChatRoot): Promise<void> {
  const turn = await h.root.services.chat.forceCharacterTurn({
    principal: h.owner,
    chatId: h.chatId,
    characterId: present(h.characters[0]).id,
    intent: TURN_INTENT,
  });
  expect(turn.aborted).toBe(false);
  await h.root.settleBackground();
}

async function commit(h: ChatRoot, principal: Person, content: string): Promise<MessageId> {
  const outcome = await h.root.services.chat.commitMessage({ principal, chatId: h.chatId, content });
  return present(outcome.messages[0]).id;
}

/** Commit host lines until the next message opens a block of `blockSize`. */
async function padToBlockStart(h: ChatRoot, blockSize: number): Promise<void> {
  let count = (await readRoomCanon(h.root, h.owner, h.chatId)).length;
  while (count % blockSize !== 0) {
    await commit(h, h.owner, fillerLine(count));
    count += 1;
  }
}

/** Age the scene out of the prompt's window, rebuild memory, and strike the one summary that retells the oath. */
async function strikeOath(o: OathWorld): Promise<ChatMemoryStrikeId> {
  const { h } = o.w;
  for (let index = 0; index < FILLER_AFTER; index += 1) {
    await commit(h, h.owner, fillerLine(index));
  }
  await redigest(o.w);
  const oath = (await h.caller.chat.memoryView({ chatId: h.chatId })).items.filter((item) => item.text.includes(OATH_FACTS));
  expect(oath).toHaveLength(1);
  return (await h.caller.chat.strikeMemory({ chatId: h.chatId, item: present(oath[0]).key })).strikeId;
}

/** The prompt of one forced keeper turn. */
async function forcedPrompt(h: ChatRoot): Promise<string> {
  const { outcome, bodies } = await wireOf(h, () =>
    h.root.services.chat.forceCharacterTurn({ principal: h.owner, chatId: h.chatId, characterId: present(h.characters[0]).id, intent: TURN_INTENT }),
  );
  expect(outcome.aborted).toBe(false);
  return present(
    bodies
      .map((body) => JSON.stringify(body))
      .filter((body) => !body.includes(SUMMARIZE_TRANSCRIPT_MARKER))
      .at(-1),
  );
}

/** The strikes the view lists on items, and its unmatched list. */
function listedStrikes(view: MemoryView): { readonly carried: readonly unknown[]; readonly unmatched: readonly unknown[] } {
  return {
    carried: view.items.flatMap((item) => (item.strike === null ? [] : [[item.text.includes(OATH_FACTS), item.strike]])),
    unmatched: view.unmatchedStrikes,
  };
}

async function memberOf(h: ChatRoot): Promise<Person> {
  const member = await invitePerson(h);
  await h.root.services.settings.updateUserSettingsSection({ principal: member, input: { section: "memory", patch: { enabled: true } } });
  return member;
}

test("a member deleting their own message at the start of a struck span leaves the struck reply out, matched, its id for the present host only", async () => {
  const o = await oathWorld();
  await using w = o.w;
  const { h } = w;
  const member = await memberOf(h);
  const nextHost = await memberOf(h);
  await padToBlockStart(h, BLOCK_SIZE);
  const own = await commit(h, member, MEMBER_LINE);
  o.swearNext();
  await keeperTurn(h);
  const strikeId = await strikeOath(o);
  expect(await forcedPrompt(h)).not.toContain(OATH_FACTS);

  await h.root.services.chat.deleteMessages({ principal: member, chatId: h.chatId, messageIds: [own] });
  await redigest(w);
  // The keeper's struck reply now sits in a block with the next line, whose summary retells the oath.
  expect(await forcedPrompt(h)).not.toContain(OATH_FACTS);
  expect(listedStrikes(await h.caller.chat.memoryView({ chatId: h.chatId }))).toEqual({
    carried: [[true, { strikeId, changedSinceStrike: true }]],
    unmatched: [],
  });

  await h.root.services.chat.nominateHostHandoff({ principal: h.owner, chatId: h.chatId, userId: nextHost.userId });
  await h.root.services.chat.acceptHostHandoff({ principal: nextHost, chatId: h.chatId });
  const viewAs = async (principal: Person): Promise<ReturnType<typeof listedStrikes>> =>
    listedStrikes(await h.root.services.chat.memoryView({ principal, chatId: h.chatId }));
  expect(await viewAs(nextHost)).toEqual({ carried: [[true, { strikeId, changedSinceStrike: true }]], unmatched: [] });
  for (const reader of [h.owner, member]) {
    expect(await viewAs(reader)).toEqual({ carried: [[true, { strikeId: null, changedSinceStrike: true }]], unmatched: [] });
  }
});

test("a member deleting their own message at the end of a struck span leaves the struck reply out and the strike matched", async () => {
  const o = await oathWorld();
  await using w = o.w;
  const { h } = w;
  const member = await memberOf(h);
  await padToBlockStart(h, BLOCK_SIZE);
  o.swearNext();
  await keeperTurn(h);
  const own = await commit(h, member, MEMBER_LINE);
  const strikeId = await strikeOath(o);

  await h.root.services.chat.deleteMessages({ principal: member, chatId: h.chatId, messageIds: [own] });
  await redigest(w);
  expect(await forcedPrompt(h)).not.toContain(OATH_FACTS);
  expect(listedStrikes(await h.caller.chat.memoryView({ chatId: h.chatId }))).toEqual({
    carried: [[true, { strikeId, changedSinceStrike: true }]],
    unmatched: [],
  });
  // The control: restored, the summary that retells the oath reaches the prompt, so the strike alone kept it out.
  await h.caller.chat.restoreMemory({ chatId: h.chatId, strikeId });
  expect(await forcedPrompt(h)).toContain(OATH_FACTS);
});

const WIDE_BLOCK = 3;

/** A three-message struck block: the member's line, the keeper's oath, the member's line. */
async function wideScene(o: OathWorld, member: Person): Promise<{ readonly ends: readonly MessageId[]; readonly strikeId: ChatMemoryStrikeId }> {
  const { h } = o.w;
  await h.caller.settings.updateAppSettings({ partial: { memoryDefaults: { blockSize: WIDE_BLOCK } } });
  await padToBlockStart(h, WIDE_BLOCK);
  const first = await commit(h, member, MEMBER_LINE);
  o.swearNext();
  await keeperTurn(h);
  const last = await commit(h, member, MEMBER_LINE);
  return { ends: [first, last], strikeId: await strikeOath(o) };
}

test("a member deleting both ends of a struck span leaves the struck turn between them out and the strike matched", async () => {
  const o = await oathWorld();
  await using w = o.w;
  const { h } = w;
  const member = await memberOf(h);
  const { ends, strikeId } = await wideScene(o, member);

  await h.root.services.chat.deleteMessages({ principal: member, chatId: h.chatId, messageIds: [...ends] });
  await redigest(w);
  expect(await forcedPrompt(h)).not.toContain(OATH_FACTS);
  expect(listedStrikes(await h.caller.chat.memoryView({ chatId: h.chatId }))).toEqual({
    carried: [[true, { strikeId, changedSinceStrike: true }]],
    unmatched: [],
  });
});

test("after the host reorders lines across a struck scene, a member deleting both its ends still leaves the struck turn out", async () => {
  const o = await oathWorld();
  await using w = o.w;
  const { h } = w;
  const member = await memberOf(h);
  const { ends, strikeId } = await wideScene(o, member);
  // A whole block of later lines moves in front of the scene, so each of its messages now sits a block further on.
  for (let moved = 0; moved < WIDE_BLOCK; moved += 1) {
    const canon = await readRoomCanon(h.root, h.owner, h.chatId);
    const sceneStart = present(canon.find((message) => message.id === ends[0])).seq;
    const later = present(canon.at(-1));
    await h.root.services.chat.moveMessage({ principal: h.owner, chatId: h.chatId, messageId: later.id, toSeq: sceneStart });
  }

  await h.root.services.chat.deleteMessages({ principal: member, chatId: h.chatId, messageIds: [...ends] });
  await redigest(w);
  expect(await forcedPrompt(h)).not.toContain(OATH_FACTS);
  expect(listedStrikes(await h.caller.chat.memoryView({ chatId: h.chatId }))).toEqual({
    carried: [[true, { strikeId, changedSinceStrike: true }]],
    unmatched: [],
  });
});

function chatArm(h: ChatRoot): NonNullable<ReturnType<ChatRoot["root"]["app"]["portability"]["find"]>> {
  return present(h.root.app.portability.find((entity) => entity.kind === "chat"));
}

async function exportRoom(h: ChatRoot): Promise<PortableFile> {
  const files: PortableFile[] = [];
  for await (const file of chatArm(h).exportAll(h.root.ownerId, failOnExportNote)) {
    if (file.filename.endsWith(CHAT_BUNDLE_EXT)) {
      files.push(file);
    }
  }
  expect(files).toHaveLength(1);
  return present(files[0]);
}

test("a backup taken after a member deleted a struck span's first message restores the strike, and the scene stays out", async () => {
  const source = await oathWorld();
  await using sourceWorld = source.w;
  const member = await memberOf(sourceWorld.h);
  await padToBlockStart(sourceWorld.h, BLOCK_SIZE);
  const own = await commit(sourceWorld.h, member, MEMBER_LINE);
  source.swearNext();
  await keeperTurn(sourceWorld.h);
  await strikeOath(source);
  await sourceWorld.h.root.services.chat.deleteMessages({ principal: member, chatId: sourceWorld.h.chatId, messageIds: [own] });
  const file = await exportRoom(sourceWorld.h);

  const target = await oathWorld();
  await using targetWorld = target.w;
  await targetWorld.h.root.services.chat.delete({ principal: targetWorld.h.owner, chatId: targetWorld.h.chatId });
  await expect(chatArm(targetWorld.h).importFile(targetWorld.h.root.ownerId, file)).resolves.toMatchObject({ ok: true, created: true });
  const restoredId = present((await targetWorld.h.caller.chat.listChats({ limit: 50 })).items[0]).id;
  const restored: ChatRoot = { ...targetWorld.h, chatId: restoredId };
  await keeperTurn(restored);
  await targetWorld.sweep({ kind: "memory-backfill", params: {} });

  // The restored room summarized the struck reply again, and the restored strike carries on that summary.
  const view = await targetWorld.h.caller.chat.memoryView({ chatId: restoredId });
  expect(listedStrikes(view)).toEqual({ carried: [[true, { strikeId: expect.any(String), changedSinceStrike: true }]], unmatched: [] });
  expect(await forcedPrompt(restored)).not.toContain(OATH_FACTS);
});
