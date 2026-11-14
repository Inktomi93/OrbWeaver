// @subject packages/server/src/domain/databank/verbs/gather-retrieval.ts

// D352: a document whose owner is not the host the turn runs under reaches the {{databank}} slot as literal text,
// name and chunks alike, while the host's own document keeps its macros. A member's global documents credit the
// room (membership widening), so both owners' chunks sit in one embedding space through their own sweeps.

import { neutralizeMacros } from "@orb/kit/macro";
import { present } from "@orb/testkit/iso";
import { expect, test } from "@orb/testkit/node";
import type { ChatRoot } from "@orb/testkit/node/composed";
import { seedCorpusConnections } from "@orb/testkit/node/composed";
import { attachRoomDocument, documentRoom, embedDocuments, ingest, sendTurn } from "../../chat/handoff-attachments-physical.ts";
import { invitePerson } from "../../chat/persona-cache-physical.ts";

const HOST_DOCUMENT = { name: "Host shelf {{char}}", text: "Host note: the keeper is {{char}}." } as const;
const MEMBER_MACRO = { name: "Member {{char}} shelf", text: "Member note: the keeper is {{char}}." } as const;
const MEMBER_NESTED = { name: "Member nested shelf", text: "Member nested note {{databank}} ends here." } as const;
const MESSAGE = "Tell me about the shelf.";

/** The host attaches their own macro document; a seated member credits `memberDocuments` as globals. */
async function bankedRoom(h: ChatRoot, memberDocuments: readonly { readonly name: string; readonly text: string }[]): Promise<void> {
  await attachRoomDocument(h, h.owner, HOST_DOCUMENT);
  const member = await invitePerson(h);
  await seedCorpusConnections(h.root, member);
  for (const document of memberDocuments) {
    const created = await h.root.services.databank.createFromText({ principal: member, name: document.name, text: document.text });
    await h.root.services.databank.attachGlobal({ principal: member, documentId: created.document.id });
    await ingest(h, created.document.id);
  }
  await embedDocuments(h, h.owner, [h.owner, member]);
}

function hostEvaluated(h: ChatRoot): readonly string[] {
  const keeper = present(h.characters[0]).name;
  return [`# Host shelf ${keeper}`, `Host note: the keeper is ${keeper}.`];
}

test("a member's macro document and a macro in its name reach the host's turn and its preview as literal text, while the host's own document evaluates", async () => {
  await using h = await documentRoom(["Only reply."]);
  await bankedRoom(h, [MEMBER_MACRO]);
  const keeper = present(h.characters[0]).name;
  const shown = [...hostEvaluated(h), `# ${neutralizeMacros(MEMBER_MACRO.name)}`, neutralizeMacros(MEMBER_MACRO.text)];
  const evaluatedForeign = [`Member ${keeper} shelf`, `Member note: the keeper is ${keeper}.`];

  const { wire } = await sendTurn(h, h.owner, MESSAGE);
  const { prompt } = await h.root.services.chat.previewAssembly({ principal: h.owner, chatId: h.chatId });
  const previewed = [prompt.static, prompt.dynamic, ...prompt.afterHistory.map((injection) => injection.content)].join("\n");
  for (const text of [wire, previewed]) {
    for (const each of shown) {
      expect(text).toContain(each);
    }
    for (const each of evaluatedForeign) {
      expect(text).not.toContain(each);
    }
  }
});

test("a member's document naming the {{databank}} slot reaches the host's turn as literal text and leaves the host's slot whole", async () => {
  await using h = await documentRoom(["Only reply."]);
  await bankedRoom(h, [MEMBER_NESTED]);
  const { wire } = await sendTurn(h, h.owner, MESSAGE);
  for (const each of [...hostEvaluated(h), neutralizeMacros(MEMBER_NESTED.text)]) {
    expect(wire).toContain(each);
  }
  expect(wire).not.toContain(MEMBER_NESTED.text);
});
