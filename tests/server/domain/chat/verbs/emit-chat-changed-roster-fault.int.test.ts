// @subject packages/server/src/domain/chat/verbs/emit-chat-changed.ts
import { databaseHandle } from "@orb/db/wiring-driver";

import { createIdSource, ID_PREFIX } from "@orb/kit/ids";
import { createEmitChatChanged } from "@orb/server/domain/chat";
import { getLog } from "@orb/server/foundation/observability";
import { expect, test } from "@orb/testkit/node";
import { freshDb } from "@orb/testkit/node/composed";
import { sql } from "drizzle-orm";
import { vi } from "vitest";

test("a failed roster read still reaches the pre-captured recipients and is reported to the operator", async ({ ids }) => {
  const source = createIdSource(ids.next);
  const chatId = source.typeId(ID_PREFIX.chat);
  const justKicked = source.userId();
  const db = await freshDb();
  await db.run(sql`ALTER TABLE chat_participants RENAME TO chat_participants_gone`);
  const publish = vi.fn<Parameters<typeof createEmitChatChanged>[1]>();
  using warn = vi.spyOn(getLog(), "warn");

  await createEmitChatChanged({ db: databaseHandle(db) }, publish)(chatId, { extraUserIds: [justKicked] });

  expect(publish).toHaveBeenCalledExactlyOnceWith(justKicked, undefined);
  expect(warn).toHaveBeenCalledWith(expect.objectContaining({ chatId }), expect.any(String));
});
