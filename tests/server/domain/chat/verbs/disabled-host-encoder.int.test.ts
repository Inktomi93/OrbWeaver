// A member's read or edit in a disabled host's room embeds nothing on that host's encoder and runs none of that
// host's scripts, as in a departed host's room; re-enabling the host restores both.
// @subject packages/server/src/domain/chat/verbs/read.ts
// @subject packages/server/src/domain/chat/verbs/edit.ts

import type { Principal } from "@orb/contracts/identity";
import { createRegexScriptSchema } from "@orb/contracts/regex";
import { DomainNotFoundError } from "@orb/kit/errors";
import type { ChatId } from "@orb/kit/ids";
import { deriveRegexTierFlags } from "@orb/kit/regex";
import { UTC_TIME_ZONE } from "@orb/kit/time";
import { expect, test } from "@orb/testkit/node";
import type { ServerTestHarness } from "@orb/testkit/node/composed";
import {
  CORPUS_EMBED_MODEL,
  CORPUS_EMBEDDING_VECTOR,
  CORPUS_STRUCTURED_REPLIES,
  CORPUS_TEXT_MODEL,
  createCorpusProviderExecution,
  createServerHarness,
  readRoomCanon,
  seedCorpusActors,
  seedGlobalRegexScript,
  seedRecallRoom,
  seedRegexScript,
} from "@orb/testkit/node/composed";

const SWEEP_STEP_MS = 2000;

interface DisabledHostRoom extends AsyncDisposable {
  readonly root: ServerTestHarness;
  readonly host: Principal;
  readonly member: Principal;
  readonly chatId: ChatId;
  /** Every embedding request the provider has received. */
  readonly embeds: readonly Request[];
  readonly setHostEnabled: (enabled: boolean) => Promise<unknown>;
}

// The box owner is the admin and cannot be disabled, so the second account hosts and a third account plays. The
// host's room has a chat document indexed in the host's settled embedding space, so a retrieval gather embeds.
async function disabledHostRoom(): Promise<DisabledHostRoom> {
  const physical = createCorpusProviderExecution({
    modelIds: [CORPUS_EMBED_MODEL, CORPUS_TEXT_MODEL],
    embedding: CORPUS_EMBEDDING_VECTOR,
    chatText: "A completed corpus response.",
    structuredReplies: CORPUS_STRUCTURED_REPLIES,
    images: [],
  });
  const embeds: Request[] = [];
  await using construction = new AsyncDisposableStack();
  const root = construction.use(
    await createServerHarness({
      providerFetch: async (input, init) => {
        const request = new Request(input, init);
        if (new URL(request.url).pathname.endsWith("/embeddings")) {
          embeds.push(request);
        }
        return await physical.execute(request);
      },
    }),
  );
  const { owner: admin, secondUserId } = await seedCorpusActors(root);
  const adminCaller = await root.internalCallerFor(admin.userId);
  const host = await root.principalFor(secondUserId);
  const hostCaller = await root.internalCallerFor(host.userId);
  const member = await root.principalFor((await root.actor()).id);
  const chatId = await seedRecallRoom(hostCaller);
  const invite = await root.services.chat.createInvite({ principal: host, chatId, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const lore = await root.services.databank.createFromText({ principal: host, name: "room-lore.txt", text: "The ledger room keeps its lamps lit." });
  await root.services.databank.attachToChat({ principal: host, chatId, documentId: lore.document.id });
  const ingested = await root.app.databankIngest.ingestDocument({ documentId: lore.document.id, signal: new AbortController().signal });
  expect(ingested.chunksUpserted).toBeGreaterThan(0);
  // The host's space settles through its own sweeps; the memory sweep refuses an owner with Memory off.
  await adminCaller.settings.updateAppSettings({ partial: { memoryDefaults: { mode: "mixB", blockSize: 2, verbatimWindow: 0, maxTier: 0 } } });
  await hostCaller.settings.updateUserSettingsSection({ section: "memory", patch: { enabled: true } });
  await hostCaller.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: "The keeper asks about the lamps." });
  await hostCaller.chat.commitMessage({ chatId, timeZone: UTC_TIME_ZONE, content: "The lamps burn through the night." });
  await root.settleBackground();
  const sweeps = [
    await hostCaller.workloads.start({ input: { kind: "index", params: { source: "text" } }, mode: "singular" }),
    await hostCaller.workloads.start({ input: { kind: "memory-backfill", params: {} }, mode: "singular" }),
    await hostCaller.workloads.start({ input: { kind: "databank-reindex", params: { scope: { kind: "owner" }, mode: "chunk-embed" } }, mode: "singular" }),
  ];
  // The box owner's job list holds every account's sweep.
  await expect
    .poll(async () => {
      root.timers.advance(SWEEP_STEP_MS);
      const jobs = (await adminCaller.workloads.list()).filter((job) => sweeps.some((sweep) => sweep.id === job.id));
      expect(jobs.filter((job) => job.status === "failed" || job.status === "cancelled")).toEqual([]);
      return jobs.length === sweeps.length && jobs.every((job) => job.status === "succeeded");
    })
    .toBe(true);
  const lifetime = construction.move();
  return {
    root,
    host,
    member,
    chatId,
    embeds,
    setHostEnabled: (enabled) => root.services.admin.setEnabled({ principal: admin, userId: host.userId, enabled }),
    [Symbol.asyncDispose]: () => lifetime.disposeAsync(),
  };
}

