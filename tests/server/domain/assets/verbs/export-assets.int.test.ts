// The portability export ships exactly the blobs the one reference collector keeps for its owner, inline body
// references included, so a backup never carries a blob the scheduled sweep would reclaim.
// @subject packages/server/src/domain/assets/verbs/export-assets.ts
// @subject packages/server/src/domain/assets/persistence/portable-refs.ts

import type { PortableFile } from "@orb/contracts/portability";
import type { CharacterHandle } from "@orb/kit/ids";
import { castId, ID_PREFIX } from "@orb/kit/ids";
import { expect, test } from "@orb/testkit/node";
import { makeAssetBytes, seedChatInvite, seedCorpusConnections, seedInvitedChatParticipant } from "@orb/testkit/node/composed";
import type { GcBox, StoredRef } from "../gc-box.ts";
import { ageOnly, inlineImage, openBox, openRoom, runScheduledGc, say, store, survives } from "../gc-box.ts";

interface Witness {
  readonly ref: StoredRef;
  readonly bytes: Uint8Array;
}

async function witness(box: GcBox): Promise<Witness> {
  const bytes = makeAssetBytes(box.root.idSource.typeId(ID_PREFIX.asset));
  return { ref: await store(box, "attachment", bytes), bytes };
}

async function exportedBlobs(box: GcBox): Promise<PortableFile[]> {
  const descriptor = box.root.app.portability.find((entity) => entity.kind === "assets");
  if (descriptor === undefined) {
    throw new Error("the production graph omitted the assets descriptor");
  }
  const files: PortableFile[] = [];
  for await (const file of descriptor.exportAll(box.root.ownerId)) {
    files.push(file);
  }
  return files;
}

function carries(files: readonly PortableFile[], blob: Witness): boolean {
  return files.some((file) => Buffer.compare(file.bytes, blob.bytes) === 0);
}

test("a co-member's quote exports nothing the sweep would reclaim, while the owner's own inline image exports", async () => {
  const box = await openBox();
  const member = await box.root.principalFor((await box.root.actor()).id);
  await seedCorpusConnections(box.root, member);
  const room = await openRoom(box, castId<CharacterHandle>("export-shared-room"));
  const invite = await seedChatInvite(box.root, { principal: box.principal, chatId: room, input: { invitedHandle: member.handle } });
  await seedInvitedChatParticipant(box.root, { principal: member, inviteId: invite.id });
  const quoted = await witness(box);
  const owned = await witness(box);
  await say(box, room, { content: `Quoting the host. ${inlineImage(quoted.ref)}`, as: member });
  await say(box, room, { content: `My own picture. ${inlineImage(owned.ref)}` });

  const files = await exportedBlobs(box);

  expect({ quoted: carries(files, quoted), owned: carries(files, owned) }).toEqual({ quoted: false, owned: true });
  // The export's verdict is the sweep's: the quoted blob is garbage, the owner's inline image is live.
  await ageOnly(box, quoted.ref, owned.ref);
  expect((await runScheduledGc(box)).status).toBe("succeeded");
  expect({ quoted: await survives(box, quoted.ref), owned: await survives(box, owned.ref) }).toEqual({ quoted: false, owned: true });
});
