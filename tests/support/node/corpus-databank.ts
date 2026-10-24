// Native document envelopes and room projections stay separate from private canon and workload evidence.
import { createCharacterSchema } from "@orb/contracts/character";
import type { UserId } from "@orb/kit/ids";
import { seedCorpusConnections } from "./corpus-actors.ts";
import { seedCorpusAccount } from "./corpus-auth.ts";
import { settleCorpusWorkloads } from "./corpus-workloads.ts";
import type { CapturedDatabankViews, SeededCreatedDocument } from "./factories/databank.ts";
import { captureDatabankViews } from "./factories/databank.ts";
import { seedCreatedDocumentRows } from "./factories/rows/databank.ts";
import type { ServerTestHarness } from "./server.ts";

type Caller = Awaited<ReturnType<ServerTestHarness["internalCallerFor"]>>;
interface CorpusDatabank {
  readonly viewerUserId: UserId;
  readonly memberUserId: UserId;
  readonly character: Awaited<ReturnType<Caller["character"]["create"]>>;
  readonly room: Awaited<ReturnType<Caller["chat"]["startChat"]>>;
  readonly created: SeededCreatedDocument;
  readonly duplicate: SeededCreatedDocument;
  readonly hidden: SeededCreatedDocument;
  readonly memberGlobal: SeededCreatedDocument;
  readonly memberPrivate: SeededCreatedDocument;
  readonly renamed: Awaited<ReturnType<Caller["databank"]["rename"]>>;
  readonly reindex: Awaited<ReturnType<Caller["databank"]["reindex"]>>;
  readonly admitted: Awaited<ReturnType<Caller["workloads"]["list"]>>;
  readonly jobs: Awaited<ReturnType<Caller["workloads"]["list"]>>;
  readonly views: CapturedDatabankViews;
  readonly memberViews: CapturedDatabankViews;
  readonly nextPage: Awaited<ReturnType<Caller["databank"]["list"]>> | null;
  readonly handedRoom: Awaited<ReturnType<Caller["chat"]["getChat"]>>;
  readonly departedAttachments: Awaited<ReturnType<Caller["databank"]["listAttachments"]>>;
  readonly departedActive: Awaited<ReturnType<Caller["databank"]["listActiveForChat"]>>;
}

/** Author consent through real destinations and retain the native queued identity through executed reindexing. */
export async function seedCorpusDatabank(root: ServerTestHarness): Promise<CorpusDatabank> {
  const principal = await root.principalFor(root.ownerId);
  const member = await seedCorpusAccount(root);
  await seedCorpusConnections(root, principal);
  await seedCorpusConnections(root, member);
  const caller = await root.internalCallerFor(root.ownerId);
  const memberCaller = await root.internalCallerFor(member.userId);
  const character = await caller.character.create({
    input: createCharacterSchema.parse({ handle: "databank-output-seat", name: "Bank witness", description: "A keeper of consented documents." }),
  });
  const room = await caller.chat.startChat({ characterIds: [character.id], opening: "none" });
  const invite = await root.services.chat.createInvite({ principal, chatId: room.chat.id, input: { invitedHandle: member.handle } });
  await root.services.chat.acceptInvite({ principal: member, inviteId: invite.invite.id });
  const text = "The orbital ledger records café witnesses 🪐.";
  const created = await seedCreatedDocumentRows(root, {
    kind: "createFromText",
    userId: root.ownerId,
    params: { name: "Consented ledger", text, destination: { kind: "global" } },
  });
  const duplicate = await seedCreatedDocumentRows(root, {
    kind: "createFromText",
    userId: root.ownerId,
    params: { name: "Ignored duplicate name", text, destination: { kind: "character", characterId: character.id } },
  });
  await caller.databank.attachToChat({ documentId: created.row.id, chatId: room.chat.id });
  const hidden = await seedCreatedDocumentRows(root, {
    kind: "createFromText",
    userId: root.ownerId,
    params: { name: "Host-hidden ledger", text: "Only the host sees this source name.", destination: { kind: "chat", chatId: room.chat.id } },
  });
  const memberGlobal = await seedCreatedDocumentRows(root, {
    kind: "createFromText",
    userId: member.userId,
    params: { name: "Member consented source", text: "A present member explicitly shares this source.", destination: { kind: "global" } },
  });
  const memberPrivate = await seedCreatedDocumentRows(root, {
    kind: "createFromText",
    userId: member.userId,
    params: { name: "Member private source", text: "This unattached source grants no room consent." },
  });
  await caller.chat.setChatDocumentVisibility({ chatId: room.chat.id, visibility: { hidden: [hidden.row.id] } });
  const renamed = await caller.databank.rename({ id: created.row.id, name: "Renamed consented ledger" });
  const reindex = await caller.databank.reindex({ scope: { kind: "document", documentId: created.row.id } });
  const admitted = (await caller.workloads.list()).filter((job) => job.id === reindex.workloadId);
  if (admitted.length !== 1) {
    throw new Error("native databank reindex left no admitted workload identity");
  }
  const jobs = await settleCorpusWorkloads(root, caller, admitted);
  const views = await captureDatabankViews(root, principal, { documentId: created.row.id, chatId: room.chat.id });
  const memberViews = await captureDatabankViews(root, member, { documentId: memberGlobal.row.id, chatId: room.chat.id });
  const nextPage = views.page.nextCursor === null ? null : await caller.databank.list({ limit: 1, cursor: views.page.nextCursor });
  await root.services.chat.nominateHostHandoff({ principal, chatId: room.chat.id, userId: member.userId });
  await root.services.chat.acceptHostHandoff({ principal: member, chatId: room.chat.id });
  const handedRoom = await memberCaller.chat.getChat({ chatId: room.chat.id });
  await root.services.chat.selfLeave({ principal, chatId: room.chat.id });
  const departedAttachments = await caller.databank.listAttachments({ id: created.row.id });
  const departedActive = await memberCaller.databank.listActiveForChat({ chatId: room.chat.id });
  return {
    viewerUserId: root.ownerId,
    memberUserId: member.userId,
    character,
    room,
    created,
    duplicate,
    hidden,
    memberGlobal,
    memberPrivate,
    renamed,
    reindex,
    admitted,
    jobs,
    views,
    memberViews,
    nextPage,
    handedRoom,
    departedAttachments,
    departedActive,
  };
}