test("a member's context-fit read spends nothing on a disabled host's encoder, and reads again once re-enabled", async () => {
  await using room = await disabledHostRoom();
  const { root, member, chatId, embeds } = room;
  const readFit = (): ReturnType<typeof root.services.chat.previewContextFit> => root.services.chat.previewContextFit({ principal: member, chatId });

  const beforeRead = embeds.length;
  expect(await readFit()).toMatchObject({ ceilingTokens: expect.any(Number) });
  expect(embeds.length).toBeGreaterThan(beforeRead);

  await room.setHostEnabled(false);
  const beforeRefusal = embeds.length;
  await expect(readFit()).rejects.toBeInstanceOf(DomainNotFoundError);
  expect(embeds).toHaveLength(beforeRefusal);

  await room.setHostEnabled(true);
  const beforeResume = embeds.length;
  expect(await readFit()).toMatchObject({ ceilingTokens: expect.any(Number) });
  expect(embeds.length).toBeGreaterThan(beforeResume);
});

test("a member's edit runs none of a disabled host's scripts and embeds nothing, and both return once re-enabled", async () => {
  await using room = await disabledHostRoom();
  const { root, host, member, chatId, embeds } = room;
  const placement = ["USER_INPUT"] as const;
  const script = await seedRegexScript(root, {
    principal: host,
    input: createRegexScriptSchema.parse({
      name: "lamp to lantern",
      findRegex: "lamp",
      replaceString: "lantern",
      placement,
      runOnEdit: true,
      ...deriveRegexTierFlags(placement),
    }),
  });
  await seedGlobalRegexScript(root, { principal: host, scriptId: script.id });
  await root.services.chat.commitMessage({ principal: member, chatId, content: "I carry a torch." });
  const line = (await readRoomCanon(root, member, chatId)).findLast((message) => message.authorUserId === member.userId);
  if (line === undefined) {
    throw new Error("the member's committed line is not in the room's canon");
  }
  const edit = async (content: string): Promise<string> =>
    (await root.services.chat.editMessage({ principal: member, chatId, messageId: line.id, content, timeZone: UTC_TIME_ZONE })).content;

  const beforeEdit = embeds.length;
  expect(await edit("I carry a lamp.")).toBe("I carry a lantern.");
  expect(embeds.length).toBeGreaterThan(beforeEdit);

  await room.setHostEnabled(false);
  const beforeDisabledEdit = embeds.length;
  expect(await edit("I carry a lamp still.")).toBe("I carry a lamp still.");
  expect(embeds).toHaveLength(beforeDisabledEdit);

  await room.setHostEnabled(true);
  const beforeResume = embeds.length;
  expect(await edit("I carry a lamp again.")).toBe("I carry a lantern again.");
  expect(embeds.length).toBeGreaterThan(beforeResume);
});
