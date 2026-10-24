// @subject packages/server/src/domain/chat/verbs/emit-chat-changed.ts
import { chatParticipants } from "@orb/db";
import { databaseHandle } from "@orb/db/wiring-driver";

import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createEmitChatChanged } from "@orb/server/domain/chat";
import { expect, test } from "@orb/testkit/node";
import { freshDb, processObservability, withheldTable } from "@orb/testkit/node/composed";
import { vi } from "vitest";

test("a failed roster read still reaches the pre-captured recipients and is reported to the operator", async ({ ids }) => {
  const source = createIdSource(ids.next);
  const chatId = source.typeId(ID_PREFIX.chat);
  const justKicked = source.userId();
  const db = await freshDb();
  await using _withheld = await withheldTable(db, chatParticipants);
  const publish = vi.fn<Parameters<typeof createEmitChatChanged>[1]>();
  using warn = vi.spyOn(processObservability.logger(), "warn");

  await createEmitChatChanged({ db: databaseHandle(db) }, publish)(chatId, { extraUserIds: [justKicked] });

  expect(publish).toHaveBeenCalledExactlyOnceWith(justKicked, undefined);
  expect(warn).toHaveBeenCalledWith(expect.objectContaining({ chatId }), expect.any(String));
});
