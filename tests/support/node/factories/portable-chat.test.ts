// @subject tests/support/node/factories/portable-chat.ts
import { buildChatBundleFile, parseChatBundleFile } from "@orb/server/primitives/serde/chat-bundle";
import { expect, test } from "../fixtures.ts";
import { makePortableChat, makePortableGame, makePortableMessage, makePortableTurnSnapshot } from "./portable-chat.ts";

test("the default room and a populated room both build through the production serde and read back unchanged", () => {
  for (const chat of [
    makePortableChat(),
    makePortableChat({
      characterHandles: ["hero"],
      messages: [makePortableMessage("user", "Do we cross?"), makePortableMessage("assistant", "The bridge groans.", { speakerHandle: "hero" })],
      rpg: makePortableGame({ snapshots: [makePortableTurnSnapshot(1, 0, "the bridge")] }),
    }),
  ]) {
    const parsed = parseChatBundleFile(buildChatBundleFile(chat));
    expect(parsed.ok && parsed.value).toEqual(chat);
  }
});
